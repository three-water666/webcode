// === WebMCP Global Configuration ===
// This file is loaded before content.js and options.js
// Source of Truth for default selectors

const DEFAULT_SELECTORS = {
  deepseek: {
    messageBlocks: ".ds-message",
    codeBlocks: "pre",
    inputArea: "textarea.ds-scroll-area",
    // Fixed: Use SVG Path signature to locate the button.
    // This ignores unstable class names (like _020ab5b) and generic classes.
    // Matches: A div button that CONTAINS a path starting with the specific 'Send' icon coordinates.
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
};
