/**
 * Security posture and model-facing reminders for A2UI in this host.
 * Complements strict Zod validation (`a2ui-v0_9-validate`) and the host component registry.
 */

/**
 * Appended to the **long** A2UI design appendix — keeps models aligned with defense-in-depth.
 */
export function hostA2uiSecurityPromptSection(): string {
  return `### A2UI — security (host)
- **Validation:** Non-empty NDJSON lines must parse as strict **v0.9** server messages (Zod, \`@a2ui/web_core/v0_9\`) before the panel applies them; broken streams show an error until valid.
- **Trust boundaries:** Only registered catalog components render; unknown shapes fail validation. Prefer semantic props and host theme tokens—do not try to smuggle custom CSS or raw HTML inside A2UI JSON.
- **URLs:** Use \`https:\` links in \`Image\` / \`Video\` / markdown in \`Text\` where possible; avoid \`javascript:\` or opaque data URLs unless the user explicitly needs them.
- **Secrets & PII:** Do not place API keys, tokens, or unnecessary PII in \`updateDataModel\`, \`Text\`, or action \`context\`—context may be sent back to the model on interaction.
- **A2A:** This host sends \`acceptsInlineCatalogs: false\` by default; do not depend on unsolicited inline catalog payloads from the agent.`;
}

/** One-line reminder for the short A2UI checklist. */
export function hostA2uiSecurityPromptOneLiner(): string {
  return "**Security:** Strict v0.9 validation before render; avoid secrets in `updateDataModel` / `Text` / action `context`; prefer safe `https` URLs.";
}
