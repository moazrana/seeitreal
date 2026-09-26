import type { MenuItem } from '../api/types';

// "Cuisine type" is the owner-facing name for a menu category (the API and
// database keep `category`).
export type CuisineFilter = 'all' | 'none' | number;

export interface CuisineTab {
  value: CuisineFilter;
  label: string;
  count: number;
}

export function cuisineTabId(value: CuisineFilter): string {
  return `cuisine-tab-${value}`;
}

export function matchesCuisine(item: MenuItem, filter: CuisineFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return item.categoryId === null;
  return item.categoryId === filter;
}
