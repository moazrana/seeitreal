import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentRootAdmin } from '../common/decorators/current-root-admin.decorator';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';
import { RootJwtAuthGuard } from '../common/guards/root-jwt-auth.guard';
import type { AuthenticatedRootAdmin } from '../types/authenticated-root-admin.interface';
import { RejectItemDto } from './dto/reject-item.dto';
import { RootQaService } from './root-qa.service';

// QA is available to both superadmin and support (spec §3.9) — approve/
// reject isn't in the "destructive, superadmin-only" bucket.
@UseGuards(IpAllowlistGuard, RootJwtAuthGuard)
@Controller('root')
export class RootQaController {
  constructor(private readonly qa: RootQaService) {}

  @Get('qa-queue')
  qaQueue() {
    return this.qa.qaQueue();
  }

  @HttpCode(HttpStatus.OK)
  @Post('items/:id/approve')
  approve(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.qa.approve(id, admin, req.ip);
  }

  @HttpCode(HttpStatus.OK)
  @Post('items/:id/reject')
  reject(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectItemDto,
    @Req() req: Request,
  ) {
    return this.qa.reject(id, dto.note, admin, req.ip);
  }
}
