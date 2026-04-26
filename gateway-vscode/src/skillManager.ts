import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

const DEFAULT_SKILL_DIRECTORIES = [
  '.agents/skills',
  '.codex/skills',
  'skills'
];

const MAX_SCAN_DEPTH = 8;
const CACHE_TTL_MS = 3000;

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  workspaceFolder: string;
  relativePath: string;
  sourceDir: string;
}

interface SkillEntry extends SkillSummary {
  rootPath: string;
  skillFilePath: string;
}

interface ParsedSkillFile {
  name?: string;
  description: string;
  body: string;
}

export class SkillManager {
  private cache: SkillEntry[] = [];
  private lastScanAt = 0;

  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  invalidateCache(reason = 'manual refresh') {
    this.cache = [];
    this.lastScanAt = 0;
    this.log(`Cache invalidated: ${reason}`);
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

  async getSkillDetails(
    params: { skill_id?: string; skill_name?: string },
    customDirectories: string[] = []
  ) {
    const skill = await this.resolveSkill(params, customDirectories);
    const raw = await fs.readFile(skill.skillFilePath, 'utf8');
    const parsed = this.parseSkillFile(raw, skill.rootPath);
    const resources = await this.listSkillResources(skill.rootPath);

    return {
      skill: this.toSummary(skill),
      content: parsed.body.trim(),
      resources
    };
  }

  async getSkillResource(
    params: { skill_id?: string; skill_name?: string; resource_path: string },
    customDirectories: string[] = []
  ) {
    const skill = await this.resolveSkill(params, customDirectories);
    const requestedPath = params.resource_path?.trim();

    if (!requestedPath) {
      throw new Error('Missing required field: resource_path');
    }

    const absolutePath = path.resolve(skill.rootPath, requestedPath);
    if (!this.isSubPath(skill.rootPath, absolutePath)) {
      throw new Error(`Resource path is outside the skill directory: ${requestedPath}`);
    }

    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat?.isFile()) {
      throw new Error(`Skill resource not found: ${requestedPath}`);
    }

    const content = await fs.readFile(absolutePath, 'utf8');
    return {
      skill: this.toSummary(skill),
      resource_path: this.normalizeRelativePath(path.relative(skill.rootPath, absolutePath)),
      content
    };
  }

  private async resolveSkill(
    params: { skill_id?: string; skill_name?: string },
    customDirectories: string[]
  ): Promise<SkillEntry> {
    const entries = await this.scanSkills(customDirectories);
    const skillId = params.skill_id?.trim();
    const skillName = params.skill_name?.trim();

    if (!skillId && !skillName) {
      throw new Error('Provide either skill_id or skill_name');
    }

    if (skillId) {
      const byId = entries.find((entry) => entry.id === skillId);
      if (byId) {
        return byId;
      }
    }

    if (skillName) {
      const exact = entries.filter((entry) => entry.name === skillName);
      if (exact.length === 1) {
        return exact[0];
      }
      if (exact.length > 1) {
        const ids = exact.map((entry) => entry.id).join(', ');
        throw new Error(`Multiple skills found for "${skillName}". Use skill_id instead: ${ids}`);
      }

      const insensitive = entries.find((entry) => entry.name.toLowerCase() === skillName.toLowerCase());
      if (insensitive) {
        return insensitive;
      }
    }

    throw new Error(`Skill not found: ${skillId ?? skillName}`);
  }

  private async scanSkills(customDirectories: string[]): Promise<SkillEntry[]> {
    const now = Date.now();
    if (now - this.lastScanAt < CACHE_TTL_MS) {
      return this.cache;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length === 0) {
      this.cache = [];
      this.lastScanAt = now;
      return this.cache;
    }

    const searchRoots = this.getSearchDirectories(customDirectories);
    const found = new Map<string, SkillEntry>();

    for (const folder of workspaceFolders) {
      for (const relativeDir of searchRoots) {
        const absoluteDir = path.resolve(folder.uri.fsPath, relativeDir);
        await this.collectSkillsFromDirectory(folder, relativeDir, absoluteDir, found);
      }
    }

    this.cache = Array.from(found.values()).sort((a, b) => a.id.localeCompare(b.id));
    this.lastScanAt = now;
    this.log(`Indexed ${this.cache.length} workspace skills.`);
    return this.cache;
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
    const sourceDirNormalized = this.normalizeRelativePath(sourceDir);
    const id = `${workspaceFolder.name}:${relativePath}`;

    return {
      id,
      name: parsed.name ?? path.basename(rootPath),
      description: parsed.description,
      workspaceFolder: workspaceFolder.name,
      relativePath,
      sourceDir: sourceDirNormalized,
      rootPath,
      skillFilePath
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
      description: parsedDescription,
      body
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

  private async listSkillResources(skillRoot: string): Promise<string[]> {
    const resources: string[] = [];
    const stack = [skillRoot];

    while (stack.length > 0) {
      const currentDir = stack.pop();
      if (!currentDir) {continue;}
      const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);

      for (const entry of entries) {
        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(absolutePath);
          continue;
        }
        if (entry.name === 'SKILL.md') {
          continue;
        }
        resources.push(this.normalizeRelativePath(path.relative(skillRoot, absolutePath)));
      }
    }

    return resources.sort();
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
      .map((dir) => dir.replace(/[\\/]+/g, '/').replace(/^\.\//, '').replace(/\/$/, ''))));
  }

  private toSummary(entry: SkillEntry): SkillSummary {
    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      workspaceFolder: entry.workspaceFolder,
      relativePath: entry.relativePath,
      sourceDir: entry.sourceDir
    };
  }

  private normalizeRelativePath(value: string): string {
    return value.replace(/[\\/]+/g, '/');
  }

  private isSubPath(parentPath: string, childPath: string): boolean {
    const relative = path.relative(parentPath, childPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  private log(message: string) {
    this.outputChannel.appendLine(`[SkillManager] ${message}`);
  }
}
