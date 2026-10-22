import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsInt, Min, ValidateIf } from 'class-validator';
import { CreateMenuItemDto } from './create-menu-item.dto';

export class UpdateMenuItemDto extends PartialType(
  OmitType(CreateMenuItemDto, ['categoryId'] as const),
) {
  // May be omitted to keep the current cuisine type, but never cleared:
  // unlike @IsOptional, this still rejects an explicit null.
  @ValidateIf((dto: UpdateMenuItemDto) => dto.categoryId !== undefined)
  @IsInt()
  @Min(1)
  categoryId?: number;
}
