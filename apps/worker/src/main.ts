import { EventConsumer } from './consumer.js'
import { ClickHouseWriter } from './writer.js'

async function bootstrap() {
  const writer = new ClickHouseWriter({
    endpoint: process.env.CLICKHOUSE_ENDPOINT,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    database: process.env.CLICKHOUSE_DB,
  })
  const consumer = new EventConsumer({
    broker: process.env.KAFKA_BROKER,
    groupId: process.env.KAFKA_GROUP_ID,
  })

  await consumer.start(async (event) => {
    await writer.write([event])
  })

  console.log('worker started: consuming rum_events topic')
}

void bootstrap()
