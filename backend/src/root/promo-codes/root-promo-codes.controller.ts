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
  Query,
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
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { ListPromoCodesQueryDto } from './dto/list-promo-codes-query.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';
import { RootPromoCodesService } from './root-promo-codes.service';

// Whole controller is superadmin-only, including reads — same reasoning as
// RootPackagesController (billing is outside the "support" role's scope).
@UseGuards(IpAllowlistGuard, RootJwtAuthGuard, RootRolesGuard)
@RootRoles(RootAdminRole.SUPERADMIN)
@Controller('root/promo-codes')
export class RootPromoCodesController {
  constructor(private readonly service: RootPromoCodesService) {}

  @Get()
  list(@Query() query: ListPromoCodesQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  create(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Body() dto: CreatePromoCodeDto,
    @Req() req: Request,
  ) {
    return this.service.create(dto, admin, req.ip);
  }

  @Patch(':id')
  update(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePromoCodeDto,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, admin, req.ip);
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

  @HttpCode(HttpStatus.OK)
  @Post(':id/deactivate')
  deactivate(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.service.deactivate(id, admin, req.ip);
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
