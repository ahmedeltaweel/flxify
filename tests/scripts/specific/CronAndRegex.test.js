const { createRequire, loadScript } = require('../../helpers/script-loader');
const { MockBoopState } = require('../../helpers/mock-state');

const requireShim = createRequire();

describe('Cron to Human script', () => {
  const script = loadScript('CronToHuman.js');

  it('explains a simple every-5-minutes cron', () => {
    const state = new MockBoopState('*/5 * * * *');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('Every 5 minutes');
    expect(state.fullText).toContain('Next 5 occurrences');
  });

  it('explains @daily alias', () => {
    const state = new MockBoopState('@daily');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('Description:');
    expect(state.fullText).toContain('Next 5 occurrences');
  });

  it('explains weekday-only schedule', () => {
    const state = new MockBoopState('0 9 * * 1-5');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('09:00');
  });

  it('handles invalid cron expression', () => {
    const state = new MockBoopState('not a cron');
    script.execute(requireShim, state);
    expect(state.errors.length).toBeGreaterThan(0);
  });

  it('handles empty input', () => {
    const state = new MockBoopState('');
    script.execute(requireShim, state);
    expect(state.errors.length).toBeGreaterThan(0);
  });

  it('produces exactly 5 next dates', () => {
    const state = new MockBoopState('0 * * * *');
    script.execute(requireShim, state);
    const lines = state.fullText.split('\n');
    const dateLines = lines.filter(l => /^\s+\d+\./.test(l));
    expect(dateLines).toHaveLength(5);
  });
});

describe('Explain Regex script', () => {
  const script = loadScript('ExplainRegex.js');

  it('explains a simple pattern', () => {
    const state = new MockBoopState('^hello$');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('anchor');
    expect(state.fullText).toContain('Start of string');
    expect(state.fullText).toContain('End of string');
  });

  it('explains character class with quantifier', () => {
    const state = new MockBoopState('[a-z]+');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('character-class');
    expect(state.fullText).toContain('quantifier');
  });

  it('explains shorthand character classes', () => {
    const state = new MockBoopState('\\d\\w\\s');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('Digit');
    expect(state.fullText).toContain('Word character');
    expect(state.fullText).toContain('Whitespace');
  });

  it('handles regex with flags', () => {
    const state = new MockBoopState('/test/gi');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('Flags: gi');
  });

  it('handles empty input', () => {
    const state = new MockBoopState('');
    script.execute(requireShim, state);
    expect(state.errors.length).toBeGreaterThan(0);
  });

  it('explains groups', () => {
    const state = new MockBoopState('(foo)(?:bar)');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('group');
  });

  it('explains alternation', () => {
    const state = new MockBoopState('cat|dog');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('alternation');
  });
});
