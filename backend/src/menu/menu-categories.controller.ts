import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { MenuCategoriesService } from './menu-categories.service';

@UseGuards(JwtAuthGuard)
@Controller('restaurants/:restaurantId/categories')
export class MenuCategoriesController {
  constructor(private readonly service: MenuCategoriesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseIntPipe) restaurantId: number,
    @Body() dto: CreateMenuCategoryDto,
  ) {
    return this.service.create(restaurantId, user, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseIntPipe) restaurantId: number,
  ) {
    return this.service.findAll(restaurantId, user);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseIntPipe) restaurantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMenuCategoryDto,
  ) {
    return this.service.update(restaurantId, id, user, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseIntPipe) restaurantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(restaurantId, id, user);
  }
}
