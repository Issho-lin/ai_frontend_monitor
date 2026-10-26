import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Client, Pool, type PoolClient } from 'pg';
import { hashToken, resolveTokenMap } from './token-crypto';

/**
 * Ingest auth: a non-revoked `project_tokens` row for the project wins.
 * Env map (`AFM_PROJECT_TOKENS` / `PROJECT_TOKENS`, else demo) is only a
 * fallback when Postgres is unreachable or the project id is not in `projects`.
 *
 * Lookups are cached for AFM_TOKEN_CACHE_TTL_MS (default 5000).
 * API `NOTIFY afm_project_tokens` clears the cache so mint/revoke apply
 * without a gateway restart. TTL is the backstop if NOTIFY is missed.
 */

const LISTEN_CHANNEL = 'afm_project_tokens';

interface CacheEntry {
  ok: boolean;
  tokenId?: string;
  exp: number;
}

interface TokenLookupRow {
  project_exists: boolean;
  token_id: string | null;
  enabled: boolean | null;
  revoked_at: Date | string | null;
}

type Lookup =
  | { kind: 'active'; tokenId: string }
  | { kind: 'deny' }
  | { kind: 'fallback' }
  | { kind: 'down' };

function pgConfig() {
  return {
    host: process.env.POSTGRES_HOST ?? '127.0.0.1',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? 'afm',
    password: process.env.POSTGRES_PASSWORD ?? 'CHANGE_ME_DEV_SECRET',
    database: process.env.POSTGRES_DB ?? 'afm',
    connectionTimeoutMillis: 2000,
  };
}

