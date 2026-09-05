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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ManualModelUploadService } from '../tripo/manual-model-upload.service';
import { TripoGenerationService } from '../tripo/tripo-generation.service';
import { MAX_GLB_UPLOAD_BYTES } from '../uploads/glb-upload.constants';
import { MAX_UPLOAD_BYTES } from '../uploads/image-upload.constants';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { MAX_ITEM_PHOTOS } from './menu-items.constants';
import { MenuItemsService } from './menu-items.service';

@UseGuards(JwtAuthGuard)
@Controller('restaurants/:restaurantId/items')
export class MenuItemsController {
  constructor(
    private readonly service: MenuItemsService,
    private readonly tripoGeneration: TripoGenerationService,
    private readonly manualModelUpload: ManualModelUploadService,
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

  // Up to 5 input photos per dish, driving Tripo multiview generation
  // (documents/3d-model-enhancement.md §1). Every file is image-only,
  // whitelisted, magic-byte verified, size/dimension limited, renamed,
  // EXIF-stripped, and stored outside the web root — see ImageUploadService
  // (spec §7.5) — applied independently per file, not just to the batch.
  // `limits.fileSize`/`maxCount` here are the primary, fast-fail guards
  // (reject before the body is fully buffered); MenuItemsService/
  // ImageUploadService re-check both defensively too.
  @Post(':id/photos')
  @UseInterceptors(
    FilesInterceptor('files', MAX_ITEM_PHOTOS, {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async addPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseIntPipe) restaurantId: number,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }
    return this.service.addPhotos(restaurantId, id, user, files);
  }

  @Delete(':id/photos/:photoId')
  removePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseIntPipe) restaurantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('photoId', ParseIntPipe) photoId: number,
  ) {
    return this.service.removePhoto(restaurantId, id, photoId, user);
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

  // Hero-dish bypass (documents/3d-model-enhancement.md §5): accepts an
  // already-produced GLB (Polycam/photogrammetry/a 3D artist) instead of
  // generating one via Tripo, entering the same QA -> live flow. Same
  // expensive-work throttle as generate-model — USDZ conversion runs here
  // too (spec §7.4).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':id/model')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_GLB_UPLOAD_BYTES } }),
  )
  async uploadModel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseIntPipe) restaurantId: number,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.manualModelUpload.uploadManualModel(
      restaurantId,
      id,
      user,
      file,
    );
  }
}
