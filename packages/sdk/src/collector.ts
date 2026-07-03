/**
 * Auto-collectors + route normalization for the AFM SDK.
 *
 * Each installer takes a `push` callback that the host wires to its event
 * buffer. Collectors are no-ops outside a browser (no `window`) so the SDK
 * stays safe to import in SSR / Node contexts.
 */
import type {
  ApiTimingEvent,
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

/** Type tag carried in JsErrorEvent so the backend can derive `type` (js/promise/resource). */
export type ErrorKind = 'js' | 'promise' | 'resource'

interface InstalledCollectors {
  cleanup: () => void
}

/**
 * Install `window.onerror` + `unhandledrejection` listeners. Returns a cleanup
 * function that removes them (used by tests / `autoTrack: false` toggling).
 */
export function installErrorCollector(push: PushFn<JsErrorEvent & { kind: ErrorKind }>): InstalledCollectors {
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
      route: location.pathname,
      kind: 'js',
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
      route: location.pathname,
      kind: 'promise',
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
      route: location.pathname,
      kind: 'resource',
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
export function installNetworkCollector(push: PushFn<ApiTimingEvent>): InstalledCollectors {
  if (typeof window === 'undefined') {
    return { cleanup: () => {} }
  }

  const cleanups: Array<() => void> = []

  // --- fetch ---
  if (typeof fetch === 'function') {
    const originalFetch = window.fetch
    const patchedFetch: typeof fetch = async (input, init) => {
      const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      const url = resolveRequestUrl(input)
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
        })
        throw err
      }
      push({
        apiRoute: normalizeRoute(url),
        method: (init?.method ?? 'GET').toUpperCase(),
        url,
        statusCode: response.status,
        duration: elapsedSince(start),
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
      this: XMLHttpRequest & { __afmMeta?: { method: string; url: string; start: number } },
      method: string,
      url: string | URL,
    ) {
      this.__afmMeta = { method: String(method).toUpperCase(), url: String(url), start: 0 }
      // forward the original call verbatim (preserves async/username/password)
      return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>)
    }

    XMLHttpRequest.prototype.send = function patchedSend(
      this: XMLHttpRequest & { __afmMeta?: { method: string; url: string; start: number } },
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      if (this.__afmMeta) {
        this.__afmMeta.start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      }
      const meta = this.__afmMeta
      this.addEventListener('loadend', () => {
        if (!meta) {
          return
        }
        push({
          apiRoute: normalizeRoute(meta.url),
          method: meta.method,
          url: meta.url,
          statusCode: this.status,
          duration: elapsedSince(meta.start),
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

export type { InstalledCollectors }
