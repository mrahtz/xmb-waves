#!/bin/sh
# usage: palround.sh NAME -> renders the current build's background (no wave) at the recordings' 16 dates and times into
# work/vNAME/bg/ and compares it with them (bgcompare.py)
. "$(dirname "$0")/env.sh"; cd "$ROOT" && python3 tools/build.py > /dev/null && cd "$T" && python3 mkvar.py $1 > /dev/null
cd "$W"; J=""; for mo in 01 04 07 10; do for t in 00 06 12 18; do J="$J[\"v$1/bg/2026-$mo-15-${t}00.png\",{\"time\":\"2026-$mo-15T$t:00:00\",\"seed\":1,\"frames\":600,\"w\":960,\"h\":540,\"layers\":\"bg,dither\"}],"; done; done
mkdir -p v$1/bg; PAGE=$W/var_$1.html node "$T/shot.js" "[${J%,}]" > /dev/null 2>&1; python3 -I "$T/bgcompare.py" v$1/bg | tail -1
