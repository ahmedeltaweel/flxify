// scripts/lib/regex-explain.js
// Usage: var regexExplain = require('@flxify/regex-explain');
// Pure-JS CJS module. No 'use strict'. No Node built-ins. No npm packages.

// Hand-written scanner/tokenizer for regular expressions.
// Produces { parts: Array<{token, type, meaning}>, flags: string }

var SHORTHAND_MAP = {
  'd': { type: 'shorthand', meaning: 'Digit (0-9)' },
  'D': { type: 'shorthand', meaning: 'Non-digit' },
  'w': { type: 'shorthand', meaning: 'Word character (a-z, A-Z, 0-9, _)' },
  'W': { type: 'shorthand', meaning: 'Non-word character' },
  's': { type: 'shorthand', meaning: 'Whitespace character' },
  'S': { type: 'shorthand', meaning: 'Non-whitespace character' },
  'b': { type: 'anchor',    meaning: 'Word boundary' },
  'B': { type: 'anchor',    meaning: 'Non-word boundary' },
  'n': { type: 'escape',    meaning: 'Newline' },
  't': { type: 'escape',    meaning: 'Tab' },
  'r': { type: 'escape',    meaning: 'Carriage return' },
  '\\': { type: 'escape',   meaning: 'Literal backslash' }
};

function makeToken(token, type, meaning) {
  return { token: token, type: type, meaning: meaning };
}

function scanCharacterClass(src, startIdx) {
  // Called when we've seen '['. Scan until matching ']'.
  // Handles \] inside.
  var i = startIdx; // position after '['
  var negated = false;
  if (i < src.length && src[i] === '^') {
    negated = true;
    i++;
  }
  var inner = '';
  while (i < src.length) {
    var ch = src[i];
    if (ch === '\\' && i + 1 < src.length) {
      inner += ch + src[i + 1];
      i += 2;
    } else if (ch === ']') {
      i++; // consume ']'
      break;
    } else {
      inner += ch;
      i++;
    }
  }
  var fullToken = '[' + (negated ? '^' : '') + inner + ']';

  // Build meaning
  var meaning;
  if (negated) {
    // Describe contents
    var contents = describeClassContents(inner);
    meaning = 'None of: ' + contents;
  } else {
    var contents2 = describeClassContents(inner);
    // Check if it's purely a range
    if (/^[^\]\\]-[^\]\\]$/.test(inner) || isRangeOnly(inner)) {
      var parts2 = inner.split('-');
      meaning = 'Range: ' + inner.charAt(0) + ' to ' + inner.charAt(inner.length - 1);
    } else {
      meaning = 'One of: ' + contents2;
    }
  }

  return { token: fullToken, endIdx: i, type: 'character-class', meaning: meaning };
}

function isRangeOnly(inner) {
  // e.g. "a-z", "0-9", "A-Z"
  return /^[a-zA-Z0-9]-[a-zA-Z0-9]$/.test(inner);
}

function describeClassContents(inner) {
  if (!inner) return '(empty)';
  // Replace escape sequences
  var result = inner
    .replace(/\\n/g, 'newline')
    .replace(/\\t/g, 'tab')
    .replace(/\\r/g, 'carriage return')
    .replace(/\\d/g, '0-9')
    .replace(/\\w/g, 'a-zA-Z0-9_')
    .replace(/\\s/g, 'whitespace')
    .replace(/\\\\/g, '\\');
  // Check for ranges
  if (isRangeOnly(inner)) {
    return inner.charAt(0) + ' to ' + inner.charAt(inner.length - 1);
  }
  return result;
}

function scanQuantifier(src, i) {
  // Called after consuming the atom. src[i] might be *, +, ?, {
  if (i >= src.length) return null;
  var ch = src[i];
  var token, meaning, endIdx;

  if (ch === '*') {
    token = '*';
    meaning = 'Zero or more';
    endIdx = i + 1;
  } else if (ch === '+') {
    token = '+';
    meaning = 'One or more';
    endIdx = i + 1;
  } else if (ch === '?') {
    token = '?';
    meaning = 'Zero or one';
    endIdx = i + 1;
  } else if (ch === '{') {
    // {n}, {n,}, {n,m}
    var j = i + 1;
    var numStr = '';
    while (j < src.length && src[j] >= '0' && src[j] <= '9') {
      numStr += src[j++];
    }
    if (j >= src.length || (src[j] !== '}' && src[j] !== ',')) {
      return null; // Not a valid quantifier
    }
    if (src[j] === '}') {
      token = '{' + numStr + '}';
      meaning = 'Exactly ' + numStr;
      endIdx = j + 1;
    } else {
      // {n,} or {n,m}
      j++; // skip ','
      var numStr2 = '';
      while (j < src.length && src[j] >= '0' && src[j] <= '9') {
        numStr2 += src[j++];
      }
      if (j >= src.length || src[j] !== '}') {
        return null;
      }
      if (numStr2 === '') {
        token = '{' + numStr + ',}';
        meaning = numStr + ' or more';
      } else {
        token = '{' + numStr + ',' + numStr2 + '}';
        meaning = 'Between ' + numStr + ' and ' + numStr2;
      }
      endIdx = j + 1;
    }
  } else {
    return null;
  }

  // Check for lazy modifier
  if (endIdx < src.length && src[endIdx] === '?') {
    token += '?';
    meaning += ' (lazy)';
    endIdx++;
  }

  return { token: token, type: 'quantifier', meaning: meaning, endIdx: endIdx };
}

