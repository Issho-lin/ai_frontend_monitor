import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import type { RUMEvent } from '@ai-frontend-monitor/schema';

const TOPIC = 'rum_events';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly kafka = new Kafka({
    clientId: 'afm-gateway',
    brokers: [process.env.KAFKA_BROKER ?? '127.0.0.1:9092'],
  });

  private producer: Producer | null = null;

  private async getProducer() {
    if (!this.producer) {
      this.producer = this.kafka.producer();
      await this.producer.connect();
    }

    return this.producer;
  }

  async publish(events: RUMEvent[]) {
    const producer = await this.getProducer();

    await producer.send({
      topic: TOPIC,
      messages: events.map((event) => ({
        key: event.project_id,
        value: JSON.stringify(event),
      })),
    });
  }

  async onModuleDestroy() {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
  }
}
