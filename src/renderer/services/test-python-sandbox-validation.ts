import { describe, expect, it } from "vitest";
import {
  clampPythonTimeoutMs,
  validatePythonCode,
  validatePythonPackageSpecs,
  PYTHON_SANDBOX_LIMITS,
} from "../../shared/python-sandbox-validation";

describe("python-sandbox-validation", () => {
  it("accepts valid package specs", () => {
    expect(validatePythonPackageSpecs(["numpy", "pandas==2.2.0"])).toEqual(["numpy", "pandas==2.2.0"]);
  });

  it("treats missing or null packages as none", () => {
    expect(validatePythonPackageSpecs(undefined)).toEqual([]);
    expect(validatePythonPackageSpecs(null)).toEqual([]);
  });

  it("filters empty package slots instead of failing", () => {
    expect(validatePythonPackageSpecs(["", "numpy", "  "])).toEqual(["numpy"]);
    expect(validatePythonPackageSpecs([""])).toEqual([]);
  });

  it("rejects invalid package spec characters", () => {
    const r = validatePythonPackageSpecs(["numpy;curl"]);
    expect(r).toBeInstanceOf(Error);
  });

  it("rejects too many packages", () => {
    const pkgs = Array.from({ length: PYTHON_SANDBOX_LIMITS.maxPackages + 1 }, (_, i) => `p${i}`);
    expect(validatePythonPackageSpecs(pkgs)).toBeInstanceOf(Error);
  });

  it("validates code", () => {
    expect(validatePythonCode("print(1)")).toBe("print(1)");
    expect(validatePythonCode("")).toBeInstanceOf(Error);
  });

  it("clamps timeout", () => {
    expect(clampPythonTimeoutMs(undefined)).toBe(PYTHON_SANDBOX_LIMITS.defaultTimeoutMs);
    expect(clampPythonTimeoutMs(10_000)).toBe(PYTHON_SANDBOX_LIMITS.minTimeoutMs);
    expect(clampPythonTimeoutMs(9_000_000)).toBe(PYTHON_SANDBOX_LIMITS.maxTimeoutMs);
  });
});
