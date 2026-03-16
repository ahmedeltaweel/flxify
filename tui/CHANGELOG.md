# Changelog — @flxify/cli

## [1.3.0] — 2026-03-17

### New Features
- **Word wrap** — `:set wrap` / `:set nowrap` Vim commands toggle soft word wrap for long lines. Cursor positioning adapts correctly to visual rows.
- **System clipboard on yank** — `yy`, visual `y`, and word yanks (`yw`/`ye`) now copy to the system clipboard automatically (macOS `pbcopy`, Linux `xclip`/`xsel`, Windows `clip`). Eliminates the need to use terminal mouse selection (which captured line-number gutter text).
- **Redesigned top bar** — Themed with accent/muted colors, `│` separators between hints, bold `FLXIFY` brand, key chords highlighted in a brighter color, dimmer action labels, and a live `[WRAP]` / `[wrap]` indicator.

### Bug Fixes
- **Open non-existent file no longer shows error in buffer** — Passing a path that does not exist now starts with an empty buffer and shows a `"New file: …"` toast. The path is retained so `:w` saves there.
- **Visual Line highlight on empty lines** — Empty lines inside a Visual Line selection now show a visible inverse highlight cell instead of a rendering gap.
- **CRASH: Visual Line `d`/`c`/`x` on entire buffer** — Deleting all lines while the cursor was on a non-zero line caused an undefined-access crash. Fixed by clamping `cursor.line = 0` after resetting `lines = ['']` in both `deleteLines` and `deleteLinesRaw`.
- **Undo lost after running a script** — `applyResult` called `editor.setText()` which cleared the undo stack. Now uses `editor.setTextUndoable()` which pushes an undo snapshot first, so `u` correctly restores pre-script content.
- **`Ndd` stored wrong lines in register** — `2dd` on `a\nb\nc` would store `"a\na"` (same line twice) instead of `"a\nb"`. Fixed loop index.
- **Char-wise paste cursor off by one** — After `p`, the cursor landed one position before the last pasted character. Fixed column calculation in `_pasteAfter` and `_pasteBefore`.
- **Multi-line char-wise paste corrupted buffer** — Pasting a register containing `\n` concatenated the newline into a single buffer line. Now splits on `\n` and splices lines correctly.
- **To Unicode Escaped String — wrong hex padding** — Characters with codes < 16 (e.g., tab = 9) produced `\u9` instead of `\u0009`. Fixed to always pad to 4 hex digits.
- **Reverse String — newline inserted at start of file** — Reversing a buffer that ended with `\n` moved the newline to position 0, inserting a blank line at the top. Fixed by stripping trailing newlines before reversing, then re-appending them.
- **Generate Hashtag — wrong description** — Description said "camelCase" but the output is PascalCase (`#HelloWorld`). Description updated to match actual behaviour.
- **Help text `--help`** — Updated to show `Ctrl+B / Ctrl+P` for the command palette.

### Internal
- 17 new tests added (654 total): `deleteLines` crash regression, `setTextUndoable` undo preservation, visual-line full-buffer delete, `onYank` callback, `Ndd` register content, char-wise paste cursor position, multi-line paste.

## [1.2.0] — 2026-03-13

### New Scripts
- **Character Frequency** — Appends a frequency analysis report below the editor content showing each character and its count.

### Internal
- 637 tests (7 test files)

## [1.1.0] — 2026-03-12

### New Features
- **File save** — `:w`, `:wq`, `:x`, `:q`, `:q!` Vim command mode. `Ctrl+S` shortcut. Save As prompt when no file path is set.
- **Quit confirmation** — Three-way prompt `[y]es / [n]o / [c]ancel` when quitting with unsaved changes.
- **`Ctrl+P`** — Secondary palette shortcut (VS Code convention), alongside existing `Ctrl+B`.

### Bug Fixes
- Garbled terminal on exit — explicit alternate-screen exit and cursor restore in `safeDestroyScreen()`.
- Cursor invisible — `\x1b[?25h` written after each `screen.render()`.
- Cursor invisible in light themes — OSC 12 escape sets cursor color from active theme.
- neo-blessed keypress race in save-as handler — deferred via `setImmediate()`.

## [1.0.0] — 2026-03-12

Initial release. Terminal text editor with Vim keybindings, command palette (112 scripts), 6 themes, incremental search, line-number gutter, and status bar.
