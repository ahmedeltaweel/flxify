/**
  {
    "api": 1,
    "name": "UUID Generator",
    "description": "Generates random v4 UUIDs",
    "author": "Flxify",
    "icon": "shuffle",
    "tags": "uuid,guid,random,generate,id"
  }
**/

function main(state) {
  function generateUUID() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.from(bytes).map(function(b) {
      return b.toString(16).padStart(2, '0');
    });
    return hex[0] + hex[1] + hex[2] + hex[3] + '-' +
           hex[4] + hex[5] + '-' +
           hex[6] + hex[7] + '-' +
           hex[8] + hex[9] + '-' +
           hex[10] + hex[11] + hex[12] + hex[13] + hex[14] + hex[15];
  }

  var count = 1;
  var trimmed = state.text.trim();
  if (trimmed.length > 0 && !isNaN(trimmed) && parseInt(trimmed) > 0) {
    count = parseInt(trimmed);
    if (count > 1000) count = 1000;
  }

  var uuids = [];
  for (var i = 0; i < count; i++) {
    uuids.push(generateUUID());
  }
  state.text = uuids.join('\n');
}
