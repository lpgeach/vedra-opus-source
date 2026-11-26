/**
 * Golden runs (plan section 11, "the parity rule in practice"): a fixture's
 * scripted inputs and what must be true after each one. The same script is
 * played against the engine alone (fixtures/golden.test.ts), in preview and in
 * a published course (e2e/golden.spec.ts); all three must agree with it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GoldenSnapshot {
  /** Title of the current slide. */
  slide: string;
  /** Overlay layers shown, bottom to top, by name. */
  layers: string[];
  /** Objects the learner can see, by name: the base layer's in order, then each shown layer's. */
  visible: string[];
  /** The drawn state of some objects, by name. */
  states: Record<string, string>;
  /** The text some objects show, with variables filled in, by name. */
  text: Record<string, string>;
}

export interface GoldenRun {
  description: string;
  /** `click`: the object to click, by name; null for the state before any input. */
  steps: { click: string | null; expect: GoldenSnapshot }[];
}

export function readGolden(fixture: string): GoldenRun {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, 'projects', fixture, 'golden.json'), 'utf8'),
  ) as GoldenRun;
}
