import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import type { Dirent } from 'fs';
import { textResult } from './result';
import type { LocalTool } from './types';

type GitCommit = {
    date: string;
    hash: string;
    subject: string;
};

type GitSummary = {
    isGitRepository: boolean;
    recentCommits: GitCommit[];
};

type StructureSummary = {
    lines: string[];
    truncated: boolean;
};

type QueueItem = {
    absolutePath: string;
    depth: number;
    relativePath: string;
};

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 2000;
const MAX_DEPTH = 2;
const MAX_ENTRIES_PER_DIRECTORY = 40;
const MAX_TOTAL_STRUCTURE_ENTRIES = 100;

const NON_RECURSIVE_ENTRY_NAMES = new Set([
    '.git',
    '.hg',
    '.svn',
    '.cache',
    '.next',
    '.nuxt',
    '.parcel-cache',
    '.pnpm-store',
    '.turbo',
    '.vscode-test',
    'build',
    'coverage',
    'dist',
    'node_modules',
    'out',
    'release'
]);

export const getProjectContextTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'get_project_context',
        description: 'Summarize the current workspace folder name, Git status, shallow project structure, and recent commits.',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        annotations: { readOnlyHint: true }
    },
    async execute(_args, context) {
        return textResult(await buildProjectContextForPrompt(context.workspaceRoot));
    }
};

export async function buildProjectContextForPrompt(workspaceRoot: string | null): Promise<string> {
    if (!workspaceRoot) {
        return [
            '# Project Context',
            '- Current project folder: (no VS Code workspace folder)',
            '- Git repository: no'
        ].join('\n');
    }

    const projectName = getProjectName(workspaceRoot);
    const [structure, git] = await Promise.all([
        buildProjectStructure(workspaceRoot, projectName),
        readGitSummary(workspaceRoot)
    ]);

    return formatProjectContext(projectName, structure, git);
}

async function buildProjectStructure(workspaceRoot: string, projectName: string): Promise<StructureSummary> {
    const lines = [`${projectName}/`];
    const queue: QueueItem[] = [{ absolutePath: workspaceRoot, depth: 0, relativePath: '' }];
    let remainingEntries = MAX_TOTAL_STRUCTURE_ENTRIES;
    let truncated = false;

    while (queue.length > 0 && remainingEntries > 0) {
        const item = queue.shift();
        if (!item || item.depth >= MAX_DEPTH) {continue;}

        const entries = await readDirectoryEntries(item.absolutePath);
        const visibleEntries = entries.slice(0, MAX_ENTRIES_PER_DIRECTORY);
        truncated = truncated || visibleEntries.length < entries.length;

        for (const entry of visibleEntries) {
            if (remainingEntries <= 0) {
                truncated = true;
                break;
            }

            const childRelativePath = joinRelativePath(item.relativePath, entry.name);
            lines.push(formatStructureLine(childRelativePath, item.depth + 1, entry.isDirectory()));
            remainingEntries -= 1;

            if (shouldQueueDirectory(entry, item.depth + 1)) {
                queue.push({
                    absolutePath: path.join(item.absolutePath, entry.name),
                    depth: item.depth + 1,
                    relativePath: childRelativePath
                });
            }
        }
    }

    if (queue.length > 0) {
        truncated = true;
    }

    return {
        lines: truncated ? [...lines, '  ... additional entries omitted'] : lines,
        truncated
    };
}

async function readDirectoryEntries(absolutePath: string): Promise<Dirent[]> {
    try {
        const entries = await fs.readdir(absolutePath, { withFileTypes: true });
        return entries.sort(compareDirectoryEntries);
    } catch {
        return [];
    }
}

async function readGitSummary(workspaceRoot: string): Promise<GitSummary> {
    if (!await resolveGitRepositoryStatus(workspaceRoot)) {
        return { isGitRepository: false, recentCommits: [] };
    }

    return {
        isGitRepository: true,
        recentCommits: parseGitLog(await readRecentGitLog(workspaceRoot))
    };
}

async function resolveGitRepositoryStatus(workspaceRoot: string): Promise<boolean> {
    const gitCommandStatus = await readGitRepositoryStatus(workspaceRoot);
    return gitCommandStatus ?? await hasGitMetadata(workspaceRoot);
}

