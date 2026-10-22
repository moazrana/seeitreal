import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TripoGenerationService } from './tripo-generation.service';

@Injectable()
export class TripoPollCron {
  private readonly logger = new Logger(TripoPollCron.name);
  private running = false;

  constructor(private readonly generation: TripoGenerationService) {}

  // Every 15s: once a webhook is missed, the finished model is picked up
  // within seconds instead of up to a minute later. Only tasks past
  // POLL_MIN_AGE_MS are checked, so this is a no-op while webhooks work.
  @Cron('*/15 * * * * *')
  async handleCron() {
    if (this.running) return; // don't overlap a slow run with the next tick
    this.running = true;
    try {
      const checked = await this.generation.pollPendingTasks();
      if (checked > 0) {
        this.logger.debug(`Polled ${checked} in-flight Tripo task(s)`);
      }
    } catch (err) {
      this.logger.error(`Tripo poll fallback failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
