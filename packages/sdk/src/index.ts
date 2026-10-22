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
  installNavigationCollector,
  installNetworkCollector,
  installWebVitalCollector,
  normalizeRoute,
  readPageUrl,
  readRoute,
  type AutoVital,
  type ErrorKind,
} from './collector.js'
import { sendPayload } from './transport.js'

export {
  collectResources,
  computeStackHash,
  installErrorCollector,
  installNavigationCollector,
  installNetworkCollector,
  installWebVitalCollector,
  normalizeRoute,
  readPageUrl,
  readRoute,
} from './collector.js'

export interface AfmInitOptions {
  projectId: string
  env: RuntimeEnv
  endpoint?: string
  /** Project token. Sent as a header for fetch and in the body for beacon delivery. */
  token?: string
  /**
   * Optional build version. Leave unset when the project has no version.
   * When unset, the SDK reads `<meta name="afm-release">` or `window.__AFM_RELEASE__`.
   */
  release?: string
  sdkVersion?: string
  defaultRoute?: string
  defaultPageUrl?: string
  userIdHash?: string
  sessionId?: string
  sampleRate?: number
  /** When true (default), collect page views, Web Vitals, errors, and fetch / XHR timings. */
  autoTrack?: boolean
}

export interface AfmTrackPageViewOptions {
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

export interface AfmTrackWebVitalOptions {
  metricName: MetricName
  value: number
  route?: string
  pageUrl?: string
  occurredAt?: string
  attributes?: Record<string, unknown>
}

export interface AfmTrackErrorOptions {
  name: string
  message: string
  stack?: string
  stackHash?: string
  route?: string
  kind?: ErrorKind
  attributes?: Record<string, unknown>
}

export interface AfmTrackApiTimingOptions {
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

export interface AfmTrackResourceOptions {
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
  token: string
  release: string
  sdkVersion: string
  defaultRoute: string
  defaultPageUrl: string
  userIdHash: string
  sessionId: string
  sampleRate: number
  sampled: boolean
}

const DEFAULT_ENDPOINT = 'http://127.0.0.1:3001/ingest'
const DEFAULT_SDK_VERSION = '0.0.1'

let config: SDKConfig | null = null

/** Auto-collected events buffered here until flush. */
interface AutoBuffer {
  errors: JsErrorEvent[]
  apiTimings: ApiTimingEvent[]
  resources: ResourceTimingEvent[]
}

let buffer: AutoBuffer = { errors: [], apiTimings: [], resources: [] }
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushScheduled = false
let collectorCleanup: (() => void) | null = null
let vitalCollector: ReturnType<typeof installWebVitalCollector> | null = null
let lastAutoPageUrl = ''
let resourcesCollected = false

const FLUSH_DELAY_MS = 2000
const MAX_BUFFER_PER_KIND = 50

function getNowIso(): string {
  return new Date().toISOString()
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

const RELEASE_PLACEHOLDER = '__AFM_RELEASE__'

function resolveRelease(explicit?: string): string {
  if (explicit !== undefined) {
    return explicit.trim()
  }

  return detectRelease()
}

function detectRelease(): string {
  const fromMeta = readMetaRelease()
  if (fromMeta) {
    return fromMeta
  }

  if (typeof window !== 'undefined') {
    const value = (window as Window & { __AFM_RELEASE__?: unknown }).__AFM_RELEASE__
    return normalizeRelease(value)
  }

  return ''
}

function readMetaRelease(): string {
  if (typeof document === 'undefined') {
    return ''
  }

  const content = document.querySelector('meta[name="afm-release"]')?.getAttribute('content')
  return normalizeRelease(content)
}

function normalizeRelease(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed === RELEASE_PLACEHOLDER) {
    return ''
  }

  return trimmed
}

function getDefaultRoute(): string {
  if (typeof window === 'undefined') {
    return '/'
  }

  return readRoute()
}

function getDefaultPageUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost/'
  }

  return window.location.href
}

const SESSION_KEY = 'afm.sessionId'
const USER_KEY = 'afm.userId'
const SAMPLED_KEY = 'afm.sampled'

function browserStorage(kind: 'session' | 'local'): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return undefined
  }
}

function persistId(kind: 'session' | 'local', key: string, explicit: string | undefined, prefix: string): string {
  if (explicit) {
    return explicit
  }
  const storage = browserStorage(kind)
  try {
    const existing = storage?.getItem(key)
    if (existing) {
      return existing
    }
    const created = randomId(prefix)
    storage?.setItem(key, created)
    return created
  } catch {
    return randomId(prefix)
  }
}

