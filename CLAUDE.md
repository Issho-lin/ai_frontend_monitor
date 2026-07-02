# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when operating in this repository.

## Project Overview

AI Frontend Monitor is an AI-assisted frontend performance monitoring platform with a monorepo structure:

```
ai-frontend-monitor/
├── apps/
│   ├── console/          # Vue 3 + Element Plus admin dashboard (Vite + Vue Router + Pinia)
│   └── api/              # NestJS backend (scaffolded, not yet implemented)
├── packages/             # Shared packages (future)
├── docs/                 # PRD, architecture, tech selection
└── pnpm-workspace.yaml
```

**Current state**: Console dashboard is a high-fidelity prototype driven entirely by `apps/console/src/mock/data.ts`. The API (`apps/api/`) is scaffolded with NestJS but has no real data pipeline. All pages render mock data.

## Key Commands

```bash
pnpm install                          # Install dependencies
pnpm dev:console                      # Start console Vite dev server (port 5173)
pnpm dev:api                          # Start NestJS API dev server
pnpm build:console                    # Build console for production
pnpm build                            # Build all packages (recursive)
pnpm lint                             # Lint all packages
pnpm typecheck                        # Type-check all packages
```

## Console App Structure (`apps/console/`)

### Tech Stack
- **Framework**: Vue 3 (Composition API, `<script setup>`)
- **UI**: Element Plus + Element Plus Icons
- **Router**: Vue Router 5 (lazy-loaded route records)
- **State**: Pinia (filters store only)
- **Charts**: ECharts via vue-echarts
- **Styling**: Scoped CSS with CSS custom properties from `@/assets/main.css`
- **Build**: Vite 8 + Vue plugin + unplugin-auto-import + unplugin-vue-components

### Architecture Patterns

**Layout**: `DefaultLayout.vue` — dark sidebar (220px/64px collapsible) + top bar (title, env tag, search, notifications, avatar) + filter sub-bar (project, env, time range, version, device, region, refresh) + router-view main area.

**Routing**: `src/router/index.ts` — all 14 route records under a single `DefaultLayout` wrapper with children. Routes use lazy-loaded `() => import()`. `router.afterEach` sets `document.title`. 404 fallback at `/:pathMatch(.*)*`.

**State**: `src/stores/filters.ts` — Pinia store for global filter selections (project, env, timeRange, version, device, region). Uses `storeToRefs` in layout.

**Mock data**: `src/mock/data.ts` — single source of truth for all mock data (~1048 lines). Exports typed interfaces (`PageRow`, `AlertRow`, `TaskRow`, `ApiRow`, `ErrorGroup`, `AgentReport`, `ReleaseRow`, `ReleaseDiff`, etc.) and factory functions (`getReportByAlert`, `getReportForRoute`, `getReleaseDiff`). All views import from this file.

**Components**:
- `MetricCard` — single metric card with value, delta, and good/bad indicator
- `EChart` — thin wrapper around VChart (vue-echarts)
- `DiagnosisPanel` — Agent diagnostic report renderer with 3 variants: `full` (alert/page detail), `reference` (compact link-back from task detail), `empty` state

**Views** (14 total):
| View | Route | Purpose |
|------|-------|---------|
| Overview | `/overview` | Health strip, 6 metric cards, trend chart, Agent summary, TOP problems |
| Pages | `/pages` | Page performance table sorted by pass rate |
| Page Detail | `/pages/:route` | Per-page details with resource waterfall + related APIs + Agent diagnosis sidebar |
| Errors | `/errors` | JS/Promise/Resource error groups with stack info |
| APIs | `/apis` | API performance table (P50/P95, error rate, timeout rate, QPS) |
| Releases | `/releases` | Release timeline table with perf change indicators |
| Release Detail | `/releases/:version` | Before/after metric diff, resource diff, error diff, page diff, alert list |
| Alerts | `/alerts` | Alert table with severity, status, convergence info |
| Alert Detail | `/alerts/:id` | Alert summary, trigger rule, timeline, Agent report, collaboration actions |
| Tasks | `/tasks` | Governance task table with status machine |
| Task Detail | `/tasks/:id` | Task details, acceptance criteria with verification chart, repair records |
| Settings | `/settings` | Tabbed settings: sampling, normalization, desensitize, alert rules, notification channels, release data, members |
| Onboarding | `/onboarding` | 9-step SDK integration verification checklist with SDK snippet |
| NotFound | `/:pathMatch(.*)*` | 404 page |

### Adding a New View

1. Create `src/views/NewView.vue` using `<script setup lang="ts">` and scoped CSS
2. Add route record to `src/router/index.ts` inside the `children` array (with `meta: { title: '...' }`)
3. Add nav item to `src/layouts/DefaultLayout.vue` `navItems` array
4. Import mock data from `@/mock/data` as needed
5. Use `.afm-page`, `.afm-card`, `.afm-section-title`, `.afm-hint`, `.afm-muted`, `.afm-link` utility classes consistently

### CSS Conventions
- CSS custom properties defined in `@/assets/main.css`: `--afm-primary`, `--afm-success`, `--afm-warn`, `--afm-danger`, `--afm-border`, `--afm-bg`, `--afm-text`, `--afm-text-muted`, `--afm-panel-soft`, `--afm-motion-fast`, `--afm-motion-base`, `--afm-ease`
- Layout classes: `.afm-page` (page container), `.afm-card` (card container), `.grid-2` (2-col CSS grid), `.section` (margin-top: 16px)
- Typography: `.afm-section-title` (15px bold + hint span), `.afm-hint` (muted small text), `.afm-muted` (muted color), `.afm-link` (primary color), `.mono` (monospace font)
- All CSS is scoped; use `:deep()` selector for Element Plus component overrides

## Mock Data Patterns

When creating mock data for new features:
- Add interfaces and data arrays to `src/mock/data.ts`
- Follow the naming convention: `rows` for table data (e.g., `pageRows`, `alertRows`, `taskRows`)
- Use `dayjs()` for relative timestamps
- `buildTimeSeries(base, jitter)` function for generating 24h trend data

## Working on the Console

- The console is currently **fully prototype** — no real API calls exist
- `apps/api/` is a bare NestJS scaffold — the controller only has a default ping endpoint
- When adding real API integration, create typed service modules in the console app
- The `components.d.ts` and `auto-imports.d.ts` files are generated by unplugin; don't edit them manually
