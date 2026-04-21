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
}

export function deactivate() {}
