/**
  {
    "api": 1,
    "name": "Inject Heading Anchors",
    "description": "Adds HTML anchor IDs to markdown headings for deep linking and AI navigation",
    "author": "Flxify",
    "icon": "⚓",
    "tags": "markdown,anchors,headings,ids,links,html,inject,deep link,navigation,ai"
  }
**/

function main(state) {
  var count = 0;
  var result = state.text.replace(/^(#{1,6}) (.+)$/gm, function(_, hashes, title) {
    var clean = title.trim().replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
    var id = clean.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    // Skip if anchor already present
    if (title.includes('<a id=')) return hashes + ' ' + title;
    count++;
    return hashes + ' <a id="' + id + '"></a>' + title.trim();
  });
  state.text = result;
  state.postInfo('Injected ' + count + ' anchor' + (count === 1 ? '' : 's'));
}
