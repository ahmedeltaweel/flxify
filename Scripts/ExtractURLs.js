/**
  {
    "api": 1,
    "name": "Extract URLs",
    "description": "Extracts all URLs from your text",
    "author": "Flxify",
    "icon": "link",
    "tags": "url,link,extract,http,https,scrape"
  }
**/

function main(state) {
  var regex = /https?:\/\/[^\s<>"'\)\]]+/g;
  var matches = state.text.match(regex);
  if (!matches || matches.length === 0) {
    state.postInfo("No URLs found");
    return;
  }
  var unique = matches.filter(function(v, i, a) { return a.indexOf(v) === i; });
  state.text = unique.join('\n');
}
