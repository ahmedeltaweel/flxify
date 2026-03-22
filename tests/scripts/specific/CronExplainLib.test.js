const path = require('path');

// Load the lib module directly (same way script-loader does)
function loadLib(name) {
  const libPath = path.join(__dirname, '..', '..', '..', 'scripts', 'lib', name + '.js');
  const source = require('fs').readFileSync(libPath, 'utf-8');
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', source);
  fn(mod, mod.exports);
  return mod.exports;
}

describe('cron-explain lib module', () => {
  const cronExplain = loadLib('cron-explain');

  describe('explain()', () => {
    it('parses every-minute cron', () => {
      const result = cronExplain.explain('* * * * *');
      expect(result.description).toBe('Every minute');
      expect(result.nextDates).toHaveLength(5);
    });

    it('parses step syntax', () => {
      const result = cronExplain.explain('*/15 * * * *');
      expect(result.description).toContain('15 minutes');
    });

    it('parses exact time', () => {
      const result = cronExplain.explain('30 9 * * *');
      expect(result.description).toContain('09:30');
    });

    it('parses weekday range', () => {
      const result = cronExplain.explain('0 9 * * 1-5');
      expect(result.description.toLowerCase()).toContain('weekday');
    });

    it('handles @daily alias', () => {
      const r1 = cronExplain.explain('@daily');
      const r2 = cronExplain.explain('0 0 * * *');
      expect(r1.description).toBe(r2.description);
    });

    it('handles @hourly alias', () => {
      const result = cronExplain.explain('@hourly');
      expect(result.description.toLowerCase()).toContain('hour');
    });

    it('handles @weekly alias', () => {
      const result = cronExplain.explain('@weekly');
      expect(result.nextDates.length).toBeGreaterThan(0);
    });

    it('handles @monthly alias', () => {
      const result = cronExplain.explain('@monthly');
      expect(result.nextDates.length).toBeGreaterThan(0);
    });

    it('handles @yearly alias', () => {
      const result = cronExplain.explain('@yearly');
      expect(result.nextDates.length).toBeGreaterThan(0);
    });

    it('respects count option', () => {
      const result = cronExplain.explain('* * * * *', { count: 3 });
      expect(result.nextDates).toHaveLength(3);
    });

    it('returns dates in chronological order', () => {
      const result = cronExplain.explain('0 * * * *');
      for (let i = 1; i < result.nextDates.length; i++) {
        expect(new Date(result.nextDates[i]).getTime())
          .toBeGreaterThan(new Date(result.nextDates[i - 1]).getTime());
      }
    });

    it('returns future dates relative to from option', () => {
      const from = new Date('2026-01-01T00:00:00Z');
      const result = cronExplain.explain('0 12 * * *', { from: from, count: 2 });
      for (const d of result.nextDates) {
        expect(new Date(d).getTime()).toBeGreaterThan(from.getTime());
      }
    });

    it('throws on invalid expression', () => {
      expect(() => cronExplain.explain('invalid')).toThrow();
    });

    it('throws on too few fields', () => {
      expect(() => cronExplain.explain('* *')).toThrow();
    });

    it('throws on out-of-range minute', () => {
      expect(() => cronExplain.explain('60 * * * *')).toThrow();
    });

    it('throws on out-of-range hour', () => {
      expect(() => cronExplain.explain('0 25 * * *')).toThrow();
    });

    it('handles day-of-week names', () => {
      const result = cronExplain.explain('0 9 * * MON');
      expect(result.description.toLowerCase()).toContain('monday');
    });

    it('handles month names', () => {
      const result = cronExplain.explain('0 9 1 JAN *');
      expect(result.description.toLowerCase()).toContain('jan');
    });

    it('handles list syntax', () => {
      const result = cronExplain.explain('0 9,17 * * *');
      expect(result.description).toContain('09:00');
      expect(result.description).toContain('17:00');
    });

    it('returns parsed field data', () => {
      const result = cronExplain.explain('*/5 9 * * 1-5');
      expect(result.parsed).toBeDefined();
      expect(result.parsed.minute).toBeDefined();
      expect(result.parsed.hour).toBeDefined();
    });
  });
});

