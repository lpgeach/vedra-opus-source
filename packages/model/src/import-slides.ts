/**
 * Slides from another project (docs/briefs/P11.2-templates.md, part B): copies
 * with new ids, and what they need to stay whole in this project. Pure: the
 * caller copies the media files and runs the `slides.import` command.
 */
import { cloneSlides, renewObjectIds } from './clone';
import { idsInProject, triggerReferences } from './find';
import { createId } from './ids';
import { branchTargets, withoutBranchesTo } from './questions';
import type { AssetMeta, Project, Scene, Slide, SlideMaster, Variable } from './schema';
import { forEachObject, slideLayers } from './traverse';
import { isBuiltInVariableName, replaceVariableReferences, VARIABLE_REFERENCE } from './variables';

export interface SlideImport {
  /** The copies, in the source's order, for the chosen scene. */
  slides: Slide[];
  /** Question banks the copies' draw slides draw from, as new banks. */
  banks: Scene[];
  /** Masters the copies' layouts belong to that this project lacks. */
  masters: SlideMaster[];
  /** Variables the copies use that this project lacks (renamed on a clash). */
  variables: Variable[];
  /** The media the copies use, by hash: the caller copies these files in. */
  assets: Record<string, AssetMeta>;
  /** What was left behind, for the author. */
  dropped: string[];
}

/** Every string inside `value` replaced through `change`. */
function mapStrings<T>(value: T, change: (text: string) => string): T {
  const walk = (item: unknown): unknown => {
    if (typeof item === 'string') return change(item);
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, walk(v)]));
    }
    return item;
  };
  return walk(value) as T;
}

/** Every string inside `value`, in order. */
function strings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, into);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) strings(v, into);
  return into;
}

