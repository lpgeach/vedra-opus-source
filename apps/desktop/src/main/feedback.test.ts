import { describe, expect, it } from 'vitest';
import { describeSystem, FEEDBACK_URL, feedbackUrl } from './feedback';

describe('the feedback link', () => {
  it('names the computer as the form shows it', () => {
    expect(describeSystem('win32', '10.0.26100')).toBe('Windows 11');
    expect(describeSystem('win32', '10.0.22000')).toBe('Windows 11');
    expect(describeSystem('win32', '10.0.19045')).toBe('Windows 10');
    expect(describeSystem('win32', '')).toBe('Windows');
    expect(describeSystem('darwin', '15.2.0')).toBe('macOS 15.2.0');
    expect(describeSystem('darwin', '')).toBe('macOS');
    expect(describeSystem('linux', '6.12.1-arch1-1')).toBe('Linux');
  });

  it('opens the site with the version and computer filled in, and nothing more', () => {
    const url = new URL(feedbackUrl('0.1.0-alpha.3', 'Windows 11'));
    expect(`${url.origin}${url.pathname}`).toBe(FEEDBACK_URL);
    expect(url.protocol).toBe('https:');
    expect([...url.searchParams.keys()]).toEqual(['v', 'os']);
    expect(url.searchParams.get('v')).toBe('0.1.0-alpha.3');
    expect(url.searchParams.get('os')).toBe('Windows 11');
  });
});
