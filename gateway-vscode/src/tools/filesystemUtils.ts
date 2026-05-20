import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

export type WorkspacePathOptions = {
    forWrite?: boolean;
};

export const DEFAULT_EXCLUDED_DIRECTORIES = [
    '.git',
    'node_modules',
    '.pnpm-store',
    'dist',
    'out',
    'build',
    'coverage'
] as const;

const DEFAULT_EXCLUDED_DIRECTORY_SET: ReadonlySet<string> = new Set(DEFAULT_EXCLUDED_DIRECTORIES);

export function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

export function expandHome(filepath: string): string {
    if (filepath === '~' || filepath.startsWith('~/') || filepath.startsWith('~\\')) {
        return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
}

export async function resolveWorkspacePath(
    workspaceRoot: string | null,
    requestedPath: unknown,
    options: WorkspacePathOptions = {}
): Promise<string> {
    if (!workspaceRoot) {
        throw new Error('A VS Code workspace folder is required for file operations.');
    }
    if (typeof requestedPath !== 'string' || requestedPath.trim() === '') {
        throw new Error('path must be a non-empty string.');
    }
    if (requestedPath.includes('\0')) {
        throw new Error('path must not contain null bytes.');
    }

    const allowedDirectories = await getAllowedWorkspaceDirectories(workspaceRoot);
    const expandedPath = expandHome(requestedPath.trim());
    const absolutePath = path.isAbsolute(expandedPath)
        ? path.resolve(expandedPath)
        : path.resolve(workspaceRoot, expandedPath);

    assertAllowedPath(absolutePath, allowedDirectories);

    try {
        const realPath = await fs.realpath(absolutePath);
        assertAllowedPath(realPath, allowedDirectories);
        return realPath;
    } catch (error: any) {
        if (error?.code !== 'ENOENT') {
            throw error;
        }
        if (!options.forWrite) {
            throw error;
        }

        const parentDirectory = path.dirname(absolutePath);
        const realParent = await fs.realpath(parentDirectory);
        assertAllowedPath(realParent, allowedDirectories);
        return absolutePath;
    }
}

export async function resolveWorkspaceDirectory(
    workspaceRoot: string | null,
    requestedPath: unknown
): Promise<string> {
    const resolved = await resolveWorkspacePath(workspaceRoot, requestedPath);
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
        throw new Error(`path must point to a directory: ${String(requestedPath)}`);
    }
    return resolved;
}

