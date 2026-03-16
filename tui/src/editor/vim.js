'use strict';

/**
 * VimStateMachine — pure Vim keybinding logic.
 *
 * This module is intentionally free of any blessed / terminal dependency.
 * It receives keystrokes and calls methods on a TextBuffer, then returns
 * a result descriptor the editor uses for rendering.
 *
 * Supported modes:
 *   'normal'      — movement + operator commands
 *   'insert'      — character insertion (characters are handled by editor.js)
 *   'visual'      — character-wise selection
 *   'visual-line' — line-wise selection
 *
 * State fields:
 *   mode           — current mode string
 *   register       — yank register content (string)
 *   registerIsLine — whether register holds whole lines
 *   count          — numeric prefix accumulator (string)
 *   pending        — pending operator: 'd', 'y', 'c', 'g', 'r', 'f', 'F'
 *   lastEdit       — last edit descriptor for dot-repeat (future)
 *   visualAnchor   — { line, col } where v/V was pressed
 *
 * processKey(ch, key) returns:
 *   { mode, render, modeChanged, message }
 */

var Selection = require('./selection.js');

// Pending-operator cancel timeout (ms)
var PENDING_TIMEOUT_MS = 1000;

/**
 * @param {import('./buffer.js')} buffer
 */
function VimStateMachine(buffer) {
  this.buffer = buffer;
  this.mode = 'normal';
  this.register = '';
  this.registerIsLine = false;
  this.count = '';
  this.pending = null;
  this._pendingTimer = null;
  this.lastEdit = null;
  this.selection = new Selection();

  // Viewport info — set by editor.js before calling processKey
  this.viewportHeight = 24;
  this.viewportScrollTop = 0;

  // Search state
  this.searchMode = false;      // true when reading a / query
  this.searchQuery = '';        // current search input buffer
  this.lastSearch = '';         // last confirmed search query
  this.searchMatches = [];      // array of { line, col }
  this.currentMatchIndex = -1;  // index into searchMatches

  // Callbacks for search bar UI (set by editor.js or app.js)
  this.onSearchOpen = null;   // function() — called when / is pressed
  this.onSearchClose = null;  // function() — called when search closes
  this.onSearchUpdate = null; // function(query) — called on each search keystroke

  // Command mode state (: commands like :w, :wq, :q, :q!)
  this.commandMode = false;
  this.commandBuffer = '';
  this.onCommand = null;       // function(cmd) — called when command is confirmed
  this.onCommandOpen = null;   // function() — called when : is pressed
  this.onCommandClose = null;  // function() — called when command mode closes
  this.onCommandUpdate = null; // function(text) — called on each command keystroke

  // Yank callback — called with the register text after any yank (yy, y{motion}, visual y).
  // app.js wires this to the system clipboard writer.
  this.onYank = null;          // function(text) — called after register is populated
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the result object returned by processKey.
 * @param {boolean} render
 * @param {boolean} modeChanged
 * @param {string|null} message
 * @returns {object}
 */
VimStateMachine.prototype._result = function (render, modeChanged, message) {
  return {
    mode: this.mode,
    render: render,
    modeChanged: modeChanged,
    message: message || null
  };
};

/**
 * Get the numeric count prefix, defaulting to 1.
 * Clears the count accumulator after reading.
 * @returns {number}
 */
VimStateMachine.prototype._getCount = function () {
  var n = this.count === '' ? 1 : parseInt(this.count, 10);
  this.count = '';
  return n;
};

/**
 * Start the pending-operator cancel timer.
 */
VimStateMachine.prototype._startPendingTimer = function () {
  var self = this;
  this._clearPendingTimer();
  this._pendingTimer = setTimeout(function () {
    self.pending = null;
    self.count = '';
  }, PENDING_TIMEOUT_MS);
};

/**
 * Clear the pending-operator cancel timer.
 */
VimStateMachine.prototype._clearPendingTimer = function () {
  if (this._pendingTimer !== null) {
    clearTimeout(this._pendingTimer);
    this._pendingTimer = null;
  }
};

/**
 * Set a new pending operator and start the cancel timer.
 * @param {string} op
 */
VimStateMachine.prototype._setPending = function (op) {
  this.pending = op;
  this._startPendingTimer();
};

/**
 * Clear pending state.
 */
VimStateMachine.prototype._clearPending = function () {
  this.pending = null;
  this._clearPendingTimer();
};

// ---------------------------------------------------------------------------
// Mode transitions
// ---------------------------------------------------------------------------

/**
 * Enter insert mode.
 * @returns {object} result
 */
VimStateMachine.prototype._enterInsert = function () {
  this.mode = 'insert';
  this._clearPending();
  this.count = '';
  return this._result(true, true, null);
};

/**
 * Return to normal mode from any other mode.
 * In visual mode, clears selection.
 * @returns {object} result
 */
VimStateMachine.prototype._enterNormal = function () {
  var wasVisual = (this.mode === 'visual' || this.mode === 'visual-line');
  this.mode = 'normal';
  this._clearPending();
  this.count = '';
  if (wasVisual) {
    this.selection.clear();
  }
  // In normal mode, cursor must not be past the last char of the line
  var buf = this.buffer;
  var cur = buf.getCursor();
  var lineLen = buf.getLine(cur.line).length;
  if (lineLen > 0 && cur.col >= lineLen) {
    buf.setCursor(cur.line, lineLen - 1);
  }
  return this._result(true, true, null);
};

// ---------------------------------------------------------------------------
// Movement helpers (used in both Normal and Visual mode)
// ---------------------------------------------------------------------------

/**
 * Apply a movement N times and return whether anything changed.
 * @param {Function} moveFn - no-arg function to call for one step
 * @param {number} n
 */
VimStateMachine.prototype._moveN = function (moveFn, n) {
  for (var i = 0; i < n; i++) {
    moveFn.call(this.buffer);
  }
};

/**
 * Move to the first non-whitespace character on the current line.
 */
VimStateMachine.prototype._moveFirstNonWS = function () {
  var cur = this.buffer.getCursor();
  var line = this.buffer.getLine(cur.line);
  var col = 0;
  while (col < line.length && /\s/.test(line[col])) col++;
  this.buffer.setCursor(cur.line, col);
};

/**
 * Move cursor to find char `ch` forward on current line (f command).
 * @param {string} ch
 * @returns {boolean} found
 */
VimStateMachine.prototype._findCharForward = function (ch) {
  var cur = this.buffer.getCursor();
  var line = this.buffer.getLine(cur.line);
  for (var i = cur.col + 1; i < line.length; i++) {
    if (line[i] === ch) {
      this.buffer.setCursor(cur.line, i);
      return true;
    }
  }
  return false;
};

/**
 * Move cursor to find char `ch` backward on current line (F command).
 * @param {string} ch
 * @returns {boolean} found
 */
VimStateMachine.prototype._findCharBackward = function (ch) {
  var cur = this.buffer.getCursor();
  var line = this.buffer.getLine(cur.line);
  for (var i = cur.col - 1; i >= 0; i--) {
    if (line[i] === ch) {
      this.buffer.setCursor(cur.line, i);
      return true;
    }
  }
  return false;
};

/**
 * Move to the next blank (empty or whitespace-only) line below.
 */
VimStateMachine.prototype._moveNextBlankLine = function () {
  var cur = this.buffer.getCursor();
  var total = this.buffer.getLineCount();
  var l = cur.line + 1;
  while (l < total && this.buffer.getLine(l).trim() !== '') l++;
  this.buffer.setCursor(l < total ? l : total - 1, 0);
};

/**
 * Move to the previous blank line above.
 */
VimStateMachine.prototype._movePrevBlankLine = function () {
  var cur = this.buffer.getCursor();
  var l = cur.line - 1;
  while (l > 0 && this.buffer.getLine(l).trim() !== '') l--;
  this.buffer.setCursor(l >= 0 ? l : 0, 0);
};

/**
 * Clamp the cursor col in normal mode to max(lineLen-1, 0).
 */
VimStateMachine.prototype._clampNormalCol = function () {
  var cur = this.buffer.getCursor();
  var lineLen = this.buffer.getLine(cur.line).length;
  if (lineLen > 0 && cur.col >= lineLen) {
    this.buffer.setCursor(cur.line, lineLen - 1);
  }
};

// ---------------------------------------------------------------------------
// Visual-mode selection update
// ---------------------------------------------------------------------------

/**
 * After any movement in visual mode, update the selection active end.
 */
VimStateMachine.prototype._updateVisualSelection = function () {
  var cur = this.buffer.getCursor();
  this.selection.updateActive(cur.line, cur.col);
};

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

/**
 * Run a search for this.lastSearch and populate this.searchMatches.
 * Moves cursor to the first match at or after the current cursor position.
 */
VimStateMachine.prototype._runSearch = function () {
  if (!this.lastSearch) return;
  this.searchMatches = this.buffer.findAll(this.lastSearch);
  if (this.searchMatches.length === 0) {
    this.currentMatchIndex = -1;
    return;
  }
  // Find first match at or after cursor
  var cur = this.buffer.getCursor();
  for (var i = 0; i < this.searchMatches.length; i++) {
    var m = this.searchMatches[i];
    if (m.line > cur.line || (m.line === cur.line && m.col >= cur.col)) {
      this.currentMatchIndex = i;
      this.buffer.setCursor(m.line, m.col);
      return;
    }
  }
  // Wrap to first match
  this.currentMatchIndex = 0;
  var first = this.searchMatches[0];
  this.buffer.setCursor(first.line, first.col);
};

/**
 * Move to the next search match (n command).
 */
VimStateMachine.prototype._searchNext = function () {
  if (this.searchMatches.length === 0) return;
  this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchMatches.length;
  var m = this.searchMatches[this.currentMatchIndex];
  this.buffer.setCursor(m.line, m.col);
};

/**
 * Move to the previous search match (N command).
 */
VimStateMachine.prototype._searchPrev = function () {
  if (this.searchMatches.length === 0) return;
  this.currentMatchIndex = (this.currentMatchIndex - 1 + this.searchMatches.length) % this.searchMatches.length;
  var m = this.searchMatches[this.currentMatchIndex];
  this.buffer.setCursor(m.line, m.col);
};

/**
 * Process a key in search-input mode (after / was pressed).
 * Returns { done: bool, render: bool, query: string }
 * @param {string|null} ch
 * @param {object} key
 * @returns {{ done: boolean, render: boolean }}
 */
VimStateMachine.prototype._processSearchKey = function (ch, key) {
  var full = (key && key.full) || '';

  if (full === 'escape' || full === 'C-[') {
    // Cancel search
    this.searchMode = false;
    this.searchQuery = '';
    if (typeof this.onSearchClose === 'function') this.onSearchClose();
    return { done: true, render: false };
  }

  if (full === 'enter' || full === 'return') {
    // Confirm search
    this.lastSearch = this.searchQuery;
    this.searchMode = false;
    this.searchQuery = '';
    if (typeof this.onSearchClose === 'function') this.onSearchClose();
    this._runSearch();
    return { done: true, render: true };
  }

  if (full === 'backspace') {
    this.searchQuery = this.searchQuery.slice(0, -1);
    if (typeof this.onSearchUpdate === 'function') this.onSearchUpdate(this.searchQuery);
    return { done: false, render: false };
  }

  // Printable character
  if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
    this.searchQuery += ch;
    if (typeof this.onSearchUpdate === 'function') this.onSearchUpdate(this.searchQuery);
    return { done: false, render: false };
  }

  return { done: false, render: false };
};

