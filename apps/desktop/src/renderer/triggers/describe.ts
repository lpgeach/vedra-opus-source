import { BUILT_IN_STATE_NAMES } from '@vedraopus/model';
import type {
  Condition,
  Operand,
  Project,
  SceneObject,
  Slide,
  Trigger,
  TriggerAction,
  TriggerEvent,
} from '@vedraopus/model';

/** Names for the things a trigger can refer to on one slide. */
export interface Names {
  object(id: string): string;
  state(objectId: string, stateId: string): string;
  layer(id: string): string;
  cuePoint(id: string): string;
  slide(id: string): string;
  variable(id: string): string;
  /** One of the player's custom tabs (P8.2). */
  tab(id: string): string;
  /** A file or picture of the course, by its hash (P8.6). */
  file(hash: string): string;
  /** An object's motion path by its id. */
  path(objectId: string, pathId: string): string;
  /** A 360° image's spot by its id (P9.10). */
  spot(objectId: string, spotId: string): string;
}

export function namesFor(project: Project, slide: Slide): Names {
  const objects = new Map<string, SceneObject>();
  const layers = [slide.baseLayer, ...slide.layers];
  for (const layer of layers) for (const object of layer.objects) objects.set(object.id, object);
  const slides = project.scenes.flatMap((scene) => scene.slides);
  return {
    object: (id) => objects.get(id)?.name ?? 'a missing object',
    state: (objectId, stateId) =>
      objects.get(objectId)?.states.find((state) => state.id === stateId)?.name ??
      BUILT_IN_STATE_NAMES[stateId] ??
      stateId,
    layer: (id) => {
      const layer = layers.find((each) => each.id === id);
      return layer
        ? layer === slide.baseLayer
          ? 'the slide'
          : `layer ${layer.name}`
        : 'a missing layer';
    },
    cuePoint: (id) =>
      layers.flatMap((layer) => layer.timeline.cuePoints).find((cue) => cue.id === id)?.name ??
      'a missing cue point',
    slide: (id) => slides.find((each) => each.id === id)?.title || 'an untitled slide',
    variable: (id) =>
      project.variables.find((each) => each.id === id)?.name ?? 'a missing variable',
    file: (hash) => project.assets[hash]?.fileName ?? 'a missing file',
    tab: (id) =>
      project.player.tabs.custom.find((each) => each.id === id)?.label ?? 'a missing tab',
    path: (objectId, pathId) =>
      objects.get(objectId)?.animations.motionPaths.find((each) => each.id === pathId)?.name ??
      'a missing path',
    spot: (objectId, spotId) => {
      const panorama = objects.get(objectId);
      const spot =
        panorama?.type === 'panorama'
          ? panorama.props.spots.find((each) => each.id === spotId)
          : undefined;
      return spot ? quote(spot.name) : 'a missing spot';
    },
  };
}

const quote = (text: string) => `“${text}”`;

export function describeOperand(operand: Operand, names: Names): string {
  if (operand.kind === 'variable') return names.variable(operand.variable);
  return typeof operand.value === 'string' ? quote(operand.value) : String(operand.value);
}

export function describeAction(action: TriggerAction, names: Names): string {
  switch (action.type) {
    case 'changeState':
      return `Change ${names.object(action.object)} to ${names.state(action.object, action.state)}`;
    case 'showLayer':
      return `Show ${names.layer(action.layer)}`;
    case 'hideLayer':
      return `Hide ${names.layer(action.layer)}`;
    case 'jumpToSlide':
      return action.target.kind === 'slide'
        ? `Jump to ${quote(names.slide(action.target.slide))}`
        : `Jump to the ${action.target.kind} slide`;
    case 'setVariable': {
      const variable = names.variable(action.variable);
      const value = describeOperand(action.operand, names);
      switch (action.operator) {
        case 'assign':
          return `Set ${variable} to ${value}`;
        case 'add':
          return `Add ${value} to ${variable}`;
        case 'subtract':
          return `Subtract ${value} from ${variable}`;
        case 'multiply':
          return `Multiply ${variable} by ${value}`;
        case 'divide':
          return `Divide ${variable} by ${value}`;
        case 'append':
          return `Add the text ${value} to the end of ${variable}`;
      }
      break;
    }
    case 'toggleVariable':
      return `Toggle ${names.variable(action.variable)}`;
    case 'pauseTimeline':
      return `Pause the timeline of ${names.layer(action.layer)}`;
    case 'resumeTimeline':
      return `Resume the timeline of ${names.layer(action.layer)}`;
    case 'playMedia':
      return `Play media ${names.object(action.object)}`;
    case 'pauseMedia':
      return `Pause media ${names.object(action.object)}`;
    case 'stopMedia':
      return `Stop media ${names.object(action.object)}`;
    case 'moveAlongPath':
      return `Move ${names.object(action.object)} along ${names.path(action.object, action.path)}`;
    case 'openUrl':
      return `Open ${action.url}`;
    case 'completeCourse':
      return 'Complete the course';
    case 'submitInteraction':
      return 'Submit the question';
    case 'continueQuestion':
      return 'Go on from the feedback';
    case 'reviewQuiz':
      return 'Review the quiz';
    case 'exitReview':
      return 'Leave the review';
    case 'retryQuiz':
      return 'Retry the quiz';
    case 'printResults':
      return 'Print the results';
    case 'openLightbox':
      return `Open ${quote(names.slide(action.slide))} as a lightbox${action.controls ? ', with Previous and Next' : ''}`;
    case 'closeLightbox':
      return 'Close the lightbox';
    case 'restartCourse':
      return 'Restart the course';
    case 'exitCourse':
      return 'Exit the course';
    case 'printSlide':
      return 'Print the slide';
    case 'sendEmail':
      return action.to ? `Send an email to ${action.to}` : 'Send an email';
    case 'openFile':
      return `Open the file ${quote(names.file(action.asset))}`;
    case 'setFocus':
      return `Move focus to ${names.object(action.object)}`;
    case 'seekTimeline':
      return `Seek ${names.layer(action.layer)} to ${action.time} s`;
    case 'executeJavaScript': {
      // The first line that is not a comment says what it does, as far as anything can.
      const line = action.code
        .split('\n')
        .map((each) => each.trim())
        .find((each) => each !== '' && !each.startsWith('//'));
      return line
        ? `Run JavaScript (${line.length > 40 ? `${line.slice(0, 40)}…` : line})`
        : 'Run JavaScript';
    }
  }
  return 'Do nothing';
}

