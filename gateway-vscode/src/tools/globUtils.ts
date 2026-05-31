export function expandGlobBraceAlternation(pattern: string): string[] {
    const startIndex = pattern.indexOf('{');
    if (startIndex < 0) {
        return [pattern];
    }

    const endIndex = findGlobBraceEnd(pattern, startIndex);
    if (endIndex < 0) {
        return [pattern];
    }

    const alternatives = splitGlobBraceAlternatives(pattern.slice(startIndex + 1, endIndex));
    if (alternatives.length < 2 || alternatives.some(alternative => alternative === '')) {
        return [pattern];
    }

    const prefix = pattern.slice(0, startIndex);
    const suffix = pattern.slice(endIndex + 1);
    return alternatives.flatMap(alternative => expandGlobBraceAlternation(prefix + alternative + suffix));
}

function findGlobBraceEnd(pattern: string, startIndex: number): number {
    let depth = 0;

    for (let index = startIndex + 1; index < pattern.length; index++) {
        const character = pattern[index];
        if (character === '{') {
            depth++;
            continue;
        }
        if (character === '}') {
            if (depth === 0) {
                return index;
            }
            depth--;
        }
    }

    return -1;
}

function splitGlobBraceAlternatives(value: string): string[] {
    const alternatives: string[] = [];
    let current = '';
    let depth = 0;

    for (const character of value) {
        if (character === '{') {
            depth++;
            current += character;
            continue;
        }
        if (character === '}') {
            depth = Math.max(0, depth - 1);
            current += character;
            continue;
        }
        if (character === ',' && depth === 0) {
            alternatives.push(current);
            current = '';
            continue;
        }

        current += character;
    }

    alternatives.push(current);
    return alternatives;
}