// ---------------------------------------------------------------------------
// Word-level operate helpers (dw, de, db, cw, etc.)
// ---------------------------------------------------------------------------

/**
 * Operate on text from current cursor to the word boundary in the given direction.
 *
 * For the 'e' direction, the target col is the last char of the word (inclusive),
 * so we add 1 to make the delete range exclusive — matching Vim's `de` behaviour.
 *
 * @param {'w'|'e'|'b'} direction
 * @param {string} op  - 'd', 'y', or 'c'
 */
VimStateMachine.prototype._operateWordMotion = function (direction, op) {
  var buf = this.buffer;
  var cur = buf.getCursor();
  var target = buf.getWordBoundary(direction);

  // For 'e', the boundary is inclusive (last char of word); adjust to exclusive
  var targetCol = target.col;
  if (direction === 'e') {
    targetCol = target.col + 1;
  }

  var startLine, startCol, endLine, endCol;
  if (target.line > cur.line || (target.line === cur.line && targetCol > cur.col)) {
    startLine = cur.line; startCol = cur.col;
    endLine   = target.line; endCol = targetCol;
  } else {
    startLine = target.line; startCol = targetCol;
    endLine   = cur.line; endCol = cur.col;
  }

  // Extract text for register
  if (startLine === endLine) {
    this.register = buf.getLine(startLine).slice(startCol, endCol);
  } else {
    var parts = [buf.getLine(startLine).slice(startCol)];
    for (var l = startLine + 1; l < endLine; l++) parts.push(buf.getLine(l));
    parts.push(buf.getLine(endLine).slice(0, endCol));
    this.register = parts.join('\n');
  }
  this.registerIsLine = false;

  if (op === 'd' || op === 'c') {
    buf.deleteRange(startLine, startCol, endLine, endCol);
  }
};