export function describeEvent(event: TriggerEvent, names: Names): string {
  switch (event.type) {
    case 'click':
      return `when the learner clicks ${names.object(event.object)}`;
    case 'doubleClick':
      return `when the learner double-clicks ${names.object(event.object)}`;
    case 'rightClick':
      return `when the learner right-clicks ${names.object(event.object)}`;
    case 'mouseEnter':
      return `when the pointer moves onto ${names.object(event.object)}`;
    case 'mouseLeave':
      return `when the pointer leaves ${names.object(event.object)}`;
    case 'playerTab':
      return `when the learner clicks the player tab ${quote(names.tab(event.tab))}`;
    case 'keyPress':
      return `when the learner presses ${event.key === ' ' ? 'Space' : event.key}`;
    case 'timelineStart':
      return `when the timeline of ${names.layer(event.layer)} starts`;
    case 'timelineEnd':
      return `when the timeline of ${names.layer(event.layer)} ends`;
    case 'timelineReaches':
      return `when the timeline of ${names.layer(event.layer)} reaches ${event.time} s`;
    case 'cuePoint':
      return `when the timeline of ${names.layer(event.layer)} reaches cue point ${names.cuePoint(event.cuePoint)}`;
    case 'stateChange':
      return `when ${names.object(event.object)} changes to ${names.state(event.object, event.state)}`;
    case 'variableChange':
      return `when ${names.variable(event.variable)} changes`;
    case 'mediaCompletes':
      return `when ${names.object(event.object)} completes`;
    case 'controlLosesFocus':
      return `when ${names.object(event.object)} loses focus`;
    case 'controlMoves':
      return `when ${names.object(event.object)} moves`;
    case 'spotClicked':
      return `when the learner opens ${names.spot(event.object, event.spot)} in ${names.object(event.object)}`;
    case 'panoramaVisited':
      return `when every spot in ${names.object(event.object)} has been opened`;
    case 'draggedOver':
      return `when the learner drags ${names.object(event.object)} over ${names.object(event.target)}`;
    case 'droppedOn':
      return `when the learner drops ${names.object(event.object)} on ${names.object(event.target)}`;
    case 'intersects':
      return `when ${names.object(event.object)} intersects ${names.object(event.other)}`;
    case 'stopsIntersecting':
      return `when ${names.object(event.object)} stops intersecting ${names.object(event.other)}`;
    case 'animationCompletes': {
      const { animation } = event;
      const which =
        animation.kind === 'path'
          ? `moving along ${names.path(event.object, animation.path)}`
          : `its ${animation.kind}`;
      return `when ${names.object(event.object)} finishes ${which}`;
    }
  }
}

const OPERATOR_WORDS: Record<string, string> = {
  '==': 'is',
  '!=': 'is not',
  '<': 'is less than',
  '<=': 'is at most',
  '>': 'is more than',
  '>=': 'is at least',
  contains: 'contains',
  '==i': 'is, ignoring case,',
  '!=i': 'is not, ignoring case,',
};

export function describeCondition(condition: Condition, names: Names): string {
  if (condition.subject === 'objectState') {
    return `${names.object(condition.object)} ${condition.operator === '==' ? 'is' : 'is not'} ${names.state(condition.object, condition.state)}`;
  }
  return `${names.variable(condition.variable)} ${OPERATOR_WORDS[condition.operator]} ${describeOperand(condition.value, names)}`;
}

/** The whole trigger as one sentence, as the panel lists it. */
export function describeTrigger(trigger: Trigger, names: Names): string {
  let text = `${describeAction(trigger.action, names)} ${describeEvent(trigger.event, names)}`;
  if (trigger.conditions) {
    const joiner = trigger.conditions.combine === 'and' ? ' and ' : ' or ';
    text += ` if ${trigger.conditions.items.map((c) => describeCondition(c, names)).join(joiner)}`;
  }
  if (trigger.otherwise) {
    const otherwise = describeAction(trigger.otherwise, names);
    text += `; otherwise ${otherwise.charAt(0).toLowerCase()}${otherwise.slice(1)}`;
  }
  return text;
}

/** Who a trigger belongs to follows from its event: the object it watches, a layer, or the slide. */
export function ownerFor(event: TriggerEvent, slide: Slide): Trigger['owner'] {
  if ('object' in event) return { kind: 'object', id: event.object };
  if ('layer' in event && event.layer !== slide.baseLayer.id)
    return { kind: 'layer', id: event.layer };
  return { kind: 'slide', id: slide.id };
}
