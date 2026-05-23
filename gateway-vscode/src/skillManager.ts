import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

const DEFAULT_SKILL_DIRECTORIES = [
  '.agents/skills',
  '.codex/skills',
  'skills'
];

const MAX_SCAN_DEPTH = 8;
const CACHE_TTL_MS = 30000;

export interface SkillSummary {
  name: string;
  description: string;
  relativePath: string;
  sourceDir: string;
  skillFilePath: string;
}

interface SkillEntry extends SkillSummary {
  id: string;
}

interface ParsedSkillFile {
  name?: string;
  description: string;
}

interface SkillCacheRecord {
  entries: SkillEntry[];
  lastScanAt: number;
}

export class SkillManager {
  private readonly caches = new Map<string, SkillCacheRecord>();

  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  invalidateCache(reason = 'manual refresh') {
    for (const cache of this.caches.values()) {
      cache.lastScanAt = 0;
    }
    this.log(`Cache marked stale: ${reason}`);
  }

  async listSkills(customDirectories: string[] = []): Promise<SkillSummary[]> {
    const entries = await this.scanSkills(customDirectories);
    return entries.map((entry) => this.toSummary(entry));
  }

  async searchSkills(query: string, customDirectories: string[] = [], limit = 10): Promise<SkillSummary[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return this.listSkills(customDirectories);
    }

    const tokens = normalized.split(/\s+/).filter(Boolean);
    const entries = await this.scanSkills(customDirectories);

