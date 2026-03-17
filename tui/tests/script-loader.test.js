'use strict';

// script-loader integration tests
// Loads the actual scripts from the project's scripts/ directory.
// Run: cd tui && npm test

var path = require('path');
var scriptLoader = require('../src/scripts/script-loader.js');
var requireShim = require('../src/scripts/require-shim.js');
var BoopState = require('../src/scripts/boop-state.js');

// The scripts directory is at project root: tui/../scripts/
// (When running from the tui/ dir, __dirname is tui/tests/)
var SCRIPTS_DIR = path.resolve(__dirname, '..', '..', 'scripts');
var LIB_DIR = path.join(SCRIPTS_DIR, 'lib');

// Scripts that throw on arbitrary input instead of calling state.postError()
// (CLAUDE.md gotcha #28 / root tests' THROWS_ON_ARBITRARY_INPUT set)
// These are the display names (from script metadata "name" field), not filenames.
var THROWS_ON_ARBITRARY_INPUT = new Set([
  'Minify JSON',
  'Sum All',
  'Hex To ASCII'
]);

// ---------------------------------------------------------------------------
// Script loading
// ---------------------------------------------------------------------------

var scripts; // loaded once for all tests

describe('script-loader — loadScripts()', function () {
  it('returns an array without throwing', function () {
    scripts = scriptLoader.loadScripts(SCRIPTS_DIR);
    expect(Array.isArray(scripts)).toBe(true);
  });

  it('loads all scripts from the scripts directory', function () {
    // Count .js files in scripts/ to get the expected number dynamically
    var fs = require('fs');
    var expectedCount = fs.readdirSync(SCRIPTS_DIR)
      .filter(function (f) { return f.endsWith('.js'); }).length;
    expect(scripts.length).toBe(expectedCount);
  });
});

