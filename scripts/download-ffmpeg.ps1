# download-ffmpeg.ps1
# Downloads static ffmpeg and ffprobe binaries for Windows x64.
# Run this once before building:  powershell -ExecutionPolicy Bypass -File .\scripts\download-ffmpeg.ps1
#
# Sources: https://github.com/BtbN/FFmpeg-Builds/releases
#   Provides LGPL and GPL Windows x64 static builds.
#
# License note: ffmpeg is licensed under LGPL 2.1 / GPL 2.0+.
# By bundling it you accept its license terms. See docs\FFMPEG_LICENSE.md.

$ErrorActionPreference = "Stop"

$dest = Join-Path $PSScriptRoot "..\src-tauri\bin"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$target = "x86_64-pc-windows-msvc"

# BtbN nightly release — pick the LGPL shared build for license compliance
$releaseBase = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest"
$archiveName = "ffmpeg-master-latest-win64-lgpl.zip"
$url = "$releaseBase/$archiveName"

$tmp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
    Write-Host "Downloading ffmpeg build for Windows ($target)…"
    $zip = Join-Path $tmp "ffmpeg.zip"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

    Write-Host "Extracting…"
    Expand-Archive -Path $zip -DestinationPath $tmp -Force

    # Find the bin folder inside the extracted archive
    $binDir = Get-ChildItem -Path $tmp -Recurse -Directory -Filter "bin" | Select-Object -First 1

    if (-not $binDir) {
        throw "Could not find 'bin' directory in the archive."
    }

    $ffmpegSrc  = Join-Path $binDir.FullName "ffmpeg.exe"
    $ffprobeSrc = Join-Path $binDir.FullName "ffprobe.exe"

    Copy-Item $ffmpegSrc  (Join-Path $dest "ffmpeg-$target.exe")
    Copy-Item $ffprobeSrc (Join-Path $dest "ffprobe-$target.exe")

    Write-Host ""
    Write-Host "Binaries saved to $dest :"
    Get-ChildItem $dest | Format-Table Name, Length -AutoSize
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Done. You can now run: npm run tauri build"
