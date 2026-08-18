import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TripoGenerationService } from '../tripo/tripo-generation.service';
import { MAX_UPLOAD_BYTES } from '../uploads/image-upload.constants';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { MenuItemsService } from './menu-items.service';

@UseGuards(JwtAuthGuard)
@Controller('restaurants/:restaurantId/items')
export class MenuItemsController {
  constructor(
    private readonly service: MenuItemsService,
    private readonly tripoGeneration: TripoGenerationService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseIntPipe) restaurantId: number,
    @Body() dto: CreateMenuItemDto,
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

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseIntPipe) restaurantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findOne(restaurantId, id, user);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseIntPipe) restaurantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMenuItemDto,
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

  // Uploads are image-only, whitelisted, magic-byte verified, size/dimension
  // limited, renamed, EXIF-stripped, and stored outside the web root — see
  // ImageUploadService (spec §7.5). `limits.fileSize` here is the primary,
  // fast-fail size guard (rejects before the body is fully buffered);
  // ImageUploadService re-checks it defensively too.
  @Post(':id/photo')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseIntPipe) restaurantId: number,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.service.setPhoto(restaurantId, id, user, file);
  }

  // Triggers paid/expensive work — debounced primarily by the item's own
  // ar_status (TripoGenerationService refuses unless it's "pending"), plus
  // a tight per-user throttle here as defense in depth (spec §7.4).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':id/generate-model')
  generateModel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseIntPipe) restaurantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tripoGeneration.triggerGeneration(restaurantId, id, user);
  }
}
