# Changelog

## [0.7.0] - 2026-03-17

### Fixed
- **To Unicode Escaped String** — Characters with codes < 16 (e.g., tab = 9) produced `\u9` instead of `\u0009`. Now always pads to 4 hex digits.
- **Reverse String** — Trailing newline was moved to position 0, inserting a blank line at the top of the output. Trailing newlines are now stripped before reversing and re-appended after.
- **Generate Hashtag** — Description corrected from "camelCase" to "PascalCase" to match actual output format (e.g., `Hello World` → `#HelloWorld`).

## [0.6.0] - 2026-03-13

### Added
- Character Frequency script — counts occurrences of each character in text, sorted by frequency
- Total scripts now at 112

## [0.5.0] - 2026-03-10

### Added
- Extract Phone Numbers script — extracts unique US and EU/international phone numbers from text
- Total scripts now at 111

## [0.4.0] - 2026-03-09

### Added
- ULID Generator script — generates Universally Unique Lexicographically Sortable Identifiers
- Total scripts now at 110

## [0.1.0] - 2026-03-06

### Added
- Initial release with 107+ text transformation scripts
- Command Palette integration via `Flxify: Run Script`
- Keyboard shortcut: `Cmd+Shift+B` (macOS) / `Ctrl+Shift+B` (Windows/Linux)
- Multi-cursor support — transform multiple selections independently
- Dynamic script loading — drop a `.js` file in `scripts/` and it works
- Categories: Formatting, Minification, Encoding, Hashing, Conversion, Text Case, Text Manipulation, Generation, Extraction, Developer Utilities
- Error handling with VS Code notifications
- Single undo step per transformation
