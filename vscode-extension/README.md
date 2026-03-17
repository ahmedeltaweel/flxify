# Flxify

> **112+ text transformation scripts for developers.** Format JSON, encode Base64, generate UUIDs, hash text, convert cases, sort lines, and more — without leaving your editor.

Flxify is the Swiss Army knife for text transformations in VS Code. Select text, pick a script, done.

---

## Quick Start

1. **Select text** in any file (or leave empty to transform the entire document)
2. Press **`Cmd+Shift+B`** (macOS) or **`Ctrl+Shift+B`** (Windows/Linux)
3. **Search** and pick a script from the list
4. Your text is transformed in place

You can also open the Command Palette (`Cmd+Shift+P`) and type **"Flxify: Run Script"**.

---

## Features

### 112+ Built-in Scripts

| Category | Examples |
|----------|---------|
| **Formatting** | Format JSON, Format XML, Format CSS, Format SQL |
| **Minification** | Minify JSON, Minify XML, Minify CSS, Minify SQL |
| **Encoding / Decoding** | Base64 Encode/Decode, URL Encode/Decode, HTML Encode/Decode, JWT Decode |
| **Hashing** | MD5, SHA-1, SHA-256, SHA-512 |
| **Conversion** | JSON ↔ YAML, JSON ↔ CSV, JSON ↔ Query String, Hex ↔ RGB |
| **Text Case** | camelCase, snake_case, kebab-case, UPPER CASE, lower case, Start Case, Sponge Case |
| **Text Manipulation** | Sort Lines, Reverse Lines, Remove Duplicates, Join Lines, Trim, Collapse Whitespace |
| **Generation** | UUID Generator, Lorem Ipsum |
| **Extraction** | Extract Emails, Extract URLs, Extract Phone Numbers |
| **Developer Utilities** | Regex Escape, ROT13, Timestamp Conversions, Markdown Quote, Line Numbers |

### Multi-Cursor Support

Select multiple regions with `Cmd+D` or `Alt+Click` — each selection is transformed independently in a single undo step.

### Works on Full Documents

No selection? No problem. Flxify runs on the entire document content automatically.

### Extensible

Add your own scripts by dropping a `.js` file into the `scripts/` folder:

```javascript
/**
  {
    "api": 1,
    "name": "My Custom Script",
    "description": "Does something useful",
    "author": "You",
    "icon": "star",
    "tags": "custom,transform"
  }
**/

function main(state) {
  // state.text = selected text (or full document if nothing selected)
  state.text = state.text.toUpperCase();
}
```

Reload VS Code and your script appears in the picker automatically.

---

## Examples

### Format JSON
**Before:**
```
{"name":"Flxify","version":"0.1.0","scripts":{"compile":"tsc"}}
```
**After:**
```json
{
  "name": "Flxify",
  "version": "0.1.0",
  "scripts": {
    "compile": "tsc"
  }
}
```

### Base64 Encode
**Before:** `Hello, World!`
**After:** `SGVsbG8sIFdvcmxkIQ==`

### Generate UUID
**Before:** *(any text or empty)*
**After:** `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d`

### JSON to YAML
**Before:**
```json
{"database": {"host": "localhost", "port": 5432}}
```
**After:**
```yaml
database:
  host: localhost
  port: 5432
```

### Sort Lines
**Before:**
```
banana
apple
cherry
```
**After:**
```
apple
banana
cherry
```

### Extract Phone Numbers
**Before:**
```
Contact us at (555) 123-4567 or +44 20 7946 0958.
Email: info@example.com, call +1-800-555-0199.
```
**After:**
```
(555) 123-4567
+44 20 7946 0958
+1-800-555-0199
```

---

## Script API

Scripts receive a `state` object with the following API:

| Property / Method | Type | Description |
|-------------------|------|-------------|
| `state.text` | `string` (get/set) | Selected text if available, otherwise full document |
| `state.selection` | `string \| null` (get/set) | Currently selected text |
| `state.fullText` | `string` (get/set) | Entire document content |
| `state.isSelection` | `boolean` (get) | Whether text is currently selected |
| `state.postError(msg)` | `method` | Show an error notification |
| `state.postInfo(msg)` | `method` | Show an info notification |
| `state.insert(text)` | `method` | Insert text at the cursor position |

Scripts can also import bundled libraries:

```javascript
const { encode } = require('@flxify/base64');
const { camelCase } = require('@flxify/lodash.boop');
const jsYaml = require('@flxify/js-yaml');
```

**Available libraries:** base64, hashes (MD5/SHA), he (HTML entities), js-yaml, lodash.boop (case utils), papaparse (CSV), vkBeautify (XML/SQL/CSS formatting).

---

## Keyboard Shortcut

| Platform | Shortcut |
|----------|----------|
| macOS | `Cmd+Shift+B` |
| Windows / Linux | `Ctrl+Shift+B` |

To customize, open Keyboard Shortcuts (`Cmd+K Cmd+S`) and search for `flxify.runScript`.

---

## Links

- [Flxify Web App](https://flxify.dev) — Use Flxify in your browser
- [Changelog](CHANGELOG.md)

## Author

**Ahmed El Taweel**

- [GitHub](https://github.com/ahmedeltaweel)
- [LinkedIn](https://linkedin.com/in/ahmedeltaweel)
- [Twitter/X](https://twitter.com/iAhmedeltaweel)

---

## License

MIT
