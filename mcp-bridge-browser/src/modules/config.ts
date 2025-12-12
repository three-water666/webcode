export interface SiteSelectors {
  messageBlocks: string;
  codeBlocks: string;
  inputArea: string;
  sendButton: string;
  stopButton: string;
}

export const DEFAULT_SELECTORS: Record<string, SiteSelectors> = {
  deepseek: {
    messageBlocks: ".ds-message",
    codeBlocks: "pre",
    inputArea: "textarea.ds-scroll-area",
    sendButton: "div[role='button']:has(path[d^='M8.3125'])",
    stopButton: "div[role='button']:has(path[d^='M2 4.88'])", 
  },
  chatgpt: {
    messageBlocks: 'div[data-message-author-role="assistant"]',
    codeBlocks: "pre code",
    inputArea: "#prompt-textarea",
    sendButton: 'button[data-testid="send-button"]',
    stopButton: 'button[data-testid="stop-button"]',
  },
  gemini: {
    messageBlocks: ".markdown",
    codeBlocks: "pre code",
    inputArea: 'div[contenteditable="true"]',
    sendButton:
      'button[aria-label="发送"], button[aria-label="Send"], button[aria-label*="Send"]',
    stopButton: 'button[aria-label*="Stop"], button[aria-label*="停止"]',
  },
  aistudio: {
    messageBlocks: "div[data-turn-role='Model']",
    codeBlocks: "pre code",
    inputArea: "textarea",
    sendButton: "ms-run-button button",
    stopButton: "ms-run-button button:has(.spin)",
  },
};