// ---------------------------------------------------------------------------
// Normal mode: editing operations
// ---------------------------------------------------------------------------

/**
 * Yank N lines starting at the current cursor line.
 * @param {number} n
 * @returns {string} status message
 */
VimStateMachine.prototype._yankLines = function (n) {
  var cur = this.buffer.getCursor();
  var lines = [];
  var total = this.buffer.getLineCount();
  for (var i = 0; i < n; i++) {
    var l = cur.line + i;
    if (l < total) lines.push(this.buffer.getLine(l));
  }
  this.register = lines.join('\n');
  this.registerIsLine = true;
  if (typeof this.onYank === 'function') this.onYank(this.register);
  return n === 1 ? '1 line yanked' : n + ' lines yanked';
};

/**
 * Delete N lines, store in register.
 * @param {number} n
 * @returns {string} status message
 */
VimStateMachine.prototype._deleteLines = function (n) {
  var cur = this.buffer.getCursor();
  var total = this.buffer.getLineCount();
  var actual = Math.min(n, total - cur.line);
  var deleted = [];
  for (var i = 0; i < actual; i++) {
    deleted.push(this.buffer.getLine(cur.line + i));
  }
  this.register = deleted.join('\n');
  this.registerIsLine = true;
  this.buffer.deleteLines(cur.line, actual);
  return actual === 1 ? '1 line deleted' : actual + ' lines deleted';
};

/**
 * Paste register content after cursor (line-wise: below current line).
 */
VimStateMachine.prototype._pasteAfter = function () {
  if (this.register === '') return;
  var cur = this.buffer.getCursor();
  if (this.registerIsLine) {
    // Insert lines below current line
    var pasteLines = this.register.split('\n');
    this.buffer.pushUndo();
    for (var i = pasteLines.length - 1; i >= 0; i--) {
      this.buffer.lines.splice(cur.line + 1, 0, pasteLines[i]);
    }
    this.buffer.setCursor(cur.line + 1, 0);
  } else {
    // Insert chars after cursor (col + 1 is the insertion point)
    var text = this.register;
    var insertCol = cur.col + 1;
    var line = this.buffer.getLine(cur.line);
    var before = line.slice(0, insertCol);
    var after = line.slice(insertCol);
    this.buffer.pushUndo();
    if (text.indexOf('\n') === -1) {
      // Single-line char paste
      this.buffer.lines[cur.line] = before + text + after;
      var newCol = before.length + text.length - 1;
      if (newCol < 0) newCol = 0;
      this.buffer.setCursor(cur.line, newCol);
    } else {
      // Multi-line char paste — split register on '\n' and splice lines
      var parts = text.split('\n');
      parts[0] = before + parts[0];
      parts[parts.length - 1] = parts[parts.length - 1] + after;
      this.buffer.lines.splice(cur.line, 1);
      for (var i = parts.length - 1; i >= 0; i--) {
        this.buffer.lines.splice(cur.line, 0, parts[i]);
      }
      var lastLineIdx = cur.line + parts.length - 1;
      var lastPartLen = parts[parts.length - 1].length;
      var newCol = lastPartLen - after.length - 1;
      if (newCol < 0) newCol = 0;
      this.buffer.setCursor(lastLineIdx, newCol);
    }
  }
};

