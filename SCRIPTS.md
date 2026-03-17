# Scripts Reference

All 113 scripts available in Flxify, grouped by category.

## Formatting

| Script | Description |
|--------|-------------|
| Format JSON | Formats JSON with proper indentation and validates syntax |
| Format XML | Formats XML and HTML with proper indentation and line breaks |
| Format CSS | Formats CSS with proper indentation and line breaks |
| Format SQL | Formats SQL queries with proper indentation and line breaks |
| FormatCSV | *(file missing)* |

## Minification

| Script | Description |
|--------|-------------|
| Minify JSON | Removes whitespace to compress JSON into a single line |
| Minify XML | Removes whitespace and comments to compress XML and HTML |
| Minify CSS | Removes whitespace and comments to compress CSS |
| Minify SQL | Removes whitespace and comments to compress SQL queries |

## Encoding

| Script | Description |
|--------|-------------|
| Base64 Encode | Encodes text to Base64 format for safe data transfer |
| Base64 Decode | Decodes Base64-encoded text back to plain text |
| URL Encode | Encodes special characters for safe use in URLs |
| URL Decode | Decodes URL-encoded characters (e.g., %20 to space) |
| HTML Encode | Encodes special characters to HTML entities (e.g., & to &amp;) |
| HTML Decode | Decodes HTML entities to readable characters (e.g., &amp; to &) |
| HTML Encode all characters | Encodes every character to HTML numeric entities for obfuscation |
| URL Entity Encode | Encodes every character to percent-encoded format |
| URL Entities Decode | Decodes percent-encoded characters (e.g., %48%65%6C%6C%6F to Hello) |
| To Unicode Escaped String | Converts text to Unicode escape sequences (\uXXXX format) |
| From string from unicode scaped | Decodes Unicode escape sequences (\uXXXX) to readable text |

## Hashing

| Script | Description |
|--------|-------------|
| MD5 Checksum | Generates MD5 hash of text in hexadecimal format |
| SHA1 Hash | Generates SHA1 hash of text in hexadecimal format |
| SHA256 Hash | Generates SHA256 hash of text in hexadecimal format |
| SHA512 Hash | Generates SHA512 hash of text in hexadecimal format |

## Conversion

