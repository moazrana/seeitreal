import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListPromoCodesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  q?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
