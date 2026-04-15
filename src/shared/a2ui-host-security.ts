/**
 * Security posture and model-facing reminders for A2UI in this host.
 * Complements strict Zod validation (`a2ui-strict-validate`) and renderer allowlists.
 */

/**
 * Appended to the **long** A2UI design appendix — keeps models aligned with defense-in-depth.
 */
export function hostA2uiSecurityPromptSection(): string {
  return `### A2UI — security (host)
- **Validation:** Non-empty lines must parse as strict v0.8 server messages (Zod, same family as \`@a2ui/web_core\`) before the panel applies them; broken streams show an error until valid.
- **Trust boundaries:** Only registered catalog components render; unknown shapes fail validation. Prefer **semantic** \`usageHint\` and host theme tokens—do not try to smuggle custom CSS or raw HTML inside A2UI JSON.
- **URLs:** Use \`https:\` links in \`Image\` / \`Video\` / markdown in \`Text\` where possible; avoid \`javascript:\` or opaque data URLs unless the user explicitly needs them.
- **Secrets & PII:** Do not place API keys, tokens, or unnecessary PII in \`dataModelUpdate\`, \`Text\`, or \`Button.action.context\`—action context may be sent back to the model on click.
- **A2A:** This host sends \`acceptsInlineCatalogs: false\` by default; do not depend on unsolicited inline catalog payloads from the agent.`;
}

/** One-line reminder for the short A2UI checklist. */
export function hostA2uiSecurityPromptOneLiner(): string {
  return "**Security:** Strict v0.8 validation before render; avoid secrets in `dataModelUpdate` / `Text` / `action.context`; prefer safe `https` URLs.";
}
