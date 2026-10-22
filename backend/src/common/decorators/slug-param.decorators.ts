import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import {
  ItemSlugToIdPipe,
  RestaurantSlugToIdPipe,
} from '../pipes/slug-to-id.pipes';

// A custom decorator rather than @Param(): the global ValidationPipe runs
// `transform: true` on @Param() values and would coerce the slug to the
// handler's `number` type (NaN) before our pipe sees it. Custom decorators
// are skipped by ValidationPipe (validateCustomDecorators defaults to
// false), so the raw slug string reaches the resolving pipe intact.
const RawRouteParam = createParamDecorator(
  (name: string, ctx: ExecutionContext): string => {
    const value = ctx.switchToHttp().getRequest<Request>().params[name];
    // Non-string (wildcard array) values fall through to the pipe's slug
    // format check as '' and are rejected with a 404.
    return typeof value === 'string' ? value : '';
  },
);

/** `:restaurantSlug` route param, resolved to the restaurant's internal id. */
export const RestaurantIdFromSlug = () =>
  RawRouteParam('restaurantSlug', RestaurantSlugToIdPipe);

/** `:itemSlug` route param (MenuItem.publicSlug), resolved to the item's id. */
export const ItemIdFromSlug = () => RawRouteParam('itemSlug', ItemSlugToIdPipe);
