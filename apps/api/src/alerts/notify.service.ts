import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from './postgres.service';

export interface AlertNotifyPayload {
  id: string;
  projectId: string;
  env: string;
  fingerprint: string;
  title: string;
  severity: string;
  route: string;
  metric: string;
  triggerValue: string;
  baseline: string;
  release: string;
  /** Per-rule webhook; falls back to ALERT_WEBHOOK_URL when empty. */
  webhookUrl?: string;
}

/** True when no prior notify, or the dedupe window has elapsed. */
export function shouldNotify(
  lastNotifiedAt: Date | null | undefined,
  now: Date,
  dedupeMs: number,
): boolean {
  if (!lastNotifiedAt) return true;
  const ts =
    lastNotifiedAt instanceof Date
      ? lastNotifiedAt.getTime()
      : new Date(lastNotifiedAt).getTime();
  if (Number.isNaN(ts)) return true;
  return now.getTime() - ts >= dedupeMs;
}

function dedupeMsFromEnv(): number {
  const minutes = Number(process.env.ALERT_NOTIFY_DEDUPE_MINUTES ?? 15);
  const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : 15;
  return safe * 60_000;
}

@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(private readonly postgres: PostgresService) {}

  /**
   * POST JSON to per-rule webhookUrl, else ALERT_WEBHOOK_URL.
   * Skips when silenced / false-positive, or within the ~15m dedupe window.
   * email on the rule is stored only (placeholder — no SMTP yet).
   */
  async maybeNotify(alert: AlertNotifyPayload): Promise<boolean> {
    const webhook =
      (alert.webhookUrl ?? '').trim() ||
      (process.env.ALERT_WEBHOOK_URL ?? '').trim();
    if (!webhook) {
      return false;
    }

    const existing = await this.postgres.query<{
      status: string;
      resolution: string | null;
      silenced_until: Date | null;
      last_notified_at: Date | null;
    }>(
      `
        SELECT status, resolution, silenced_until, last_notified_at
        FROM alerts
        WHERE fingerprint = $1
      `,
      [alert.fingerprint],
    );
    const row = existing.rows[0];
    if (!row) return false;
    if (row.resolution === 'false_positive') return false;
    if (
      row.status === 'silenced' &&
      row.silenced_until &&
      new Date(row.silenced_until).getTime() > Date.now()
    ) {
      return false;
    }

    const now = new Date();
    if (!shouldNotify(row.last_notified_at, now, dedupeMsFromEnv())) {
      return false;
    }

    const body = {
      text: `[${alert.severity}] ${alert.title} — ${alert.metric} ${alert.triggerValue} (baseline ${alert.baseline})`,
      alert: {
        id: alert.id,
        projectId: alert.projectId,
        env: alert.env,
        title: alert.title,
        severity: alert.severity,
        status: 'firing',
        route: alert.route,
        metric: alert.metric,
        triggerValue: alert.triggerValue,
        baseline: alert.baseline,
        release: alert.release,
        fingerprint: alert.fingerprint,
      },
    };

    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        this.logger.warn(
          `alert webhook ${res.status} for ${alert.id}: ${await res.text().catch(() => '')}`,
        );
        return false;
      }
      await this.postgres.query(
        `
          UPDATE alerts
          SET last_notified_at = $1, updated_at = $1
          WHERE fingerprint = $2
        `,
        [now, alert.fingerprint],
      );
      this.logger.log(`notified webhook for ${alert.id} (${alert.fingerprint})`);
      return true;
    } catch (err) {
      this.logger.warn(`alert webhook failed for ${alert.id}`, err as Error);
      return false;
    }
  }
}
