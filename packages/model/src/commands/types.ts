import type { Draft } from 'immer';
import type { TranslatedUnit } from '../translation';
import type {
  Draw,
  PlayerSettings,
  RichText,
  Result,
  Animations,
  Question,
  AssetHash,
  AssetMeta,
  CuePoint,
  Frame,
  GroupObject,
  Layer,
  ObjectState,
  Project,
  PublishSettings,
  Scene,
  SceneObject,
  Slide,
  SlideLayout,
  SlideMaster,
  Timing,
  Tracking,
  Trigger,
  Variable,
} from '../schema';

/**
 * Thrown when a command cannot be applied: an id that does not exist, an index
 * out of range, a payload that would make the project invalid. The project is
 * left exactly as it was. The message is for developers, not end users.
 */
export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

/**
 * Fields `object.update` can change. `frame`, `timing`, `a11y` and `props`
 * merge into the existing value one level deep; everything else (`animations`
 * included) replaces.
 */
export interface ObjectChanges {
  locked?: boolean;
  hiddenInEditor?: boolean;
  buttonSet?: string | null;
  /** Must be one of the object's states. */
  initialState?: string;
  /** Groups only: make it a scrolling panel, or an ordinary group (P9.5). */
  scroll?: { height: number } | null;
  /** Top-level objects only: the learner may drag it (P9.7), or null. */
  drag?: { returnToStart: boolean } | null;
  frame?: Partial<Frame>;
  timing?: Partial<Timing>;
  a11y?: Partial<SceneObject['a11y']>;
  /** Keys of the object's own `props`; checked against that object type's schema. */
  props?: Record<string, unknown>;
  /**
   * Replaces the object's animations. Triggers that run a motion path it no
   * longer has, or wait for an animation it no longer has, are removed.
   */
  animations?: Animations;
}

/**
 * Every command and its payload. Payloads identify things by id. An `index` is
 * the position the item should end up at; omitted means "at the end" (for
 * objects, the top of the z-order).
 *
 * Objects, slides and scenes passed in become part of the project and are
 * frozen with it — build a fresh one for each command.
 */
export interface CommandMap {
  'project.rename': { title: string };
  /**
   * Sets the stage size. `mode` controls existing content: `keep` leaves object
   * frames unchanged (content may be cropped or leave margins), `scale` scales
   * and repositions every object frame to the new stage proportions. Omitted
   * means `keep`, preserving the original behaviour.
   */
  'project.setStageSize': {
    width: number;
    height: number;
    mode?: 'keep' | 'scale';
  };
  /** How the course reports to an LMS; parts left out stay as they are. */
  'project.setTracking': { tracking: Partial<Tracking> };
  /** The player frame (P8.1); parts left out stay as they are. */
  'project.setPlayer': { player: Partial<PlayerSettings> };
  /** Translated words put in, and `language` made the course's (docs/briefs/P10.3-translation.md). */
  'project.translate': { units: TranslatedUnit[]; language: string };
  /** How the course is published; parts left out stay as they are. */
  'project.setPublishSettings': { settings: Partial<PublishSettings> };
  /** Updates project theme colours and/or fonts. Values are merged into the theme. */
  'project.updateTheme': {
    colors?: Partial<Project['theme']['colors']>;
    fonts?: Partial<Project['theme']['fonts']>;
  };

  /** Record an imported file so objects can refer to it. Registering the same hash again changes nothing. */
  'asset.add': { hash: AssetHash; meta: AssetMeta };

  'scene.add': { scene: Scene; index?: number };
  /** A question bank (P7.6), shaped like a scene; its slides must be question slides. */
  'bank.add': { bank: Scene; index?: number };
  /** Draws from it draw nothing afterwards (`bank: null`). */
  'bank.remove': { bankId: string };
  'bank.rename': { bankId: string; title: string };
  /** Make the slide a result slide, change its result, or (null) stop it being one (P7.7). */
  'slide.setResult': { slideId: string; result: Result | null };
  /** Make the slide a draw slide, change its draw, or (null) stop it being one (P7.6). */
  'slide.setDraw': { slideId: string; draw: Draw | null };
  /** Also removes triggers elsewhere that jump to the scene's slides. The last scene cannot be removed. */
  'scene.remove': { sceneId: string };
  'scene.rename': { sceneId: string; title: string };
  'scene.move': { sceneId: string; index: number };

  'slide.add': { sceneId: string; slide: Slide; index?: number };
  /**
   * Slides from another project (P11.2), with the banks, masters, variables
   * and media details they need (`prepareSlideImport`), as one step.
   */
  'slides.import': {
    sceneId: string;
    index?: number;
    slides: Slide[];
    banks: Scene[];
    masters: SlideMaster[];
    variables: Variable[];
    assets: Record<AssetHash, AssetMeta>;
  };
  /** Also removes triggers on other slides that jump to this one. */
  'slide.remove': { slideId: string };
  'slide.rename': { slideId: string; title: string };
  /** Make the slide a question, change its question, or (null) make it an ordinary slide again. */
  'slide.setQuestion': { slideId: string; question: Question | null };
  /** The slide's notes (P8.2), shown in the player's Notes tab. */
  'slide.setNotes': { slideId: string; notes: RichText };
  /** Advance, revisit behaviour and the player buttons it shows; parts left out stay as they are. */
  'slide.setProperties': {
    slideId: string;
    properties: Partial<Omit<Slide['properties'], 'controls'>> & {
      controls?: Partial<Slide['properties']['controls']>;
    };
  };
  /** Moves within a scene or to another scene. */
  'slide.move': { slideId: string; sceneId: string; index: number };

