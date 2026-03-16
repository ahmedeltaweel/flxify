'use strict';

/**
 * TextBuffer — array-of-lines text buffer with cursor management, undo/redo.
 *
 * Internal representation:
 *   this.lines  = ['line 0 text', 'line 1 text', ...]  (always >= 1 element)
 *   this.cursor = { line: 0, col: 0 }                  (0-based)
 *
 * Public API consumed by editor.js:
 *   Mutations (each calls pushUndo first):
 *     insertChar(ch), deleteChar(), deleteCharForward(), newLine()
 *     deleteLine(lineNum), yankLine(lineNum)
 *   Query:
 *     getText(), setText(text), getLineCount(), getLine(n)
 *     getCursor(), setCursor(line, col)
 *   Cursor movement (no undo):
 *     moveCursorUp(), moveCursorDown(), moveCursorLeft(), moveCursorRight()
 *   Undo/redo:
 *     pushUndo(), undo(), redo()
 */
function TextBuffer() {
  this.lines = [''];
  this.cursor = { line: 0, col: 0 };

  // Stacks hold snapshots: { lines: [...], cursor: { line, col } }
  this._undoStack = [];
  this._redoStack = [];

  // Maximum undo history depth
  this._maxUndo = 500;
}

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

/**
 * Create a deep snapshot of the current state.
 * @returns {{ lines: string[], cursor: { line: number, col: number } }}
 */
TextBuffer.prototype._snapshot = function () {
  return {
    lines: this.lines.slice(),
    cursor: { line: this.cursor.line, col: this.cursor.col }
  };
};

/**
 * Push current state onto the undo stack and clear the redo stack.
 * Called before every mutation.
 */
TextBuffer.prototype.pushUndo = function () {
  this._undoStack.push(this._snapshot());
  if (this._undoStack.length > this._maxUndo) {
    this._undoStack.shift();
  }
  // Any new mutation invalidates the redo history
  this._redoStack = [];
};

/**
 * Restore a snapshot onto this buffer.
 * @param {{ lines: string[], cursor: { line: number, col: number } }} snap
 */
TextBuffer.prototype._restore = function (snap) {
  this.lines = snap.lines.slice();
  this.cursor = { line: snap.cursor.line, col: snap.cursor.col };
};

/**
 * Undo the last mutation.
 * @returns {boolean} true if an undo step was available
 */
TextBuffer.prototype.undo = function () {
  if (this._undoStack.length === 0) return false;
  // Push current state to redo before restoring
  this._redoStack.push(this._snapshot());
  var snap = this._undoStack.pop();
  this._restore(snap);
  return true;
};

/**
 * Redo the last undone mutation.
 * @returns {boolean} true if a redo step was available
 */
TextBuffer.prototype.redo = function () {
  if (this._redoStack.length === 0) return false;
  this._undoStack.push(this._snapshot());
  var snap = this._redoStack.pop();
  this._restore(snap);
  return true;
};

// ---------------------------------------------------------------------------
// Cursor bounds utility
// ---------------------------------------------------------------------------

/**
 * Clamp a (line, col) pair to valid buffer bounds.
 * @param {number} line
 * @param {number} col
 * @returns {{ line: number, col: number }}
 */
TextBuffer.prototype._clamp = function (line, col) {
  var maxLine = this.lines.length - 1;
  line = Math.max(0, Math.min(line, maxLine));
  var maxCol = this.lines[line].length;
  col = Math.max(0, Math.min(col, maxCol));
  return { line: line, col: col };
};

// ---------------------------------------------------------------------------
// Query methods
// ---------------------------------------------------------------------------

/** @returns {string} Full document text, lines joined by '\n' */
TextBuffer.prototype.getText = function () {
  return this.lines.join('\n');
};

/** @returns {number} Number of lines in the buffer */
TextBuffer.prototype.getLineCount = function () {
  return this.lines.length;
};

/**
 * @param {number} n - 0-based line index
 * @returns {string} Text of line n, or '' if out of range
 */
TextBuffer.prototype.getLine = function (n) {
  return this.lines[n] !== undefined ? this.lines[n] : '';
};

/** @returns {{ line: number, col: number }} Current cursor position (0-based) */
TextBuffer.prototype.getCursor = function () {
  return { line: this.cursor.line, col: this.cursor.col };
};

// ---------------------------------------------------------------------------
// Mutation methods (each calls pushUndo before modifying state)
// ---------------------------------------------------------------------------