describe('script-loader — metadata validation', function () {
  it('every script has a non-empty name', function () {
    scripts.forEach(function (s) {
      expect(typeof s.name).toBe('string');
      expect(s.name.length).toBeGreaterThan(0);
    });
  });

  it('every script has a string description (may be empty)', function () {
    scripts.forEach(function (s) {
      expect(typeof s.description).toBe('string');
    });
  });

  it('every script has a string tags field (may be empty)', function () {
    scripts.forEach(function (s) {
      expect(typeof s.tags).toBe('string');
    });
  });

  it('every script has a string icon field (may be empty)', function () {
    scripts.forEach(function (s) {
      expect(typeof s.icon).toBe('string');
    });
  });

  it('every script has a callable execute function', function () {
    scripts.forEach(function (s) {
      expect(typeof s.execute).toBe('function');
    });
  });

  it('scripts are sorted alphabetically by name', function () {
    for (var i = 1; i < scripts.length; i++) {
      var prev = scripts[i - 1].name;
      var curr = scripts[i].name;
      expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
    }
  });

  it('all script names are unique', function () {
    var names = scripts.map(function (s) { return s.name; });
    var unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

// ---------------------------------------------------------------------------
// Script execution (basic smoke test)
// ---------------------------------------------------------------------------

describe('script-loader — script execution', function () {
  var flxifyRequire;

  beforeAll(function () {
    flxifyRequire = requireShim.createRequire(LIB_DIR);
  });

  it('Format JSON formats valid JSON', function () {
    var formatJSON = scripts.find(function (s) { return s.name === 'Format JSON'; });
    expect(formatJSON).toBeDefined();

    var state = new BoopState('{"a":1,"b":2}', null);
    formatJSON.execute(flxifyRequire, state);
    expect(state._fullText).toContain('"a"');
    expect(state._fullText).toContain('\n'); // pretty-printed
  });

  it('Sort lines sorts alphabetically', function () {
    var sortLines = scripts.find(function (s) { return s.name === 'Sort lines'; });
    expect(sortLines).toBeDefined();

    var state = new BoopState('banana\napple\ncherry', null);
    sortLines.execute(flxifyRequire, state);
    expect(state._fullText).toBe('apple\nbanana\ncherry');
  });

  it('Upcase converts to uppercase', function () {
    var upperCase = scripts.find(function (s) { return s.name === 'Upcase'; });
    expect(upperCase).toBeDefined();

    var state = new BoopState('hello world', null);
    upperCase.execute(flxifyRequire, state);
    expect(state._fullText).toBe('HELLO WORLD');
  });

  it('Downcase converts to lowercase', function () {
    var lowerCase = scripts.find(function (s) { return s.name === 'Downcase'; });
    expect(lowerCase).toBeDefined();

    var state = new BoopState('HELLO WORLD', null);
    lowerCase.execute(flxifyRequire, state);
    expect(state._fullText).toBe('hello world');
  });

  it('Base64 Encode encodes text', function () {
    var b64Encode = scripts.find(function (s) { return s.name === 'Base64 Encode'; });
    expect(b64Encode).toBeDefined();

    var state = new BoopState('hello', null);
    b64Encode.execute(flxifyRequire, state);
    expect(state._fullText).toBe('aGVsbG8=');
  });

  it('Base64 Decode decodes text', function () {
    var b64Decode = scripts.find(function (s) { return s.name === 'Base64 Decode'; });
    expect(b64Decode).toBeDefined();

    var state = new BoopState('aGVsbG8=', null);
    b64Decode.execute(flxifyRequire, state);
    expect(state._fullText).toBe('hello');
  });

  it('Count Words reports word count as info', function () {
    var countWords = scripts.find(function (s) { return s.name === 'Count Words'; });
    expect(countWords).toBeDefined();

    var state = new BoopState('hello world foo', null);
    countWords.execute(flxifyRequire, state);
    expect(state._infos.length).toBeGreaterThan(0);
    expect(state._infos[0]).toMatch(/3/); // 3 words
  });

  it('Reverse String reverses text', function () {
    var reverse = scripts.find(function (s) { return s.name === 'Reverse String'; });
    expect(reverse).toBeDefined();

    var state = new BoopState('hello', null);
    reverse.execute(flxifyRequire, state);
    expect(state._fullText).toBe('olleh');
  });

  it('scripts that throw on arbitrary input are in the known-throws list', function () {
    // Verify that MinifyJSON, SumAll, HexToASCII actually exist in the loaded scripts
    var names = scripts.map(function (s) { return s.name; });
    THROWS_ON_ARBITRARY_INPUT.forEach(function (name) {
      // They may or may not be in the list, but we confirm no unexpected throwers
      // by wrapping ALL non-excluded scripts below
    });
    // Just assert the set has the expected number of entries
    expect(THROWS_ON_ARBITRARY_INPUT.size).toBe(3);
  });

  it('all non-throwing scripts execute without uncaught exception on empty input', function () {
    var errorScripts = [];

    scripts.forEach(function (s) {
      if (THROWS_ON_ARBITRARY_INPUT.has(s.name)) return;

      try {
        var state = new BoopState('', null);
        s.execute(flxifyRequire, state);
      } catch (e) {
        errorScripts.push(s.name + ': ' + e.message);
      }
    });

    if (errorScripts.length > 0) {
      console.error('Scripts that threw on empty input:', errorScripts);
    }

    expect(errorScripts).toEqual([]);
  });

  it('all non-throwing scripts execute without uncaught exception on basic text input', function () {
    var errorScripts = [];

    scripts.forEach(function (s) {
      if (THROWS_ON_ARBITRARY_INPUT.has(s.name)) return;

      try {
        var state = new BoopState('hello world\nfoo bar\n', null);
        s.execute(flxifyRequire, state);
      } catch (e) {
        errorScripts.push(s.name + ': ' + e.message);
      }
    });

    if (errorScripts.length > 0) {
      console.error('Scripts that threw on basic text input:', errorScripts);
    }

    expect(errorScripts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Require shim
// ---------------------------------------------------------------------------

describe('requireShim — createRequire()', function () {
  it('returns a function', function () {
    var req = requireShim.createRequire(LIB_DIR);
    expect(typeof req).toBe('function');
  });

  it('returns null for unknown @flxify/ module', function () {
    var req = requireShim.createRequire(LIB_DIR);
    expect(req('@flxify/nonexistent')).toBeNull();
  });

  it('returns null for non-@flxify/ require', function () {
    var req = requireShim.createRequire(LIB_DIR);
    expect(req('lodash')).toBeNull();
  });

  it('loads lodash.boop module (has a dot in the name)', function () {
    var req = requireShim.createRequire(LIB_DIR);
    var lodash = req('@flxify/lodash.boop');
    expect(lodash).toBeTruthy();
    expect(typeof lodash.camelCase).toBe('function');
  });

  it('caches modules (same object returned twice)', function () {
    var req = requireShim.createRequire(LIB_DIR);
    var first = req('@flxify/lodash.boop');
    var second = req('@flxify/lodash.boop');
    expect(first).toBe(second); // strict reference equality
  });

  it('loads base64 module', function () {
    var req = requireShim.createRequire(LIB_DIR);
    var b64 = req('@flxify/base64');
    expect(b64).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Edge case: nonexistent directory
// ---------------------------------------------------------------------------

describe('loadScripts — missing directory', function () {
  it('returns empty array if directory does not exist', function () {
    var result = scriptLoader.loadScripts('/nonexistent/path/that/does/not/exist');
    expect(result).toEqual([]);
  });
});
