import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RootLoginDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