/**
 * Paste register content before cursor (line-wise: above current line).
 */
VimStateMachine.prototype._pasteBefore = function () {
  if (this.register === '') return;
  var cur = this.buffer.getCursor();
  if (this.registerIsLine) {
    var pasteLines = this.register.split('\n');
    this.buffer.pushUndo();
    for (var i = pasteLines.length - 1; i >= 0; i--) {
      this.buffer.lines.splice(cur.line, 0, pasteLines[i]);
    }
    this.buffer.setCursor(cur.line, 0);
  } else {
    // Insert chars before cursor (at current col)
    var text = this.register;
    var line = this.buffer.getLine(cur.line);
    var insertCol = cur.col;
    var before = line.slice(0, insertCol);
    var after = line.slice(insertCol);
    this.buffer.pushUndo();
    if (text.indexOf('\n') === -1) {
      // Single-line char paste
      this.buffer.lines[cur.line] = before + text + after;
      var newCol = before.length + text.length - 1;
      if (newCol < 0) newCol = 0;
      this.buffer.setCursor(cur.line, newCol);
    } else {
      // Multi-line char paste — split register on '\n' and splice lines
      var parts = text.split('\n');
      parts[0] = before + parts[0];
      parts[parts.length - 1] = parts[parts.length - 1] + after;
      this.buffer.lines.splice(cur.line, 1);
      for (var i = parts.length - 1; i >= 0; i--) {
        this.buffer.lines.splice(cur.line, 0, parts[i]);
      }
      var lastLineIdx = cur.line + parts.length - 1;
      var lastPartLen = parts[parts.length - 1].length;
      var newCol = lastPartLen - after.length - 1;
      if (newCol < 0) newCol = 0;
      this.buffer.setCursor(lastLineIdx, newCol);
    }
  }
};

// ---------------------------------------------------------------------------
// Visual mode: operations on selection
// ---------------------------------------------------------------------------

/**
 * Delete the current visual selection, store in register.
 * Returns to normal mode.
 */
VimStateMachine.prototype._visualDelete = function () {
  var range = this.selection.getRange(this.buffer);
  if (this.selection.isLine) {
    var lines = this.selection.getSelectedLines(this.buffer);
    this.register = lines.join('\n');
    this.registerIsLine = true;
    this.buffer.deleteLines(range.startLine, range.endLine - range.startLine + 1);
  } else {
    this.register = this.selection.getText(this.buffer);
    this.registerIsLine = false;
    // Delete range (endCol is inclusive in visual mode)
    this.buffer.deleteRange(range.startLine, range.startCol, range.endLine, range.endCol + 1);
  }
  this.selection.clear();
  this.mode = 'normal';
};

/**
 * Yank the current visual selection, store in register.
 * Returns to normal mode.
 */
VimStateMachine.prototype._visualYank = function () {
  this.register = this.selection.getText(this.buffer);
  this.registerIsLine = this.selection.isLine;
  var range = this.selection.getRange(this.buffer);
  // Move cursor to start of selection
  this.buffer.setCursor(range.startLine, range.startCol);
  this.selection.clear();
  this.mode = 'normal';
  if (typeof this.onYank === 'function') this.onYank(this.register);
};

/**
 * Indent or unindent the visual selection lines.
 * @param {'>'|'<'} dir
 */
VimStateMachine.prototype._visualIndent = function (dir) {
  var range = this.selection.getRange(this.buffer);
  this.buffer.pushUndo();
  for (var i = range.startLine; i <= range.endLine; i++) {
    if (dir === '>') {
      this.buffer.indentLine(i);
    } else {
      this.buffer.unindentLine(i);
    }
  }
  this.selection.clear();
  this.mode = 'normal';
};

/**
 * Toggle case of all characters in the visual selection.
 */
VimStateMachine.prototype._visualToggleCase = function () {
  var range = this.selection.getRange(this.buffer);
  this.buffer.pushUndo();
  for (var l = range.startLine; l <= range.endLine; l++) {
    var line = this.buffer.lines[l];
    var sc = (l === range.startLine) ? range.startCol : 0;
    var ec = (l === range.endLine) ? range.endCol : line.length - 1;
    var newLine = line.slice(0, sc);
    for (var c = sc; c <= ec && c < line.length; c++) {
      var ch = line[c];
      newLine += ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
    }
    newLine += line.slice(ec + 1);
    this.buffer.lines[l] = newLine;
  }
  this.buffer.setCursor(range.startLine, range.startCol);
  this.selection.clear();
  this.mode = 'normal';
};

// ---------------------------------------------------------------------------
// Main key dispatcher
// ---------------------------------------------------------------------------

/**
 * Process a single keypress.
 *
 * @param {string|null} ch   - Printable character (may be null for special keys)
 * @param {object} key       - Blessed key object: { full, ctrl, meta, shift, name }
 * @returns {{ mode: string, render: boolean, modeChanged: boolean, message: string|null }}
 */
