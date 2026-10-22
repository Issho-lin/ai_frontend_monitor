/**
 * Auto-collectors + route normalization for the AFM SDK.
 *
 * Each installer takes a `push` callback that the host wires to its event
 * buffer. Collectors are no-ops outside a browser (no `window`) so the SDK
 * stays safe to import in SSR / Node contexts.
 */
import type {
  ApiTimingEvent,
  ErrorKind,
  JsErrorEvent,
  ResourceTimingEvent,
} from '@ai-frontend-monitor/schema'

/**
 * Collapse a URL or path into a stable route key:
 *  - strip the query string and hash
 *  - replace numeric / hex-id path segments with `:id`
 *  - lowercase the host
 *
 * Used for both page routes and API routes so the backend never re-normalizes.
 *   "/orders/12345?tab=items"  -> "/orders/:id"
 *   "/users/507f1f77bcf86cd7"   -> "/users/:id"
 *   "/api/v2/list"             -> "/api/v2/list"
 */
export function normalizeRoute(input: string): string {
  if (!input) {
    return ''
  }

  let path: string
  try {
    const url = new URL(input, typeof location !== 'undefined' ? location.origin : 'http://localhost')
    path = url.pathname
  } catch {
    // not a URL — treat as a raw path
    path = input.split('?')[0].split('#')[0]
  }

  if (!path || path === '/') {
    return '/'
  }

  return path
    .split('/')
    .map((segment) => {
      if (segment === '') {
        return ''
      }
      // numeric id
      if (/^\d+$/.test(segment)) {
        return ':id'
      }
      // hex-ish id (>= 8 chars, all 0-9a-f)
      if (segment.length >= 8 && /^[0-9a-f]+$/.test(segment)) {
        return ':id'
      }
      // uuid
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
        return ':id'
      }
      return segment
    })
    .join('/')
}

/**
 * Deterministic non-crypto hash of a stack string.
 * Crypto.subtle.digest is async and unavailable in non-secure contexts, but
 * stackHash only needs determinism for grouping, so a fast sync hash suffices.
 */
export function computeStackHash(stack: string): string {
  const trimmed = stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 3) // top 3 frames — enough to group, ignores deep library noise
    .join('\n')

  let hash = 5381
  for (let i = 0; i < trimmed.length; i++) {
    hash = ((hash << 5) + hash + trimmed.charCodeAt(i)) | 0
  }
  // unsigned, base36
  return (hash >>> 0).toString(36)
}

type PushFn<T> = (event: T) => void

export type { ErrorKind } from '@ai-frontend-monitor/schema'

interface InstalledCollectors {
  cleanup: () => void
}

/**
 * Install `window.onerror` + `unhandledrejection` listeners. Returns a cleanup
 * function that removes them (used by tests / `autoTrack: false` toggling).
 */
export function installErrorCollector(push: PushFn<JsErrorEvent>): InstalledCollectors {
  if (typeof window === 'undefined') {
    return { cleanup: () => {} }
  }

  const onError = (event: ErrorEvent) => {
    const error = event.error ?? event
    const name = error?.name || 'Error'
    const message = event.message || error?.message || 'unknown error'
    const stack = typeof error?.stack === 'string' ? error.stack : ''
    push({
      name,
      message,
      stack,
      stackHash: computeStackHash(stack || `${name}:${message}`),
      route: readRoute(),
      errorType: 'js',
    })
  }

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason
    const name = reason?.name || 'unhandledrejection'
    const message = reason?.message || String(reason) || 'unhandled promise rejection'
    const stack = typeof reason?.stack === 'string' ? reason.stack : ''
    push({
      name,
      message,
      stack,
      stackHash: computeStackHash(stack || `${name}:${message}`),
      route: readRoute(),
      errorType: 'promise',
    })
  }

  // resource errors (img/script/css that fail to load) — captured separately on
  // the target elements; we hook capture-phase listeners on common tags.
  const onResourceError = (event: Event) => {
    const target = event.target as HTMLElement | null
    const url = target?.tagName
      ? (target as HTMLImageElement).src || (target as HTMLLinkElement).href || ''
      : ''
    if (!url) {
      return
    }
    const tag = target?.tagName?.toLowerCase() ?? 'other'
    push({
      name: 'resource_error',
      message: `Failed to load ${tag}: ${url}`,
      stackHash: computeStackHash(`resource:${url}`),
      route: readRoute(),
      errorType: 'resource',
    })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  // resource errors don't bubble to window.onerror; capture them at target
  window.addEventListener(
    'error',
    onResourceError as EventListener,
    true, // capture phase
  )

  return {
    cleanup: () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onResourceError as EventListener, true)
    },
  }
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }
  if (input instanceof Request) {
    return input.url
  }
  // URL instance
  return input.href
}

