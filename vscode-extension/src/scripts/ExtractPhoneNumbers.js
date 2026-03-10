/**
  {
    "api": 1,
    "name": "Extract Phone Numbers",
    "description": "Extracts all unique phone numbers (US & EU formats) from text",
    "author": "Flxify",
    "icon": "phone",
    "tags": "phone,telephone,number,extract,scrape,usa,eu,international,mobile,cell"
  }
**/

function main(state) {
  // Matches US and international phone number formats:
  // US: +1 (XXX) XXX-XXXX, 1-XXX-XXX-XXXX, (XXX) XXX-XXXX, XXX-XXX-XXXX, XXX.XXX.XXXX
  // International: +XX or +XXX followed by 7-12 digits with optional spaces/dashes/parens
  var regex = /(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}|\+\d{1,3}(?:[\s\-]?\(?\d{1,9}\)?){1,5}/g;
  var matches = state.text.match(regex);
  if (!matches || matches.length === 0) {
    state.postInfo("No phone numbers found");
    return;
  }
  var unique = matches.filter(function(v, i, a) { return a.indexOf(v) === i; });
  state.text = unique.join('\n');
}
