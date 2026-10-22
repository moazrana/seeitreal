import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RootAdminRole } from '@ar-menu/shared';
import { CurrentRootAdmin } from '../common/decorators/current-root-admin.decorator';
import { RootRoles } from '../common/decorators/root-roles.decorator';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';
import { RootJwtAuthGuard } from '../common/guards/root-jwt-auth.guard';
import { RootRolesGuard } from '../common/guards/root-roles.guard';
import type { AuthenticatedRootAdmin } from '../types/authenticated-root-admin.interface';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { RootPackagesService } from './root-packages.service';

// Whole controller is superadmin-only, including reads: pricing/packages is
// billing (rootApp/ROOT-APP-Implementation-Spec.md §3.9 scopes "support" to
// tickets/feedback only, explicitly excluding billing).
@UseGuards(IpAllowlistGuard, RootJwtAuthGuard, RootRolesGuard)
@RootRoles(RootAdminRole.SUPERADMIN)
@Controller('root/packages')
export class RootPackagesController {
  constructor(private readonly service: RootPackagesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Get(':id/subscribers')
  subscribers(@Param('id', ParseIntPipe) id: number) {
    return this.service.subscribers(id);
  }

  @Post()
  create(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Body() dto: CreatePackageDto,
    @Req() req: Request,
  ) {
    return this.service.create(dto, admin, req.ip);
  }

  @Patch(':id')
  update(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePackageDto,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, admin, req.ip);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/retire')
  retire(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.service.retire(id, admin, req.ip);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/activate')
  activate(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.service.activate(id, admin, req.ip);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.service.remove(id, admin, req.ip);
  }
}
