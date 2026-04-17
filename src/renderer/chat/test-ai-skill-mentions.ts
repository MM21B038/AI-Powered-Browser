import { describe, expect, it } from "vitest";
import {
  extractSlashSkillSlugs,
  getActiveSkillQuery,
  unknownSlashSkillSlugs,
  validateSkillSlug,
} from "./ai-skill-mentions";

describe("validateSkillSlug", () => {
  it("accepts valid slugs", () => {
    expect(validateSkillSlug("my-skill")).toBe("my-skill");
    expect(validateSkillSlug("X")).toBe("x");
  });

  it("rejects invalid", () => {
    expect(validateSkillSlug("-bad")).toBe(null);
    expect(validateSkillSlug("")).toBe(null);
  });
});

describe("getActiveSkillQuery", () => {
  it("matches / at start with query", () => {
    expect(getActiveSkillQuery("/foo", 4)).toEqual({ start: 0, query: "foo" });
    expect(getActiveSkillQuery("/Foo-bar", 8)).toEqual({ start: 0, query: "Foo-bar" });
  });

  it("matches after whitespace only", () => {
    expect(getActiveSkillQuery("hey /skill", 10)).toEqual({ start: 4, query: "skill" });
  });

  it("does not match path segments", () => {
    expect(getActiveSkillQuery("path/foo", 8)).toBe(null);
  });

  it("returns null when fragment has whitespace", () => {
    expect(getActiveSkillQuery("/foo bar", 8)).toBe(null);
  });
});

describe("extractSlashSkillSlugs", () => {
  it("finds slugs and dedupes", () => {
    expect(extractSlashSkillSlugs("Use /a and /b /a")).toEqual(["a", "b"]);
  });

  it("ignores path-like segments", () => {
    expect(extractSlashSkillSlugs("open path/foo.txt please")).toEqual([]);
  });

  it("allows multiple mentions", () => {
    expect(extractSlashSkillSlugs("/one, /two.")).toEqual(["one", "two"]);
  });
});

describe("unknownSlashSkillSlugs", () => {
  it("lists unknown only once", () => {
    expect(
      unknownSlashSkillSlugs(["a", "b", "nope"], new Set(["a", "b"])),
    ).toEqual(["nope"]);
  });
});
