import {
  hashToken,
  maskToken,
  parseTokenMap,
  resolveTokenMap,
} from './token-crypto';

describe('token-crypto', () => {
  it('masks like the console mock', () => {
    expect(maskToken('afm-demo-token')).toBe('afm-****oken');
    expect(maskToken('afm_abcd')).toBe('af****');
    expect(maskToken(`afm_${'ab'.repeat(16)}`)).toBe('afm_****abab');
  });

  it('stores sha256 hex, not the plaintext', () => {
    const hash = hashToken('afm-demo-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('afm-demo-token');
    expect(hashToken('afm-demo-token')).toBe(hash);
  });

  it('prefers AFM_PROJECT_TOKENS and defaults when both are empty', () => {
    expect(parseTokenMap(undefined)).toBeNull();
    expect(parseTokenMap('  ')).toBeNull();
    expect(parseTokenMap('{"demo":"afm-demo-token"}')).toEqual({
      demo: 'afm-demo-token',
    });
    expect(resolveTokenMap('{"acme":"afm_live"}', '{"demo":"other"}')).toEqual({
      acme: 'afm_live',
    });
    expect(resolveTokenMap(undefined, undefined)).toEqual({
      demo: 'afm-demo-token',
    });
  });

  it('rejects a non-object token map', () => {
    expect(() => parseTokenMap('[]')).toThrow(/Invalid AFM_PROJECT_TOKENS/);
    expect(() => parseTokenMap('{')).toThrow(/Invalid AFM_PROJECT_TOKENS/);
  });
});
