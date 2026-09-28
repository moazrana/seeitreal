import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

// Single-line fields must not contain line breaks or other control
// characters — they end up in an email subject/header line.
const SINGLE_LINE = /^[^\p{Cc}]*$/u;

/** Public home-page contact form (documents/TASK-home-page-content.md §5).
 * Whitelisted and validated server-side (spec §7.2); unknown fields are
 * rejected by the global ValidationPipe. */
export class CreateContactEnquiryDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(SINGLE_LINE, { message: 'name must be a single line' })
  name!: string;

  @Trim()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  @Matches(SINGLE_LINE, { message: 'businessName must be a single line' })
  businessName?: string;

  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;

  /**
   * Honeypot: a field real visitors never see or fill (hidden in the form).
   * Bots that auto-fill every input give themselves away. Accepted here so
   * the request validates; ContactService silently discards the submission.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}