async function readGitRepositoryStatus(workspaceRoot: string): Promise<boolean | null> {
    try {
        const output = await runGit(workspaceRoot, ['rev-parse', '--is-inside-work-tree']);
        return output.trim() === 'true';
    } catch {
        return null;
    }
}

async function readRecentGitLog(workspaceRoot: string): Promise<string> {
    try {
        return await runGit(workspaceRoot, ['log', '-5', '--pretty=format:%h%x09%ad%x09%s', '--date=short']);
    } catch {
        return '';
    }
}

async function runGit(workspaceRoot: string, args: string[]): Promise<string> {
    const result = await execFileAsync('git', ['-C', workspaceRoot, ...args], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true
    });
    return String(result.stdout);
}

async function hasGitMetadata(workspaceRoot: string): Promise<boolean> {
    try {
        const gitPath = path.join(workspaceRoot, '.git');
        const stats = await fs.stat(gitPath);
        if (stats.isFile()) {
            return await isGitFilePointer(gitPath);
        }
        return stats.isDirectory() ? await isGitDirectory(gitPath) : false;
    } catch {
        return false;
    }
}

async function isGitDirectory(gitPath: string): Promise<boolean> {
    try {
        const head = await fs.readFile(path.join(gitPath, 'HEAD'), 'utf8');
        return head.trim().length > 0;
    } catch {
        return false;
    }
}

async function isGitFilePointer(gitPath: string): Promise<boolean> {
    try {
        const content = await fs.readFile(gitPath, 'utf8');
        return /^gitdir:\s*\S+/i.test(content);
    } catch {
        return false;
    }
}

function formatProjectContext(projectName: string, structure: StructureSummary, git: GitSummary): string {
    const lines = [
        '# Project Context',
        `- Current project folder: ${projectName}`,
        `- Git repository: ${git.isGitRepository ? 'yes' : 'no'}`,
        '',
        '## Project Structure',
        `Depth 2, breadth-first, up to ${MAX_TOTAL_STRUCTURE_ENTRIES} entries.`,
        'Common generated and VCS folders are shown but not expanded.',
        '```text',
        ...structure.lines,
        '```'
    ];

    if (structure.truncated) {
        lines.push('', 'Common generated folders and extra entries were omitted from the structure summary.');
    }

    if (git.isGitRepository) {
        lines.push('', '## Recent Git Commits', ...formatGitCommits(git.recentCommits));
    }

    return lines.join('\n');
}

function parseGitLog(output: string): GitCommit[] {
    return output
        .split(/\r?\n/)
        .filter(line => line.trim().length > 0)
        .map(parseGitLogLine)
        .filter(commit => commit.hash.length > 0);
}

function parseGitLogLine(line: string): GitCommit {
    const [hash = '', date = '', ...subjectParts] = line.split('\t');
    return {
        hash,
        date,
        subject: subjectParts.join('\t') || '(no subject)'
    };
}

function formatGitCommit(commit: GitCommit): string {
    return `- ${commit.hash} ${commit.date} ${commit.subject}`;
}

function formatGitCommits(commits: GitCommit[]): string[] {
    return commits.length > 0 ? commits.map(formatGitCommit) : ['- (no commits found)'];
}

function formatStructureLine(relativePath: string, depth: number, isDirectory: boolean): string {
    return `${'  '.repeat(depth)}${toPosixPath(relativePath)}${isDirectory ? '/' : ''}`;
}

function shouldQueueDirectory(entry: Dirent, depth: number): boolean {
    return entry.isDirectory() && depth < MAX_DEPTH && !NON_RECURSIVE_ENTRY_NAMES.has(entry.name);
}

function joinRelativePath(parentPath: string, name: string): string {
    return parentPath ? `${parentPath}/${name}` : name;
}

function compareDirectoryEntries(a: Dirent, b: Dirent): number {
    if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
}

function getProjectName(workspaceRoot: string): string {
    return path.basename(path.resolve(workspaceRoot)) || 'workspace';
}

function toPosixPath(value: string): string {
    return value.replace(/\\/g, '/');
}
