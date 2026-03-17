const { createRequire, loadScript } = require('../../helpers/script-loader');
const { MockBoopState } = require('../../helpers/mock-state');

const requireShim = createRequire();
const script = loadScript('WordFrequency.js');

describe('Word Frequency', () => {
  it('counts word occurrences sorted by frequency', () => {
    const state = new MockBoopState('the cat and the dog and the fish');
    script.execute(requireShim, state);
    const lines = state.fullText.split('\n');
    const headerIdx = lines.findIndex(l => l.startsWith('Word'));
    const dataLines = lines.slice(headerIdx + 2);
    expect(dataLines[0]).toMatch(/the\s+3/);
    expect(dataLines[1]).toMatch(/and\s+2/);
  });

  it('is case-insensitive', () => {
    const state = new MockBoopState('Hello hello HELLO');
    script.execute(requireShim, state);
    expect(state.fullText).toMatch(/hello\s+3/);
  });

  it('handles hyphenated and apostrophe words', () => {
    const state = new MockBoopState("don't don't well-known");
    script.execute(requireShim, state);
    expect(state.fullText).toMatch(/don't\s+2/);
    expect(state.fullText).toMatch(/well-known\s+1/);
  });

  it('shows error for empty input', () => {
    const state = new MockBoopState('');
    script.execute(requireShim, state);
    expect(state.errors).toContain('No text provided');
  });

  it('shows error for non-word input', () => {
    const state = new MockBoopState('!@#$%^&*()');
    script.execute(requireShim, state);
    expect(state.errors).toContain('No words found');
  });

  it('preserves original text and appends table', () => {
    const original = 'hello world';
    const state = new MockBoopState(original);
    script.execute(requireShim, state);
    expect(state.fullText.startsWith(original)).toBe(true);
    expect(state.fullText).toContain('Word');
    expect(state.fullText).toContain('Count');
  });

  it('handles multiline text', () => {
    const state = new MockBoopState('foo bar\nfoo baz\nfoo');
    script.execute(requireShim, state);
    expect(state.fullText).toMatch(/foo\s+3/);
    expect(state.fullText).toMatch(/bar\s+1/);
    expect(state.fullText).toMatch(/baz\s+1/);
  });
});