VimStateMachine.prototype.processKey = function (ch, key) {
  var full = (key && key.full) || '';

  // Handle command input mode (: commands) — overrides all other modes
  if (this.commandMode) {
    var cr = this._processCommandKey(ch, key);
    return {
      mode: this.mode,
      render: cr.render,
      modeChanged: false,
      message: cr.message || null,
      command: cr.command || null
    };
  }

  // Handle search input mode first (overrides all other modes)
  if (this.searchMode) {
    var sr = this._processSearchKey(ch, key);
    return {
      mode: this.mode,
      render: sr.render,
      modeChanged: false,
      message: null,
      searchDone: sr.done
    };
  }

  if (this.mode === 'insert') {
    return this._processInsertKey(ch, key, full);
  } else if (this.mode === 'visual' || this.mode === 'visual-line') {
    return this._processVisualKey(ch, key, full);
  } else {
    return this._processNormalKey(ch, key, full);
  }
};

// ---------------------------------------------------------------------------
// Insert mode key handler
// ---------------------------------------------------------------------------

VimStateMachine.prototype._processInsertKey = function (ch, key, full) {
  // Escape or Ctrl+[ — return to Normal
  if (full === 'escape' || full === 'C-[') {
    return this._enterNormal();
  }
  // All other keys (printable chars, backspace, enter, arrows) are handled
  // by editor.js which calls buffer methods directly in insert mode.
  // Return render:false so editor knows to do its own handling.
  return this._result(false, false, null);
};

// ---------------------------------------------------------------------------
// Visual mode key handler
// ---------------------------------------------------------------------------

VimStateMachine.prototype._processVisualKey = function (ch, key, full) {
  var buf = this.buffer;
  var cur = buf.getCursor();
  var isVisualLine = (this.mode === 'visual-line');
  var n = 1; // most visual keys don't use count

  // Escape — return to Normal
  if (full === 'escape' || full === 'C-[') {
    return this._enterNormal();
  }

  // Toggle between v and V
  if (ch === 'v' && !isVisualLine) { return this._enterNormal(); }
  if (ch === 'V' && isVisualLine)  { return this._enterNormal(); }
  if (ch === 'v' && isVisualLine) {
    this.mode = 'visual';
    this.selection.isLine = false;
    return this._result(true, true, null);
  }
  if (ch === 'V' && !isVisualLine) {
    this.mode = 'visual-line';
    this.selection.isLine = true;
    return this._result(true, true, null);
  }

  // Movement keys extend the selection
  var moved = true;
  if      (ch === 'h' || full === 'left')  { buf.moveCursorLeft(); }
  else if (ch === 'j' || full === 'down')  { buf.moveCursorDown(); }
  else if (ch === 'k' || full === 'up')    { buf.moveCursorUp(); }
  else if (ch === 'l' || full === 'right') { buf.moveCursorRight(); }
  else if (ch === 'w') { var wb = buf.getWordBoundary('w'); buf.setCursor(wb.line, wb.col); }
  else if (ch === 'b') { var wb = buf.getWordBoundary('b'); buf.setCursor(wb.line, wb.col); }
  else if (ch === 'e') { var wb = buf.getWordBoundary('e'); buf.setCursor(wb.line, wb.col); }
  else if (ch === '0' || full === 'home') { buf.setCursor(cur.line, 0); }
  else if (ch === '$' || full === 'end')  { buf.setCursor(cur.line, buf.getLine(cur.line).length); }
  else if (ch === '^') { this._moveFirstNonWS(); }
  else if (ch === 'G') { buf.setCursor(buf.getLineCount() - 1, 0); }
  else if (ch === '{') { this._movePrevBlankLine(); }
  else if (ch === '}') { this._moveNextBlankLine(); }
  else { moved = false; }

  if (moved) {
    this._updateVisualSelection();
    return this._result(true, false, null);
  }

  // Operators on selection
  if (ch === 'd' || ch === 'x') {
    this._visualDelete();
    return this._result(true, true, null);
  }
  if (ch === 'y') {
    this._visualYank();
    var msg = this.registerIsLine ? 'line yanked' : 'text yanked';
    return this._result(true, true, msg);
  }
  if (ch === 'c') {
    this._visualDelete();
    this.mode = 'insert';
    return this._result(true, true, null);
  }
  if (ch === '>') {
    this._visualIndent('>');
    return this._result(true, true, null);
  }
  if (ch === '<') {
    this._visualIndent('<');
    return this._result(true, true, null);
  }
  if (ch === '~') {
    this._visualToggleCase();
    return this._result(true, true, null);
  }

  // Unrecognized key in visual — no-op
  return this._result(false, false, null);
};

// ---------------------------------------------------------------------------
// Normal mode key handler
// ---------------------------------------------------------------------------

