import * as path from 'path';

import type { RemoteToolRoute } from './types';
import { isLocalPathToolName } from './remoteTools';

export function resolveLocalPathArguments(
    route: RemoteToolRoute,
    args: Record<string, unknown>,
    workspaceRoot: string | null
): void {
    if (!isLocalPathToolName(route.toolName) || !args || !workspaceRoot) {
        return;
    }

    const fixPath = (p: unknown) => {
        if (typeof p === 'string') {
            return resolveInsideWorkspace(workspaceRoot, p);
        }
        return p;
    };

    if (args.path) {args.path = fixPath(args.path);}
    if (args.cwd) {args.cwd = fixPath(args.cwd);}
    if (args.repo_path) {args.repo_path = fixPath(args.repo_path);}
    if (args.source) {args.source = fixPath(args.source);}
    if (args.destination) {args.destination = fixPath(args.destination);}
    if (Array.isArray(args.paths)) {args.paths = args.paths.map(p => fixPath(p));}
}

export function resolveInsideWorkspace(workspaceRoot: string, inputPath: string): string {
    if (inputPath.includes('\0')) {
        throw new Error(`Path contains null bytes: ${inputPath}`);
    }

    const root = path.resolve(workspaceRoot);
    const resolved = path.resolve(root, inputPath);
    const relative = path.relative(root, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Path escapes workspace: ${inputPath}`);
    }

    return resolved;
}
