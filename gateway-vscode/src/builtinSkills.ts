import * as fs from 'fs/promises';
import * as path from 'path';

export const BUILTIN_SKILLS_DIRECTORY = 'skills';
export const BUILTIN_SKILL_VIRTUAL_ROOT = '.webcode/builtin-skills';
export const BUILTIN_CREATE_SKILLS_SKILL_FILE_PATH = `${BUILTIN_SKILL_VIRTUAL_ROOT}/create-skills/SKILL.md`;

export type BuiltinSkillVirtualFileResult =
    | {
        status: 'not_builtin';
    }
    | {
        status: 'missing';
        path: string;
    }
    | {
        status: 'found';
        path: string;
        absolutePath: string;
        bytes: number;
    };

export function getBuiltinSkillsRoot(extensionPath: string): string {
    return path.join(extensionPath, BUILTIN_SKILLS_DIRECTORY);
}

export async function resolveBuiltinSkillVirtualFile(
    extensionPath: string,
    requestedPath: unknown
): Promise<BuiltinSkillVirtualFileResult> {
    const virtualPath = normalizeBuiltinSkillVirtualPath(requestedPath);
    if (!virtualPath) {
        const candidatePath = getBuiltinSkillVirtualPathCandidate(requestedPath);
        if (candidatePath) {
            return { status: 'missing', path: candidatePath };
        }
        return { status: 'not_builtin' };
    }

    const rootPath = getBuiltinSkillsRoot(extensionPath);
    const relativePath = virtualPath.slice(BUILTIN_SKILL_VIRTUAL_ROOT.length).replace(/^\//, '');
    const absolutePath = path.resolve(rootPath, relativePath);
    const normalizedRoot = path.resolve(rootPath);
    if (!isSubPath(normalizedRoot, absolutePath)) {
        return { status: 'missing', path: virtualPath };
    }

    const realRoot = await fs.realpath(rootPath).catch(() => null);
    if (!realRoot) {
        return { status: 'missing', path: virtualPath };
    }

    const realPath = await fs.realpath(absolutePath).catch(() => null);
    if (!realPath || !isSubPath(realRoot, realPath)) {
        return { status: 'missing', path: virtualPath };
    }

    const stat = await fs.stat(realPath).catch(() => null);
    if (!stat?.isFile()) {
        return { status: 'missing', path: virtualPath };
    }

    return {
        status: 'found',
        path: virtualPath,
        absolutePath: realPath,
        bytes: stat.size
    };
}

export function normalizeBuiltinSkillVirtualPath(requestedPath: unknown): string | null {
    const candidatePath = getBuiltinSkillVirtualPathCandidate(requestedPath);
    if (!candidatePath) {
        return null;
    }

    const normalized = path.posix.normalize(candidatePath);
    if (normalized !== BUILTIN_SKILL_VIRTUAL_ROOT && !normalized.startsWith(`${BUILTIN_SKILL_VIRTUAL_ROOT}/`)) {
        return null;
    }

    return normalized;
}

export function isBuiltinSkillVirtualPathCandidate(requestedPath: unknown): boolean {
    return getBuiltinSkillVirtualPathCandidate(requestedPath) !== null;
}

function getBuiltinSkillVirtualPathCandidate(requestedPath: unknown): string | null {
    if (typeof requestedPath !== 'string') {
        return null;
    }

    const trimmed = requestedPath.trim().replace(/^\.\//, '');
    if (trimmed !== BUILTIN_SKILL_VIRTUAL_ROOT && !trimmed.startsWith(`${BUILTIN_SKILL_VIRTUAL_ROOT}/`)) {
        return null;
    }

    return trimmed;
}

function isSubPath(parentPath: string, childPath: string): boolean {
    const relative = path.relative(parentPath, childPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
