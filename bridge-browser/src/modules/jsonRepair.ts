type ObjectFrame = {
  type: "object";
  state: "keyOrEnd" | "colon" | "value" | "commaOrEnd";
};

type ArrayFrame = {
  type: "array";
  state: "valueOrEnd" | "commaOrEnd";
};

type JsonFrame = ObjectFrame | ArrayFrame;
type StringRole = "key" | "value";

const NON_STANDARD_SPACES = /[\u00a0\uFEFF\u200B]/g;
const SMART_QUOTES = /[\u201C\u201D]/g;
const SMART_SINGLE_QUOTES = /[\u2018\u2019]/g;

export function parseModelJson<T = unknown>(text: string): T {
  const normalized = normalizeModelJson(text);

  try {
    return JSON.parse(normalized) as T;
  } catch (strictError) {
    for (const repaired of buildRepairCandidates(normalized)) {
      try {
        return JSON.parse(repaired) as T;
      } catch {
        // Keep the original parse error because it points at the raw model output.
      }
    }

    throw strictError;
  }
}

export function normalizeModelJson(text: string): string {
  return text.replace(NON_STANDARD_SPACES, " ");
}

function buildRepairCandidates(text: string): string[] {
  const extracted = extractJsonCandidate(text);
  const bases = uniqueStrings([text, extracted]);
  const candidates: string[] = [];

  for (const base of bases) {
    const loose = normalizeLooseJsonSyntax(base);
    candidates.push(base, loose, repairModelJson(base), repairModelJson(loose));
  }

  return uniqueStrings(candidates).filter((candidate) => candidate !== text);
}

