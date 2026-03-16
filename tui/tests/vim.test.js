'use strict';

// VimStateMachine unit tests
// Run: cd tui && npm test

var TextBuffer = require('../src/editor/buffer.js');
var VimStateMachine = require('../src/editor/vim.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBuffer(text) {
  var b = new TextBuffer();
  if (text !== undefined) b.setText(text);
  return b;
}

/**
 * Create a Vim state machine with an optional initial text.
 * @param {string} [text]
 * @returns {{ vim: VimStateMachine, buf: TextBuffer }}
 */
function makeVim(text) {
  var buf = makeBuffer(text !== undefined ? text : '');
  var vim = new VimStateMachine(buf);
  // Simulate a comfortable viewport
  vim.setViewportInfo(20, 0);
  return { vim: vim, buf: buf };
}

/**
 * Send a printable character key to the vim state machine.
 * @param {VimStateMachine} vim
 * @param {string} ch
 * @returns {object} result
 */
function key(vim, ch) {
  return vim.processKey(ch, { full: ch, ctrl: false, meta: false, shift: false, name: ch });
}

/**
 * Send a special key (e.g., 'escape', 'backspace', 'enter') to vim.
 * @param {VimStateMachine} vim
 * @param {string} full  - key.full value
 * @returns {object} result
 */
function special(vim, full) {
  return vim.processKey(null, { full: full, ctrl: false, meta: false, shift: false, name: full });
}

/**
 * Send a ctrl key (e.g., 'C-r', 'C-d') to vim.
 * @param {VimStateMachine} vim
 * @param {string} full  - key.full like 'C-r'
 * @returns {object} result
 */
