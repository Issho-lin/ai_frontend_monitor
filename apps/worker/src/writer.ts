import type { RUMEvent } from '@ai-frontend-monitor/schema'

function formatTimestampForClickHouse(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00'
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0')

  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}:${pick('second')}.${milliseconds}`
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
