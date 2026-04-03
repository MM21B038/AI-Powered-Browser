import type { InstallerApi } from "./installer-api";

declare global {
  interface Window {
    installer: InstallerApi;
  }
}

function qs<T extends HTMLElement>(sel: string): T {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing ${sel}`);
  return el as T;
}

function showStep(name: "welcome" | "progress" | "done" | "error") {
  document.querySelectorAll(".step").forEach((el) => {
    const step = el as HTMLElement;
    const isMatch = step.dataset.step === name;
    step.classList.toggle("step--active", isMatch);
    step.setAttribute("aria-hidden", isMatch ? "false" : "true");
  });
}

async function main() {
  const pathDisplay = qs<HTMLSpanElement>("#path-display");
  const pathBtn = qs<HTMLButtonElement>("#path-btn");
  const btnInstall = qs<HTMLButtonElement>("#btn-install");
  const btnClose = qs<HTMLButtonElement>("#btn-close");
  const btnRetry = qs<HTMLButtonElement>("#btn-retry");
  const statusText = qs<HTMLParagraphElement>("#status-text");
  const errorMsg = qs<HTMLParagraphElement>("#error-msg");

  let targetDir = await window.installer.getDefaultInstallDir();
  pathDisplay.textContent = targetDir;

  pathBtn.addEventListener("click", async () => {
    const picked = await window.installer.pickInstallDirectory();
    if (picked) {
      targetDir = picked;
      pathDisplay.textContent = targetDir;
    }
  });

  async function runInstall() {
    showStep("progress");
    statusText.textContent = "Running installer…";
    btnInstall.disabled = true;
    const result = await window.installer.runSilentInstall(targetDir);
    if (result.ok) {
      showStep("done");
    } else {
      errorMsg.textContent = result.message;
      showStep("error");
    }
    btnInstall.disabled = false;
  }

  btnInstall.addEventListener("click", () => {
    void runInstall();
  });

  btnClose.addEventListener("click", () => {
    window.installer.closeWindow();
  });

  btnRetry.addEventListener("click", () => {
    showStep("welcome");
  });
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById("panel");
  if (el) {
    el.innerHTML = `<p style="padding:24px;color:#fca5a5;font-size:13px;">${String(err)}</p>`;
  }
});
