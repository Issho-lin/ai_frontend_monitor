import { createHash, randomBytes } from 'node:crypto';

/**
 * Token hashing / masking shared with the console mock
 * (`apps/console/src/api/projects.ts`) and the gateway
 * (`apps/gateway/src/token-crypto.ts`). Keep the three in sync.
 *
 * Stored form is lowercase hex SHA-256 of the UTF-8 plaintext.
 * SHA-256 (not bcrypt) so ingest can look up one indexed hash.
 */

const DEFAULT_TOKENS: Record<string, string> = {
  demo: 'afm-demo-token',
};

export function hashToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

/** Same shape as the console mock: `afm-****oken` / short `ab****`. */
export function maskToken(plain: string): string {
  if (plain.length <= 8) return `${plain.slice(0, 2)}****`;
  return `${plain.slice(0, 4)}****${plain.slice(-4)}`;
}

export function newTokenPlain(): string {
  return `afm_${randomBytes(16).toString('hex')}`;
}

export function newTokenId(): string {
  return `tok_${randomBytes(9).toString('base64url')}`;
}

/**
 * AFM_PROJECT_TOKENS wins over PROJECT_TOKENS.
 * Unset/blank → null (caller applies the demo default).
 * Invalid JSON throws. An explicit `{}` returns an empty map.
 */
export function parseTokenMap(
  raw: string | undefined,
): Record<string, string> | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected a JSON object');
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
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
  return (
    parseTokenMap(afmRaw) ?? parseTokenMap(projectRaw) ?? { ...DEFAULT_TOKENS }
  );
}
