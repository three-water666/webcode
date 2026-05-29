export function findNextNonWhitespaceIndex(text: string, index: number): number {
  for (let i = index; i < text.length; i += 1) {
    if (!isWhitespace(text[i] ?? "")) {
      return i;
    }
  }

  return -1;
}

export function isWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\r" || char === "\n";
}

export function isLineBreak(char: string): boolean {
  return char === "\r" || char === "\n";
}

export function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

export function isIdentifierStart(char: string): boolean {
  return (char >= "A" && char <= "Z") || (char >= "a" && char <= "z") || char === "_" || char === "$";
}

export function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || isDigit(char) || char === "-" || char === ".";
}

export function isJsonLiteral(value: string): boolean {
  return value === "true" || value === "false" || value === "null";
}

export function isValidJsonEscape(char: string): boolean {
  return char === "\"" || char === "\\" || char === "/" || char === "b" || char === "f" ||
    char === "n" || char === "r" || char === "t" || char === "u";
}

export function startsWithAny(text: string, index: number, values: string[]): boolean {
  return values.some((value) => text.startsWith(value, index));
}

export function escapeControlCharacter(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= 0x20) {
    return char;
  }

  return `\\u${code.toString(16).padStart(4, "0")}`;
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
