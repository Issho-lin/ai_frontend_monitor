import type { SessionSummary } from '@/composables/useSessionsData'

let remembered: SessionSummary | null = null

export function rememberSession(session: SessionSummary) {
  remembered = session
}

export function takeRememberedSession(id: string): SessionSummary | null {
  if (remembered?.id === id) {
    const value = remembered
    remembered = null
    return value
  }
  return null
}

export function peekRememberedSession(id: string): SessionSummary | null {
  return remembered?.id === id ? remembered : null
}