/**
 * Patch `fetch` + `XMLHttpRequest` to record one ApiTimingEvent per request.
 * The patches are transparent to application code.
 */
export function installNetworkCollector(
  push: PushFn<ApiTimingEvent>,
  options: { ignore?: (url: string) => boolean } = {},
): InstalledCollectors {
  if (typeof window === 'undefined') {
    return { cleanup: () => {} }
  }

  const cleanups: Array<() => void> = []

  // --- fetch ---
  if (typeof fetch === 'function') {
    const originalFetch = window.fetch
    const patchedFetch: typeof fetch = async (input, init) => {
      const url = resolveRequestUrl(input)
      if (options.ignore?.(url)) {
        return originalFetch(input, init)
      }
      const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      let response: Response
      try {
        response = await originalFetch(input, init)
      } catch (err) {
        push({
          apiRoute: normalizeRoute(url),
          method: (init?.method ?? 'GET').toUpperCase(),
          url,
          statusCode: 0,
          duration: elapsedSince(start),
          isTimeout: err instanceof DOMException && err.name === 'AbortError',
        })
        throw err
      }
      push({
        apiRoute: normalizeRoute(url),
        method: (init?.method ?? 'GET').toUpperCase(),
        url,
        statusCode: response.status,
        duration: elapsedSince(start),
        traceId: response.headers.get('traceparent') ?? response.headers.get('x-trace-id') ?? undefined,
      })
      return response
    }
    window.fetch = patchedFetch
    cleanups.push(() => {
      window.fetch = originalFetch
    })
  }

  // --- XMLHttpRequest ---
  if (typeof XMLHttpRequest === 'function') {
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send

    XMLHttpRequest.prototype.open = function patchedOpen(
      this: XMLHttpRequest & { __afmMeta?: { method: string; url: string; start: number; timedOut: boolean } },
      method: string,
      url: string | URL,
    ) {
      this.__afmMeta = { method: String(method).toUpperCase(), url: String(url), start: 0, timedOut: false }
      // forward the original call verbatim (preserves async/username/password)
      return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>)
    }

    XMLHttpRequest.prototype.send = function patchedSend(
      this: XMLHttpRequest & { __afmMeta?: { method: string; url: string; start: number; timedOut: boolean } },
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      if (this.__afmMeta) {
        this.__afmMeta.start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      }
      const meta = this.__afmMeta
      this.addEventListener('timeout', () => {
        if (meta) meta.timedOut = true
      }, { once: true })
      this.addEventListener('loadend', () => {
        if (!meta || options.ignore?.(meta.url)) {
          return
        }
        push({
          apiRoute: normalizeRoute(meta.url),
          method: meta.method,
          url: meta.url,
          statusCode: this.status,
          duration: elapsedSince(meta.start),
          isTimeout: meta.timedOut,
          traceId: this.getResponseHeader('traceparent') ?? this.getResponseHeader('x-trace-id') ?? undefined,
        })
      })
      return originalSend.apply(this, arguments as unknown as Parameters<typeof originalSend>)
    }

    cleanups.push(() => {
      XMLHttpRequest.prototype.open = originalOpen
      XMLHttpRequest.prototype.send = originalSend
    })
  }

  return {
    cleanup: () => cleanups.forEach((fn) => fn()),
  }
}

