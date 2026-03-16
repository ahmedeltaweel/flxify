'use strict';

/**
 * Flxify TUI — Main application bootstrap.
 *
 * Creates the blessed screen, sets up the three-panel layout with the editor
 * and line-number gutter, loads all 111 scripts, wires the command palette,
 * and binds global keys (Ctrl+B/P for palette, Ctrl+T for theme cycle,
 * Ctrl+Q/C to quit, Ctrl+S to save).
 *
 * Theme priority (highest to lowest):
 *   1. --theme CLI argument
 *   2. Saved config (~/.config/flxify/config.json)
 *   3. Default: 'standard-dark'
 *
 * @param {object} options             - Parsed CLI options from bin/flxify.js
 * @param {string|null} options.theme  - Theme name (or null for default)
 * @param {string|null} options.file   - File path to open (or null)
 */
function launch(options) {
  var blessed = require('neo-blessed');
  var fs = require('fs');
  var path = require('path');
  var layout = require('./ui/layout.js');
  var toast = require('./ui/toast.js');
  var scriptLoader = require('./scripts/script-loader.js');
  var requireShim = require('./scripts/require-shim.js');
  var paletteModule = require('./palette/palette.js');
  var themeEngine = require('./themes/theme-engine.js');
  var config = require('./config/config.js');

  var file = options.file || null;

  // ---------------------------------------------------------------------------
  // Resolve the initial theme.
  //
  // Priority: --theme CLI arg > saved config > 'standard-dark'
  // ---------------------------------------------------------------------------
  var initialThemeName;
  if (options.theme && themeEngine.getThemeKeys().indexOf(options.theme) !== -1) {
    initialThemeName = options.theme;
  } else if (options.theme) {
    // Unknown theme name provided via CLI — warn and fall back to config/default
    process.stderr.write(
      'Warning: Unknown theme "' + options.theme + '". ' +
      'Valid themes: ' + themeEngine.getThemeKeys().join(', ') + '\n'
    );
    initialThemeName = config.getTheme();
  } else {
    initialThemeName = config.getTheme();
  }

  // Apply initial theme to the engine so all subsequent calls use the right theme
  themeEngine.setTheme(initialThemeName);

  // ---------------------------------------------------------------------------
  // Locate the scripts directory.
  //
  // Development mode: tui/src/app.js -> ../../scripts/ (project root scripts/)
  // npm package:      scripts/ is bundled at the same level as src/ (tui/scripts/)
  // ---------------------------------------------------------------------------
  var scriptsDir = (function () {
    // Prefer the project-root scripts/ directory (development + monorepo)
    var devPath = path.resolve(__dirname, '..', '..', 'scripts');
    if (fs.existsSync(devPath)) return devPath;

    // Fallback: scripts/ bundled inside the tui/ package itself
    var pkgPath = path.resolve(__dirname, '..', 'scripts');
    if (fs.existsSync(pkgPath)) return pkgPath;

    // Last resort: same directory as src/ (for unusual install layouts)
    return path.resolve(__dirname, 'scripts');
  }());

  var libDir = path.join(scriptsDir, 'lib');

  // ---------------------------------------------------------------------------
  // Load scripts + create require shim
  // ---------------------------------------------------------------------------
  var scripts = scriptLoader.loadScripts(scriptsDir);
  var flxifyRequire = requireShim.createRequire(libDir);

  // --- Create the blessed screen ---
  // Suppress neo-blessed terminfo warnings (Setulc parser bug on xterm-256color).
  // The warning is non-fatal — underline color is not used by Flxify.
  var _origStderrWrite = process.stderr.write;
  process.stderr.write = function (chunk) {
    if (typeof chunk === 'string' && chunk.indexOf('Setulc') !== -1) return true;
    return _origStderrWrite.apply(process.stderr, arguments);
  };

  var screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: 'Flxify'
  });

  // Restore stderr after screen init (terminfo is parsed during construction)
  process.stderr.write = _origStderrWrite;

  // ---------------------------------------------------------------------------
  // Crash recovery — restore terminal even if the app throws.
  // ---------------------------------------------------------------------------

  // Wrapper that suppresses the Setulc terminfo error during screen.destroy(),
  // which fires the same neo-blessed warning as during construction.
  function safeDestroyScreen() {
    var _origWrite = process.stderr.write;
    process.stderr.write = function (chunk) {
      if (typeof chunk === 'string' && chunk.indexOf('Setulc') !== -1) return true;
      return _origWrite.apply(process.stderr, arguments);
    };
    try {
      screen.destroy();
    } catch (_e) {}
    // Explicitly restore terminal state after blessed teardown.
    // blessed's screen.destroy() may not fully clean up, especially when
    // raw ANSI escapes were written directly to stdout (cursor positioning).
    try {
      process.stdout.write('\x1b[?1049l');  // Exit alternate screen buffer (rmcup)
      process.stdout.write('\x1b[?25h');    // Show cursor (cnorm)
      process.stdout.write('\x1b]112\x07'); // Reset cursor color to terminal default (OSC 112)
      process.stdout.write('\x1b[0m');      // Reset all terminal attributes (sgr0)
      process.stdout.write('\x1b[H');       // Move cursor to home position
      process.stdout.write('\x1b[J');       // Clear screen from cursor down
    } catch (_e2) {}
    process.stderr.write = _origWrite;
  }

  process.on('uncaughtException', function (err) {
    safeDestroyScreen();
    process.stderr.write('Flxify crashed: ' + (err && err.message ? err.message : String(err)) + '\n');
    process.exit(1);
  });

  process.on('unhandledRejection', function (err) {
    safeDestroyScreen();
    process.stderr.write('Flxify crashed: ' + String(err) + '\n');
    process.exit(1);
  });

  // --- Build the layout (top bar + gutter + editor + status bar) ---
  var panels = layout.createLayout(screen, {
    theme: initialThemeName,
    themeObj: themeEngine.getCurrentTheme()
  });

  // Convenience aliases
  var editor = panels.editor;
  var statusBar = panels.statusBar;

  // ---------------------------------------------------------------------------
  // Modified indicator — track whether the buffer has unsaved changes.
  // ---------------------------------------------------------------------------
  var modified = false;

  /**
   * Mark the buffer as modified and update the status bar indicator.
   */
  function markModified() {
    if (!modified) {
      modified = true;
      statusBar.setModified(true);
    }
  }

  /**
   * Clear the modified flag (e.g., after a successful save).
   */
  function clearModified() {
    modified = false;
    statusBar.setModified(false);
  }

  // Wire the editor's onModified callback
  editor.onModified = markModified;

  // --- Load file if provided ---
  if (file) {
    try {
      var fileContent = fs.readFileSync(path.resolve(file), 'utf8');
      editor.setText(fileContent);
      // Loading a file is not a modification — buffer starts clean
      clearModified();
    } catch (err) {
      if (err.code === 'ENOENT') {
        // File does not exist yet — start with empty buffer, keep file path
        // so that :w / Ctrl+S saves to the given path.
        setImmediate(function () {
          toast.showInfo(screen, 'New file: ' + path.basename(file), themeEngine.getCurrentTheme());
        });
        clearModified();
      } else {
        editor.setText('Error: Could not open file: ' + file + '\n\n' + err.message);
        clearModified();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // File save — Ctrl+S / :w
  // ---------------------------------------------------------------------------

  /**
   * Save the editor content to disk.
   * If no file path is set, triggers the "Save as" prompt instead.
   * Shows a success or error toast on direct save.
   */
  function saveFile() {
    if (!file) {
      startSaveAs();
      return;
    }
    var savePath = path.resolve(file);
    try {
      var saveDir = path.dirname(savePath);
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }
      fs.writeFileSync(savePath, editor.getText(), 'utf8');
      clearModified();
      toast.showInfo(screen, 'Saved: ' + path.basename(savePath), themeEngine.getCurrentTheme());
    } catch (err) {
      toast.showError(screen, 'Error saving: ' + err.message, themeEngine.getCurrentTheme());
    }
  }

  // ---------------------------------------------------------------------------
  // "Save as" prompt — shown when saving without a file path.
  //
  // Reuses the same blessed box pattern as the command bar (:) and search bar (/).
  // The user types a file path and presses Enter to confirm, Escape to cancel.
  // After a successful save, the entered path becomes the active file path for
  // subsequent saves.
  // ---------------------------------------------------------------------------

  var saveAsMode = false;
  var saveAsBuffer = '';
  var saveAsBox = null;
  /** When true, quit the app after a successful "Save as" (for :wq with no file). */
  var saveAndQuitAfterSaveAs = false;

  function showSaveAsBar(text) {
    var t = themeEngine.getCurrentTheme();
    if (!saveAsBox) {
      saveAsBox = blessed.box({
        parent: screen,
        bottom: 1,
        left: 0,
        width: '100%',
        height: 1,
        tags: true,
        style: {
          fg: t ? t.textPrimary    : 'white',
          bg: t ? t.paletteInputBg : 'black'
        }
      });
    }
    saveAsBox.setContent('Save as: ' + (text || ''));
    screen.render();
  }

  function hideSaveAsBar() {
    if (saveAsBox) {
      saveAsBox.detach();
      saveAsBox = null;
    }
    saveAsMode = false;
    saveAsBuffer = '';
    saveAndQuitAfterSaveAs = false;
    editor.resume();
    screen.render();
  }

  function startSaveAs() {
    saveAsMode = true;
    saveAsBuffer = '';
    editor.pause();
    showSaveAsBar('');
  }

  function confirmSaveAs() {
    var savePath = saveAsBuffer.trim();
    if (!savePath) {
      hideSaveAsBar();
      return;
    }
    savePath = path.resolve(savePath);
    try {
      var saveDir = path.dirname(savePath);
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }
      fs.writeFileSync(savePath, editor.getText(), 'utf8');
      file = savePath;
      clearModified();
      var shouldQuit = saveAndQuitAfterSaveAs;
      hideSaveAsBar();
      toast.showInfo(screen, 'Saved: ' + path.basename(savePath), themeEngine.getCurrentTheme());
      if (shouldQuit) {
        saveBufferOnExit();
        safeDestroyScreen();
        process.exit(0);
      }
    } catch (err) {
      hideSaveAsBar();
      toast.showError(screen, 'Error saving: ' + err.message, themeEngine.getCurrentTheme());
    }
  }

  // ---------------------------------------------------------------------------
  // Quit confirmation — when buffer is modified, prompt before exit.
  // ---------------------------------------------------------------------------

  /** True while we are waiting for a y/n quit confirmation keypress. */
  var awaitingQuitConfirm = false;

  /**
   * Create a one-line confirmation bar at the bottom (above the status bar).
   * Returns a dismiss function.
   */
  var confirmBox = null;

  function showQuitConfirm() {
    if (confirmBox) return; // already showing

    var t = themeEngine.getCurrentTheme();
    confirmBox = blessed.box({
      parent: screen,
      bottom: 1,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      content: '{bold}Save changes before closing? [y]es / [n]o / [c]ancel{/bold}',
      style: {
        fg: t ? t.textPrimary : 'white',
        bg: t ? t.colorError  : 'red'
      }
    });
    awaitingQuitConfirm = true;
    editor.pause();
    screen.render();
  }

  function hideQuitConfirm() {
    if (confirmBox) {
      confirmBox.detach();
      confirmBox = null;
    }
    awaitingQuitConfirm = false;
    editor.resume();
    screen.render();
  }

  /**
   * Handle a quit attempt.  If the buffer is clean, exit immediately.
   * Otherwise show the confirmation prompt.
   */
  function attemptQuit() {
    if (!modified) {
      saveBufferOnExit();
      safeDestroyScreen();
      process.exit(0);
    }
    // Buffer is dirty — ask the user
    showQuitConfirm();
  }

  // ---------------------------------------------------------------------------
  // Search bar widget — shown at the bottom when / is pressed in Normal mode.
  // ---------------------------------------------------------------------------
  var searchBox = null;

  function showSearchBar(query) {
    var t = themeEngine.getCurrentTheme();
    if (!searchBox) {
      searchBox = blessed.box({
        parent: screen,
        bottom: 1,
        left: 0,
        width: '100%',
        height: 1,
        tags: true,
        style: {
          fg: t ? t.textPrimary    : 'white',
          bg: t ? t.paletteInputBg : 'black'
        }
      });
    }
    searchBox.setContent('/' + (query || ''));
    screen.render();
  }

  function hideSearchBar() {
    if (searchBox) {
      searchBox.detach();
      searchBox = null;
    }
    screen.render();
  }

  // Wire vim search callbacks
  editor.vim.onSearchOpen = function () {
    showSearchBar('');
  };
  editor.vim.onSearchClose = function () {
    hideSearchBar();
  };
  editor.vim.onSearchUpdate = function (query) {
    showSearchBar(query);
  };

  // ---------------------------------------------------------------------------
  // Command bar widget — shown at the bottom when : is pressed in Normal mode.
  // ---------------------------------------------------------------------------
  var commandBox = null;

  function showCommandBar(text) {
    var t = themeEngine.getCurrentTheme();
    if (!commandBox) {
      commandBox = blessed.box({
        parent: screen,
        bottom: 1,
        left: 0,
        width: '100%',
        height: 1,
        tags: true,
        style: {
          fg: t ? t.textPrimary    : 'white',
          bg: t ? t.paletteInputBg : 'black'
        }
      });
    }
    commandBox.setContent(':' + (text || ''));
    screen.render();
  }

  function hideCommandBar() {
    if (commandBox) {
      commandBox.detach();
      commandBox = null;
    }
    screen.render();
  }

  // Wire vim command-line callbacks
  editor.vim.onCommandOpen = function () {
    showCommandBar('');
  };
  editor.vim.onCommandClose = function () {
    hideCommandBar();
  };
  editor.vim.onCommandUpdate = function (text) {
    showCommandBar(text);
  };
  editor.vim.onCommand = function (cmd) {
    // Defer execution to the next event-loop tick.
    //
    // The onCommand callback fires synchronously inside the editor's
    // screen.on('keypress') handler (the Enter key that confirms a : command).
    // The save-as keypress handler is registered AFTER the editor's handler on
    // the same screen emitter.  Because neo-blessed fires ALL 'keypress'
    // listeners synchronously for each event, the save-as handler runs
    // immediately after the editor handler — within the same event tick.
    //
    // If saveFile() calls startSaveAs() (no file path yet), it sets
    // saveAsMode = true before the save-as handler fires.  The save-as handler
    // then sees saveAsMode = true AND full === 'return' (the same Enter
    // keypress that confirmed the : command) and immediately calls
    // confirmSaveAs() with an empty buffer — silently cancelling the prompt.
    //
    // By deferring with setImmediate, all synchronous listeners for the current
    // keypress complete first (saveAsMode is still false), then our work runs
    // on the next tick when no keypress is in flight.
    setImmediate(function () {
      if (cmd === 'w') {
        saveFile();
      } else if (cmd === 'wq' || cmd === 'x') {
        if (!file) {
          // No file path yet — trigger Save As, then quit after save completes
          saveAndQuitAfterSaveAs = true;
          saveFile();
        } else {
          saveFile();
          saveBufferOnExit();
          safeDestroyScreen();
          process.exit(0);
        }
      } else if (cmd === 'q') {
        attemptQuit();
      } else if (cmd === 'q!') {
        saveBufferOnExit();
        safeDestroyScreen();
        process.exit(0);
      } else if (cmd === 'set wrap') {
        editor.setWrapMode(true);
        panels.topBar.setWrapMode(true);
        toast.showInfo(screen, 'wrap', themeEngine.getCurrentTheme());
      } else if (cmd === 'set nowrap') {
        editor.setWrapMode(false);
        panels.topBar.setWrapMode(false);
        toast.showInfo(screen, 'nowrap', themeEngine.getCurrentTheme());
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Command palette
  // ---------------------------------------------------------------------------

  /**
   * Apply a script execution result to the editor buffer.
   * Called by the palette after the user selects and runs a script.
   *
   * @param {object} result  - From executor.executeScript()
   */
  function applyResult(result) {
    if (!result) return;

    // Fatal execution error (exception in script)
    if (result.error) {
      toast.showError(screen, result.error, themeEngine.getCurrentTheme());
      return;
    }

    // Apply text change
    var action = result.action;

    if (action === 'replaceAll') {
      editor.setTextUndoable(result.text);
      markModified();
    } else if (action === 'replaceSelection') {
      // Replace the current visual selection in the buffer
      applyReplaceSelection(result.text);
      markModified();
    } else if (action === 'insert') {
      // Insert at current cursor position
      applyInsert(result.text);
      markModified();
    }
    // 'none' — no text change, just show messages below

    // Show info/error toasts
    var i;
    var activeTheme = themeEngine.getCurrentTheme();
    for (i = 0; i < (result.errors || []).length; i++) {
      toast.showError(screen, result.errors[i], activeTheme);
    }
    for (i = 0; i < (result.infos || []).length; i++) {
      toast.showInfo(screen, result.infos[i], activeTheme);
    }
  }

  /**
   * Replace the currently selected text in the editor buffer.
   * If no selection is active, fall back to replaceAll.
   * @param {string} text
   */
  function applyReplaceSelection(text) {
    try {
      var vim = editor.vim;
      var buf = editor.buffer;

      if (vim && (vim.mode === 'visual' || vim.mode === 'visual-line')) {
        var selRange = vim.selection.getRange(buf);
        if (selRange) {
          buf.deleteRange(
            selRange.startLine, selRange.startCol,
            selRange.endLine,
            vim.selection.isLine ? buf.getLine(selRange.endLine).length : selRange.endCol + 1
          );
          // Insert the replacement text at the cursor (now at start of deleted range)
          var replLines = text.split('\n');
          if (replLines.length === 1) {
            buf.insertChar(text);
          } else {
            // Multi-line replacement: insert char by char + newlines
            for (var ri = 0; ri < replLines.length; ri++) {
              if (ri > 0) buf.newLine();
              var lineText = replLines[ri];
              for (var ci = 0; ci < lineText.length; ci++) {
                buf.insertChar(lineText[ci]);
              }
            }
          }
          // Exit visual mode
          vim.setMode('normal');
          editor.render();
          return;
        }
      }
    } catch (_e) {
      // Fall through to replaceAll
    }

    // Fallback: replace entire buffer
    editor.setText(text);
  }

  /**
   * Insert text at the current cursor position.
   * @param {string} text
   */
  function applyInsert(text) {
    try {
      var buf = editor.buffer;
      var lines = text.split('\n');

      if (lines.length === 1) {
        // Single-line insert: use buffer.insertChar() for each character
        for (var ci = 0; ci < text.length; ci++) {
          buf.insertChar(text[ci]);
        }
      } else {
        // Multi-line insert
        for (var li = 0; li < lines.length; li++) {
          if (li > 0) buf.newLine();
          var lineText = lines[li];
          for (var ci2 = 0; ci2 < lineText.length; ci2++) {
            buf.insertChar(lineText[ci2]);
          }
        }
      }
      editor.render();
    } catch (_e) {
      // Fallback: append to buffer text
      editor.setText(editor.getText() + text);
    }
  }

  // ---------------------------------------------------------------------------
  // Clipboard integration — write yanked text to the system clipboard.
  // Uses platform-native tools (pbcopy on macOS, xclip/xsel on Linux, clip on Windows).
  // Silently fails if no clipboard tool is available (e.g., headless server).
  // ---------------------------------------------------------------------------
  function writeToClipboard(text) {
    try {
      var cp = require('child_process');
      if (process.platform === 'darwin') {
        cp.spawnSync('pbcopy', [], { input: text, timeout: 1000 });
      } else if (process.platform === 'linux') {
        var r = cp.spawnSync('xclip', ['-selection', 'clipboard'], { input: text, timeout: 1000 });
        if (r.status !== 0) {
          cp.spawnSync('xsel', ['--clipboard', '--input'], { input: text, timeout: 1000 });
        }
      } else if (process.platform === 'win32') {
        cp.spawnSync('clip', [], { input: text, timeout: 1000 });
      }
    } catch (_e) { /* silently fail — no clipboard tool available */ }
  }

  // Wire yank → system clipboard
  editor.vim.onYank = function (text) { writeToClipboard(text); };

  var palette = paletteModule.createPalette(screen, {
    scripts: scripts,
    flxifyRequire: flxifyRequire,
    editor: editor,
    onResult: applyResult,
    theme: themeEngine.getCurrentTheme()
  });

  // ---------------------------------------------------------------------------
  // Theme switching — applyTheme propagates to all widgets
  // ---------------------------------------------------------------------------

  /**
   * Apply the current themeEngine theme to every widget.
   * Called on startup and whenever Ctrl+T cycles the theme.
   */
  function applyTheme() {
    var t = themeEngine.getCurrentTheme();
    var name = themeEngine.getCurrentThemeName();

    // Update all panels
    panels.topBar.applyTheme(t);
    panels.editor.applyTheme(t);
    panels.lineNumbers.applyTheme(t);
    panels.statusBar.applyTheme(t, themeEngine.getDisplayName(name));
    palette.applyTheme(t);

    screen.render();
  }

  // Apply theme to all widgets on startup (the layout already received themeObj,
  // but palette is constructed after layout, so this ensures full consistency)
  applyTheme();

  // ---------------------------------------------------------------------------
  // Optional: save buffer to ~/.config/flxify/buffer.txt on exit (silent).
  // This is distinct from the user-initiated Ctrl+S save.
  // ---------------------------------------------------------------------------
  function saveBufferOnExit() {
    try {
      var configDir = path.join(
        process.env.HOME || process.env.USERPROFILE || '.',
        '.config', 'flxify'
      );
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      var bufPath = path.join(configDir, 'buffer.txt');
      fs.writeFileSync(bufPath, editor.getText(), 'utf8');
    } catch (_e) {
      // Non-fatal
    }
  }

  // ---------------------------------------------------------------------------
  // Global key bindings
  // ---------------------------------------------------------------------------

  // Intercept quit-confirmation keypress before all other keys
  screen.on('keypress', function (ch, key) {
    if (!awaitingQuitConfirm) return;

    var full = key && key.full;
    if (ch === 'y' || ch === 'Y') {
      hideQuitConfirm();
      // Defer saveFile() to the next event-loop tick.
      //
      // The save-as keypress handler is registered directly after this handler
      // on the same screen emitter.  Neo-blessed fires ALL 'keypress' listeners
      // synchronously for each event.  If we call saveFile() → startSaveAs()
      // here (synchronously), saveAsMode becomes true before the save-as handler
      // runs for this same 'y' keypress.  The save-as handler would then append
      // 'y' to saveAsBuffer, leaking the confirmation key into the filename.
      //
      // By deferring with setImmediate, the save-as handler runs first (sees
      // saveAsMode === false, does nothing), then our save logic runs on the
      // next tick with no keypress in flight.
      setImmediate(function () {
        if (!file) {
          // No file path yet — trigger Save As, then quit after save completes
          saveAndQuitAfterSaveAs = true;
          saveFile();
        } else {
          saveFile();
          saveBufferOnExit();
          safeDestroyScreen();
          process.exit(0);
        }
      });
    } else if (ch === 'n' || ch === 'N') {
      hideQuitConfirm();
      saveBufferOnExit();
      safeDestroyScreen();
      process.exit(0);
    } else if (ch === 'c' || ch === 'C' || full === 'escape') {
      hideQuitConfirm();
    }
    // Prevent other handlers from firing during confirmation
  });

  // Intercept Save As input keypress before all other key handlers
  screen.on('keypress', function (ch, key) {
    if (!saveAsMode) return;

    var full = key && key.full;

    if (full === 'escape') {
      hideSaveAsBar();
      return;
    }

    if (full === 'return') {
      confirmSaveAs();
      return;
    }

    if (full === 'backspace') {
      if (saveAsBuffer.length === 0) {
        hideSaveAsBar();
      } else {
        saveAsBuffer = saveAsBuffer.slice(0, -1);
        showSaveAsBar(saveAsBuffer);
      }
      return;
    }

    // Printable character
    if (ch && ch.length === 1 && !(key.ctrl) && !(key.meta)) {
      saveAsBuffer += ch;
      showSaveAsBar(saveAsBuffer);
      return;
    }
  });

  // Save — Ctrl+S
  screen.key(['C-s'], function () {
    if (palette.isVisible()) return;
    if (awaitingQuitConfirm) return;
    if (saveAsMode) return;
    saveFile();
  });

  // Quit on Ctrl+Q — check for unsaved changes
  screen.key(['C-q'], function () {
    if (saveAsMode) return;
    if (palette.isVisible()) {
      palette.hide();
      return;
    }
    if (awaitingQuitConfirm) return;
    attemptQuit();
  });

  // Ctrl+C — behaviour depends on editor mode:
  //   - Normal mode:  quit (with unsaved-changes check)
  //   - Insert mode:  return to Normal (handled in editor.js keypress)
  //   - Visual mode:  exit visual to Normal (handled in vim.js)
  //   - Palette open: close palette
  //   - Confirm open: cancel confirmation
  //   - Save As open: cancel Save As
  screen.key(['C-c'], function () {
    if (saveAsMode) {
      hideSaveAsBar();
      return;
    }
    if (palette.isVisible()) {
      palette.hide();
      return;
    }
    if (awaitingQuitConfirm) {
      hideQuitConfirm();
      return;
    }
    // In Normal mode, Ctrl+C quits (like Ctrl+Q)
    var vim = editor.vim;
    if (vim.mode === 'normal') {
      attemptQuit();
    }
    // Insert/Visual: handled in editor.js; the screen.key handler fires after
    // keypress, so the mode transition has already happened. No further action needed here.
  });

  // Command Palette — Ctrl+B (primary, matches web app)
  screen.key(['C-b'], function () {
    if (awaitingQuitConfirm) return;
    if (saveAsMode) return;
    if (palette.isVisible()) {
      palette.hide();
    } else {
      palette.show();
    }
  });

  // Command Palette — Ctrl+P (secondary, VS Code convention)
  screen.key(['C-p'], function () {
    if (awaitingQuitConfirm) return;
    if (saveAsMode) return;
    if (palette.isVisible()) {
      palette.hide();
    } else {
      palette.show();
    }
  });

  // Theme Cycle — Ctrl+T
  screen.key(['C-t'], function () {
    if (palette.isVisible()) return;
    if (awaitingQuitConfirm) return;
    if (saveAsMode) return;

    var newThemeName = themeEngine.cycleTheme();
    // Persist the new theme preference
    config.setTheme(newThemeName);
    // Apply to all widgets
    applyTheme();
    // Show a brief toast confirming the theme change
    toast.showInfo(screen, 'Theme: ' + themeEngine.getDisplayName(newThemeName), themeEngine.getCurrentTheme());
  });

  // --- Handle terminal resize ---
  screen.on('resize', function () {
    screen.render();
  });

  // --- Initial render ---
  screen.render();
}

module.exports = launch;