describe('regex-explain lib module', () => {
  const regexExplain = loadLib('regex-explain');

  describe('explain()', () => {
    it('returns empty parts for empty pattern', () => {
      const result = regexExplain.explain('');
      expect(result.parts).toHaveLength(0);
      expect(result.flags).toBe('');
    });

    it('explains anchors', () => {
      const result = regexExplain.explain('^$');
      expect(result.parts).toHaveLength(2);
      expect(result.parts[0].type).toBe('anchor');
      expect(result.parts[1].type).toBe('anchor');
    });

    it('explains dot wildcard', () => {
      const result = regexExplain.explain('.');
      expect(result.parts[0].type).toBe('wildcard');
    });

    it('explains shorthand classes', () => {
      const result = regexExplain.explain('\\d\\D\\w\\W\\s\\S');
      expect(result.parts).toHaveLength(6);
      expect(result.parts.every(p => p.type === 'shorthand')).toBe(true);
    });

    it('explains character classes', () => {
      const result = regexExplain.explain('[abc]');
      expect(result.parts[0].type).toBe('character-class');
    });

    it('explains negated character classes', () => {
      const result = regexExplain.explain('[^abc]');
      expect(result.parts[0].meaning.toLowerCase()).toContain('none of');
    });

    it('explains ranges in character classes', () => {
      const result = regexExplain.explain('[a-z]');
      expect(result.parts[0].meaning.toLowerCase()).toContain('range');
    });

    it('explains quantifiers', () => {
      const result = regexExplain.explain('a*b+c?');
      const quantifiers = result.parts.filter(p => p.type === 'quantifier');
      expect(quantifiers).toHaveLength(3);
    });

    it('explains curly brace quantifiers', () => {
      const result = regexExplain.explain('a{3}b{2,}c{1,5}');
      const quantifiers = result.parts.filter(p => p.type === 'quantifier');
      expect(quantifiers).toHaveLength(3);
      expect(quantifiers[0].meaning).toContain('3');
      expect(quantifiers[1].meaning).toContain('2');
      expect(quantifiers[2].meaning).toContain('1');
    });

    it('explains lazy quantifiers', () => {
      const result = regexExplain.explain('a*?b+?');
      const quantifiers = result.parts.filter(p => p.type === 'quantifier');
      expect(quantifiers.some(q => q.meaning.toLowerCase().includes('lazy'))).toBe(true);
    });

    it('explains capturing groups', () => {
      const result = regexExplain.explain('(a)(b)');
      const groups = result.parts.filter(p => p.type === 'group');
      expect(groups.length).toBeGreaterThan(0);
    });

    it('explains non-capturing groups', () => {
      const result = regexExplain.explain('(?:abc)');
      const groups = result.parts.filter(p => p.type === 'group');
      expect(groups.some(g => g.meaning.toLowerCase().includes('non-capturing'))).toBe(true);
    });

    it('explains lookaheads', () => {
      const result = regexExplain.explain('(?=foo)(?!bar)');
      const lookaheads = result.parts.filter(p => p.type === 'lookahead');
      expect(lookaheads).toHaveLength(2);
    });

    it('explains lookbehinds', () => {
      const result = regexExplain.explain('(?<=a)(?<!b)');
      const lookbehinds = result.parts.filter(p => p.type === 'lookbehind');
      expect(lookbehinds).toHaveLength(2);
    });

    it('explains alternation', () => {
      const result = regexExplain.explain('a|b');
      const alt = result.parts.filter(p => p.type === 'alternation');
      expect(alt).toHaveLength(1);
    });

    it('extracts flags from /pattern/flags format', () => {
      const result = regexExplain.explain('/test/gi');
      expect(result.flags).toBe('gi');
    });

    it('explains escape sequences', () => {
      const result = regexExplain.explain('\\n\\t');
      expect(result.parts.some(p => p.meaning.toLowerCase().includes('newline'))).toBe(true);
      expect(result.parts.some(p => p.meaning.toLowerCase().includes('tab'))).toBe(true);
    });

    it('explains literal characters', () => {
      const result = regexExplain.explain('abc');
      const literals = result.parts.filter(p => p.type === 'literal');
      expect(literals.length).toBeGreaterThan(0);
    });

    it('numbers capturing groups correctly', () => {
      const result = regexExplain.explain('(a)(b)(c)');
      const groups = result.parts.filter(p => p.type === 'group' && p.meaning.includes('Capturing'));
      // Should have group 1, 2, 3 entries
      expect(groups.some(g => g.meaning.includes('1'))).toBe(true);
      expect(groups.some(g => g.meaning.includes('2'))).toBe(true);
      expect(groups.some(g => g.meaning.includes('3'))).toBe(true);
    });
  });
});