VimStateMachine.prototype._processNormalKey = function (ch, key, full) {
  var buf = this.buffer;

  // --- Pending operator resolution ---
  if (this.pending !== null) {
    return this._processPendingKey(ch, key, full);
  }

  // --- Numeric prefix ---
  // '0' is "start of line" unless we are already accumulating a count
  if (ch && /^[1-9]$/.test(ch)) {
    this.count += ch;
    return this._result(false, false, null);
  }
  if (ch === '0' && this.count !== '') {
    this.count += '0';
    return this._result(false, false, null);
  }

  var n = this._getCount();

  // --- Mode-change keys ---

  // Enter insert mode
  if (ch === 'i') {
    return this._enterInsert();
  }
  if (ch === 'I') {
    this._moveFirstNonWS();
    return this._enterInsert();
  }
  if (ch === 'a') {
    // Insert AFTER cursor
    var cur = buf.getCursor();
    var lineLen = buf.getLine(cur.line).length;
    if (cur.col < lineLen) buf.setCursor(cur.line, cur.col + 1);
    return this._enterInsert();
  }
  if (ch === 'A') {
    // Insert at end of line
    var cur = buf.getCursor();
    buf.setCursor(cur.line, buf.getLine(cur.line).length);
    return this._enterInsert();
  }
  if (ch === 'o') {
    // Open line below
    var cur = buf.getCursor();
    buf.insertLineBelow(cur.line);
    return this._enterInsert();
  }
  if (ch === 'O') {
    // Open line above
    var cur = buf.getCursor();
    buf.insertLineAbove(cur.line);
    return this._enterInsert();
  }

  // Enter visual modes
  if (ch === 'v') {
    var cur = buf.getCursor();
    this.mode = 'visual';
    this.selection.start(cur.line, cur.col, false);
    return this._result(true, true, null);
  }
  if (ch === 'V') {
    var cur = buf.getCursor();
    this.mode = 'visual-line';
    this.selection.start(cur.line, cur.col, true);
    return this._result(true, true, null);
  }

  // Escape — clear any partial state, stay normal
  if (full === 'escape' || full === 'C-[') {
    this.count = '';
    this._clearPending();
    return this._result(false, false, null);
  }

  // --- Movement ---
  if (ch === 'h' || full === 'left') {
    for (var i = 0; i < n; i++) {
      var cur = buf.getCursor();
      if (cur.col > 0) buf.setCursor(cur.line, cur.col - 1);
    }
    return this._result(true, false, null);
  }
  if (ch === 'l' || full === 'right') {
    for (var i = 0; i < n; i++) {
      var cur = buf.getCursor();
      var lineLen = buf.getLine(cur.line).length;
      // Normal mode: cursor stops at lineLen-1
      if (cur.col < (lineLen > 0 ? lineLen - 1 : 0)) buf.setCursor(cur.line, cur.col + 1);
    }
    return this._result(true, false, null);
  }
  if (ch === 'j' || full === 'down') {
    for (var i = 0; i < n; i++) buf.moveCursorDown();
    this._clampNormalCol();
    return this._result(true, false, null);
  }
  if (ch === 'k' || full === 'up') {
    for (var i = 0; i < n; i++) buf.moveCursorUp();
    this._clampNormalCol();
    return this._result(true, false, null);
  }
  if (ch === '0' || full === 'home') {
    var cur = buf.getCursor();
    buf.setCursor(cur.line, 0);
    return this._result(true, false, null);
  }
  if (ch === '$' || full === 'end') {
    var cur = buf.getCursor();
    var lineLen = buf.getLine(cur.line).length;
    buf.setCursor(cur.line, lineLen > 0 ? lineLen - 1 : 0);
    return this._result(true, false, null);
  }
  if (ch === '^') {
    this._moveFirstNonWS();
    return this._result(true, false, null);
  }
  if (ch === 'G') {
    if (n === 1 && this.count === '') {
      // No count prefix: go to last line
      buf.setCursor(buf.getLineCount() - 1, 0);
    } else {
      // With count: go to line N (1-based)
      var target = Math.max(1, Math.min(n, buf.getLineCount()));
      buf.setCursor(target - 1, 0);
    }
    return this._result(true, false, null);
  }
  if (ch === 'w') {
    for (var i = 0; i < n; i++) {
      var wb = buf.getWordBoundary('w');
      buf.setCursor(wb.line, wb.col);
    }
    return this._result(true, false, null);
  }
  if (ch === 'b') {
    for (var i = 0; i < n; i++) {
      var wb = buf.getWordBoundary('b');
      buf.setCursor(wb.line, wb.col);
    }
    return this._result(true, false, null);
  }
  if (ch === 'e') {
    for (var i = 0; i < n; i++) {
      var wb = buf.getWordBoundary('e');
      buf.setCursor(wb.line, wb.col);
    }
    return this._result(true, false, null);
  }
  if (ch === '{') {
    for (var i = 0; i < n; i++) this._movePrevBlankLine();
    return this._result(true, false, null);
  }
  if (ch === '}') {
    for (var i = 0; i < n; i++) this._moveNextBlankLine();
    return this._result(true, false, null);
  }
  // H / M / L — top/middle/bottom of viewport
  if (ch === 'H') {
    buf.setCursor(this.viewportScrollTop, 0);
    return this._result(true, false, null);
  }
  if (ch === 'M') {
    var mid = this.viewportScrollTop + Math.floor(this.viewportHeight / 2);
    buf.setCursor(Math.min(mid, buf.getLineCount() - 1), 0);
    return this._result(true, false, null);
  }
  if (ch === 'L') {
    var bottom = this.viewportScrollTop + this.viewportHeight - 1;
    buf.setCursor(Math.min(bottom, buf.getLineCount() - 1), 0);
    return this._result(true, false, null);
  }
  // Ctrl+D — half-page down
  if (full === 'C-d') {
    var half = Math.floor(this.viewportHeight / 2);
    for (var i = 0; i < half; i++) buf.moveCursorDown();
    this._clampNormalCol();
    return this._result(true, false, null);
  }
  // Ctrl+U — half-page up
  if (full === 'C-u') {
    var half = Math.floor(this.viewportHeight / 2);
    for (var i = 0; i < half; i++) buf.moveCursorUp();
    this._clampNormalCol();
    return this._result(true, false, null);
  }

  // --- Search navigation ---
  if (ch === '/') {
    this.searchMode = true;
    this.searchQuery = '';
    if (typeof this.onSearchOpen === 'function') this.onSearchOpen();
    return this._result(false, false, null);
  }
  if (ch === 'n') {
    this._searchNext();
    return this._result(true, false, null);
  }
  if (ch === 'N') {
    this._searchPrev();
    return this._result(true, false, null);
  }

  // --- Colon command mode (:w, :wq, :q, :q!) ---
  if (ch === ':') {
    this.commandMode = true;
    this.commandBuffer = '';
    if (typeof this.onCommandOpen === 'function') this.onCommandOpen();
    return this._result(false, false, null);
  }

  // --- Pending operators (two-key sequences) ---
  // NOTE: These operators must save the already-consumed count (n) so that
  // _processPendingKey can use it. We store it in this._pendingCount.
  if (ch === 'd') {
    this._pendingCount = n;
    this._setPending('d');
    return this._result(false, false, null);
  }
  if (ch === 'y') {
    this._pendingCount = n;
    this._setPending('y');
    return this._result(false, false, null);
  }
  if (ch === 'c') {
    this._pendingCount = n;
    this._setPending('c');
    return this._result(false, false, null);
  }
  if (ch === 'g') {
    this._pendingCount = n;
    this._setPending('g');
    return this._result(false, false, null);
  }
  if (ch === 'r') {
    this._pendingCount = n;
    this._setPending('r');
    return this._result(false, false, null);
  }
  if (ch === 'f') {
    this._pendingCount = n;
    this._setPending('f');
    return this._result(false, false, null);
  }
  if (ch === 'F') {
    this._pendingCount = n;
    this._setPending('F');
    return this._result(false, false, null);
  }

  // --- Single-key editing ---
  if (ch === 'x') {
    for (var i = 0; i < n; i++) {
      var cur = buf.getCursor();
      var lineLen = buf.getLine(cur.line).length;
      if (cur.col < lineLen) buf.deleteCharForward();
    }
    this._clampNormalCol();
    return this._result(true, false, null);
  }
  if (ch === 'D') {
    // Delete to end of line
    buf.deleteToEndOfLine();
    this._clampNormalCol();
    return this._result(true, false, null);
  }
  if (ch === 'C') {
    // Change to end of line — delete then enter insert
    buf.deleteToEndOfLine();
    return this._enterInsert();
  }
  if (ch === 'p') {
    for (var i = 0; i < n; i++) this._pasteAfter();
    return this._result(true, false, null);
  }
  if (ch === 'P') {
    for (var i = 0; i < n; i++) this._pasteBefore();
    return this._result(true, false, null);
  }
  if (ch === 'u') {
    buf.undo();
    this._clampNormalCol();
    return this._result(true, false, null);
  }
  if (full === 'C-r') {
    buf.redo();
    this._clampNormalCol();
    return this._result(true, false, null);
  }
  if (ch === 'J') {
    for (var i = 0; i < n; i++) {
      var cur = buf.getCursor();
      buf.joinLines(cur.line);
    }
    return this._result(true, false, null);
  }
  if (ch === '~') {
    for (var i = 0; i < n; i++) {
      buf.toggleCaseAtCursor();
    }
    this._clampNormalCol();
    return this._result(true, false, null);
  }

  // --- Arrow keys in normal mode ---
  if (full === 'up')    { buf.moveCursorUp();    this._clampNormalCol(); return this._result(true, false, null); }
  if (full === 'down')  { buf.moveCursorDown();  this._clampNormalCol(); return this._result(true, false, null); }
  if (full === 'left')  {
    var cur = buf.getCursor();
    if (cur.col > 0) buf.setCursor(cur.line, cur.col - 1);
    return this._result(true, false, null);
  }
  if (full === 'right') {
    var cur = buf.getCursor();
    var lineLen = buf.getLine(cur.line).length;
    if (cur.col < (lineLen > 0 ? lineLen - 1 : 0)) buf.setCursor(cur.line, cur.col + 1);
    return this._result(true, false, null);
  }

  // Unrecognized key — no-op
  return this._result(false, false, null);
};

