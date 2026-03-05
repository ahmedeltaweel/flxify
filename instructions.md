I am building a web-based developer text utility app called Flxify (flxify.dev). I have JavaScript scripts that perform text transformations. I need a simple, single-page web application (HTML/CSS/JS) that provides an environment for running these scripts.

Requirements:

The Editor: A dark-themed, full-screen CodeMirror 6 editor with syntax highlighting, no borders, and a monospaced font.

The Command Palette: A hidden search overlay that appears when pressing Cmd+B (or Ctrl+B). It should list available scripts and allow fuzzy searching. Pressing 'Enter' on a result should execute that script.

The Flxify Bridge: This is the most important part. You must create a BoopState class that provides the script execution context. When a script's main(state) function is called, the state object must provide:

state.fullText: The entire text in the editor.

state.selection: The currently selected text.

state.text: A getter/setter that targets the selection (or the whole text if nothing is selected).

state.postError(message): A way to display an error (like a toast or console log).

state.postInfo(message): A way to display an info message.

Script Execution: The app should be able to 'register' scripts. Each script is a string containing a comment block with metadata and a main(state) function. Use new Function() or a similar method to scoped-execute the script's main function against the BoopState instance.

Styling: Keep it minimal and 'developer-focused' (deep greys, subtle borders, high contrast for text).

Please provide the code in three blocks: index.html, style.css, and app.js.

task:
check the project structure and put the structure in structure.md file
plan the implementation based on the knowledge you have from checking the project and the structure you have.
