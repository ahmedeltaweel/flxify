/**
  {
    "api": 1,
    "name": "Explain Regex",
    "description": "Breaks down a regular expression into an explained list of tokens",
    "author": "Flxify",
    "icon": "magnifying-glass",
    "tags": "regex,regexp,regular,expression,explain,breakdown,parse,tokens,pattern"
  }
**/

var regexExplain = require('@flxify/regex-explain');

function main(state) {
  var input = state.text.trim();
  if (!input) {
    state.postError('Please enter a regex pattern (e.g. "^[a-z]+\\d{2,4}$")');
    return;
  }

  try {
    var result = regexExplain.explain(input);
    var lines = [];
    lines.push('Pattern: ' + input);
    if (result.flags) {
      lines.push('Flags: ' + result.flags);
    }
    lines.push('');
    lines.push('Breakdown:');
    for (var i = 0; i < result.parts.length; i++) {
      var part = result.parts[i];
      lines.push('  ' + part.token + '  (' + part.type + ')  ' + part.meaning);
    }
    if (result.parts.length === 0) {
      lines.push('  (empty pattern)');
    }
    state.text = lines.join('\n');
  } catch (e) {
    state.postError(e.message || 'Could not parse regex pattern');
  }
}