// ---------------------------------------------------------------------------
// Pending operator resolution
// ---------------------------------------------------------------------------

/**
 * Called when pending !== null and a new key arrives.
 */
VimStateMachine.prototype._processPendingKey = function (ch, key, full) {
  var buf = this.buffer;
  var pending = this.pending;
  this._clearPending();

  // Use the count that was saved when the operator key was pressed.
  // this._pendingCount was stored by _processNormalKey before _setPending().
  var n = (this._pendingCount !== undefined && this._pendingCount > 0)
    ? this._pendingCount
    : 1;
  this._pendingCount = undefined;

  // --- gg: go to first line ---
  if (pending === 'g' && ch === 'g') {
    buf.setCursor(0, 0);
    return this._result(true, false, null);
  }

  // --- dd: delete N lines ---
  if (pending === 'd' && ch === 'd') {
    var msg = this._deleteLines(n);
    this._clampNormalCol();
    return this._result(true, false, msg);
  }

  // --- yy: yank N lines ---
  if (pending === 'y' && ch === 'y') {
    var msg = this._yankLines(n);
    return this._result(false, false, msg);
  }

  // --- cc: change line (delete + enter insert) ---
  if (pending === 'c' && ch === 'c') {
    var cur = buf.getCursor();
    buf.deleteLines(cur.line, 1);
    // insertLineAbove at current position to put the cursor on a blank line
    // Actually: Vim keeps the line but empties it, then enters insert
    buf.pushUndo();
    buf.lines.splice(cur.line, 0, '');
    if (cur.line < buf.lines.length - 1) {
      // We inserted a blank line, remove the now-empty original if needed
    }
    buf.setCursor(cur.line, 0);
    return this._enterInsert();
  }

  // --- r{char}: replace char at cursor ---
  if (pending === 'r' && ch && ch.length === 1) {
    for (var i = 0; i < n; i++) {
      buf.replaceCharAtCursor(ch);
      var cur = buf.getCursor();
      var lineLen = buf.getLine(cur.line).length;
      if (cur.col < lineLen - 1) buf.setCursor(cur.line, cur.col + 1);
    }
    // Move back one (r leaves cursor on replaced char)
    var cur = buf.getCursor();
    if (cur.col > 0) buf.setCursor(cur.line, cur.col - 1);
    this._clampNormalCol();
    return this._result(true, false, null);
  }

  // --- f{char}: find char forward ---
  if (pending === 'f' && ch && ch.length === 1) {
    for (var i = 0; i < n; i++) this._findCharForward(ch);
    return this._result(true, false, null);
  }

  // --- F{char}: find char backward ---
  if (pending === 'F' && ch && ch.length === 1) {
    for (var i = 0; i < n; i++) this._findCharBackward(ch);
    return this._result(true, false, null);
  }

  // --- dw / de / db — delete to word boundary ---
  if (pending === 'd' && (ch === 'w' || ch === 'e' || ch === 'b')) {
    this._operateWordMotion(ch, 'd');
    this._clampNormalCol();
    return this._result(true, false, null);
  }

  // --- cw / ce / cb — change to word boundary (delete + insert) ---
  if (pending === 'c' && (ch === 'w' || ch === 'e' || ch === 'b')) {
    this._operateWordMotion(ch, 'c');
    return this._enterInsert();
  }

  // --- yw / ye — yank to word boundary ---
  if (pending === 'y' && (ch === 'w' || ch === 'e')) {
    var cur = buf.getCursor();
    var target = buf.getWordBoundary(ch);
    var startCol = Math.min(cur.col, target.col);
    var endCol   = Math.max(cur.col, target.col);
    if (cur.line === target.line) {
      this.register = buf.getLine(cur.line).slice(startCol, endCol);
    } else {
      this._operateWordMotion(ch, 'y');
    }
    this.registerIsLine = false;
    if (typeof this.onYank === 'function') this.onYank(this.register);
    return this._result(false, false, '1 text yanked');
  }

  // If no second key matched, the pending op is just cancelled
  // (e.g., user pressed 'd' then 'j' — in real Vim this would do a motion delete,
  //  but we keep it simple and just cancel the pending state)
  return this._result(false, false, null);
};

