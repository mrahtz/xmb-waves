#!/bin/sh
# usage: wvar.sh NAME [SEED] -> three wave-only 1080p frames of $W/var_NAME.html at noon (seed 5: frames 600, 1200, 1800 into
# vNAME/w3/; seed 7: frames 600, 1500, 3000 into vNAME/s7/), then the static statistics (spec46.py) into spec46.txt there
. "$(dirname "$0")/env.sh"; S=${2:-5}
if [ "$S" = 5 ]; then D=v$1/w3; F="600 1200 1800"; O=v$1/spec46.txt; else D=v$1/s$S; F="600 1500 3000"; O=$D/spec46.txt; fi
mkdir -p "$W/$D" && cd "$W" || exit 1
J=""; for f in $F; do J="$J[\"$D/f$f.png\",{\"time\":\"2026-08-15T12:00:00\",\"seed\":$S,\"frames\":$f,\"w\":1920,\"h\":1080,\"layers\":\"wave\"}],"; done
PAGE=$W/var_$1.html node "$T/shot.js" "[${J%,}]" > /dev/null 2>&1
P=""; for f in $F; do P="$P $D/f$f.png"; done
python3 -I "$T/spec46.py" $P > "$O" 2>&1; echo "done $1 seed $S"
