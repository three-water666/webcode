import { assessCommandPolicy } from './commandPolicy';
import { assessPathPolicy } from './commandPathPolicy';
import {
    combineRiskIssues,
    type CommandRiskAssessment,
    type CommandRiskContext
} from './commandRiskTypes';
import { parseShellCommand, type ParsedShellCommand } from './shellCommandParser';

export type { CommandRiskAssessment, CommandRiskContext, CommandRiskLevel } from './commandRiskTypes';

export class CommandRiskError extends Error {
    constructor(readonly assessment: CommandRiskAssessment) {
        super(formatCommandRiskAssessment(assessment));
        this.name = 'CommandRiskError';
    }
}

export function assessShellCommandRisk(command: string, context: CommandRiskContext = {}): CommandRiskAssessment {
    return assessParsedShellCommandRisk(parseShellCommand(command, 'posix'), context);
}

export function assessParsedShellCommandRisk(
    parsed: ParsedShellCommand,
    context: CommandRiskContext = {}
): CommandRiskAssessment {
    return combineRiskIssues([
        ...assessCommandPolicy(parsed),
        ...assessPathPolicy(parsed, context)
    ]);
}

export function assertShellCommandRiskAllowed(command: string, context: CommandRiskContext = {}): void {
    const assessment = assessShellCommandRisk(command, context);
    if (assessment.level !== 'allowed') {
        throw new CommandRiskError(assessment);
    }
}

export function formatCommandRiskAssessment(assessment: CommandRiskAssessment): string {
    if (assessment.level === 'allowed') {
        return 'Command risk assessment passed.';
    }

    return `Command rejected by ${assessment.level} risk policy: ${assessment.reasons.join(' ')}`;
}
