# @flxify/cli

A terminal-based text utility with **115 transformation scripts**, **Vim keybindings**, and a **command palette** — the same power as [flxify.dev](https://flxify.dev), right in your terminal.

[![npm version](https://img.shields.io/npm/v/@flxify/cli)](https://www.npmjs.com/package/@flxify/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)

## Install

```bash
npm install -g @flxify/cli
```

## Usage

```bash
flxify                         # Launch with empty editor
flxify file.txt                # Open a file
flxify --theme cyber-neon      # Launch with a specific theme
```

## Features

- **115 scripts** — JSON formatting, Base64, hashing, case conversion, sorting, JWT decode, cron explainer, regex explainer, and more
- **Command palette** (Ctrl+B) with fuzzy search across all scripts
- **CLI subcommands** — `flxify cron "*/5 * * * *"` and `flxify regex "^[a-z]+"` for quick non-interactive explanations
- **Vim keybindings** — Normal, Insert, Visual, and Visual-Line modes
- **6 themes** — Standard Dark/Light, Cyber Neon, Nordic Frost, Monokai Pro, OLED Stealth
- **Word wrap** — `:set wrap` / `:set nowrap` to toggle soft wrap for long lines
- **System clipboard** — yanking (`yy`, visual `y`) copies to clipboard automatically
- **File editing** — open, edit, and save files with Ctrl+S
- **Unsaved changes protection** — prompts before quitting with unsaved edits
- **Search** — `/` in Normal mode for incremental search with `n`/`N` navigation

## Key Bindings

| Key | Action |
|-----|--------|
| `Ctrl+B` or `Ctrl+P` | Open command palette |
| `Ctrl+S` | Save file (prompts for filename if none open) |
| `Ctrl+T` | Cycle theme |
| `Ctrl+Q` or `Ctrl+C` | Quit |
| `i`, `a`, `o`, `O` | Enter Insert mode |
| `Escape` | Return to Normal mode |
| `v` | Visual mode |
| `V` | Visual Line mode |
| `dd`, `yy`, `p` | Delete/yank/paste lines |
| `/` | Search |
| `n` / `N` | Next/previous search result |
| `u` / `Ctrl+R` | Undo/redo |

### Vim Command Mode

Press `:` in Normal mode to open the command bar:

| Command | Action |
|---------|--------|
| `:w` | Save file |
| `:wq` | Save and quit |
| `:x` | Save and quit (alias for `:wq`) |
| `:q` | Quit (warns if unsaved changes) |
| `:q!` | Force quit without saving |
| `:set wrap` | Enable word wrap for long lines |
| `:set nowrap` | Disable word wrap (default) |

## Themes

Switch themes with `Ctrl+T` or launch with `--theme <name>`:

- `standard-dark` (default)
- `standard-light`
- `cyber-neon`
- `nordic-frost`
- `monokai-pro`
- `oled-stealth`

Theme preference is saved to `~/.config/flxify/config.json`.

## CLI Options

```
Usage:
  flxify [options] [file]
  flxify cron [expr]
  flxify regex [pattern]

Options:
  -h, --help            Show help
  -v, --version         Print version
  -t, --theme <name>    Set theme on startup

Subcommands:
  cron [expr]           Explain a cron expression (or open interactive mode)
  regex [pattern]       Explain a regex pattern (or open interactive mode)

Arguments:
  [file]                File path to open
```

### Subcommand Examples

```bash
flxify cron "*/5 * * * *"    # Every 5 minutes + next 5 run times
flxify cron "@daily"          # Daily schedule + next 5 run times
flxify cron 0 9 "* * 1-5"    # Multi-word expressions work too
flxify regex "^[a-z]+\d{2,4}$"  # Token-by-token regex breakdown
flxify regex "/test/gi"           # Extracts flags automatically
```

## How Scripts Work

Open the command palette (Ctrl+B), search for a script, and press Enter. The script transforms your editor content (or just the visual selection if one is active).

Scripts use the same API as the web app and VS Code extension:

```javascript
function main(state) {
  state.text = state.text.toUpperCase();
}
```

## Requirements

- Node.js >= 18.0.0
- A terminal with truecolor support (most modern terminals)

## Related

- **Web app**: [flxify.dev](https://flxify.dev)
- **VS Code extension**: [Marketplace](https://marketplace.visualstudio.com/items?itemName=flxify.flxify)
- **GitHub**: [ahmedeltaweel/flxify](https://github.com/ahmedeltaweel/flxify)

## License

[MIT](../LICENSE)
