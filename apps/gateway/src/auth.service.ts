import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';

/**
 * ProjectId → plaintext token map from env.
 *
 * Supported env vars (first match wins):
 * - AFM_PROJECT_TOKENS  JSON object, e.g. {"demo":"afm-demo-token"}
 * - PROJECT_TOKENS      same shape (alias)
 *
 * If neither is set, defaults to demo → afm-demo-token for local continuity.
 */
const DEFAULT_TOKENS: Record<string, string> = {
  demo: 'afm-demo-token',
};

function parseTokenMap(raw: string | undefined): Record<string, string> | null {
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

@Injectable()
export class AuthService implements OnModuleInit {
  private tokens: Record<string, string> = { ...DEFAULT_TOKENS };

  onModuleInit() {
    const fromEnv =
      parseTokenMap(process.env.AFM_PROJECT_TOKENS) ??
      parseTokenMap(process.env.PROJECT_TOKENS);

    this.tokens = fromEnv ?? { ...DEFAULT_TOKENS };

    const ids = Object.keys(this.tokens);
    console.log(
      `[gateway-auth] loaded ${ids.length} project token(s): ${ids.join(', ') || '(none)'}`,
    );
  }

  /**
   * Require header `x-project-token` + `projectId` (body/query).
   * Token must match the configured value for that projectId exactly.
   */
  assertAuthorized(projectId: string | undefined, token?: string) {
    const pid = projectId?.trim() ?? '';
    const plain = token?.trim() ?? '';

    if (!pid) {
      throw new UnauthorizedException('projectId is required');
    }
    if (!plain) {
      throw new UnauthorizedException('x-project-token is required');
    }

    const expected = this.tokens[pid];
    if (!expected || expected !== plain) {
      throw new UnauthorizedException('Invalid project token.');
    }
  }
}