export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.${crypto.randomBytes(16).toString('hex')}.tmp`;
    await fs.writeFile(tempPath, content, 'utf8');
    try {
        // Preserve original file permissions if the target already exists.
        try {
            const stat = await fs.stat(filePath);
            await fs.chmod(tempPath, stat.mode);
        } catch {
            // File may not exist yet; keep default permissions.
        }
        await fs.rename(tempPath, filePath);
    } catch (error) {
        try {
            await fs.unlink(tempPath);
        } catch {
            // Best-effort cleanup only.
        }
        throw error;
    }
}

export async function walkWorkspaceFiles(
    rootPath: string,
    visitor: (filePath: string, relativePath: string) => Promise<boolean | void>,
    options: {
        excludePatterns?: string[];
        includePattern?: string;
    } = {}
): Promise<void> {
    async function walk(currentPath: string): Promise<boolean> {
        const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => null);
        if (entries === null) {
            // Skip directories that cannot be read (e.g. EACCES, ENOENT).
            return false;
        }
        for (const entry of entries) {
            const absolute = path.join(currentPath, entry.name);
            const relative = path.relative(rootPath, absolute);
            const normalizedRelative = toPosixPath(relative);

            if (entry.isDirectory()) {
                if (DEFAULT_EXCLUDED_DIRECTORY_SET.has(entry.name) || matchesAnyPattern(normalizedRelative, options.excludePatterns ?? [])) {
                    continue;
                }
                const shouldStop = await walk(absolute);
                if (shouldStop) {
                    return true;
                }
                continue;
            }

            if (!entry.isFile()) {
                continue;
            }
            if (matchesAnyPattern(normalizedRelative, options.excludePatterns ?? [])) {
                continue;
            }
            if (options.includePattern && !matchesPattern(normalizedRelative, options.includePattern) && !matchesPattern(entry.name, options.includePattern)) {
                continue;
            }

            const shouldStop = await visitor(absolute, normalizedRelative);
            if (shouldStop) {
                return true;
            }
        }

        return false;
    }

    await walk(rootPath);
}

export function matchesFileQuery(relativePath: string, fileName: string, query: string): boolean {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
        return false;
    }

    if (hasGlobSyntax(normalizedQuery)) {
        return matchesPattern(relativePath, normalizedQuery) || matchesPattern(fileName, normalizedQuery);
    }

    const lowerQuery = normalizedQuery.toLowerCase();
    return relativePath.toLowerCase().includes(lowerQuery) || fileName.toLowerCase().includes(lowerQuery);
}

export function matchesPattern(value: string, pattern: string): boolean {
    const normalizedValue = toPosixPath(value);
    if (pattern.startsWith('**/') && matchesCompiledPattern(normalizedValue, pattern.slice(3))) {
        return true;
    }

    return matchesCompiledPattern(normalizedValue, pattern);
}

function matchesCompiledPattern(normalizedValue: string, pattern: string): boolean {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\0')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/\0/g, '.*');

    return new RegExp(`^${escaped}$`, 'i').test(normalizedValue);
}

export function matchesAnyPattern(value: string, patterns: string[]): boolean {
    return patterns.some(pattern => matchesPattern(value, pattern) || matchesPattern(path.basename(value), pattern));
}

export function toPosixPath(value: string): string {
    return value.replace(/\\/g, '/');
}

export function createUnifiedDiff(originalContent: string, newContent: string, filepath: string): string {
    const originalLines = normalizeLineEndings(originalContent).split('\n');
    const newLines = normalizeLineEndings(newContent).split('\n');

    if (originalContent === newContent) {
        return 'No changes.';
    }

    let prefix = 0;
    while (
        prefix < originalLines.length &&
        prefix < newLines.length &&
        originalLines[prefix] === newLines[prefix]
    ) {
        prefix++;
    }

    let suffix = 0;
    while (
        suffix < originalLines.length - prefix &&
        suffix < newLines.length - prefix &&
        originalLines[originalLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
    ) {
        suffix++;
    }

    const contextLines = 3;
    const oldStart = Math.max(0, prefix - contextLines);
    const newStart = Math.max(0, prefix - contextLines);
    const oldEnd = Math.min(originalLines.length, originalLines.length - suffix + contextLines);
    const newEnd = Math.min(newLines.length, newLines.length - suffix + contextLines);

    const hunkLines = [
        `--- ${filepath}`,
        `+++ ${filepath}`,
        `@@ -${oldStart + 1},${oldEnd - oldStart} +${newStart + 1},${newEnd - newStart} @@`
    ];

    for (let index = oldStart; index < prefix; index++) {
        hunkLines.push(` ${originalLines[index]}`);
    }
    for (let index = prefix; index < originalLines.length - suffix; index++) {
        hunkLines.push(`-${originalLines[index]}`);
    }
    for (let index = prefix; index < newLines.length - suffix; index++) {
        hunkLines.push(`+${newLines[index]}`);
    }
    for (let index = originalLines.length - suffix; index < oldEnd; index++) {
        if (index >= 0 && index < originalLines.length) {
            hunkLines.push(` ${originalLines[index]}`);
        }
    }

    return `\`\`\`diff\n${hunkLines.join('\n')}\n\`\`\``;
}

export function getNumberArg(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function getStringArrayArg(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function hasGlobSyntax(value: string): boolean {
    return /[*?]/.test(value);
}

async function getAllowedWorkspaceDirectories(workspaceRoot: string): Promise<string[]> {
    const normalizedRoot = path.resolve(path.normalize(workspaceRoot));
    const realRoot = await fs.realpath(normalizedRoot).catch(() => normalizedRoot);
    return Array.from(new Set([normalizedRoot, realRoot].map(item => path.resolve(path.normalize(item)))));
}

function assertAllowedPath(absolutePath: string, allowedDirectories: string[]): void {
    const normalizedPath = path.resolve(path.normalize(absolutePath));
    const allowed = allowedDirectories.some(directory => (
        normalizedPath === directory ||
        normalizedPath.startsWith(directory.endsWith(path.sep) ? directory : `${directory}${path.sep}`)
    ));

    if (!allowed) {
        throw new Error(`Access denied: path must stay inside the VS Code workspace (${allowedDirectories[0]}).`);
    }
}
