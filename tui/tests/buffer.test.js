'use strict';

// TextBuffer unit tests
// Run: cd tui && npm test

var TextBuffer = require('../src/editor/buffer.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeBuffer(text) {
  var b = new TextBuffer();
  if (text !== undefined) b.setText(text);
  return b;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------
describe('TextBuffer — construction', function () {
  it('starts with one empty line', function () {
    var b = new TextBuffer();
    expect(b.getLineCount()).toBe(1);
    expect(b.getLine(0)).toBe('');
    expect(b.getText()).toBe('');
  });

  it('cursor starts at (0,0)', function () {
    var b = new TextBuffer();
    expect(b.getCursor()).toEqual({ line: 0, col: 0 });
  });
});

// ---------------------------------------------------------------------------
// setText / getText
// ---------------------------------------------------------------------------
describe('TextBuffer — setText / getText', function () {
  it('sets multi-line text and returns it', function () {
    var b = makeBuffer('hello\nworld');
    expect(b.getLineCount()).toBe(2);
    expect(b.getLine(0)).toBe('hello');
    expect(b.getLine(1)).toBe('world');
    expect(b.getText()).toBe('hello\nworld');
  });

  it('handles Windows line endings', function () {
    var b = makeBuffer('line1\r\nline2');
    expect(b.getLineCount()).toBe(2);
    expect(b.getLine(0)).toBe('line1');
    expect(b.getLine(1)).toBe('line2');
  });

  it('handles single line with no newline', function () {
    var b = makeBuffer('abc');
    expect(b.getLineCount()).toBe(1);
    expect(b.getText()).toBe('abc');
  });

  it('resets cursor and undo stack on setText', function () {
    var b = makeBuffer('a\nb\nc');
    b.insertChar('x'); // produces undo entry
    b.setText('reset');
    expect(b.getCursor()).toEqual({ line: 0, col: 0 });
    // Undo stack was cleared; undo should return false
    expect(b.undo()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// insertChar
// ---------------------------------------------------------------------------
describe('TextBuffer — insertChar', function () {
  it('inserts a character and advances cursor', function () {
    var b = new TextBuffer();
    b.insertChar('h');
    b.insertChar('i');
    expect(b.getLine(0)).toBe('hi');
    expect(b.getCursor()).toEqual({ line: 0, col: 2 });
  });

  it('inserts in the middle of a line', function () {
    var b = makeBuffer('ac');
    b.setCursor(0, 1);
    b.insertChar('b');
    expect(b.getLine(0)).toBe('abc');
    expect(b.getCursor().col).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// deleteChar (backspace)
// ---------------------------------------------------------------------------
describe('TextBuffer — deleteChar', function () {
  it('deletes the character before the cursor', function () {
    var b = makeBuffer('abc');
    b.setCursor(0, 3);
    b.deleteChar();
    expect(b.getLine(0)).toBe('ab');
    expect(b.getCursor().col).toBe(2);
  });

  it('does nothing at (0,0)', function () {
    var b = new TextBuffer();
    b.deleteChar();
    expect(b.getLine(0)).toBe('');
    expect(b.getCursor()).toEqual({ line: 0, col: 0 });
  });

  it('joins lines when at start of line > 0', function () {
    var b = makeBuffer('hello\nworld');
    b.setCursor(1, 0);
    b.deleteChar();
    expect(b.getLineCount()).toBe(1);
    expect(b.getLine(0)).toBe('helloworld');
    expect(b.getCursor()).toEqual({ line: 0, col: 5 });
  });
});

// ---------------------------------------------------------------------------
// deleteCharForward
// ---------------------------------------------------------------------------
describe('TextBuffer — deleteCharForward', function () {
  it('deletes the character at the cursor', function () {
    var b = makeBuffer('abc');
    b.setCursor(0, 0);
    b.deleteCharForward();
    expect(b.getLine(0)).toBe('bc');
    expect(b.getCursor().col).toBe(0);
  });

  it('joins lines when at end of line (not last)', function () {
    var b = makeBuffer('hello\nworld');
    b.setCursor(0, 5);
    b.deleteCharForward();
    expect(b.getLineCount()).toBe(1);
    expect(b.getLine(0)).toBe('helloworld');
  });

  it('does nothing at end of last line', function () {
    var b = makeBuffer('abc');
    b.setCursor(0, 3);
    b.deleteCharForward();
    expect(b.getLine(0)).toBe('abc');
  });
});

// ---------------------------------------------------------------------------
// newLine
// ---------------------------------------------------------------------------
describe('TextBuffer — newLine', function () {
  it('splits a line at the cursor', function () {
    var b = makeBuffer('hello world');
    b.setCursor(0, 5);
    b.newLine();
    expect(b.getLineCount()).toBe(2);
    expect(b.getLine(0)).toBe('hello');
    expect(b.getLine(1)).toBe(' world');
    expect(b.getCursor()).toEqual({ line: 1, col: 0 });
  });

  it('adds empty line at end', function () {
    var b = makeBuffer('abc');
    b.setCursor(0, 3);
    b.newLine();
    expect(b.getLineCount()).toBe(2);
    expect(b.getLine(1)).toBe('');
  });

  it('adds empty line at beginning', function () {
    var b = makeBuffer('abc');
    b.setCursor(0, 0);
    b.newLine();
    expect(b.getLineCount()).toBe(2);
    expect(b.getLine(0)).toBe('');
    expect(b.getLine(1)).toBe('abc');
  });
});

// ---------------------------------------------------------------------------
// deleteLine
// ---------------------------------------------------------------------------
describe('TextBuffer — deleteLine', function () {
  it('deletes a line and returns its text', function () {
    var b = makeBuffer('a\nb\nc');
    var deleted = b.deleteLine(1);
    expect(deleted).toBe('b');
    expect(b.getLineCount()).toBe(2);
    expect(b.getText()).toBe('a\nc');
  });

  it('replaces content with empty string when only one line remains', function () {
    var b = makeBuffer('only');
    var deleted = b.deleteLine(0);
    expect(deleted).toBe('only');
    expect(b.getLineCount()).toBe(1);
    expect(b.getLine(0)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// yankLine
// ---------------------------------------------------------------------------
describe('TextBuffer — yankLine', function () {
  it('returns line text without deleting it', function () {
    var b = makeBuffer('a\nb\nc');
    var yanked = b.yankLine(1);
    expect(yanked).toBe('b');
    expect(b.getLineCount()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// setCursor / clamping
// ---------------------------------------------------------------------------
describe('TextBuffer — setCursor', function () {
  it('clamps line to valid range', function () {
    var b = makeBuffer('a\nb');
    b.setCursor(999, 0);
    expect(b.getCursor().line).toBe(1);
  });

  it('clamps col to line length', function () {
    var b = makeBuffer('abc');
    b.setCursor(0, 999);
    expect(b.getCursor().col).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Cursor movement
// ---------------------------------------------------------------------------
describe('TextBuffer — cursor movement', function () {
  it('moveCursorUp clamps at line 0', function () {
    var b = makeBuffer('a\nb');
    b.setCursor(0, 0);
    b.moveCursorUp();
    expect(b.getCursor().line).toBe(0);
  });

  it('moveCursorDown clamps at last line', function () {
    var b = makeBuffer('a\nb');
    b.setCursor(1, 0);
    b.moveCursorDown();
    expect(b.getCursor().line).toBe(1);
  });

  it('moveCursorUp adjusts col to line length', function () {
    var b = makeBuffer('hi\nabc');
    b.setCursor(1, 3);
    b.moveCursorUp();
    expect(b.getCursor()).toEqual({ line: 0, col: 2 }); // 'hi' has length 2
  });

  it('moveCursorLeft wraps to end of previous line', function () {
    var b = makeBuffer('hello\nworld');
    b.setCursor(1, 0);
    b.moveCursorLeft();
    expect(b.getCursor()).toEqual({ line: 0, col: 5 });
  });

  it('moveCursorRight wraps to start of next line', function () {
    var b = makeBuffer('hello\nworld');
    b.setCursor(0, 5);
    b.moveCursorRight();
    expect(b.getCursor()).toEqual({ line: 1, col: 0 });
  });

  it('moveCursorLeft does nothing at (0,0)', function () {
    var b = new TextBuffer();
    b.moveCursorLeft();
    expect(b.getCursor()).toEqual({ line: 0, col: 0 });
  });

  it('moveCursorRight does nothing at end of last line', function () {
    var b = makeBuffer('abc');
    b.setCursor(0, 3);
    b.moveCursorRight();
    expect(b.getCursor()).toEqual({ line: 0, col: 3 });
  });
});

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------
describe('TextBuffer — undo / redo', function () {
  it('undo reverts an insertChar', function () {
    var b = new TextBuffer();
    b.insertChar('a');
    b.undo();
    expect(b.getLine(0)).toBe('');
    expect(b.getCursor().col).toBe(0);
  });

  it('redo re-applies after undo', function () {
    var b = new TextBuffer();
    b.insertChar('x');
    b.undo();
    b.redo();
    expect(b.getLine(0)).toBe('x');
  });

  it('new mutation clears redo stack', function () {
    var b = new TextBuffer();
    b.insertChar('a');
    b.undo();
    b.insertChar('b'); // new mutation after undo
    var canRedo = b.redo();
    expect(canRedo).toBe(false);
    expect(b.getLine(0)).toBe('b');
  });

  it('undo returns false when stack is empty', function () {
    var b = new TextBuffer();
    expect(b.undo()).toBe(false);
  });

  it('redo returns false when stack is empty', function () {
    var b = new TextBuffer();
    expect(b.redo()).toBe(false);
  });

  it('supports multiple undo steps', function () {
    var b = new TextBuffer();
    b.insertChar('a');
    b.insertChar('b');
    b.insertChar('c');
    b.undo();
    expect(b.getLine(0)).toBe('ab');
    b.undo();
    expect(b.getLine(0)).toBe('a');
    b.undo();
    expect(b.getLine(0)).toBe('');
  });

  it('undo reverts newLine', function () {
    var b = makeBuffer('hello');
    b.setCursor(0, 5);
    b.newLine();
    expect(b.getLineCount()).toBe(2);
    b.undo();
    expect(b.getLineCount()).toBe(1);
    expect(b.getLine(0)).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// deleteLines — crash fix (Bug 4)
// ---------------------------------------------------------------------------
describe('TextBuffer — deleteLines crash fix', function () {
  it('delete all lines with cursor on non-zero line clamps cursor to 0', function () {
    var b = makeBuffer('a\nb\nc');
    b.setCursor(2, 0); // cursor on line 2 ("c")
    b.deleteLines(0, 3); // delete all 3 lines
    // Should not crash; buffer should be [''], cursor at line 0
    expect(b.getLineCount()).toBe(1);
    expect(b.getLine(0)).toBe('');
    expect(b.getCursor().line).toBe(0);
  });

  it('delete all lines when cursor is on last line — no crash', function () {
    var b = makeBuffer('x\ny');
    b.setCursor(1, 0);
    b.deleteLines(0, 2);
    expect(b.getLineCount()).toBe(1);
    expect(b.getCursor().line).toBe(0);
  });

  it('delete subset of lines does not crash', function () {
    var b = makeBuffer('a\nb\nc');
    b.deleteLines(1, 2); // delete 'b' and 'c'
    expect(b.getLineCount()).toBe(1);
    expect(b.getLine(0)).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// setTextUndoable — Bug 5
// ---------------------------------------------------------------------------
describe('TextBuffer — setTextUndoable', function () {
  it('preserves undo stack', function () {
    var b = new TextBuffer();
    b.insertChar('a');   // undo stack has 1 entry
    var undoDepthBefore = b._undoStack.length;

    b.setTextUndoable('hello');
    // One more entry should be on the undo stack
    expect(b._undoStack.length).toBe(undoDepthBefore + 1);
    expect(b.getText()).toBe('hello');
  });

  it('u after setTextUndoable restores prior content', function () {
    var b = makeBuffer('original');
    b.setTextUndoable('replaced');
    expect(b.getText()).toBe('replaced');
    b.undo();
    expect(b.getText()).toBe('original');
  });

  it('does not clear existing undo history', function () {
    var b = new TextBuffer();
    b.insertChar('x');
    b.insertChar('y');
    b.setTextUndoable('new');
    // Undo setTextUndoable → 'xy', then undo 'y' → 'x'
    b.undo(); // reverts setTextUndoable
    expect(b.getText()).toBe('xy');
    b.undo(); // reverts insertChar('y')
    expect(b.getText()).toBe('x');
  });
});

// ---------------------------------------------------------------------------
// Full round-trip: type and delete text
// ---------------------------------------------------------------------------
describe('TextBuffer — round-trip editing', function () {
  it('type then backspace returns to original', function () {
    var b = makeBuffer('');
    b.insertChar('h');
    b.insertChar('i');
    b.deleteChar();
    b.deleteChar();
    expect(b.getText()).toBe('');
  });

  it('complex multi-line edit', function () {
    var b = new TextBuffer();
    // Type "hello"
    'hello'.split('').forEach(function (c) { b.insertChar(c); });
    // Enter
    b.newLine();
    // Type "world"
    'world'.split('').forEach(function (c) { b.insertChar(c); });
    expect(b.getText()).toBe('hello\nworld');
    expect(b.getCursor()).toEqual({ line: 1, col: 5 });
  });
});
