export interface ProjectIssue {
  /** Where in the document, e.g. `scenes[0].slides[2].baseLayer.objects[1].frame.width`. */
  path: string;
  message: string;
}

/** Thrown when a document cannot be loaded. `issues` lists every problem found. */
export class ProjectValidationError extends Error {
  readonly issues: readonly ProjectIssue[];

  constructor(issues: readonly ProjectIssue[]) {
    const shown = issues
      .slice(0, 5)
      .map((issue) => `  ${issue.path || '(root)'}: ${issue.message}`);
    const more = issues.length > 5 ? `\n  …and ${issues.length - 5} more` : '';
    super(`Invalid project:\n${shown.join('\n')}${more}`);
    this.name = 'ProjectValidationError';
    this.issues = issues;
  }
}

/** Render a path of keys and indexes as `a.b[0].c`. */
export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const key of path) {
    if (typeof key === 'number') out += `[${key}]`;
    else out += out ? `.${String(key)}` : String(key);
  }
  return out;
}
