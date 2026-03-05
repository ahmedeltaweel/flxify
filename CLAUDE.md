# Flxify - Project Knowledge

## What is Flxify?

Flxify (flxify.dev) is a web-based developer text utility tool. It provides a syntax-highlighted code editor with 80 executable scripts accessible via a command palette (Cmd/Ctrl+B). Users paste text, run a script, and get transformed output. Think "Swiss Army knife for text transformations" — JSON formatting, Base64 encoding, hashing, case conversion, sorting, and more.

## Key Architecture Decisions

### Single-page app, no framework, build step for bundling
The app is pure HTML/CSS/JS. CodeMirror 6 is the only external dependency, loaded from esm.sh CDN. A Node.js build script (`build_app.js`) bundles all scripts and lib modules into a single self-contained `app.js`. This ensures the app works offline, from `file://` URLs, and with no web server required (except for CodeMirror CDN on first load).

### All scripts and modules are inlined in app.js
- **80 scripts total** are embedded inline in `app.js` inside the `SCRIPT_SOURCES[]` array as template literal strings. This includes 72 original scripts + 8 Flxify-added scripts.
- **7 lib modules** are inlined via `registerModule()` calls at the top of `app.js`.
- The source-of-truth for the 8 Flxify scripts lives in `web-scripts/*.js` and for lib modules in `web-scripts/lib/`. After editing these files, run `node build_app.js` to regenerate `app.js`.

### Module system mimics CommonJS
Scripts can `require('@flxify/moduleName')` to import bundled libraries. The shim wraps each module in a CommonJS sandbox (`module.exports`). The 7 lib modules are third-party JS files whose source lives in `web-scripts/lib/` but are inlined into `app.js` at build time.

### BoopState is the script API
Every script's `main(state)` function receives a `BoopState` instance. The key insight is the smart `state.text` property: it reads/writes `state.selection` if text is selected, otherwise `state.fullText`. This lets most scripts be one-liners (`state.text = transform(state.text)`) that automatically handle both selection and full-document modes.

### Script execution uses `new Function()`
Scripts are executed via `new Function('require', 'state', scriptSource + '\nif (typeof main === "function") main(state);')`. This provides scoped execution with `require` injected. Results are read back from the BoopState instance and applied to the CodeMirror editor via `dispatch()`.

## How to Add a New Script

1. Create a `.js` file in `web-scripts/` following this format:
```javascript
/**
  {
    "api": 1,
    "name": "My Script",
    "description": "What it does",
    "author": "Flxify",
    "icon": "icon-name",
    "tags": "search,terms"
  }
**/

function main(state) {
  state.text = state.text.toUpperCase(); // your transform here
}
```

2. Add the filename to the `webScriptFiles` array in `build_app.js`
3. Run `node build_app.js` to regenerate `app.js`
4. The script will be available in the command palette on next page load

## How to Add a New Library Module

1. Place the CommonJS-compatible `.js` file in `web-scripts/lib/`
2. Add the module entry (`{ file: 'name.js', name: 'name' }`) to the `libFiles` array in `build_app.js`
3. Run `node build_app.js` to regenerate `app.js`
4. Scripts can then use `require('@flxify/moduleName')`

## Critical Files — Do Not Break

| File | Why it matters |
|------|----------------|
| `app.js` (generated) | Self-contained bundle — module system, all 80 scripts, BoopState, executor. **Do not edit directly; edit sources and run `node build_app.js`** |
| `build_app.js` | Generates app.js. If broken, can't rebuild. Contains the app's runtime code (BoopState, executor, palette, etc.) as a template |
| `index.html` module script | CodeMirror 6 setup. Exposes `window.cmEditor` which app.js depends on |
| `web-scripts/*.js` | Source of truth for the 8 Flxify scripts |
| `web-scripts/lib/` | Source of truth for the 7 library modules. All scripts using `require()` depend on these |

## Common Patterns

### Script that transforms text
```javascript
function main(state) {
  state.text = state.text.split('').reverse().join('');
}
```

### Script that uses a library
```javascript
const { camelCase } = require('@flxify/lodash.boop')
function main(state) {
  state.text = camelCase(state.text)
}
```

### Script that reports info without modifying text
```javascript
function main(state) {
  state.postInfo(state.text.length + ' characters');
}
```

### Script that handles errors
```javascript
function main(state) {
  try {
    state.text = JSON.stringify(JSON.parse(state.text), null, 2);
  } catch(e) {
    state.postError("Invalid JSON");
  }
}
```

