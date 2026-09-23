import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BusinessType } from '@ar-menu/shared';
import { IsEqualTo } from '../../common/validators/is-equal-to.validator';

export class SignupDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // Strong password rule (spec §7.3): min 10 chars, at least one letter and
  // one number. The frontend may add nicer UX hints; the server is always
  // the source of truth.
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  password!: string;

  @IsString()
  @IsEqualTo('password', { message: 'passwords do not match' })
  confirmPassword!: string;

  // Signup creates the owner's first restaurant in the same step.
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  businessName!: string;

  // Only one business type exists today and the client doesn't currently
  // send it (it's locked to "Restaurant" in the UI); accepted as optional
  // so the field is forward-compatible without adding real branching yet.
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  address!: string;
}
