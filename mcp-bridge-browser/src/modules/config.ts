export interface SiteSelectors {
  messageBlocks: string;
  codeBlocks: string;
  inputArea: string;
  sendButton: string;
}

export const DEFAULT_SELECTORS: Record<string, SiteSelectors> = {
  deepseek: {
    messageBlocks: ".ds-message",
    codeBlocks: "pre",
    inputArea: "textarea.ds-scroll-area",
    // Fixed: Use SVG Path signature to locate the button.
    sendButton: "div[role='button']:has(path[d^='M8.3125'])",
  },
  chatgpt: {
    messageBlocks: 'div[data-message-author-role="assistant"]',
    codeBlocks: "pre code",
    inputArea: "#prompt-textarea",
    sendButton: 'button[data-testid="send-button"]',
  },
  gemini: {
    messageBlocks: ".markdown",
    codeBlocks: "pre code",
    inputArea: 'div[contenteditable="true"]',
    sendButton:
      'button[aria-label="发送"], button[aria-label="Send"], button[aria-label*="Send"]',
  },
  aistudio: {
    messageBlocks: "div[data-turn-role='Model']",
    codeBlocks: "pre code",
    inputArea: "textarea",
    sendButton: "ms-run-button button",
  },
};