import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
import { ListRestaurantsQueryDto } from './dto/list-restaurants-query.dto';
import { SuspendRestaurantDto } from './dto/suspend-restaurant.dto';
import { RootRestaurantsService } from './root-restaurants.service';

@UseGuards(IpAllowlistGuard, RootJwtAuthGuard, RootRolesGuard)
@Controller('root/restaurants')
export class RootRestaurantsController {
  constructor(private readonly service: RootRestaurantsService) {}

  // View endpoints — both superadmin and support (spec §3.9).
  @Get()
  list(@Query() query: ListRestaurantsQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  // Destructive actions — superadmin only (spec §5 "disable a client").
  @RootRoles(RootAdminRole.SUPERADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':id/suspend')
  suspend(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SuspendRestaurantDto,
    @Req() req: Request,
  ) {
    return this.service.suspend(id, dto.reason, admin, req.ip);
  }

  @RootRoles(RootAdminRole.SUPERADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':id/reactivate')
  reactivate(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.service.reactivate(id, admin, req.ip);
  }

  @RootRoles(RootAdminRole.SUPERADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':id/items/:itemId/hide')
  hideItem(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Req() req: Request,
  ) {
    return this.service.hideItem(id, itemId, admin, req.ip);
  }

  @RootRoles(RootAdminRole.SUPERADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':id/items/:itemId/unhide')
  unhideItem(
    @CurrentRootAdmin() admin: AuthenticatedRootAdmin,
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Req() req: Request,
  ) {
    return this.service.unhideItem(id, itemId, admin, req.ip);
  }
}
