/**
 * LCP/FCP/INP/TTFB are durations in milliseconds. A long-lived SPA tab reports
 * PerformanceObserver `startTime` / `renderTime` from the document time origin,
 * which can be days and is not a page-load timing. CLS is dimensionless and
 * is not capped.
 */
export const MAX_TIMING_VITAL_MS = 60_000;

const TIMING_VITALS = new Set(['LCP', 'FCP', 'INP', 'TTFB']);

export function isAcceptedWebVital(metricName: string, value: number): boolean {
  return !(TIMING_VITALS.has(metricName) && value > MAX_TIMING_VITAL_MS);
}
