/**
 * Python sandbox: prefers Docker (isolated container) when available, else host venv + runner.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";
import { PYTHON_SANDBOX_LIMITS } from "../src/shared/python-sandbox-validation";
import {
  isDockerDaemonAvailable,
  isDockerSandboxEnabledByEnv,
  runDockerPythonSandbox,
} from "./python-sandbox-docker";

export type PythonSandboxPayload = {
  packages: string[];
  code: string;
  timeoutMs: number;
  inputFiles?: Array<{ name: string; dataBase64: string }>;
};

export type PythonSandboxImage = { mime: string; dataBase64: string };

export type PythonSandboxTable = { columns: string[]; rows: unknown[][] };

export type PythonSandboxFile = {
  name: string;
  size: number;
  dataBase64?: string;
  truncated?: boolean;
};

export type PythonSandboxInner = {
  success: boolean;
  stdout: string;
  stderr: string;
  images?: PythonSandboxImage[];
  table?: PythonSandboxTable | null;
  files?: PythonSandboxFile[];
  error?: string;
};

const MAX_STD_CHARS = 500_000;
const MAX_IMAGES = 18;
const MAX_IMAGE_B64 = 6 * 1024 * 1024;

function runnerSourcePath(): string {
  return path.join(__dirname, "python-sandbox-runner.py");
}

function truncateStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… [truncated ${s.length - max} chars]`;
}

function killTree(child: ChildProcess | null): void {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    } else {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env, PYTHONNOUSERSITE: "1" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let outBuf = "";
    let errBuf = "";
    child.stdout?.on("data", (c: Buffer) => {
      outBuf += c.toString("utf8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      errBuf += c.toString("utf8");
    });
    const t = setTimeout(() => {
      killTree(child);
    }, opts.timeoutMs);
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, stderr: errBuf, stdout: outBuf });
    });
    child.on("error", () => {
      clearTimeout(t);
      resolve({ code: -1, stderr: errBuf, stdout: outBuf });
    });
  });
}

function pipLog(r: { stdout: string; stderr: string }): string {
  const a = r.stdout.trim();
  const b = r.stderr.trim();
  if (a && b) return `${a}\n${b}`;
  return a || b;
}

function resolvePythonExe(): string | null {
  if (process.platform === "win32") {
    try {
      const o = execFileSync("py", ["-3", "-c", "import sys; print(sys.executable)"], {
        encoding: "utf8",
        windowsHide: true,
      }).trim();
      if (o && fs.existsSync(o)) return o;
    } catch {
      /* try next */
    }
  }
  const bins = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];
  for (const bin of bins) {
    try {
      const o = execFileSync(bin, ["-c", "import sys; print(sys.executable)"], {
        encoding: "utf8",
        windowsHide: true,
      }).trim();
      if (o && fs.existsSync(o)) return o;
    } catch {
      /* continue */
    }
  }
  return null;
}

function venvPython(workDir: string): string {
  return process.platform === "win32"
    ? path.join(workDir, ".venv", "Scripts", "python.exe")
    : path.join(workDir, ".venv", "bin", "python");
}

function writeDockerEntryScript(workDir: string): void {
  /** No venv: faster startup. Install to /tmp (container FS) — avoids slow pip/venv I/O on Windows bind mounts. */
  const script = `#!/bin/sh
set -e
cd /work
export PIP_DISABLE_PIP_VERSION_CHECK=1
export PIP_PROGRESS_BAR=off
mkdir -p /tmp/ab-deps
export PYTHONPATH=/tmp/ab-deps
export PYTHONNOUSERSITE=1
export MPLBACKEND=Agg
if [ -f extra-requirements.txt ] && [ -s extra-requirements.txt ]; then
  python3 -m pip install --target /tmp/ab-deps -r extra-requirements.txt
fi
exec python3 python-sandbox-runner.py user_code.py /work
`;
  fs.writeFileSync(path.join(workDir, "docker-entry.sh"), script, { encoding: "utf8", mode: 0o644 });
}

function writeInputFiles(
  workDir: string,
  inputFiles: PythonSandboxPayload["inputFiles"],
): { ok: true } | { ok: false; error: string } {
  if (!inputFiles?.length) return { ok: true };
  if (inputFiles.length > PYTHON_SANDBOX_LIMITS.maxInputFiles) {
    return {
      ok: false,
      error: `Too many input files (max ${PYTHON_SANDBOX_LIMITS.maxInputFiles}).`,
    };
  }
  const prepared: Array<{ safe: string; buf: Buffer }> = [];
  const seen = new Set<string>();
  let inputTotal = 0;
  for (const f of inputFiles) {
    const rawName = typeof f.name === "string" ? path.basename(f.name.trim()) : "";
    const safe =
      rawName.replace(/[^\w.\- ()[\]]+/g, "_").trim().slice(0, 180) || "file.bin";
    if (seen.has(safe)) {
      return { ok: false, error: `Duplicate input file name: ${safe}` };
    }
    seen.add(safe);
    let buf: Buffer;
    try {
      buf = Buffer.from(f.dataBase64, "base64");
    } catch {
      return { ok: false, error: `Invalid base64 for input file: ${safe}` };
    }
    if (buf.length > PYTHON_SANDBOX_LIMITS.maxInputFileBytes) {
      return { ok: false, error: `Input file too large: ${safe}` };
    }
    inputTotal += buf.length;
    prepared.push({ safe, buf });
  }
  if (inputTotal > PYTHON_SANDBOX_LIMITS.maxInputFilesTotalBytes) {
    return { ok: false, error: "Total input file size exceeds limit." };
  }
  for (const p of prepared) {
    fs.writeFileSync(path.join(workDir, p.safe), p.buf);
  }
  return { ok: true };
}