function scanGroup(src, startIdx, groupCounter) {
  // Called when we've seen '('. Determine group type from what follows.
  var i = startIdx; // position after '('
  var groupType, meaning, type;

  if (src[i] === '?' && i + 1 < src.length) {
    var nextCh = src[i + 1];
    if (nextCh === ':') {
      groupType = 'non-capturing';
      type = 'group';
      meaning = 'Non-capturing group';
      i += 2; // skip '?:'
    } else if (nextCh === '=') {
      groupType = 'lookahead-pos';
      type = 'lookahead';
      meaning = 'Positive lookahead';
      i += 2; // skip '?='
    } else if (nextCh === '!') {
      groupType = 'lookahead-neg';
      type = 'lookahead';
      meaning = 'Negative lookahead';
      i += 2; // skip '?!'
    } else if (nextCh === '<' && i + 2 < src.length) {
      var ch3 = src[i + 2];
      if (ch3 === '=') {
        groupType = 'lookbehind-pos';
        type = 'lookbehind';
        meaning = 'Positive lookbehind';
        i += 3; // skip '?<='
      } else if (ch3 === '!') {
        groupType = 'lookbehind-neg';
        type = 'lookbehind';
        meaning = 'Negative lookbehind';
        i += 3; // skip '?<!'
      } else {
        // Named group (?<name>...)
        groupType = 'named-capturing';
        type = 'group';
        groupCounter.count++;
        var nameEnd = src.indexOf('>', i + 2);
        var gname = nameEnd !== -1 ? src.slice(i + 2, nameEnd) : '';
        meaning = 'Capturing group ' + groupCounter.count + ' (named: ' + gname + ')';
        i = nameEnd !== -1 ? nameEnd + 1 : i + 2;
      }
    } else {
      // Unknown (?...) — treat as non-capturing
      groupType = 'non-capturing';
      type = 'group';
      meaning = 'Non-capturing group';
      i += 2;
    }
  } else {
    // Regular capturing group
    groupType = 'capturing';
    type = 'group';
    groupCounter.count++;
    meaning = 'Capturing group ' + groupCounter.count;
  }

  return { groupType: groupType, type: type, meaning: meaning, innerStartIdx: i };
}