function extractJsonCandidate(text: string): string {
  const trimmed = stripMarkdownFence(text.trim());
  const actionIndex = trimmed.search(/["'\u201C\u201D]?mcp_action["'\u201C\u201D]?/);
  const fallbackStart = findFirstJsonStart(trimmed);
  const start = actionIndex >= 0 ? trimmed.lastIndexOf("{", actionIndex) : fallbackStart;
  if (start < 0) {
    return trimmed;
  }

  const opening = trimmed[start];
  const closing = opening === "{" ? "}" : "]";
  const end = trimmed.lastIndexOf(closing);
  return end > start ? trimmed.slice(start, end + 1) : trimmed.slice(start);
}

function stripMarkdownFence(text: string): string {
  if (!text.startsWith("```")) {
    return text;
  }

  const firstLineEnd = text.indexOf("\n");
  if (firstLineEnd < 0) {
    return text;
  }

  const withoutOpeningFence = text.slice(firstLineEnd + 1);
  const closingFenceIndex = withoutOpeningFence.lastIndexOf("```");
  return closingFenceIndex >= 0 ? withoutOpeningFence.slice(0, closingFenceIndex).trim() : withoutOpeningFence.trim();
}

function findFirstJsonStart(text: string): number {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  if (objectStart < 0) {
    return arrayStart;
  }
  if (arrayStart < 0) {
    return objectStart;
  }

  return Math.min(objectStart, arrayStart);
}

function normalizeLooseJsonSyntax(text: string): string {
  return quoteBareStringValues(
    normalizeBareLiterals(
      quoteBareObjectKeys(
        convertSingleQuotedStrings(
          stripJsonComments(normalizeSmartQuotes(text))
        )
      )
    )
  );
}

function normalizeSmartQuotes(text: string): string {
  return text.replace(SMART_QUOTES, "\"").replace(SMART_SINGLE_QUOTES, "'");
}

export function repairModelJson(text: string): string {
  const stack: JsonFrame[] = [];
  let repaired = "";
  let activeString: { role: StringRole } | null = null;
  let escaped = false;

  for (let i = 0; i < text.length;) {
    const char = text[i] ?? "";

    if (activeString) {
      if (escaped) {
        if (isLineBreak(char)) {
          repaired += "n";
        } else if (isValidJsonEscape(char)) {
          repaired += char;
        } else {
          repaired += `\\${char}`;
        }
        escaped = false;
        i += 1;
        continue;
      }

      if (char === "\\") {
        repaired += char;
        escaped = true;
        i += 1;
        continue;
      }

      if (char === "\"") {
        if (shouldCloseStringAt(text, i, activeString.role, stack)) {
          repaired += char;
          finishString(stack, activeString.role);
          activeString = null;
        } else {
          repaired += "\\\"";
        }
        i += 1;
        continue;
      }

      if (isLineBreak(char)) {
        const lineBreakLength = char === "\r" && text[i + 1] === "\n" ? 2 : 1;
        if (shouldCloseStringBeforeLineBreak(text, i, activeString.role, stack)) {
          repaired += "\"";
          finishString(stack, activeString.role);
          activeString = null;
          repaired += text.slice(i, i + lineBreakLength);
        } else {
          repaired += "\\n";
        }
        i += lineBreakLength;
        continue;
      }

      repaired += escapeControlCharacter(char);
      i += 1;
      continue;
    }

    if (isWhitespace(char)) {
      repaired += char;
      i += 1;
      continue;
    }

    const frame = stack[stack.length - 1];
    if (frame?.type === "object" && frame.state === "colon" && char !== ":" && startsJsonValueAt(text, i)) {
      repaired += ":";
      frame.state = "value";
      continue;
    }

    if (char === "," && isTrailingComma(text, i)) {
      i += 1;
      continue;
    }

    if (frame?.type === "object" && frame.state === "commaOrEnd" && char !== "," && char !== "}") {
      if (looksLikeObjectKeyAt(text, i)) {
        repaired += ",";
        frame.state = "keyOrEnd";
        continue;
      }
    }

    if (frame?.type === "array" && frame.state === "commaOrEnd" && char !== "," && char !== "]") {
      if (startsJsonValueAt(text, i)) {
        repaired += ",";
        frame.state = "valueOrEnd";
        continue;
      }
    }

    if (char === "\"") {
      activeString = { role: getStringRole(stack) };
      repaired += char;
      i += 1;
      continue;
    }

    repaired += char;
    updateStackForStructuralChar(stack, char);
    i += 1;
  }

  if (activeString) {
    repaired += "\"";
  }

  return repaired;
}

function stripJsonComments(text: string): string {
  let stripped = "";
  let quote: "'" | "\"" | null = null;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";
    const next = text[i + 1] ?? "";

    if (quote) {
      stripped += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      stripped += char;
    } else if (char === "/" && next === "/") {
      i = skipLineComment(text, i + 2) - 1;
    } else if (char === "/" && next === "*") {
      i = skipBlockComment(text, i + 2);
      stripped += " ";
    } else {
      stripped += char;
    }
  }

  return stripped;
}

function skipLineComment(text: string, index: number): number {
  let i = index;
  while (i < text.length && !isLineBreak(text[i] ?? "")) {
    i += 1;
  }

  return i;
}

function skipBlockComment(text: string, index: number): number {
  const end = text.indexOf("*/", index);
  return end >= 0 ? end + 1 : text.length;
}

function convertSingleQuotedStrings(text: string): string {
  let converted = "";
  let quote: "'" | "\"" | null = null;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";

    if (quote === "\"") {
      converted += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        quote = null;
      }
      continue;
    }

    if (quote === "'") {
      if (escaped) {
        converted += char === "'" ? "'" : `\\${char}`;
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "'") {
        converted += "\"";
        quote = null;
      } else if (char === "\"") {
        converted += "\\\"";
      } else {
        converted += isLineBreak(char) ? "\\n" : char;
      }
      continue;
    }

    if (char === "'") {
      quote = "'";
      converted += "\"";
    } else if (char === "\"") {
      quote = "\"";
      converted += char;
    } else {
      converted += char;
    }
  }

  if (quote === "'") {
    converted += "\"";
  }

  return converted;
}

function quoteBareObjectKeys(text: string): string {
  let quoted = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length;) {
    const char = text[i] ?? "";

    if (inString) {
      quoted += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (char === "\"") {
      inString = true;
      quoted += char;
      i += 1;
      continue;
    }

    if (char === "{" || char === ",") {
      const replacement = readBareObjectKey(text, i + 1);
      quoted += char;
      if (replacement) {
        quoted += replacement.leadingWhitespace + `"${replacement.key}"`;
        i = replacement.end;
      } else {
        i += 1;
      }
      continue;
    }

    quoted += char;
    i += 1;
  }

  return quoted;
}

function readBareObjectKey(text: string, index: number): { key: string; leadingWhitespace: string; end: number } | null {
  let i = index;
  while (i < text.length && isWhitespace(text[i] ?? "")) {
    i += 1;
  }

  if (!isIdentifierStart(text[i] ?? "")) {
    return null;
  }

  const keyStart = i;
  i += 1;
  while (i < text.length && isIdentifierPart(text[i] ?? "")) {
    i += 1;
  }

  const colonIndex = findNextNonWhitespaceIndex(text, i);
  if (colonIndex < 0 || text[colonIndex] !== ":") {
    return null;
  }

  return {
    key: text.slice(keyStart, i),
    leadingWhitespace: text.slice(index, keyStart),
    end: i,
  };
}

function normalizeBareLiterals(text: string): string {
  return replaceOutsideStrings(text, (token) => {
    if (token === "True") { return "true"; }
    if (token === "False") { return "false"; }
    if (token === "None") { return "null"; }
    return token;
  });
}

