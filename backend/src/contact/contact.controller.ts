import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ContactService } from './contact.service';
import { CreateContactEnquiryDto } from './dto/create-contact-enquiry.dto';

/**
 * Public (unauthenticated) contact form endpoint. Spam/abuse protection is
 * layered: a strict per-IP throttle (spec §7.4), strict DTO validation
 * (§7.2) and a honeypot field (ContactService).
 */
@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  // 5 submissions per 10 minutes per IP — plenty for a person, useless for
  // a spammer. Requires TRUST_PROXY behind nginx so each visitor has their
  // own bucket.
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async submit(@Body() dto: CreateContactEnquiryDto, @Req() req: Request) {
    await this.contact.submit(dto, req.ip);
    return { received: true };
  }
}
