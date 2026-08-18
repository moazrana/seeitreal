import { timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TripoClientService } from './tripo-client.service';
import { TripoGenerationService } from './tripo-generation.service';
import { TripoWebhookQueryDto } from './dto/tripo-webhook-query.dto';

/**
 * Receives Tripo's task-complete callback (spec §11.1/§11.4). Tripo has no
 * documented HMAC signature scheme for callbacks, so this is secured with
 * an unguessable shared-secret token embedded in the callback_url we gave
 * Tripo at submit time (TripoGenerationService.buildCallbackUrl) — HTTPS
 * keeps it confidential in transit, same as a bearer token.
 */
@Controller('webhooks/tripo')
export class TripoWebhookController {
  private readonly logger = new Logger(TripoWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tripoClient: TripoClientService,
    private readonly generation: TripoGenerationService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async handleCallback(
    @Query() query: TripoWebhookQueryDto,
    @Body() body: unknown,
  ) {
    this.assertValidToken(query.token);
    const result = this.tripoClient.parseWebhookPayload(body);
    await this.generation.handleTaskResult(result);
    return { received: true };
  }

  private assertValidToken(provided: string) {
    const expected = this.config.get<string>('TRIPO_WEBHOOK_SECRET');
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected ?? '');
    const valid =
      !!expected &&
      providedBuf.length === expectedBuf.length &&
      timingSafeEqual(providedBuf, expectedBuf);

    if (!valid) {
      this.logger.warn('Rejected Tripo webhook call with invalid token');
      throw new UnauthorizedException();
    }
  }
}
