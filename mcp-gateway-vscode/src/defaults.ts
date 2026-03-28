import promptEn from '../prompts/prompt_en.md';
import promptZh from '../prompts/prompt_zh.md';
import trainEn from '../prompts/train_en.md';
import trainZh from '../prompts/train_zh.md';
import errorHintEn from '../prompts/error_hint_en.md';
import errorHintZh from '../prompts/error_hint_zh.md';
import initEn from '../prompts/init_en.md';
import initZh from '../prompts/init_zh.md';
import oversizeEn from '../prompts/oversize_en.md';
import oversizeZh from '../prompts/oversize_zh.md';

export const DEFAULT_SELECTORS = {
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

export const PROMPTS = {
  prompt_en: promptEn,
  prompt_zh: promptZh,
  train_en: trainEn,
  train_zh: trainZh,
  error_hint_en: errorHintEn,
  error_hint_zh: errorHintZh,
  init_en: initEn,
  init_zh: initZh,
  oversize_en: oversizeEn,
  oversize_zh: oversizeZh
};