/**
 * Materialize user code, runner, optional pip requirements, and Docker entry script.
 */
function writeWorkDirPayload(workDir: string, payload: PythonSandboxPayload): { ok: true } | { ok: false; error: string } {
  const userPy = path.join(workDir, "user_code.py");
  fs.writeFileSync(userPy, payload.code, "utf8");
  fs.mkdirSync(path.join(workDir, "output"), { recursive: true });

  const rs = runnerSourcePath();
  if (!fs.existsSync(rs)) {
    return { ok: false, error: `Bundled runner missing: ${rs}` };
  }
  fs.copyFileSync(rs, path.join(workDir, "python-sandbox-runner.py"));

  const reqPath = path.join(workDir, "extra-requirements.txt");
  if (payload.packages.length > 0) {
    fs.writeFileSync(reqPath, `${payload.packages.join("\n")}\n`, "utf8");
  } else {
    fs.writeFileSync(reqPath, "", "utf8");
  }

  writeDockerEntryScript(workDir);

  const inp = writeInputFiles(workDir, payload.inputFiles);
  if (!inp.ok) return inp;
  return { ok: true };
}

function readResultJsonUtf8(resultPath: string): string {
  const buf = fs.readFileSync(resultPath);
  const stripBom =
    buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
      ? buf.subarray(3)
      : buf;
  return stripBom.toString("utf8");
}

function parseResultJson(
  workDir: string,
  extraStderr: string,
): { ok: true; python_sandbox: PythonSandboxInner } | { ok: false; error: string } {
  const resultPath = path.join(workDir, "result.json");
  if (!fs.existsSync(resultPath)) {
    return { ok: false, error: "Missing result.json from runner." };
  }

  let size = -1;
  try {
    size = fs.statSync(resultPath).size;
  } catch {
    /* ignore */
  }

  let jsonText: string;
  try {
    jsonText = readResultJsonUtf8(resultPath);
  } catch (readErr) {
    const msg = readErr instanceof Error ? readErr.message : String(readErr);
    return {
      ok: false,
      error: `Could not read result.json (${size >= 0 ? `${size} bytes` : "unknown size"}): ${msg}`,
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText) as unknown;
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    const oneLine = jsonText.replace(/\s+/g, " ").trim();
    const prefix = oneLine.length > 320 ? `${oneLine.slice(0, 320)}…` : oneLine;
    return {
      ok: false,
      error: `Invalid result.json from runner (${size >= 0 ? `${size} bytes` : "unknown size"}): ${msg}. Prefix: ${prefix}`,
    };
  }
  const o = raw as Record<string, unknown>;
  const inner: PythonSandboxInner = {
    success: Boolean(o.success),
    stdout: truncateStr(String(o.stdout ?? ""), MAX_STD_CHARS),
    stderr: truncateStr(String(o.stderr ?? "") + (extraStderr ? `\n${extraStderr}` : ""), MAX_STD_CHARS),
  };
  if (typeof o.error === "string" && o.error) inner.error = o.error;

  const imgs = Array.isArray(o.images) ? o.images : [];
  const images: PythonSandboxImage[] = [];
  for (const im of imgs.slice(0, MAX_IMAGES)) {
    if (!im || typeof im !== "object") continue;
    const m = im as Record<string, unknown>;
    const mime = String(m.mime ?? "image/png");
    const b64 = String(m.dataBase64 ?? "");
    if (!b64) continue;
    if (b64.length > MAX_IMAGE_B64) continue;
    images.push({ mime, dataBase64: b64 });
  }
  if (images.length) inner.images = images;

  if (o.table && typeof o.table === "object") {
    const t = o.table as Record<string, unknown>;
    if (Array.isArray(t.columns) && Array.isArray(t.rows)) {
      inner.table = {
        columns: t.columns.map((c) => String(c)),
        rows: t.rows as unknown[][],
      };
    }
  }

  const filesRaw = Array.isArray(o.files) ? o.files : [];
  const files: PythonSandboxFile[] = [];
  for (const f of filesRaw) {
    if (!f || typeof f !== "object") continue;
    const fr = f as Record<string, unknown>;
    files.push({
      name: String(fr.name ?? "file"),
      size: Number(fr.size ?? 0),
      ...(typeof fr.dataBase64 === "string" ? { dataBase64: fr.dataBase64 } : {}),
      ...(fr.truncated === true ? { truncated: true } : {}),
    });
  }
  if (files.length) inner.files = files;

  if (!inner.success) {
    inner.error = inner.error || `python exited with error`;
  }

  return { ok: true, python_sandbox: inner };
}

