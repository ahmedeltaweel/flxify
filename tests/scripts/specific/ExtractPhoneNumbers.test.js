const { createRequire, loadScript } = require('../../helpers/script-loader');
const { MockBoopState } = require('../../helpers/mock-state');

const requireShim = createRequire();
const script = loadScript('ExtractPhoneNumbers.js');

describe('Extract Phone Numbers', () => {
  it('extracts a US phone number in parentheses format', () => {
    const state = new MockBoopState('Call us at (555) 123-4567 for details.');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('(555) 123-4567');
  });

  it('extracts a US phone number with +1 country code', () => {
    const state = new MockBoopState('Reach me at +1 (555) 123-4567 anytime.');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('+1 (555) 123-4567');
  });

  it('extracts a US phone number in dot format', () => {
    const state = new MockBoopState('Contact: 555.123.4567');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('555.123.4567');
  });

  it('extracts a US phone number in dash format', () => {
    const state = new MockBoopState('Office: 555-123-4567');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('555-123-4567');
  });

  it('extracts a UK phone number', () => {
    const state = new MockBoopState('UK office: +44 20 7946 0958');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('+44 20 7946 0958');
  });

  it('extracts a French phone number', () => {
    const state = new MockBoopState('Paris bureau: +33 1 23 45 67 89');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('+33 1 23 45 67 89');
  });

  it('extracts a German phone number', () => {
    const state = new MockBoopState('Berlin: +49 30 12345678');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('+49 30 12345678');
  });

  it('extracts a Spanish phone number', () => {
    const state = new MockBoopState('Madrid: +34 612 345 678');
    script.execute(requireShim, state);
    expect(state.fullText).toContain('+34 612 345 678');
  });

  it('extracts multiple phone numbers in mixed formats from a single text', () => {
    var input = [
      'US office: (800) 555-0199',
      'UK branch: +44 20 7946 0958',
      'German team: +49 30 12345678'
    ].join('\n');
    const state = new MockBoopState(input);
    script.execute(requireShim, state);
    var lines = state.fullText.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(state.fullText).toContain('(800) 555-0199');
    expect(state.fullText).toContain('+44 20 7946 0958');
    expect(state.fullText).toContain('+49 30 12345678');
  });

  it('posts info when no phone numbers are found', () => {
    const state = new MockBoopState('No contact info here. Just some plain text.');
    script.execute(requireShim, state);
    expect(state.infos.length).toBeGreaterThan(0);
    expect(state.infos[0]).toBe('No phone numbers found');
  });

  it('removes duplicate phone numbers, keeping only one occurrence', () => {
    var input = '(555) 123-4567\n(555) 123-4567\nPlease call (555) 123-4567';
    const state = new MockBoopState(input);
    script.execute(requireShim, state);
    var lines = state.fullText.split('\n');
    var occurrences = lines.filter(function(l) { return l.trim() === '(555) 123-4567'; });
    expect(occurrences.length).toBe(1);
  });

  it('extracts phone numbers embedded in an email signature', () => {
    var input = [
      'Best regards,',
      'Jane Smith',
      'Senior Developer',
      'Email: jane@example.com',
      'Phone: +1 (415) 555-0123',
      'Mobile: +44 7700 900456',
      'www.example.com'
    ].join('\n');
    const state = new MockBoopState(input);
    script.execute(requireShim, state);
    expect(state.fullText).toContain('+1 (415) 555-0123');
    expect(state.fullText).toContain('+44 7700 900456');
  });
});
