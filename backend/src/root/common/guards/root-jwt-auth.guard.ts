import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Requires a valid, non-expired Root App access token. See
 * root/auth/strategies/root-jwt.strategy.ts. Registered under the
 * 'root-jwt' passport strategy name — distinct from the customer app's
 * 'jwt' strategy so the two never collide in the same process. */
@Injectable()
export class RootJwtAuthGuard extends AuthGuard('root-jwt') {}