/**
 * Replace the entire buffer content with the given string.
 * Splits on '\n', resets cursor to (0,0). Does NOT push undo (used for init/load).
 * @param {string} text
 */
TextBuffer.prototype.setText = function (text) {
  // Normalise line endings
  this.lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (this.lines.length === 0) this.lines = [''];
  this.cursor = { line: 0, col: 0 };
  this._undoStack = [];
  this._redoStack = [];
};

/**
 * Replace the entire buffer content with the given string, but push an undo
 * snapshot first so the change can be undone (unlike setText which clears undo).
 * Used by applyResult() for 'replaceAll' script actions.
 * @param {string} text
 */
TextBuffer.prototype.setTextUndoable = function (text) {
  this.pushUndo();
  this.lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (this.lines.length === 0) this.lines = [''];
  this.cursor = { line: 0, col: 0 };
  // Intentionally do NOT clear _undoStack or _redoStack
};

/**
 * Set cursor position with clamping.
 * @param {number} line - 0-based
 * @param {number} col  - 0-based
 */
TextBuffer.prototype.setCursor = function (line, col) {
  var clamped = this._clamp(line, col);
  this.cursor.line = clamped.line;
  this.cursor.col = clamped.col;
};

/**
 * Insert a single character at the current cursor position.
 * @param {string} ch
 */
TextBuffer.prototype.insertChar = function (ch) {
  this.pushUndo();
  var l = this.cursor.line;
  var c = this.cursor.col;
  var line = this.lines[l];
  this.lines[l] = line.slice(0, c) + ch + line.slice(c);
  this.cursor.col = c + 1;
};

/**
 * Backspace: delete the character immediately before the cursor.
 * If the cursor is at column 0, join the current line with the previous one.
 */
TextBuffer.prototype.deleteChar = function () {
  this.pushUndo();
  var l = this.cursor.line;
  var c = this.cursor.col;
  if (c > 0) {
    // Delete character to the left
    var line = this.lines[l];
    this.lines[l] = line.slice(0, c - 1) + line.slice(c);
    this.cursor.col = c - 1;
  } else if (l > 0) {
    // Join with previous line
    var prevLen = this.lines[l - 1].length;
    this.lines[l - 1] = this.lines[l - 1] + this.lines[l];
    this.lines.splice(l, 1);
    this.cursor.line = l - 1;
    this.cursor.col = prevLen;
  }
  // If at (0,0) there's nothing to delete — undo was already pushed, no-op
};

/**
 * Delete the character at the cursor position (forward delete / 'x' in Vim).
 * If at end of line, join with the next line.
 */
TextBuffer.prototype.deleteCharForward = function () {
  this.pushUndo();
  var l = this.cursor.line;
  var c = this.cursor.col;
  var line = this.lines[l];
  if (c < line.length) {
    this.lines[l] = line.slice(0, c) + line.slice(c + 1);
  } else if (l < this.lines.length - 1) {
    // Join with next line
    this.lines[l] = this.lines[l] + this.lines[l + 1];
    this.lines.splice(l + 1, 1);
  }
};

/**
 * Split the current line at the cursor and move cursor to the start of the new line.
 */
TextBuffer.prototype.newLine = function () {
  this.pushUndo();
  var l = this.cursor.line;
  var c = this.cursor.col;
  var line = this.lines[l];
  var before = line.slice(0, c);
  var after = line.slice(c);
  this.lines[l] = before;
  this.lines.splice(l + 1, 0, after);
  this.cursor.line = l + 1;
  this.cursor.col = 0;
};

/**
 * Delete an entire line. If it's the only line, replace it with ''.
 * @param {number} lineNum - 0-based index
 * @returns {string} The deleted line text
 */
TextBuffer.prototype.deleteLine = function (lineNum) {
  this.pushUndo();
  var l = Math.max(0, Math.min(lineNum, this.lines.length - 1));
  var deleted = this.lines[l];
  if (this.lines.length === 1) {
    this.lines[0] = '';
  } else {
    this.lines.splice(l, 1);
    // Clamp cursor line after deletion
    if (this.cursor.line >= this.lines.length) {
      this.cursor.line = this.lines.length - 1;
    }
    var maxCol = this.lines[this.cursor.line].length;
    if (this.cursor.col > maxCol) {
      this.cursor.col = maxCol;
    }
  }
  return deleted;
};

/**
 * Return the text of a line without deleting it (for 'yy' yank in Vim later).
 * @param {number} lineNum - 0-based index
 * @returns {string}
 */