async function runHostVenvSandbox(
  workDir: string,
  payload: PythonSandboxPayload,
  timeoutMs: number,
  pipTimeout: number,
  runTimeout: number,
): Promise<{ ok: boolean; error?: string; python_sandbox?: PythonSandboxInner }> {
  const py0 = resolvePythonExe();
  if (!py0) {
    return { ok: false, error: "Python not found on PATH (install Python 3 and ensure py/python is available)." };
  }

  const runnerInWork = path.join(workDir, "python-sandbox-runner.py");
  const userPy = path.join(workDir, "user_code.py");
  const venvTimeout = Math.min(120_000, timeoutMs);

  const venvRes = await runProcess(py0, ["-m", "venv", ".venv"], {
    cwd: workDir,
    timeoutMs: venvTimeout,
  });
  if (venvRes.code !== 0) {
    return {
      ok: false,
      error: `venv failed: ${pipLog(venvRes) || `exit ${venvRes.code}`}`,
    };
  }

  const py = venvPython(workDir);
  if (!fs.existsSync(py)) {
    return { ok: false, error: "venv python missing after creation." };
  }

  if (payload.packages.length > 0) {
    const pipArgs = [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "--no-warn-script-location",
      ...payload.packages,
    ];
    const pipRes = await runProcess(py, pipArgs, {
      cwd: workDir,
      timeoutMs: pipTimeout,
      env: {
        PIP_DISABLE_PIP_VERSION_CHECK: "1",
        PIP_PROGRESS_BAR: "off",
      },
    });
    if (pipRes.code !== 0) {
      return {
        ok: false,
        error: `pip install failed (exit ${pipRes.code}): ${truncateStr(pipLog(pipRes), 12_000)}`,
      };
    }
  }

  const child = spawn(py, [runnerInWork, userPy, workDir], {
    cwd: workDir,
    env: { ...process.env, PYTHONNOUSERSITE: "1", MPLBACKEND: "Agg" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errRun = "";
  child.stderr?.on("data", (c: Buffer) => {
    errRun += c.toString("utf8");
  });
  const killTimer = setTimeout(() => killTree(child), runTimeout);
  const exitCode: number | null = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code));
    child.on("error", () => resolve(-1));
  });
  clearTimeout(killTimer);

  const resultPath = path.join(workDir, "result.json");
  if (!fs.existsSync(resultPath)) {
    return {
      ok: false,
      error: `Python exited (${exitCode}) before writing result. ${truncateStr(errRun, 4000)}`,
    };
  }

  const parsed = parseResultJson(workDir, errRun);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, python_sandbox: parsed.python_sandbox };
}

export async function executePythonSandbox(payload: PythonSandboxPayload): Promise<{
  ok: boolean;
  error?: string;
  python_sandbox?: PythonSandboxInner;
}> {
  const workDir = path.join(os.tmpdir(), `ab-python-${randomUUID()}`);
  fs.mkdirSync(workDir, { recursive: true });

  const prep = writeWorkDirPayload(workDir, payload);
  if (!prep.ok) {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return { ok: false, error: prep.error };
  }

  const timeoutMs = Math.max(30_000, Math.min(600_000, payload.timeoutMs));
  const pipTimeout =
    payload.packages.length > 0
      ? Math.min(600_000, Math.max(180_000, Math.floor(timeoutMs * 0.88)))
      : 0;
  const runTimeout = timeoutMs;

  try {
    let triedDocker = false;
    if (isDockerSandboxEnabledByEnv()) {
      const dockerOk = await isDockerDaemonAvailable();
      if (dockerOk) {
        triedDocker = true;
        const dr = await runDockerPythonSandbox(workDir, { timeoutMs });
        const resultPath = path.join(workDir, "result.json");
        if (fs.existsSync(resultPath)) {
          const parsed = parseResultJson(workDir, dr.stderr);
          if (parsed.ok) return { ok: true, python_sandbox: parsed.python_sandbox };
          return { ok: false, error: parsed.error };
        }
        /** Docker did not produce result.json (pip/venv/script failure). Fall back to host. */
      }
    }

    if (triedDocker) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      fs.mkdirSync(workDir, { recursive: true });
      const again = writeWorkDirPayload(workDir, payload);
      if (!again.ok) {
        return { ok: false, error: again.error };
      }
    }

    return await runHostVenvSandbox(workDir, payload, timeoutMs, pipTimeout, runTimeout);
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