// ---------------------------------------------------------------------------
// Command-line mode key handler (:w, :wq, :q, :q!)
// ---------------------------------------------------------------------------

/**
 * Process a key in command-line mode (after : was pressed).
 * @param {string|null} ch
 * @param {object} key
 * @returns {{ render: boolean, command: string|null, message: string|null }}
 */
VimStateMachine.prototype._processCommandKey = function (ch, key) {
  var full = (key && key.full) || '';

  if (full === 'escape' || full === 'C-[') {
    this.commandMode = false;
    this.commandBuffer = '';
    if (typeof this.onCommandClose === 'function') this.onCommandClose();
    return { render: false, command: null };
  }

  if (full === 'enter' || full === 'return') {
    var cmd = this.commandBuffer.trim();
    this.commandMode = false;
    this.commandBuffer = '';
    if (typeof this.onCommandClose === 'function') this.onCommandClose();
    if (cmd && typeof this.onCommand === 'function') this.onCommand(cmd);
    return { render: false, command: cmd || null };
  }

  if (full === 'backspace') {
    if (this.commandBuffer.length === 0) {
      this.commandMode = false;
      if (typeof this.onCommandClose === 'function') this.onCommandClose();
      return { render: false, command: null };
    }
    this.commandBuffer = this.commandBuffer.slice(0, -1);
    if (typeof this.onCommandUpdate === 'function') this.onCommandUpdate(this.commandBuffer);
    return { render: false, command: null };
  }

  // Printable character
  if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
    this.commandBuffer += ch;
    if (typeof this.onCommandUpdate === 'function') this.onCommandUpdate(this.commandBuffer);
    return { render: false, command: null };
  }

  return { render: false, command: null };
};

// ---------------------------------------------------------------------------
// Public API for viewport info (called by editor.js before processKey)
// ---------------------------------------------------------------------------

/**
 * Update viewport info used for H/M/L and Ctrl+D/U commands.
 * @param {number} height     - Number of visible lines
 * @param {number} scrollTop  - First visible line index
 */
VimStateMachine.prototype.setViewportInfo = function (height, scrollTop) {
  this.viewportHeight = height;
  this.viewportScrollTop = scrollTop;
};

/**
 * Programmatically set the Vim mode.
 * Used by app.js when switching modes from outside the key handler.
 * @param {'normal'|'insert'|'visual'|'visual-line'} mode
 */
VimStateMachine.prototype.setMode = function (mode) {
  if (mode === 'normal') {
    this._enterNormal();
  } else if (mode === 'insert') {
    this._enterInsert();
  } else {
    this.mode = mode;
  }
};

module.exports = VimStateMachine;
