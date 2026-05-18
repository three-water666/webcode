import * as fs from 'fs/promises';
import * as path from 'path';
import type { LocalTool } from './types';
import { textResult } from './result';

type ProjectRuleDocument = {
    fileName: string;
    content: string;
};

export const getProjectRulesTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'get_project_rules',
        description: 'Read project-specific instruction files from the workspace root, including USER_RULES.md, AGENTS.md, or CLAUDE.md.',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        annotations: { readOnlyHint: true }
    },
    async execute(_args, context) {
        const documents = await readProjectRuleDocuments(context.workspaceRoot);
        return textResult(formatProjectRulesForPrompt(documents));
    }
};

async function readProjectRuleDocuments(root: string | null): Promise<ProjectRuleDocument[]> {
    if (!root) {
        return [];
    }

    const documents: ProjectRuleDocument[] = [];
    const userRules = await readProjectRuleFile(root, 'USER_RULES.md');
    if (userRules) {
        documents.push(userRules);
    }

    const agentsRules = await readProjectRuleFile(root, 'AGENTS.md');
    if (agentsRules) {
        documents.push(agentsRules);
        return documents;
    }

    const claudeRules = await readProjectRuleFile(root, 'CLAUDE.md');
    if (claudeRules) {
        documents.push(claudeRules);
    }

    return documents;
}

async function readProjectRuleFile(root: string, fileName: string): Promise<ProjectRuleDocument | null> {
    try {
        const content = await fs.readFile(path.join(root, fileName), 'utf8');
        return {
            fileName,
            content: content.trimEnd()
        };
    } catch (error: any) {
        if (error?.code === 'ENOENT' || error?.code === 'EISDIR') {
            return null;
        }
        throw error;
    }
}

function formatProjectRulesForPrompt(documents: ProjectRuleDocument[]): string {
    if (documents.length === 0) {
        return '';
    }

    const sections = documents
        .map(document => `## ${document.fileName}\n${document.content || '(empty)'}`)
        .join('\n\n');

    return [
        '# Project Rules',
        'The following project-specific instructions were read from the VS Code workspace root. Follow them for this session.',
        '',
        sections
    ].join('\n');
}
