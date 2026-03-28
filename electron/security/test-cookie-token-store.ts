import { describe, expect, it } from "vitest";
import { extractCsrfTokenFromHtml } from "./cookie-token-store";

describe("cookie-token-store csrf extraction", () => {
  it("extracts csrf token from meta tag", () => {
    const html = '<html><head><meta name="csrf-token" content="abc123"></head></html>';
    const token = extractCsrfTokenFromHtml(html);
    expect(token?.value).toBe("abc123");
  });

  it("extracts csrf token from hidden input", () => {
    const html = '<form><input type="hidden" name="_csrf" value="tok_9" /></form>';
    const token = extractCsrfTokenFromHtml(html);
    expect(token?.value).toBe("tok_9");
  });
});
