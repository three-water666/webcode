import {
  escapeControlCharacter,
  findNextNonWhitespaceIndex,
  isDigit,
  isLineBreak,
  isValidJsonEscape,
  isWhitespace,
  startsWithAny,
} from "./charUtils";
import type { JsonFrame, StringRole } from "./types";

type ActiveString = {
  role: StringRole;
};

type RepairState = {
  activeString: ActiveString | null;
  escaped: boolean;
  index: number;
  repaired: string;
  stack: JsonFrame[];
  text: string;
};

export function repairModelJson(text: string): string {
  const state: RepairState = {
    activeString: null,
    escaped: false,
    index: 0,
    repaired: "",
    stack: [],
    text,
  };

  while (state.index < text.length) {
    if (state.activeString) {
      handleActiveStringChar(state);
    } else {
      handleJsonChar(state);
    }
  }

  if (state.activeString) {
    state.repaired += "\"";
  }

  return state.repaired;
}

function handleActiveStringChar(state: RepairState): void {
  const activeString = state.activeString;
  if (!activeString) {
    return;
  }

  const char = state.text[state.index] ?? "";
  if (state.escaped) {
    handleEscapedStringChar(state, char);
    return;
  }

  if (char === "\\") {
    state.repaired += char;
    state.escaped = true;
    state.index += 1;
    return;
  }

  if (char === "\"") {
    handleQuoteInString(state, activeString.role);
    return;
  }

  if (isLineBreak(char)) {
    handleLineBreakInString(state, activeString.role);
    return;
  }

  state.repaired += escapeControlCharacter(char);
  state.index += 1;
}

function handleEscapedStringChar(state: RepairState, char: string): void {
  if (isLineBreak(char)) {
    state.repaired += "n";
  } else if (isValidJsonEscape(char)) {
    state.repaired += char;
  } else {
    state.repaired += `\\${char}`;
  }

  state.escaped = false;
  state.index += 1;
}

function handleQuoteInString(state: RepairState, role: StringRole): void {
  if (shouldCloseStringAt(state.text, state.index, role, state.stack)) {
    state.repaired += "\"";
    finishString(state.stack, role);
    state.activeString = null;
  } else {
    state.repaired += "\\\"";
  }

  state.index += 1;
}

function handleLineBreakInString(state: RepairState, role: StringRole): void {
  const lineBreakLength = state.text[state.index] === "\r" && state.text[state.index + 1] === "\n"
    ? 2
    : 1;

  if (shouldCloseStringBeforeLineBreak(state.text, state.index, role, state.stack)) {
    state.repaired += "\"";
    finishString(state.stack, role);
    state.activeString = null;
    state.repaired += state.text.slice(state.index, state.index + lineBreakLength);
  } else {
    state.repaired += "\\n";
  }

  state.index += lineBreakLength;
}

function handleJsonChar(state: RepairState): void {
  const char = state.text[state.index] ?? "";

  if (isWhitespace(char)) {
    state.repaired += char;
    state.index += 1;
    return;
  }

  if (insertMissingColonBeforeValue(state, char)) {
    return;
  }

  if (skipTrailingComma(state, char)) {
    return;
  }

  if (insertMissingCommaBeforeNextValue(state, char)) {
    return;
  }

  if (char === "\"") {
    state.activeString = { role: getStringRole(state.stack) };
    state.repaired += char;
    state.index += 1;
    return;
  }

  state.repaired += char;
  updateStackForStructuralChar(state.stack, char);
  state.index += 1;
}

function insertMissingColonBeforeValue(state: RepairState, char: string): boolean {
  const frame = state.stack[state.stack.length - 1];
  if (frame?.type !== "object" || frame.state !== "colon" || char === ":") {
    return false;
  }

  if (!startsJsonValueAt(state.text, state.index)) {
    return false;
  }

  state.repaired += ":";
  frame.state = "value";
  return true;
}

function skipTrailingComma(state: RepairState, char: string): boolean {
  if (char !== "," || !isTrailingComma(state.text, state.index)) {
    return false;
  }

  state.index += 1;
  return true;
}

function insertMissingCommaBeforeNextValue(state: RepairState, char: string): boolean {
  return insertMissingObjectComma(state, char) || insertMissingArrayComma(state, char);
}

function insertMissingObjectComma(state: RepairState, char: string): boolean {
  const frame = state.stack[state.stack.length - 1];
  if (frame?.type !== "object" || frame.state !== "commaOrEnd" || char === "," || char === "}") {
    return false;
  }

  if (!looksLikeObjectKeyAt(state.text, state.index)) {
    return false;
  }

  state.repaired += ",";
  frame.state = "keyOrEnd";
  return true;
}

function insertMissingArrayComma(state: RepairState, char: string): boolean {
  const frame = state.stack[state.stack.length - 1];
  if (frame?.type !== "array" || frame.state !== "commaOrEnd" || char === "," || char === "]") {
    return false;
  }

  if (!startsJsonValueAt(state.text, state.index)) {
    return false;
  }

  state.repaired += ",";
  frame.state = "valueOrEnd";
  return true;
}

function updateStackForStructuralChar(stack: JsonFrame[], char: string): void {
  switch (char) {
    case "{":
      stack.push({ type: "object", state: "keyOrEnd" });
      return;
    case "[":
      stack.push({ type: "array", state: "valueOrEnd" });
      return;
    case "}":
    case "]":
      stack.pop();
      markValueConsumed(stack);
      return;
    case ":":
      markObjectExpectingValue(stack);
      return;
    case ",":
      markFrameExpectingNextItem(stack);
  }
}

