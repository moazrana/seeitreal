import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('health')
export class AppController {
  @SkipThrottle()
  @Get()
  check() {
    return { status: 'ok' };
  }
}
