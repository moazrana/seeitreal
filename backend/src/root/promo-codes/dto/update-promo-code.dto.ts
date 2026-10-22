import { PartialType } from '@nestjs/mapped-types';
import { CreatePromoCodeDto } from './create-promo-code.dto';

// isActive is deliberately excluded — toggled only via the dedicated
// activate/deactivate endpoints (see RootPromoCodesController).
export class UpdatePromoCodeDto extends PartialType(CreatePromoCodeDto) {}
