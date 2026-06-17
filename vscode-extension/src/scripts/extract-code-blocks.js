/**
  {
    "api": 1,
    "name": "Extract Code Blocks",
    "description": "Extracts all fenced code blocks from markdown, stripping the ``` fences and joining the code",
    "author": "Flxify",
    "icon": "📋",
    "tags": "markdown,code,extract,ai,blocks,fence,backtick,join"
  }
**/

function main(state) {
  var text = state.text;
  var blocks = [];
  var regex = /```(?:[^\n`]*)?\n([\s\S]*?)```/g;
  var match;
  while ((match = regex.exec(text)) !== null) {
    var content = match[1].replace(/\n$/, '');
    if (content.trim()) blocks.push(content);
  }
  if (blocks.length === 0) {
    state.postError('No fenced code blocks found');
    return;
  }
  state.text = blocks.join('\n\n');
  state.postInfo('Extracted ' + blocks.length + ' code block' + (blocks.length === 1 ? '' : 's'));
}
