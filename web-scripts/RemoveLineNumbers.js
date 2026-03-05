/**
  {
    "api": 1,
    "name": "Remove Line Numbers",
    "description": "Strips line number prefixes from your text",
    "author": "Flxify",
    "icon": "eraser",
    "tags": "line,number,remove,strip,clean"
  }
**/

function main(state) {
  var lines = state.text.split('\n');
  var result = lines.map(function(line) {
    return line.replace(/^\s*\d+[\s\t.:)\-|]+/, '');
  });
  state.text = result.join('\n');
}
