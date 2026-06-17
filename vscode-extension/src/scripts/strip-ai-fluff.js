/**
  {
    "api": 1,
    "name": "Strip AI Fluff",
    "description": "Removes conversational filler phrases from AI responses, leaving only the technical content",
    "author": "Flxify",
    "icon": "✂️",
    "tags": "ai,strip,clean,fluff,chatgpt,claude,assistant,remove,intro,outro,filler"
  }
**/

function main(state) {
  var fluffPatterns = [
    /^(sure[,!.]?\s|certainly[,!.]?\s|of course[,!.]?\s|absolutely[,!.]?\s|gladly[,!.]?\s)/i,
    /^(here'?s?|here are|here is)\b/i,
    /^i'?v?e?\s+(created|written|prepared|provided|put together|drafted|made)\b/i,
    /^(let me know|feel free to|if you (have|need)|please (let me|don'?t hesitate))/i,
    /^(i hope this (helps|is helpful|is what you|works)|hope this helps)/i,
    /^(as requested|as you requested|as per your request|as per your instructions)/i,
    /^(great question[!.]?|that'?s?\s+(a\s+)?(great|good|excellent|interesting) question)/i,
    /^(you'?re welcome|happy to help|glad (I could|to) help|my pleasure)/i,
    /^(below (is|are) (the|a|an)|the following (is|are))\b/i,
    /^(this (script|code|function|solution|snippet|example) (will|should|does|is designed to|can))\b/i,
    /^(note[:\s]|please note[:\s]|keep in mind[:\s])/i,
    /^(to (summarize|recap|sum up|conclude)[,:])/i,
    /^(in (summary|conclusion)[,:])/i,
    /^i'?m (happy|glad|pleased) to\b/i,
    /\b(let me know if (you|there'?s|I can))[.!]?$/i,
    /\b(if you (have any|need any|want any|require any|need further) (questions?|help|assistance|clarification))[.!]?$/i,
    /\b(don'?t hesitate to (ask|reach out|contact))[.!]?$/i,
    /\b(feel free to (ask|reach out|let me know))[.!]?$/i,
    /\b(i hope (this|that) (helps?|is helpful|works? for you|answers? your question))[.!]?$/i,
  ];

  var lines = state.text.split('\n');
  var result = lines.filter(function(line) {
    var trimmed = line.trim();
    if (!trimmed) return true;
    return !fluffPatterns.some(function(p) { return p.test(trimmed); });
  });

  // Trim leading/trailing blank lines
  while (result.length && !result[0].trim()) result.shift();
  while (result.length && !result[result.length - 1].trim()) result.pop();

  var original = lines.filter(function(l) { return l.trim(); }).length;
  var kept = result.filter(function(l) { return l.trim(); }).length;
  var removed = original - kept;

  state.text = result.join('\n');
  if (removed > 0) {
    state.postInfo('Removed ' + removed + ' fluff line' + (removed === 1 ? '' : 's'));
  } else {
    state.postInfo('No fluff detected');
  }
}
