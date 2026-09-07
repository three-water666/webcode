export const FOLLOW_UP_COMPOSER_STYLE_TEXT = `
  .follow-up-section { display: flex; flex: 0 0 auto; flex-direction: column;
    border-top: 1px solid #343942; }
  .follow-up-toggle { min-height: 36px; width: 100%; flex: 0 0 auto; display: flex; align-items: center; gap: 7px;
    padding: 7px 12px; border: 0; color: #c8ced8; background: transparent; text-align: left; cursor: pointer; }
  .follow-up-toggle:hover { color: #fff; background: rgba(255, 255, 255, .05); }
  .follow-up-toggle:focus-visible { outline: 2px solid #3b82f6; outline-offset: -2px; }
  .follow-up-title { min-width: 0; overflow: hidden; font-size: 11px; font-weight: 600;
    text-overflow: ellipsis; white-space: nowrap; }
  .follow-up-summary { min-width: 0; overflow: hidden; color: #929baa; font-size: 10px;
    text-overflow: ellipsis; white-space: nowrap; }
  .follow-up-chevron { flex: 0 0 auto; margin-left: auto; color: #929baa; }
  .follow-up-body { flex: 0 0 auto; flex-direction: column; }
  .follow-up-description { flex: 0 0 auto; overflow: hidden; padding: 2px 12px 7px; color: #858d9a;
    font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .follow-up-count { min-width: 18px; height: 18px; align-items: center; justify-content: center; flex: 0 0 auto;
    padding: 0 5px; color: #aeb5c2; background: rgba(255, 255, 255, .06);
    border-radius: 999px; font-size: 10px; }
  .follow-up-queue { max-height: min(120px, 16vh); flex: 0 0 auto; overflow-y: auto; }
  .follow-up-queue:empty { display: none; }
  .follow-up-item { min-height: 40px; display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px 8px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, .06); }
  .follow-up-item-text { min-width: 0; flex: 1; overflow-wrap: anywhere; color: #d8dde6; white-space: pre-wrap; }
  .follow-up-item.sending .follow-up-item-text { color: #93c5fd; }
  .follow-up-item-actions { min-height: 24px; display: flex; align-items: center; justify-content: flex-end; gap: 5px;
    flex: 0 0 auto; }
  .follow-up-item-state { display: inline-flex; align-items: center; height: 22px; flex: 0 0 auto; color: #93c5fd;
    font-size: 10px; line-height: 1; white-space: nowrap; }
  .follow-up-item-state.waiting { color: #aeb5c2; }
  .follow-up-remove { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
    flex: 0 0 auto; padding: 0; border: 0; border-radius: 5px; color: #aeb5c2; background: transparent;
    font-size: 16px; line-height: 1; cursor: pointer; }
  .follow-up-remove:hover { color: #fff; background: #8f1d1d; }
  .follow-up-remove:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
  .follow-up-composer { flex: 0 0 auto; padding: 10px; }
  .follow-up-composer textarea { width: 100%; height: 68px; resize: none; display: block; overflow-y: auto;
    padding: 8px 9px; color: #f3f4f6; background: #111318; border: 1px solid #454b56; border-radius: 7px;
    line-height: 1.45; outline: none; }
  .follow-up-composer textarea:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, .16); }
  .follow-up-composer textarea::placeholder { color: #747d8b; }
  .follow-up-composer-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
  .follow-up-hint { color: #858d9a; font-size: 10px; }
  .follow-up-confirm { flex: 0 0 auto; padding: 5px 10px; border: 1px solid #3b82f6; border-radius: 6px;
    color: #fff; background: #2563eb; cursor: pointer; }
  .follow-up-confirm:hover { background: #1d4ed8; }
  .follow-up-confirm:disabled { color: #7d8490; background: #292d34; border-color: #3b4048; cursor: default; }
  @media (max-height: 600px) {
    .follow-up-description { display: none; }
    .follow-up-queue { max-height: 64px; }
    .follow-up-composer { padding: 8px; }
    .follow-up-composer textarea { height: 44px; }
  }
`;
