#!/usr/bin/env bash
# Friday Night Rewind — free VHS restoration chain (ffmpeg only, no paid tools).
#
#   bash tools/restore-vhs.sh input.mp4 [output.mp4]
#
# Order matters more than any single filter. Deinterlacing first: VHS is
# interlaced, and every later step degrades if the comb artifacts are still
# there. Upscaling comes last and matters least -- it cannot add detail the
# tape never recorded.
#
# Stabilization is two passes because vidstab must analyse the whole clip
# before it can correct it.
set -euo pipefail

IN="${1:?usage: restore-vhs.sh input [output]}"
OUT="${2:-${IN%.*}-restored.mp4}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

command -v ffmpeg >/dev/null || { echo "ffmpeg not on PATH" >&2; exit 1; }

echo "==> Source"
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,field_order,codec_name \
  -of default=noprint_wrappers=1 "$IN"

# Pass 1: measure camera shake.
echo
echo "==> 1/3 analysing motion"
ffmpeg -hide_banner -loglevel error -i "$IN" \
  -vf "bwdif=mode=send_frame,vidstabdetect=shakiness=6:accuracy=12:result=$WORK/t.trf" \
  -f null - 

# Pass 2: the actual restoration.
#   bwdif       deinterlace (motion-adaptive; the single biggest win on VHS)
#   vidstab     correct the shake measured above
#   hqdn3d      temporal+spatial denoise, tuned gently to preserve detail
#   nlmeans     finishing denoise on chroma noise VHS is prone to
#   deband      break up banding the denoisers can introduce
#   unsharp     modest sharpening, applied after denoise so it does not
#               amplify grain
#   scale       upscale last, lanczos
echo "==> 2/3 restoring"
ffmpeg -hide_banner -loglevel error -stats -i "$IN" -vf "\
bwdif=mode=send_frame,\
vidstabtransform=input=$WORK/t.trf:smoothing=24:crop=black:zoom=1,\
hqdn3d=3:2:6:6,\
nlmeans=s=2.0:p=5:r=11,\
deband=1thr=0.02:2thr=0.02:3thr=0.02,\
unsharp=5:5:0.8:3:3:0.4,\
scale=1440:1080:flags=lanczos" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart "$OUT"

echo
echo "==> 3/3 done"
ls -lh "$OUT" | awk '{print "   " $9 "  " $5}'
