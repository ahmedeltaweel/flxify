#!/usr/bin/env node
'use strict';

// Node.js version check
var major = parseInt(process.version.slice(1).split('.')[0], 10);
if (major < 18) {
  process.stderr.write(
    'Error: Flxify TUI requires Node.js >= 18.0.0\n' +
    'Current version: ' + process.version + '\n' +
    'Please upgrade Node.js: https://nodejs.org\n'
  );
  process.exit(1);
}

var pkg = require('../package.json');
var args = process.argv.slice(2);

// ============================================================
// Subcommand helpers
// ============================================================

/**
 * Load a single lib module from scripts/lib/ using the CommonJS sandbox.
 * Same approach as tui/src/scripts/require-shim.js but standalone.
 */
function loadLibModule(libDir, name) {
  var fs = require('fs');
  var path = require('path');
  var filePath = path.join(libDir, name + '.js');
  var source = fs.readFileSync(filePath, 'utf-8');
  var moduleObj = { exports: {} };
  var fn = new Function('exports', 'module', 'require', source);
  fn(moduleObj.exports, moduleObj, function() { return null; });
  return moduleObj.exports;
}

/**
 * Resolve the scripts/lib directory.
 * Prefers ../../scripts/lib (dev/git checkout), falls back to ../scripts/lib (npm package).
 */
function resolveLibDir() {
  var fs = require('fs');
  var path = require('path');
  var devDir = path.resolve(__dirname, '..', '..', 'scripts', 'lib');
  if (fs.existsSync(devDir)) return devDir;
  return path.resolve(__dirname, '..', 'scripts', 'lib');
}

// ============================================================
// Subcommand detection — check before option parsing
// ============================================================
// Subcommands are the first positional argument. If matched, handle and exit.
// If not matched, fall through to normal TUI launch.

var subcommand = args[0];

if (subcommand === 'cron') {
  var cronExpr = args.slice(1).join(' ').trim();
  if (!cronExpr) {
    // No expression — launch TUI with Cron to Human pre-selected
    // Fall through to normal launch with autoScript set
    // (handled at the bottom after options parsing)
    args = []; // clear args so options parser doesn't see 'cron'
    // We'll set autoScript below
  } else {
    // CLI mode — resolve lib module and run
    try {
      var libDir = resolveLibDir();
      var cronMod = loadLibModule(libDir, 'cron-explain');
      var result = cronMod.explain(cronExpr, { count: 5 });
      process.stdout.write('Cron: ' + cronExpr + '\n');
      process.stdout.write('Description: ' + result.description + '\n\n');
      process.stdout.write('Next 5 occurrences:\n');
      for (var ci = 0; ci < result.nextDates.length; ci++) {
        process.stdout.write('  ' + (ci + 1) + '. ' + result.nextDates[ci] + '\n');
      }
      process.exit(0);
    } catch (e) {
      process.stderr.write('Error: ' + (e.message || 'Invalid cron expression') + '\n');
      process.exit(1);
    }
  }
}

if (subcommand === 'regex') {
  var regexPattern = args.slice(1).join(' ').trim();
  if (!regexPattern) {
    // No pattern — launch TUI with Explain Regex pre-selected
    args = []; // clear args so options parser doesn't see 'regex'
    // We'll set autoScript below
  } else {
    // CLI mode — resolve lib module and run
    try {
      var libDir2 = resolveLibDir();
      var regexMod = loadLibModule(libDir2, 'regex-explain');
      var result2 = regexMod.explain(regexPattern);
      process.stdout.write('Pattern: ' + regexPattern + '\n');
      if (result2.flags) {
        process.stdout.write('Flags: ' + result2.flags + '\n');
      }
      process.stdout.write('\nBreakdown:\n');
      // Calculate padding for aligned columns
      var maxToken = 0;
      var maxType = 0;
      for (var ri = 0; ri < result2.parts.length; ri++) {
        if (result2.parts[ri].token.length > maxToken) maxToken = result2.parts[ri].token.length;
        if (result2.parts[ri].type.length > maxType) maxType = result2.parts[ri].type.length;
      }
      for (var ri2 = 0; ri2 < result2.parts.length; ri2++) {
        var p = result2.parts[ri2];
        var tokenPad = p.token + new Array(Math.max(0, maxToken - p.token.length) + 1).join(' ');
        var typePad = p.type + new Array(Math.max(0, maxType - p.type.length) + 1).join(' ');
        process.stdout.write('  ' + tokenPad + '  ' + typePad + '  ' + p.meaning + '\n');
      }
      if (result2.parts.length === 0) {
        process.stdout.write('  (empty pattern)\n');
      }
      process.exit(0);
    } catch (e) {
      process.stderr.write('Error: ' + (e.message || 'Could not parse regex pattern') + '\n');
      process.exit(1);
    }
  }
}

