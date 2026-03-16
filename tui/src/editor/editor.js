'use strict';

/**
 * Editor widget — a blessed box that renders a TextBuffer and handles keyboard input.
 *
 * Layout:
 *   - Positioned immediately to the right of the line-number gutter
 *   - Fills the vertical space between the top bar and status bar
 *
 * Rendering approach:
 *   - Extracts the visible slice of buffer lines [scrollTop, scrollTop + viewportH)
 *   - Sets that as the box content (plain text, no blessed tags — avoids tag parsing issues)
 *   - Moves the terminal hardware cursor to the correct screen position after each render
 *   - In visual mode, selected text is highlighted using blessed tags (inverse/bg)
 *
 * Vim mode integration:
 *   - All key events pass through VimStateMachine.processKey()
 *   - In Normal/Visual mode: vim.js handles all keys exclusively
 *   - In Insert mode: printable chars, backspace, enter, and arrows are handled here;
 *     Escape is forwarded to vim.js for mode transition
 *
 * Exposed API:
 *   getText()                  → string
 *   setText(text)              → void   (resets buffer + scroll)
 *   pause() / resume()         → void   (disable/enable key handling)
 *   onCursorMove               → assign a callback(line1, col1) to receive cursor updates
 *   onModeChange               → assign a callback(modeName) to receive mode changes
 *   render()                   → force a redraw (e.g., after external state change)
 *   buffer                     → direct access to the underlying TextBuffer instance
 *   vim                        → direct access to the VimStateMachine instance
 */

var TextBuffer = require('./buffer.js');
var VimStateMachine = require('./vim.js');
var lineNumbersModule = require('./line-numbers.js');

// Number of lines to keep between cursor and viewport edge before scrolling
var SCROLL_MARGIN = 3;

// Mode display names for status bar
var MODE_LABELS = {
  'normal':      'NORMAL',
  'insert':      'INSERT',
  'visual':      'VISUAL',
  'visual-line': 'VISUAL LINE'
};

/**
 * @param {import('neo-blessed').Widgets.Screen} screen
 * @param {object} opts
 * @param {number} opts.gutterLeft   - Left offset of the editor box (= gutter width)
 * @param {function} [opts.onReady]  - Called once the editor is constructed
 * @returns {object} Editor API object
 */
