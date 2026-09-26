import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RestaurantIdFromSlug } from '../common/decorators/slug-param.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MAX_UPLOAD_BYTES } from '../uploads/image-upload.constants';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { RestaurantsService } from './restaurants.service';

@UseGuards(JwtAuthGuard)
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRestaurantDto,
  ) {
    return this.restaurantsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.restaurantsService.findAllForUser(user);
  }

  @Get(':restaurantSlug')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @RestaurantIdFromSlug() id: number,
  ) {
    return this.restaurantsService.assertOwnership(id, user);
  }

  @Patch(':restaurantSlug')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @RestaurantIdFromSlug() id: number,
    @Body() dto: UpdateRestaurantDto,
  ) {
    return this.restaurantsService.update(id, user, dto);
  }

  @Delete(':restaurantSlug')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @RestaurantIdFromSlug() id: number,
  ) {
    return this.restaurantsService.remove(id, user);
  }

  // See ImageUploadService for the full §7.5 checklist this goes through.
  @Post(':restaurantSlug/logo')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async uploadLogo(
    @CurrentUser() user: AuthenticatedUser,
    @RestaurantIdFromSlug() id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.restaurantsService.setLogo(id, user, file);
  }
}
