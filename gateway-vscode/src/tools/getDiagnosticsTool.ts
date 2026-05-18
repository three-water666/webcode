import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { LocalTool } from './types';
import { jsonResult } from './result';
import { resolveWorkspacePath, toPosixPath } from './filesystemUtils';

type SeverityName = 'error' | 'warning' | 'information' | 'hint';

const ALL_SEVERITIES: SeverityName[] = ['error', 'warning', 'information', 'hint'];

export const getDiagnosticsTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'get_diagnostics',
        description: 'Return VS Code diagnostics such as TypeScript, ESLint, or language-server errors. Use this after editing or when investigating compile/lint issues.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Optional workspace-relative or absolute file/directory path. If omitted, returns diagnostics for the current workspace.'
                },
                severities: {
                    type: 'array',
                    items: { type: 'string', enum: ALL_SEVERITIES },
                    minItems: 1,
                    description: 'Optional severity filter. Default: all severities.'
                },
                max_results: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 1000,
                    description: 'Maximum diagnostics to return. Default: 200.',
                    default: 200
                }
            }
        }
    },
    async execute(args, context) {
        const maxResults = typeof args.max_results === 'number' ? args.max_results : 200;
        const requestedSeverities = Array.isArray(args.severities)
            ? args.severities.filter((item): item is SeverityName => ALL_SEVERITIES.includes(item as SeverityName))
            : ALL_SEVERITIES;
        const severityFilter = new Set(requestedSeverities);
        const targetPath = typeof args.path === 'string'
            ? await resolveWorkspacePath(context.workspaceRoot, args.path)
            : null;
        const targetStat = targetPath ? await fs.stat(targetPath) : null;
        const diagnostics = collectDiagnostics(targetPath, targetStat, context.workspaceRoot, severityFilter);

        return jsonResult({
            workspaceRoot: context.workspaceRoot,
            path: typeof args.path === 'string' ? args.path : null,
            severities: requestedSeverities,
            total: diagnostics.length,
            returned: Math.min(diagnostics.length, maxResults),
            diagnostics: diagnostics.slice(0, maxResults)
        });
    }
};

function collectDiagnostics(
    targetPath: string | null,
    targetStat: Awaited<ReturnType<typeof fs.stat>> | null,
    workspaceRoot: string | null,
    severityFilter: Set<SeverityName>
) {
    const entries = targetPath && targetStat?.isFile()
        ? [[vscode.Uri.file(targetPath), vscode.languages.getDiagnostics(vscode.Uri.file(targetPath))] as [vscode.Uri, vscode.Diagnostic[]]]
        : vscode.languages.getDiagnostics();
    const workspacePath = workspaceRoot ? path.resolve(workspaceRoot) : null;
    const normalizedTarget = targetPath ? path.resolve(targetPath) : null;
    const targetIsDirectory = targetStat?.isDirectory() ?? false;

    return entries
        .filter(([uri]) => uri.scheme === 'file')
        .filter(([uri]) => {
            const filePath = path.resolve(uri.fsPath);
            if (normalizedTarget) {
                return targetIsDirectory ? isSubPath(normalizedTarget, filePath) : filePath === normalizedTarget;
            }
            return workspacePath ? isSubPath(workspacePath, filePath) : true;
        })
        .flatMap(([uri, items]) => items.map((diagnostic) => ({ uri, diagnostic })))
        .map(({ uri, diagnostic }) => toDiagnosticRecord(uri, diagnostic, workspacePath))
        .filter((diagnostic) => severityFilter.has(diagnostic.severity))
        .sort((a, b) => (
            severityRank(a.severity) - severityRank(b.severity)
            || a.path.localeCompare(b.path)
            || a.range.start.line - b.range.start.line
            || a.range.start.character - b.range.start.character
        ));
}

function toDiagnosticRecord(uri: vscode.Uri, diagnostic: vscode.Diagnostic, workspaceRoot: string | null) {
    const filePath = path.resolve(uri.fsPath);
    const relativePath = workspaceRoot && isSubPath(workspaceRoot, filePath)
        ? toPosixPath(path.relative(workspaceRoot, filePath))
        : toPosixPath(filePath);

    return {
        path: relativePath,
        uri: uri.toString(),
        severity: severityName(diagnostic.severity),
        source: diagnostic.source ?? null,
        code: diagnosticCode(diagnostic.code),
        message: diagnostic.message,
        range: {
            start: {
                line: diagnostic.range.start.line + 1,
                character: diagnostic.range.start.character + 1
            },
            end: {
                line: diagnostic.range.end.line + 1,
                character: diagnostic.range.end.character + 1
            }
        }
    };
}

function severityName(severity: vscode.DiagnosticSeverity): SeverityName {
    switch (severity) {
        case vscode.DiagnosticSeverity.Error:
            return 'error';
        case vscode.DiagnosticSeverity.Warning:
            return 'warning';
        case vscode.DiagnosticSeverity.Information:
            return 'information';
        case vscode.DiagnosticSeverity.Hint:
            return 'hint';
        default:
            return 'information';
    }
}

function severityRank(severity: SeverityName): number {
    return ALL_SEVERITIES.indexOf(severity);
}

function diagnosticCode(code: vscode.Diagnostic['code']): string | number | null {
    if (code === undefined || code === null) {
        return null;
    }
    if (typeof code === 'string' || typeof code === 'number') {
        return code;
    }
    return code.value;
}

function isSubPath(parentPath: string, childPath: string): boolean {
    const relative = path.relative(parentPath, childPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
