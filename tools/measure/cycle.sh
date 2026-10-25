#!/bin/sh
# usage: cycle.sh NAME -> $W/var_NAME.html at eight clock times (1920x1080, background+wave+glare+dither, seed 5, frame 1200)
# into vNAME/cycle/, and the band's peak and mean excess over the background beside the reference frames' (cycle.py)
. "$(dirname "$0")/env.sh"
mkdir -p "$W/v$1/cycle" && cd "$W" || exit 1
J=""; for t in 0000 0900 1030 1200 1330 1500 1630 1800; do hh=$(echo $t | cut -c1-2); mm=$(echo $t | cut -c3-4); J="$J[\"v$1/cycle/$t.png\",{\"time\":\"2026-08-15T$hh:$mm:00\",\"seed\":5,\"frames\":1200,\"w\":1920,\"h\":1080,\"layers\":\"bg,wave,glare,dither\"}],"; done
PAGE=$W/var_$1.html node "$T/shot.js" "[${J%,}]" > /dev/null 2>&1
python3 -I "$T/cycle.py" v$1/cycle
