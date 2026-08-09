# 🔥 GrillStudio

**The free, open, private creator studio.** Edit videos entirely in your
browser and research YouTube like the paid tools do — with your own keys,
your own data, and no subscription.

> Videos never leave your computer. Research data comes straight from
> YouTube's own free API. No accounts, no tracking, no paywall.

## Features

### Create — browser-native video editing (ffmpeg.wasm)
- **Trim** with a two-handle timeline
- **Text layers** with timing, position, size and color — burned into the export
- **Captions** from any `.srt` file (grab one free from YouTube Studio's auto-subtitles)
- **Music** — upload your own, or search Jamendo's free Creative Commons
  library, preview, and mix with volume + start offset
- **Polish** — one click levels audio to broadcast loudness (-16 LUFS) and
  gently lifts contrast and warmth
- **Export** to MP4 with a live progress bar. Everything runs locally.

### Grow — YouTube research and ideation
- **Outlier finder** — scan any channel's last 50 uploads and surface the
  videos massively outperforming that channel's own median. Proven-topic
  discovery in one search.
- **Keyword research** — analyzes the real top-25 ranking videos for a term:
  median views (demand), share of 100K+ channels (competition), freshness,
  and small-channels-winning signals. Every number is real and inspectable.
- **Idea engine** — Claude-powered titles, keywords, hooks and video ideas.
- **Analytics check-up** — paste four numbers from YouTube Studio, get a
  plain-language CTR + retention diagnosis. Fully offline.

## Quick start (local)

Requires [Node.js](https://nodejs.org) LTS.

```bash
npm install
npm run dev
```

Open http://localhost:5173

### Keys (all free, all optional, all stay in your browser)

| Feature | Key | Where |
|---|---|---|
| YouTube research | YouTube Data API v3 key | console.cloud.google.com → enable "YouTube Data API v3" → Credentials |
| Idea engine (local) | Anthropic API key | console.anthropic.com |
| Music library | Jamendo client ID | devportal.jamendo.com |

## Deploy your own (Netlify)

1. Fork/push this repo to GitHub, then "Import from Git" on Netlify —
   `netlify.toml` configures the build, headers and serverless function
   automatically.
2. (Optional) In Site settings → Environment variables, add
   `ANTHROPIC_API_KEY`. The bundled serverless proxy
   (`netlify/functions/claude.mjs`) then powers the Idea engine for all
   visitors — the key never reaches the browser. Without it, visitors can
   paste their own key.
3. YouTube + Jamendo keys are designed for client-side use; users bring
   their own (or hard-code your Jamendo ID — it isn't secret).

## Honest limits

- Rendering is ffmpeg.wasm: roughly real-time. Best for clips under ~15 min.
- Single video track — a finishing tool, not a multi-clip timeline (yet).
- YouTube free quota ≈ 90 keyword researches or hundreds of outlier scans/day.
- Desktop browsers; phones will struggle with the editor.

## Roadmap

- [ ] 9:16 vertical export for Shorts/Reels
- [ ] Thumbnail frame-grab (pause → save PNG)
- [ ] Multi-clip joining
- [ ] Chrome extension: overlay outlier/keyword stats on youtube.com
- [ ] In-browser auto-captions (speech-to-text)

## License

MIT — do anything, just keep the notice. PRs welcome.
