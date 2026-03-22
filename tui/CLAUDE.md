# Flxify TUI — Project Knowledge

The TUI (`tui/`) is a terminal-based text editor that mirrors the web experience: Vim keybindings, Command Palette (Ctrl+B), and all 113 scripts. Launched via `node tui/bin/flxify.js` or `flxify` when installed globally as `@flxify/cli`.

## Key Architecture

- **Framework: neo-blessed** (maintained blessed fork). CJS-native, built-in box model/focus management, truecolor support. Chosen over Ink (React for CLI) — Ink 5+ is ESM-only, conflicts with our CJS scripts.
- **Vim state machine** (`src/editor/vim.js`): Pure JS, zero blessed dependencies, fully testable. Implements Normal, Insert, Visual, Visual-Line modes with 40+ keybindings.
- **Script loading**: `fs.readdirSync()` + `new Function()` at runtime from root `scripts/` directory — NOT copied. Scripts dir resolved relative to `__dirname`.
- **BoopState bridge** (`src/scripts/boop-state.js`): Takes selected text as a string (like VS Code ext), not char offsets (like web app).
- **Require shim** (`src/scripts/require-shim.js`): `@flxify/moduleName` loader with `new Function()` CommonJS sandbox and caching.
- **CJS-only deps required**: chalk v4 (not v5), clipboardy v3 (not v4) — newer versions are ESM-only.
- **Config**: Persistent at `~/.config/flxify/config.json`. Separate from web app (`localStorage`).

## File Structure

```
tui/
  package.json              # @flxify/cli, neo-blessed dependency
  vitest.config.mjs         # globals: true
  bin/flxify.js             # CLI entry (--help, --version, --theme, [file])
  src/
    app.js                  # Bootstrap, keybindings, script/palette/theme wiring
    editor/
      buffer.js             # Array-of-lines text buffer + undo/redo (500 snapshots)
      editor.js             # Blessed box with manual rendering + key dispatch
      vim.js                # Vim FSM (Normal/Insert/Visual/Visual-Line, search, word ops)
      selection.js          # Visual mode selection tracking
      line-numbers.js       # Gutter widget (right-aligned, bold active line)
    palette/
      palette.js            # Floating overlay with fuzzy search + script execution
      fuzzy-search.js       # Ported from web app (exact=100, starts-with=80, etc.)
    scripts/
      boop-state.js         # BoopState class (TUI variant)
      script-loader.js      # fs.readdirSync + metadata parse + new Function()
      require-shim.js       # @flxify/ module loader with cache
      executor.js           # Script execution + result computation
    themes/
      themes.js             # 6 theme definitions (hex values from style.css)
      theme-engine.js       # Theme selection, cycling, display names, blessed color helpers
    config/
      config.js             # Persistent config at ~/.config/flxify/config.json
    ui/
      layout.js             # Top bar + editor + gutter + status bar composition
      status-bar.js         # Mode indicator, cursor position, theme name, [+] modified
      top-bar.js            # Branding + keyboard hints
      toast.js              # Ephemeral info/error notifications
  tests/                    # 654 tests across 7 files
```

## Development Workflow

- **Run:** `node tui/bin/flxify.js` or `node tui/bin/flxify.js path/to/file.txt`
- **Test:** `cd tui && npm test` (654 tests via Vitest)
- **Modify editor/vim:** Edit files in `src/editor/`, run `cd tui && npm test`
- **Modify themes:** Edit `src/themes/themes.js` (extract hex values from root `style.css`)
- **Scripts are shared:** TUI reads from root `scripts/` at runtime — no copy/sync needed
- **Vitest config:** `vitest.config.mjs` with `globals: true` — never `require('vitest')` in test files

## Gotchas

### neo-blessed

37. **Setulc terminfo bug.** On xterm-256color, neo-blessed errors on the `Setulc` (underline color) capability. Fires on BOTH `blessed.screen()` construction AND `screen.destroy()`. Fix: suppress stderr during both. Wrap all destroy calls in `safeDestroyScreen()`. Non-fatal.

38. **`tags: true` must be in constructor.** Setting `box.options.tags = true` after construction has NO effect — neo-blessed reads `parseTags` only from constructor options.

39. **Tag escaping — single-pass regex required.** Chained `.replace(/\{/g, '{open}').replace(/\}/g, '{close}')` is BROKEN — second replace corrupts `{open}` to `{open{close}`. Fix: `text.replace(/[{}]/g, function(ch) { return ch === '{' ? '{open}' : '{close}'; })`.

40. **`{bold}` alone is invisible on grey text.** Combine with bright foreground: `{bold}{#ffffff-fg}text{/}{/bold}`.

41. **Cmd key does NOT reach terminal apps on macOS.** Terminal emulators intercept Cmd. All terminal apps use Ctrl. Do NOT try to bind Cmd.

