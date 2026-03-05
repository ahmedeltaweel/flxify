/**
  {
    "api": 1,
    "name": "Spaces to Tabs",
    "description": "Converts leading spaces to tabs (2 or 4 spaces)",
    "author": "Flxify",
    "icon": "indent",
    "tags": "spaces,tabs,indent,convert,whitespace"
  }
**/

function main(state) {
  var lines = state.text.split('\n');
  var two = 0, four = 0;
  lines.forEach(function(line) {
    var m = line.match(/^( +)/);
    if (m) {
      if (m[1].length % 4 === 0) four++;
      if (m[1].length % 2 === 0) two++;
    }
  });
  var spaceSize = (four >= two) ? 4 : 2;
  var spacePattern = new RegExp(' {' + spaceSize + '}', 'g');
  var result = lines.map(function(line) {
    var m = line.match(/^( +)(.*)/);
    if (m) {
      var leading = m[1].replace(spacePattern, '\t');
      return leading + m[2];
    }
    return line;
  });
  state.text = result.join('\n');
  state.postInfo("Converted " + spaceSize + "-space indentation to tabs");
}
