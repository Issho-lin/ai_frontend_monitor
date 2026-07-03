import type { IngestPayload } from '@ai-frontend-monitor/schema'

export interface TransportOptions {
  endpoint: string
}

export async function sendPayload(payload: IngestPayload, options: TransportOptions): Promise<void> {
  const body = JSON.stringify(payload)

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' })
    const accepted = navigator.sendBeacon(options.endpoint, blob)
    if (accepted) {
      return
    }
  }

  if (typeof fetch !== 'function') {
    throw new Error('AFM SDK requires fetch support in the current runtime.')
  }

  const response = await fetch(options.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body,
    keepalive: true,
  })

  if (!response.ok) {
    throw new Error(`AFM SDK request failed with status ${response.status}`)
  }
}
