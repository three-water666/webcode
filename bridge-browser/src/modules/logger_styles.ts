export const LOGGER_DEFAULT_WIDTH = 480;
export const LOGGER_DEFAULT_HEIGHT = 236;
export const LOGGER_MIN_WIDTH = 480;
export const LOGGER_MIN_HEIGHT = 180;

export const LOGGER_STYLE_TEXT = `
    :host {
      all: initial;
      color-scheme: dark;
    }

    * {
      box-sizing: border-box;
    }

    button {
      font: inherit;
    }

    .logger {
      position: relative;
      width: ${LOGGER_DEFAULT_WIDTH}px;
      height: ${LOGGER_DEFAULT_HEIGHT}px;
      min-width: ${LOGGER_MIN_WIDTH}px;
      min-height: ${LOGGER_MIN_HEIGHT}px;
      background: rgba(0, 0, 0, 0.85);
      color: #00ff00;
      font-family: Consolas, "SFMono-Regular", Menlo, monospace;
      font-size: 12px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      border: 1px solid #333;
      backdrop-filter: blur(4px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }

    .logger.minimized {
      width: auto !important;
      height: 32px !important;
      min-width: 78px !important;
      min-height: 32px !important;
    }

    .header {
      min-height: 32px;
      padding: 5px 6px;
      background: #333;
      color: #fff;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      user-select: none;
    }

    .title {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .drag-handle {
      display: none;
      align-self: stretch;
      width: 18px;
      cursor: move;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 0 0 auto;
    }

    .icon-btn {
      width: 22px;
      height: 22px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: #ddd;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      padding: 0;
    }

    .icon-btn:hover {
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
    }

    .icon-btn.close:hover {
      background: #9b1c1c;
      color: #fff;
    }

    .filters {
      display: flex;
      gap: 4px;
      flex-wrap: nowrap;
      padding: 6px;
      background: #151515;
      border-bottom: 1px solid #333;
    }

    .filter {
      border: 1px solid #3b3b3b;
      border-radius: 4px;
      background: #222;
      color: #aaa;
      cursor: pointer;
      padding: 2px 6px;
      line-height: 16px;
      white-space: nowrap;
    }

    .filter:hover {
      border-color: #666;
      color: #fff;
    }

    .filter.active {
      background: #0b3d32;
      border-color: #14b88a;
      color: #d8fff3;
    }

    .filter-separator {
      color: #777;
      line-height: 22px;
      padding: 0 2px;
      user-select: none;
    }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .line {
      margin-bottom: 4px;
      line-height: 1.4;
      word-break: break-word;
    }

    .time {
      color: #888;
      font-size: 10px;
    }

    .resize-handle {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 14px;
      height: 14px;
      cursor: nwse-resize;
      background: linear-gradient(
        135deg,
        transparent 0 44%,
        rgba(255, 255, 255, 0.28) 45% 54%,
        transparent 55% 64%,
        rgba(255, 255, 255, 0.38) 65% 74%,
        transparent 75%
      );
    }

    .logger.minimized .title,
    .logger.minimized .clear,
    .logger.minimized .minimize,
    .logger.minimized .filters,
    .logger.minimized .content,
    .logger.minimized .resize-handle {
      display: none;
    }

    .logger:not(.minimized) .restore {
      display: none;
    }

    .logger.minimized .drag-handle {
      display: block;
    }

    .logger.minimized .header {
      padding: 4px;
      justify-content: flex-end;
      gap: 4px;
      background: #222;
    }
  `;
