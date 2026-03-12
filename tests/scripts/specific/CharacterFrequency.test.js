const { createRequire, loadScript } = require('../../helpers/script-loader');
const { MockBoopState } = require('../../helpers/mock-state');

const requireShim = createRequire();
const script = loadScript('CharacterFrequency.js');

describe('Character Frequency', () => {
  it('counts character occurrences sorted by frequency', () => {
    const state = new MockBoopState('aabbbcc');
    script.execute(requireShim, state);
    const lines = state.fullText.split('\n');
    // Table starts after original text + blank line
    const dataLines = lines.slice(lines.indexOf('Character  Count') + 2);
    expect(dataLines[0]).toMatch(/b\s+3/);
    const remaining = dataLines.slice(1, 3).join('\n');
    expect(remaining).toMatch(/a\s+2/);
    expect(remaining).toMatch(/c\s+2/);
  });

  it('skips whitespace characters', () => {
    const state = new MockBoopState('a b\tc\n');
    script.execute(requireShim, state);
    expect(state.fullText).not.toMatch(/\(space\)/);
    expect(state.fullText).not.toMatch(/\\n/);
    expect(state.fullText).not.toMatch(/\\t/);
  });

  it('shows error for empty input', () => {
    const state = new MockBoopState('');
    script.execute(requireShim, state);
    expect(state.errors).toContain('No text provided');
  });

  it('shows error for whitespace-only input', () => {
    const state = new MockBoopState('   \n\t');
    script.execute(requireShim, state);
    expect(state.errors).toContain('No non-whitespace characters found');
  });

  it('preserves original text and appends table', () => {
    const original = 'hello';
    const state = new MockBoopState(original);
    script.execute(requireShim, state);
    expect(state.fullText.startsWith(original)).toBe(true);
    expect(state.fullText).toContain('Character  Count');
  });

  it('handles unicode characters', () => {
    const state = new MockBoopState('aaa🎉🎉');
    script.execute(requireShim, state);
    expect(state.fullText).toMatch(/a\s+3/);
    expect(state.fullText).toMatch(/🎉\s+2/);
  });
});