TextBuffer.prototype.yankLine = function (lineNum) {
  var l = Math.max(0, Math.min(lineNum, this.lines.length - 1));
  return this.lines[l];
};

/**
 * Delete from the cursor position to the end of the current line.
 * The cursor stays at the same column (clamped to new line length).
 * @returns {string} The deleted text
 */
TextBuffer.prototype.deleteToEndOfLine = function () {
  this.pushUndo();
  var l = this.cursor.line;
  var c = this.cursor.col;
  var line = this.lines[l];
  var deleted = line.slice(c);
  this.lines[l] = line.slice(0, c);
  // Clamp col to new line length (stays at c unless line is now shorter)
  var maxCol = this.lines[l].length;
  if (this.cursor.col > maxCol) this.cursor.col = maxCol;
  return deleted;
};

/**
 * Delete multiple consecutive lines.
 * @param {number} lineNum  - 0-based index of first line to delete
 * @param {number} count    - number of lines to delete (default 1)
 * @returns {string[]} Array of deleted line texts
 */
TextBuffer.prototype.deleteLines = function (lineNum, count) {
  this.pushUndo();
  var l = Math.max(0, Math.min(lineNum, this.lines.length - 1));
  var n = Math.min(count || 1, this.lines.length - l);
  var deleted = this.lines.slice(l, l + n);

  if (this.lines.length <= n) {
    // Deleting all (or more than all) lines — reset to single empty line
    this.lines = [''];
    this.cursor.line = 0;  // clamp cursor — it may have been on a now-gone line
  } else {
    this.lines.splice(l, n);
    // Clamp cursor line
    if (this.cursor.line >= this.lines.length) {
      this.cursor.line = this.lines.length - 1;
    }
  }
  // Clamp cursor col to new line length
  var maxCol = this.lines[this.cursor.line].length;
  if (this.cursor.col > maxCol) this.cursor.col = maxCol;

  return deleted;
};

/**
 * Insert a new empty line below the given line and move cursor to it.
 * @param {number} lineNum - 0-based index of the line below which to insert
 */
TextBuffer.prototype.insertLineBelow = function (lineNum) {
  this.pushUndo();
  var l = Math.max(0, Math.min(lineNum, this.lines.length - 1));
  this.lines.splice(l + 1, 0, '');
  this.cursor.line = l + 1;
  this.cursor.col = 0;
};

/**
 * Insert a new empty line above the given line and move cursor to it.
 * @param {number} lineNum - 0-based index of the line above which to insert
 */
TextBuffer.prototype.insertLineAbove = function (lineNum) {
  this.pushUndo();
  var l = Math.max(0, Math.min(lineNum, this.lines.length - 1));
  this.lines.splice(l, 0, '');
  this.cursor.line = l;
  this.cursor.col = 0;
};

/**
 * Join the current line with the next line (Vim `J` command).
 * Appends a space then the next line's trimmed content.
 * @param {number} lineNum - 0-based index of the current line
 */
TextBuffer.prototype.joinLines = function (lineNum) {
  var l = Math.max(0, Math.min(lineNum, this.lines.length - 1));
  if (l >= this.lines.length - 1) return; // already last line — nothing to join
  this.pushUndo();
  var cur = this.lines[l];
  var next = this.lines[l + 1];
  var joinCol = cur.length;
  // Vim inserts one space between joined lines (or none if next is empty)
  this.lines[l] = cur + (next.length > 0 ? ' ' + next.trimLeft() : '');
  this.lines.splice(l + 1, 1);
  // Place cursor at the join point
  this.cursor.line = l;
  this.cursor.col = joinCol;
};

/**
 * Find word boundary positions for `w`, `b`, `e` motions.
 * direction: 'w' = next word start, 'b' = prev word start, 'e' = word end
 * @param {'w'|'b'|'e'} direction
 * @returns {{ line: number, col: number }} New cursor position
 */
