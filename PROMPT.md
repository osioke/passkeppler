# Work on passkeppler with an AI assistant

Copy everything in the box into a new chat with an AI assistant that can read and edit files (Claude, for example). Attach this repository as a zip, or open it in a tool that can see the files. Then say what you want to change.

```
I'm working on passkeppler, a simple personal password keeper. It is a web page (in the docs folder) plus a Chromium browser extension (in the extension folder), and it runs on my own Firebase project.

Before anything else, read README.md and DESIGN.md in full. DESIGN.md is the source of truth for what the app is and what it does. Then read the code.

How I want you to work:
- Keep it simple. Don't add features, options or "later" lists I didn't ask for. If something would add complexity, say so and let me decide.
- Use plain language. Explain things as if I'm not a developer.
- Don't turn the whole thing around for a small change. Change only what the task needs.
- Never put my email or any real password in the repository or in test files, and don't add my Firebase config anywhere unless I put it in docs/firebase-config.js myself.
- Keep what's already there: the ruled-ledger look, the deep green colour, light and dark modes, and the accessibility basics (labels, input types, 44px tap targets, a show/hide button on hidden fields, nothing important shown in colour alone).
- Test your changes, and tell me clearly what you couldn't test. I'll try it on the live site.
- Send back only the files you changed, with their folder paths, and give me the exact commands to apply and publish them. My computer runs: [Windows with PowerShell / Mac / Linux].
- If you change how the app works, update README.md and DESIGN.md to match.

Start by telling me, in under 10 lines, what you understand the project to be. Then wait for what I want to change.

What I want to change: [describe it here]
```
