import { createHash } from 'node:crypto';

/**
 * Keep in sync with `apps/api/src/projects/token-crypto.ts` and the console mask.
 * Lookup key is lowercase hex SHA-256 of the UTF-8 plaintext.
 */

const DEFAULT_TOKENS: Record<string, string> = {
  demo: 'afm-demo-token',
};

export function hashToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

export function parseTokenMap(raw: string | undefined): Record<string, string> | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected a JSON object');
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const projectId = key.trim();
      if (!projectId || typeof value !== 'string' || !value.trim()) {
        continue;
      }
      out[projectId] = value.trim();
    }
    return out;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid AFM_PROJECT_TOKENS / PROJECT_TOKENS: ${message}`);
  }
}

export function resolveTokenMap(
  afmRaw: string | undefined,
  projectRaw: string | undefined,
): Record<string, string> {
  return parseTokenMap(afmRaw) ?? parseTokenMap(projectRaw) ?? { ...DEFAULT_TOKENS };
}
