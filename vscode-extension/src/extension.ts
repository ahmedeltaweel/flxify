import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================
// 1. BoopState — VS Code Bridge
// ============================================================
// Replicates the web app's BoopState API so scripts are universal.
// state.text reads/writes selection if selected, else fullText.
// postError/postInfo collect messages for VS Code notifications.

class BoopState {
	private _fullText: string;
	private _selection: string | null;
	private _isSelection: boolean;
	private _insertText: string | null = null;
	private _errors: string[] = [];
	private _infos: string[] = [];

	constructor(fullText: string, selection: string | null) {
		this._fullText = fullText;
		this._selection = selection;
		this._isSelection = selection !== null && selection.length > 0;
	}

	get fullText(): string { return this._fullText; }
	set fullText(val: string) { this._fullText = val; }

	get selection(): string | null { return this._selection; }
	set selection(val: string | null) { this._selection = val; }

	get isSelection(): boolean { return this._isSelection; }

	get text(): string {
		return this._isSelection ? (this._selection ?? this._fullText) : this._fullText;
	}
	set text(val: string) {
		if (this._isSelection) {
			this._selection = val;
		} else {
			this._fullText = val;
		}
	}

	postError(msg: string): void { this._errors.push(msg); }
	postInfo(msg: string): void { this._infos.push(msg); }
	insert(text: string): void { this._insertText = text; }

	get insertText(): string | null { return this._insertText; }
	get errors(): string[] { return this._errors; }
	get infos(): string[] { return this._infos; }
}

// ============================================================
// 2. Require Shim — loads lib modules from scripts/lib/
// ============================================================
// Replicates the web app's require('@flxify/moduleName') shim.
// Modules are CommonJS format, wrapped in a sandbox.

function createRequire(libDir: string): (modulePath: string) => any {
	const cache: Record<string, any> = {};

	return function flxifyRequire(modulePath: string): any {
		if (typeof modulePath === 'string' && modulePath.startsWith('@flxify/')) {
			const name = modulePath.replace('@flxify/', '').replace(/\.js$/, '');
			if (cache[name]) { return cache[name]; }

			const libPath = path.join(libDir, name + '.js');
			if (fs.existsSync(libPath)) {
				const source = fs.readFileSync(libPath, 'utf-8');
				const moduleObj: { exports: any } = { exports: {} };
				// eslint-disable-next-line no-new-func
				const wrapper = new Function('exports', 'module', 'require', source);
				wrapper(moduleObj.exports, moduleObj, flxifyRequire);
				cache[name] = moduleObj.exports;
				return cache[name];
			}
			console.warn('Flxify module not found: ' + name);
		}
		return null;
	};
}

// ============================================================
// 3. Script Metadata Types
// ============================================================

interface ScriptMetadata {
	api?: number;
	name: string;
	description: string;
	author?: string;
	icon?: string;
	tags?: string;
}

interface FlxifyScript {
	name: string;
	description: string;
	tags: string;
	filePath: string;
	execute: (req: (m: string) => any, state: BoopState) => void;
}

// ============================================================
// 4. Dynamic Script Loader
// ============================================================
// Auto-discovers scripts from the scripts/ directory.
// Parses metadata from the /** { ... } **/ block.
// Creates execute functions via new Function (safe in Node.js).