| Script | Description |
|--------|-------------|
| JSON to YAML | Converts JSON to YAML format |
| YAML to JSON | Converts YAML format to JSON |
| JSON to CSV | Converts JSON array of objects to CSV format with headers |
| CSV to JSON | Converts CSV to JSON array of objects using first row as headers |
| CSV to JSON (headerless) | Converts CSV to JSON array of arrays without using headers |
| JSON to Query String | Converts JSON object to URL query string parameters |
| Query String to JSON | Converts URL query string parameters to JSON object |
| Hex to RGB | Converts hex color codes to RGB format (e.g., #FF5733 to 255,87,51) |
| RGB to Hex | Converts RGB color values to hex format (e.g., 255,87,51 to #FF5733) |
| Hex to Dec | Converts hexadecimal numbers to decimal, processing each line separately |
| Hex To ASCII | Converts hexadecimal representation to ASCII text |
| ASCII To Hex | Converts ASCII text to hexadecimal representation |
| Decimal to Binary | Converts decimal numbers to binary, processing each line separately |
| Binary to Decimal | Converts binary numbers to decimal, processing each line separately |
| Decimal to Hex | Converts decimal numbers to hexadecimal, processing each line separately |
| Well-Known Binary to Text | Converts hex-encoded Well-Known Binary (WKB) to Well-Known Text (WKT) format |
| Well-Known Text to Binary | Converts Well-Known Text (WKT) to hex-encoded Well-Known Binary (WKB) format |
| JS To PHP | Converts JavaScript objects or arrays to PHP array syntax |
| TSV to JSON | Converts tab-separated values to JSON array of objects |
| JS Object to JSON | Converts JavaScript object literals to valid JSON format |
| Convert to pretty markdown table | Converts CSV, TSV, or markdown tables to formatted markdown table with aligned columns |
| iOS Localizables to Android Strings | Converts iOS Localizable.strings format to Android strings.xml format |
| Android Strings to iOS Localizables | Converts Android strings.xml format to iOS Localizable.strings format |
| Digi to ASCII | Converts space or comma-separated ASCII codes to text characters |
| Fish PATH Hex Converter | Escapes special characters to hex for Fish shell PATH variables |

## Text Case

| Script | Description |
|--------|-------------|
| Upcase | Converts all text to uppercase |
| Downcase | Converts all text to lowercase |
| Camel Case | Converts text to camelCase format, removing spaces and capitalizing words |
| Kebab Case | Converts text to kebab-case format, separating words with hyphens |
| Snake Case | Converts text to snake_case format, separating words with underscores |
| Start Case | Converts text to Start Case, capitalizing the first letter of each word |
| Sponge Case | Randomly alternates uppercase and lowercase letters for sarcastic mocking |
| Toggle Camel and Hyphen | Toggles between camelCase and hyphen-case (kebab-case) |
| Deburr | Removes accents and diacritics, converting to basic Latin characters |

## Text Manipulation

| Script | Description |
|--------|-------------|
| Sort lines | Sorts lines alphabetically (toggles reverse if already sorted) |
| Natural Sort Lines | Sorts lines alphabetically with natural number ordering (1, 2, 10 not 1, 10, 2) |
| Reverse Lines | Reverses the order of lines (last line becomes first) |
| Reverse String | Reverses character order in text (supports Unicode and emoji) |
| Shuffle Lines | Randomly shuffles the order of lines |
| Shuffle characters | Randomly shuffles all characters in text |
| Remove Duplicate Lines | Removes duplicate lines, keeping only the first occurrence of each |
| Join Lines | Joins all lines together with no separator or delimiter |
| Join Lines With Comma | Joins all lines together separated by commas |
| Join Lines With Space | Joins all lines together separated by spaces |
| Collapse lines | Removes all line breaks, joining text into a single line |
| Trim | Removes whitespace from the beginning and end of text |
| Trim Start | Removes whitespace from the beginning of text |
| Trim End | Removes whitespace from the end of text |
| Add Slashes | Escapes quotes, backslashes, and null characters with backslashes |
| Remove Slashes | Removes backslash escapes from quotes and special characters |
| Replace Smart Quotes | Replaces curly/smart quotes with straight quotes |
| Markdown Quote | Prefixes each line with > to create markdown blockquotes |
| Rot13 | Applies ROT13 cipher, shifting letters by 13 positions (reversible) |
| Add Line Numbers | Prepends line numbers to each line with aligned spacing |
| Remove Line Numbers | Removes line number prefixes from each line |
| Spaces to Tabs | Converts leading spaces to tabs, auto-detecting 2 or 4-space indentation |
| Tabs to Spaces | Converts leading tabs to 2-space indentation |
| Sort JSON | Sorts JSON object keys alphabetically and array elements |
| Line compare | Checks if all lines match the first line and reports differences |
| List to HTML list | Converts comma-separated list to HTML unordered list and vice versa |
| Wadsworth Constant | Removes first 30% of text (Wadsworth Constant: skip boring intro) |
| Defang | Makes URLs non-clickable by replacing dots and protocols for safe sharing |
| Refang | Restores defanged URLs to clickable format (reverses defang operation) |
| PHP Unserialize | Converts PHP serialized data to JSON format |
| Escape Line Feeds | Converts actual newlines to literal \n sequences |
| Unescape Line Feeds | Converts literal \n and \r\n sequences to actual newlines |

## Generation

| Script | Description |
|--------|-------------|
| UUID Generator | Generates random v4 UUIDs. Select a number to generate multiple (max 1000) |
| ULID Generator | Generates random ULIDs (Universally Unique Lexicographically Sortable Identifiers). Select a number to generate multiple (max 1000) |
| Lorem Ipsum | Generates random Lorem Ipsum placeholder text (100 words) |
| New Boop Script | Inserts a template for creating new Flxify scripts |
| Generate hashtag | Converts text to camelCase hashtag format by removing special characters |
| Contrasting Color | Determines best contrasting text color (black/white) for hex colors with WCAG ratios |
| Create Project Glossary Markdown File | Generates a markdown glossary template with A-Z sections for project documentation |

## Extraction

| Script | Description |
|--------|-------------|
| Extract URLs | Extracts all unique HTTP/HTTPS URLs from text, one per line |
| Extract Emails | Extracts all unique email addresses from text, one per line |
| Extract Phone Numbers | Extracts unique US and international phone numbers from text, one per line |
| Count Characters | Counts the total number of characters in text |
| Count Words | Counts the total number of words in text |
| Count Lines | Counts the total number of lines in text |
| Character Frequency | Count occurrences of each character in text |
| Sum All | Sums all numbers in text and displays calculation with total |
| Calculate Size (Bytes) | Calculates UTF-8 byte size of text and displays in bytes, KB, or MB |

## Developer Utilities

| Script | Description |
|--------|-------------|
| JWT Decode | Decodes JWT tokens and displays header, payload, and signature as JSON |
| Regex Escape | Escapes special regex characters for use in regular expressions |
| Eval Javascript | Executes JavaScript code and appends the output as a comment |
| Date to Timestamp | Converts readable date strings to Unix timestamp (seconds since epoch) |
| Date to UTC | Converts date strings or Unix timestamps to UTC format |
| Time to seconds | Converts time duration (hh:mm:ss) to total seconds |
| Test Script | Developer test script demonstrating syntax highlighting and features |

