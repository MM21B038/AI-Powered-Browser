/**
 * Host-level catalog policy on top of Zod v0.8 validation: optional subset of standard
 * component keys (design-system restriction). See `docs/a2ui-integration-roadmap.md` Phase 4.
 */

import { A2UI_V08_STANDARD_COMPONENT_KEYS } from "./a2ui-catalog-constants";

const STANDARD = new Set<string>(A2UI_V08_STANDARD_COMPONENT_KEYS);

/**
 * When non-null and non-empty, only these keys may appear under `surfaceUpdate.components[].component`.
 * Must be a subset of {@link A2UI_V08_STANDARD_COMPONENT_KEYS}. Unknown entries are ignored.
 * Default `null` — full standard catalog.
 */
export const A2UI_HOST_COMPONENT_ALLOWLIST: readonly string[] | null = null;

/** Effective allowlist: full standard catalog, or a validated non-empty subset. */
export function getEffectiveHostComponentAllowlist(): ReadonlySet<string> {
  const raw = A2UI_HOST_COMPONENT_ALLOWLIST;
  if (!raw?.length) return STANDARD;
  const next = new Set<string>();
  for (const k of raw) {
    if (STANDARD.has(k)) next.add(k);
  }
  return next.size > 0 ? next : STANDARD;
}

function collectComponentKeysFromMessages(messages: readonly unknown[]): string[] {
  const keys: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const rec = m as Record<string, unknown>;
    const su = rec.surfaceUpdate;
    if (!su || typeof su !== "object") continue;
    const components = (su as { components?: unknown }).components;
    if (!Array.isArray(components)) continue;
    for (const item of components) {
      if (!item || typeof item !== "object") continue;
      const compWrap = (item as { component?: unknown }).component;
      if (!compWrap || typeof compWrap !== "object") continue;
      for (const key of Object.keys(compWrap as Record<string, unknown>)) {
        keys.push(key);
      }
    }
  }
  return keys;
}

/**
 * Second validation pass after `A2uiMessageSchema`: enforce host component allowlist.
 */
export function validateHostCatalogPolicy(
  messages: readonly unknown[],
  allowlist: ReadonlySet<string> = getEffectiveHostComponentAllowlist(),
): { ok: true } | { ok: false; error: string } {
  const used = collectComponentKeysFromMessages(messages);
  for (const k of used) {
    if (!allowlist.has(k)) {
      return {
        ok: false,
        error: `Host catalog policy: component "${k}" is not allowed. Allowed keys: ${[...allowlist].sort().join(", ")}`,
      };
    }
  }
  return { ok: true };
}

/** Non-null when a subset is active — extra LLM guidance. */
export function hostCatalogPolicyPromptSupplement(): string | null {
  if (!A2UI_HOST_COMPONENT_ALLOWLIST?.length) return null;
  const keys = [...getEffectiveHostComponentAllowlist()].sort().join(", ");
  return `**Host catalog subset:** Use **only** these \`component\` keys in \`surfaceUpdate\`: ${keys}.`;
}
