import * as fs from 'fs/promises';
import * as path from 'path';
import { toPosixPath, type WorkspacePathOptions } from './filesystemUtils';

export type WorkspacePathResolution = {
    absolutePath: string;
    relativePath: string;
};

type WorkspaceRelativePathOptions = WorkspacePathOptions & {
    allowEmptyAsRoot?: boolean;
};

export const WORKSPACE_FILE_PATH_DESCRIPTION =
    'Workspace-relative file path using "/" separators, for example "src/index.ts". Absolute paths, home paths, and backslashes are rejected.';

export const WORKSPACE_SEARCH_PATH_DESCRIPTION =
    'Optional workspace-relative directory to search, using "/" separators. Defaults to ".". Absolute paths, home paths, and backslashes are rejected.';

export const WORKSPACE_COMMAND_PATH_DESCRIPTION =
    'Optional workspace-relative command directory, interpreted by webcode before shell selection and using the same format for every terminal profile. Use "/" separators, for example "packages/app". Defaults to ".". Absolute paths, home paths, and backslashes are rejected.';

export async function resolveWorkspaceRelativePath(
    workspaceRoot: string | null,
    requestedPath: unknown,
    options: WorkspaceRelativePathOptions = {}
): Promise<WorkspacePathResolution> {
    if (!workspaceRoot) {
        throw new Error('A VS Code workspace folder is required for file operations.');
    }

    const relativeInput = normalizeWorkspaceRelativePathInput(requestedPath, options);
    const normalizedRoot = path.resolve(path.normalize(workspaceRoot));
    const allowedDirectories = await getAllowedWorkspaceDirectories(normalizedRoot);
    const absolutePath = path.resolve(normalizedRoot, relativeInput);

    if (!isAllowedPath(absolutePath, [normalizedRoot])) {
        throw new Error('path must stay inside the VS Code workspace.');
    }

    return resolveExistingOrWritablePath(absolutePath, relativeInput, normalizedRoot, allowedDirectories, options);
}

export async function resolveWorkspaceRelativeDirectory(
    workspaceRoot: string | null,
    requestedPath: unknown
): Promise<WorkspacePathResolution> {
    const resolved = await resolveWorkspaceRelativePath(workspaceRoot, requestedPath, { allowEmptyAsRoot: true });
    const stats = await fs.stat(resolved.absolutePath).catch(() => null);
    if (!stats) {
        throw new Error('path could not be resolved as a workspace directory.');
    }
    if (!stats.isDirectory()) {
        throw new Error(`path must point to a directory: ${resolved.relativePath}`);
    }
    return resolved;
}

async function resolveExistingOrWritablePath(
    absolutePath: string,
    relativeInput: string,
    normalizedRoot: string,
    allowedDirectories: string[],
    options: WorkspaceRelativePathOptions
): Promise<WorkspacePathResolution> {
    try {
        const realPath = await fs.realpath(absolutePath);
        return resolveRealWorkspacePath(realPath, normalizedRoot, allowedDirectories);
    } catch (error: unknown) {
        if (!hasErrorCode(error, 'ENOENT')) {
            throw new Error('path could not be resolved inside the VS Code workspace.');
        }
        if (!options.forWrite) {
            throw new Error('path must point to an existing workspace path.');
        }
    }

    await assertWritableParentAllowed(absolutePath, allowedDirectories, options);
    return {
        absolutePath,
        relativePath: toPosixPath(path.relative(normalizedRoot, absolutePath)) || relativeInput
    };
}

function resolveRealWorkspacePath(
    realPath: string,
    normalizedRoot: string,
    allowedDirectories: string[]
): WorkspacePathResolution {
    if (!isAllowedPath(realPath, allowedDirectories)) {
        throw new Error('path must stay inside the VS Code workspace.');
    }

    const relativeBase = allowedDirectories.find(directory => isAllowedPath(realPath, [directory])) ?? normalizedRoot;
    return {
        absolutePath: realPath,
        relativePath: toPosixPath(path.relative(relativeBase, realPath)) || '.'
    };
}

async function assertWritableParentAllowed(
    absolutePath: string,
    allowedDirectories: string[],
    options: WorkspaceRelativePathOptions
): Promise<void> {
    const parentDirectory = path.dirname(absolutePath);
    if (options.createParentDirectories) {
        await assertExistingAncestorAllowed(parentDirectory, allowedDirectories);
        await fs.mkdir(parentDirectory, { recursive: true });
    }

    const realParent = await fs.realpath(parentDirectory).catch(() => null);
    if (!realParent) {
        throw new Error('parent directory must exist inside the VS Code workspace.');
    }
    if (!isAllowedPath(realParent, allowedDirectories)) {
        throw new Error('path must stay inside the VS Code workspace.');
    }
}

async function assertExistingAncestorAllowed(directoryPath: string, allowedDirectories: string[]): Promise<void> {
    let currentPath = path.resolve(path.normalize(directoryPath));

    while (true) {
        const realPath = await fs.realpath(currentPath).catch((error: unknown) => {
            if (hasErrorCode(error, 'ENOENT')) {
                return null;
            }
            throw new Error('path could not be resolved inside the VS Code workspace.');
        });
        if (realPath) {
            if (!isAllowedPath(realPath, allowedDirectories)) {
                throw new Error('path must stay inside the VS Code workspace.');
            }
            return;
        }

        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            throw new Error('Cannot create parent directories: no existing workspace ancestor found.');
        }
        currentPath = parentPath;
    }
}

function normalizeWorkspaceRelativePathInput(
    requestedPath: unknown,
    options: WorkspaceRelativePathOptions
): string {
    if (typeof requestedPath !== 'string') {
        throw new Error('path must be a workspace-relative string.');
    }

    const trimmed = requestedPath.trim();
    const value = trimmed === '' && options.allowEmptyAsRoot ? '.' : trimmed;
    if (value === '') {
        throw new Error('path must be a non-empty workspace-relative string.');
    }
    if (value.includes('\0')) {
        throw new Error('path must not contain null bytes.');
    }
    if (value.includes('\\')) {
        throw new Error('path must use "/" separators; backslashes are not allowed.');
    }
    if (isAbsoluteOrHomePath(value)) {
        throw new Error('path must be workspace-relative; absolute paths are not allowed.');
    }

    return value;
}

function isAbsoluteOrHomePath(value: string): boolean {
    return value.startsWith('~') ||
        /^[A-Za-z]:/.test(value) ||
        path.win32.isAbsolute(value) ||
        path.posix.isAbsolute(value);
}

async function getAllowedWorkspaceDirectories(workspaceRoot: string): Promise<string[]> {
    const realRoot = await fs.realpath(workspaceRoot).catch(() => workspaceRoot);
    return Array.from(new Set([workspaceRoot, realRoot].map(item => path.resolve(path.normalize(item)))));
}

function isAllowedPath(absolutePath: string, allowedDirectories: string[]): boolean {
    const normalizedPath = path.resolve(path.normalize(absolutePath));
    return allowedDirectories.some(directory => (
        normalizedPath === directory ||
        normalizedPath.startsWith(directory.endsWith(path.sep) ? directory : `${directory}${path.sep}`)
    ));
}

function hasErrorCode(error: unknown, code: string): boolean {
    return typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === code;
}
