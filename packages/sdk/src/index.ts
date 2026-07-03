import type {
  ApiTimingEvent,
  EventContext,
  IngestPayload,
  JsErrorEvent,
  MetricName,
  ResourceTimingEvent,
  RuntimeEnv,
} from '@ai-frontend-monitor/schema'
import {
  collectResources,
  computeStackHash,
  installErrorCollector,
  installNetworkCollector,
  normalizeRoute,
  type ErrorKind,
} from './collector.js'
import { sendPayload } from './transport.js'

export {
  collectResources,
  computeStackHash,
  installErrorCollector,
  installNetworkCollector,
  normalizeRoute,
} from './collector.js'

export interface InitOptions {
  projectId: string
  env: RuntimeEnv
  endpoint?: string
  release: string
  sdkVersion?: string
  defaultRoute?: string
  defaultPageUrl?: string
  userIdHash?: string
  sessionId?: string
  sampleRate?: number
  /** When true (default), auto-install error / fetch / XHR collectors on init. */
  autoTrack?: boolean
}

export interface TrackPageViewOptions {
  route?: string
  pageUrl?: string
  occurredAt?: string
  metrics?: {
    fcp?: number
    lcp?: number
    inp?: number
    cls?: number
    ttfb?: number
  }
  attributes?: Record<string, unknown>
}

export interface TrackWebVitalOptions {
  metricName: MetricName
  value: number
  route?: string
  pageUrl?: string
  occurredAt?: string
  attributes?: Record<string, unknown>
}

export interface TrackErrorOptions {
  name: string
  message: string
  stack?: string
  stackHash?: string
  route?: string
  kind?: ErrorKind
  attributes?: Record<string, unknown>
}

export interface TrackApiTimingOptions {
  apiRoute: string
  method: string
  url?: string
  statusCode: number
  duration: number
  isTimeout?: boolean
  traceId?: string
  route?: string
  attributes?: Record<string, unknown>
}

export interface TrackResourceOptions {
  url: string
  initiatorType: string
  size: number
  duration: number
  failed?: boolean
  route?: string
  attributes?: Record<string, unknown>
}

interface SDKConfig {
  projectId: string
  env: RuntimeEnv
  endpoint: string
  release: string
  sdkVersion: string
  defaultRoute: string
  defaultPageUrl: string
  userIdHash: string
  sessionId: string
  sampleRate: number
}

const DEFAULT_ENDPOINT = 'http://127.0.0.1:3001/ingest'
const DEFAULT_SDK_VERSION = '0.0.1'

let config: SDKConfig | null = null

/** Auto-collected events buffered here until flush. */
interface AutoBuffer {
  errors: Array<JsErrorEvent & { kind: ErrorKind }>
  apiTimings: ApiTimingEvent[]
  resources: ResourceTimingEvent[]
}

let buffer: AutoBuffer = { errors: [], apiTimings: [], resources: [] }
let flushTimer: ReturnType<typeof setTimeout> | null = null
let collectorCleanup: (() => void) | null = null

const FLUSH_DELAY_MS = 2000
const MAX_BUFFER_PER_KIND = 50

function getNowIso(): string {
  return new Date().toISOString()
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function getDefaultRoute(): string {
  if (typeof window === 'undefined') {
    return '/'
  }

  return window.location.pathname || '/'
}

function getDefaultPageUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost/'
  }

  return window.location.href
}

function getDeviceType(): EventContext['deviceType'] {
  if (typeof navigator === 'undefined') {
    return 'unknown'
  }

  const ua = navigator.userAgent.toLowerCase()
  if (/ipad|tablet/.test(ua)) {
    return 'tablet'
  }
  if (/mobile|android|iphone/.test(ua)) {
    return 'mobile'
  }
  return 'desktop'
}

function getContext(overrides?: Record<string, unknown>): EventContext {
  if (!config) {
    throw new Error('AFM SDK has not been initialized. Call init() first.')
  }

  return {
    release: config.release,
    sdkVersion: config.sdkVersion,
    sessionId: config.sessionId,
    userIdHash: config.userIdHash,
    deviceType: getDeviceType(),
    os: typeof navigator === 'undefined' ? 'unknown' : navigator.platform || 'unknown',
    browser: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    networkType: 'unknown',
    sampleRate: config.sampleRate,
    attributes: overrides,
  }
}

function buildPayload(options: TrackPageViewOptions): IngestPayload {
  if (!config) {
    throw new Error('AFM SDK has not been initialized. Call init() first.')
  }

  return {
    projectId: config.projectId,
    env: config.env,
    route: options.route ?? config.defaultRoute,
    pageUrl: options.pageUrl ?? config.defaultPageUrl,
    occurredAt: options.occurredAt ?? getNowIso(),
    metrics: options.metrics,
    context: getContext(options.attributes),
  }
}

function buildVitalPayload(options: TrackWebVitalOptions): IngestPayload {
  return buildPayload({
    route: options.route,
    pageUrl: options.pageUrl,
    occurredAt: options.occurredAt,
    metrics: {
      [options.metricName.toLowerCase()]: options.value,
    },
    attributes: options.attributes,
  })
}

export function init(options: InitOptions): void {
  config = {
    projectId: options.projectId,
    env: options.env,
    endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
    release: options.release,
    sdkVersion: options.sdkVersion ?? DEFAULT_SDK_VERSION,
    defaultRoute: options.defaultRoute ?? getDefaultRoute(),
    defaultPageUrl: options.defaultPageUrl ?? getDefaultPageUrl(),
    userIdHash: options.userIdHash ?? randomId('user'),
    sessionId: options.sessionId ?? randomId('session'),
    sampleRate: options.sampleRate ?? 1,
  }

  // tear down any previous auto-collectors (e.g. HMR in dev)
  collectorCleanup?.()
  collectorCleanup = null

  if (options.autoTrack ?? true) {
    installAutoCollectors()
  }
}