function createEditor(screen, opts) {
  var blessed = require('neo-blessed');

  var gutterLeft = (opts && opts.gutterLeft) || 4;
  var paused = false;

  // The text buffer
  var buffer = new TextBuffer();

  // Vim state machine
  var vim = new VimStateMachine(buffer);

  // How many lines have scrolled off the top
  var scrollTop = 0;

  // Word wrap — when true, long lines are wrapped at viewport width instead of truncated
  var wrapMode = false;

  // Cursor color for the current theme (set via applyTheme).
  // Written as an OSC 12 escape after each render so the terminal block cursor
  // is always visible, regardless of the terminal's own default cursor color.
  var cursorColor = null;

  // Callbacks
  var onCursorMove = null;
  var onModeChange = null;
  var onModified = null;

  // ---------------------------------------------------------------------------
  // Create the editor box
  // ---------------------------------------------------------------------------
  var box = blessed.box({
    parent: screen,
    top: 1,
    left: gutterLeft,
    width: screen.width - gutterLeft,
    height: screen.height - 2,
    tags: true,         // Enable blessed tags for visual mode highlighting
    scrollable: false,  // We manage scrolling manually
    style: {
      fg: 'white',
      bg: 'black'
    }
  });

  // ---------------------------------------------------------------------------
  // Viewport helpers
  // ---------------------------------------------------------------------------

  /** @returns {number} Number of visible lines in the editor box */
  function viewportHeight() {
    return screen.height - 2;
  }

  /** @returns {number} Number of visible columns in the editor box */
  function viewportWidth() {
    return screen.width - gutterLeft;
  }

  /**
   * Adjust scrollTop so the cursor stays within SCROLL_MARGIN of both edges.
   */
  function adjustScroll() {
    var cur = buffer.getCursor();
    var vph = viewportHeight();

    // Scroll up if cursor is above the visible area + margin
    if (cur.line < scrollTop + SCROLL_MARGIN) {
      scrollTop = Math.max(0, cur.line - SCROLL_MARGIN);
    }

    // Scroll down if cursor is below the visible area - margin
    if (cur.line >= scrollTop + vph - SCROLL_MARGIN) {
      scrollTop = cur.line - vph + SCROLL_MARGIN + 1;
      if (scrollTop < 0) scrollTop = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /**
   * Escape a string so blessed doesn't interpret tag-like sequences in it.
   * We replace { and } with their blessed escape sequences.
   * @param {string} text
   * @returns {string}
   */
  function escapeTags(text) {
    return text.replace(/[{}]/g, function(ch) {
      return ch === '{' ? '{open}' : '{close}';
    });
  }

  /**
   * Returns the number of visual (screen) rows a logical line occupies when wrapped.
   * @param {string} text  - logical line text
   * @param {number} vpw   - viewport width in columns
   * @returns {number} >= 1
   */
  function visualRowsForLine(text, vpw) {
    return text.length === 0 ? 1 : Math.ceil(text.length / vpw);
  }

  /**
   * Build the visible text and write it into the blessed box.
   * Handles visual-mode highlighting by wrapping selected chars in inverse tags.
   * Then repositions the terminal hardware cursor.
   *
   * When wrapMode is true, long lines are split into multiple visual rows.
   * When wrapMode is false (default), long lines are truncated at viewport width.
   */
  function render() {
    var cur = buffer.getCursor();
    var vph = viewportHeight();
    var vpw = viewportWidth();
    var totalLines = buffer.getLineCount();
    var contentLines = [];

    var inVisual = (vim.mode === 'visual' || vim.mode === 'visual-line');
    var selRange = inVisual ? vim.selection.getRange(buffer) : null;

    var screenRow, screenCol;

    if (wrapMode) {
      // --- Wrap mode: emit visual rows by slicing logical lines at vpw chars ---
      var visualRow = 0;
      var cursorScreenRow = 1;
      var cursorScreenCol = gutterLeft;
      var logicalLine = scrollTop;

      while (visualRow < vph && logicalLine < totalLines) {
        var lineText = buffer.getLine(logicalLine);
        var rowsThisLine = visualRowsForLine(lineText, vpw);

        // Compute cursor position for this logical line if it's the cursor line
        if (logicalLine === cur.line) {
          var cursorRowInLine = Math.floor(cur.col / vpw);
          var cursorColInRow  = cur.col % vpw;
          cursorScreenRow = 1 + visualRow + cursorRowInLine;
          cursorScreenCol = gutterLeft + cursorColInRow;
        }

        // Emit each visual row for this logical line
        for (var seg = 0; seg < rowsThisLine && visualRow < vph; seg++) {
          var slice = lineText.slice(seg * vpw, (seg + 1) * vpw);
          if (inVisual && selRange && logicalLine >= selRange.startLine && logicalLine <= selRange.endLine) {
            // Determine selection columns within this visual segment
            var segStart = seg * vpw;
            var segEnd   = segStart + vpw;
            var sc = vim.selection.isLine ? 0 : (logicalLine === selRange.startLine ? selRange.startCol : 0);
            var ec = vim.selection.isLine ? lineText.length : (logicalLine === selRange.endLine ? selRange.endCol + 1 : lineText.length);
            // Clamp to this segment
            var localSc = Math.max(0, sc - segStart);
            var localEc = Math.min(vpw, ec - segStart);
            if (localEc > localSc) {
              var before   = escapeTags(slice.slice(0, localSc));
              var selected = escapeTags(slice.slice(localSc, localEc));
              var after    = escapeTags(slice.slice(localEc));
              if (!selected) selected = ' ';
              contentLines.push(before + '{inverse}' + selected + '{/inverse}' + after);
            } else {
              contentLines.push(escapeTags(slice));
            }
          } else {
            contentLines.push(escapeTags(slice));
          }
          visualRow++;
        }
        logicalLine++;
      }

      // Pad remaining rows
      while (contentLines.length < vph) contentLines.push('');

      screenRow = cursorScreenRow;
      screenCol = cursorScreenCol;

    } else {
      // --- No-wrap mode (default): truncate long lines ---
      for (var i = 0; i < vph; i++) {
        var lineIdx = scrollTop + i;
        if (lineIdx < totalLines) {
          var lineText = buffer.getLine(lineIdx);
          // Truncate to viewport width to prevent blessed from wrapping
          if (lineText.length > vpw) {
            lineText = lineText.slice(0, vpw);
          }

          if (inVisual && selRange && lineIdx >= selRange.startLine && lineIdx <= selRange.endLine) {
            // This line is (partially) selected — apply highlight
            contentLines.push(renderSelectedLine(lineText, lineIdx, selRange, vim.selection.isLine));
          } else {
            contentLines.push(escapeTags(lineText));
          }
        } else {
          contentLines.push('');
        }
      }

      screenRow = 1 + (cur.line - scrollTop);
      screenCol = gutterLeft + cur.col;
    }

    box.setContent(contentLines.join('\n'));

    // Clamp to prevent cursor going off screen
    if (screenRow < 1) screenRow = 1;
    if (screenRow >= screen.height - 1) screenRow = screen.height - 2;
    if (screenCol < gutterLeft) screenCol = gutterLeft;
    if (screenCol >= screen.width) screenCol = screen.width - 1;

    // Notify BEFORE render so gutter and status bar update in the same frame.
    // If onCursorMove is called after screen.render(), the gutter bold highlight
    // lags one frame behind — it shows the PREVIOUS cursor line, making arrow
    // keys appear to move in the wrong direction on the first press.
    if (typeof onCursorMove === 'function') {
      onCursorMove(cur.line + 1, cur.col + 1);
    }

    // Now render everything (editor content + gutter + status bar) in one pass
    screen.render();
    // Position cursor AFTER render to avoid blessed's save/restore interference.
    // Also explicitly show the cursor — blessed's smartCSR hides it during screen.render()
    // via \x1b[?25l and does not restore it, since it expects to manage cursor visibility.
    process.stdout.write('\x1b[' + (screenRow + 1) + ';' + (screenCol + 1) + 'H');
    process.stdout.write('\x1b[?25h'); // show cursor (cnorm)
    // Set the cursor color via OSC 12 so it's visible against every theme background.
    // Without this, the terminal uses its own default cursor color which may be
    // invisible in light mode (white cursor on white background).
    if (cursorColor) {
      process.stdout.write('\x1b]12;' + cursorColor + '\x07');
    }
    screen.program.x = screenCol;
    screen.program.y = screenRow;
  }

  /**
   * Render a single line with visual-mode selection highlighting.
   * Selected characters are wrapped in {inverse}...{/inverse} blessed tags.
   * @param {string} lineText
   * @param {number} lineIdx
   * @param {{ startLine, startCol, endLine, endCol }} selRange
   * @param {boolean} isLineSel
   * @returns {string} Content with blessed tags
   */
  function renderSelectedLine(lineText, lineIdx, selRange, isLineSel) {
    var sc, ec;
    if (isLineSel) {
      sc = 0;
      ec = lineText.length; // whole line highlighted
    } else {
      sc = (lineIdx === selRange.startLine) ? selRange.startCol : 0;
      ec = (lineIdx === selRange.endLine)   ? selRange.endCol + 1 : lineText.length;
      // Clamp
      sc = Math.max(0, Math.min(sc, lineText.length));
      ec = Math.max(sc, Math.min(ec, lineText.length));
    }

    var before = escapeTags(lineText.slice(0, sc));
    var selected = escapeTags(lineText.slice(sc, ec));
    var after = escapeTags(lineText.slice(ec));

    // If selected is empty (e.g., an empty line in visual-line mode), add a
    // space so that the {inverse} tag renders a visible highlight cell.
    if (!selected) selected = ' ';

    return before + '{inverse}' + selected + '{/inverse}' + after;
  }

  // ---------------------------------------------------------------------------
  // Mode notification
  // ---------------------------------------------------------------------------

  /**
   * Notify the onModeChange callback with the current mode's display label.
   */
  function notifyModeChange() {
    if (typeof onModeChange === 'function') {
      var label = MODE_LABELS[vim.mode] || vim.mode.toUpperCase();
      onModeChange(label);
    }
  }

  /**
   * Notify the onModified callback that the buffer has been edited.
   */
  function notifyModified() {
    if (typeof onModified === 'function') {
      onModified();
    }
  }

  // ---------------------------------------------------------------------------
  // Insert mode helpers
  // ---------------------------------------------------------------------------

  function moveHome() {
    var cur = buffer.getCursor();
    buffer.setCursor(cur.line, 0);
  }

  function moveEnd() {
    var cur = buffer.getCursor();
    var lineLen = buffer.getLine(cur.line).length;
    buffer.setCursor(cur.line, lineLen);
  }

  function pageUp() {
    var vph = viewportHeight();
    var cur = buffer.getCursor();
    var newLine = Math.max(0, cur.line - vph);
    buffer.setCursor(newLine, cur.col);
    scrollTop = Math.max(0, scrollTop - vph);
  }

  function pageDown() {
    var vph = viewportHeight();
    var cur = buffer.getCursor();
    var totalLines = buffer.getLineCount();
    var newLine = Math.min(totalLines - 1, cur.line + vph);
    buffer.setCursor(newLine, cur.col);
    scrollTop = Math.min(Math.max(0, totalLines - vph), scrollTop + vph);
  }

  // ---------------------------------------------------------------------------
  // Keyboard input — attached to screen-level keypress
  // ---------------------------------------------------------------------------

  screen.on('keypress', function (ch, key) {
    // Ignore if the editor is paused (e.g., palette is open)
    if (paused) return;

    var full = key && key.full;

    // Provide current viewport info to the Vim state machine
    vim.setViewportInfo(viewportHeight(), scrollTop);

    if (vim.mode === 'insert') {
      // --- Insert mode ---
      // Escape / Ctrl+[ handled by vim.js
      if (full === 'escape' || full === 'C-[') {
        var result = vim.processKey(ch, key);
        if (result.modeChanged) notifyModeChange();
        adjustScroll();
        render();
        return;
      }

      // Navigation (arrow keys, home/end, page up/down) — allowed in insert mode
      if (full === 'up')       { buffer.moveCursorUp(); }
      else if (full === 'down')  { buffer.moveCursorDown(); }
      else if (full === 'left')  { buffer.moveCursorLeft(); }
      else if (full === 'right') { buffer.moveCursorRight(); }
      else if (full === 'home')  { moveHome(); }
      else if (full === 'end')   { moveEnd(); }
      else if (full === 'pageup')   { pageUp(); }
      else if (full === 'pagedown') { pageDown(); }

      // Editing
      else if (full === 'return') { buffer.newLine(); notifyModified(); }
      else if (full === 'backspace') { buffer.deleteChar(); notifyModified(); }
      else if (full === 'delete')    { buffer.deleteCharForward(); notifyModified(); }

      // Undo / Redo (Ctrl+Z / Ctrl+Y) in insert mode
      else if (full === 'C-z') { buffer.undo(); }
      else if (full === 'C-y') { buffer.redo(); }

      // Ctrl+C in insert mode — return to normal (like Vim)
      else if (full === 'C-c') {
        var r2 = vim.processKey(null, { full: 'escape', ctrl: false, meta: false, shift: false, name: 'escape' });
        if (r2.modeChanged) notifyModeChange();
        adjustScroll();
        render();
        return;
      }

      // Printable character insertion
      else if (ch && !key.ctrl && !key.meta && ch.length === 1) {
        var code = ch.charCodeAt(0);
        if (code >= 32 || code === 9) {
          buffer.insertChar(ch === '\t' ? '    ' : ch);
          notifyModified();
        }
      }

      adjustScroll();
      render();
      return;
    }

    // --- Normal / Visual mode --- everything goes through vim.js
    var result = vim.processKey(ch, key);

    if (result.modeChanged) {
      notifyModeChange();
    }

    // Track modified state for edit operations in normal/visual mode.
    // Editing commands (dd, dw, x, p, r, cc, etc.) produce render:true and
    // transition out of visual mode or involve register changes — we mark
    // modified when the buffer could have changed.
    if (result.render && (
      (result.modeChanged && vim.mode === 'insert') ||   // entering insert from an edit
      vim.mode === 'normal' || vim.mode === 'visual' || vim.mode === 'visual-line'
    )) {
      // Conservatively: mark modified on any render in normal/visual mode.
      // Movements are cheap and so is the modified flag toggle.
      notifyModified();
    }

    if (result.render) {
      adjustScroll();
      render();
    }
  });

  // ---------------------------------------------------------------------------
  // Resize handling
  // ---------------------------------------------------------------------------

  screen.on('resize', function () {
    box.top = 1;
    box.left = gutterLeft;
    box.width = screen.width - gutterLeft;
    box.height = screen.height - 2;
    adjustScroll();
    render();
  });

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Get the full text content of the editor.
   * @returns {string}
   */
  function getText() {
    return buffer.getText();
  }

  /**
   * Replace the editor content with the given string.
   * Resets cursor to (0,0) and clears scroll/undo history.
   * @param {string} text
   */
  function setText(text) {
    buffer.setText(text);
    scrollTop = 0;
    render();
  }

  /**
   * Enable or disable word-wrap rendering.
   * When enabled, lines longer than the viewport width wrap to multiple visual rows.
   * When disabled (default), long lines are truncated at the viewport edge.
   * @param {boolean} enabled
   */
  function setWrapMode(enabled) {
    wrapMode = !!enabled;
    render();
  }

  /**
   * Replace the editor content with an undo-preserving setText.
   * The prior content is pushed onto the undo stack, so `u` can restore it.
   * Used by applyResult() after running a script.
   * @param {string} text
   */
  function setTextUndoable(text) {
    buffer.setTextUndoable(text);
    scrollTop = 0;
    render();
  }

  /**
   * Pause key handling (e.g., when command palette is open).
   * Hides the terminal cursor while the editor is inactive.
   */
  function pause() {
    paused = true;
    process.stdout.write('\x1b[?25l'); // hide cursor while editor is paused
  }

  /**
   * Resume key handling.
   */
  function resume() {
    paused = false;
    render();
  }

  /**
   * Update the left offset of the editor when the gutter width changes.
   * @param {number} newLeft
   */
  function setGutterLeft(newLeft) {
    gutterLeft = newLeft;
    box.left = gutterLeft;
    box.width = screen.width - gutterLeft;
  }

  /**
   * Apply a new theme to the editor box. Updates fg/bg, cursor color, and re-renders.
   * @param {object} theme  - Theme object from themes.js
   */
  function applyTheme(theme) {
    box.style.fg = theme.textPrimary;
    box.style.bg = theme.bgEditor;
    cursorColor = theme.editorCursor || null;
    render();
  }

  // Initial mode — layout.js creates statusBar with 'NORMAL'; vim starts in normal
  // Notify after a tick so the status bar is fully constructed first
  // (Use setImmediate if available, else just call directly)
  var initFn = function () {
    notifyModeChange();
    adjustScroll();
    render();
  };
  if (typeof setImmediate === 'function') {
    setImmediate(initFn);
  } else {
    initFn();
  }

  return {
    // Properties
    buffer: buffer,
    vim: vim,

    // Content API
    getText: getText,
    setText: setText,
    setTextUndoable: setTextUndoable,
    setWrapMode: setWrapMode,

    // Control
    pause: pause,
    resume: resume,
    render: render,
    setGutterLeft: setGutterLeft,
    applyTheme: applyTheme,

    // Scroll state (read-only, for gutter sync)
    getScrollTop: function () { return scrollTop; },

    // Cursor move callback — assign a function(line1, col1)
    set onCursorMove(fn) { onCursorMove = fn; },
    get onCursorMove() { return onCursorMove; },

    // Mode change callback — assign a function(modeLabel)
    set onModeChange(fn) { onModeChange = fn; },
    get onModeChange() { return onModeChange; },

    // Modified callback — assign a function() called after any edit
    set onModified(fn) { onModified = fn; },
    get onModified() { return onModified; }
  };
}

module.exports = { createEditor: createEditor };
