import * as vscode from 'vscode';
import { CevizPanel } from './panel';

export function activate(context: vscode.ExtensionContext) {
    const provider = new CevizPanel(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('ceviz.chatView', provider)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('ceviz.newSession', () => provider.newSession())
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('ceviz.toggleEnglish', () => provider.toggleEnglish())
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('ceviz.openDashboard', () => provider.openDashboard())
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('ceviz.injectSelection', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showInformationMessage('CEVIZ: 코드를 선택한 후 실행하세요.');
                return;
            }
            const selection = editor.selection;
            const code = editor.document.getText(selection);
            const fileName = editor.document.fileName.split('/').pop() || editor.document.fileName;
            const language = editor.document.languageId;
            const lineStart = selection.start.line + 1;
            const lineEnd = selection.end.line + 1;
            provider.injectCodeContext({ code, fileName, language, lineStart, lineEnd });
        })
    );
}

export function deactivate() {}
