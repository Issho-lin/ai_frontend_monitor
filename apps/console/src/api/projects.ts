/**
 * Console 项目 / Token API 层
 *
 * 产品契约（已认）：
 * - ingest：请求头 `x-project-token` + body/query 中的 `projectId`
 * - Console：项目 CRUD；Token 生成/吊销；明文只展示一次，服务端仅存 hash
 *
 * TODO(backend): 下列路径待后端落地后，将 USE_PROJECTS_MOCK 改为 false。
 *   GET    /api/v1/projects
 *   POST   /api/v1/projects
 *   PATCH  /api/v1/projects/:id
 *   DELETE /api/v1/projects/:id
 *   GET    /api/v1/projects/:id/tokens
 *   POST   /api/v1/projects/:id/tokens
 *   POST   /api/v1/projects/:id/tokens/:tokenId/revoke
 */

export type ProjectEnv = 'production' | 'staging' | 'development'

export type Project = {
  id: string
  name: string
  env: ProjectEnv
  createdAt: string
  updatedAt: string
}

export type ProjectToken = {
  id: string
  projectId: string
  /** 掩码展示，如 afm_****abcd；库存仅 hash，永不回传明文 */
  tokenMasked: string
  name: string
  enabled: boolean
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export type CreateProjectInput = {
  id: string
  name: string
  env: ProjectEnv
}

export type UpdateProjectInput = {
  name?: string
  env?: ProjectEnv
}

export type CreateTokenInput = {
  name?: string
}

/** 生成接口仅此一次返回明文 tokenPlain */
export type CreateTokenResult = {
  token: ProjectToken
  tokenPlain: string
}

/** 后端未就绪前走本地 mock；接真路由后改为 false */
export const USE_PROJECTS_MOCK = true

const ENV_LABEL: Record<ProjectEnv, string> = {
  production: '生产',
  staging: '预发',
  development: '开发',
}

export function projectEnvLabel(env: ProjectEnv): string {
  return ENV_LABEL[env] ?? env
}

// ── Mock store（进程内；刷新页面会重置）──────────────────────────────────────

type MockTokenRow = ProjectToken & { /** mock only: 明文，仅 create 时返回 */ _plain?: string }

const mockProjects: Project[] = [
  {
    id: 'demo',
    name: 'demo',
    env: 'production',
    createdAt: '2026-06-01T08:00:00+08:00',
    updatedAt: '2026-06-01T08:00:00+08:00',
  },
]

const mockTokens: MockTokenRow[] = [
  {
    id: 'tok_demo_1',
    projectId: 'demo',
    tokenMasked: 'afm_****demo',
    name: '本地联调',
    enabled: true,
    createdAt: '2026-06-01T08:00:00+08:00',
    lastUsedAt: null,
    revokedAt: null,
    _plain: 'afm-demo-token',
  },
]

function nowIso(): string {
  return new Date().toISOString()
}

function maskToken(plain: string): string {
  if (plain.length <= 8) return `${plain.slice(0, 2)}****`
  return `${plain.slice(0, 4)}****${plain.slice(-4)}`
}

function randomPlain(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `afm_${hex}`
}

function delay(ms = 120): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${response.status}${text ? `: ${text}` : ''}`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  if (USE_PROJECTS_MOCK) {
    await delay()
    return mockProjects.map((p) => ({ ...p }))
  }
  // TODO(backend): GET /api/v1/projects
  return request<Project[]>('/api/v1/projects')
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (USE_PROJECTS_MOCK) {
    await delay()
    if (mockProjects.some((p) => p.id === input.id)) {
      throw new Error(`项目 id 已存在: ${input.id}`)
    }
    const row: Project = {
      id: input.id.trim(),
      name: input.name.trim(),
      env: input.env,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    mockProjects.push(row)
    return { ...row }
  }
  // TODO(backend): POST /api/v1/projects  body: { id, name, env }
  return request<Project>('/api/v1/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  if (USE_PROJECTS_MOCK) {
    await delay()
    const row = mockProjects.find((p) => p.id === id)
    if (!row) throw new Error(`项目不存在: ${id}`)
    if (input.name !== undefined) row.name = input.name.trim()
    if (input.env !== undefined) row.env = input.env
    row.updatedAt = nowIso()
    return { ...row }
  }
  // TODO(backend): PATCH /api/v1/projects/:id  body: { name?, env? }
  return request<Project>(`/api/v1/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteProject(id: string): Promise<void> {
  if (USE_PROJECTS_MOCK) {
    await delay()
    const idx = mockProjects.findIndex((p) => p.id === id)
    if (idx < 0) throw new Error(`项目不存在: ${id}`)
    mockProjects.splice(idx, 1)
    for (let i = mockTokens.length - 1; i >= 0; i -= 1) {
      if (mockTokens[i]?.projectId === id) mockTokens.splice(i, 1)
    }
    return
  }
  // TODO(backend): DELETE /api/v1/projects/:id
  await request<void>(`/api/v1/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function listProjectTokens(projectId: string): Promise<ProjectToken[]> {
  if (USE_PROJECTS_MOCK) {
    await delay()
    return mockTokens
      .filter((t) => t.projectId === projectId)
      .map(({ _plain: _ignored, ...rest }) => ({ ...rest }))
  }
  // TODO(backend): GET /api/v1/projects/:id/tokens
  return request<ProjectToken[]>(`/api/v1/projects/${encodeURIComponent(projectId)}/tokens`)
}

export async function createProjectToken(
  projectId: string,
  input: CreateTokenInput = {},
): Promise<CreateTokenResult> {
  if (USE_PROJECTS_MOCK) {
    await delay()
    if (!mockProjects.some((p) => p.id === projectId)) {
      throw new Error(`项目不存在: ${projectId}`)
    }
    const plain = randomPlain()
    const row: MockTokenRow = {
      id: `tok_${Date.now().toString(36)}`,
      projectId,
      tokenMasked: maskToken(plain),
      name: (input.name?.trim() || '默认 Token'),
      enabled: true,
      createdAt: nowIso(),
      lastUsedAt: null,
      revokedAt: null,
      _plain: plain,
    }
    mockTokens.unshift(row)
    const { _plain: _ignored, ...token } = row
    return { token: { ...token }, tokenPlain: plain }
  }
  // TODO(backend): POST /api/v1/projects/:id/tokens  body: { name? }
  // 响应约定：{ token: ProjectToken, tokenPlain: string } —— tokenPlain 仅此响应出现
  return request<CreateTokenResult>(`/api/v1/projects/${encodeURIComponent(projectId)}/tokens`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function revokeProjectToken(projectId: string, tokenId: string): Promise<ProjectToken> {
  if (USE_PROJECTS_MOCK) {
    await delay()
    const row = mockTokens.find((t) => t.projectId === projectId && t.id === tokenId)
    if (!row) throw new Error(`Token 不存在: ${tokenId}`)
    row.enabled = false
    row.revokedAt = nowIso()
    const { _plain: _ignored, ...rest } = row
    return { ...rest }
  }
  // TODO(backend): POST /api/v1/projects/:id/tokens/:tokenId/revoke
  return request<ProjectToken>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/tokens/${encodeURIComponent(tokenId)}/revoke`,
    { method: 'POST' },
  )
}
