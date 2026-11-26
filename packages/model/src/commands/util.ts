import { current, isDraft } from 'immer';
import type { z } from 'zod';
import { formatPath } from '../errors';
import { findObject, findScene, findSlide, idsInProject } from '../find';
import type { ObjectLocation, SceneLocation, SlideLocation } from '../find';
import type { Project } from '../schema';
import { CommandError } from './types';

export function requireScene(project: Project, sceneId: string): SceneLocation {
  const found = findScene(project, sceneId);
  if (!found) throw new CommandError(`No scene with id "${sceneId}"`);
  return found;
}

export function requireSlide(project: Project, slideId: string): SlideLocation {
  const found = findSlide(project, slideId);
  if (!found) throw new CommandError(`No slide with id "${slideId}"`);
  return found;
}

export function requireObject(project: Project, objectId: string): ObjectLocation {
  const found = findObject(project, objectId);
  if (!found) throw new CommandError(`No object with id "${objectId}"`);
  return found;
}

/**
 * Resolve where to insert into a list of `length` items. Omitted means the end.
 * Positions past the end are an error rather than being clamped, so a caller's
 * off-by-one surfaces instead of silently landing somewhere else.
 */
export function insertionIndex(index: number | undefined, length: number): number {
  if (index === undefined) return length;
  if (!Number.isInteger(index) || index < 0 || index > length) {
    throw new CommandError(`Index ${index} is out of range 0–${length}`);
  }
  return index;
}

/** Reject a payload that does not satisfy its schema. Returns nothing: the original value is used. */
export function assertValid(schema: z.ZodType, value: unknown, what: string): void {
  const result = schema.safeParse(isDraft(value) ? current(value) : value);
  if (!result.success) {
    const [issue] = result.error.issues;
    const where = issue ? formatPath(issue.path) : '';
    throw new CommandError(
      `Invalid ${what}${where ? ` at ${where}` : ''}: ${issue?.message ?? 'does not match the schema'}`,
    );
  }
}

/** Reject new content whose ids repeat or collide with ids already in the project. */
export function assertIdsAreNew(project: Project, newIds: readonly string[]): void {
  const existing = idsInProject(project);
  const seen = new Set<string>();
  for (const id of newIds) {
    if (existing.has(id) || seen.has(id)) throw new CommandError(`Id "${id}" is already in use`);
    seen.add(id);
  }
}

/** Move an item within one array to the position it should end up at. */
export function moveWithin<T>(list: T[], from: number, to: number): void {
  if (!Number.isInteger(to) || to < 0 || to >= list.length) {
    throw new CommandError(`Index ${to} is out of range 0–${list.length - 1}`);
  }
  if (from === to) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item!);
}