function loadScripts(scriptsDir: string): FlxifyScript[] {
	const scripts: FlxifyScript[] = [];

	let files: string[];
	try {
		files = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js')).sort();
	} catch {
		console.warn('Flxify: Could not read scripts directory:', scriptsDir);
		return scripts;
	}

	for (const file of files) {
		const filePath = path.join(scriptsDir, file);
		let source: string;
		try {
			source = fs.readFileSync(filePath, 'utf-8');
		} catch {
			continue;
		}

		// Parse metadata block: /** { ... } **/
		const metaMatch = source.match(/\/\*\*([\s\S]*?)\*\*\//);
		if (!metaMatch) { continue; }

		// Handle trailing commas in JSON metadata
		const cleanedJson = metaMatch[1].trim().replace(/,\s*([\]}])/g, '$1');
		let metadata: ScriptMetadata;
		try {
			metadata = JSON.parse(cleanedJson);
		} catch {
			console.warn(`Flxify: Invalid metadata in ${file}, skipping`);
			continue;
		}

		if (!metadata.name) { continue; }

		// Create execute function — scripts run in non-strict mode
		// The source includes `function main(state)`, we call it after
		let executeFn: (req: (m: string) => any, state: BoopState) => void;
		try {
			// eslint-disable-next-line no-new-func
			const fn = new Function('require', 'state',
				source + '\nif (typeof main === "function") main(state);'
			);
			executeFn = fn as any;
		} catch (e: any) {
			console.warn(`Flxify: Could not compile ${file}: ${e.message}`);
			continue;
		}

		scripts.push({
			name: metadata.name,
			description: metadata.description || '',
			tags: metadata.tags || '',
			filePath,
			execute: executeFn
		});
	}

	scripts.sort((a, b) => a.name.localeCompare(b.name));
	return scripts;
}

// ============================================================
// 5. QuickPick Item Type
// ============================================================

interface FlxifyQuickPickItem extends vscode.QuickPickItem {
	script: FlxifyScript;
}

// ============================================================
// Cron Hover Helpers
// ============================================================

interface CronMatch {
	expression: string;
	start: number;
	end: number;
}

/**
 * Find a cron expression at or near the given character position in a line.
 * Looks for 5 whitespace-separated fields that look like cron fields,
 * or a @-alias keyword. Returns the match whose range includes charPos.
 */
function findCronAtPosition(line: string, charPos: number): CronMatch | null {
	// Strategy 1: check for @-alias (single token)
	const aliasPattern = /@(?:yearly|annually|monthly|weekly|daily|midnight|hourly)/gi;
	let aliasMatch: RegExpExecArray | null;
	while ((aliasMatch = aliasPattern.exec(line)) !== null) {
		const start = aliasMatch.index;
		const end = start + aliasMatch[0].length;
		if (charPos >= start && charPos <= end) {
			return { expression: aliasMatch[0], start, end };
		}
	}

	// Strategy 2: scan for 5-field cron expression
	// Split by whitespace, tracking positions
	const tokens: Array<{ token: string; start: number; end: number }> = [];
	const tokenPattern = /\S+/g;
	let tokenMatch: RegExpExecArray | null;
	while ((tokenMatch = tokenPattern.exec(line)) !== null) {
		tokens.push({
			token: tokenMatch[0],
			start: tokenMatch.index,
			end: tokenMatch.index + tokenMatch[0].length
		});
	}

	// A cron field looks like: *, */N, N, N-M, N,M, or combinations
	// We accept anything that matches digits, *, /, -, , (permissive to handle edge cases)
	const isCronField = (s: string) => /^[\d*,\/\-]+$/.test(s) || /^[@\w]+$/.test(s);

	// Find all sequences of 5 consecutive tokens that look like cron fields
	for (let i = 0; i <= tokens.length - 5; i++) {
		const group = tokens.slice(i, i + 5);
		if (group.every(t => isCronField(t.token))) {
			const start = group[0].start;
			const end = group[4].end;
			// Check if charPos is within this group's range
			if (charPos >= start && charPos <= end) {
				const expression = group.map(t => t.token).join(' ');
				return { expression, start, end };
			}
		}
	}

	return null;
}

// ============================================================
// 6. Extension Activation
// ============================================================

