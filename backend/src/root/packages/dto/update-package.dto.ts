import { PartialType } from '@nestjs/mapped-types';
import { CreatePackageDto } from './create-package.dto';

// isActive is deliberately excluded — toggled only via the dedicated
// retire/activate endpoints so audit-log entries stay unambiguous about
// what changed (see RootPackagesController).
export class UpdatePackageDto extends PartialType(CreatePackageDto) {}
