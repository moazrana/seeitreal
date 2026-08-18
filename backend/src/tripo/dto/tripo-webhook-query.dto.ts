import { IsString, MinLength } from 'class-validator';

export class TripoWebhookQueryDto {
  @IsString()
  @MinLength(1)
  token!: string;
}