// ============================================================
// Parse CLI arguments
// ============================================================
var options = {
  help: false,
  version: false,
  theme: null,
  file: null,
  autoScript: null
};

// Set autoScript if subcommand was given without args
if (subcommand === 'cron' && args.length === 0) {
  options.autoScript = 'Cron to Human';
}
if (subcommand === 'regex' && args.length === 0) {
  options.autoScript = 'Explain Regex';
}

var i = 0;
while (i < args.length) {
  var arg = args[i];
  if (arg === '--help' || arg === '-h') {
    options.help = true;
  } else if (arg === '--version' || arg === '-v') {
    options.version = true;
  } else if (arg === '--theme' || arg === '-t') {
    i++;
    if (i < args.length) {
      options.theme = args[i];
    } else {
      process.stderr.write('Error: --theme requires a theme name\n');
      process.exit(1);
    }
  } else if (arg.indexOf('--theme=') === 0) {
    options.theme = arg.slice('--theme='.length);
  } else if (arg[0] !== '-') {
    options.file = arg;
  } else {
    process.stderr.write('Error: Unknown option: ' + arg + '\n');
    process.stderr.write('Run flxify --help for usage information.\n');
    process.exit(1);
  }
  i++;
}

// Handle --version
if (options.version) {
  process.stdout.write(pkg.version + '\n');
  process.exit(0);
}

// Handle --help
if (options.help) {
  process.stdout.write([
    'Flxify TUI v' + pkg.version,
    '',
    'Usage:',
    '  flxify [options] [file]',
    '  flxify <subcommand> [args]',
    '',
    'Subcommands:',
    '  cron [expr]             Explain a cron expression (or open interactive mode)',
    '  regex [pattern]         Explain a regex pattern (or open interactive mode)',
    '',
    'Options:',
    '  -h, --help            Show this help message and exit',
    '  -v, --version         Print version number and exit',
    '  -t, --theme <name>    Set theme on startup',
    '                        Themes: standard-dark (default), standard-light,',
    '                                cyber-neon, nordic-frost, monokai-pro, oled-stealth',
    '',
    'Arguments:',
    '  [file]                Optional file path to open on startup',
    '',
    'Key Bindings:',
    '  Ctrl+B / Ctrl+P       Open command palette',
    '  Ctrl+T                Cycle theme',
    '  Ctrl+S                Save file',
    '  Ctrl+Q                Quit',
    '  Ctrl+C                Quit',
    '  :w                    Save file',
    '  :wq                   Save and quit',
    '  :q                    Quit (prompts if unsaved)',
    '  :q!                   Quit without saving',
    '',
    'Examples:',
    '  flxify                          Launch with empty editor',
    '  flxify input.txt                Open a file for editing',
    '  flxify --theme cyber-neon       Launch with Cyber Neon theme',
    '  flxify cron "*/5 * * * *"       Explain a cron expression',
    '  flxify regex "^[a-z]+$"         Explain a regex pattern',
    ''
  ].join('\n'));
  process.exit(0);
}

// Launch the TUI app
require('../src/app.js')(options);