## Gotchas and Lessons Learned

1. **NEVER use `fetch()` for loading scripts/modules at runtime.** Browsers block `fetch()` on `file://` URLs due to CORS policy. The app was originally designed to fetch web-scripts and lib modules at runtime, but this completely broke when opening `index.html` directly from the filesystem. The fix was to inline everything into `app.js` at build time via `build_app.js`. Always bundle — never rely on runtime `fetch()` for core functionality.

2. **`app.js` is a generated file — do not edit directly.** The build script `build_app.js` generates `app.js` by reading sources from `web-scripts/` and `web-scripts/lib/`, then embedding them as template literals. Edit the source files, then run `node build_app.js`. If you edit `app.js` directly, changes will be lost on next build. The build script also contains the app's runtime code (BoopState, executor, palette, etc.) as a template string.

3. **Lib modules must be registered before scripts are parsed.** In the generated `app.js`, `registerModule()` calls come before `SCRIPT_SOURCES[]`. The `parseScripts()` function is synchronous. Changing this order will break scripts that use `require()`.

4. **Embedded scripts use escaped characters.** Scripts inside `SCRIPT_SOURCES[]` template literals have `\\n`, `\\t`, `\\/` etc. External scripts in `web-scripts/` use normal unescaped characters. The `build_app.js` escaper handles this conversion (`escapeForTemplateLiteral()`). Never copy-paste between them without adjusting escaping.

5. **`lodash.boop` module name has a dot.** The filename is `lodash.boop.js` and scripts reference it as `require('@flxify/lodash.boop')`. The require shim strips `@flxify/` and `.js` to get the key name `lodash.boop`.

6. **Trailing commas in script metadata.** Some scripts have trailing commas in their JSON metadata blocks. The parser handles this with a lenient regex: `.replace(/,\s*([\]}])/g, '$1')`.

7. **CodeMirror is exposed globally.** The CM6 editor is set up in a `<script type="module">` block in index.html and exposed as `window.cmEditor`. The app.js file (loaded as a regular `defer` script) accesses it through this global. Module scripts with CDN imports may load after `defer` scripts — CodeMirror fires a `cm-ready` event to signal readiness.

8. **`<script type="module">` vs `<script defer>` timing.** Module scripts are deferred by spec but their execution is delayed by network imports (esm.sh CDN). A `defer` script may execute before the module finishes loading. The app handles this by having CodeMirror set `window.cmReady = true` and dispatch a `cm-ready` event. However, `app.js` currently doesn't wait for this event — it works because `parseScripts()` is synchronous and the palette is only opened by user interaction (which happens after both scripts have loaded).

9. **Fuzzy search weights.** The command palette search scores: name (0.9), tags (0.6), description (0.2). This means good `tags` metadata is important for discoverability.

10. **The `Scripts/` folder is not auto-loaded.** There are 27 community scripts in the `Scripts/` directory, but they are not referenced by the app. They could be integrated by adding them to `webScriptFiles` in `build_app.js`.

11. **CodeMirror needs internet on first load.** CM6 is loaded from esm.sh CDN. The app works offline after the browser caches the modules, but the first load requires internet. If full offline support is needed, the CM6 modules would need to be vendored locally.

## Development Workflow

- **To modify app runtime code:** Edit the template string inside `build_app.js`, then run `node build_app.js`
- **To modify the editor/UI:** Edit `index.html` or `style.css` directly
- **To add/edit scripts:** Edit files in `web-scripts/`, add filename to `webScriptFiles` in `build_app.js`, then run `node build_app.js`
- **To add/edit lib modules:** Edit files in `web-scripts/lib/`, add entry to `libFiles` in `build_app.js`, then run `node build_app.js`
- **To test:** Open `index.html` directly in a browser (works with `file://`)
- **To validate JS syntax:** `node --check app.js`
- **To rebuild app.js:** `node build_app.js` (reads all sources, generates self-contained bundle)

## Agent Workflow

This project uses three custom Claude Code agents:
- **project-orchestrator** — Plans work, delegates to dev and QA agents, tracks progress
- **plan-developer** — Implements features according to plan.md specifications
- **qa-plan-validator** — Validates deliverables against plan.md requirements

Workflow: orchestrator reads plan.md -> delegates to plan-developer -> validates with qa-plan-validator -> reports status.
