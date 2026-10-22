import type { CSSProperties } from 'react';
import type { MenuItem } from '../api/types';

// "Cuisine type" is the owner-facing name for a menu category (the API and
// database keep `category`). Every dish has exactly one.
export type CuisineFilter = 'all' | number;

export interface CuisineTab {
  value: CuisineFilter;
  label: string;
  count: number;
}

export function cuisineTabId(value: CuisineFilter): string {
  return `cuisine-tab-${value}`;
}

export function matchesCuisine(item: MenuItem, filter: CuisineFilter): boolean {
  return filter === 'all' || item.categoryId === filter;
}

// Golden angle: consecutive ids land far apart on the colour wheel, so a
// restaurant's cuisine types stay visually distinct without storing a
// colour per type. Keyed on id (not name) so a rename keeps its colour.
const GOLDEN_ANGLE_DEG = 137.508;

export function cuisineHue(categoryId: number): number {
  return Math.round((categoryId * GOLDEN_ANGLE_DEG) % 360);
}

/** Exposes the cuisine's hue to CSS as `--cuisine-hue`. */
export function cuisineStyle(categoryId: number): CSSProperties {
  return { '--cuisine-hue': cuisineHue(categoryId) } as CSSProperties;
}
