// scripts/lib/cron-explain.js
// Usage: var cronExplain = require('@flxify/cron-explain');
// Pure-JS CJS module. No 'use strict'. No Node built-ins. No npm packages.

var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

var DOW_MAP = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
var MON_MAP = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
                jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

var ALIASES = {
  '@yearly':    '0 0 1 1 *',
  '@annually':  '0 0 1 1 *',
  '@monthly':   '0 0 1 * *',
  '@weekly':    '0 0 * * 0',
  '@daily':     '0 0 * * *',
  '@midnight':  '0 0 * * *',
  '@hourly':    '0 * * * *'
};

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function resolveDow(s) {
  // 7 = Sunday (same as 0)
  var n = parseInt(s, 10);
  if (!isNaN(n)) return n === 7 ? 0 : n;
  var mapped = DOW_MAP[s.toLowerCase()];
  if (mapped !== undefined) return mapped;
  throw new Error('Invalid day-of-week name: ' + s);
}

function resolveMon(s) {
  var n = parseInt(s, 10);
  if (!isNaN(n)) return n;
  var mapped = MON_MAP[s.toLowerCase()];
  if (mapped !== undefined) return mapped;
  throw new Error('Invalid month name: ' + s);
}

// Expand a single field string to an array of matching integers.
// resolver: function(token) -> integer
// min/max: allowed range for validation
function expandField(field, min, max, resolver) {
  if (field === '*') return '*';

  var values = [];

  var parts = field.split(',');
  for (var pi = 0; pi < parts.length; pi++) {
    var part = parts[pi];

    if (part.indexOf('/') !== -1) {
      // Step: */N or M-N/S or M/S
      var slashIdx = part.indexOf('/');
      var rangePart = part.slice(0, slashIdx);
      var step = parseInt(part.slice(slashIdx + 1), 10);
      if (isNaN(step) || step < 1) throw new Error('Invalid step in field: ' + field);

      var rangeStart, rangeEnd;
      if (rangePart === '*') {
        rangeStart = min;
        rangeEnd = max;
      } else if (rangePart.indexOf('-') !== -1) {
        var dashIdx = rangePart.indexOf('-');
        rangeStart = resolver(rangePart.slice(0, dashIdx));
        rangeEnd = resolver(rangePart.slice(dashIdx + 1));
      } else {
        rangeStart = resolver(rangePart);
        rangeEnd = max;
      }
      for (var v = rangeStart; v <= rangeEnd; v += step) {
        if (values.indexOf(v) === -1) values.push(v);
      }
    } else if (part.indexOf('-') !== -1) {
      // Range: M-N
      var dashIdx2 = part.indexOf('-');
      var rangeA = resolver(part.slice(0, dashIdx2));
      var rangeB = resolver(part.slice(dashIdx2 + 1));
      for (var rv = rangeA; rv <= rangeB; rv++) {
        if (values.indexOf(rv) === -1) values.push(rv);
      }
    } else {
      // Single value
      var single = resolver(part);
      if (values.indexOf(single) === -1) values.push(single);
    }
  }

  values.sort(function(a, b) { return a - b; });

  // Validate range
  for (var vi = 0; vi < values.length; vi++) {
    if (values[vi] < min || values[vi] > max) {
      throw new Error('Value ' + values[vi] + ' out of range [' + min + '-' + max + '] in field: ' + field);
    }
  }

  return values;
}

function parseExpr(expr) {
  var e = expr.trim();

  // Handle aliases
  if (ALIASES[e.toLowerCase()]) {
    e = ALIASES[e.toLowerCase()];
  }

  var fields = e.split(/\s+/);
  if (fields.length !== 5) {
    throw new Error('Cron expression must have exactly 5 fields (got ' + fields.length + '): ' + expr);
  }

  var minuteField  = fields[0];
  var hourField    = fields[1];
  var domField     = fields[2];
  var monthField   = fields[3];
  var dowField     = fields[4];

  var parsed = {
    minute:     expandField(minuteField,  0, 59, function(s) { return parseInt(s, 10); }),
    hour:       expandField(hourField,    0, 23, function(s) { return parseInt(s, 10); }),
    dayOfMonth: expandField(domField,     1, 31, function(s) { return parseInt(s, 10); }),
    month:      expandField(monthField,   1, 12, resolveMon),
    dayOfWeek:  expandField(dowField,     0,  6, resolveDow)
  };

  // Validate numeric-only fields
  function validateNumeric(val, min, max, name) {
    if (val === '*') return;
    for (var i = 0; i < val.length; i++) {
      if (val[i] < min || val[i] > max) {
        throw new Error(name + ' value ' + val[i] + ' is out of range [' + min + '-' + max + ']');
      }
    }
  }
  validateNumeric(parsed.minute, 0, 59, 'Minute');
  validateNumeric(parsed.hour, 0, 23, 'Hour');
  validateNumeric(parsed.dayOfMonth, 1, 31, 'Day-of-month');
  validateNumeric(parsed.month, 1, 12, 'Month');
  validateNumeric(parsed.dayOfWeek, 0, 6, 'Day-of-week');

  return parsed;
}

