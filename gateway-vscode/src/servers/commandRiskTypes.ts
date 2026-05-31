export type CommandRiskLevel = 'allowed' | 'dangerous' | 'blocked';

export interface CommandRiskAssessment {
    level: CommandRiskLevel;
    reasons: string[];
}

export interface CommandRiskContext {
    workspaceRoot?: string;
    cwd?: string;
    platform?: NodeJS.Platform;
}

export interface CommandRiskIssue {
    level: Exclude<CommandRiskLevel, 'allowed'>;
    reason: string;
}

export function combineRiskIssues(issues: CommandRiskIssue[]): CommandRiskAssessment {
    const blocked = issues.filter(issue => issue.level === 'blocked').map(issue => issue.reason);
    const dangerous = issues.filter(issue => issue.level === 'dangerous').map(issue => issue.reason);
    const reasons = unique(blocked.length > 0 ? blocked : dangerous);

    return {
        level: blocked.length > 0 ? 'blocked' : dangerous.length > 0 ? 'dangerous' : 'allowed',
        reasons
    };
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values));
}
