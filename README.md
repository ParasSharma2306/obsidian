# ChatLume

Free, private chat export viewer. Your chats stay on your device.

## The Story

I built ChatLume on February 10th, 2026 for my girlfriend. She wanted to view her WhatsApp chats in a cleaner way and see some stats — who texted the most, favorite emojis, that kind of thing. But she didn't want to upload anything to the cloud or sign up for accounts.

So I built something simple: a tool that runs entirely in the browser. No servers. No tracking. No bullshit.

Then people started asking for it. So I released it.

## Features

- **View WhatsApp exports** — .txt and .zip files
- **View Instagram DMs** — JSON export zips
- **See your stats** — message counts, emoji usage, activity by hour
- **Completely private** — everything runs in your browser, nothing uploaded
- **Works offline** — once the page loads, you don't need internet
- **Free forever** — no accounts, no premium, no paywalls
- **Large file support** — ZIP exports up to 10 GB+ on modern browsers

## How to Use

1. Export your chat from WhatsApp or Instagram
2. Go to [chatlume.parassharma.in](https://chatlume.parassharma.in)
3. Upload your file
4. View your chat

[How-to guides](https://chatlume.parassharma.in/public/how-to-export.html) · [Privacy policy](https://chatlume.parassharma.in/privacy.html)

## How It Works

ChatLume processes everything locally using browser APIs — no server ever sees your data.

**ZIP parsing pipeline (v1.1.0+):**

1. The selected `File` is wrapped in a `BlobReader` from [zip.js](https://gildas-lormeau.github.io/zip.js/). The ZIP's central directory is read as metadata only — the full file is never buffered into an `ArrayBuffer`.
2. `ZipReader.getEntries()` returns entry metadata (filename, size, offset). No file data is decompressed at this stage.
3. The chat text entry (`_chat.txt` for WhatsApp, `message_N.json` for Instagram) is decompressed on demand using the browser's native `DecompressionStream` API, streamed directly into a `WritableStream`.
4. The `WritableStream` decoder processes decompressed chunks with `TextDecoder` (streaming mode), splits on newlines, and feeds each line into the message parser incrementally — the full text string is never materialized in memory.
5. Media files (images, videos, audio) are not pre-loaded. Each entry's `ZipEntry` object is stored alongside its metadata. When a media item scrolls into view, `entry.getData(new BlobWriter(mimeType))` decompresses that single entry into a `Blob`, and `URL.createObjectURL()` produces a temporary URL. The URL is revoked when the item leaves the render window.

**Peak RAM usage for a 5 GB ZIP is roughly:** decompression buffer (a few MB) + current JS chunk (a few KB) + accumulated parsed message objects. The ZIP itself is never buffered. The practical ceiling is available RAM for the message object graph, not the file size.

## Browser Support

| Browser | Minimum Version | Large File Support |
|---|---|---|
| Chrome / Edge | 80+ | ✅ Up to ~10 GB |
| Firefox | 79+ | ✅ Up to ~10 GB |
| Safari | 16.4+ | ✅ Up to ~10 GB |
| Older browsers | — | ⚠️ 1 GB limit |

On browsers without `DecompressionStream` and `WritableStream`, ChatLume falls back to a compatibility mode and enforces a 1 GB cap with a visible warning banner.

## Performance

On a modern machine (M-series Mac or recent Intel/AMD), a **5 GB WhatsApp ZIP** with several years of messages typically:

- Opens and scans entries in under 1 second (only the ZIP directory is read)
- Streams and parses the chat text in 5–30 seconds depending on message count
- Media loads lazily on demand — no upfront cost for attachments

## v1.1.0

### Streaming ZIP Engine
Replaced JSZip with zip.js using BlobReader — the ZIP archive is never buffered into
memory. zip.js reads only the central directory on open, then decompresses each entry
on-demand via the browser's native DecompressionStream API. This eliminates V8's ~1.4GB
ArrayBuffer ceiling entirely.

### Large File Support (up to 10GB+)
Peak RAM during a load is now a few MB of decompression buffer + the current line chunk,
regardless of ZIP size. A 2.7GB export with 9,205 media files and 76,000+ messages was
tested and parses successfully.

### Streaming Line-by-Line Parser
_chat.txt is never loaded as a full string. It streams through a WritableStream —
zip.js decompresses on-the-fly into the stream, which decodes UTF-8 incrementally,
splits on newlines, and feeds complete lines into the parser. The UI stays responsive
throughout with live progress updates every 2,000 lines.

### Lazy Media Loading
Media files (images, video, audio) are no longer pre-loaded. Each file is decompressed
on demand via BlobWriter only when first accessed, and the Object URL is cached for
subsequent views. This keeps initial load time fast regardless of how many attachments
are in the export.

### Smart Chat File Detection
The parser now always selects the largest .txt entry in the ZIP as the chat log,
instead of relying on the filename _chat.txt alone. Fixes a bug where a forwarded
.txt attachment was being parsed instead of the actual chat — causing zero messages
to load on certain large exports.

### Browser Compatibility Safeguards
On browsers that don't support DecompressionStream, WritableStream, or TextDecoderStream
(pre-Safari 16.4, older Chromium), a 1GB file size cap is enforced automatically and
an amber warning banner is shown. Modern browsers have no cap.

## Tech Stack

- HTML, CSS, JavaScript (vanilla, no frameworks, no build step)
- [zip.js](https://gildas-lormeau.github.io/zip.js/) for streaming ZIP parsing (CDN ESM import)
- Service Worker for offline support
- Runs 100% in your browser

## Privacy

Your chats never leave your device. Everything is processed locally. I don't store anything. I don't track anything. That's it.

## Support

If ChatLume is useful to you, consider [donating](https://chatlume.parassharma.in/donate.html). I built this in my spare time. Every bit helps.

## Built By

[Paras Sharma](https://parassharma.com) · [GitHub](https://github.com/parassharma2306) · [Twitter](https://twitter.com/parassharma2306)

## License

MIT