export function activate(context: vscode.ExtensionContext) {
	const scriptsDir = path.join(context.extensionPath, 'src', 'scripts');
	const libDir = path.join(scriptsDir, 'lib');
	const flxifyRequire = createRequire(libDir);

	// Load all scripts dynamically at activation
	const scripts = loadScripts(scriptsDir);
	console.log(`Flxify: Loaded ${scripts.length} scripts`);

	const disposable = vscode.commands.registerCommand('flxify.runScript', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('Flxify: No active text editor.');
			return;
		}

		// Build QuickPick items
		const items: FlxifyQuickPickItem[] = scripts.map(s => ({
			label: s.name,
			description: s.tags,
			detail: s.description,
			script: s
		}));

		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: `Search ${scripts.length} Flxify scripts...`,
			matchOnDescription: true,
			matchOnDetail: true
		});

		if (!picked) { return; }

		const selections = editor.selections;
		const hasAnySelection = selections.some(s => !s.isEmpty);

		if (!hasAnySelection) {
			vscode.window.showInformationMessage('Flxify: No text selected — running on entire document.');
		}

		// Single editor.edit call = single undo step
		await editor.edit(editBuilder => {
			for (const selection of selections) {
				const selectedText = editor.document.getText(selection);
				const fullText = editor.document.getText();
				const hasSelection = !selection.isEmpty;

				const state = new BoopState(
					fullText,
					hasSelection ? selectedText : null
				);

				try {
					picked.script.execute(flxifyRequire, state);
				} catch (e: any) {
					vscode.window.showErrorMessage(`Flxify: ${e.message || 'Script error'}`);
					return;
				}

				// Show script-generated notifications
				for (const err of state.errors) {
					vscode.window.showErrorMessage(`Flxify: ${err}`);
				}
				for (const info of state.infos) {
					vscode.window.showInformationMessage(`Flxify: ${info}`);
				}

				// Apply results back to editor
				if (state.insertText !== null) {
					// Script used state.insert() — replace selection with inserted text
					editBuilder.replace(selection, state.insertText);
				} else if (hasSelection && state.selection !== null) {
					// Script modified selection text
					editBuilder.replace(selection, state.selection);
				} else if (!hasSelection) {
					// Script modified full document text
					const fullRange = new vscode.Range(
						editor.document.positionAt(0),
						editor.document.positionAt(fullText.length)
					);
					editBuilder.replace(fullRange, state.fullText);
				}
			}
		});
	});

	context.subscriptions.push(disposable);

	// ============================================================
	// 8. Cron Expression Hover Provider
	// ============================================================
	// When hovering over a cron expression in any file, show the
	// human-readable description and next 5 run times.

	// Load the cron-explain lib module via the existing require shim
	const cronExplainMod = flxifyRequire('@flxify/cron-explain');

	if (cronExplainMod) {
		const cronHoverProvider = vscode.languages.registerHoverProvider(
			{ scheme: 'file', language: '*' },
			{
				provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
					const line = document.lineAt(position.line).text;

					// Try to find a cron expression around the cursor position
					const cronMatch = findCronAtPosition(line, position.character);
					if (!cronMatch) { return null; }

					try {
						const result = cronExplainMod.explain(cronMatch.expression);
						const markdown = new vscode.MarkdownString();
						markdown.isTrusted = true;
						markdown.appendMarkdown(`**Cron:** \`${cronMatch.expression}\`\n\n`);
						markdown.appendMarkdown(`**Schedule:** ${result.description}\n\n`);
						markdown.appendMarkdown(`**Next 5 occurrences:**\n\n`);
						for (let i = 0; i < result.nextDates.length; i++) {
							const d = new Date(result.nextDates[i]);
							markdown.appendMarkdown(`${i + 1}. ${d.toLocaleString()}\n\n`);
						}
						markdown.appendMarkdown(`---\n*Flxify Cron Visualizer*`);

						const range = new vscode.Range(
							position.line, cronMatch.start,
							position.line, cronMatch.end
						);
						return new vscode.Hover(markdown, range);
					} catch {
						return null; // Invalid cron expression — no hover
					}
				}
			}
		);

		context.subscriptions.push(cronHoverProvider);
	}
}

// ============================================================
// 7. Extension Deactivation
// ============================================================

export function deactivate() {}
