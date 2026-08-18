import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@ar-menu/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AdminService } from './admin.service';
import { RejectItemDto } from './dto/reject-item.dto';

// Every route here requires the admin role (spec §10) — role is verified
// by RolesGuard; JwtAuthGuard establishes identity first.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('qa-queue')
  qaQueue() {
    return this.adminService.qaQueue();
  }

  @HttpCode(HttpStatus.OK)
  @Post('items/:id/approve')
  approve(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.adminService.approve(id, admin);
  }

  @HttpCode(HttpStatus.OK)
  @Post('items/:id/reject')
  reject(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectItemDto,
  ) {
    return this.adminService.reject(id, dto.note, admin);
  }
}
