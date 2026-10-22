export function errorActivity(lastSeen: string) {
  const time = Date.parse(lastSeen.replace(' ', 'T'))
  if (Number.isNaN(time) || Date.now() - time >= 60 * 60 * 1000) {
    return { text: '已停歇', type: 'info' as const }
  }
  return { text: '仍在发生', type: 'danger' as const }
}
