# Flxify Multi-Tab / Workspace Support — Implementation Plan

## Overview

Add multi-file/tab support to the Flxify web app. Users will be able to open multiple tabs, each with independent editor content, language detection, cursor position, and scroll position. Scripts execute against the active tab. All tab state persists across sessions via localStorage.

**Guiding principle:** This feature must preserve the existing single-editor experience. The single CodeMirror 6 instance (`window.cmEditor`) stays; tabs swap content in and out of it. This avoids re-instantiating CM6 (expensive, breaks CDN module loading) and keeps the BoopState API, script execution, and theme system completely untouched.

---

## Architecture Decision: Single CM6 Instance with State Swapping

**Why not multiple CM6 instances?**
- CM6 is loaded from esm.sh CDN; creating multiple EditorView instances would require re-importing modules or caching them — fragile on `file://` and offline.
- The entire app (BoopState, executeScript, palette, sidebar, theme system) assumes `window.cmEditor` is THE editor. Multi-instance would require rewriting all of these.
- VS Code and most editors use a single editor view with tab-state swapping. It is the proven, performant pattern.

**The approach:**
1. Maintain an array of `TabState` objects, each storing: id, label, content (string), cursor position (anchor/head), scroll position (top/left), detected language ID.
2. When switching tabs, snapshot the current tab's state from CM6, then load the new tab's state into CM6 via `cm.dispatch()`.
3. A thin tab bar UI sits between `#category-bar` and `#main-layout` (or between `#top-bar` and `#category-bar` — to be decided by the theme architect).

---

## Phase 1: Tab State Manager (runtime logic in build_app.js)

### Task 1.1: Create TabState data model

**File:** `build_app.js` (inside the app.js template string, after the BoopState section)

Add a `TabState` constructor and a `TabManager` module:

```
TabState:
  - id: string (UUID or incremental counter)
  - label: string (default "Untitled 1", "Untitled 2", ...)
  - content: string (editor text)
  - cursorAnchor: number (CM6 selection anchor)
  - cursorHead: number (CM6 selection head)
  - scrollTop: number
  - scrollLeft: number
  - languageId: string (detected language, e.g. 'json', 'none')

TabManager:
  - tabs: TabState[] (ordered array)
  - activeTabId: string
  - nextId: number (auto-increment counter)
  - addTab(label?): TabState — creates new tab, makes it active
  - removeTab(id): void — closes tab, switches to neighbor
  - switchTab(id): void — snapshots current, loads target
  - renameTab(id, newLabel): void
  - getActiveTab(): TabState
  - snapshotCurrentTab(): void — reads CM6 state into active TabState
  - loadTab(tab): void — writes TabState into CM6
  - reorderTab(fromIndex, toIndex): void — drag reorder (Phase 4)
```

**Acceptance criteria:**
- TabManager initializes with one tab containing the current `flxify-editor-content` localStorage value (migration from single-file).
- `snapshotCurrentTab()` captures content, cursor, scroll, and languageId from `window.cmEditor`.
- `loadTab()` dispatches content, cursor, and scroll into `window.cmEditor` and reconfigures the language compartment.
- All existing functionality (paste text, run script, theme switching) continues to work identically with a single default tab.

### Task 1.2: Integrate TabManager with existing editor lifecycle

**File:** `build_app.js` (app.js template)

- On `EditorView.updateListener` (content change), update `TabManager.getActiveTab().content` in addition to the existing `saveContent()` call.
- On script execution (`executeScript`), no changes needed — it reads from `window.cmEditor` which always reflects the active tab.
- The `loadSavedContent()` / `saveContent()` functions remain but are now wrappers that delegate to the TabManager's persistence layer (Task 2.1).

**Acceptance criteria:**
- Single-tab behavior is byte-for-byte identical to current behavior.
- Running a script modifies only the active tab's content.
- Switching tabs and switching back preserves content, cursor, and scroll exactly.

---

## Phase 2: localStorage Persistence

