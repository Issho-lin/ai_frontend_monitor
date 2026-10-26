import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { PostgresService } from '../alerts/postgres.service';
import {
  hashToken,
  maskToken,
  newTokenId,
  newTokenPlain,
  resolveTokenMap,
} from './token-crypto';

export type ProjectEnv = 'production' | 'staging' | 'development';

export interface ProjectResult {
  id: string;
  name: string;
  env: ProjectEnv;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTokenResult {
  id: string;
  projectId: string;
  tokenMasked: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreateProjectInput {
  id: string;
  name: string;
  env: ProjectEnv;
}

export interface UpdateProjectInput {
  name?: string;
  env?: ProjectEnv;
}

export interface CreateTokenResult {
  token: ProjectTokenResult;
  tokenPlain: string;
}

interface ProjectRow {
  id: string;
  name: string;
  env: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface TokenRow {
  id: string;
  project_id: string;
  token_masked: string;
  name: string;
  enabled: boolean;
  created_at: Date | string;
  last_used_at: Date | string | null;
  revoked_at: Date | string | null;
}

const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ENVS = new Set<ProjectEnv>(['production', 'staging', 'development']);
const SEED_LOCK_KEY = 428211;

const PROJECT_RETURNING = `id, name, env, created_at, updated_at`;
const TOKEN_RETURNING = `
  id, project_id, token_masked, name, enabled, created_at, last_used_at, revoked_at
`;

@Injectable()
export class ProjectsService implements OnApplicationBootstrap {
  constructor(private readonly postgres: PostgresService) {}

  async onApplicationBootstrap() {
    await this.seedFromEnvIfEmpty();
  }

  async list(): Promise<ProjectResult[]> {
    const result = await this.postgres.query<ProjectRow>(
      `SELECT ${PROJECT_RETURNING} FROM projects ORDER BY created_at ASC, id ASC`,
    );
    return result.rows.map((row) => this.mapProject(row));
  }

  async create(input: CreateProjectInput): Promise<ProjectResult> {
    const id = this.parseId(input.id);
    const name = this.parseName(input.name, true);
    const env = this.parseEnv(input.env, true);
    try {
      const result = await this.postgres.query<ProjectRow>(
        `
          INSERT INTO projects (id, name, env)
          VALUES ($1, $2, $3)
          RETURNING ${PROJECT_RETURNING}
        `,
        [id, name, env],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException(`Project ${id} not found`);
      await this.notifyTokensChanged();
      return this.mapProject(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Project id already exists: ${id}`);
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateProjectInput): Promise<ProjectResult> {
    const projectId = this.parseId(id);
    const current = await this.requireProject(projectId);
    const name =
      input.name === undefined
        ? current.name
        : this.parseName(input.name, true);
    const env =
      input.env === undefined ? current.env : this.parseEnv(input.env, true);
    const result = await this.postgres.query<ProjectRow>(
      `
        UPDATE projects
        SET name = $2, env = $3, updated_at = now()
        WHERE id = $1
        RETURNING ${PROJECT_RETURNING}
      `,
      [projectId, name, env],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException(`Project ${projectId} not found`);
    return this.mapProject(row);
  }

  /** Hard-delete. Token rows cascade; alerts/issues/tasks do not. */
  async remove(id: string): Promise<void> {
    const projectId = this.parseId(id);
    const result = await this.postgres.query(
      `DELETE FROM projects WHERE id = $1`,
      [projectId],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    await this.notifyTokensChanged();
  }

  async listTokens(projectIdRaw: string): Promise<ProjectTokenResult[]> {
    const projectId = this.parseId(projectIdRaw);
    await this.requireProject(projectId);
    const result = await this.postgres.query<TokenRow>(
      `
        SELECT ${TOKEN_RETURNING}
        FROM project_tokens
        WHERE project_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [projectId],
    );
    return result.rows.map((row) => this.mapToken(row));
  }

  async createToken(
    projectIdRaw: string,
    nameRaw?: string,
  ): Promise<CreateTokenResult> {
    const projectId = this.parseId(projectIdRaw);
    await this.requireProject(projectId);
    const name =
      nameRaw === undefined || nameRaw.trim() === ''
        ? '默认 Token'
        : this.parseName(nameRaw, true);
    const tokenPlain = newTokenPlain();
    const tokenHash = hashToken(tokenPlain);
    const tokenMasked = maskToken(tokenPlain);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const id = newTokenId();
      try {
        const result = await this.postgres.query<TokenRow>(
          `
            INSERT INTO project_tokens (
              id, project_id, token_hash, token_masked, name, enabled
            )
            VALUES ($1, $2, $3, $4, $5, TRUE)
            RETURNING ${TOKEN_RETURNING}
          `,
          [id, projectId, tokenHash, tokenMasked, name],
        );
        const row = result.rows[0];
        if (!row) throw new NotFoundException(`Project ${projectId} not found`);
        await this.notifyTokensChanged();
        return { token: this.mapToken(row), tokenPlain };
      } catch (err) {
        if (isUniqueViolation(err) && attempt === 0) continue;
        if (isUniqueViolation(err)) {
          throw new ConflictException('Token id collision, retry the request');
        }
        throw err;
      }
    }
    throw new ConflictException('Could not allocate a token id');
  }

  async revokeToken(
    projectIdRaw: string,
    tokenIdRaw: string,
  ): Promise<ProjectTokenResult> {
    const projectId = this.parseId(projectIdRaw);
    const tokenId = tokenIdRaw.trim();
    if (!tokenId) throw new BadRequestException('token id is required');
    await this.requireProject(projectId);

    const existing = await this.postgres.query<TokenRow>(
      `
        SELECT ${TOKEN_RETURNING}
        FROM project_tokens
        WHERE project_id = $1 AND id = $2
      `,
      [projectId, tokenId],
    );
    const current = existing.rows[0];
    if (!current) {
      throw new NotFoundException(`Token ${tokenId} not found`);
    }
    if (current.revoked_at) {
      return this.mapToken(current);
    }

    const result = await this.postgres.query<TokenRow>(
      `
        UPDATE project_tokens
        SET enabled = FALSE, revoked_at = now()
        WHERE project_id = $1 AND id = $2 AND revoked_at IS NULL
        RETURNING ${TOKEN_RETURNING}
      `,
      [projectId, tokenId],
    );
    const row = result.rows[0] ?? current;
    await this.notifyTokensChanged();
    return this.mapToken(row);
  }

  /**
   * Empty `projects` table → insert the env map (hash only).
   * A non-empty table is left alone so a revoked demo token is not resurrected.
   */
  private async seedFromEnvIfEmpty() {
    const map = resolveTokenMap(
      process.env.AFM_PROJECT_TOKENS,
      process.env.PROJECT_TOKENS,
    );
    const seeded = await this.postgres.withClient(async (client) => {
      await client.query('SELECT pg_advisory_lock($1::bigint)', [
        SEED_LOCK_KEY,
      ]);
      try {
        await client.query('BEGIN');
        const count = await client.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM projects`,
        );
        if ((count.rows[0]?.n ?? 0) > 0) {
          await client.query('COMMIT');
          return 0;
        }
        let n = 0;
        for (const [projectId, plain] of Object.entries(map)) {
          if (!PROJECT_ID_RE.test(projectId)) {
            console.warn(
              `[projects] skip env seed with invalid project id: ${projectId}`,
            );
            continue;
          }
          await client.query(
            `
              INSERT INTO projects (id, name, env)
              VALUES ($1, $2, 'production')
              ON CONFLICT (id) DO NOTHING
            `,
            [projectId, projectId],
          );
          await client.query(
            `
              INSERT INTO project_tokens (
                id, project_id, token_hash, token_masked, name, enabled
              )
              VALUES ($1, $2, $3, $4, '环境变量种子', TRUE)
              ON CONFLICT (id) DO NOTHING
            `,
            [
              `tok_seed_${projectId}`,
              projectId,
              hashToken(plain),
              maskToken(plain),
            ],
          );
          n += 1;
        }
        await client.query(`SELECT pg_notify('afm_project_tokens', 'seed')`);
        await client.query('COMMIT');
        return n;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        await client.query('SELECT pg_advisory_unlock($1::bigint)', [
          SEED_LOCK_KEY,
        ]);
      }
    });
    if (seeded > 0) {
      console.log(`[projects] seeded ${seeded} project token(s) from env`);
    } else {
      console.log('[projects] projects table non-empty, skip env token seed');
    }
  }

  private async notifyTokensChanged() {
    await this.postgres.query(
      `SELECT pg_notify('afm_project_tokens', 'changed')`,
    );
  }

  private async requireProject(id: string): Promise<ProjectResult> {
    const result = await this.postgres.query<ProjectRow>(
      `SELECT ${PROJECT_RETURNING} FROM projects WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return this.mapProject(row);
  }

  private parseId(raw: unknown): string {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!PROJECT_ID_RE.test(id)) {
      throw new BadRequestException(
        'Project id must match /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/',
      );
    }
    return id;
  }

  private parseName(raw: unknown, required: boolean): string {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name) {
      if (!required) return '';
      throw new BadRequestException('name is required');
    }
    if (name.length > 120) {
      throw new BadRequestException('name must be at most 120 characters');
    }
    return name;
  }

  private parseEnv(raw: unknown, required: boolean): ProjectEnv {
    if (raw === undefined || raw === null || raw === '') {
      if (!required) return 'production';
      throw new BadRequestException('env is required');
    }
    if (typeof raw !== 'string' || !ENVS.has(raw as ProjectEnv)) {
      throw new BadRequestException(
        'env must be production, staging, or development',
      );
    }
    return raw as ProjectEnv;
  }

  private mapProject(row: ProjectRow): ProjectResult {
    return {
      id: row.id,
      name: row.name,
      env: row.env as ProjectEnv,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  }

  private mapToken(row: TokenRow): ProjectTokenResult {
    return {
      id: row.id,
      projectId: row.project_id,
      tokenMasked: row.token_masked,
      name: row.name,
      enabled: Boolean(row.enabled) && !row.revoked_at,
      createdAt: toIso(row.created_at),
      lastUsedAt: row.last_used_at ? toIso(row.last_used_at) : null,
      revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
    };
  }
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}