/** Each `id` in `before` against the `id` at the same place in `after`. */
function pairIds(before: unknown, after: unknown, into: Map<string, string>): void {
  if (Array.isArray(before) && Array.isArray(after)) {
    before.forEach((item, index) => pairIds(item, after[index], into));
  } else if (before && after && typeof before === 'object' && typeof after === 'object') {
    const a = before as Record<string, unknown>;
    const b = after as Record<string, unknown>;
    if (typeof a['id'] === 'string' && typeof b['id'] === 'string' && a['id'] !== b['id']) {
      into.set(a['id'], b['id']);
    }
    for (const key of Object.keys(a)) if (key !== 'id') pairIds(a[key], b[key], into);
  }
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A master with new ids throughout: its own, its layouts', their layers' and objects'. */
function renewMaster(master: SlideMaster, ids: Map<string, string>): SlideMaster {
  const copy = JSON.parse(JSON.stringify(master)) as SlideMaster;
  const fresh = (old: string, prefix: Parameters<typeof createId>[0]) => {
    const id = createId(prefix);
    ids.set(old, id);
    return id;
  };
  copy.id = fresh(copy.id, 'master');
  copy.layer.id = fresh(copy.layer.id, 'layer');
  renewObjectIds(copy.layer.objects, ids);
  for (const layout of copy.layouts) {
    layout.id = fresh(layout.id, 'layout');
    layout.layer.id = fresh(layout.layer.id, 'layer');
    renewObjectIds(layout.layer.objects, ids);
  }
  return copy;
}

/**
 * Copies of `slideIds` (slides of `source`'s scenes) ready to go into
 * `target`: new ids; their masters, banks, variables and media; and every
 * reference to something that did not come taken away, as deleting it would.
 */
export function prepareSlideImport(
  target: Project,
  source: Project,
  slideIds: readonly string[],
): SlideImport {
  const wanted = new Set(slideIds);
  const chosen = source.scenes.flatMap((scene) => scene.slides.filter((s) => wanted.has(s.id)));
  const dropped: string[] = [];
  const ids = new Map<string, string>();

  // Banks the chosen draw slides draw from come too, as new banks.
  const bankIds = new Set(chosen.flatMap((slide) => (slide.draw?.bank ? [slide.draw.bank] : [])));
  const sourceBanks = source.banks.filter((bank) => bankIds.has(bank.id));
  const bankSlides = sourceBanks.flatMap((bank) => bank.slides);

  // New ids for the slides and bank slides together, so references between them follow.
  const originals = [...chosen, ...bankSlides];
  const renewed = cloneSlides(originals);
  // Every old id against its new one, found by walking each original beside its copy. Then
  // everything inside the copies that names an old id (a result's layers and questions, a
  // draw's locked questions, the Tab order) names the new one.
  originals.forEach((slide, index) => pairIds(slide, renewed[index], ids));
  const cloned = renewed.map((slide) => mapStrings(slide, (text) => ids.get(text) ?? text));
  const slides = cloned.slice(0, chosen.length);
  const banks: Scene[] = sourceBanks.map((bank) => {
    const id = createId('scene');
    ids.set(bank.id, id);
    return {
      id,
      title: bank.title,
      slides: bank.slides.map((slide) => cloned[chosen.length + bankSlides.indexOf(slide)]!),
    };
  });
  for (const slide of [...slides, ...banks.flatMap((bank) => bank.slides)]) {
    if (slide.draw) {
      slide.draw = {
        ...slide.draw,
        bank: slide.draw.bank ? (ids.get(slide.draw.bank) ?? null) : null,
      };
    }
  }

  // Masters: one already here unchanged is used; one changed here, or absent, is added.
  const targetMasters = new Map(target.masters.map((master) => [master.id, master]));
  const masters: SlideMaster[] = [];
  const layoutIds = new Map<string, string>();
  const usedLayouts = new Set(slides.flatMap((slide) => (slide.layoutId ? [slide.layoutId] : [])));
  for (const master of source.masters) {
    if (!master.layouts.some((layout) => usedLayouts.has(layout.id))) continue;
    const here = targetMasters.get(master.id);
    if (here && sameJson(here, master)) continue;
    if (master.kind === 'feedback') {
      // A project has one feedback master: its layout of the same role stands in.
      const feedback = target.masters.find((each) => each.kind === 'feedback');
      for (const layout of master.layouts) {
        const match = feedback?.layouts.find((each) => each.role === layout.role);
        if (match) layoutIds.set(layout.id, match.id);
      }
      continue;
    }
    const taken = idsInProject(target);
    const clash =
      here || [master.id, ...master.layouts.map((layout) => layout.id)].some((id) => taken.has(id));
    const copy = clash
      ? renewMaster(master, layoutIds)
      : (JSON.parse(JSON.stringify(master)) as SlideMaster);
    masters.push(copy);
  }
  const knownLayouts = new Set([
    ...target.masters.flatMap((master) => master.layouts.map((layout) => layout.id)),
    ...masters.flatMap((master) => master.layouts.map((layout) => layout.id)),
  ]);
  for (const slide of slides) {
    if (!slide.layoutId) continue;
    const layoutId = layoutIds.get(slide.layoutId) ?? slide.layoutId;
    slide.layoutId = knownLayouts.has(layoutId) ? layoutId : null;
  }

  // Variables: by name where the type matches; otherwise added, renamed on a clash.
  const byId = new Map(source.variables.map((variable) => [variable.id, variable]));
  const byName = new Map(
    source.variables.map((variable) => [variable.name.toLowerCase(), variable]),
  );
  const copiesText = strings([slides, banks]);
  const usedVariables = new Set<Variable>();
  for (const text of copiesText) {
    const byIdUse = byId.get(text);
    if (byIdUse) usedVariables.add(byIdUse);
    for (const match of text.matchAll(VARIABLE_REFERENCE)) {
      const named = byName.get(match[1]!.toLowerCase());
      if (named) usedVariables.add(named);
    }
  }
  const variables: Variable[] = [];
  const variableIds = new Map<string, string>();
  const renamed = new Map<string, string>();
  const takenNames = new Set(target.variables.map((variable) => variable.name.toLowerCase()));
  const takenIds = idsInProject(target);
  for (const variable of source.variables.filter((each) => usedVariables.has(each))) {
    const same = target.variables.find(
      (each) => each.name.toLowerCase() === variable.name.toLowerCase(),
    );
    if (same && same.type === variable.type) {
      variableIds.set(variable.id, same.id);
      continue;
    }
    let name = variable.name;
    for (let n = 2; takenNames.has(name.toLowerCase()) || isBuiltInVariableName(name); n++) {
      name = `${variable.name}${n}`;
    }
    takenNames.add(name.toLowerCase());
    if (name !== variable.name) renamed.set(variable.name.toLowerCase(), name);
    const id = takenIds.has(variable.id) ? createId('var') : variable.id;
    variableIds.set(variable.id, id);
    variables.push({ ...variable, id, name });
  }
  const renameText = (text: string) =>
    variableIds.get(text) ??
    replaceVariableReferences(text, (name) => {
      const to = renamed.get(name.toLowerCase());
      return to === undefined ? undefined : `%${to}%`;
    });
  const finalSlides = mapStrings(slides, renameText);
  const finalBanks = mapStrings(banks, renameText);

  // What may be referred to now: this project, the copies, and what comes with them.
  const valid = idsInProject(target);
  const probe: Project = {
    ...target,
    scenes: [{ id: 'import', title: '', slides: finalSlides }],
    banks: finalBanks,
    masters,
    variables,
  };
  for (const id of idsInProject(probe)) valid.add(id);
  for (const variable of [...target.variables, ...variables]) valid.add(variable.id);
  for (const tab of target.player.tabs.custom) valid.add(tab.id);

  for (const slide of [...finalSlides, ...finalBanks.flatMap((bank) => bank.slides)]) {
    const kept = slide.triggers.filter((trigger) =>
      [...triggerReferences(trigger)].every((id) => valid.has(id)),
    );
    if (kept.length < slide.triggers.length) {
      dropped.push(
        `“${slide.title}”: ${slide.triggers.length - kept.length === 1 ? 'a trigger' : `${slide.triggers.length - kept.length} triggers`} that pointed at something that did not come`,
      );
    }
    slide.triggers = kept;
    if (slide.question) {
      const gone = new Set(branchTargets(slide.question).filter((id) => !valid.has(id)));
      if (gone.size > 0) slide.question = withoutBranchesTo(slide.question, gone);
    }
    if (slide.result?.include.kind === 'chosen') {
      slide.result.include.slides = slide.result.include.slides.filter((id) => valid.has(id));
    }
    // A field or slider bound to a variable that did not come is left unbound.
    for (const { layer } of slideLayers(slide)) {
      forEachObject(layer.objects, (object) => {
        if (!('props' in object)) return;
        const props = object.props as { variable?: unknown };
        if (typeof props.variable === 'string' && !valid.has(props.variable)) props.variable = null;
      });
    }
  }

  // Media: any of the source's media the copies or their masters name.
  const assets: Record<string, AssetMeta> = {};
  for (const text of strings([finalSlides, finalBanks, masters])) {
    const meta = source.assets[text];
    if (meta) assets[text] = meta;
  }
  return { slides: finalSlides, banks: finalBanks, masters, variables, assets, dropped };
}
