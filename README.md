# ChatLume - Private WhatsApp Chat Viewer

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

ChatLume is a fully static, privacy-first WhatsApp export viewer, analyzer, and Wrapped generator. It runs entirely in the browser, reads exported `.txt` files or `.zip` exports locally, and renders them as a polished WhatsApp-style chat interface with search, analytics, media preview, and shareable chat summaries.

Live demo: https://chatlume.parassharma.in

ChatLume is not affiliated with or endorsed by WhatsApp Inc.

## What ChatLume Does

- Opens WhatsApp `.txt` exports directly in the browser.
- Opens WhatsApp `.zip` exports that contain a chat `.txt` file and attachments.
- Renders messages in a familiar chat interface with grouped bubbles, timestamps, sender colors, read ticks, and date separators.
- Supports multiline messages and several WhatsApp export date styles, including `/`, `-`, and `.` separators.
- Shows images, stickers, videos, audio files, documents, contacts, and archives from ZIP exports.
- Shows clear missing-attachment cards when the text export references media that is not present in the ZIP.
- Provides message search with highlights and previous/next navigation.
- Adds a jump-to-date action for long histories.
- Generates an analytics drawer with total messages, media count, emoji usage, sender split, and activity breakdowns.
- Generates a downloadable ChatLume Wrapped image for a loaded chat.
- Supports dark and light themes.
- Includes a settings drawer for timestamp format, seconds, date format, brackets, sender names, read ticks, and rich text rendering.
- Works as a Progressive Web App after installation and core asset caching.
- Stays fully static: no backend, no database, no server upload, no account system.

## Privacy Model

ChatLume is designed around one rule: your chat export should stay on your device.

- Files are selected through the browser File API.
- `.txt` chat contents are read in local browser memory.
- `.zip` files are unpacked locally with JSZip.
- Attachments are decoded locally only when needed.
- No chat file, message, name, attachment, statistic, or generated Wrapped image is uploaded by ChatLume.
- There is no app backend, API endpoint, database, analytics pipeline, or authentication service.
- External libraries are loaded from CDNs in the current static build, but the user-selected chat file is not sent to those CDNs. For a stricter offline/self-hosted build, vendor those scripts locally and update the HTML references.

## How It Works

### 1. Page Load

The app is a static site made of HTML, CSS, JavaScript, icons, a manifest, and a service worker.

- `index.html` is the landing page.
- `public/viewer.html` is the main app experience.
- `js/script.js` contains parsing, rendering, search, analytics, media loading, theme handling, modal handling, and PWA behavior.
- `css/style.css` contains the landing page, documentation pages, app shell, drawers, chat UI, media UI, Wrapped UI, and responsive layout.
- `manifest.json` defines the PWA name, icons, start URL, theme colors, and shortcut.
- `sw.js` caches core static files for offline use.
- `robots.txt` and `sitemap.xml` point crawlers to the canonical static pages.

### 2. File Selection

The user selects or drops a WhatsApp export:

- `.txt` files are read with `FileReader.readAsText`.
- `.zip` files are parsed with JSZip.
- For ZIP exports, ChatLume finds the first `.txt` entry as the chat transcript.
- Other ZIP entries are indexed as possible attachments.
- Attachment entries are not immediately converted to Blob URLs. They remain in the local ZIP index until a visible media element, preview, or download needs them.

This keeps initial load much lighter for media-heavy exports.

### 3. Chat Parsing

ChatLume parses the export line by line in the browser.

The parser recognizes message lines like:

```text
01/02/2026, 10:15 AM - Paras: Hello
[01.02.26, 22:15:30] Friend: Hallo
```

It separates:

- Date and time
- Sender name
- Message content
- System messages
- Multiline continuations
- Date separators
- Attachment references

The parser also strips invisible Unicode direction/control characters that WhatsApp exports sometimes include.

Supported behaviors include:

- Date separators such as `/`, `-`, and `.`
- 12-hour and 24-hour time formats
- Optional square brackets
- Optional seconds
- Multiline message continuation
- System messages without a sender
- German-style attachment labels such as `Datei angehängt`
- Omitted media markers such as `<Media omitted>`

Date order is inferred from parsed date labels, with a locale-aware fallback. This helps date jump work across common DMY, MDY, and YMD exports.

### 4. Message State

Parsed entries are stored in memory as lightweight JavaScript objects.

Common entry types:

- `date`: a date separator shown between message groups.
- `msg`: a normal message with sender, time, text, ownership, and media items.
- `system`: WhatsApp system text such as encryption notices or group updates.

