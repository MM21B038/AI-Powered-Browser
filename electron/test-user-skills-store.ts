import { describe, expect, it } from "vitest";
import {
  listUserSkills,
  validateSkillMarkdownForWrite,
  writeUserSkillMarkdown,
} from "./user-skills-store";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("user-skills-store", () => {
  it("validateSkillMarkdownForWrite rejects missing frontmatter", () => {
    expect(validateSkillMarkdownForWrite("# Hi")).toEqual({ ok: false, error: "missing_frontmatter" });
  });

  it("validateSkillMarkdownForWrite rejects empty description", () => {
    const md = `---
name: Foo
description:
---
Body`;
    expect(validateSkillMarkdownForWrite(md)).toEqual({ ok: false, error: "missing_description" });
  });

  it("validateSkillMarkdownForWrite accepts single-line description", () => {
    const md = `---
name: Foo
description: When to use this skill and what it covers.
---
# Body`;
    expect(validateSkillMarkdownForWrite(md)).toEqual({ ok: true });
  });

  it("parseFrontmatterBlock reads multiline description (list display)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ab-skills-"));
    const slug = "test-multiline-desc";
    const md = `---
name: Multiline Test
description: |
  First line.
  Second line.
---
# Hi`;
    const w = await writeUserSkillMarkdown(dir, slug, md);
    expect(w).toEqual({ ok: true });
    const items = await listUserSkills(dir);
    const row = items.find((x) => x.slug === slug);
    expect(row?.description).toContain("First line");
    expect(row?.description).toContain("Second line");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writeUserSkillMarkdown rejects when description missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ab-skills-"));
    const slug = "no-desc";
    const md = `---
name: Only Name
---
# Body`;
    const w = await writeUserSkillMarkdown(dir, slug, md);
    expect(w).toEqual({ ok: false, error: "missing_description" });
    await fs.rm(dir, { recursive: true, force: true });
  });
});