44. **CJS-only dependencies.** chalk v4 (not v5), clipboardy v3 (not v4). Newer versions are ESM-only and break non-strict-mode scripts.

### Palette

42. **Palette overlay needs fixed height.** Dynamic height from `filteredScripts.length` causes the container to shrink and clip scrolled content. Use fixed height based on `MAX_VISIBLE`.

43. **Variable shadowing in palette.** `var visible` inside `renderResults()` shadows the outer palette visibility flag. Use distinct names like `maxVisible`.

50. **Palette text must be truncated to prevent wrapping.** Long descriptions that exceed box inner width wrap to extra lines, breaking the 2-line-per-item layout. Truncate name/description to `overlayWidth() - 4` chars.

### Cursor / Render Order

47. **Gutter update BEFORE `screen.render()`.** `onCursorMove()` must be called BEFORE `screen.render()` so gutter updates in the same frame. Called after = classic one-frame-lag (gutter shows previous cursor line, arrows appear wrong on first press).

48. **Cursor position AFTER `screen.render()`.** Blessed's `draw()` cycle uses `tput.sc()/rc()` (save/restore cursor), overwriting any position set before render. Fix: `process.stdout.write('\x1b[row;colH')` AFTER `screen.render()`, then sync `screen.program.x/y`.

49. **Terminal Enter key sends `\r` not `\n`.** Raw mode: Enter → `\r` (0x0D) → `key.full = 'return'`. Only match `'return'` — matching both `'enter'` and `'return'` causes double newlines.

### Bug Fixes — v1.1.0

- **Garbled terminal on exit:** `safeDestroyScreen()` writes `\x1b[?1049l` + `\x1b[?25h` + `\x1b]112\x07` + `\x1b[0m` + `\x1b[H\x1b[J` after `screen.destroy()`.
- **File save:** Added `:w`, `:wq`, `:x`, `:q`, `:q!`, `Ctrl+S`. Save As prompt when no file path.
- **keypress race (setImmediate pattern):** ALL `screen.on('keypress')` listeners fire synchronously in registration order. If handler A sets `saveAsMode = true`, handler B (same tick) sees it. Fix: wrap `saveFile()` in `setImmediate()`.
- **Cursor invisible:** `screen.render()` hides cursor via `\x1b[?25l`, doesn't restore. Fix: write `\x1b[?25h` AFTER render.
- **Cursor invisible in light mode:** Apply theme's `editorCursor` hex via OSC 12: `\x1b]12;<color>\x07`. Reset with `\x1b]112\x07` on exit.

### Bug Fixes — v1.3.0

- **`deleteLines` crash on all-line delete:** After `this.lines = ['']`, must set `this.cursor.line = 0`. Otherwise cursor reads `undefined`.
- **`buffer.setText()` clears undo** — use `setTextUndoable()` in `applyResult`. `setText()` only for file load.
- **`_deleteLines` loop index bug:** Loop used `getLine(cur.line)` every iteration (same line). Fix: `getLine(cur.line + i)`.
- **Char-wise paste cursor:** New col = `before.length + text.length - 1`, not `insertCol + text.length - 1`.
- **Multi-line char-wise paste:** Register with `\n` must split and splice as multiple `buffer.lines` entries.
- **`onYank` clipboard:** `this.onYank = null` in constructor. Wire in app.js to `child_process.spawnSync(pbcopy/xclip/clip)`. Silent fail on headless.
- **ENOENT on file open:** Check `err.code === 'ENOENT'` — leave buffer empty, retain file path, show toast via `setImmediate`.

### Top Bar

- **`stripTags(s)` for padding math:** Blessed `{tag}` chars inflate `.length` but take 0 visible columns. Always measure with `s.replace(/\{[^}]*\}/g, '')`.
- **`col(hex, text)` helper:** `'{' + hex + '-fg}' + text + '{/}'`.
- **Design conventions:** Brand = bold accent; `│` sep = muted; key chord = textAccent; active state = uppercase + accent (`[WRAP]`), inactive = lowercase + muted (`[wrap]`).
- **Sync wrapMode:** `app.js` must call `panels.topBar.setWrapMode()` alongside `editor.setWrapMode()`.
- **Theme display names:** Raw key `standard-dark` looks wrong. Use `DISPLAY_NAMES` map with `getDisplayName()` in `theme-engine.js`.

## Publishing

- `prepublishOnly` in `package.json` copies root `scripts/` and `scripts/lib/` into `tui/scripts/` for npm bundling.
- `tui/scripts/` is gitignored — only created during publish.
- Script loader fallback: prefers `../../scripts/` (dev) then `../scripts/` (npm package).
- **Publish:** `cd tui && npm publish --access public` (requires `npm login` first).
- **Current version:** 1.3.0