function decideSampled(rate: number): boolean {
  if (rate >= 1) {
    return true
  }
  if (rate <= 0) {
    return false
  }
  const storage = browserStorage('session')
  try {
    const stored = storage?.getItem(SAMPLED_KEY)
    if (stored === '1' || stored === '0') {
      return stored === '1'
    }
    const sampled = Math.random() < rate
    storage?.setItem(SAMPLED_KEY, sampled ? '1' : '0')
    return sampled
  } catch {
    return Math.random() < rate
  }
}

function getNetworkType(): string {
  if (typeof navigator === 'undefined') {
    return 'unknown'
  }
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string; type?: string } }).connection
  return connection?.effectiveType || connection?.type || 'unknown'
}

function getBrowser(): string {
  if (typeof navigator === 'undefined') {
    return 'unknown'
  }
  const ua = navigator.userAgent
  if (/edg\//i.test(ua)) return 'Edge'
  if (/opr\//i.test(ua) || /opera/i.test(ua)) return 'Opera'
  if (/chrome|crios/i.test(ua)) return 'Chrome'
  if (/firefox|fxios/i.test(ua)) return 'Firefox'
  if (/safari/i.test(ua)) return 'Safari'
  return 'unknown'
}

function getOs(): string {
  if (typeof navigator === 'undefined') {
    return 'unknown'
  }
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'Android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS'
  if (/mac os/i.test(ua)) return 'macOS'
  if (/windows/i.test(ua)) return 'Windows'
  if (/linux/i.test(ua)) return 'Linux'
  return 'unknown'
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
    throw new Error('AFM SDK has not been initialized. Call afmInit() first.')
  }

  return {
    release: config.release,
    sdkVersion: config.sdkVersion,
    sessionId: config.sessionId,
    userIdHash: config.userIdHash,
    deviceType: getDeviceType(),
    os: getOs(),
    browser: getBrowser(),
    networkType: getNetworkType(),
    sampleRate: config.sampleRate,
    attributes: overrides,
  }
}

function buildPayload(options: AfmTrackPageViewOptions & { recordPageView?: boolean }): IngestPayload {
  if (!config) {
    throw new Error('AFM SDK has not been initialized. Call afmInit() first.')
  }

  return {
    projectId: config.projectId,
    token: config.token || undefined,
    env: config.env,
    route: options.route ?? config.defaultRoute,
    pageUrl: options.pageUrl ?? config.defaultPageUrl,
    occurredAt: options.occurredAt ?? getNowIso(),
    recordPageView: options.recordPageView ?? false,
    metrics: options.metrics,
    context: getContext(options.attributes),
  }
}

function buildVitalPayload(options: AfmTrackWebVitalOptions): IngestPayload {
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

export function afmInit(options: AfmInitOptions): void {
  config = {
    projectId: options.projectId,
    env: options.env,
    endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
    token: options.token ?? '',
    release: resolveRelease(options.release),
    sdkVersion: options.sdkVersion ?? DEFAULT_SDK_VERSION,
    defaultRoute: options.defaultRoute ?? getDefaultRoute(),
    defaultPageUrl: options.defaultPageUrl ?? getDefaultPageUrl(),
    userIdHash: persistId('local', USER_KEY, options.userIdHash, 'user'),
    sessionId: persistId('session', SESSION_KEY, options.sessionId, 'session'),
    sampleRate: options.sampleRate ?? 1,
    sampled: decideSampled(options.sampleRate ?? 1),
  }

  // tear down any previous auto-collectors (e.g. HMR in dev)
  collectorCleanup?.()
  collectorCleanup = null
  vitalCollector = null
  lastAutoPageUrl = ''
  resourcesCollected = false

  if ((options.autoTrack ?? true) && config.sampled) {
    installAutoCollectors()
  }
}

function installAutoCollectors(): void {
  if (typeof window === 'undefined' || !config) {
    return
  }

  const endpoint = config.endpoint
  const endpointUrl = new URL(endpoint, window.location.href).href
  const errorCollector = installErrorCollector((event) => {
    pushBuffer('errors', event)
  })
  const networkCollector = installNetworkCollector((event) => {
    pushBuffer('apiTimings', event)
  }, {
    ignore: (url) => {
      const requestUrl = new URL(url, window.location.href).href
      return requestUrl === endpointUrl || requestUrl.startsWith(`${endpointUrl}?`)
    },
  })
  vitalCollector = installWebVitalCollector((vital) => {
    void reportAutoVital(vital)
  })
  const navigationCollector = installNavigationCollector(() => {
    reportAutoPage()
  })

  const onHide = () => {
    vitalCollector?.finalize()
    collectAutoResources()
    void afmFlush({ beacon: true })
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      onHide()
    }
  }

  window.addEventListener('pagehide', onHide)
  document.addEventListener('visibilitychange', onVisibility)

  collectorCleanup = () => {
    errorCollector.cleanup()
    networkCollector.cleanup()
    vitalCollector?.cleanup()
    vitalCollector = null
    navigationCollector.cleanup()
    window.removeEventListener('pagehide', onHide)
    document.removeEventListener('visibilitychange', onVisibility)
  }

  reportAutoPage()
}

function reportAutoPage(): void {
  if (!config || typeof window === 'undefined') {
    return
  }

  const route = readRoute()
  const pageUrl = readPageUrl()
  config.defaultRoute = route
  config.defaultPageUrl = pageUrl
  if (pageUrl === lastAutoPageUrl) {
    return
  }
  lastAutoPageUrl = pageUrl

  const payload = buildPayload({ route, pageUrl, recordPageView: true })
  void sendPayload(payload, { endpoint: config.endpoint }).catch(() => {
    // Page-view telemetry is best-effort.
  })
}

async function reportAutoVital(vital: AutoVital): Promise<void> {
  if (!config) {
    return
  }

  const metricKey = vital.metricName.toLowerCase() as keyof NonNullable<AfmTrackPageViewOptions['metrics']>
  const payload = buildPayload({
    route: vital.route,
    pageUrl: vital.pageUrl,
    recordPageView: false,
    metrics: { [metricKey]: vital.value },
  })

  try {
    await sendPayload(payload, { endpoint: config.endpoint })
  } catch {
    // Vital telemetry is best-effort.
  }
}

function collectAutoResources(): void {
  if (!config || resourcesCollected) {
    return
  }
  resourcesCollected = true
  collectResources((event) => {
    pushBuffer('resources', event)
  }, {
    route: readRoute(),
    ingestEndpoint: config.endpoint,
  })
}

function pushBuffer(kind: 'errors', event: JsErrorEvent): void
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
  if (flushTimer || flushScheduled || !config) {
    return
  }
  // prefer idle callback; fall back to a timer
  if (typeof window !== 'undefined' && typeof (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback === 'function') {
    flushScheduled = true
    ;(window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(() => {
      flushScheduled = false
      void afmFlush()
    })
    return
  }
  flushTimer = setTimeout(() => {
    void afmFlush()
  }, FLUSH_DELAY_MS)
}

/** Send all buffered events as a single merged payload, then clear the buffer. */
export async function afmFlush(options?: { beacon?: boolean }): Promise<void> {
  if (!config || !config.sampled) {
    return
  }
  flushTimer = null
  flushScheduled = false
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
    await sendPayload(payload, { endpoint: config.endpoint, beacon: options?.beacon })
  } catch {
    // auto-collected telemetry is best-effort; swallow so app code is unaffected
  }
}

function requireReporting(): SDKConfig | null {
  if (!config) {
    throw new Error('AFM SDK has not been initialized. Call afmInit() first.')
  }
  return config.sampled ? config : null
}

export async function afmTrackPageView(options: AfmTrackPageViewOptions = {}): Promise<void> {
  const current = requireReporting()
  if (!current) {
    return
  }

  const payload = buildPayload({
    ...options,
    recordPageView: true,
    metrics: options.metrics,
  })

  await sendPayload(payload, { endpoint: current.endpoint })
}

export async function afmTrackWebVital(options: AfmTrackWebVitalOptions): Promise<void> {
  const current = requireReporting()
  if (!current) {
    return
  }

  const payload = buildVitalPayload(options)
  await sendPayload(payload, { endpoint: current.endpoint })
}

/**
 * Manually report a JS error. Auto-collected errors (when `autoTrack` is on)
 * are buffered and flushed; this is for explicit reporting or when auto-track
 * is off. `stackHash` defaults to a deterministic hash of `stack`.
 */
export async function afmTrackError(options: AfmTrackErrorOptions): Promise<void> {
  const current = requireReporting()
  if (!current) {
    return
  }

  const payload = buildPayload({ route: options.route, attributes: options.attributes })
  payload.errors = [
    {
      name: options.name,
      message: options.message,
      stack: options.stack,
      stackHash: options.stackHash ?? computeStackHash(options.stack ?? `${options.name}:${options.message}`),
      route: options.route,
      errorType: options.kind,
    },
  ]
  await sendPayload(payload, { endpoint: current.endpoint })
}

/** Manually report a single API/fetch timing sample. */
export async function afmTrackApiTiming(options: AfmTrackApiTimingOptions): Promise<void> {
  const current = requireReporting()
  if (!current) {
    return
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
  await sendPayload(payload, { endpoint: current.endpoint })
}

/** Manually report a single resource timing sample. */
export async function afmTrackResource(options: AfmTrackResourceOptions): Promise<void> {
  const current = requireReporting()
  if (!current) {
    return
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
  await sendPayload(payload, { endpoint: current.endpoint })
}

const AFM = {
  afmInit,
  afmTrackPageView,
  afmTrackWebVital,
  afmTrackError,
  afmTrackApiTiming,
  afmTrackResource,
  afmFlush,
}

export default AFM
