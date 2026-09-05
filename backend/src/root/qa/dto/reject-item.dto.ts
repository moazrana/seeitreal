import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note!: string;
}