function tokenize(pattern, groupCounter) {
  var parts = [];
  var i = 0;
  var n = pattern.length;

  while (i < n) {
    var ch = pattern[i];

    if (ch === '^') {
      parts.push(makeToken('^', 'anchor', 'Start of string'));
      i++;
    } else if (ch === '$') {
      parts.push(makeToken('$', 'anchor', 'End of string'));
      i++;
    } else if (ch === '.') {
      parts.push(makeToken('.', 'wildcard', 'Any character except newline'));
      i++;
      // Check for quantifier
      var q = scanQuantifier(pattern, i);
      if (q) { parts.push(makeToken(q.token, q.type, q.meaning)); i = q.endIdx; }
    } else if (ch === '|') {
      parts.push(makeToken('|', 'alternation', 'Or'));
      i++;
    } else if (ch === '\\') {
      if (i + 1 >= n) {
        // Trailing backslash — treat as literal
        parts.push(makeToken('\\', 'escape', 'Literal backslash'));
        i++;
      } else {
        var escaped = pattern[i + 1];
        var info = SHORTHAND_MAP[escaped];
        if (info) {
          parts.push(makeToken('\\' + escaped, info.type, info.meaning));
        } else {
          parts.push(makeToken('\\' + escaped, 'escape', "Literal '" + escaped + "'"));
        }
        i += 2;
        // Shorthands can have quantifiers
        var q2 = scanQuantifier(pattern, i);
        if (q2) { parts.push(makeToken(q2.token, q2.type, q2.meaning)); i = q2.endIdx; }
      }
    } else if (ch === '[') {
      var classResult = scanCharacterClass(pattern, i + 1);
      parts.push(makeToken(classResult.token, classResult.type, classResult.meaning));
      i = classResult.endIdx;
      // Character classes can have quantifiers
      var q3 = scanQuantifier(pattern, i);
      if (q3) { parts.push(makeToken(q3.token, q3.type, q3.meaning)); i = q3.endIdx; }
    } else if (ch === '(') {
      var groupResult = scanGroup(pattern, i + 1, groupCounter);
      parts.push(makeToken('(' + pattern.slice(i + 1, groupResult.innerStartIdx), groupResult.type, groupResult.meaning));
      // Recursively tokenize the group contents until we find the matching ')'
      var innerStart = groupResult.innerStartIdx;
      var depth = 1;
      var innerEnd = innerStart;
      while (innerEnd < n && depth > 0) {
        if (pattern[innerEnd] === '\\') {
          innerEnd += 2;
        } else if (pattern[innerEnd] === '[') {
          // Skip character class
          innerEnd++;
          while (innerEnd < n && pattern[innerEnd] !== ']') {
            if (pattern[innerEnd] === '\\') innerEnd++;
            innerEnd++;
          }
          innerEnd++; // skip ']'
        } else if (pattern[innerEnd] === '(') {
          depth++;
          innerEnd++;
        } else if (pattern[innerEnd] === ')') {
          depth--;
          if (depth > 0) innerEnd++;
          else break;
        } else {
          innerEnd++;
        }
      }
      var innerContent = pattern.slice(innerStart, innerEnd);
      // Recursively tokenize inner content
      var innerParts = tokenize(innerContent, groupCounter);
      for (var ip = 0; ip < innerParts.length; ip++) {
        parts.push(innerParts[ip]);
      }
      // Close group token
      parts.push(makeToken(')', 'group', 'End of group'));
      i = innerEnd + 1; // skip past ')'
      // Groups can have quantifiers
      var q4 = scanQuantifier(pattern, i);
      if (q4) { parts.push(makeToken(q4.token, q4.type, q4.meaning)); i = q4.endIdx; }
    } else if (ch === ')') {
      // Unmatched close paren — skip
      i++;
    } else if (ch === '*' || ch === '+' || ch === '?' || ch === '{') {
      // Quantifier without preceding atom (e.g. at start or after another quantifier)
      var qStandalone = scanQuantifier(pattern, i);
      if (qStandalone) {
        parts.push(makeToken(qStandalone.token, qStandalone.type, qStandalone.meaning));
        i = qStandalone.endIdx;
      } else {
        // Treat as literal
        parts.push(makeToken(ch, 'literal', "Literal '" + ch + "'"));
        i++;
      }
    } else {
      // Literal character — accumulate consecutive literals
      var litStart = i;
      while (i < n) {
        var c = pattern[i];
        if (c === '^' || c === '$' || c === '.' || c === '|' ||
            c === '\\' || c === '[' || c === '(' || c === ')' ||
            c === '*' || c === '+' || c === '?' || c === '{') {
          break;
        }
        // Check if next char would be a quantifier for THIS char (don't merge)
        if (i > litStart) {
          var nextC = pattern[i];
          // If we're about to encounter a quantifier, stop before this char
          // so the last literal can get a quantifier separately
          if (nextC === '*' || nextC === '+' || nextC === '?' || nextC === '{') {
            break;
          }
        }
        i++;
      }
      // If we accumulated more than one literal, each is its own token
      // Actually, treat each literal char separately so quantifiers bind correctly
      // Rewind and emit one at a time
      i = litStart;
      var litCh = pattern[i];
      parts.push(makeToken(litCh, 'literal', "Literal '" + litCh + "'"));
      i++;
      var q5 = scanQuantifier(pattern, i);
      if (q5) { parts.push(makeToken(q5.token, q5.type, q5.meaning)); i = q5.endIdx; }
    }
  }

  return parts;
}

module.exports = {
  explain: function(pattern) {
    if (pattern === null || pattern === undefined) {
      return { parts: [], flags: '' };
    }

    var src = String(pattern);
    var flags = '';

    // Handle /pattern/flags format
    if (src.length >= 2 && src[0] === '/') {
      var lastSlash = src.lastIndexOf('/');
      if (lastSlash > 0) {
        flags = src.slice(lastSlash + 1);
        src = src.slice(1, lastSlash);
      }
    }

    if (!src) {
      return { parts: [], flags: flags };
    }

    var groupCounter = { count: 0 };
    var parts = tokenize(src, groupCounter);

    return { parts: parts, flags: flags };
  }
};
