import { i18n } from "./i18n";

export function showAutoInitConfirm(): Promise<boolean> {
  return new Promise((resolve) => {
    const isZh = i18n.lang === "zh";
    const host = document.createElement("div");
    Object.assign(host.style, {
      position: "fixed",
      zIndex: 999999,
      top: 0,
      left: 0,
      width: "0",
      height: "0",
    });
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; color-scheme: light; }
      *, *::before, *::after { box-sizing: border-box; }
      .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; justify-content: center; align-items: center; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .card { width: min(420px, calc(100vw - 40px)); background: #fff; color: #202124; border: 1px solid #dadce0; border-radius: 8px; box-shadow: 0 12px 34px rgba(0,0,0,0.28); padding: 20px; }
      h2 { margin: 0 0 10px 0; font-size: 18px; font-weight: 650; line-height: 1.3; color: #202124; }
      p { margin: 0; color: #5f6368; font-size: 14px; line-height: 1.5; }
      .buttons { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
      button { font: inherit; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 8px 14px; cursor: pointer; border: 1px solid #dadce0; background: #fff; color: #3c4043; }
      button:hover { background: #f8fafd; }
      .primary { border-color: #1a73e8; background: #1a73e8; color: #fff; }
      .primary:hover { background: #1765cc; }
    `;

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="card" role="dialog" aria-modal="true">
        <h2>${isZh ? "添加 webcode 初始化上下文？" : "Add webcode initialization context?"}</h2>
        <p>${isZh ? "点击添加或按 Enter，将完整初始化上下文添加到当前输入框。不会自动发送。" : "Click Add or press Enter to add the full initialization context to the current input. This will not send automatically."}</p>
        <div class="buttons">
          <button class="cancel" type="button">${isZh ? "取消" : "Cancel"}</button>
          <button class="primary" type="button">${isZh ? "添加" : "Add"}</button>
        </div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(overlay);

    const cleanup = (result: boolean) => {
      document.removeEventListener("keydown", onKeyDown, true);
      host.remove();
      resolve(result);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cleanup(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cleanup(false);
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    shadow.querySelector(".primary")?.addEventListener("click", () => cleanup(true));
    shadow.querySelector(".cancel")?.addEventListener("click", () => cleanup(false));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        cleanup(false);
      }
    });
    shadow.querySelector<HTMLButtonElement>(".primary")?.focus();
  });
}
