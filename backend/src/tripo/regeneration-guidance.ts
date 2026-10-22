import { randomInt } from 'node:crypto';
import type { TripoGenerationOptions } from './tripo.types';

/** What an admin can flag when rejecting or regenerating a model. */
export const REGENERATION_ISSUES = ['colors', 'shape', 'detail'] as const;
export type RegenerationIssue = (typeof REGENERATION_ISSUES)[number];

// Fallback when the admin wrote a reason but ticked no issue. English plus
// common Roman Urdu words, since admins write both.
const KEYWORDS: Record<RegenerationIssue, RegExp> = {
  colors:
    /\b(colou?rs?|shade|tone|hue|tint|orange|dark(er)?|bright(er)?|pale|faded|washed|saturat\w*|rang|rung)\b/i,
  shape:
    /\b(shape|geometry|distort\w*|deform\w*|broken|missing|hole|flat|squash\w*|melt\w*|wrong size|shakal|shakl)\b/i,
  detail:
    /\b(blurr?y|blur|detail\w*|sharp\w*|low.?res|pixel\w*|smudg\w*|muddy)\b/i,
};

/** The issues the admin ticked, or (if none) those the note implies. */
export function resolveIssues(
  note: string | null | undefined,
  issues?: readonly RegenerationIssue[],
): RegenerationIssue[] {
  if (issues && issues.length > 0) {
    return REGENERATION_ISSUES.filter((i) => issues.includes(i));
  }
  if (!note) return [];
  return REGENERATION_ISSUES.filter((i) => KEYWORDS[i].test(note));
}

export function serializeIssues(issues: RegenerationIssue[]): string | null {
  return issues.length > 0 ? issues.join(',') : null;
}

export function parseIssues(
  raw: string | null | undefined,
): RegenerationIssue[] {
  if (!raw) return [];
  const parts = raw.split(',');
  return REGENERATION_ISSUES.filter((i) => parts.includes(i));
}

/**
 * Tripo's image/multiview-to-model API takes no text prompt, so an admin's
 * reason can't be passed through literally. Instead each flagged issue
 * maps to settings that address it, and every regeneration gets fresh
 * seeds so the new model actually differs from the rejected one.
 */
export function guidanceOptions(
  issues: RegenerationIssue[],
): Partial<TripoGenerationOptions> {
  const options: Partial<TripoGenerationOptions> = {
    modelSeed: randomInt(1, 2 ** 31 - 1),
    textureSeed: randomInt(1, 2 ** 31 - 1),
  };
  if (issues.includes('colors')) {
    // PBR gives Tripo a separate albedo instead of baking lighting into the
    // colors (metallic is still forced to 0 afterwards, so no chrome), and
    // 'original_image' alignment keeps the texture faithful to the photo.
    options.pbr = true;
    options.textureQuality = 'detailed';
    options.textureAlignment = 'original_image';
  }
  if (issues.includes('detail')) {
    options.textureQuality = 'detailed';
  }
  return options;
}