function matchesField(field, value) {
  if (field === '*') return true;
  for (var i = 0; i < field.length; i++) {
    if (field[i] === value) return true;
  }
  return false;
}

// Find next value >= current in sorted array, or first value (wrapping).
// Returns { value, wrapped }
function nextInArray(arr, current) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] >= current) return { value: arr[i], wrapped: false };
  }
  return { value: arr[0], wrapped: true };
}

// Get sorted list from field (or range min..max if wildcard)
function fieldValues(field, min, max) {
  if (field === '*') {
    var arr = [];
    for (var i = min; i <= max; i++) arr.push(i);
    return arr;
  }
  return field;
}

// Jump-ahead next-date calculator.
// Avoids iterating minute-by-minute for all cases.
function computeNextDates(parsed, from, count) {
  var dates = [];
  // Start 1 minute in the future from 'from'
  var d = new Date(from.getTime());
  // Round up to next full minute
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  var maxIterations = 1000000; // Safety cap
  var iterations = 0;

  var minuteVals = fieldValues(parsed.minute, 0, 59);
  var hourVals   = fieldValues(parsed.hour,   0, 23);

  while (dates.length < count && iterations < maxIterations) {
    iterations++;

    var curYear  = d.getUTCFullYear();
    var curMonth = d.getUTCMonth() + 1; // 1-12
    var curDay   = d.getUTCDate();
    var curHour  = d.getUTCHours();
    var curMin   = d.getUTCMinutes();

    // ---- Check month ----
    if (!matchesField(parsed.month, curMonth)) {
      // Jump to start of next matching month
      var nm = nextInArray(fieldValues(parsed.month, 1, 12), curMonth);
      if (nm.wrapped) {
        d = new Date(Date.UTC(curYear + 1, nm.value - 1, 1, 0, 0, 0));
      } else {
        d = new Date(Date.UTC(curYear, nm.value - 1, 1, 0, 0, 0));
      }
      continue;
    }

    // ---- Check day of month AND day of week ----
    // Standard cron: if both DOM and DOW are restricted, EITHER can match (OR semantics).
    // If one is *, only the other applies.
    var domWild = parsed.dayOfMonth === '*';
    var dowWild = parsed.dayOfWeek === '*';
    var curDow = d.getUTCDay(); // 0=Sun

    var domMatches = domWild || matchesField(parsed.dayOfMonth, curDay);
    var dowMatches = dowWild || matchesField(parsed.dayOfWeek, curDow);

    var dayMatches;
    if (domWild && dowWild) {
      dayMatches = true;
    } else if (domWild) {
      dayMatches = dowMatches;
    } else if (dowWild) {
      dayMatches = domMatches;
    } else {
      // Both specified — OR semantics
      dayMatches = domMatches || dowMatches;
    }

    if (!dayMatches) {
      // Jump to next day
      d = new Date(Date.UTC(curYear, curMonth - 1, curDay + 1, 0, 0, 0));
      continue;
    }

    // ---- Check hour ----
    var nh = nextInArray(hourVals, curHour);
    if (nh.value > curHour) {
      // Jump to that hour, minute = first minute in list
      d = new Date(Date.UTC(curYear, curMonth - 1, curDay, nh.value, minuteVals[0], 0));
      continue;
    } else if (nh.wrapped) {
      // No more hours today — jump to next day
      d = new Date(Date.UTC(curYear, curMonth - 1, curDay + 1, 0, 0, 0));
      continue;
    }
    // nh.value === curHour

    // ---- Check minute ----
    var nm2 = nextInArray(minuteVals, curMin);
    if (nm2.wrapped) {
      // No more minutes this hour — jump to next hour
      var nextH = nextInArray(hourVals, curHour + 1);
      if (nextH.wrapped) {
        // No more hours today
        d = new Date(Date.UTC(curYear, curMonth - 1, curDay + 1, 0, 0, 0));
      } else {
        d = new Date(Date.UTC(curYear, curMonth - 1, curDay, nextH.value, minuteVals[0], 0));
      }
      continue;
    }

    // We have a match!
    var matchDate = new Date(Date.UTC(curYear, curMonth - 1, curDay, curHour, nm2.value, 0));
    dates.push(matchDate.toISOString());

    // Advance to next minute
    d = new Date(Date.UTC(curYear, curMonth - 1, curDay, curHour, nm2.value + 1, 0));
  }

  return dates;
}