function elapsedSince(start: number): number {
  return Math.max(0, ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - start)
}

/**
 * Read resource timing entries for the current navigation and push one event
 * per entry. Filters out the SDK's own ingest endpoint. Returns the count
 * pushed (caller may cap). Call after a page_view settles.
 */
export function collectResources(
  push: PushFn<ResourceTimingEvent>,
  options: { route?: string; max?: number; ingestEndpoint?: string } = {},
): number {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) {
    return 0
  }

  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  const max = options.max ?? 20
  const ingest = options.ingestEndpoint ?? ''
  let pushed = 0

  for (const entry of entries) {
    if (pushed >= max) {
      break
    }
    if (ingest && entry.name.includes(ingest)) {
      continue
    }
    // responseStatus is supported on newer browsers; fall back to failed heuristic
    const status = (entry as PerformanceResourceTiming & { responseStatus?: number }).responseStatus
    const failed = typeof status === 'number'
      ? status === 0 || status >= 400
      : entry.transferSize === 0 && entry.duration > 0

    push({
      url: entry.name,
      initiatorType: entry.initiatorType || 'other',
      size: entry.transferSize || 0,
      duration: Math.round(entry.duration),
      failed,
      route: options.route,
    })
    pushed++
  }

  return pushed
}

export type AutoMetricName = 'FCP' | 'LCP' | 'INP' | 'CLS' | 'TTFB'

export interface AutoVital {
  metricName: AutoMetricName
  value: number
  route: string
  pageUrl: string
}

/** Route key for the current document, including hash-router paths (`#/orders/1`). */
export function readRoute(): string {
  if (typeof location === 'undefined') {
    return '/'
  }

  const hash = location.hash
  if (hash.startsWith('#/')) {
    return normalizeRoute(hash.slice(1))
  }

  return normalizeRoute(location.pathname || '/')
}

export function readPageUrl(): string {
  if (typeof location === 'undefined') {
    return ''
  }

  return location.href
}

/**
 * Fire when the SPA URL changes. `pushState` / `replaceState` are wrapped;
 * browser back/forward and hash changes use their own events.
 */
export function installNavigationCollector(onChange: () => void): InstalledCollectors {
  if (typeof window === 'undefined' || typeof history === 'undefined') {
    return { cleanup: () => {} }
  }

  const originalPush = history.pushState
  const originalReplace = history.replaceState

  history.pushState = function patchedPushState(...args: Parameters<History['pushState']>) {
    const result = originalPush.apply(this, args)
    onChange()
    return result
  }

  history.replaceState = function patchedReplaceState(...args: Parameters<History['replaceState']>) {
    const result = originalReplace.apply(this, args)
    onChange()
    return result
  }

  window.addEventListener('popstate', onChange)
  window.addEventListener('hashchange', onChange)

  return {
    cleanup: () => {
      history.pushState = originalPush
      history.replaceState = originalReplace
      window.removeEventListener('popstate', onChange)
      window.removeEventListener('hashchange', onChange)
    },
  }
}

const LCP_SETTLE_MS = 5000

/**
 * Read Web Vitals from the Performance API and call `onFinal` once per metric.
 * FCP and TTFB are final as soon as the browser reports them. LCP is sent after
 * it stops moving, or when the page hides. CLS and INP are sent when the page
 * hides, so partial values are not stored as extra samples.
 */
