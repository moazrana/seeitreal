import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  REGENERATION_ISSUES,
  type RegenerationIssue,
} from '../../../tripo/regeneration-guidance';

/** Shared by reject and regenerate: the admin's reason, plus optionally
 * what's wrong with the model. Tripo takes no text prompt, so `issues`
 * (or keywords in `note` when none are ticked) steer the next generation;
 * the note itself is shown to the owner. */
export class RejectItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(REGENERATION_ISSUES.length)
  @IsIn(REGENERATION_ISSUES, { each: true })
  issues?: RegenerationIssue[];
}
