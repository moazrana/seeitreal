import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class CreateMenuCategoryDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder?: number;
}
