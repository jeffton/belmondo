#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p public/audio/voice
for word in three two one go; do
  espeak-ng -v en-us+m3 -p 24 -s 165 -a 150 -w "$work/$word.wav" "$word"
  ffmpeg -hide_banner -loglevel error -y -i "$work/$word.wav" \
    -af 'silenceremove=start_periods=1:start_threshold=-48dB,highpass=f=160,lowpass=f=6400,aecho=0.8:0.85:14:0.18,areverse,silenceremove=start_periods=1:start_threshold=-48dB,areverse,alimiter=limit=0.7:level=false,afade=t=in:d=0.004' \
    -ar 24000 -ac 1 -c:a pcm_s16le "public/audio/voice/$word.wav"
done