function buildDescription(parsed, originalFields) {
  var minF = parsed.minute;
  var hourF = parsed.hour;
  var domF = parsed.dayOfMonth;
  var monF = parsed.month;
  var dowF = parsed.dayOfWeek;

  // Check for wildcard fields in the original expression
  var isWild = function(f) { return f === '*'; };

  // Every minute
  if (isWild(minF) && isWild(hourF) && isWild(domF) && isWild(monF) && isWild(dowF)) {
    return 'Every minute';
  }

  // Every N minutes (*/N pattern) with everything else wildcard
  if (originalFields && originalFields[0] && originalFields[0].indexOf('*/') === 0 &&
      isWild(hourF) && isWild(domF) && isWild(monF) && isWild(dowF)) {
    var step = parseInt(originalFields[0].slice(2), 10);
    if (step === 1) return 'Every minute';
    return 'Every ' + step + ' minutes';
  }

  // Every hour (minute=0 or exact, hour=*)
  if (isWild(hourF) && isWild(domF) && isWild(monF) && isWild(dowF)) {
    if (minF !== '*' && minF.length === 1 && minF[0] === 0) {
      return 'Every hour';
    }
    if (minF !== '*' && minF.length === 1) {
      return 'Every hour at minute ' + minF[0];
    }
  }

  // Build time string
  var timeStr = '';
  if (hourF !== '*' && minF !== '*') {
    var hours = hourF;
    var mins = minF;
    // List of times
    var timeParts = [];
    for (var hi = 0; hi < hours.length; hi++) {
      for (var mi = 0; mi < mins.length; mi++) {
        timeParts.push(pad2(hours[hi]) + ':' + pad2(mins[mi]));
      }
    }
    if (timeParts.length <= 4) {
      timeStr = timeParts.join(' and ');
    } else {
      timeStr = timeParts[0] + ' and ' + (timeParts.length - 1) + ' more times';
    }
  } else if (hourF !== '*' && minF === '*') {
    timeStr = 'every minute of hour(s) ' + hourF.join(', ');
  } else if (hourF === '*' && minF !== '*') {
    timeStr = 'at minute ' + minF.join(', ');
  }

  var parts = [];

  // Day/time part
  if (dowF !== '*') {
    // Day-of-week schedule
    var dowVals = dowF;
    var weekdays = [1, 2, 3, 4, 5];
    var isWeekdays = dowVals.length === 5 &&
      weekdays.every(function(w, i) { return dowVals[i] === w; });

    var weekend = [0, 6];
    var isWeekend = dowVals.length === 2 &&
      weekend.every(function(w, i) { return dowVals[i] === w; });

    if (isWeekdays) {
      parts.push('Every weekday (Mon-Fri)');
    } else if (isWeekend) {
      parts.push('Every weekend (Sat-Sun)');
    } else if (dowVals.length === 1) {
      parts.push('Every ' + DAY_NAMES[dowVals[0]]);
    } else {
      var dayStrs = dowVals.map(function(d) { return DAY_SHORT[d]; });
      parts.push('Every ' + dayStrs.join(', '));
    }
  } else if (domF !== '*') {
    // Day-of-month schedule
    var domVals = domF;
    if (domVals.length === 1) {
      parts.push('On day ' + domVals[0] + ' of every month');
    } else {
      parts.push('On days ' + domVals.join(', ') + ' of every month');
    }
  } else {
    parts.push('Every day');
  }

  // Month restriction
  if (monF !== '*') {
    var monVals = monF;
    if (monVals.length === 1) {
      parts.push('in ' + MONTH_SHORT[monVals[0] - 1]);
    } else {
      var monStrs = monVals.map(function(m) { return MONTH_SHORT[m - 1]; });
      parts.push('in ' + monStrs.join(', '));
    }
  }

  if (timeStr) {
    parts.push('at ' + timeStr);
  }

  return parts.join(' ');
}

module.exports = {
  explain: function(expr, options) {
    var opts = options || {};
    var count = (opts.count !== undefined) ? opts.count : 5;
    var from = opts.from || new Date();

    var e = (expr || '').trim();
    if (!e) throw new Error('Cron expression cannot be empty');

    // Get original fields before alias expansion (for step detection)
    var originalExpr = e;
    var aliasKey = e.toLowerCase();
    if (ALIASES[aliasKey]) {
      originalExpr = ALIASES[aliasKey];
    }
    var originalFields = originalExpr.split(/\s+/);

    var parsed;
    try {
      parsed = parseExpr(e);
    } catch (err) {
      throw err;
    }

    var description = buildDescription(parsed, originalFields);
    var nextDates = count > 0 ? computeNextDates(parsed, from, count) : [];

    return {
      description: description,
      nextDates: nextDates,
      parsed: {
        minute:     parsed.minute,
        hour:       parsed.hour,
        dayOfMonth: parsed.dayOfMonth,
        month:      parsed.month,
        dayOfWeek:  parsed.dayOfWeek
      }
    };
  }
};