export function installWebVitalCollector(onFinal: (vital: AutoVital) => void): InstalledCollectors & { finalize: () => void } {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return { cleanup: () => {}, finalize: () => {} }
  }

  const cleanups: Array<() => void> = []
  const emitted = new Set<AutoMetricName>()

  const emit = (vital: AutoVital) => {
    if (emitted.has(vital.metricName) || !Number.isFinite(vital.value) || vital.value < 0) {
      return
    }
    emitted.add(vital.metricName)
    onFinal({
      ...vital,
      value: vital.metricName === 'CLS' ? Number(vital.value.toFixed(4)) : Math.round(vital.value),
    })
  }

  const place = () => ({ route: readRoute(), pageUrl: readPageUrl() })

  try {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (navigation && navigation.responseStart > 0) {
      emit({ metricName: 'TTFB', value: navigation.responseStart, ...place() })
    }
  } catch {
    // Navigation Timing is unavailable.
  }

  try {
    const paint = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint' && entry.startTime > 0) {
          emit({ metricName: 'FCP', value: entry.startTime, ...place() })
        }
      }
    })
    paint.observe({ type: 'paint', buffered: true })
    cleanups.push(() => paint.disconnect())
  } catch {
    // Paint timing is unavailable.
  }

  let sawLcp = false
  let lcpValue = 0
  let lcpPlace = place()
  let lcpTimer: ReturnType<typeof setTimeout> | null = null

  const emitLcp = () => {
    if (lcpTimer) {
      clearTimeout(lcpTimer)
      lcpTimer = null
    }
    if (!sawLcp) {
      return
    }
    emit({ metricName: 'LCP', value: lcpValue, route: lcpPlace.route, pageUrl: lcpPlace.pageUrl })
  }

  try {
    const lcp = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const last = entries[entries.length - 1] as (PerformanceEntry & { renderTime?: number }) | undefined
      if (!last) {
        return
      }
      const value = last.renderTime && last.renderTime > 0 ? last.renderTime : last.startTime
      if (value <= 0) {
        return
      }
      sawLcp = true
      lcpValue = value
      lcpPlace = place()
      if (lcpTimer) {
        clearTimeout(lcpTimer)
      }
      lcpTimer = setTimeout(emitLcp, LCP_SETTLE_MS)
    })
    lcp.observe({ type: 'largest-contentful-paint', buffered: true })
    cleanups.push(() => {
      lcp.disconnect()
      if (lcpTimer) {
        clearTimeout(lcpTimer)
      }
    })
  } catch {
    // LCP is unavailable.
  }

  let clsSupported = false
  let clsValue = 0
  let clsPlace = place()

  try {
    const cls = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean }
        if (shift.hadRecentInput || typeof shift.value !== 'number' || shift.value <= 0) {
          continue
        }
        clsValue += shift.value
        clsPlace = place()
      }
    })
    cls.observe({ type: 'layout-shift', buffered: true })
    clsSupported = true
    cleanups.push(() => cls.disconnect())
  } catch {
    // Layout shift timing is unavailable.
  }

  const interactions = new Map<number, { duration: number; route: string; pageUrl: string }>()

  try {
    const inp = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const timing = entry as PerformanceEntry & { interactionId?: number; duration: number }
        const interactionId = timing.interactionId ?? 0
        if (!interactionId || timing.duration <= 0) {
          continue
        }
        const current = place()
        const previous = interactions.get(interactionId)
        if (!previous || timing.duration > previous.duration) {
          interactions.set(interactionId, { duration: timing.duration, route: current.route, pageUrl: current.pageUrl })
        }
      }
    })
    inp.observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit)
    cleanups.push(() => inp.disconnect())
  } catch {
    // Event timing is unavailable.
  }

  return {
    finalize: () => {
      emitLcp()
      if (clsSupported) {
        emit({ metricName: 'CLS', value: clsValue, route: clsPlace.route, pageUrl: clsPlace.pageUrl })
      }
      if (interactions.size > 0) {
        const ranked = [...interactions.values()].sort((a, b) => b.duration - a.duration)
        const index = Math.min(ranked.length - 1, Math.floor(ranked.length / 50))
        const picked = ranked[index]
        emit({ metricName: 'INP', value: picked.duration, route: picked.route, pageUrl: picked.pageUrl })
      }
    },
    cleanup: () => cleanups.forEach((fn) => fn()),
  }
}

export type { InstalledCollectors }
