/**
  {
    "api": 1,
    "name": "Regex Escape",
    "description": "Escapes special regex characters in your text",
    "author": "Flxify",
    "icon": "shield",
    "tags": "regex,escape,regexp,regular,expression,special,characters"
  }
**/

function main(state) {
  var original = state.text;
  state.text = state.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var count = state.text.length - original.length;
  state.postInfo("Escaped " + count + " special characters");
}