function cacheTtlMs(): number {
  const n = Number(process.env.AFM_TOKEN_CACHE_TTL_MS ?? 5000);
  if (!Number.isFinite(n) || n < 0) return 5000;
  return n;
}

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private tokens: Record<string, string> = { demo: 'afm-demo-token' };
  private readonly ttlMs = cacheTtlMs();
  private readonly cache = new Map<string, CacheEntry>();
  private readonly lastTouch = new Map<string, number>();
  private pool: Pool | null = null;
  private listenClient: Client | null = null;
  private listenTimer: NodeJS.Timeout | null = null;
  private listenGen = 0;
  private stopped = false;
  private lastDbWarnAt = 0;

  onModuleInit() {
    this.tokens = resolveTokenMap(
      process.env.AFM_PROJECT_TOKENS,
      process.env.PROJECT_TOKENS,
    );
    const ids = Object.keys(this.tokens);
    console.log(
      `[gateway-auth] env fallback ${ids.length} project token(s): ${ids.join(', ') || '(none)'}; cache ttl ${this.ttlMs}ms`,
    );

    this.pool = new Pool({ ...pgConfig(), max: 4 });
    this.pool.on('error', (err) => {
      this.warnDb(err);
    });
    void this.listen();
  }

  async onModuleDestroy() {
    this.stopped = true;
    this.listenGen += 1;
    if (this.listenTimer) clearTimeout(this.listenTimer);
    const listenClient = this.listenClient;
    this.listenClient = null;
    await listenClient?.end().catch(() => undefined);
    await this.pool?.end().catch(() => undefined);
    this.pool = null;
  }

  /**
   * Require header `x-project-token` + `projectId` (body/query).
   * Active DB row for that project wins. Revoked / wrong token on a known
   * project is 401 even if the env map still lists the plaintext.
   */
  async assertAuthorized(projectId: string | undefined, token?: string) {
    const pid = projectId?.trim() ?? '';
    const plain = token?.trim() ?? '';

    if (!pid) {
      throw new UnauthorizedException('projectId is required');
    }
    if (!plain) {
      throw new UnauthorizedException('x-project-token is required');
    }

    const hash = hashToken(plain);
    const key = `${pid}\n${hash}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.exp > now) {
      if (cached.ok) {
        if (cached.tokenId) this.touchLastUsed(cached.tokenId);
        return;
      }
      throw new UnauthorizedException('Invalid project token.');
    }

    const verdict = await this.lookup(pid, hash);
    if (verdict.kind === 'active') {
      this.remember(key, { ok: true, tokenId: verdict.tokenId, exp: now + this.ttlMs });
      this.touchLastUsed(verdict.tokenId);
      return;
    }
    if (verdict.kind === 'deny') {
      this.remember(key, { ok: false, exp: now + this.ttlMs });
      throw new UnauthorizedException('Invalid project token.');
    }

    const expected = this.tokens[pid];
    if (expected && expected === plain) {
      // DB down, or project not inserted yet: keep the env map working.
      if (verdict.kind !== 'down') {
        this.remember(key, { ok: true, exp: now + this.ttlMs });
      }
      return;
    }

    if (verdict.kind !== 'down') {
      this.remember(key, { ok: false, exp: now + this.ttlMs });
    }
    throw new UnauthorizedException('Invalid project token.');
  }

  private async lookup(projectId: string, hash: string): Promise<Lookup> {
    if (!this.pool) return { kind: 'down' };
    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      const result = await client.query<TokenLookupRow>(
        `
          SELECT
            EXISTS(SELECT 1 FROM projects WHERE id = $1) AS project_exists,
            t.id AS token_id,
            t.enabled AS enabled,
            t.revoked_at AS revoked_at
          FROM (SELECT 1) AS _
          LEFT JOIN project_tokens t
            ON t.project_id = $1 AND t.token_hash = $2
        `,
        [projectId, hash],
      );
      const row = result.rows[0];
      if (!row?.project_exists) return { kind: 'fallback' };
      if (row.token_id && row.enabled && !row.revoked_at) {
        return { kind: 'active', tokenId: row.token_id };
      }
      return { kind: 'deny' };
    } catch (err) {
      this.warnDb(err);
      return { kind: 'down' };
    } finally {
      client?.release();
    }
  }

  private touchLastUsed(tokenId: string) {
    const now = Date.now();
    const prev = this.lastTouch.get(tokenId) ?? 0;
    if (now - prev < 60_000) return;
    this.lastTouch.set(tokenId, now);
    void this.pool
      ?.query(
        `
          UPDATE project_tokens
          SET last_used_at = now()
          WHERE id = $1
            AND revoked_at IS NULL
            AND (last_used_at IS NULL OR last_used_at < now() - interval '60 seconds')
        `,
        [tokenId],
      )
      .catch((err) => this.warnDb(err));
  }

  private remember(key: string, entry: CacheEntry) {
    if (this.ttlMs === 0) return;
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(key, entry);
  }

  private warnDb(err: unknown) {
    const now = Date.now();
    if (now - this.lastDbWarnAt < 30_000) return;
    this.lastDbWarnAt = now;
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[gateway-auth] postgres token lookup failed: ${message}`);
  }

  private scheduleListen(delayMs: number) {
    if (this.stopped || this.listenTimer) return;
    this.listenTimer = setTimeout(() => {
      this.listenTimer = null;
      void this.listen();
    }, delayMs);
  }

  private async listen() {
    if (this.stopped) return;
    const gen = ++this.listenGen;
    const client = new Client(pgConfig());
    try {
      await client.connect();
      if (this.stopped || gen !== this.listenGen) {
        await client.end().catch(() => undefined);
        return;
      }
      await client.query(`LISTEN ${LISTEN_CHANNEL}`);
      this.listenClient = client;
      client.on('notification', () => {
        this.cache.clear();
      });
      client.on('error', (err) => {
        this.warnDb(err);
        this.dropListen(client, gen);
      });
      client.on('end', () => this.dropListen(client, gen));
      console.log(`[gateway-auth] listening ${LISTEN_CHANNEL}`);
    } catch (err) {
      this.warnDb(err);
      await client.end().catch(() => undefined);
      this.scheduleListen(5000);
    }
  }

  private dropListen(client: Client, gen: number) {
    if (this.stopped || gen !== this.listenGen) return;
    this.listenGen += 1;
    if (this.listenClient === client) this.listenClient = null;
    this.cache.clear();
    void client.end().catch(() => undefined);
    this.scheduleListen(2000);
  }
}
