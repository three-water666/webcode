import * as vscode from 'vscode';

import type { GatewayManager } from '../gateway';

export interface SkillWatcherController {
    refresh(): void;
}

const DEFAULT_SKILL_DIRECTORIES = ['.agents/skills', '.codex/skills', 'skills'];

export function createSkillWatcherController(
    context: vscode.ExtensionContext,
    manager: GatewayManager
): SkillWatcherController {
    let skillWatchers: vscode.Disposable[] = [];

    const disposeSkillWatchers = () => {
        vscode.Disposable.from(...skillWatchers).dispose();
        skillWatchers = [];
    };

    const refresh = () => {
        disposeSkillWatchers();

        const config = vscode.workspace.getConfiguration('webcodeGateway');
        const skillDirectories = config.get<string[]>('skillDirectories') ?? [];
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        const normalizedDirectories = normalizeSkillDirectories(skillDirectories);

        for (const folder of workspaceFolders) {
            for (const relativeDir of normalizedDirectories) {
                const pattern = new vscode.RelativePattern(folder, `${relativeDir.replace(/[\\/]+/g, '/')}/**`);
                const watcher = vscode.workspace.createFileSystemWatcher(pattern);

                watcher.onDidCreate(uri => manager.invalidateSkillCache(`created ${vscode.workspace.asRelativePath(uri)}`));
                watcher.onDidChange(uri => manager.invalidateSkillCache(`changed ${vscode.workspace.asRelativePath(uri)}`));
                watcher.onDidDelete(uri => manager.invalidateSkillCache(`deleted ${vscode.workspace.asRelativePath(uri)}`));

                skillWatchers.push(watcher);
            }
        }

        context.subscriptions.push(...skillWatchers);
    };

    return { refresh };
}

function normalizeSkillDirectories(skillDirectories: string[]): string[] {
    return Array.from(new Set(
        [...DEFAULT_SKILL_DIRECTORIES, ...skillDirectories]
            .map(dir => dir.trim())
            .filter(Boolean)
    ));
}
