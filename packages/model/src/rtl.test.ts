import { describe, expect, it } from 'vitest';
import { isRightToLeft } from './index';

/** Right-to-left languages (docs/briefs/P10.3-translation.md, part C). */

describe('right-to-left languages', () => {
  it('are known by language, any region, and by a script that says so', () => {
    for (const tag of [
      'ar',
      'ar-EG',
      'he',
      'he-IL',
      'iw',
      'fa',
      'fa-IR',
      'ur',
      'ps',
      'yi',
      'ckb',
      'AR',
    ]) {
      expect(isRightToLeft(tag), tag).toBe(true);
    }
    // A script subtag decides: Azerbaijani in Arabic script, Urdu in Latin.
    expect(isRightToLeft('az-Arab')).toBe(true);
    expect(isRightToLeft('pa-Arab-PK')).toBe(true);
    expect(isRightToLeft('ur-Latn')).toBe(false);
    expect(isRightToLeft('ug-Cyrl')).toBe(false);
    for (const tag of ['en', 'en-GB', 'fr', 'zh-Hant', 'ja', 'ha', 'az', 'hi']) {
      expect(isRightToLeft(tag), tag).toBe(false);
    }
  });
});
