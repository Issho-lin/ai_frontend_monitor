import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'ai-frontend-monitor-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
