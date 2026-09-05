import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListRestaurantsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';
}
