/**
 * User-defined SKILL.md files under userData/skills/<slug>/SKILL.md
 */
import fs from "node:fs/promises";
import path from "node:path";

export const SKILL_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const MAX_SKILL_BYTES = 256 * 1024;
const DEFAULT_PROMPT_MAX_CHARS = 24_000;

export type UserSkillListItem = {
  slug: string;
  name: string;
  description: string;
  updatedAt: number;
};

export type UserSkillsPromptAppendResult = {
  text: string;
  truncated: boolean;
  omittedSlugs: string[];
};

export function skillsRootDir(userDataPath: string): string {
  return path.join(userDataPath, "skills");
}

export function validateSlug(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!SKILL_SLUG_REGEX.test(s)) return null;
  return s;
}

function leadingSpaces(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1]!.length : 0;
}

function unquoteScalar(s: string): string {
  let t = s.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    t = t.slice(1, -1);
  }
  return t;
}

/** Parse YAML frontmatter between first pair of --- lines (name + description for skills). */
function parseFrontmatterBlock(markdown: string): { name: string; description: string } {
  const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { name: "", description: "" };
  return parseFrontmatterInner(m[1] ?? "");
}

function parseFrontmatterInner(block: string): { name: string; description: string } {
  const lines = block.split(/\r?\n/);
  let name = "";
  let description = "";
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    const nameM = raw.match(/^(\s*)name:\s*(.*)$/i);
    if (nameM) {
      name = unquoteScalar(nameM[2] ?? "");
      i++;
      continue;
    }
    const descM = raw.match(/^(\s*)description:\s*(.*)$/i);
    if (descM) {
      const keyIndent = descM[1]!.length;
      const rest = (descM[2] ?? "").trim();
      if (rest === "" || rest === "|" || rest === "|-" || rest === ">" || rest === ">-") {
        i++;
        const { text, nextLine } = parseIndentedScalarBlock(lines, i, keyIndent);
        description = text;
        i = nextLine;
        continue;
      }
      description = unquoteScalar(descM[2] ?? "");
      i++;
      continue;
    }
    i++;
  }
  return { name, description };
}

/** Block-style or indented YAML string value after `description: |` or `description:` with following lines. */
function parseIndentedScalarBlock(
  lines: string[],
  start: number,
  keyIndent: number,
): { text: string; nextLine: number } {
  let i = start;
  const rawLines: string[] = [];
  while (i < lines.length) {
    const L = lines[i]!;
    if (L.trim() === "") {
      rawLines.push("");
      i++;
      continue;
    }
    const ind = leadingSpaces(L);
    if (ind <= keyIndent && /^[a-zA-Z_][\w-]*\s*:/.test(L.trim())) break;
    rawLines.push(L);
    i++;
  }
  const nonEmpty = rawLines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return { text: "", nextLine: i };
  const minInd = Math.min(...nonEmpty.map((l) => leadingSpaces(l)));
  const dedented = rawLines.map((l) => (l.trim() === "" ? "" : l.slice(minInd)));
  return { text: dedented.join("\n").trim(), nextLine: i };
}

/**
 * SKILL.md must start with --- frontmatter and include a non-empty description (used in skill list and matching).
 */
export function validateSkillMarkdownForWrite(markdown: string): { ok: true } | { ok: false; error: string } {
  const md = typeof markdown === "string" ? markdown : "";
  const trimmed = md.trimStart();
  if (!trimmed.startsWith("---")) {
    return { ok: false, error: "missing_frontmatter" };
  }
  const { description } = parseFrontmatterBlock(md);
  if (!description.trim()) {
    return { ok: false, error: "missing_description" };
  }
  return { ok: true };
}

export async function ensureSkillsRoot(userDataPath: string): Promise<string> {
  const root = skillsRootDir(userDataPath);
  await fs.mkdir(root, { recursive: true });
  return root;
}

