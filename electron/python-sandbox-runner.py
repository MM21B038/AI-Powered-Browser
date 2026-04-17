"""
Executed inside ephemeral venv work directory. Args: user_code.py path, work_dir path.
Writes result.json in work_dir. User may write files under work_dir (e.g. output/ or subdirs).
"""
from __future__ import annotations

import base64
import io
import json
import math
import os
import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: python-sandbox-runner.py <user_code.py> <work_dir>", file=sys.stderr)
        sys.exit(2)
    user_path = os.path.abspath(sys.argv[1])
    work = os.path.abspath(sys.argv[2])
    out_path = os.path.join(work, "result.json")
    output_dir = os.path.join(work, "output")
    os.makedirs(output_dir, exist_ok=True)

    os.environ.setdefault("MPLBACKEND", "Agg")

    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    ns: dict = {"__name__": "__main__", "output_dir": output_dir}

    err_trace: str | None = None
    try:
        with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
            with open(user_path, encoding="utf-8") as f:
                code = compile(f.read(), user_path, "exec")
            exec(code, ns, ns)
    except Exception:
        err_trace = traceback.format_exc()

    images: list[dict[str, str]] = []
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        for num in plt.get_fignums():
            fig = plt.figure(num)
            bio = io.BytesIO()
            fig.savefig(bio, format="png", bbox_inches="tight")
            images.append(
                {
                    "mime": "image/png",
                    "dataBase64": base64.b64encode(bio.getvalue()).decode("ascii"),
                }
            )
        plt.close("all")
    except Exception:
        pass

    table: dict | None = None
    df = ns.get("df")
    if df is not None:
        try:
            import pandas as pd

            if isinstance(df, pd.DataFrame):
                dff = df.head(100)
                cols = [str(c) for c in dff.columns.tolist()]
                rows = []
                for _, row in dff.iterrows():
                    rows.append([_json_cell(x) for x in row.tolist()])
                table = {"columns": cols, "rows": rows}
        except Exception:
            pass

    files: list[dict[str, object]] = []
    max_file = 8 * 1024 * 1024
    max_walk_depth = 10
    max_output_files = 120
    max_preview_images = 18
    max_preview_raw = 4 * 1024 * 1024
    deny_exact = {
        "user_code.py",
        "result.json",
        "python-sandbox-runner.py",
        "extra-requirements.txt",
        "docker-entry.sh",
    }

    def append_file(rel_name: str, fp: str) -> None:
        try:
            st = os.stat(fp)
            sz = st.st_size
            entry: dict[str, object] = {"name": rel_name.replace("\\", "/"), "size": sz}
            if sz <= max_file:
                with open(fp, "rb") as f:
                    entry["dataBase64"] = base64.b64encode(f.read()).decode("ascii")
            else:
                entry["truncated"] = True
            files.append(entry)
        except OSError:
            pass

    def skip_walk_dir(name: str) -> bool:
        if name in {".venv", "__pycache__", ".git"}:
            return True
        if name.startswith(".") and name not in {".", ".."}:
            return True
        return False

    candidates: list[tuple[str, str]] = []
    if os.path.isdir(work):
        w_abs = os.path.abspath(work)
        for root, dirs, filenames in os.walk(w_abs, topdown=True):
            rel_root = os.path.relpath(root, w_abs)
            depth = 0 if rel_root in {".", os.curdir} else rel_root.count(os.sep) + 1
            dirs[:] = [d for d in sorted(dirs) if not skip_walk_dir(d)]
            if depth > max_walk_depth:
                dirs[:] = []
                continue
            for fn in sorted(filenames):
                if fn.startswith("."):
                    continue
                fp = os.path.join(root, fn)
                if not os.path.isfile(fp):
                    continue
                rel = os.path.relpath(fp, w_abs).replace("\\", "/")
                base = os.path.basename(rel)
                if base in deny_exact or rel in deny_exact:
                    continue
                candidates.append((rel, fp))
        candidates.sort(key=lambda t: t[0])
        for rel, fp in candidates[:max_output_files]:
            append_file(rel, fp)

        # Inline previews for savefig()+close() workflows (PNG/JPEG on disk).
        seen_b64_preview: set[str] = {im.get("dataBase64", "") for im in images}
        seen_b64_preview.discard("")
        for rel, fp in candidates:
            if len(images) >= max_preview_images:
                break
            rel_l = rel.lower()
            if not (
                rel_l.endswith(".png")
                or rel_l.endswith(".jpg")
                or rel_l.endswith(".jpeg")
            ):
                continue
            try:
                st = os.stat(fp)
                if st.st_size == 0 or st.st_size > max_preview_raw:
                    continue
                with open(fp, "rb") as rf:
                    raw_bytes = rf.read()
                b64 = base64.b64encode(raw_bytes).decode("ascii")
                if b64 in seen_b64_preview:
                    continue
                seen_b64_preview.add(b64)
                mime = "image/png" if rel_l.endswith(".png") else "image/jpeg"
                images.append({"mime": mime, "dataBase64": b64})
            except OSError:
                pass

    success = err_trace is None
    result = {
        "success": success,
        "stdout": stdout_buf.getvalue(),
        "stderr": stderr_buf.getvalue() + (err_trace or ""),
        "images": images,
        "table": table,
        "files": files,
    }
    if err_trace:
        result["error"] = err_trace

    result = _deep_sanitize_for_json(result)

    try:
        payload = json.dumps(result, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError) as ex:
        result = {
            "success": False,
            "stdout": stdout_buf.getvalue(),
            "stderr": (stderr_buf.getvalue() + (err_trace or "") + f"\n[runner] could not serialize result: {ex}"),
            "images": [],
            "table": None,
            "files": [],
            "error": f"result serialization failed: {ex}",
        }
        payload = json.dumps(result, ensure_ascii=False, allow_nan=False)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(payload)