TextBuffer.prototype.getWordBoundary = function (direction) {
  var line = this.cursor.line;
  var col = this.cursor.col;
  var text = this.lines[line];

  if (direction === 'w') {
    // Move to next word start
    // Skip current word chars
    var i = col;
    // If on whitespace, skip it; else skip word, then skip whitespace
    if (i < text.length && /\S/.test(text[i])) {
      // skip word
      while (i < text.length && /\S/.test(text[i])) i++;
    }
    // skip whitespace
    while (i < text.length && /\s/.test(text[i])) i++;

    if (i < text.length) {
      return { line: line, col: i };
    }
    // Move to start of next line
    if (line < this.lines.length - 1) {
      var nextLine = line + 1;
      var ni = 0;
      // skip leading whitespace on next line
      while (ni < this.lines[nextLine].length && /\s/.test(this.lines[nextLine][ni])) ni++;
      return { line: nextLine, col: ni };
    }
    return { line: line, col: text.length > 0 ? text.length - 1 : 0 };

  } else if (direction === 'b') {
    // Move to previous word start
    var i = col;
    if (i > 0) {
      i--; // step back one first
      // skip whitespace backwards
      while (i > 0 && /\s/.test(text[i])) i--;
      // skip word chars backwards
      while (i > 0 && /\S/.test(text[i - 1])) i--;
      return { line: line, col: i };
    }
    // At start of line — go to end of previous line
    if (line > 0) {
      var prevLine = line - 1;
      var pt = this.lines[prevLine];
      var pi = pt.length;
      // skip trailing whitespace
      while (pi > 0 && /\s/.test(pt[pi - 1])) pi--;
      // skip word backwards
      while (pi > 0 && /\S/.test(pt[pi - 1])) pi--;
      return { line: prevLine, col: pi };
    }
    return { line: 0, col: 0 };

  } else if (direction === 'e') {
    // Move to end of current/next word
    var i = col;
    if (i < text.length - 1) {
      i++; // step forward
      // skip whitespace
      while (i < text.length - 1 && /\s/.test(text[i])) i++;
      // skip to end of word
      while (i < text.length - 1 && /\S/.test(text[i + 1])) i++;
      return { line: line, col: i };
    }
    // At end of line — go to first non-ws on next line's word end
    if (line < this.lines.length - 1) {
      var nextLine = line + 1;
      var nt = this.lines[nextLine];
      var ni = 0;
      while (ni < nt.length - 1 && /\s/.test(nt[ni])) ni++;
      while (ni < nt.length - 1 && /\S/.test(nt[ni + 1])) ni++;
      return { line: nextLine, col: ni };
    }
    return { line: line, col: text.length > 0 ? text.length - 1 : 0 };
  }

  return { line: line, col: col };
};

/**
 * Indent a line by inserting two spaces at the start.
 * @param {number} lineNum - 0-based index
 */
TextBuffer.prototype.indentLine = function (lineNum) {
  var l = Math.max(0, Math.min(lineNum, this.lines.length - 1));
  this.lines[l] = '  ' + this.lines[l];
};

/**
 * Unindent a line by removing up to two leading spaces.
 * @param {number} lineNum - 0-based index
 */
TextBuffer.prototype.unindentLine = function (lineNum) {
  var l = Math.max(0, Math.min(lineNum, this.lines.length - 1));
  this.lines[l] = this.lines[l].replace(/^  /, '').replace(/^ /, '');
};

/**
 * Toggle the case of the character at the cursor position.
 * Advances the cursor by one.
 */
TextBuffer.prototype.toggleCaseAtCursor = function () {
  this.pushUndo();
  var l = this.cursor.line;
  var c = this.cursor.col;
  var line = this.lines[l];
  if (c >= line.length) return;
  var ch = line[c];
  var toggled = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
  this.lines[l] = line.slice(0, c) + toggled + line.slice(c + 1);
  // Advance cursor (Vim moves right after ~)
  if (c + 1 <= this.lines[l].length) {
    this.cursor.col = c + 1;
  }
};

/**
 * Replace the character at the cursor with a given character.
 * @param {string} ch - single character
 */
TextBuffer.prototype.replaceCharAtCursor = function (ch) {
  this.pushUndo();
  var l = this.cursor.line;
  var c = this.cursor.col;
  var line = this.lines[l];
  if (c >= line.length) return;
  this.lines[l] = line.slice(0, c) + ch + line.slice(c + 1);
};

/**
 * Delete a range of text from (startLine, startCol) to (endLine, endCol) exclusive.
 * Returns the deleted text. Pushes undo before mutating.
 * @param {number} startLine
 * @param {number} startCol
 * @param {number} endLine
 * @param {number} endCol
 * @returns {string}
 */
