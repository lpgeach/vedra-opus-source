import { layerCommands } from './layer';
import { masterCommands } from './master';
import { objectCommands } from './object';
import { projectCommands } from './project';
import { sceneCommands } from './scene';
import { triggerCommands } from './trigger';
import { variableCommands } from './variable';
import type { CommandHandlers } from './types';

/** Every command the model understands. Adding one: add it to CommandMap, then here. */
export const commandHandlers: CommandHandlers = {
  ...projectCommands,
  ...sceneCommands,
  ...masterCommands,
  ...layerCommands,
  ...variableCommands,
  ...triggerCommands,
  ...objectCommands,
};
