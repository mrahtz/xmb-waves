#!/bin/sh
# usage: vbatch.sh "NAME ..." [PY] -> for each variant page $W/var_NAME.html: three full-frame 1080p renders on the GPU at
# the battery's day condition (15 Oct 12:00, 40 s after the start, stills at 1, 5 and 9 s), the background removed, and
# the static statistics (spec46.py) and fill (fill.py) of the three, into $W/vNAME/. PY is the Python command (python3).
. "$(dirname "$0")/env.sh"; PY=${2:-python3}
cd "$W" || exit 1
for v in $1; do
  D="v$v/d3"; mkdir -p "$D"
  J=""; for f in 2460 2700 2940; do
    J="$J[\"$D/f$f.png\",{\"time\":\"2026-10-15T12:00:00\",\"seed\":1,\"frames\":$f,\"w\":1920,\"h\":1080}],"
  done
  XMBW_GPU=1 PAGE=$W/var_$v.html node "$T/shot.js" "[${J%,}]" > "$D/render.log" 2>&1
  $PY "$T/bgremove.py" "$D/nobg" "$D"/f*.png > /dev/null 2>&1
  $PY "$T/spec46.py" "$D"/nobg/f*.png > "v$v/spec46.txt" 2>&1
  $PY "$T/fill.py" "V=$(ls "$D"/nobg/f*.png | tr '\n' ',' | sed 's/,$//')" > "v$v/fill.txt" 2>&1
  echo "done $v"
done