function markObjectExpectingValue(stack: JsonFrame[]): void {
  const frame = stack[stack.length - 1];
  if (frame?.type === "object") {
    frame.state = "value";
  }
}

function markFrameExpectingNextItem(stack: JsonFrame[]): void {
  const frame = stack[stack.length - 1];
  if (frame?.type === "object") {
    frame.state = "keyOrEnd";
  } else if (frame?.type === "array") {
    frame.state = "valueOrEnd";
  }
}

function isTrailingComma(text: string, commaIndex: number): boolean {
  const nextIndex = findNextNonWhitespaceIndex(text, commaIndex + 1);
  return nextIndex >= 0 && (text[nextIndex] === "}" || text[nextIndex] === "]");
}

function startsJsonValueAt(text: string, index: number): boolean {
  const char = text[index] ?? "";
  return (
    char === "\"" ||
    char === "{" ||
    char === "[" ||
    char === "-" ||
    isDigit(char) ||
    startsWithAny(text, index, ["true", "false", "null", "True", "False", "None"])
  );
}

function looksLikeObjectKeyAt(text: string, index: number): boolean {
  const keyStart = findNextNonWhitespaceIndex(text, index);
  if (keyStart < 0 || text[keyStart] !== "\"") {
    return false;
  }

  for (let i = keyStart + 1, escaped = false; i < text.length; i += 1) {
    const char = text[i] ?? "";
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === "\"") {
      const nextIndex = findNextNonWhitespaceIndex(text, i + 1);
      return nextIndex >= 0 && text[nextIndex] === ":";
    } else if (isLineBreak(char)) {
      return false;
    }
  }

  return false;
}

function getStringRole(stack: JsonFrame[]): StringRole {
  const frame = stack[stack.length - 1];
  return frame?.type === "object" && frame.state === "keyOrEnd" ? "key" : "value";
}

function finishString(stack: JsonFrame[], role: StringRole): void {
  if (role === "key") {
    const frame = stack[stack.length - 1];
    if (frame?.type === "object") {
      frame.state = "colon";
    }
    return;
  }

  markValueConsumed(stack);
}

function markValueConsumed(stack: JsonFrame[]): void {
  const frame = stack[stack.length - 1];
  if (frame?.type === "object" && frame.state === "value") {
    frame.state = "commaOrEnd";
  } else if (frame?.type === "array" && frame.state === "valueOrEnd") {
    frame.state = "commaOrEnd";
  }
}

function shouldCloseStringAt(text: string, quoteIndex: number, role: StringRole, stack: JsonFrame[]): boolean {
  const nextIndex = findNextNonWhitespaceIndex(text, quoteIndex + 1);
  return shouldCloseStringBeforeIndex(text, nextIndex, role, stack);
}

function shouldCloseStringBeforeLineBreak(
  text: string,
  lineBreakIndex: number,
  role: StringRole,
  stack: JsonFrame[]
): boolean {
  if (!endsWithEscapedQuoteBeforeLineBreak(text, lineBreakIndex)) {
    return false;
  }

  const start = text[lineBreakIndex] === "\r" && text[lineBreakIndex + 1] === "\n"
    ? lineBreakIndex + 2
    : lineBreakIndex + 1;
  const nextIndex = findNextNonWhitespaceIndex(text, start);
  return shouldCloseStringBeforeIndex(text, nextIndex, role, stack);
}

function endsWithEscapedQuoteBeforeLineBreak(text: string, lineBreakIndex: number): boolean {
  let quoteIndex = lineBreakIndex - 1;
  while (quoteIndex >= 0 && (text[quoteIndex] === " " || text[quoteIndex] === "\t")) {
    quoteIndex -= 1;
  }

  if (text[quoteIndex] !== "\"") {
    return false;
  }

  let backslashCount = 0;
  for (let i = quoteIndex - 1; i >= 0 && text[i] === "\\"; i -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

function shouldCloseStringBeforeIndex(
  text: string,
  nextIndex: number,
  role: StringRole,
  stack: JsonFrame[]
): boolean {
  const nextChar = nextIndex >= 0 ? text[nextIndex] : null;
  if (role === "key") {
    return shouldCloseKeyStringBeforeIndex(text, nextIndex, nextChar);
  }

  return shouldCloseValueStringBeforeIndex(text, nextIndex, nextChar, stack);
}

function shouldCloseKeyStringBeforeIndex(text: string, nextIndex: number, nextChar: string | null): boolean {
  return nextChar === ":" || (nextIndex >= 0 && startsJsonValueAt(text, nextIndex));
}

function shouldCloseValueStringBeforeIndex(
  text: string,
  nextIndex: number,
  nextChar: string | null,
  stack: JsonFrame[]
): boolean {
  const frame = stack[stack.length - 1];
  if (!frame) {
    return nextChar == null;
  }

  if (frame.type === "object") {
    return shouldCloseObjectValueString(text, nextIndex, nextChar, frame);
  }

  if (frame.type === "array") {
    return shouldCloseArrayValueString(nextChar, frame);
  }

  return false;
}

function shouldCloseObjectValueString(
  text: string,
  nextIndex: number,
  nextChar: string | null,
  frame: JsonFrame
): boolean {
  if (frame.type !== "object" || frame.state !== "value") {
    return false;
  }

  return nextChar === "}" ||
    looksLikeObjectKeyAt(text, nextIndex) ||
    (nextChar === "," && looksLikeObjectKeyAt(text, nextIndex + 1));
}

function shouldCloseArrayValueString(nextChar: string | null, frame: JsonFrame): boolean {
  return frame.type === "array" && frame.state === "valueOrEnd" && (nextChar === "," || nextChar === "]");
}
