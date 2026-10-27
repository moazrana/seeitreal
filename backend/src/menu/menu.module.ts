import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { TripoModule } from '../tripo/tripo.module';
import { MenuCategoriesController } from './menu-categories.controller';
import { MenuCategoriesService } from './menu-categories.service';
import { DishLimitsService } from './dish-limits.service';
import {
  DishAllowanceController,
  MenuItemsController,
} from './menu-items.controller';
import { MenuItemsService } from './menu-items.service';

@Module({
  imports: [RestaurantsModule, TripoModule],
  controllers: [
    MenuCategoriesController,
    MenuItemsController,
    DishAllowanceController,
  ],
  providers: [MenuCategoriesService, MenuItemsService, DishLimitsService],
})
export class MenuModule {}
