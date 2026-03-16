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

// Parse CLI arguments
var options = {
  help: false,
  version: false,
  theme: null,
  file: null
};

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
    '  flxify                      Launch with empty editor',
    '  flxify input.txt            Open a file for editing',
    '  flxify --theme cyber-neon   Launch with Cyber Neon theme',
    ''
  ].join('\n'));
  process.exit(0);
}

// Launch the TUI app
require('../src/app.js')(options);
