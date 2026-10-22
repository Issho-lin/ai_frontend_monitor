/** Empty and "all" mean every release. */
export function normalizeRelease(release?: string) {
  return normalizeChoice(release);
}

/** Empty and "all" mean no extra slice. */
export function normalizeChoice(value?: string) {
  const text = value?.trim() ?? '';
  return !text || text === 'all' ? '' : text;
}

const WINDOW_HOURS: Record<string, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};

/** View window in hours. Unknown values stay on the last 24 hours. */
export function normalizeWindow(value?: string) {
  return WINDOW_HOURS[value?.trim() ?? ''] ?? 24;
}