export async function listUserSkills(userDataPath: string): Promise<UserSkillListItem[]> {
  const root = await ensureSkillsRoot(userDataPath);
  let names: string[] = [];
  try {
    names = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: UserSkillListItem[] = [];
  for (const name of names) {
    const slug = validateSlug(name);
    if (!slug) continue;
    const skillPath = path.join(root, slug, "SKILL.md");
    try {
      const st = await fs.stat(skillPath);
      if (!st.isFile()) continue;
      const raw = await fs.readFile(skillPath, "utf8");
      const { name: displayName, description } = parseFrontmatterBlock(raw);
      out.push({
        slug,
        name: displayName || slug,
        description,
        updatedAt: Math.floor(st.mtimeMs),
      });
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}

export async function readUserSkillMarkdown(
  userDataPath: string,
  slugRaw: string,
): Promise<{ ok: true; markdown: string } | { ok: false; error: string }> {
  const slug = validateSlug(slugRaw);
  if (!slug) return { ok: false, error: "invalid_slug" };
  const skillPath = path.join(skillsRootDir(userDataPath), slug, "SKILL.md");
  try {
    const buf = await fs.readFile(skillPath);
    if (buf.length > MAX_SKILL_BYTES) return { ok: false, error: "skill_too_large" };
    return { ok: true, markdown: buf.toString("utf8") };
  } catch {
    return { ok: false, error: "not_found" };
  }
}

export async function writeUserSkillMarkdown(
  userDataPath: string,
  slugRaw: string,
  markdown: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const slug = validateSlug(slugRaw);
  if (!slug) return { ok: false, error: "invalid_slug" };
  const md = typeof markdown === "string" ? markdown : "";
  const bytes = Buffer.byteLength(md, "utf8");
  if (bytes > MAX_SKILL_BYTES) return { ok: false, error: "skill_too_large" };
  const v = validateSkillMarkdownForWrite(md);
  if (!v.ok) return v;
  const dir = path.join(skillsRootDir(userDataPath), slug);
  await fs.mkdir(dir, { recursive: true });
  const skillPath = path.join(dir, "SKILL.md");
  await fs.writeFile(skillPath, md, "utf8");
  return { ok: true };
}

export async function deleteUserSkill(
  userDataPath: string,
  slugRaw: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const slug = validateSlug(slugRaw);
  if (!slug) return { ok: false, error: "invalid_slug" };
  const dir = path.join(skillsRootDir(userDataPath), slug);
  try {
    await fs.rm(dir, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Concatenate enabled skills for system prompt; cap total chars; drop tail slugs if needed.
 */
export async function buildUserSkillsPromptAppend(
  userDataPath: string,
  enabledSlugs: string[],
  maxChars: number = DEFAULT_PROMPT_MAX_CHARS,
): Promise<UserSkillsPromptAppendResult> {
  const omittedSlugs: string[] = [];
  if (!enabledSlugs.length) {
    return { text: "", truncated: false, omittedSlugs: [] };
  }
  const parts: string[] = [];
  const header =
    "\n\n## User skills (follow when relevant)\n\nThese instructions were saved by the user. Apply when the task matches a skill's description; prefer them over generic guesses.\n\n";
  let used = header.length;

  for (const raw of enabledSlugs) {
    const slug = validateSlug(raw);
    if (!slug) continue;
    const r = await readUserSkillMarkdown(userDataPath, slug);
    if (!r.ok) {
      omittedSlugs.push(slug);
      continue;
    }
    const block = `### Skill: ${slug}\n\n${r.markdown.trim()}\n\n---\n\n`;
    if (used + block.length > maxChars) {
      omittedSlugs.push(slug);
      continue;
    }
    parts.push(block);
    used += block.length;
  }

  const body = parts.join("");
  if (body.length === 0) {
    return { text: "", truncated: false, omittedSlugs };
  }
  return { text: header + body, truncated: false, omittedSlugs };
}

export function resolveSkillsPromptMaxChars(): number {
  const raw = process.env.AB_USER_SKILLS_PROMPT_MAX_CHARS?.trim();
  if (!raw) return DEFAULT_PROMPT_MAX_CHARS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 512 ? Math.min(n, 500_000) : DEFAULT_PROMPT_MAX_CHARS;
}
