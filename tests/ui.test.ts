import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UI, createUI } from '../src/ui.js';

describe('UI', () => {
  const originalCI = process.env.CI;
  const originalNoColor = process.env.NO_COLOR;
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    process.env.CI = '';
    process.env.NO_COLOR = '';
    process.stdout.isTTY = true;
  });

  afterEach(() => {
    process.env.CI = originalCI;
    process.env.NO_COLOR = originalNoColor;
    process.stdout.isTTY = originalIsTTY;
  });

  it('decorationsEnabled returns false when CI is set', () => {
    process.env.CI = 'true';
    expect(UI.decorationsEnabled('table', false)).toBe(false);
  });

  it('decorationsEnabled returns false for json mode', () => {
    expect(UI.decorationsEnabled('json', false)).toBe(false);
    expect(UI.decorationsEnabled('json-compact', false)).toBe(false);
    expect(UI.decorationsEnabled('csv', false)).toBe(false);
    expect(UI.decorationsEnabled('compact', false)).toBe(false);
  });

  it('decorationsEnabled returns false for quiet mode', () => {
    expect(UI.decorationsEnabled('table', true)).toBe(false);
  });

  it('decorationsEnabled returns false when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    expect(UI.decorationsEnabled('table', false)).toBe(false);
  });

  it('decorationsEnabled returns true for table mode when TTY and no CI/NO_COLOR', () => {
    expect(UI.decorationsEnabled('table', false)).toBe(true);
  });

  it('decorationsEnabled returns false when not a TTY', () => {
    process.stdout.isTTY = false;
    expect(UI.decorationsEnabled('table', false)).toBe(false);
  });

  it('disabled UI does not crash on spinner methods', () => {
    process.env.CI = 'true';
    const ui = new UI({ outputMode: 'table', quiet: false });
    expect(() => {
      ui.startSpinner('test');
      ui.stopSpinner();
      ui.setSpinnerText('test2');
      ui.success('done');
      ui.error('failed');
      ui.hint('try this');
      ui.breadcrumb('resolved task X from branch Y');
    }).not.toThrow();
  });

  it('enabled UI does not crash on spinner methods', () => {
    const ui = new UI({ outputMode: 'table', quiet: false });
    expect(() => {
      ui.startSpinner('test');
      ui.stopSpinner();
      ui.setSpinnerText('test2');
      ui.success('done');
      ui.error('failed');
      ui.hint('try this');
    }).not.toThrow();
  });

  it('symbol getter returns figures', () => {
    const ui = new UI({ outputMode: 'table', quiet: false });
    const sym = ui.symbol;
    expect(typeof sym.tick).toBe('string');
    expect(typeof sym.cross).toBe('string');
    expect(typeof sym.warning).toBe('string');
    expect(typeof sym.arrowRight).toBe('string');
    expect(sym.tick.length).toBeGreaterThan(0);
  });

  it('box returns content plainly when disabled', () => {
    process.env.CI = 'true';
    const ui = new UI({ outputMode: 'table', quiet: false });
    const result = ui.box('hello', { title: 't' });
    expect(result).toBe('hello');
  });

  it('box returns a bordered string when enabled', () => {
    const ui = new UI({ outputMode: 'table', quiet: false });
    const result = ui.box('hello');
    expect(result).toContain('hello');
    expect(result.length).toBeGreaterThan('hello'.length);
  });

  it('createUI returns a UI instance', () => {
    const ui = createUI({ outputMode: 'table', quiet: false });
    expect(ui).toBeInstanceOf(UI);
  });
});