  'master.add': { master: SlideMaster; index?: number };
  /** Slides that used any of its layouts become blank. */
  'master.remove': { masterId: string };
  'master.rename': { masterId: string; name: string };
  'layout.add': { masterId: string; layout: SlideLayout; index?: number };
  /** Slides using the layout become blank. */
  'layout.remove': { layoutId: string };
  'layout.rename': { layoutId: string; name: string };
  /**
   * Gives a slide a layout (or none). `objects` are new placeholder copies to
   * add to the slide's base layer, built by the caller with fresh ids.
   */
  'slide.setLayout': { slideId: string; layoutId: string | null; objects?: SceneObject[] };

  /** Refused if it refers to objects, layers or cue points that are not on the slide. */
  'trigger.add': { slideId: string; trigger: Trigger; index?: number };
  /** Replace any of the trigger's parts; the same reference rule applies. */
  'trigger.update': { triggerId: string; changes: Partial<Omit<Trigger, 'id'>> };
  'trigger.remove': { triggerId: string };
  /** Move within its slide's list: the order triggers with the same owner run in. */
  'trigger.move': { triggerId: string; index: number };

  'variable.add': { variable: Variable; index?: number };
  /** Renaming also rewrites every `%Name%` reference in text. Type and default must still agree. */
  'variable.update': {
    variableId: string;
    changes: { name?: string; type?: Variable['type']; default?: Variable['default'] };
  };
  /** Also removes triggers that read or set it. `%Name%` left in text then shows as written. */
  'variable.remove': { variableId: string };

  /** Adds an overlay layer; `triggers` (for a duplicate) are added to the slide with it. */
  'layer.add': { slideId: string; layer: Layer; index?: number; triggers?: Trigger[] };
  /** Overlay layers only. Also removes the triggers that belong to it or refer to it or its objects. */
  'layer.remove': { layerId: string };
  'layer.rename': { layerId: string; name: string };
  /** Overlay layers only: position among the slide's overlays, bottom to top. */
  'layer.move': { layerId: string; index: number };
  'layer.setProperties': { layerId: string; properties: Partial<Layer['properties']> };

  /** Seconds. Cue points beyond the new end move back to it. */
  'layer.setDuration': { layerId: string; duration: number };
  'cuePoint.add': { layerId: string; cuePoint: CuePoint };
  'cuePoint.update': { cuePointId: string; changes: { name?: string; time?: number } };
  /** Also removes triggers on the slide that listen for the cue point. */
  'cuePoint.remove': { cuePointId: string };

  'object.add': { layerId: string; object: SceneObject; index?: number };
  /** Also removes triggers on the slide that refer to the removed objects. */
  'object.remove': { objectIds: string[] };
  /**
   * With `stateId` (other than `normal`), the parts of the change a state can
   * hold are written to that state's overrides instead of the object: frame,
   * `props.appearance`, `props.text` and `props.asset`. Everything else in the
   * change applies to the object as usual.
   */
  'object.update': { objectId: string; changes: ObjectChanges; stateId?: string };
  'state.add': { objectId: string; state: ObjectState; index?: number };
  /** `normal` cannot be removed. Also removes triggers on the slide that used the state. */
  'state.remove': { objectId: string; stateId: string };
  /** Rename a state or replace its overrides (`{}` resets it to look like normal). */
  'state.update': {
    objectId: string;
    stateId: string;
    changes: { name?: string; overrides?: ObjectState['overrides'] };
  };
  /** Changes z-order within the object's layer or group. */
  'object.reorder': { objectId: string; index: number };
  'object.rename': { objectId: string; name: string };
  /**
   * Gather sibling objects into a group. `group` is a new, empty group (from
   * `createGroupObject([])`); the objects move into it in their z-order and it
   * takes the place of the topmost of them. Its frame becomes the box around them.
   */
  'object.group': { objectIds: string[]; group: GroupObject };
  /**
   * Dissolve a group, leaving its children where it was in the z-order. Also
   * removes triggers that refer to the group itself, which no longer exists.
   */
  'object.ungroup': { groupId: string };
}

export type CommandName = keyof CommandMap;

/** Applies one command by mutating an Immer draft. Throws CommandError to reject it. */
export type CommandHandler<K extends CommandName> = (
  draft: Draft<Project>,
  payload: CommandMap[K],
) => void;

export type CommandHandlers = { [K in CommandName]: CommandHandler<K> };
