const { execFileSync } = require('child_process');
const path = require('path');

const BIN = path.resolve(__dirname, '..', 'bin', 'flxify.js');

function run(args) {
  return execFileSync(process.execPath, [BIN, ...args], {
    encoding: 'utf-8',
    timeout: 10000
  });
}

function runExpectError(args) {
  try {
    execFileSync(process.execPath, [BIN, ...args], {
      encoding: 'utf-8',
      timeout: 10000
    });
    throw new Error('Expected command to fail but it succeeded');
  } catch (e) {
    if (e.message === 'Expected command to fail but it succeeded') throw e;
    return e.stderr || '';
  }
}

describe('flxify cron subcommand', () => {
  it('explains a simple cron expression', () => {
    const output = run(['cron', '*/5 * * * *']);
    expect(output).toContain('Cron: */5 * * * *');
    expect(output).toContain('Description:');
    expect(output).toContain('5 minutes');
    expect(output).toContain('Next 5 occurrences:');
  });

  it('explains @daily alias', () => {
    const output = run(['cron', '@daily']);
    expect(output).toContain('Description:');
    expect(output).toContain('Next 5 occurrences:');
  });

  it('explains @hourly alias', () => {
    const output = run(['cron', '@hourly']);
    expect(output).toContain('Description:');
  });

  it('produces 5 date lines', () => {
    const output = run(['cron', '0 * * * *']);
    const dateLines = output.split('\n').filter(l => /^\s+\d+\./.test(l));
    expect(dateLines).toHaveLength(5);
  });

  it('exits with error on invalid cron', () => {
    const stderr = runExpectError(['cron', 'not-a-cron']);
    expect(stderr.toLowerCase()).toContain('error');
  });
});

describe('flxify regex subcommand', () => {
  it('explains a simple regex', () => {
    const output = run(['regex', '^hello$']);
    expect(output).toContain('Pattern: ^hello$');
    expect(output).toContain('Breakdown:');
    expect(output).toContain('anchor');
  });

  it('explains character classes', () => {
    const output = run(['regex', '[a-z]+']);
    expect(output).toContain('character-class');
    expect(output).toContain('quantifier');
  });

  it('explains shorthand classes', () => {
    const output = run(['regex', '\\d+']);
    expect(output).toContain('shorthand');
    expect(output).toContain('Digit');
  });

  it('handles regex with flags', () => {
    const output = run(['regex', '/test/gi']);
    expect(output).toContain('Flags: gi');
  });
});
