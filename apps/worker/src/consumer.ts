import { Kafka } from 'kafkajs'
import type { RUMEvent } from '@ai-frontend-monitor/schema'

const TOPIC = 'rum_events'

export interface EventConsumerOptions {
  broker?: string
  groupId?: string
}

export class EventConsumer {
  private readonly consumer

  constructor(private readonly options: EventConsumerOptions = {}) {
    const kafka = new Kafka({
      clientId: 'afm-worker',
      brokers: [options.broker ?? process.env.KAFKA_BROKER ?? '127.0.0.1:9092'],
    })

    this.consumer = kafka.consumer({
      groupId: options.groupId ?? 'afm-worker-group',
    })
  }

  async start(onEvent: (event: RUMEvent) => Promise<void>) {
    await this.consumer.connect()
    await this.consumer.subscribe({ topic: TOPIC, fromBeginning: true })

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return
        }

        const event = JSON.parse(message.value.toString()) as RUMEvent
        await onEvent(event)
      },
    })
  }

  async stop() {
    await this.consumer.disconnect()
  }
}
