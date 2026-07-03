import type { RUMEvent } from '@ai-frontend-monitor/schema'

function formatTimestampForClickHouse(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`
}

function normalizeEvent(event: RUMEvent): RUMEvent {
  return {
    ...event,
    timestamp: formatTimestampForClickHouse(event.timestamp),
  }
}

export interface ClickHouseWriterOptions {
  endpoint?: string
  username?: string
  password?: string
  database?: string
}

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8123'
const DEFAULT_USERNAME = 'afm'
const DEFAULT_PASSWORD = 'CHANGE_ME_DEV_SECRET'
const DEFAULT_DATABASE = 'afm'

export class ClickHouseWriter {
  constructor(private readonly options: ClickHouseWriterOptions = {}) {}

  async write(events: RUMEvent[]): Promise<void> {
    if (events.length === 0) {
      return
    }

    if (typeof fetch !== 'function') {
      throw new Error('Worker runtime requires fetch support.')
    }

    const endpoint = this.options.endpoint ?? DEFAULT_ENDPOINT
    const username = this.options.username ?? DEFAULT_USERNAME
    const password = this.options.password ?? DEFAULT_PASSWORD
    const database = this.options.database ?? DEFAULT_DATABASE
    const query = `INSERT INTO ${database}.rum_events FORMAT JSONEachRow`
    const body = events.map((event) => JSON.stringify(normalizeEvent(event))).join('\n')
    const authorization = Buffer.from(`${username}:${password}`).toString('base64')

    const response = await fetch(`${endpoint}/?query=${encodeURIComponent(query)}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${authorization}`,
        'content-type': 'text/plain',
      },
      body,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`ClickHouse write failed: ${response.status} ${text}`)
    }
  }
}
