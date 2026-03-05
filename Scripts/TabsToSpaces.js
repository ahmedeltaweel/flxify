/**
  {
    "api": 1,
    "name": "Tabs to Spaces",
    "description": "Converts leading tabs to spaces (2 spaces per tab)",
    "author": "Flxify",
    "icon": "indent",
    "tags": "tabs,spaces,indent,convert,whitespace"
  }
**/

function main(state) {
  var lines = state.text.split('\n');
  var result = lines.map(function(line) {
    var m = line.match(/^(\t+)(.*)/);
    if (m) {
      var spaces = m[1].replace(/\t/g, '  ');
      return spaces + m[2];
    }
    return line;
  });
  state.text = result.join('\n');
  state.postInfo("Converted tabs to 2-space indentation");
}
