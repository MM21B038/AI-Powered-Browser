/** Pip spec characters: package names, version pins, extras. */
const PACKAGE_SPEC_RE = /^[a-zA-Z0-9_.+\-\[\]=~<>,!@/]+$/;

export const PYTHON_SANDBOX_LIMITS = {
  maxCodeChars: 256_000,
  maxPackages: 20,
  minTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  /** Enough for venv + pip install (pandas/matplotlib wheels) + script run when omitted. */
  defaultTimeoutMs: 300_000,
  maxInputFiles: 12,
  maxInputFileBytes: 50 * 1024 * 1024,
  maxInputFilesTotalBytes: 200 * 1024 * 1024,
} as const;

export function validatePythonPackageSpecs(packages: unknown): string[] | Error {
  if (packages === undefined || packages === null) return [];
  if (!Array.isArray(packages)) return new Error("packages must be an array");
  if (packages.length > PYTHON_SANDBOX_LIMITS.maxPackages) {
    return new Error(`At most ${PYTHON_SANDBOX_LIMITS.maxPackages} packages`);
  }
  const out: string[] = [];
  for (const p of packages) {
    if (typeof p !== "string") return new Error("each package must be a string");
    const s = p.trim();
    if (!s) continue;
    if (s.length > 200) return new Error("package spec too long");
    if (!PACKAGE_SPEC_RE.test(s)) return new Error(`invalid package spec: ${s.slice(0, 48)}`);
    out.push(s);
  }
  return out;
}

export function validatePythonCode(code: unknown): string | Error {
  if (typeof code !== "string") return new Error("code must be a string");
  const s = code;
  if (!s.trim()) return new Error("code required");
  if (s.length > PYTHON_SANDBOX_LIMITS.maxCodeChars) {
    return new Error(`code exceeds ${PYTHON_SANDBOX_LIMITS.maxCodeChars} characters`);
  }
  return s;
}

export function clampPythonTimeoutMs(raw: unknown): number {
  const d = PYTHON_SANDBOX_LIMITS.defaultTimeoutMs;
  if (raw == null || raw === undefined) return d;
  const n = Number(raw);
  if (!Number.isFinite(n)) return d;
  const t = Math.floor(n);
  return Math.min(
    PYTHON_SANDBOX_LIMITS.maxTimeoutMs,
    Math.max(PYTHON_SANDBOX_LIMITS.minTimeoutMs, t),
  );
}
