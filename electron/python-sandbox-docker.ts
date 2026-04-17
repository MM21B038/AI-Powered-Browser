/**
 * Optional Docker-based isolation for Python sandbox (same /work layout as host venv).
 * Requires Docker Engine / Docker Desktop on PATH.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_IMAGE = "python:3.12-slim-bookworm";

/** Named volume so pip reuses downloaded wheels across runs (large speedup for pandas/numpy, etc.). */
const PIP_CACHE_VOLUME = "ab-python-sandbox-pip-cache";

/*
 * Optional env tuning (Docker path):
 *   AB_PYTHON_DOCKER=0 — disable Docker, use host venv only.
 *   AB_PYTHON_SANDBOX_IMAGE — base image (default python:3.12-slim-bookworm).
 *   AB_PYTHON_SANDBOX_MEMORY — container memory (default 4096m).
 *   AB_PYTHON_SANDBOX_CPUS — CPU limit (default 4).
 *   AB_PYTHON_SANDBOX_NO_PIP_CACHE=1 — skip pip cache volume mount.
 */

/** Set AB_PYTHON_DOCKER=0 to force host venv only. */
export function isDockerSandboxEnabledByEnv(): boolean {
  return process.env.AB_PYTHON_DOCKER !== "0";
}

export async function isDockerDaemonAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info"], {
      timeout: 8_000,
      windowsHide: true,
      maxBuffer: 512 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

function resolveDockerImage(): string {
  const raw = process.env.AB_PYTHON_SANDBOX_IMAGE?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_IMAGE;
}

function killTree(child: ChildProcess | null): void {
  if (!child?.pid) return;
  try {
    child.kill("SIGKILL");
  } catch {
    /* ignore */
  }
}

/**
 * Runs `docker run` with the work directory mounted at /work and executes /work/docker-entry.sh.
 * Network is enabled so pip can install packages inside the container.
 */
export async function runDockerPythonSandbox(
  workDir: string,
  opts: { timeoutMs: number },
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  const image = resolveDockerImage();
  const memory = process.env.AB_PYTHON_SANDBOX_MEMORY?.trim() || "4096m";
  const cpus = process.env.AB_PYTHON_SANDBOX_CPUS?.trim() || "4";
  const skipPipCache = process.env.AB_PYTHON_SANDBOX_NO_PIP_CACHE === "1";

  const args = [
    "run",
    "--rm",
    ...(skipPipCache
      ? []
      : (["-v", `${PIP_CACHE_VOLUME}:/root/.cache/pip`] as const)),
    "-v",
    `${workDir}:/work`,
    "-w",
    "/work",
    "--memory",
    memory,
    "--cpus",
    cpus,
    "--pids-limit",
    "512",
    image,
    "sh",
    "/work/docker-entry.sh",
  ];

  return new Promise((resolve) => {
    const child = spawn("docker", args, {
      env: { ...process.env },
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
    child.on("error", (e) => {
      clearTimeout(t);
      resolve({
        code: -1,
        stderr: `${errBuf}\n${e instanceof Error ? e.message : String(e)}`,
        stdout: outBuf,
      });
    });
  });
}
