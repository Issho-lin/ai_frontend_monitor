export type RuntimeEnv = 'production' | 'staging' | 'test'

export type EventType =
  | 'page_view'
  | 'web_vital'
  | 'error'
  | 'api_timing'
  | 'resource_timing'

export type MetricName =
  | 'FCP'
  | 'LCP'
  | 'INP'
  | 'CLS'
  | 'TTFB'
  | 'PV'
  | 'API_P95'
  | 'JS_ERROR_RATE'
  | 'RESOURCE_FAIL_RATE'

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown'

export type ResourceType = 'script' | 'css' | 'img' | 'font' | 'fetch' | 'other'

export interface EventContext {
  release: string
  sdkVersion: string
  sessionId: string
  userIdHash: string
  deviceType: DeviceType
  os: string
  browser: string
  networkType: string
  country?: string
  traceId?: string
  sampleRate: number
  attributes?: Record<string, unknown>
}

export interface MetricValues {
  fcp?: number
  lcp?: number
  inp?: number
  cls?: number
  ttfb?: number
}

/**
 * A captured JS error. `stackHash` is computed client-side (sha1 of the
 * normalized top frames) so the backend can group identical errors without
 * parsing stacks. The raw `stack` is optional and, when present, is carried in
 * `attributes` rather than a dedicated column (M2 does not store sourcemaps).
 */
export interface JsErrorEvent {
  name: string
  message: string
  stackHash: string
  stack?: string
  /** override the payload-level route when the error happened on a different page */
  route?: string
}

/**
 * A single API/fetch timing sample. `apiRoute` is the normalized route
 * (query stripped, numeric path segments collapsed to `:id`) computed by the
 * SDK so the backend never re-normalizes.
 */
export interface ApiTimingEvent {
  apiRoute: string
  method: string
  url?: string
  statusCode: number
  duration: number
  isTimeout?: boolean
  traceId?: string
}

/**
 * A single resource timing sample from PerformanceResourceTiming.
 * `failed` is true when the request errored (decoded body size 0 + non-2xx,
 * or a `fetch` that rejected).
 */
export interface ResourceTimingEvent {
  url: string
  initiatorType: string
  size: number
  duration: number
  failed?: boolean
  /** override the payload-level route for SPA navigations */
  route?: string
}

export interface IngestPayload {
  projectId: string
  token?: string
  env: RuntimeEnv
  route: string
  pageUrl: string
  occurredAt: string
  metrics?: MetricValues
  errors?: JsErrorEvent[]
  apiTimings?: ApiTimingEvent[]
  resources?: ResourceTimingEvent[]
  context: EventContext
}

export interface RUMEvent {
  event_id: string
  project_id: string
  env: RuntimeEnv
  event_type: EventType
  timestamp: string
  page_url: string
  route: string
  route_hash: string
  release: string
  session_id: string
  user_id_hash: string
  device_type: DeviceType
  os: string
  browser: string
  network_type: string
  country: string
  metric_name: string
  metric_value: number
  api_route: string
  resource_type: ResourceType | ''
  resource_url: string
  resource_size: number
  duration: number
  status_code: number
  error_name: string
  error_stack_hash: string
  lcp_element: string
  trace_id: string
  sample_rate: number
  sdk_version: string
  attributes: Record<string, unknown>
}
