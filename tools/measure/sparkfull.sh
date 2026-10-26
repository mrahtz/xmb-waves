#!/bin/sh
# usage: sparkfull.sh NAME [HHMM] [SEED] -> 8 s of the full picture of $W/var_NAME.html at 30 fps, 1280x720 (as the sparkle
# reference clips), from frame 900, into vNAME/spf_HHMM_SEED/, then the sparkle statistics with the footage's high-pass
# (sparks.py --hp) into vNAME/sparksf_HHMM_SEED.txt
. "$(dirname "$0")/env.sh"; TM=${2:-1200}; SD=${3:-5}
hh=$(echo $TM | cut -c1-2); mm=$(echo $TM | cut -c3-4); D=v$1/spf_${TM}_$SD
rm -rf "$W/$D"; mkdir -p "$W/v$1"; cd "$W" || exit 1
PAGE=$W/var_$1.html node "$T/seq.js" $D "{\"time\":\"2026-08-15T$hh:$mm:00\",\"seed\":$SD,\"w\":1280,\"h\":720}" 900 240 2 > /dev/null 2>&1
python3 -I "$T/sparks.py" $D 30 --hp > v$1/sparksf_${TM}_$SD.txt 2>&1; echo "fdone $1 $TM $SD"
