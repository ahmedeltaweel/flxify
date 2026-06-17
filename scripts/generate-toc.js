/**
  {
    "api": 1,
    "name": "Generate Table of Contents",
    "description": "Parses markdown headings and generates a linked, indented table of contents",
    "author": "Flxify",
    "icon": "📑",
    "tags": "markdown,toc,table,contents,headings,links,generate,outline,navigation"
  }
**/

function main(state) {
  var text = state.text;
  var lines = text.split('\n');
  var toc = [];
  var seenAnchors = {};

  lines.forEach(function(line) {
    var match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) return;
    var level = match[1].length;
    var title = match[2].trim().replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');

    var base = title.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Deduplicate anchors (GitHub style: append -1, -2 etc)
    var anchor = base;
    if (seenAnchors[anchor] !== undefined) {
      seenAnchors[anchor]++;
      anchor = base + '-' + seenAnchors[anchor];
    } else {
      seenAnchors[anchor] = 0;
    }

    var indent = '  '.repeat(level - 1);
    toc.push(indent + '- [' + title + '](#' + anchor + ')');
  });

  if (toc.length === 0) {
    state.postError('No markdown headings found');
    return;
  }

  var tocText = '## Table of Contents\n\n' + toc.join('\n');

  if (state.isSelection) {
    state.text = tocText;
  } else {
    state.insert(tocText + '\n\n');
  }
  state.postInfo('Generated ToC with ' + toc.length + ' entries');
}