function ctrl(vim, full) {
  return vim.processKey(null, { full: full, ctrl: true, meta: false, shift: false, name: full });
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------
describe('VimStateMachine — construction', function () {
  it('starts in normal mode', function () {
    var v = makeVim();
    expect(v.vim.mode).toBe('normal');
  });

  it('starts with empty register', function () {
    var v = makeVim();
    expect(v.vim.register).toBe('');
  });

  it('starts with empty count', function () {
    var v = makeVim();
    expect(v.vim.count).toBe('');
  });

  it('starts with no pending operator', function () {
    var v = makeVim();
    expect(v.vim.pending).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Mode transitions: Normal → Insert
// ---------------------------------------------------------------------------
describe('VimStateMachine — Normal → Insert mode transitions', function () {
  it('i enters insert mode', function () {
    var v = makeVim('hello');
    var r = key(v.vim, 'i');
    expect(r.mode).toBe('insert');
    expect(r.modeChanged).toBe(true);
    expect(v.vim.mode).toBe('insert');
  });

  it('a enters insert mode after cursor', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, 'a');
    expect(v.vim.mode).toBe('insert');
    expect(v.buf.getCursor()).toEqual({ line: 0, col: 1 });
  });

  it('A enters insert mode at end of line', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, 'A');
    expect(v.vim.mode).toBe('insert');
    expect(v.buf.getCursor()).toEqual({ line: 0, col: 5 });
  });

  it('I enters insert mode at first non-whitespace', function () {
    var v = makeVim('  hello');
    v.buf.setCursor(0, 0);
    key(v.vim, 'I');
    expect(v.vim.mode).toBe('insert');
    expect(v.buf.getCursor()).toEqual({ line: 0, col: 2 });
  });

  it('o opens a line below and enters insert mode', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(0, 0);
    key(v.vim, 'o');
    expect(v.vim.mode).toBe('insert');
    expect(v.buf.getLineCount()).toBe(3);
    expect(v.buf.getCursor().line).toBe(1);
    expect(v.buf.getLine(1)).toBe('');
  });

  it('O opens a line above and enters insert mode', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(1, 0);
    key(v.vim, 'O');
    expect(v.vim.mode).toBe('insert');
    expect(v.buf.getLineCount()).toBe(3);
    expect(v.buf.getCursor().line).toBe(1);
    expect(v.buf.getLine(1)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Mode transitions: Insert → Normal
// ---------------------------------------------------------------------------
describe('VimStateMachine — Insert → Normal mode transitions', function () {
  it('Escape returns to normal mode from insert', function () {
    var v = makeVim('hello');
    key(v.vim, 'i');
    expect(v.vim.mode).toBe('insert');
    var r = special(v.vim, 'escape');
    expect(r.mode).toBe('normal');
    expect(r.modeChanged).toBe(true);
    expect(v.vim.mode).toBe('normal');
  });

  it('C-[ returns to normal mode from insert', function () {
    var v = makeVim('hello');
    key(v.vim, 'i');
    var r = ctrl(v.vim, 'C-[');
    expect(r.mode).toBe('normal');
    expect(r.modeChanged).toBe(true);
  });

  it('Escape in normal mode is a no-op (no crash)', function () {
    var v = makeVim('hello');
    var r = special(v.vim, 'escape');
    expect(r.mode).toBe('normal');
    expect(r.modeChanged).toBe(false);
  });

  it('cursor clamps to lineLen-1 on Escape from insert', function () {
    var v = makeVim('hello');
    // Move to end of line in insert mode
    v.buf.setCursor(0, 5); // past last char (col=5 is past 'o' at col=4)
    key(v.vim, 'i');
    // Cursor is at col 5 (after A or programmatic set)
    v.buf.setCursor(0, 5);
    special(v.vim, 'escape');
    // In normal mode, max col is 4 (lineLen-1)
    expect(v.buf.getCursor().col).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Mode transitions: Normal → Visual
// ---------------------------------------------------------------------------
describe('VimStateMachine — Normal → Visual mode transitions', function () {
  it('v enters visual mode', function () {
    var v = makeVim('hello');
    var r = key(v.vim, 'v');
    expect(r.mode).toBe('visual');
    expect(r.modeChanged).toBe(true);
  });

  it('V enters visual-line mode', function () {
    var v = makeVim('hello');
    var r = key(v.vim, 'V');
    expect(r.mode).toBe('visual-line');
    expect(r.modeChanged).toBe(true);
  });

  it('v in visual mode exits back to normal', function () {
    var v = makeVim('hello');
    key(v.vim, 'v');
    var r = key(v.vim, 'v');
    expect(r.mode).toBe('normal');
    expect(r.modeChanged).toBe(true);
  });

  it('V in visual-line mode exits back to normal', function () {
    var v = makeVim('hello');
    key(v.vim, 'V');
    var r = key(v.vim, 'V');
    expect(r.mode).toBe('normal');
  });

  it('Escape exits visual mode', function () {
    var v = makeVim('hello');
    key(v.vim, 'v');
    var r = special(v.vim, 'escape');
    expect(r.mode).toBe('normal');
    expect(r.modeChanged).toBe(true);
  });

  it('selection starts at cursor position', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 2);
    key(v.vim, 'v');
    expect(v.vim.selection.anchor).toEqual({ line: 0, col: 2 });
    expect(v.vim.selection.isLine).toBe(false);
  });

  it('V selection has isLine = true', function () {
    var v = makeVim('hello');
    key(v.vim, 'V');
    expect(v.vim.selection.isLine).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Normal mode: h j k l movement
// ---------------------------------------------------------------------------
describe('VimStateMachine — hjkl movement', function () {
  it('l moves right', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, 'l');
    expect(v.buf.getCursor().col).toBe(1);
  });

  it('h moves left', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 3);
    key(v.vim, 'h');
    expect(v.buf.getCursor().col).toBe(2);
  });

  it('j moves down', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(0, 0);
    key(v.vim, 'j');
    expect(v.buf.getCursor().line).toBe(1);
  });

  it('k moves up', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(1, 0);
    key(v.vim, 'k');
    expect(v.buf.getCursor().line).toBe(0);
  });

  it('h does not go past col 0', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, 'h');
    expect(v.buf.getCursor().col).toBe(0);
  });

  it('l does not go past last char in normal mode', function () {
    var v = makeVim('abc');
    v.buf.setCursor(0, 2); // 'c' is at col 2 (last char, line len=3)
    key(v.vim, 'l');
    // Normal mode: max col = lineLen - 1 = 2
    expect(v.buf.getCursor().col).toBe(2);
  });

  it('j clamps col to new line length', function () {
    var v = makeVim('hello\nhi');
    v.buf.setCursor(0, 4); // on 'o'
    key(v.vim, 'j');
    expect(v.buf.getCursor().line).toBe(1);
    // 'hi' has length 2, so col clamps to 1 (last char)
    expect(v.buf.getCursor().col).toBeLessThanOrEqual(1);
  });

  it('j does not go past last line', function () {
    var v = makeVim('only');
    key(v.vim, 'j');
    expect(v.buf.getCursor().line).toBe(0);
  });

  it('k does not go above line 0', function () {
    var v = makeVim('only');
    key(v.vim, 'k');
    expect(v.buf.getCursor().line).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Normal mode: count prefix
// ---------------------------------------------------------------------------
describe('VimStateMachine — numeric count prefix', function () {
  it('5j moves 5 lines down', function () {
    var v = makeVim('a\nb\nc\nd\ne\nf');
    v.buf.setCursor(0, 0);
    key(v.vim, '5');
    key(v.vim, 'j');
    expect(v.buf.getCursor().line).toBe(5);
  });

  it('3l moves 3 chars right', function () {
    var v = makeVim('hello world');
    v.buf.setCursor(0, 0);
    key(v.vim, '3');
    key(v.vim, 'l');
    expect(v.buf.getCursor().col).toBe(3);
  });

  it('count is cleared after use', function () {
    var v = makeVim('hello\nworld\nfoo');
    v.buf.setCursor(0, 0);
    key(v.vim, '2');
    key(v.vim, 'j');
    expect(v.vim.count).toBe('');
  });

  it('10G goes to line 10 (1-based)', function () {
    // Build a 15-line buffer
    var lines = [];
    for (var i = 0; i < 15; i++) lines.push('line' + i);
    var v = makeVim(lines.join('\n'));
    key(v.vim, '1');
    key(v.vim, '0');
    key(v.vim, 'G');
    expect(v.buf.getCursor().line).toBe(9); // 0-based
  });

  it('G without count goes to last line', function () {
    var v = makeVim('a\nb\nc');
    key(v.vim, 'G');
    expect(v.buf.getCursor().line).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Normal mode: line movement keys
// ---------------------------------------------------------------------------
describe('VimStateMachine — line movement', function () {
  it('0 goes to start of line', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 4);
    key(v.vim, '0');
    expect(v.buf.getCursor().col).toBe(0);
  });

  it('$ goes to last char of line', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, '$');
    // Normal mode: $ stops at lineLen-1
    expect(v.buf.getCursor().col).toBe(4);
  });

  it('^ goes to first non-whitespace', function () {
    var v = makeVim('   hello');
    v.buf.setCursor(0, 7);
    key(v.vim, '^');
    expect(v.buf.getCursor().col).toBe(3);
  });

  it('gg goes to line 0', function () {
    var v = makeVim('a\nb\nc');
    v.buf.setCursor(2, 0);
    key(v.vim, 'g');
    key(v.vim, 'g');
    expect(v.buf.getCursor().line).toBe(0);
  });

  it('G goes to last line', function () {
    var v = makeVim('a\nb\nc\nd');
    key(v.vim, 'G');
    expect(v.buf.getCursor().line).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Normal mode: word movements (w, b, e)
// ---------------------------------------------------------------------------
describe('VimStateMachine — word movements', function () {
  it('w moves to next word start', function () {
    var v = makeVim('hello world');
    v.buf.setCursor(0, 0);
    key(v.vim, 'w');
    expect(v.buf.getCursor().col).toBe(6);
  });

  it('b moves to previous word start', function () {
    var v = makeVim('hello world');
    v.buf.setCursor(0, 8);
    key(v.vim, 'b');
    // Should be at col 6 (start of 'world')
    expect(v.buf.getCursor().col).toBe(6);
  });

  it('e moves to end of word', function () {
    var v = makeVim('hello world');
    v.buf.setCursor(0, 0);
    key(v.vim, 'e');
    // 'hello' ends at col 4
    expect(v.buf.getCursor().col).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Normal mode: paragraph movement ({ and })
// ---------------------------------------------------------------------------
describe('VimStateMachine — paragraph movement', function () {
  it('} moves to next blank line', function () {
    var v = makeVim('hello\n\nworld');
    v.buf.setCursor(0, 0);
    key(v.vim, '}');
    expect(v.buf.getCursor().line).toBe(1);
  });

  it('{ moves to previous blank line', function () {
    var v = makeVim('hello\n\nworld');
    v.buf.setCursor(2, 0);
    key(v.vim, '{');
    expect(v.buf.getCursor().line).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Normal mode: editing commands
// ---------------------------------------------------------------------------
describe('VimStateMachine — x (delete char)', function () {
  it('x deletes char at cursor', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 1); // on 'e'
    key(v.vim, 'x');
    expect(v.buf.getLine(0)).toBe('hllo');
  });

  it('x does nothing at empty line', function () {
    var v = makeVim('');
    key(v.vim, 'x');
    expect(v.buf.getLine(0)).toBe('');
  });

  it('3x deletes 3 chars', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, '3');
    key(v.vim, 'x');
    expect(v.buf.getLine(0)).toBe('lo');
  });
});

describe('VimStateMachine — dd (delete line)', function () {
  it('dd deletes current line', function () {
    var v = makeVim('hello\nworld\nfoo');
    v.buf.setCursor(1, 0); // on 'world'
    key(v.vim, 'd');
    key(v.vim, 'd');
    expect(v.buf.getLineCount()).toBe(2);
    expect(v.buf.getLine(0)).toBe('hello');
    expect(v.buf.getLine(1)).toBe('foo');
  });

  it('dd stores deleted line in register', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(0, 0);
    key(v.vim, 'd');
    key(v.vim, 'd');
    expect(v.vim.register).toBe('hello');
    expect(v.vim.registerIsLine).toBe(true);
  });

  it('2dd deletes 2 lines', function () {
    var v = makeVim('a\nb\nc\nd');
    v.buf.setCursor(0, 0);
    key(v.vim, '2');
    key(v.vim, 'd');
    key(v.vim, 'd');
    expect(v.buf.getLineCount()).toBe(2);
    expect(v.buf.getLine(0)).toBe('c');
  });

  it('2dd stores correct lines in register (not same line twice)', function () {
    var v = makeVim('a\nb\nc');
    v.buf.setCursor(0, 0);
    key(v.vim, '2');
    key(v.vim, 'd');
    key(v.vim, 'd');
    expect(v.vim.register).toBe('a\nb');
  });

  it('dd on last line leaves empty buffer', function () {
    var v = makeVim('only');
    key(v.vim, 'd');
    key(v.vim, 'd');
    expect(v.buf.getLineCount()).toBe(1);
    expect(v.buf.getLine(0)).toBe('');
  });

  it('dd result message indicates lines deleted', function () {
    var v = makeVim('hello');
    key(v.vim, 'd');
    var r = key(v.vim, 'd');
    expect(r.message).toMatch(/line/);
  });
});

describe('VimStateMachine — D (delete to end of line)', function () {
  it('D deletes from cursor to end of line', function () {
    var v = makeVim('hello world');
    v.buf.setCursor(0, 5);
    key(v.vim, 'D');
    expect(v.buf.getLine(0)).toBe('hello');
  });

  it('D stays in normal mode', function () {
    var v = makeVim('hello');
    key(v.vim, 'D');
    expect(v.vim.mode).toBe('normal');
  });
});

describe('VimStateMachine — yy (yank line)', function () {
  it('yy yanks the current line', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(0, 0);
    key(v.vim, 'y');
    key(v.vim, 'y');
    expect(v.vim.register).toBe('hello');
    expect(v.vim.registerIsLine).toBe(true);
  });

  it('yy does not change buffer', function () {
    var v = makeVim('hello\nworld');
    key(v.vim, 'y');
    key(v.vim, 'y');
    expect(v.buf.getLineCount()).toBe(2);
    expect(v.buf.getText()).toBe('hello\nworld');
  });

  it('2yy yanks 2 lines', function () {
    var v = makeVim('a\nb\nc');
    v.buf.setCursor(0, 0);
    key(v.vim, '2');
    key(v.vim, 'y');
    key(v.vim, 'y');
    expect(v.vim.register).toBe('a\nb');
  });

  it('yy result message indicates lines yanked', function () {
    var v = makeVim('hello');
    key(v.vim, 'y');
    var r = key(v.vim, 'y');
    expect(r.message).toMatch(/line/);
  });
});

describe('VimStateMachine — p / P (paste)', function () {
  it('p pastes line register below current line', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(0, 0);
    key(v.vim, 'y');
    key(v.vim, 'y'); // yank 'hello'
    v.buf.setCursor(1, 0);
    key(v.vim, 'p');
    expect(v.buf.getLineCount()).toBe(3);
    expect(v.buf.getLine(2)).toBe('hello');
  });

  it('P pastes line register above current line', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(0, 0);
    key(v.vim, 'y');
    key(v.vim, 'y'); // yank 'hello'
    v.buf.setCursor(1, 0);
    key(v.vim, 'P');
    expect(v.buf.getLineCount()).toBe(3);
    expect(v.buf.getLine(1)).toBe('hello');
    expect(v.buf.getLine(2)).toBe('world');
  });

  it('p char-wise paste leaves cursor on last pasted char', function () {
    var v = makeVim('hello');
    v.vim.register = 'foo';
    v.vim.registerIsLine = false;
    v.buf.setCursor(0, 0); // cursor on 'h'
    key(v.vim, 'p');
    expect(v.buf.getLine(0)).toBe('hfooello');
    expect(v.buf.getCursor().col).toBe(3);
  });

  it('p char-wise paste on empty line leaves cursor on last pasted char', function () {
    var v = makeVim('');
    v.vim.register = 'abc';
    v.vim.registerIsLine = false;
    key(v.vim, 'p');
    expect(v.buf.getLine(0)).toBe('abc');
    expect(v.buf.getCursor().col).toBe(2);
  });

  it('P char-wise paste inserts before cursor and positions cursor on last pasted char', function () {
    var v = makeVim('hello');
    v.vim.register = 'foo';
    v.vim.registerIsLine = false;
    v.buf.setCursor(0, 2); // cursor on second 'l'
    key(v.vim, 'P');
    expect(v.buf.getLine(0)).toBe('hefoollo');
    expect(v.buf.getCursor().col).toBe(4);
  });

  it('p multi-line char-wise paste splits into new lines', function () {
    var v = makeVim('hello\nworld');
    v.vim.register = 'abc\ndef';
    v.vim.registerIsLine = false;
    v.buf.setCursor(0, 2); // cursor on 'l'
    key(v.vim, 'p');
    expect(v.buf.getLineCount()).toBe(3);
    expect(v.buf.getLine(0)).toBe('helabc');
    expect(v.buf.getLine(1)).toBe('deflo');
    expect(v.buf.getLine(2)).toBe('world');
  });

  it('2dd then p restores correct lines', function () {
    var v = makeVim('a\nb\nc');
    v.buf.setCursor(0, 0);
    key(v.vim, '2');
    key(v.vim, 'd');
    key(v.vim, 'd');
    key(v.vim, 'p');
    expect(v.buf.getLine(0)).toBe('c');
    expect(v.buf.getLine(1)).toBe('a');
    expect(v.buf.getLine(2)).toBe('b');
  });
});

describe('VimStateMachine — u / Ctrl+R (undo / redo)', function () {
  it('u undoes the last edit', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, 'd');
    key(v.vim, 'd');
    expect(v.buf.getLine(0)).toBe('');
    key(v.vim, 'u');
    expect(v.buf.getLine(0)).toBe('hello');
  });

  it('Ctrl+R redoes after undo', function () {
    var v = makeVim('hello');
    key(v.vim, 'd');
    key(v.vim, 'd');
    key(v.vim, 'u');
    ctrl(v.vim, 'C-r');
    expect(v.buf.getLine(0)).toBe('');
  });
});

describe('VimStateMachine — J (join lines)', function () {
  it('J joins current line with next', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(0, 0);
    key(v.vim, 'J');
    expect(v.buf.getLineCount()).toBe(1);
    expect(v.buf.getLine(0)).toBe('hello world');
  });

  it('J does nothing on last line', function () {
    var v = makeVim('only');
    key(v.vim, 'J');
    expect(v.buf.getLineCount()).toBe(1);
  });
});

describe('VimStateMachine — ~ (toggle case)', function () {
  it('~ toggles case of char at cursor', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0); // on 'h'
    key(v.vim, '~');
    expect(v.buf.getLine(0)[0]).toBe('H');
  });

  it('~ advances cursor', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, '~');
    expect(v.buf.getCursor().col).toBe(1);
  });
});

describe('VimStateMachine — r{char} (replace char)', function () {
  it('r replaces char at cursor', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, 'r');
    key(v.vim, 'X');
    expect(v.buf.getLine(0)[0]).toBe('X');
  });

  it('r stays in normal mode', function () {
    var v = makeVim('hello');
    key(v.vim, 'r');
    key(v.vim, 'x');
    expect(v.vim.mode).toBe('normal');
  });
});

describe('VimStateMachine — f / F (find char)', function () {
  it('f finds char forward on current line', function () {
    var v = makeVim('hello world');
    v.buf.setCursor(0, 0);
    key(v.vim, 'f');
    key(v.vim, 'o');
    expect(v.buf.getCursor().col).toBe(4); // first 'o' in 'hello'
  });

  it('F finds char backward on current line', function () {
    var v = makeVim('hello world');
    // cursor at col 10 ('d'), searching backward for 'o' finds col 7 ('o' in 'world')
    v.buf.setCursor(0, 10);
    key(v.vim, 'F');
    key(v.vim, 'o');
    expect(v.buf.getCursor().col).toBe(7);
  });

  it('f does not move if char not found', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, 'f');
    key(v.vim, 'z');
    expect(v.buf.getCursor().col).toBe(0);
  });
});

