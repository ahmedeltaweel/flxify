/**
  {
    "api": 1,
    "name": "Character Frequency",
    "description": "Count occurrences of each character in text",
    "author": "Flxify",
    "icon": "counter",
    "tags": "count,character,frequency,occurrences,statistics"
  }
**/

function main(state) {
  const text = state.text;
  if (!text) {
    state.postError("No text provided");
    return;
  }

  const freq = [...text].reduce((map, ch) => {
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') return map;
    map[ch] = (map[ch] || 0) + 1;
    return map;
  }, {});

  const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    state.postError("No non-whitespace characters found");
    return;
  }

  const maxCount = String(entries[0][1]).length;
  const CountLength = 5;
  const header = 'Character  Count';
  const separator = '─────────  ' + '─'.repeat(Math.max(CountLength, maxCount));
  const lines = entries.map(([ch, count]) => {
    return ch + '          ' + String(count).padStart(Math.max(CountLength, maxCount));
  });

  const table = [header, separator, ...lines].join('\n');
  state.fullText = state.fullText + '\n\n' + table;
}
