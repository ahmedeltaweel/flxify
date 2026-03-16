
/**
  {
    "api":1,
    "name":"To Unicode Escaped String",
    "description":"Converts text to Unicode escape sequences (\\uXXXX format)",
    "author":"luisfontes19",
    "icon":"broom",
    "tags":"string,unicode,convert,escape"
  }
**/

function main(state) {
  state.text = toUnicode(state.text);
}

function toUnicode(str) {
  return [...str].map(c => {
    return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
  }).join("");
}