function quoteBareStringValues(text: string): string {
  let quoted = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length;) {
    const char = text[i] ?? "";

    if (inString) {
      quoted += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (char === "\"") {
      inString = true;
      quoted += char;
      i += 1;
      continue;
    }

    if (char === ":") {
      const replacement = readBareStringValue(text, i + 1);
      quoted += char;
      if (replacement) {
        quoted += replacement.leadingWhitespace + `"${replacement.value}"`;
        i = replacement.end;
      } else {
        i += 1;
      }
      continue;
    }

    quoted += char;
    i += 1;
  }

  return quoted;
}

function readBareStringValue(text: string, index: number): { value: string; leadingWhitespace: string; end: number } | null {
  let i = index;
  while (i < text.length && isWhitespace(text[i] ?? "")) {
    i += 1;
  }

  if (!isIdentifierStart(text[i] ?? "")) {
    return null;
  }

  const valueStart = i;
  i += 1;
  while (i < text.length && isIdentifierPart(text[i] ?? "")) {
    i += 1;
  }

  const value = text.slice(valueStart, i);
  if (isJsonLiteral(value)) {
    return null;
  }

  const nextIndex = findNextNonWhitespaceIndex(text, i);
  if (nextIndex < 0 || !",}]".includes(text[nextIndex] ?? "")) {
    return null;
  }

  return {
    value,
    leadingWhitespace: text.slice(index, valueStart),
    end: i,
  };
}

function replaceOutsideStrings(text: string, replaceToken: (token: string) => string): string {
  let replaced = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length;) {
    const char = text[i] ?? "";

    if (inString) {
      replaced += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (char === "\"") {
      inString = true;
      replaced += char;
      i += 1;
    } else if (isIdentifierStart(char)) {
      const start = i;
      i += 1;
      while (i < text.length && isIdentifierPart(text[i] ?? "")) {
        i += 1;
      }
      replaced += replaceToken(text.slice(start, i));
    } else {
      replaced += char;
      i += 1;
    }
  }

  return replaced;
}

function updateStackForStructuralChar(stack: JsonFrame[], char: string): void {
  if (char === "{") {
    stack.push({ type: "object", state: "keyOrEnd" });
  } else if (char === "[") {
    stack.push({ type: "array", state: "valueOrEnd" });
  } else if (char === "}") {
    stack.pop();
    markValueConsumed(stack);
  } else if (char === "]") {
    stack.pop();
    markValueConsumed(stack);
  } else if (char === ":") {
    const frame = stack[stack.length - 1];
    if (frame?.type === "object") {
      frame.state = "value";
    }
  } else if (char === ",") {
    const frame = stack[stack.length - 1];
    if (frame?.type === "object") {
      frame.state = "keyOrEnd";
    } else if (frame?.type === "array") {
      frame.state = "valueOrEnd";
    }
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

function startsWithAny(text: string, index: number, values: string[]): boolean {
  return values.some((value) => text.startsWith(value, index));
}

function isValidJsonEscape(char: string): boolean {
  return char === "\"" || char === "\\" || char === "/" || char === "b" || char === "f" ||
    char === "n" || char === "r" || char === "t" || char === "u";
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
    return nextChar === ":" || (nextIndex >= 0 && startsJsonValueAt(text, nextIndex));
  }

  const frame = stack[stack.length - 1];
  if (!frame) {
    return nextChar == null;
  }

  if (frame.type === "object" && frame.state === "value") {
    return nextChar === "}" ||
      looksLikeObjectKeyAt(text, nextIndex) ||
      (nextChar === "," && looksLikeObjectKeyAfterComma(text, nextIndex + 1));
  }

  if (frame.type === "array" && frame.state === "valueOrEnd") {
    return nextChar === "," || nextChar === "]";
  }

  return false;
}

function looksLikeObjectKeyAfterComma(text: string, index: number): boolean {
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

function findNextNonWhitespaceIndex(text: string, index: number): number {
  for (let i = index; i < text.length; i += 1) {
    if (!isWhitespace(text[i] ?? "")) {
      return i;
    }
  }

  return -1;
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\r" || char === "\n";
}

function isLineBreak(char: string): boolean {
  return char === "\r" || char === "\n";
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isIdentifierStart(char: string): boolean {
  return (char >= "A" && char <= "Z") || (char >= "a" && char <= "z") || char === "_" || char === "$";
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || isDigit(char) || char === "-" || char === ".";
}

function isJsonLiteral(value: string): boolean {
  return value === "true" || value === "false" || value === "null";
}

function escapeControlCharacter(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= 0x20) {
    return char;
  }

  return `\\u${code.toString(16).padStart(4, "0")}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
