"""
Executed inside ephemeral venv work directory. Args: user_code.py path, work_dir path.
Writes result.json in work_dir. User may write files under work_dir/output/.
"""
from __future__ import annotations

import base64
import io
import json
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
    max_file = 5 * 1024 * 1024
    seen_basenames: set[str] = set()

    def append_file(name: str, fp: str) -> None:
        try:
            st = os.stat(fp)
            sz = st.st_size
            entry: dict[str, object] = {"name": name, "size": sz}
            if sz <= max_file:
                with open(fp, "rb") as f:
                    entry["dataBase64"] = base64.b64encode(f.read()).decode("ascii")
            else:
                entry["truncated"] = True
            files.append(entry)
        except OSError:
            pass

    if os.path.isdir(output_dir):
        for name in sorted(os.listdir(output_dir)):
            fp = os.path.join(output_dir, name)
            if not os.path.isfile(fp):
                continue
            seen_basenames.add(name)
            append_file(name, fp)

    # Relative paths like plt.savefig("x.png") land in cwd (work dir), not output/.
    deny_root = {"user_code.py", "result.json"}
    if os.path.isdir(work):
        for name in sorted(os.listdir(work)):
            if name in deny_root or name.startswith("."):
                continue
            fp = os.path.join(work, name)
            if not os.path.isfile(fp):
                continue
            if name in seen_basenames:
                continue
            append_file(name, fp)

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

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)


def _json_cell(x: object) -> object:
    if x is None:
        return None
    if isinstance(x, (bool, str, int, float)):
        return x
    try:
        import pandas as pd
        import numpy as np

        if isinstance(x, (np.integer, np.floating)):
            return float(x) if isinstance(x, np.floating) else int(x)
        if isinstance(x, np.bool_):
            return bool(x)
    except Exception:
        pass
    return str(x)


if __name__ == "__main__":
    main()
