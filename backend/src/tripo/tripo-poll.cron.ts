import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TripoGenerationService } from './tripo-generation.service';

@Injectable()
export class TripoPollCron {
  private readonly logger = new Logger(TripoPollCron.name);
  private running = false;

  constructor(private readonly generation: TripoGenerationService) {}

  @Cron(CronExpression.EVERY_MINUTE)
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
