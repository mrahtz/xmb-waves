#!/bin/sh
# usage: sparkseq.sh NAME [HHMM] [COUNT] -> sparkles-only sequence of $W/var_NAME.html at 30 fps, 1920x1080, from frame 900
# (COUNT frames, default 300 = 10 s) at clock time HHMM (default 1200) into vNAME/spk_HHMM/, then the sparkle statistics
# (sparks.py) into vNAME/sparks_HHMM.txt
. "$(dirname "$0")/env.sh"; TM=${2:-1200}; N=${3:-300}
hh=$(echo $TM | cut -c1-2); mm=$(echo $TM | cut -c3-4)
rm -rf "$W/v$1/spk_$TM"; mkdir -p "$W/v$1"; cd "$W" || exit 1
PAGE=$W/var_$1.html node "$T/seq.js" v$1/spk_$TM "{\"time\":\"2026-08-15T$hh:$mm:00\",\"seed\":5,\"w\":1920,\"h\":1080,\"layers\":\"sparkles\"}" 900 $N 2 > /dev/null 2>&1
python3 -I "$T/sparks.py" v$1/spk_$TM 30 > v$1/sparks_$TM.txt 2>&1; echo "sdone $1 $TM"
