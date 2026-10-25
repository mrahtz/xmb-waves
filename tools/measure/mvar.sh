#!/bin/sh
# usage: mvar.sh NAME [COUNT] -> wave-only sequence of $W/var_NAME.html at 10 fps, 960x540, from frame 900 (COUNT frames,
# default 300 = 30 s) into vNAME/wseq/, then the motion statistics (spec46m.py) into vNAME/spec46m.txt
. "$(dirname "$0")/env.sh"; N=${2:-300}
rm -rf "$W/v$1/wseq"; mkdir -p "$W/v$1"; cd "$W" || exit 1
PAGE=$W/var_$1.html node "$T/seq.js" v$1/wseq "{\"time\":\"2026-08-15T12:00:00\",\"seed\":5,\"w\":960,\"h\":540,\"layers\":\"wave\"}" 900 $N 6 > /dev/null 2>&1
python3 -I "$T/spec46m.py" v$1/wseq 10 > v$1/spec46m.txt 2>&1; echo "mdone $1"
