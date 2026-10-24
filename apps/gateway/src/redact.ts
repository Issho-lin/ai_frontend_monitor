/**
 * Basic field redaction for ingest payloads before queue publish.
 *
 * Redacted / masked:
 * - attribute keys matching: password, passwd, secret, token, authorization,
 *   cookie, set-cookie, email, phone, mobile, ssn, creditcard, cardnumber,
 *   cvv, apikey, access_token, refresh_token (case-insensitive; separators optional)
 * - nested plain objects under attributes (one level of recursion)
 * - pageUrl / resource url query params with the same sensitive names
 * - error.message / error.stack are left intact (needed for debugging); only
 *   attributes and obvious URL query keys are scrubbed
 */

const SENSITIVE_KEY =
  /^(pass(word|wd)?|secret|token|authorization|cookie|set-?cookie|email|e-?mail|phone|mobile|ssn|credit.?card|card.?number|cvv|api.?key|access.?token|refresh.?token)$/i;

const SENSITIVE_QUERY =
  /^(pass(word|wd)?|secret|token|authorization|email|e-?mail|phone|mobile|ssn|credit.?card|card.?number|cvv|api.?key|access.?token|refresh.?token)$/i;

function maskString(value: string): string {
  if (value.length <= 4) return '[REDACTED]';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function redactAttributes(
  attrs: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!attrs || typeof attrs !== 'object') return attrs;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] =
        typeof value === 'string' ? maskString(value) : '[REDACTED]';
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redactAttributes(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function redactUrl(url: string | undefined): string {
  if (!url) return url ?? '';
  try {
    const parsed = new URL(url);
    let changed = false;
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_QUERY.test(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
        changed = true;
      }
    }
    return changed ? parsed.toString() : url;
  } catch {
    return url;
  }
}

export function redactIngestFields<T extends {
  pageUrl?: string;
  context?: { attributes?: Record<string, unknown> };
  apiTimings?: Array<{ url?: string }>;
  resources?: Array<{ url?: string }>;
}>(payload: T): T {
  const next = { ...payload };

  if (next.pageUrl) {
    next.pageUrl = redactUrl(next.pageUrl);
  }

  if (next.context) {
    next.context = {
      ...next.context,
      attributes: redactAttributes(next.context.attributes),
    };
  }

  if (next.apiTimings) {
    next.apiTimings = next.apiTimings.map((item) => ({
      ...item,
      url: item.url ? redactUrl(item.url) : item.url,
    }));
  }

  if (next.resources) {
    next.resources = next.resources.map((item) => ({
      ...item,
      url: item.url ? redactUrl(item.url) : item.url,
    }));
  }

  return next;
}
