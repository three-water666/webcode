import * as vscode from 'vscode';

import { t } from '../i18n';

export function registerCopyContextCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand('webcode-gateway.copyContext', async () => {
        await copyEditorContextToClipboard();
    }));
}

async function copyEditorContextToClipboard(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const selection = editor.selection;
    const text = editor.document.getText(selection);
    if (!text) {
        return;
    }

    // Get relative path (e.g., "src/extension.ts")
    const filePath = vscode.workspace.asRelativePath(editor.document.uri);

    // Format the clipboard content
    const contentWithContext = `File: ${filePath}\n\n${text}`;

    await vscode.env.clipboard.writeText(contentWithContext);
    vscode.window.setStatusBarMessage(t('context_copied', { filePath }), 3000);
}