    const ranked = entries
      .map((entry) => ({ entry, score: this.scoreSkill(entry, normalized, tokens) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
      .slice(0, limit)
      .map(({ entry }) => this.toSummary(entry));

    return ranked;
  }

  private async scanSkills(customDirectories: string[]): Promise<SkillEntry[]> {
    const now = Date.now();
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length === 0) {
      const clearedCount = this.clearCaches();
      if (clearedCount > 0) {
        this.log(`Workspace folders unavailable; cleared ${clearedCount} cached skills.`);
      } else {
        this.log('Workspace folders unavailable; no cached skills to clear.');
      }
      return [];
    }

    const searchRoots = this.getSearchDirectories(customDirectories);
    const cacheKey = this.getCacheKey(searchRoots);
    const cache = this.getCache(cacheKey);

    if (now - cache.lastScanAt < CACHE_TTL_MS) {
      return cache.entries;
    }

    const found = new Map<string, SkillEntry>();

    for (const folder of workspaceFolders) {
      for (const relativeDir of searchRoots) {
        const absoluteDir = await this.resolveSkillSearchRoot(folder.uri.fsPath, relativeDir);
        if (!absoluteDir) {
          continue;
        }
        await this.collectSkillsFromDirectory(folder, relativeDir, absoluteDir, found);
      }
    }

    cache.entries = Array.from(found.values()).sort((a, b) => a.id.localeCompare(b.id));
    cache.lastScanAt = now;
    this.log(`Indexed ${cache.entries.length} workspace skills.`);
    return cache.entries;
  }

  private getCache(cacheKey: string): SkillCacheRecord {
    let cache = this.caches.get(cacheKey);
    if (!cache) {
      cache = { entries: [], lastScanAt: 0 };
      this.caches.set(cacheKey, cache);
    }
    return cache;
  }

  private clearCaches(): number {
    let clearedCount = 0;
    for (const cache of this.caches.values()) {
      clearedCount += cache.entries.length;
      cache.entries = [];
      cache.lastScanAt = 0;
    }
    return clearedCount;
  }

  private async resolveSkillSearchRoot(workspaceRoot: string, relativeDir: string): Promise<string | null> {
    const absoluteDir = path.resolve(workspaceRoot, relativeDir);
    if (!this.isSubPath(workspaceRoot, absoluteDir)) {
      return null;
    }

    const realWorkspaceRoot = await fs.realpath(workspaceRoot).catch(() => workspaceRoot);
    const realDir = await fs.realpath(absoluteDir).catch(() => null);
    if (!realDir || !this.isSubPath(realWorkspaceRoot, realDir)) {
      return null;
    }

    return absoluteDir;
  }

  private async collectSkillsFromDirectory(
    workspaceFolder: vscode.WorkspaceFolder,
    sourceDir: string,
    rootDir: string,
    found: Map<string, SkillEntry>
  ) {
    const rootStat = await fs.stat(rootDir).catch(() => null);
    if (!rootStat?.isDirectory()) {
      return;
    }

    const stack: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {continue;}
      const skillFile = path.join(current.dir, 'SKILL.md');
      const skillStat = await fs.stat(skillFile).catch(() => null);

      if (skillStat?.isFile()) {
        const summary = await this.buildSkillEntry(workspaceFolder, sourceDir, current.dir, skillFile);
        found.set(summary.id, summary);
        continue;
      }

      if (current.depth >= MAX_SCAN_DEPTH) {
        continue;
      }

      const entries = await fs.readdir(current.dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }
        stack.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
      }
    }
  }

  private async buildSkillEntry(
    workspaceFolder: vscode.WorkspaceFolder,
    sourceDir: string,
    rootPath: string,
    skillFilePath: string
  ): Promise<SkillEntry> {
    const raw = await fs.readFile(skillFilePath, 'utf8');
    const parsed = this.parseSkillFile(raw, rootPath);
    const relativePath = this.normalizeRelativePath(path.relative(workspaceFolder.uri.fsPath, rootPath));
    const relativeSkillFilePath = this.normalizeRelativePath(path.relative(workspaceFolder.uri.fsPath, skillFilePath));
    const sourceDirNormalized = this.normalizeRelativePath(sourceDir);
    const id = `${workspaceFolder.name}:${relativePath}`;

    return {
      id,
      name: parsed.name ?? path.basename(rootPath),
      description: parsed.description,
      relativePath,
      sourceDir: sourceDirNormalized,
      skillFilePath: relativeSkillFilePath
    };
  }

  private parseSkillFile(content: string, rootPath: string): ParsedSkillFile {
    let body = content;
    let parsedName: string | undefined;
    let parsedDescription = '';

    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      body = content.slice(frontmatterMatch[0].length);

      for (const line of frontmatter.split(/\r?\n/)) {
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
        if (!match) {
          continue;
        }
        const key = match[1].toLowerCase();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (key === 'name') {
          parsedName = value;
        } else if (key === 'description') {
          parsedDescription = value;
        }
      }
    }

    if (!parsedName) {
      const headingMatch = body.match(/^#\s+(.+)$/m);
      if (headingMatch) {
        parsedName = headingMatch[1].trim();
      }
    }

    if (!parsedDescription) {
      parsedDescription = this.extractDescription(body) || `Skill loaded from ${path.basename(rootPath)}`;
    }

    return {
      name: parsedName,
      description: parsedDescription
    };
  }

  private extractDescription(body: string): string {
    const lines = body.split(/\r?\n/).map((line) => line.trim());
    const buffer: string[] = [];

    for (const line of lines) {
      if (!line) {
        if (buffer.length > 0) {
          break;
        }
        continue;
      }

      if (line.startsWith('#') || line.startsWith('```')) {
        continue;
      }

      buffer.push(line);
      if (buffer.join(' ').length >= 200) {
        break;
      }
    }

    return buffer.join(' ').slice(0, 240);
  }

  private scoreSkill(entry: SkillEntry, query: string, tokens: string[]): number {
    const haystackName = entry.name.toLowerCase();
    const haystackDesc = entry.description.toLowerCase();
    const haystackPath = entry.relativePath.toLowerCase();
    let score = 0;

    if (haystackName.includes(query)) {score += 30;}
    if (haystackDesc.includes(query)) {score += 15;}
    if (haystackPath.includes(query)) {score += 10;}

    for (const token of tokens) {
      if (haystackName.includes(token)) {score += 8;}
      if (haystackDesc.includes(token)) {score += 4;}
      if (haystackPath.includes(token)) {score += 3;}
    }

    return score;
  }

  private getSearchDirectories(customDirectories: string[]): string[] {
    return Array.from(new Set([...DEFAULT_SKILL_DIRECTORIES, ...customDirectories]
      .map((dir) => dir.trim())
      .filter(Boolean)
      .map((dir) => dir.replace(/[\\/]+/g, '/').replace(/^\.\//, '').replace(/\/$/, ''))
      .filter((dir) => this.isSafeWorkspaceRelativePath(dir))));
  }

  private getCacheKey(searchRoots: string[]): string {
    return searchRoots.join('\0');
  }

  private toSummary(entry: SkillEntry): SkillSummary {
    return {
      name: entry.name,
      description: entry.description,
      relativePath: entry.relativePath,
      sourceDir: entry.sourceDir,
      skillFilePath: entry.skillFilePath
    };
  }

  private normalizeRelativePath(value: string): string {
    return value.replace(/[\\/]+/g, '/');
  }

  private isSafeWorkspaceRelativePath(value: string): boolean {
    if (!value || value === '.' || path.isAbsolute(value) || /^[A-Za-z]:\//.test(value)) {
      return false;
    }

    const normalized = path.posix.normalize(value);
    return normalized !== '..' && !normalized.startsWith('../');
  }

  private isSubPath(parentPath: string, childPath: string): boolean {
    const relative = path.relative(parentPath, childPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  private log(message: string) {
    this.outputChannel.appendLine(`[SkillManager] ${message}`);
  }
}
