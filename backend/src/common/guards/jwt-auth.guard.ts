import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Requires a valid, non-expired access token. See auth/strategies/jwt.strategy.ts. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