TextBuffer.prototype.deleteRange = function (startLine, startCol, endLine, endCol) {
  this.pushUndo();
  if (startLine === endLine) {
    var line = this.lines[startLine];
    var deleted = line.slice(startCol, endCol);
    this.lines[startLine] = line.slice(0, startCol) + line.slice(endCol);
    this.cursor.line = startLine;
    this.cursor.col = startCol;
    return deleted;
  }

  // Multi-line deletion
  var firstPart = this.lines[startLine].slice(0, startCol);
  var lastPart = this.lines[endLine].slice(endCol);
  var deletedLines = [];
  deletedLines.push(this.lines[startLine].slice(startCol));
  for (var i = startLine + 1; i < endLine; i++) {
    deletedLines.push(this.lines[i]);
  }
  deletedLines.push(this.lines[endLine].slice(0, endCol));
  var deletedText = deletedLines.join('\n');

  this.lines.splice(startLine, endLine - startLine + 1, firstPart + lastPart);

  this.cursor.line = startLine;
  this.cursor.col = startCol;
  // Clamp
  if (this.cursor.line >= this.lines.length) this.cursor.line = this.lines.length - 1;
  var maxCol = this.lines[this.cursor.line].length;
  if (this.cursor.col > maxCol) this.cursor.col = maxCol;

  return deletedText;
};

/**
 * Delete N consecutive lines starting at lineNum, store them as an array.
 * Pushes undo. This variant does NOT re-push undo (used when called from Vim
 * after deleteLines is called with existing undo push).
 * Helper for block-delete where caller already called pushUndo.
 * @param {number} lineNum
 * @param {number} count
 * @returns {string[]}
 */
TextBuffer.prototype.deleteLinesRaw = function (lineNum, count) {
  var l = Math.max(0, Math.min(lineNum, this.lines.length - 1));
  var n = Math.min(count || 1, this.lines.length - l);
  var deleted = this.lines.slice(l, l + n);

  if (this.lines.length <= n) {
    this.lines = [''];
    this.cursor.line = 0;  // clamp cursor — same fix as deleteLines
  } else {
    this.lines.splice(l, n);
    if (this.cursor.line >= this.lines.length) {
      this.cursor.line = this.lines.length - 1;
    }
  }
  var maxCol = this.lines[this.cursor.line].length;
  if (this.cursor.col > maxCol) this.cursor.col = maxCol;

  return deleted;
};

// ---------------------------------------------------------------------------
// Cursor movement (no undo — movement is not a mutation of content)
// ---------------------------------------------------------------------------

/** Move cursor up one line, clamping col to the new line's length. */
TextBuffer.prototype.moveCursorUp = function () {
  if (this.cursor.line > 0) {
    this.cursor.line--;
    var maxCol = this.lines[this.cursor.line].length;
    if (this.cursor.col > maxCol) this.cursor.col = maxCol;
  }
};

/** Move cursor down one line, clamping col to the new line's length. */
TextBuffer.prototype.moveCursorDown = function () {
  if (this.cursor.line < this.lines.length - 1) {
    this.cursor.line++;
    var maxCol = this.lines[this.cursor.line].length;
    if (this.cursor.col > maxCol) this.cursor.col = maxCol;
  }
};

/**
 * Move cursor left one character.
 * If at the start of a line (and not line 0), wrap to the end of the previous line.
 */
TextBuffer.prototype.moveCursorLeft = function () {
  if (this.cursor.col > 0) {
    this.cursor.col--;
  } else if (this.cursor.line > 0) {
    this.cursor.line--;
    this.cursor.col = this.lines[this.cursor.line].length;
  }
};

/**
 * Move cursor right one character.
 * If at the end of a line (and not last line), wrap to the start of the next line.
 */
TextBuffer.prototype.moveCursorRight = function () {
  var lineLen = this.lines[this.cursor.line].length;
  if (this.cursor.col < lineLen) {
    this.cursor.col++;
  } else if (this.cursor.line < this.lines.length - 1) {
    this.cursor.line++;
    this.cursor.col = 0;
  }
};

/**
 * Find all occurrences of a search query in the buffer.
 * Case-insensitive plain-text search.
 * @param {string} query  - Search string (non-empty)
 * @returns {Array<{ line: number, col: number }>} Array of match positions
 */
TextBuffer.prototype.findAll = function (query) {
  if (!query || query.length === 0) return [];
  var results = [];
  var lower = query.toLowerCase();
  for (var l = 0; l < this.lines.length; l++) {
    var line = this.lines[l].toLowerCase();
    var startIdx = 0;
    while (true) {
      var idx = line.indexOf(lower, startIdx);
      if (idx === -1) break;
      results.push({ line: l, col: idx });
      startIdx = idx + 1;
    }
  }
  return results;
};

module.exports = TextBuffer;
