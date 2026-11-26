import { allSlides } from '@vedraopus/model';
import type { Draw, Project } from '@vedraopus/model';
import { shuffled } from './quiz';

/**
 * Drawing questions from banks (docs/briefs/P7.6-banks-and-draws.md). Pure:
 * the engine calls it once, as the session starts.
 */

/**
 * The questions one draw takes from its bank's slides (`bank`, in bank
 * order), leaving out those already `taken` this session: the locked ones,
 * then enough of the rest to make `count`; in bank order, or picked at
 * random and the whole draw shuffled.
 */
export function drawQuestions(
  draw: Draw,
  bank: readonly string[],
  taken: ReadonlySet<string>,
  random: () => number,
): string[] {
  const available = bank.filter((id) => !taken.has(id));
  const locked = available.filter((id) => draw.locked.includes(id));
  const rest = available.filter((id) => !draw.locked.includes(id));
  const room = Math.max(0, draw.count - locked.length);
  if (draw.order === 'inOrder') {
    const chosen = new Set([...locked, ...rest.slice(0, room)]);
    return available.filter((id) => chosen.has(id));
  }
  const extra = shuffled(rest.length, random)
    .slice(0, room)
    .map((index) => rest[index]!);
  const all = [...locked, ...extra];
  return shuffled(all.length, random).map((index) => all[index]!);
}

/**
 * Every draw of the course, by draw slide id, in course order: a saved draw
 * kept (without slides no longer in its bank, or drawn already), unless it has
 * lost them all, when it is drawn again.
 */
export function drawAll(
  project: Project,
  saved: Readonly<Record<string, readonly string[]>> | undefined,
  random: () => number,
): Map<string, string[]> {
  const banks = new Map(
    project.banks.map((bank) => [bank.id, bank.slides.map((slide) => slide.id)]),
  );
  const taken = new Set<string>();
  const draws = new Map<string, string[]>();
  for (const { slide } of allSlides(project)) {
    if (!slide.draw) continue;
    const bank = slide.draw.bank === null ? [] : (banks.get(slide.draw.bank) ?? []);
    const kept = (saved?.[slide.id] ?? []).filter((id) => bank.includes(id) && !taken.has(id));
    const drawn = kept.length > 0 ? kept : drawQuestions(slide.draw, bank, taken, random);
    for (const id of drawn) taken.add(id);
    draws.set(slide.id, drawn);
  }
  return draws;
}
