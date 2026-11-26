/** Text for an XML attribute or element. */
export const escapeXml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** An XML id: letters, digits, `-`, `_` and `.`, starting with a letter. */
export const xmlId = (text: string) => `vedraopus-${text.replace(/[^A-Za-z0-9_.-]/g, '-')}`;

/** A name usable as an XML id (ASCII only, which every LMS reads). */
export const isXmlName = (text: string) => /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(text);

/** What a SCORM manifest says about the package: its identifier and version. */
export interface ManifestOptions {
  /** Default: from the project id. Must be an XML name. */
  identifier?: string;
  /** Default `1.0`. */
  version?: string;
}

/** The manifest identifier and version to write, refusing an identifier that is not an XML name. */
export function manifestHeader(projectId: string, options: ManifestOptions = {}) {
  const identifier = options.identifier?.trim() || xmlId(projectId);
  if (!isXmlName(identifier)) {
    throw new Error(
      `The identifier must start with a letter or "_" and use only letters, digits, "-", "_" and "." (got "${identifier}").`,
    );
  }
  return { id: identifier, version: escapeXml(options.version?.trim() || '1.0') };
}
