export interface SiteSelectors {
  messageBlocks: string;
  codeBlocks: string;
  inputArea: string;
  sendButton: string;
  stopButton: string;
  maxInlineChars?: number;
}

// 移除所有硬编码的默认选择器，使其变为空对象。
// 浏览器插件必须在连接 VS Code 网关后，通过 GET /v1/init 接口拉取最新的默认规则。
// 这样可以确保只在 VS Code 端进行发布更新。
export const DEFAULT_SELECTORS: Record<string, SiteSelectors> = {};
