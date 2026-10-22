import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Used by both totp/verify-setup and totp/verify — same shape, different
 * challenge-token purpose (checked server-side, not by this DTO). */
export class RootTotpVerifyDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2048)
  token!: string;

  // A 6-digit TOTP code, or a 10-hex-char one-time backup code.
  @IsString()
  @Matches(/^[0-9]{6}$|^[0-9a-f]{10}$/, {
    message: 'code must be a 6-digit authenticator code or a backup code',
  })
  code!: string;
}
