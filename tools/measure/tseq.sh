#!/bin/sh
# usage: tseq.sh NAME -> 40 wave-only frames of $W/var_NAME.html one minute apart (1-40 min), 960x540, then the band's
# thickness distribution (thick.py) into vNAME/thick.txt
. "$(dirname "$0")/env.sh"
rm -rf "$W/v$1/tseq"; mkdir -p "$W/v$1"; cd "$W" || exit 1
PAGE=$W/var_$1.html node "$T/seq.js" v$1/tseq "{\"time\":\"2026-08-15T12:00:00\",\"seed\":5,\"w\":960,\"h\":540,\"layers\":\"wave\"}" 3600 40 3600 > /dev/null 2>&1
python3 -I "$T/thick.py" v$1/tseq > v$1/thick.txt 2>&1; echo "tdone $1"