### Task 2.1: Persist tab state to localStorage

**File:** `build_app.js` (app.js template)

- New localStorage key: `flxify-tabs` — stores JSON: `{ tabs: [...TabState], activeTabId: string }`.
- Save is debounced (300ms, same as current content save).
- On load, if `flxify-tabs` exists, restore all tabs. If not, migrate from `flxify-editor-content` (create one tab with that content).
- Cap at a reasonable limit (e.g., 20 tabs) to avoid localStorage quota issues. Warn via toast if limit reached.

**Acceptance criteria:**
- Refresh the page: all tabs, their content, cursor positions, and the active tab are restored.
- Legacy users with only `flxify-editor-content` get seamless migration to one tab.
- localStorage usage stays within 5MB budget (typical browser limit). Large content across many tabs degrades gracefully (oldest tabs' content truncated with a warning, or user is warned before opening too many).

### Task 2.2: Clean up legacy persistence

**File:** `build_app.js` (app.js template)

- After successful migration to `flxify-tabs`, remove the old `flxify-editor-content` key.
- The `STORAGE_KEY` constant and `loadSavedContent`/`saveContent` functions are replaced by TabManager equivalents.

**Acceptance criteria:**
- After first load with new code, `flxify-editor-content` is removed from localStorage.
- `flxify-tabs` is the sole persistence mechanism for editor content.

---

## Phase 3: Tab Bar UI

### Task 3.0: Theme Architect designs the tab bar

**Agent:** `flxify-theme-architect`

Before any CSS/HTML implementation, the theme architect must produce:
- CSS variable specs for tab bar elements (background, text, border, active tab, hover, close button).
- Visual spec for all 6 themes (standard-light, standard-dark, cyber-neon, nordic-frost, monokai-pro, oled-stealth).
- Tab bar layout: height, padding, spacing, max-tab-width, overflow behavior (scrollable vs. dropdown).
- Close button (x) styling, add-tab (+) button styling.
- Active tab indicator style (underline, highlight, or raised).
- Mobile behavior (hidden? collapsed? scrollable mini-tabs?).

**User approval gate:** The user reviews and approves the visual spec before Phase 3 implementation begins.

### Task 3.1: Add tab bar HTML structure

**File:** `index.html`

Add a `#tab-bar` element. Proposed location: inside `#editor-wrapper`, above `#editor`, so it is part of the editor area (not the top chrome). This keeps layout changes minimal.

```html
<div id="editor-wrapper">
  <div id="tab-bar" role="tablist" aria-label="Open files">
    <!-- Tabs rendered dynamically by app.js -->
    <button id="tab-add" class="tab-add-btn" title="New tab" aria-label="New tab">+</button>
  </div>
  <button id="sidebar-open-tab" ...>...</button>
  <div id="editor"></div>
  <div id="editor-hint">...</div>
</div>
```

**Acceptance criteria:**
- Tab bar is visible above the editor, below the category bar.
- The "+" button is always visible at the end of the tab row.
- Tab bar is horizontally scrollable if tabs overflow.
- Each tab shows: label text, close button (x), active indicator.
- Tab bar height is 30-34px (compact, consistent with top-bar height of 38px).

### Task 3.2: Add tab bar CSS

**File:** `style.css`

- Use CSS variables from the theme architect's spec (Task 3.0).
- All selectors must use `html[data-theme="..."]` prefix where theme-specific.
- New CSS variables needed per theme: `--tab-bg`, `--tab-bg-active`, `--tab-text`, `--tab-text-active`, `--tab-border`, `--tab-close-hover`, `--tab-add-hover`.
- Tab bar scrollbar hidden (like category bar: `scrollbar-width: none`).
- Mobile: tab bar remains visible but with smaller tabs; minimum tab width ensures usability.

**Acceptance criteria:**
- Tab bar looks correct in all 6 themes.
- Active tab is visually distinct.
- Close button appears on hover (desktop) or always (mobile).
- No layout shift — editor area smoothly accommodates the tab bar.
- Responsive: works on desktop and mobile viewports.

### Task 3.3: Add tab bar rendering logic

**File:** `build_app.js` (app.js template)

Add a `renderTabBar()` function:
- Clears and re-renders `#tab-bar` contents.
- Each tab is a `<button role="tab">` with `aria-selected` for the active tab.
- Click on tab calls `TabManager.switchTab(id)`.
- Click on close button calls `TabManager.removeTab(id)`.
- Click on "+" calls `TabManager.addTab()`.
- Double-click on tab label enables inline rename (contenteditable span or input overlay).
- `renderTabBar()` is called after any tab operation (add, remove, switch, rename).

**Acceptance criteria:**
- Clicking a tab switches the editor content.
- Clicking the close button removes the tab (with confirmation if it has content and there is only one tab left — or just prevent closing the last tab).
- The last tab cannot be closed (always at least 1 tab open).
- Double-clicking a tab label allows renaming; pressing Enter or blur confirms; pressing Escape cancels.
- Tab order matches `TabManager.tabs` array order.

---

## Phase 4: Keyboard Shortcuts

### Task 4.1: Add tab keyboard shortcuts

**File:** `build_app.js` (app.js template, in the keydown event listener section)

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+T | New tab |
| Cmd/Ctrl+W | Close active tab (prevent closing last tab) |
| Cmd/Ctrl+1 through Cmd/Ctrl+9 | Switch to tab N (9 = last tab) |
| Cmd/Ctrl+Shift+[ | Previous tab |
| Cmd/Ctrl+Shift+] | Next tab |

**Important:** These shortcuts must not conflict with browser defaults. `Cmd+W` closes the browser tab — we should use `Cmd+Alt+W` or just not intercept `Cmd+W` at all, since browsers block `preventDefault()` on it. Alternative: use only `Cmd+Shift+[` / `Cmd+Shift+]` for navigation and rely on the UI for add/close.

**Revised shortcut plan (avoiding browser conflicts):**

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+Shift+T | New tab (Cmd+T opens browser new tab) |
| Cmd/Ctrl+Shift+W | Close active tab (Cmd+W closes browser tab) |
| Ctrl+Tab / Ctrl+Shift+Tab | Next/previous tab (may conflict in some browsers; test) |
| Cmd/Ctrl+1-9 | Switch to tab 1-9 (this may conflict with browser tab switching; use Alt+1-9 as fallback) |

Final shortcut mapping to be decided during implementation based on cross-browser testing. Document chosen shortcuts in the status bar hint and onboarding.

**Acceptance criteria:**
- At least new-tab, close-tab, next-tab, and previous-tab shortcuts work without conflicting with browser shortcuts.
- Status bar hint updates to show tab shortcuts (or a separate hint area).
- Shortcuts work on both Mac and Windows/Linux.

---

## Phase 5: Polish and Edge Cases

### Task 5.1: Update editor hint

**File:** `build_app.js` (app.js template) + `index.html`

- When the active tab is empty, show the existing hint ("Press Cmd+B to open the command palette").
- Consider showing tab-specific hints for new users.

### Task 5.2: Update onboarding tour

**File:** `build_app.js` (app.js template)

- Add a new tour step (or update existing) that mentions tabs.
- Bump the onboarding key to `flxify-tour-v2` so existing users see the updated tour.

### Task 5.3: Handle tool pages (SEO pages)

**File:** `build_app.js` (SEO generation section)

Tool pages (`/tools/[slug]/`) use a single-purpose editor with `window.flxifyAutoScript`. Multi-tab does NOT apply to tool pages:
- Tool pages should NOT render the tab bar.
- Tool pages continue to use single-editor mode.
- The tab bar element exists in index.html but NOT in tool page templates.

**Acceptance criteria:**
- Tool pages render identically to current behavior — no tab bar, no tab persistence.
- Homepage and main app have full tab support.

### Task 5.4: Context menu (right-click on tab)

**File:** `build_app.js` (app.js template)

Optional enhancement (can be deferred): right-click on a tab shows a context menu with:
- Rename
- Close
- Close Others
- Close All (resets to one empty tab)

This is a nice-to-have and can be implemented in a follow-up.

### Task 5.5: Tab drag-to-reorder

**File:** `build_app.js` (app.js template)

Optional enhancement (can be deferred): drag tabs to reorder them. Uses HTML5 drag-and-drop API (no external library). Updates `TabManager.tabs` array order and re-renders.

---

## Phase 6: Build and Test Verification

### Task 6.1: Rebuild and validate

1. Run `node build_app.js` — must succeed without errors.
2. Run `node --check app.js` — must pass syntax check.
3. Run `npm test` — all existing tests must pass (827+ tests).
4. Manual smoke test:
   - Open index.html in browser.
   - Verify single tab works like the old single-editor.
   - Add tabs, type content, switch between them.
   - Close tabs, verify content is gone.
   - Refresh page, verify all tabs are restored.
   - Run a script on one tab, verify other tabs are unaffected.
   - Test all 6 themes — tab bar renders correctly in each.
   - Test on mobile viewport — tab bar is usable.
   - Test tool pages — no tab bar, normal behavior.

### Task 6.2: Update CLAUDE.md

Document the multi-tab architecture:
- New localStorage key (`flxify-tabs`).
- TabManager API.
- Single CM6 instance with state swapping pattern.
- New CSS variables for tab bar theming.
- New keyboard shortcuts.
- Gotchas discovered during implementation.

---

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `build_app.js` | Modify | Add TabState, TabManager, renderTabBar(), keyboard shortcuts, updated persistence logic in the app.js template string |
| `index.html` | Modify | Add `#tab-bar` container with `#tab-add` button inside `#editor-wrapper` |
| `style.css` | Modify | Add tab bar styles, new CSS variables for all 6 themes |
| `CLAUDE.md` | Modify | Document multi-tab architecture and new gotchas |

**Files NOT changed:**
- `scripts/*.js` — no script changes needed (BoopState API unchanged)
- `scripts/lib/*.js` — no lib changes
- `seo-data.json` — no SEO changes
- `tools/` — generated, will be regenerated by build
- `app.js` — generated, will be regenerated by build
- `sitemap.xml`, `robots.txt` — generated, unchanged
- `vscode-extension/` — not affected
- `tui/` — not affected

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| localStorage quota exceeded with many tabs | Cap at 20 tabs; warn user; consider IndexedDB for large content (future) |
| CM6 state swap causes flicker | Batch all dispatch changes in a single transaction; test perceived performance |
| Cursor/scroll restoration is imprecise | CM6's `EditorView.scrollSnapshot()` + `scrollTo` effect handle this; test thoroughly |
| Browser shortcut conflicts | Avoid Cmd+T, Cmd+W; use Shift variants; test cross-browser |
| Tool pages accidentally get tab bar | Tab bar DOM is in index.html only; tool pages use a different template in build_app.js |
| Content loss on tab close | Prevent closing last tab; consider "undo close" (Cmd+Shift+T) as future enhancement |
| Mobile UX with many tabs | Scrollable tab bar; minimum tab width; test on narrow viewports |

---

## Implementation Order

1. **Phase 1** (foundation) — TabState + TabManager + integration with existing editor lifecycle
2. **Phase 2** (persistence) — localStorage save/restore + migration
3. **Phase 3** (UI) — Theme architect spec -> user approval -> HTML/CSS/JS tab bar
4. **Phase 4** (shortcuts) — Keyboard shortcuts
5. **Phase 5** (polish) — Onboarding, tool pages, edge cases
6. **Phase 6** (validation) — Full build + test pass + documentation

Each phase is independently testable. Phase 1+2 can be validated without any UI (just localStorage inspection). Phase 3 is the visual milestone. Phases 4-5 are incremental polish.