describe('VimStateMachine — C (change to end of line)', function () {
  it('C deletes to end and enters insert mode', function () {
    var v = makeVim('hello world');
    v.buf.setCursor(0, 5);
    key(v.vim, 'C');
    expect(v.vim.mode).toBe('insert');
    expect(v.buf.getLine(0)).toBe('hello');
  });
});

describe('VimStateMachine — cc (change line)', function () {
  it('cc enters insert mode with blank line', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(0, 0);
    key(v.vim, 'c');
    key(v.vim, 'c');
    expect(v.vim.mode).toBe('insert');
    expect(v.buf.getLine(v.buf.getCursor().line)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// H / M / L viewport movement
// ---------------------------------------------------------------------------
describe('VimStateMachine — H / M / L viewport movement', function () {
  it('H moves cursor to top of viewport', function () {
    var lines = [];
    for (var i = 0; i < 30; i++) lines.push('line' + i);
    var v = makeVim(lines.join('\n'));
    v.vim.setViewportInfo(20, 5);
    v.buf.setCursor(20, 0);
    key(v.vim, 'H');
    expect(v.buf.getCursor().line).toBe(5);
  });

  it('M moves cursor to middle of viewport', function () {
    var lines = [];
    for (var i = 0; i < 30; i++) lines.push('line' + i);
    var v = makeVim(lines.join('\n'));
    v.vim.setViewportInfo(20, 0);
    v.buf.setCursor(0, 0);
    key(v.vim, 'M');
    expect(v.buf.getCursor().line).toBe(10);
  });

  it('L moves cursor to bottom of viewport', function () {
    var lines = [];
    for (var i = 0; i < 30; i++) lines.push('line' + i);
    var v = makeVim(lines.join('\n'));
    v.vim.setViewportInfo(20, 0);
    v.buf.setCursor(0, 0);
    key(v.vim, 'L');
    expect(v.buf.getCursor().line).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// Ctrl+D / Ctrl+U half-page movement
// ---------------------------------------------------------------------------
describe('VimStateMachine — Ctrl+D / Ctrl+U half-page', function () {
  it('Ctrl+D moves down half-viewport', function () {
    var lines = [];
    for (var i = 0; i < 40; i++) lines.push('l' + i);
    var v = makeVim(lines.join('\n'));
    v.vim.setViewportInfo(20, 0);
    v.buf.setCursor(0, 0);
    ctrl(v.vim, 'C-d');
    expect(v.buf.getCursor().line).toBe(10);
  });

  it('Ctrl+U moves up half-viewport', function () {
    var lines = [];
    for (var i = 0; i < 40; i++) lines.push('l' + i);
    var v = makeVim(lines.join('\n'));
    v.vim.setViewportInfo(20, 0);
    v.buf.setCursor(20, 0);
    ctrl(v.vim, 'C-u');
    expect(v.buf.getCursor().line).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Visual mode: selection and operations
// ---------------------------------------------------------------------------
describe('VimStateMachine — Visual mode selection', function () {
  it('visual mode extends selection with l', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, 'v');
    key(v.vim, 'l');
    expect(v.vim.selection.active).toEqual({ line: 0, col: 1 });
  });

  it('visual mode extends selection with j', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(0, 0);
    key(v.vim, 'v');
    key(v.vim, 'j');
    expect(v.vim.selection.active.line).toBe(1);
  });

  it('v d deletes visual selection', function () {
    var v = makeVim('hello world');
    v.buf.setCursor(0, 0);
    key(v.vim, 'v');
    key(v.vim, 'l'); // select 'he'
    key(v.vim, 'l'); // select 'hel'
    key(v.vim, 'l'); // select 'hell'
    key(v.vim, 'd');
    expect(v.vim.mode).toBe('normal');
    // 'hello world' -> delete 'hell' (cols 0-3) -> 'o world'
    expect(v.buf.getLine(0)).toBe('o world');
  });

  it('v y yanks visual selection', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, 'v');
    key(v.vim, 'l'); // select 'he'
    var r = key(v.vim, 'y');
    expect(v.vim.mode).toBe('normal');
    expect(v.vim.register).toBe('he');
    expect(r.message).toBeTruthy();
  });

  it('V d deletes entire lines', function () {
    var v = makeVim('hello\nworld\nfoo');
    v.buf.setCursor(0, 0);
    key(v.vim, 'V');
    key(v.vim, 'j'); // extend to line 1
    key(v.vim, 'd');
    expect(v.vim.mode).toBe('normal');
    expect(v.buf.getLineCount()).toBe(1);
    expect(v.buf.getLine(0)).toBe('foo');
  });

  it('v > indents selected lines', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(0, 0);
    key(v.vim, 'V');
    key(v.vim, 'j');
    key(v.vim, '>');
    expect(v.vim.mode).toBe('normal');
    expect(v.buf.getLine(0)).toBe('  hello');
    expect(v.buf.getLine(1)).toBe('  world');
  });

  it('v < unindents selected lines', function () {
    var v = makeVim('  hello\n  world');
    v.buf.setCursor(0, 0);
    key(v.vim, 'V');
    key(v.vim, 'j');
    key(v.vim, '<');
    expect(v.buf.getLine(0)).toBe('hello');
    expect(v.buf.getLine(1)).toBe('world');
  });

  it('v ~ toggles case of selection', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, 'v');
    key(v.vim, 'l'); // select 'he'
    key(v.vim, '~');
    expect(v.vim.mode).toBe('normal');
    expect(v.buf.getLine(0).slice(0, 2)).toBe('HE');
  });

  it('v c deletes selection and enters insert mode', function () {
    var v = makeVim('hello');
    v.buf.setCursor(0, 0);
    key(v.vim, 'v');
    key(v.vim, 'l');
    key(v.vim, 'c');
    expect(v.vim.mode).toBe('insert');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('VimStateMachine — edge cases', function () {
  it('handles empty buffer without crashing (dd)', function () {
    var v = makeVim('');
    key(v.vim, 'd');
    key(v.vim, 'd');
    expect(v.buf.getLineCount()).toBe(1);
    expect(v.buf.getLine(0)).toBe('');
  });

  it('handles empty buffer without crashing (x)', function () {
    var v = makeVim('');
    key(v.vim, 'x');
    expect(v.buf.getLine(0)).toBe('');
  });

  it('handles empty buffer without crashing (yy)', function () {
    var v = makeVim('');
    key(v.vim, 'y');
    key(v.vim, 'y');
    expect(v.vim.register).toBe('');
  });

  it('handles single-char line without crashing (l)', function () {
    var v = makeVim('a');
    v.buf.setCursor(0, 0);
    key(v.vim, 'l');
    expect(v.buf.getCursor().col).toBe(0); // can't go right
  });

  it('gg on first line is a no-op', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(0, 2);
    key(v.vim, 'g');
    key(v.vim, 'g');
    expect(v.buf.getCursor().line).toBe(0);
    expect(v.buf.getCursor().col).toBe(0);
  });

  it('G on last line stays at last line', function () {
    var v = makeVim('a\nb');
    v.buf.setCursor(1, 0);
    key(v.vim, 'G');
    expect(v.buf.getCursor().line).toBe(1);
  });

  it('pending d is cancelled by unknown key', function () {
    var v = makeVim('hello');
    key(v.vim, 'd');
    key(v.vim, 'x'); // 'x' doesn't complete 'd' as operator
    expect(v.vim.pending).toBeNull();
    // Buffer unchanged
    expect(v.buf.getLine(0)).toBe('hello');
  });

  it('count followed by G with multi-digit works (10G)', function () {
    var lines = [];
    for (var i = 0; i < 15; i++) lines.push('L' + (i + 1));
    var v = makeVim(lines.join('\n'));
    key(v.vim, '1');
    key(v.vim, '0');
    key(v.vim, 'G');
    expect(v.buf.getCursor().line).toBe(9);
  });

  it('insert mode keys do not crash vim.processKey', function () {
    var v = makeVim('hello');
    key(v.vim, 'i'); // enter insert
    var r = key(v.vim, 'a'); // printable in insert — vim returns render:false
    expect(r.render).toBe(false);
    expect(v.vim.mode).toBe('insert');
  });
});

// ---------------------------------------------------------------------------
// Selection class tests
// ---------------------------------------------------------------------------
describe('Selection — basic operations', function () {
  var Selection = require('../src/editor/selection.js');

  it('starts inactive', function () {
    var s = new Selection();
    expect(s.isActive()).toBe(false);
  });

  it('is active after start()', function () {
    var s = new Selection();
    s.start(0, 0, false);
    expect(s.isActive()).toBe(true);
  });

  it('getRange normalizes anchor > active', function () {
    var s = new Selection();
    s.start(2, 5, false);
    s.updateActive(0, 2);
    var range = s.getRange(null);
    expect(range.startLine).toBe(0);
    expect(range.endLine).toBe(2);
  });

  it('getText extracts single-line selection', function () {
    var buf = makeBuffer('hello world');
    var s = new Selection();
    s.start(0, 6, false);
    s.updateActive(0, 10);
    expect(s.getText(buf)).toBe('world');
  });

  it('getText extracts multi-line selection', function () {
    var buf = makeBuffer('hello\nworld');
    var s = new Selection();
    s.start(0, 3, false);
    s.updateActive(1, 2);
    var text = s.getText(buf);
    expect(text).toContain('lo');
    expect(text).toContain('wor');
  });

  it('getSelectedLines returns all selected lines for line-wise', function () {
    var buf = makeBuffer('a\nb\nc');
    var s = new Selection();
    s.start(0, 0, true);
    s.updateActive(1, 0);
    var lines = s.getSelectedLines(buf);
    expect(lines).toEqual(['a', 'b']);
  });

  it('clear resets to inactive', function () {
    var s = new Selection();
    s.start(0, 0, false);
    s.clear();
    expect(s.isActive()).toBe(false);
    expect(s.anchor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Buffer extension tests
// ---------------------------------------------------------------------------
describe('TextBuffer — new Vim methods', function () {
  it('deleteToEndOfLine removes text from cursor to end', function () {
    var b = makeBuffer('hello world');
    b.setCursor(0, 5);
    var deleted = b.deleteToEndOfLine();
    expect(b.getLine(0)).toBe('hello');
    expect(deleted).toBe(' world');
  });

  it('deleteToEndOfLine at end of line is a no-op', function () {
    var b = makeBuffer('hello');
    b.setCursor(0, 5);
    b.deleteToEndOfLine();
    expect(b.getLine(0)).toBe('hello');
  });

  it('deleteLines removes N lines', function () {
    var b = makeBuffer('a\nb\nc\nd');
    b.setCursor(1, 0);
    b.deleteLines(1, 2);
    expect(b.getText()).toBe('a\nd');
  });

  it('insertLineBelow inserts empty line below', function () {
    var b = makeBuffer('hello\nworld');
    b.insertLineBelow(0);
    expect(b.getLineCount()).toBe(3);
    expect(b.getLine(1)).toBe('');
    expect(b.getCursor().line).toBe(1);
  });

  it('insertLineAbove inserts empty line above', function () {
    var b = makeBuffer('hello\nworld');
    b.insertLineAbove(1);
    expect(b.getLineCount()).toBe(3);
    expect(b.getLine(1)).toBe('');
    expect(b.getCursor().line).toBe(1);
  });

  it('joinLines joins with space', function () {
    var b = makeBuffer('hello\nworld');
    b.joinLines(0);
    expect(b.getLineCount()).toBe(1);
    expect(b.getLine(0)).toBe('hello world');
  });

  it('joinLines does nothing on last line', function () {
    var b = makeBuffer('only');
    b.joinLines(0);
    expect(b.getLineCount()).toBe(1);
  });

  it('getWordBoundary w goes to next word start', function () {
    var b = makeBuffer('hello world');
    b.setCursor(0, 0);
    var pos = b.getWordBoundary('w');
    expect(pos.col).toBe(6);
  });

  it('getWordBoundary b goes to previous word start', function () {
    var b = makeBuffer('hello world');
    b.setCursor(0, 8);
    var pos = b.getWordBoundary('b');
    expect(pos.col).toBe(6);
  });

  it('getWordBoundary e goes to word end', function () {
    var b = makeBuffer('hello world');
    b.setCursor(0, 0);
    var pos = b.getWordBoundary('e');
    expect(pos.col).toBe(4);
  });

  it('indentLine adds 2 spaces at start', function () {
    var b = makeBuffer('hello');
    b.indentLine(0);
    expect(b.getLine(0)).toBe('  hello');
  });

  it('unindentLine removes up to 2 leading spaces', function () {
    var b = makeBuffer('  hello');
    b.unindentLine(0);
    expect(b.getLine(0)).toBe('hello');
  });

  it('toggleCaseAtCursor toggles lower to upper', function () {
    var b = makeBuffer('hello');
    b.setCursor(0, 0);
    b.toggleCaseAtCursor();
    expect(b.getLine(0)[0]).toBe('H');
  });

  it('toggleCaseAtCursor advances cursor', function () {
    var b = makeBuffer('hello');
    b.setCursor(0, 0);
    b.toggleCaseAtCursor();
    expect(b.getCursor().col).toBe(1);
  });

  it('replaceCharAtCursor replaces one char', function () {
    var b = makeBuffer('hello');
    b.setCursor(0, 0);
    b.replaceCharAtCursor('X');
    expect(b.getLine(0)).toBe('Xello');
  });

  it('deleteRange removes single-line range', function () {
    var b = makeBuffer('hello world');
    b.deleteRange(0, 6, 0, 11);
    expect(b.getLine(0)).toBe('hello ');
  });

  it('deleteRange removes multi-line range', function () {
    var b = makeBuffer('hello\nworld\nfoo');
    b.deleteRange(0, 3, 1, 3);
    expect(b.getLineCount()).toBe(2);
    expect(b.getLine(0)).toBe('helld');
  });
});

// ---------------------------------------------------------------------------
// Round-trip: type in insert, switch to normal, edit
// ---------------------------------------------------------------------------
describe('VimStateMachine — round-trip workflow', function () {
  it('can type text in insert mode then delete in normal mode', function () {
    var v = makeVim('');
    // Enter insert, type 'hello'
    key(v.vim, 'i');
    // (In real app, editor.js handles char insertion — we drive buffer directly)
    v.buf.insertChar('h');
    v.buf.insertChar('e');
    v.buf.insertChar('l');
    v.buf.insertChar('l');
    v.buf.insertChar('o');
    // Escape to normal
    special(v.vim, 'escape');
    expect(v.vim.mode).toBe('normal');
    expect(v.buf.getLine(0)).toBe('hello');

    // Delete the line
    key(v.vim, 'd');
    key(v.vim, 'd');
    expect(v.buf.getLine(0)).toBe('');
  });

  it('yy then p duplicates a line', function () {
    var v = makeVim('hello\nworld');
    v.buf.setCursor(0, 0);
    key(v.vim, 'y');
    key(v.vim, 'y');
    key(v.vim, 'p');
    expect(v.buf.getLineCount()).toBe(3);
    expect(v.buf.getLine(1)).toBe('hello');
    expect(v.buf.getLine(2)).toBe('world');
  });

  it('dd then p moves a line down', function () {
    var v = makeVim('first\nsecond\nthird');
    v.buf.setCursor(0, 0);
    key(v.vim, 'd');
    key(v.vim, 'd'); // delete 'first'
    key(v.vim, 'p'); // paste below 'second'
    expect(v.buf.getLine(0)).toBe('second');
    expect(v.buf.getLine(1)).toBe('first');
    expect(v.buf.getLine(2)).toBe('third');
  });
});

// ---------------------------------------------------------------------------
// Colon command mode
// ---------------------------------------------------------------------------
describe('VimStateMachine — colon command mode', function () {
  it(': enters command mode', function () {
    var v = makeVim('hello');
    key(v.vim, ':');
    expect(v.vim.commandMode).toBe(true);
  });

  it('typing builds command buffer', function () {
    var v = makeVim('hello');
    key(v.vim, ':');
    key(v.vim, 'w');
    key(v.vim, 'q');
    expect(v.vim.commandBuffer).toBe('wq');
  });

  it('escape cancels command mode', function () {
    var v = makeVim('hello');
    key(v.vim, ':');
    key(v.vim, 'w');
    special(v.vim, 'escape');
    expect(v.vim.commandMode).toBe(false);
    expect(v.vim.commandBuffer).toBe('');
  });

  it('enter confirms command and calls onCommand', function () {
    var v = makeVim('hello');
    var receivedCmd = null;
    v.vim.onCommand = function (cmd) { receivedCmd = cmd; };
    key(v.vim, ':');
    key(v.vim, 'w');
    special(v.vim, 'return');
    expect(v.vim.commandMode).toBe(false);
    expect(receivedCmd).toBe('w');
  });

  it('backspace on empty buffer exits command mode', function () {
    var v = makeVim('hello');
    key(v.vim, ':');
    special(v.vim, 'backspace');
    expect(v.vim.commandMode).toBe(false);
  });

  it('backspace removes last character', function () {
    var v = makeVim('hello');
    key(v.vim, ':');
    key(v.vim, 'w');
    key(v.vim, 'q');
    special(v.vim, 'backspace');
    expect(v.vim.commandBuffer).toBe('w');
  });

  it('onCommandOpen callback fires when : is pressed', function () {
    var v = makeVim('hello');
    var opened = false;
    v.vim.onCommandOpen = function () { opened = true; };
    key(v.vim, ':');
    expect(opened).toBe(true);
  });

  it('onCommandClose callback fires on escape', function () {
    var v = makeVim('hello');
    var closed = false;
    v.vim.onCommandClose = function () { closed = true; };
    key(v.vim, ':');
    special(v.vim, 'escape');
    expect(closed).toBe(true);
  });

  it('onCommandClose callback fires on enter', function () {
    var v = makeVim('hello');
    var closed = false;
    v.vim.onCommandClose = function () { closed = true; };
    v.vim.onCommand = function () {};
    key(v.vim, ':');
    key(v.vim, 'q');
    special(v.vim, 'return');
    expect(closed).toBe(true);
  });

  it('onCommandUpdate callback fires on each keystroke', function () {
    var v = makeVim('hello');
    var updates = [];
    v.vim.onCommandUpdate = function (text) { updates.push(text); };
    key(v.vim, ':');
    key(v.vim, 'w');
    key(v.vim, 'q');
    expect(updates).toEqual(['w', 'wq']);
  });

  it(':q! command is parsed correctly', function () {
    var v = makeVim('hello');
    var receivedCmd = null;
    v.vim.onCommand = function (cmd) { receivedCmd = cmd; };
    key(v.vim, ':');
    key(v.vim, 'q');
    v.vim.processKey('!', { full: '!', ctrl: false, meta: false, shift: true, name: '!' });
    special(v.vim, 'return');
    expect(receivedCmd).toBe('q!');
  });

  it('command mode does not interfere with normal mode after cancel', function () {
    var v = makeVim('hello');
    key(v.vim, ':');
    special(v.vim, 'escape');
    expect(v.vim.mode).toBe('normal');
    expect(v.vim.commandMode).toBe(false);
  });

  it('empty command does not call onCommand', function () {
    var v = makeVim('hello');
    var called = false;
    v.vim.onCommand = function () { called = true; };
    key(v.vim, ':');
    special(v.vim, 'return');
    expect(called).toBe(false);
  });

  it('C-[ cancels command mode like escape', function () {
    var v = makeVim('hello');
    key(v.vim, ':');
    key(v.vim, 'w');
    ctrl(v.vim, 'C-[');
    expect(v.vim.commandMode).toBe(false);
    expect(v.vim.commandBuffer).toBe('');
  });

  it('processKey returns command field', function () {
    var v = makeVim('hello');
    v.vim.onCommand = function () {};
    key(v.vim, ':');
    key(v.vim, 'w');
    var r = special(v.vim, 'return');
    expect(r.command).toBe('w');
  });
});

// ---------------------------------------------------------------------------
// Bug 4 regression: visual-line d/x on entire buffer does not crash
// ---------------------------------------------------------------------------
describe('VimStateMachine — visual-line delete entire buffer (Bug 4)', function () {
  it('V d on 3-line buffer with cursor at line 2 does not crash', function () {
    var v = makeVim('a\nb\nc');
    v.buf.setCursor(2, 0); // cursor on last line
    key(v.vim, 'V');        // enter visual-line
    key(v.vim, 'k');        // extend selection up
    key(v.vim, 'k');        // extend selection up (all 3 lines selected)
    // Should not throw
    expect(function () { key(v.vim, 'd'); }).not.toThrow();
    expect(v.vim.mode).toBe('normal');
    expect(v.buf.getLineCount()).toBe(1);
    expect(v.buf.getCursor().line).toBe(0);
  });

  it('V x on all-empty-line buffer does not crash', function () {
    var v = makeVim('\n\n');  // 3 empty lines
    v.buf.setCursor(0, 0);
    key(v.vim, 'V');
    key(v.vim, 'j');
    key(v.vim, 'j');
    expect(function () { key(v.vim, 'x'); }).not.toThrow();
    expect(v.vim.mode).toBe('normal');
    expect(v.buf.getCursor().line).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bug 2: onYank callback fires on yy and visual y
// ---------------------------------------------------------------------------
describe('VimStateMachine — onYank callback (Bug 2)', function () {
  it('onYank fires on yy with the yanked text', function () {
    var v = makeVim('hello\nworld');
    var yanked = null;
    v.vim.onYank = function (text) { yanked = text; };
    v.buf.setCursor(0, 0);
    key(v.vim, 'y');
    key(v.vim, 'y');
    expect(yanked).toBe('hello');
  });

  it('onYank fires on visual y with the selected text', function () {
    var v = makeVim('hello');
    var yanked = null;
    v.vim.onYank = function (text) { yanked = text; };
    v.buf.setCursor(0, 0);
    key(v.vim, 'v');
    key(v.vim, 'l'); // select 'he'
    key(v.vim, 'y');
    expect(yanked).toBe('he');
  });

  it('onYank is not called when register is unset', function () {
    var v = makeVim('hello');
    var called = false;
    v.vim.onYank = function () { called = true; };
    // Just move cursor — no yank
    key(v.vim, 'l');
    expect(called).toBe(false);
  });
});
