# MergeShot

**Fast lossless merging for split camera recordings.**

Action cameras like DJI and GoPro split long recordings into ~4 GB chunks. MergeShot automatically groups those segments, sorts them, and merges them into a single seamless file — no re-encoding, no quality loss, no command line.

![MergeShot UI screenshot](docs/screenshot.png)

---

## How to Use (3 steps)

1. **Drop** a folder or video files into the app (or click **Folder…** / **Files…**).
2. MergeShot auto-detects sessions (DJI/GoPro naming patterns). **Select a session**, pick an output folder.
3. Click **Merge**. Done. Open the output folder with one click.

---

## Features

- **Auto-grouping** — detects DJI (`DJI_0001.MP4`) and GoPro (`GH011234.MP4`) naming patterns; falls back to generic sequential detection.
- **Fast Merge (Lossless)** — uses `ffmpeg -f concat -safe 0 -c copy`. Near-instant for large files.
- **Compatibility Merge (Re-encode)** — `libx264 -preset veryfast -crf 18`, hidden under Advanced; use when clips have mismatched codecs/resolutions.
- **Health checks** — detects missing segments, codec/resolution/fps mismatches; shows warnings per session.
- **Cancel** — kill the running ffmpeg process at any time.
- **Rename / split / merge sessions** — right-click any session or clip.
- **Copy Log** — copies full ffmpeg command, OS info, and all log lines to clipboard for easy bug reports.
- **No internet required** — ffmpeg is bundled; zero network calls.
- **No installer-side dependencies** — ships as a self-contained .exe (Windows) or .dmg (macOS).

---

## Troubleshooting

### Fast Merge fails / output is corrupted
Your clips may have mismatched codecs, resolutions, or frame rates. MergeShot will show a warning. Click **Switch to Compatibility Mode** in the session details (or go to Advanced → Compatibility Merge). This re-encodes to H.264 which is universally playable.

### "ffmpeg not found" error
The bundled ffmpeg binary is missing or the OS blocked execution. On macOS you may need to right-click the app → Open, or run:
```bash
xattr -dr com.apple.quarantine /Applications/MergeShot.app
```
On Windows, your antivirus may quarantine the binary — add an exception for the install folder.

### Missing segments detected
MergeShot detected a gap in the clip sequence numbers (e.g., clips 0001, 0002, 0004 — clip 0003 missing). Check your source folder for the missing file. If the gap is intentional, dismiss the warning.

### Output file already exists
MergeShot will ask for confirmation before overwriting. If you want a fresh output, change the filename in the Details panel.

---

## Development Setup

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| Rust + Cargo | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` |
| Tauri CLI | v2 | bundled via `npm run tauri` |

### 1. Clone and install

```bash
git clone https://github.com/yourusername/mergeshot.git
cd mergeshot
npm install
```

### 2. Download ffmpeg binaries

**macOS:**
```bash
bash scripts/download-ffmpeg.sh
```

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\download-ffmpeg.ps1
```

Binaries are placed in `src-tauri/bin/` with the Tauri sidecar naming convention:
- `ffmpeg-aarch64-apple-darwin` / `ffmpeg-x86_64-apple-darwin`
- `ffprobe-aarch64-apple-darwin` / `ffprobe-x86_64-apple-darwin`
- `ffmpeg-x86_64-pc-windows-msvc.exe` / `ffprobe-x86_64-pc-windows-msvc.exe`

### 3. Run in dev mode

```bash
npm run tauri dev
```

### 4. Build for production

```bash
npm run tauri build
```

Artifacts are placed in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
mergeshot/
├── src/                        # React + TypeScript frontend
│   ├── components/             # UI components
│   │   ├── DropZone.tsx        # File/folder drop & browse
│   │   ├── SessionList.tsx     # Left panel: list of sessions
│   │   ├── SessionItem.tsx     # Individual session row + context menu
│   │   ├── SessionDetails.tsx  # Right panel: details, output, mode
│   │   ├── ActionBar.tsx       # Bottom bar: merge button + progress
│   │   └── LogDrawer.tsx       # Collapsible log panel
│   ├── utils/
│   │   ├── grouper.ts          # Auto-grouping & session detection
│   │   └── formatters.ts       # Duration, bytes, fps formatters
│   ├── store.ts                # Zustand global state
│   └── types.ts                # TypeScript type definitions
├── src-tauri/                  # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── main.rs             # App entry point
│   │   ├── lib.rs              # Plugin registration & command routing
│   │   ├── commands.rs         # Tauri commands (scan, probe, merge, cancel)
│   │   └── models.rs           # Serde-serializable data structs
│   ├── bin/                    # Platform ffmpeg/ffprobe binaries (gitignored)
│   ├── capabilities/
│   │   └── default.json        # Tauri v2 permission declarations
│   └── tauri.conf.json         # App configuration
├── scripts/
│   ├── download-ffmpeg.sh      # macOS ffmpeg downloader
│   └── download-ffmpeg.ps1     # Windows ffmpeg downloader
├── .github/workflows/
│   └── release.yml             # CI: build & publish on tag push
└── docs/
    └── FFMPEG_LICENSE.md       # ffmpeg attribution
```

---

## CI / Releases

Pushing a tag matching `v*` (e.g. `v0.1.0`) triggers the GitHub Actions workflow which:

1. Builds for **macOS arm64**, **macOS x86_64**, and **Windows x64** in parallel.
2. Downloads platform-appropriate ffmpeg/ffprobe binaries.
3. Packages them into the app bundle.
4. Creates a **draft GitHub Release** with the artifacts attached.

### Code Signing (not required for dev builds)

For public distribution, code-sign your builds to avoid OS warnings:

**macOS:** Set these repository secrets:
- `APPLE_CERTIFICATE` (base64-encoded .p12)
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` (for notarization)

Then uncomment the signing env vars in `.github/workflows/release.yml`.

**Windows:** Set `TAURI_PRIVATE_KEY` and `TAURI_KEY_PASSWORD` for update signing, or configure an EV certificate.

---

## License

MergeShot source code is licensed under the **MIT License** — see [LICENSE](LICENSE).

FFmpeg is licensed under LGPL 2.1 / GPL 2.0. See [docs/FFMPEG_LICENSE.md](docs/FFMPEG_LICENSE.md) for full attribution.