The app keeps a full parsed index in memory because search, date jump, analytics, and Wrapped need fast local access without a backend. The rendered DOM, however, is kept bounded.

### 5. Rendering and Scrolling

ChatLume does not render the entire chat into the DOM.

Instead, it uses a sliding message window:

- It starts near the bottom of the chat.
- As you scroll upward, older nearby messages are added.
- As you scroll downward, newer nearby messages are added.
- Content from the opposite side is dropped once the render window exceeds the configured limit.
- Scroll anchoring keeps the visible position stable while the window changes.

This lets very long chats remain usable because the browser is not asked to keep every bubble, image, video, and date marker mounted at once.

### 6. Media Loading

ZIP media is memory-aware.

The app first builds a lookup table of attachment names and ZIP paths. When a message references an attachment, ChatLume links that message to the indexed ZIP entry.

Media lifecycle:

1. Attachment is indexed from the ZIP.
2. Message renders a placeholder or lazy media element.
3. When the element enters the viewport, the ZIP entry is decoded into a Blob.
4. A temporary object URL is created for browser display.
5. The media is shown inline or in the preview modal.
6. When the media leaves the render window and is not open in the modal, its object URL is revoked.

This add-and-drop behavior keeps memory usage lower during long sessions. Large files can still take time to decode because all work happens locally, but ChatLume avoids loading all attachments into Blob URLs up front.

### 7. Search

Search runs locally over the parsed message index.

- The search box is debounced so huge chats are not rescanned on every keystroke.
- Matches include sender names, message text, and media names.
- Results are stored as message IDs.
- Previous and next buttons jump through results.
- Matching text is highlighted in the rendered window.

Search does not contact any server.

### 8. Date Jump

The header menu includes a date picker.

When a date is selected:

- ChatLume parses date markers from the loaded export.
- It tries to find an exact date marker.
- If no exact marker exists, it jumps to the closest previous valid date.
- The render window is repositioned around that date.

Accuracy depends on the date labels present in the WhatsApp export and how clearly the export format maps to DMY, MDY, or YMD.

### 9. Analytics

Analytics are computed during parsing and from the parsed local state.

ChatLume tracks:

- Total parsed messages
- Total referenced media items
- Missing attachment count
- Sender message counts
- Sender percentage split
- Emoji usage
- Hourly activity distribution

The Analytics drawer shows a compact breakdown with counts, top emojis, and per-sender contribution bars.

### 10. ChatLume Wrapped

Wrapped turns a loaded chat into a downloadable visual summary.

It uses local chat statistics to show:

- Chat title
- Date range
- Total messages
- Total words
- Shared media count
- Peak activity hour
- Most-used emojis
- Top contributors

The image is generated in the browser using `html2canvas`. The generated image is downloaded locally; it is not uploaded by ChatLume.

### 11. Theme and PWA

The app supports dark and light themes.

- Theme choice is stored in `localStorage`.
- The PWA install button appears when the browser fires `beforeinstallprompt`.
- The service worker caches core files for offline use.
- HTML pages use a network-first strategy so updates can propagate.
- CSS, JS, icons, manifest, sitemap, and other static assets use a stale-while-revalidate style cache.

## Features

### Import and Parsing

- `.txt` import
- `.zip` import with media
- Local JSZip extraction
- Multiline message support
- Date separator support
- System message support
- Common localized attachment label support
- Missing media detection

### Viewer

- WhatsApp-style bubbles
- Grouped messages
- Date separators
- Sender colors
- Own-message detection using the entered display name
- URL linkification
- Basic WhatsApp-style formatting for `*bold*`, `_italic_`, and `~strikethrough~`
- Inline image, sticker, video, and audio display
- Document preview/download actions
- Media modal with download support
- Responsive desktop and mobile layout

### Customization

- Original, 12-hour, or 24-hour message timestamps
- Optional seconds in timestamps
- Optional square or round timestamp brackets
- Original, DMY, MDY, YMD, or long date labels
- Configurable numeric date separator
- Optional square or round date brackets
- Sender name visibility toggle
- Decorative read tick visibility toggle
- Rich text/link rendering toggle
- Settings saved locally in `localStorage`

### Performance

- Streaming-style line parsing that avoids splitting the whole export into a second giant line array
- Bounded sliding render window
- Lazy media decoding from ZIP entries
- Object URL cleanup for off-screen media
- Debounced search scans
- Lazy image/video/audio hydration through `IntersectionObserver`
- Loading overlay that prevents accidental double-loads

