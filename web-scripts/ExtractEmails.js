/**
  {
    "api": 1,
    "name": "Extract Emails",
    "description": "Extracts all email addresses from your text",
    "author": "Flxify",
    "icon": "envelope",
    "tags": "email,extract,address,scrape"
  }
**/

function main(state) {
  var regex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  var matches = state.text.match(regex);
  if (!matches || matches.length === 0) {
    state.postInfo("No email addresses found");
    return;
  }
  var unique = matches.filter(function(v, i, a) { return a.indexOf(v) === i; });
  state.text = unique.join('\n');
}