def _json_cell(x: object) -> object:
    if x is None:
        return None
    if isinstance(x, (bool, str, int)):
        return x
    if isinstance(x, float):
        if math.isnan(x) or math.isinf(x):
            return None
        return x
    try:
        import pandas as pd
        import numpy as np

        _na = getattr(pd, "NA", None)
        if _na is not None and x is _na:
            return None
        try:
            if pd.isna(x) and not isinstance(x, (bool, np.bool_)):
                return None
        except Exception:
            pass
        if isinstance(x, pd.Timestamp):
            return x.isoformat()
        if isinstance(x, np.datetime64):
            return str(x)
        if isinstance(x, np.integer):
            return int(x)
        if isinstance(x, np.floating):
            v = float(x)
            return None if (math.isnan(v) or math.isinf(v)) else v
        if isinstance(x, np.bool_):
            return bool(x)
    except Exception:
        pass
    return str(x)


def _deep_sanitize_for_json(obj: object) -> object:
    """Make structures JSON-safe (NaN/Inf, numpy/pandas scalars, nested lists/dicts)."""
    if obj is None or isinstance(obj, bool):
        return obj
    if isinstance(obj, str):
        return obj
    if isinstance(obj, int):
        return obj
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        out: dict[str, object] = {}
        for k, v in obj.items():
            out[str(k)] = _deep_sanitize_for_json(v)
        return out
    if isinstance(obj, list):
        return [_deep_sanitize_for_json(v) for v in obj]
    try:
        import pandas as pd
        import numpy as np

        _na = getattr(pd, "NA", None)
        if _na is not None and obj is _na:
            return None
        if isinstance(obj, pd.Timestamp):
            return obj.isoformat()
        if isinstance(obj, np.datetime64):
            return str(obj)
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            v = float(obj)
            return None if (math.isnan(v) or math.isinf(v)) else v
        if isinstance(obj, np.bool_):
            return bool(obj)
    except Exception:
        pass
    return str(obj)


if __name__ == "__main__":
    main()