### Analytics and Wrapped

- Message totals
- Media totals
- Sender split
- Emoji ranking
- Hourly activity tracking
- Wrapped image generation
- Local download of Wrapped image

### Privacy and Safety

- No backend
- No uploads
- No database
- No accounts
- HTML escaping for user-generated message content
- Escaped search regex input
- External links use `rel="noopener noreferrer"`
- Local-only file handling through browser APIs

### SEO and Branding

- Canonical domain: `https://chatlume.parassharma.in`
- Page-specific titles and descriptions
- Open Graph metadata
- Twitter card metadata
- JSON-LD `WebApplication` structured data
- `robots.txt`
- `sitemap.xml`
- PWA manifest and icons

## Limitations

- Browser memory and CPU limits still apply, especially with huge media files.
- The parsed message index stays in memory so search, date jump, analytics, and Wrapped can remain local and fast.
- Very large ZIP files can take time to parse and decode because there is intentionally no server doing work.
- Date-jump accuracy depends on the export date format and available date markers.
- Very uncommon localized WhatsApp export phrases may need additional parser rules.
- CDN-loaded libraries require internet unless you vendor them locally.

## Quick Start

1. Export a chat from WhatsApp.
2. Choose `Without Media` for fastest parsing, or include media for inline previews.
3. Open `index.html` or visit the live demo.
4. Go to the Viewer.
5. Enter your display name exactly as it appears in the export.
6. Upload the `.txt` or `.zip` file.
7. Click `Load Chat`.

## Exporting WhatsApp Chats

### iPhone

1. Open the chat in WhatsApp.
2. Tap the contact or group name.
3. Scroll down and tap `Export Chat`.
4. Choose `Without Media` or `Attach Media`.
5. Save/share the exported file.

### Android

1. Open the chat in WhatsApp.
2. Tap the three-dot menu.
3. Choose `More`.
4. Tap `Export chat`.
5. Choose `Without media` or `Include media`.
6. Save/share the exported file.

## Local Development

This project has no build step.

Open directly:

```bash
open index.html
```

Or serve statically:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Serving over HTTP is recommended for consistent service worker, manifest, and asset behavior.

## Deployment

Deploy the repository as a static site. The canonical deployment is:

```text
https://chatlume.parassharma.in
```

Make sure these files are served from the site root:

- `index.html`
- `manifest.json`
- `sw.js`
- `robots.txt`
- `sitemap.xml`
- `assets/`
- `css/`
- `js/`
- `public/`

After changing cached assets, update `CACHE_NAME` in `sw.js` when you want existing PWA users to receive a fresh cache.

## Project Structure

```text
.
├── assets/
│   ├── favicon.ico
│   ├── icon-192.png
│   └── icon-512.png
├── css/
│   └── style.css
├── js/
│   └── script.js
├── public/
│   ├── analyzer.html
│   ├── how-it-works.html
│   ├── how-to-export.html
│   ├── how-to-use.html
│   ├── privacy.html
│   ├── viewer.html
│   └── wrapped.html
├── index.html
├── manifest.json
├── robots.txt
├── sitemap.xml
└── sw.js
```

## Tech Stack

- Vanilla JavaScript
- CSS3
- HTML5 File API
- [JSZip](https://stuk.github.io/jszip/) for ZIP parsing
- [html2canvas](https://html2canvas.hertzen.com/) for Wrapped image export
- [Phosphor Icons](https://phosphoricons.com/)
- Progressive Web App manifest and service worker

## Notes for Contributors

- Keep the app static and local-first.
- Do not add a backend, telemetry, tracking, or upload flow for chat contents.
- Escape user-generated content before rendering.
- Be careful with object URLs. Revoke them when media leaves use.
- Preserve large-chat behavior by keeping the DOM window bounded.
- Prefer small, focused parser additions for new WhatsApp export formats.
- Test both `.txt` and `.zip` exports when changing parsing or media behavior.

## Community Credit

- German export parsing and attachment-label feedback came from Reddit user `u/jacckyryan`.

## Contributing

1. Fork the repository.
2. Create a branch: `git checkout -b feature/your-feature`.
3. Commit changes: `git commit -m "feat: add your feature"`.
4. Push branch and open a Pull Request.

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

## Author

Paras Sharma

- Website: [parassharma.in](https://parassharma.in)
- GitHub: [@parassharma2306](https://github.com/ParasSharma2306)
