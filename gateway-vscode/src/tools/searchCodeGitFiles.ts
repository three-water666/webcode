import { spawn } from 'child_process';
import * as path from 'path';
import { toPosixPath } from './filesystemUtils';

export type SearchCandidateFile = {
    filePath: string;
    relativeToSearchRoot: string;
};

export function sortSearchCandidatesByRelativePath(candidates: SearchCandidateFile[]): SearchCandidateFile[] {
    return [...candidates].sort((left, right) => (
        left.relativeToSearchRoot.localeCompare(right.relativeToSearchRoot)
    ));
}

export async function listGitSearchFiles(searchRoot: string): Promise<SearchCandidateFile[] | null> {
    const output = await runGitListFiles(searchRoot);
    if (output === null) {
        return null;
    }

    const candidates: SearchCandidateFile[] = [];
    for (const rawPath of output.split('\0')) {
        const candidate = createSearchCandidate(searchRoot, rawPath);
        if (candidate) {
            candidates.push(candidate);
        }
    }

    return candidates;
}

async function runGitListFiles(searchRoot: string): Promise<string | null> {
    return new Promise(resolve => {
        const child = spawn('git', [
            '-C',
            searchRoot,
            'ls-files',
            '--cached',
            '--others',
            '--exclude-standard',
            '-z',
            '--',
            '.'
        ], {
            cwd: searchRoot,
            windowsHide: true
        });
        let spawnFailed = false;
        let stdout = '';

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });

        child.on('error', () => {
            spawnFailed = true;
            resolve(null);
        });
        child.on('close', code => {
            if (!spawnFailed) {
                resolve(code === 0 ? stdout : null);
            }
        });
    });
}

export function createSearchCandidate(searchRoot: string, rawPath: string): SearchCandidateFile | null {
    if (rawPath === '') {
        return null;
    }

    const relativeToSearchRoot = toPosixPath(rawPath).replace(/^\.\//, '');
    if (!relativeToSearchRoot || relativeToSearchRoot.includes('\0') || path.isAbsolute(relativeToSearchRoot)) {
        return null;
    }

    const filePath = path.resolve(searchRoot, relativeToSearchRoot);
    if (!isInsideDirectory(searchRoot, filePath)) {
        return null;
    }

    return {
        filePath,
        relativeToSearchRoot
    };
}

function isInsideDirectory(rootPath: string, candidatePath: string): boolean {
    const relative = path.relative(rootPath, candidatePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
