# FFmpeg Attribution & License Notice

MergeShot bundles static builds of **FFmpeg** and **FFprobe**.

## What is FFmpeg?

FFmpeg is a complete, cross-platform solution to record, convert and stream audio and video.
Project website: <https://ffmpeg.org>
Source code: <https://git.ffmpeg.org/ffmpeg.git>

## License

FFmpeg is licensed under the **GNU Lesser General Public License (LGPL) v2.1** or later,
with optional components under the **GNU General Public License (GPL) v2** or later.

The static builds bundled in MergeShot use the **LGPL build** where possible (Windows),
and the **GPL build** on macOS (from evermeet.cx, which enables additional codecs).

> If you distribute MergeShot with a GPL ffmpeg build, your distribution must comply with
> the GPL, which among other things requires offering the source of any GPL-licensed components.
> MergeShot's own source code (MIT) is already open; the ffmpeg source is available at
> <https://ffmpeg.org/download.html>.

## Binary Sources

| Platform | Source |
|----------|--------|
| macOS (arm64 + x86_64) | <https://evermeet.cx/ffmpeg/> |
| Windows x64 | <https://github.com/BtbN/FFmpeg-Builds> |

## Acknowledgements

FFmpeg is maintained by the FFmpeg community. Many thanks to all contributors.

Full license text: <https://www.gnu.org/licenses/lgpl-2.1.html>
