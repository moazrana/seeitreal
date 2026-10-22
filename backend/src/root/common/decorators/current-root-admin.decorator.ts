import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRootAdmin } from '../../types/authenticated-root-admin.interface';

/** Pulls the authenticated root admin attached by RootJwtAuthGuard onto `req.user`. */
export const CurrentRootAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedRootAdmin => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedRootAdmin }>();
    return request.user;
  },
);
