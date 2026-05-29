import {
  findNextNonWhitespaceIndex,
  isIdentifierPart,
  isIdentifierStart,
  isJsonLiteral,
  isLineBreak,
  isWhitespace,
} from "./charUtils";

type QuoteChar = "'" | "\"";

type QuoteState = {
  escaped: boolean;
  quote: QuoteChar | null;
};

type CommentStripState = QuoteState & {
  index: number;
  stripped: string;
  text: string;
};

type SingleQuoteConversionState = QuoteState & {
  converted: string;
};

type BareIdentifier = {
  end: number;
  leadingWhitespace: string;
  value: string;
};

const SMART_QUOTES = /[\u201C\u201D]/g;
const SMART_SINGLE_QUOTES = /[\u2018\u2019]/g;

export function normalizeLooseJsonSyntax(text: string): string {
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

function stripJsonComments(text: string): string {
  const state: CommentStripState = {
    escaped: false,
    index: 0,
    quote: null,
    stripped: "",
    text,
  };

  for (; state.index < text.length; state.index += 1) {
    if (state.quote) {
      appendQuotedCommentChar(state);
    } else {
      appendCommentCandidate(state);
    }
  }

  return state.stripped;
}

function appendQuotedCommentChar(state: CommentStripState): void {
  const char = state.text[state.index] ?? "";
  state.stripped += char;
  updateQuoteStateAfterChar(state, char);
}

function appendCommentCandidate(state: CommentStripState): void {
  const char = state.text[state.index] ?? "";
  const next = state.text[state.index + 1] ?? "";

  if (isQuoteChar(char)) {
    state.quote = char;
    state.stripped += char;
    return;
  }

  if (char === "/" && next === "/") {
    state.index = skipLineComment(state.text, state.index + 2) - 1;
    return;
  }

  if (char === "/" && next === "*") {
    state.index = skipBlockComment(state.text, state.index + 2);
    state.stripped += " ";
    return;
  }

  state.stripped += char;
}

function updateQuoteStateAfterChar(state: QuoteState, char: string): void {
  if (state.escaped) {
    state.escaped = false;
  } else if (char === "\\") {
    state.escaped = true;
  } else if (char === state.quote) {
    state.quote = null;
  }
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
  const state: SingleQuoteConversionState = {
    converted: "",
    escaped: false,
    quote: null,
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";

    if (state.quote === "\"") {
      appendDoubleQuotedStringChar(state, char);
    } else if (state.quote === "'") {
      appendSingleQuotedStringChar(state, char);
    } else {
      appendUnquotedStringChar(state, char);
    }
  }

  if (state.quote === "'") {
    state.converted += "\"";
  }

  return state.converted;
}

function appendDoubleQuotedStringChar(state: SingleQuoteConversionState, char: string): void {
  state.converted += char;
  updateQuoteStateAfterChar(state, char);
}

function appendSingleQuotedStringChar(state: SingleQuoteConversionState, char: string): void {
  if (state.escaped) {
    appendEscapedSingleQuotedStringChar(state, char);
    return;
  }

  if (char === "\\") {
    state.escaped = true;
    return;
  }

  if (char === "'") {
    state.converted += "\"";
    state.quote = null;
    return;
  }

  state.converted += normalizeSingleQuotedStringChar(char);
}

function appendEscapedSingleQuotedStringChar(state: SingleQuoteConversionState, char: string): void {
  state.converted += char === "'" ? "'" : `\\${char}`;
  state.escaped = false;
}

function normalizeSingleQuotedStringChar(char: string): string {
  if (char === "\"") {
    return "\\\"";
  }

  return isLineBreak(char) ? "\\n" : char;
}

function appendUnquotedStringChar(state: SingleQuoteConversionState, char: string): void {
  if (char === "'") {
    state.quote = "'";
    state.converted += "\"";
  } else if (char === "\"") {
    state.quote = "\"";
    state.converted += char;
  } else {
    state.converted += char;
  }
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

function readBareStringValue(text: string, index: number): BareIdentifier | null {
  const identifier = readBareIdentifier(text, index);
  if (!identifier || isJsonLiteral(identifier.value) || !hasBareStringTerminator(text, identifier.end)) {
    return null;
  }

  return identifier;
}

function readBareIdentifier(text: string, index: number): BareIdentifier | null {
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

  return {
    end: i,
    leadingWhitespace: text.slice(index, valueStart),
    value: text.slice(valueStart, i),
  };
}

function hasBareStringTerminator(text: string, index: number): boolean {
  const nextIndex = findNextNonWhitespaceIndex(text, index);
  return nextIndex >= 0 && ",}]".includes(text[nextIndex] ?? "");
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

function isQuoteChar(char: string): char is QuoteChar {
  return char === "\"" || char === "'";
}
