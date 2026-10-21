# English Learning Library

A separate, installable static PWA that brings together selected vocabulary and sentence collections while leaving every source app unchanged.

## Sections

- Vocabulary: C2 Advanced Vocabulary and C2 Vocab Upgrade.
- Sentence Practice: Advanced English Expressions, Advanced English Conversations, and Sentence Steps.

The C1/C2 Fluency Textbook remains separate because it is organized as chapters and lessons. Idiom Atlas remains separate as a personal phrase notebook. The investment glossary contained in the C2 Sentence repository is not included.

Content is copied into data/content.json with its source repository and record ID retained. Duplicate or similar entries are preserved with their original context.

## Personal data

Favorites, last-viewed positions, the Chinese visibility preference, and entries added in the app are stored in this browser on this device. Use Backup and Restore to transfer those personal settings and entries. There is no account, remote sync, analytics, or GitHub token. The optional OpenAI API key is held only in the local server process while it runs; it is not saved in browser storage, backups, or project files.

## Run locally

Use Python 3.10 or newer. In PowerShell, open this folder and run:

    python server.py

The server asks for an OpenAI API key once at startup. Paste a key to enable AI autofill, or press Enter to run with manual entry only. The key is held in the local server process memory; it is not saved to the project or browser. Press Ctrl+C to stop the server. Then open http://127.0.0.1:8000.

AI autofill makes a request only when you choose AI autofill and press **Fill details with AI**. It sends the word or sentence to OpenAI and may incur API usage charges. Review the suggestions before saving. Manual entry does not call the AI service. AI autofill requires internet access; manual entry and the rest of the local library remain available without an API key.

The included server binds only to this computer. AI autofill is available in the local version; a future public deployment would need a separately secured backend. Opening index.html directly with file:// does not support content loading or offline service workers.

## Source repositories

- https://github.com/dksbluesky/C2_vocabulary
- https://github.com/dksbluesky/C2_vocabulary_master
- https://github.com/dksbluesky/C2_sentence
- https://github.com/dksbluesky/B2-C2-sentence
- https://github.com/dksbluesky/sentence-learning-pwa

The existing source repositories and the existing English folder are not modified by this project.

