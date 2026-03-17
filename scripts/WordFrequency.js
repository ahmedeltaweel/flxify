/**
  {
    "api": 1,
    "name": "Word Frequency",
    "description": "Count occurrences of each word in text",
    "author": "Flxify",
    "icon": "counter",
    "tags": "count,word,frequency,occurrences,statistics"
  }
**/

function main(state) {
  let text = state.text;
  if (!text) {
    state.postError("No text provided");
    return;
  }

  let words = text.toLowerCase().match(/[a-zA-Z0-9\u00C0-\u024F]+(?:['-][a-zA-Z0-9\u00C0-\u024F]+)*/g);

  if (!words || words.length === 0) {
    state.postError("No words found");
    return;
  }

  let freq = {};
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    freq[w] = (freq[w] || 0) + 1;
  }

  let entries = Object.keys(freq).map(function(k) { return [k, freq[k]]; });
  entries.sort(function(a, b) { return b[1] - a[1]; });

  let maxWord = 4;
  let maxCount = 5;
  for (let j = 0; j < entries.length; j++) {
    if (entries[j][0].length > maxWord) maxWord = entries[j][0].length;
    if (String(entries[j][1]).length > maxCount) maxCount = String(entries[j][1]).length;
  }

  let header = 'Word' + ' '.repeat(maxWord - 4) + '  Count';
  let separator = '─'.repeat(maxWord) + '  ' + '─'.repeat(maxCount);
  let lines = entries.map(function(e) {
    return e[0] + ' '.repeat(maxWord - e[0].length) + '  ' + String(e[1]).padStart(maxCount);
  });

  let table = [header, separator].concat(lines).join('\n');
  state.fullText = state.fullText + '\n\n' + table;
}
