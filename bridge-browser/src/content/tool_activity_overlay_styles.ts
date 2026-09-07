import { TOOL_ACTIVITY_OVERLAY_Z_INDEX } from "../modules/overlay_layers";

export const TOOL_ACTIVITY_STYLE_TEXT = `
  :host { position: fixed; right: 20px; bottom: 20px; z-index: ${TOOL_ACTIVITY_OVERLAY_Z_INDEX}; width: fit-content;
    max-width: calc(100vw - 16px); max-height: calc(100vh - 32px); color-scheme: dark;
    --history-min-height: min(150px, 25vh); --work-panel-max-height: min(760px, calc(100vh - 32px)); }
  :host(.work-panel-expanded) { width: min(390px, calc(100vw - 32px)); }
  :host([data-history-visible="true"]) {
    --work-panel-max-height: min(760px, calc(100vh - 42px - var(--history-min-height))); }
  * { box-sizing: border-box; }
  button, textarea { font: inherit; }
  .overlay-stack { display: none; max-height: inherit; flex-direction: column; gap: 10px; }
  :host(.work-panel-expanded) .overlay-stack { display: flex; }
  :host(.work-panel-expanded) .launcher { display: none; }
  .launcher { min-height: 42px; max-width: min(320px, calc(100vw - 16px)); display: block; overflow: hidden;
    padding: 0; color: #f3f4f6; background: rgba(20, 22, 26, .96); border: 1px solid #3b404a;
    border-radius: 11px; box-shadow: 0 9px 26px rgba(0, 0, 0, .34); cursor: grab; backdrop-filter: blur(10px);
    transition: width 200ms ease-in-out; }
  .launcher-content { min-height: 40px; width: max-content; max-width: min(318px, calc(100vw - 18px));
    display: flex; align-items: center; gap: 8px; padding: 7px 11px 7px 8px; }
  .launcher:hover { background: rgba(31, 35, 42, .98); border-color: #596171; }
  .launcher:active { cursor: grabbing; }
  .launcher:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
  .launcher-mark { width: 25px; height: 25px; display: inline-flex; align-items: center; justify-content: center;
    flex: 0 0 auto; color: #fff; background: #2563eb; border-radius: 7px; font-size: 13px; font-weight: 700; line-height: 1; }
  .launcher-mark.idle { color: #dbeafe; font-size: 19px; }
  .launcher-mark.active { animation: pulse 1.4s ease-in-out infinite; }
  .launcher-mark.success { background: #15803d; }
  .launcher-mark.warn { background: #b45309; }
  .launcher-mark.error { background: #b91c1c; }
  .launcher-copy { min-width: 0; text-align: left; }
  .launcher-title { display: none; overflow: hidden; margin-bottom: 3px; color: #929baa;
    font: 500 10px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    text-overflow: ellipsis; white-space: nowrap; }
  .launcher.has-activity .launcher-title { display: block; }
  .launcher-label { min-width: 0; display: block; overflow: hidden;
    font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    text-overflow: ellipsis; white-space: nowrap; }
  .launcher-count { min-width: 18px; height: 18px; align-items: center; justify-content: center; flex: 0 0 auto;
    padding: 0 5px; color: #bfdbfe; background: rgba(37, 99, 235, .2); border: 1px solid rgba(96, 165, 250, .28);
    border-radius: 999px; font: 600 10px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; white-space: nowrap; }
  .panel, .history-panel { width: 100%; display: flex; overflow: hidden; flex-direction: column; color: #f3f4f6;
    background: rgba(20, 22, 26, .96); border: 1px solid #3b404a; border-radius: 12px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, .38); font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    backdrop-filter: blur(10px); }
  .panel { min-height: 0; max-height: var(--work-panel-max-height); flex: 0 0 auto; align-self: flex-end; }
  .history-panel { height: min(300px, 32vh); min-height: var(--history-min-height); flex: 0 1 auto; }
  .header-mount { flex: 0 0 auto; }
  .activity-mount { min-height: 0; display: flex; flex: 1 1 auto; flex-direction: column; }
  .activity-empty { min-height: 48px; height: min(240px, 30vh); flex: 0 1 auto; display: grid; place-items: center;
    padding: 18px 8px; border-top: 1px solid #343942; color: #858d9a; text-align: center; }
  .header, .history-header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 10px;
    user-select: none; }
  .header { min-height: 54px; padding: 9px 10px 9px 12px; }
  .history-header { min-height: 40px; padding: 7px 8px 7px 11px; border-bottom: 1px solid #343942; }
  .history-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 3px; }
  .drag-header { cursor: move; }
  .identity { min-width: 0; flex: 1; display: flex; align-items: center; gap: 10px; }
  .heading { min-width: 0; }
  .mark { width: 24px; height: 24px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; color: #fff;
    background: #2563eb; font-weight: 700; }
  .mark.idle { border-radius: 7px; color: #dbeafe; font-size: 18px; font-weight: 500; }
  .mark.active { animation: pulse 1.4s ease-in-out infinite; }
  .mark.success { background: #15803d; }
  .mark.warn { background: #b45309; }
  .mark.error { background: #b91c1c; }
  .title, .history-title { overflow: hidden; color: #f9fafb; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
  .summary { overflow: hidden; margin-top: 1px; color: #aeb5c2; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .summary:empty { display: none; }
  .actions { width: 124px; flex: 0 0 auto; display: flex; gap: 3px; }
  .icon-button, .history-button, .history-clear-button { height: 25px; padding: 0; border: 0; border-radius: 6px; color: #c8ced8;
    background: transparent; cursor: pointer; }
  .icon-button { width: 25px; }
  .history-button { width: 68px; padding: 0 7px; font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .history-clear-button { padding: 0 7px; font-size: 10px; white-space: nowrap; }
  .history-button.active { color: #dbeafe; background: rgba(37, 99, 235, .22); }
  .icon-button:not(:disabled):hover, .history-button:hover, .history-clear-button:not(:disabled):hover {
    color: #fff; background: rgba(255, 255, 255, .1); }
  .icon-button.close:not(:disabled):hover { background: #8f1d1d; }
  .icon-button:disabled, .history-clear-button:disabled { opacity: .35; cursor: default; }
  .list { min-height: 0; max-height: min(420px, 50vh); flex: 1 1 auto; overflow-y: auto; border-top: 1px solid #343942; }
  .row { display: flex; gap: 10px; padding: 10px 12px; border-bottom: 1px solid rgba(255, 255, 255, .06); }
  .status-dot { width: 8px; height: 8px; flex: 0 0 auto; margin-top: 5px; border-radius: 50%; background: #718096; }
  .row.awaiting_approval .status-dot { background: #f59e0b; }
  .row.executing .status-dot { background: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, .13);
    animation: pulse 1.2s ease-in-out infinite; }
  .row.succeeded .status-dot { background: #22c55e; }
  .row.failed .status-dot, .row.rejected .status-dot { background: #ef4444; }
  .row-content { min-width: 0; flex: 1; }
  .row-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .tool-identity { min-width: 0; display: flex; align-items: center; gap: 6px; }
  .tool-name { min-width: 0; overflow: hidden; color: #f3f4f6; font: 600 12px/1.4 "SFMono-Regular", Consolas, monospace;
    text-overflow: ellipsis; white-space: nowrap; }
  .source-badge { flex: 0 0 auto; padding: 0 5px; border: 1px solid #555d69; border-radius: 999px;
    color: #d1d5db; background: rgba(107, 114, 128, .16); font-size: 9px; font-weight: 650; line-height: 16px; }
  .source-badge.network { border-color: #315d9e; color: #93c5fd; background: rgba(37, 99, 235, .18); }
  .status { flex: 0 0 auto; color: #aeb5c2; font-size: 10px; }
  .purpose, .detail, .message { overflow: hidden; margin-top: 3px; text-overflow: ellipsis; white-space: nowrap; }
  .purpose { color: #c4c9d2; }
  .detail { color: #8fb9ff; font-family: "SFMono-Regular", Consolas, monospace; }
  .message { color: #fca5a5; }
  .footer { flex: 0 0 auto; padding: 8px 12px; color: #9fbfff; background: rgba(37, 99, 235, .1); font-size: 11px; }
  .footer.success { color: #86efac; background: rgba(21, 128, 61, .13); }
  .footer.warn { color: #fcd34d; background: rgba(180, 83, 9, .13); }
  .footer.error { color: #fca5a5; background: rgba(185, 28, 28, .13); }
  .history-list { min-height: 0; flex: 1 1 auto; overflow-y: auto; padding: 8px; }
  .history-empty { padding: 18px 8px; color: #858d9a; text-align: center; }
  .history-turn { overflow: hidden; border: 1px solid #343942; border-radius: 8px; background: rgba(255, 255, 255, .025); }
  .history-turn + .history-turn { margin-top: 8px; }
  .history-turn-header { min-height: 42px; display: flex; align-items: center; gap: 9px; padding: 7px 9px;
    background: rgba(255, 255, 255, .025); }
  .history-turn-header .mark { width: 20px; height: 20px; font-size: 10px; }
  .turn-heading { min-width: 0; flex: 1; }
  .turn-name { color: #e5e7eb; font-size: 11px; font-weight: 650; }
  .turn-meta { overflow: hidden; margin-top: 1px; color: #9ca3af; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .history-tool-list .row { padding: 9px 10px; }
  .history-turn .footer { padding: 6px 10px; }
  @media (max-height: 600px) { :host { --history-min-height: 80px; } }
  @media (prefers-reduced-motion: reduce) {
    .launcher { transition: none; }
    .launcher-mark.active, .mark.active, .row.executing .status-dot { animation: none; }
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
`;
