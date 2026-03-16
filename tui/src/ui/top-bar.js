'use strict';

/**
 * Top bar widget — height 1, anchored to top of screen.
 * Shows "FLXIFY" branding on the left and keyboard shortcut hints on the right,
 * with colored separators, key-chord highlights, and a wrap indicator.
 *
 * Theme support:
 *   applyTheme(theme) updates fg/bg colors and re-renders.
 *   The theme object is expected to have bgSecondary, textPrimary, accent,
 *   textAccent, textMuted, and textSecondary properties.
 */

/**
 * Create the top bar blessed box.
 * @param {import('neo-blessed').Widgets.Screen} screen
 * @param {object} [theme]  - Initial theme object (from themes.js)
 * @returns {{ box: object, update: function, applyTheme: function, setWrapMode: function }}
 */
function createTopBar(screen, theme) {
  var blessed = require('neo-blessed');

  var currentTheme = theme || null;
  var wrapEnabled = false;

  var box = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: {
      fg: currentTheme ? currentTheme.textPrimary : 'white',
      bg: currentTheme ? currentTheme.bgSecondary : 'blue'
    }
  });

  // Strip blessed {tags} to measure visible column width
  function stripTags(s) {
    return s.replace(/\{[^}]*\}/g, '');
  }

  // Wrap a string in a hex foreground color tag
  function col(hex, text) {
    return '{' + hex + '-fg}' + text + '{/}';
  }

  function render() {
    var t = currentTheme;
    var accent    = t ? t.accent         : '#4da6ff';
    var bright    = t ? t.textAccent     : '#4da6ff';
    var muted     = t ? t.textMuted      : '#666666';
    var secondary = t ? t.textSecondary  : '#888888';

    var sep = ' ' + col(muted, '│') + ' ';

    // Left side: brand name
    var left = ' ' + col(accent, '{bold}FLXIFY{/bold}');

    // Build a key-chord + action-label hint pair
    function hint(chord, label) {
      return col(bright, chord) + ' ' + col(secondary, label);
    }

    // Wrap indicator: uppercase + accent when ON, lowercase + muted when OFF
    var wrapIndicator = wrapEnabled
      ? col(accent, '[WRAP]')
      : col(muted,  '[wrap]');

    var right = [
      hint('^B', 'palette'),
      hint('^S', 'save'),
      hint('^T', 'theme'),
      hint('^Q', 'quit'),
      hint(':set', 'wrap'),
      wrapIndicator
    ].join(sep) + ' ';

    // Use visible lengths (no blessed tags) for padding math
    var leftVisible  = stripTags(left).length;
    var rightVisible = stripTags(right).length;
    var padding = screen.width - leftVisible - rightVisible;
    if (padding < 1) padding = 1;
    var spaces = new Array(padding + 1).join(' ');

    box.setContent(left + spaces + right);
    screen.render();
  }

  /**
   * Apply a new theme to the top bar. Updates fg/bg and re-renders.
   * @param {object} newTheme  - Theme object from themes.js
   */
  function applyTheme(newTheme) {
    currentTheme = newTheme;
    box.style.fg = newTheme.textPrimary;
    box.style.bg = newTheme.bgSecondary;
    render();
  }

  /**
   * Update the wrap mode indicator in the top bar.
   * @param {boolean} enabled
   */
  function setWrapMode(enabled) {
    wrapEnabled = !!enabled;
    render();
  }

  render();

  // Re-render on resize to keep padding correct
  screen.on('resize', function () {
    render();
  });

  return {
    box: box,
    update: render,
    applyTheme: applyTheme,
    setWrapMode: setWrapMode
  };
}

module.exports = { createTopBar: createTopBar };
