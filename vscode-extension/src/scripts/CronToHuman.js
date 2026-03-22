/**
  {
    "api": 1,
    "name": "Cron to Human",
    "description": "Converts a cron expression to a human-readable description with next 5 run times",
    "author": "Flxify",
    "icon": "clock",
    "tags": "cron,schedule,crontab,time,job,human,readable,explain,next,dates"
  }
**/

var cronExplain = require('@flxify/cron-explain');

function main(state) {
  var input = state.text.trim();
  if (!input) {
    state.postError('Please enter a cron expression (e.g. "*/5 * * * *")');
    return;
  }

  try {
    var result = cronExplain.explain(input, { count: 5 });
    var lines = [];
    lines.push('Expression: ' + input);
    lines.push('');
    lines.push('Description: ' + result.description);
    lines.push('');
    lines.push('Next 5 occurrences:');
    for (var i = 0; i < result.nextDates.length; i++) {
      var d = new Date(result.nextDates[i]);
      lines.push('  ' + (i + 1) + '. ' + d.toLocaleString());
    }
    state.text = lines.join('\n');
  } catch (e) {
    state.postError(e.message || 'Invalid cron expression');
  }
}
