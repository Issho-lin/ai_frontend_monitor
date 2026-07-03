"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.METRIC_SPECS = void 0;
exports.isGoodMetric = isGoodMetric;
exports.formatMetricValue = formatMetricValue;
exports.METRIC_SPECS = {
    LCP: { name: 'LCP', unit: 'ms', goodAt: 2500, lowerIsBetter: true },
    FCP: { name: 'FCP', unit: 'ms', goodAt: 1800, lowerIsBetter: true },
    INP: { name: 'INP', unit: 'ms', goodAt: 200, lowerIsBetter: true },
    TTFB: { name: 'TTFB', unit: 'ms', goodAt: 800, lowerIsBetter: true },
    CLS: { name: 'CLS', unit: 'cls', goodAt: 0.1, lowerIsBetter: true },
};
/** True when `value` is "good" per the spec for `metricName`. Unknown metrics default to true. */
function isGoodMetric(metricName, value) {
    const spec = exports.METRIC_SPECS[metricName];
    if (!spec) {
        return true;
    }
    return spec.lowerIsBetter ? value <= spec.goodAt : value >= spec.goodAt;
}
/**
 * Format a raw metric value for display, mirroring the API's `formatMetricValue`:
 * CLS is dimensionless (2 decimals); ms metrics show `Nms` under 1000, `N.Xs` at or above.
 */
function formatMetricValue(metricName, value) {
    const spec = exports.METRIC_SPECS[metricName];
    if (spec && spec.unit === 'cls') {
        return value.toFixed(2);
    }
    if (value < 1000) {
        return `${Math.round(value)}ms`;
    }
    return `${(value / 1000).toFixed(1)}s`;
}
//# sourceMappingURL=metrics.js.map