function installAutoCollectors(): void {
  if (typeof window === 'undefined') {
    return
  }

  const errorCollector = installErrorCollector((event) => {
    pushBuffer('errors', event)
  })
  const networkCollector = installNetworkCollector((event) => {
    pushBuffer('apiTimings', event)
  })

  collectorCleanup = () => {
    errorCollector.cleanup()
    networkCollector.cleanup()
  }

  // flush on page hide (best-effort via sendBeacon)
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', scheduleFlush)
    window.addEventListener('beforeunload', scheduleFlush)
  }
}

function pushBuffer(kind: 'errors', event: JsErrorEvent & { kind: ErrorKind }): void
function pushBuffer(kind: 'apiTimings', event: ApiTimingEvent): void
function pushBuffer(kind: 'resources', event: ResourceTimingEvent): void
function pushBuffer(kind: keyof AutoBuffer, event: unknown): void {
  const queue = buffer[kind] as unknown[]
  if (queue.length >= MAX_BUFFER_PER_KIND) {
    return // drop overflow to bound memory
  }
  queue.push(event)
  scheduleFlush()
}

function scheduleFlush(): void {
  if (flushTimer || !config) {
    return
  }
  // prefer idle callback; fall back to a timer
  if (typeof window !== 'undefined' && typeof (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback === 'function') {
    ;(window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(() => {
      void flush()
    })
    return
  }
  flushTimer = setTimeout(() => {
    void flush()
  }, FLUSH_DELAY_MS)
}

/** Send all buffered events as a single merged payload, then clear the buffer. */
export async function flush(): Promise<void> {
  if (!config) {
    return
  }
  flushTimer = null
  const { errors, apiTimings, resources } = buffer
  if (errors.length === 0 && apiTimings.length === 0 && resources.length === 0) {
    return
  }
  buffer = { errors: [], apiTimings: [], resources: [] }

  const payload = buildPayload({})
  payload.errors = errors.length ? errors : undefined
  payload.apiTimings = apiTimings.length ? apiTimings : undefined
  payload.resources = resources.length ? resources : undefined

  try {
    await sendPayload(payload, { endpoint: config.endpoint })
  } catch {
    // auto-collected telemetry is best-effort; swallow so app code is unaffected
  }
}

export async function trackPageView(options: TrackPageViewOptions = {}): Promise<void> {
  if (!config) {
    throw new Error('AFM SDK has not been initialized. Call init() first.')
  }

  const payload = buildPayload({
    ...options,
    metrics: {
      fcp: options.metrics?.fcp ?? 1200,
      lcp: options.metrics?.lcp ?? 2400,
      inp: options.metrics?.inp,
      cls: options.metrics?.cls,
      ttfb: options.metrics?.ttfb,
    },
  })

  await sendPayload(payload, { endpoint: config.endpoint })
}

export async function trackWebVital(options: TrackWebVitalOptions): Promise<void> {
  if (!config) {
    throw new Error('AFM SDK has not been initialized. Call init() first.')
  }

  const payload = buildVitalPayload(options)
  await sendPayload(payload, { endpoint: config.endpoint })
}

/**
 * Manually report a JS error. Auto-collected errors (when `autoTrack` is on)
 * are buffered and flushed; this is for explicit reporting or when auto-track
 * is off. `stackHash` defaults to a deterministic hash of `stack`.
 */
export async function trackError(options: TrackErrorOptions): Promise<void> {
  if (!config) {
    throw new Error('AFM SDK has not been initialized. Call init() first.')
  }

  const payload = buildPayload({ route: options.route, attributes: options.attributes })
  payload.errors = [
    {
      name: options.name,
      message: options.message,
      stack: options.stack,
      stackHash: options.stackHash ?? computeStackHash(options.stack ?? `${options.name}:${options.message}`),
      route: options.route,
    },
  ]
  await sendPayload(payload, { endpoint: config.endpoint })
}

/** Manually report a single API/fetch timing sample. */
export async function trackApiTiming(options: TrackApiTimingOptions): Promise<void> {
  if (!config) {
    throw new Error('AFM SDK has not been initialized. Call init() first.')
  }

  const payload = buildPayload({ route: options.route, attributes: options.attributes })
  payload.apiTimings = [
    {
      apiRoute: options.apiRoute,
      method: options.method,
      url: options.url,
      statusCode: options.statusCode,
      duration: options.duration,
      isTimeout: options.isTimeout,
      traceId: options.traceId,
    },
  ]
  await sendPayload(payload, { endpoint: config.endpoint })
}

/** Manually report a single resource timing sample. */
export async function trackResource(options: TrackResourceOptions): Promise<void> {
  if (!config) {
    throw new Error('AFM SDK has not been initialized. Call init() first.')
  }

  const payload = buildPayload({ route: options.route, attributes: options.attributes })
  payload.resources = [
    {
      url: options.url,
      initiatorType: options.initiatorType,
      size: options.size,
      duration: options.duration,
      failed: options.failed,
      route: options.route,
    },
  ]
  await sendPayload(payload, { endpoint: config.endpoint })
}

const AFM = {
  init,
  trackPageView,
  trackWebVital,
  trackError,
  trackApiTiming,
  trackResource,
  flush,
}

export default AFM
