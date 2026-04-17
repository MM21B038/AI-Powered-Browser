/**
 * /-mention user skills in composer (slugs match userData/skills/<slug>/SKILL.md).
 * Keep in sync with electron/user-skills-store SKILL_SLUG_REGEX.
 */

import type { UserSkillListItem } from "../../shared/ipc-types";

/** Lowercase slug: letter/digit then letters, digits, hyphens. */
export const SKILL_SLUG_BODY_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function validateSkillSlug(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!SKILL_SLUG_BODY_RE.test(s)) return null;
  return s;
}

/** `/slug` after start or whitespace; slug ends when next char is not slug continuation. */
const SLASH_SKILL_GLOBAL_RE = /(?:^|\s)\/([a-z0-9][a-z0-9-]{0,62})(?![a-z0-9-])/gi;

export function extractSlashSkillSlugs(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = new RegExp(SLASH_SKILL_GLOBAL_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1];
    const slug = validateSkillSlug(raw);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

/**
 * Caret inside an active / mention: `/` at start or after whitespace, no whitespace in the query fragment.
 */
export function getActiveSkillQuery(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  if (caret < 0 || caret > value.length) return null;
  const before = value.slice(0, caret);
  const slash = before.lastIndexOf("/");
  if (slash < 0) return null;
  if (slash > 0 && !/\s/.test(before[slash - 1]!)) return null;
  const afterSlash = before.slice(slash + 1);
  if (/\s/.test(afterSlash)) return null;
  return { start: slash, query: afterSlash };
}

export function filterSkillSuggestions(
  items: UserSkillListItem[],
  query: string,
  maxVisible: number,
): UserSkillListItem[] {
  const q = query.trim().toLowerCase();
  const scored = items.map((item) => {
    const slug = item.slug.toLowerCase();
    const name = (item.name || "").toLowerCase();
    const desc = (item.description || "").toLowerCase();
    const slugPrefix = q.length === 0 || slug.startsWith(q);
    const namePrefix = q.length === 0 || name.startsWith(q);
    const slugIdx = q.length ? slug.indexOf(q) : 0;
    const nameIdx = q.length ? name.indexOf(q) : 0;
    const descIdx = q.length ? desc.indexOf(q) : 0;
    let score = 999;
    let tier = 2;
    if (q.length === 0) {
      score = 0;
      tier = 0;
    } else if (slugPrefix) {
      score = 0;
      tier = 0;
    } else if (namePrefix) {
      score = 1;
      tier = 0;
    } else if (slugIdx >= 0) {
      score = 2 + slugIdx;
      tier = 1;
    } else if (nameIdx >= 0) {
      score = 3 + nameIdx;
      tier = 1;
    } else if (descIdx >= 0) {
      score = 10 + descIdx;
      tier = 1;
    }
    return { item, score, tier };
  });
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.score !== b.score) return a.score - b.score;
    return a.item.slug.localeCompare(b.item.slug);
  });
  const filtered = q.length === 0 ? scored : scored.filter((s) => s.score < 999);
  return filtered.slice(0, maxVisible).map((s) => s.item);
}

export function replaceSkillMentionAtCaret(
  value: string,
  caret: number,
  mentionStart: number,
  slug: string,
): { next: string; caret: number } {
  const before = value.slice(0, mentionStart);
  const after = value.slice(caret);
  const normalized = validateSkillSlug(slug) ?? slug.trim().toLowerCase();
  const insertion = `/${normalized}`;
  const next = `${before}${insertion}${after}`;
  const nextCaret = before.length + insertion.length;
  return { next, caret: nextCaret };
}

export function unknownSlashSkillSlugs(
  mentioned: string[],
  knownSlugs: Set<string>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of mentioned) {
    const s = validateSkillSlug(raw);
    if (!s || knownSlugs.has(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
