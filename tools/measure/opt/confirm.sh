#!/bin/sh
# usage: confirm.sh NAME [motion] group.key=value ...  -> $W/var_NAME.html via mkvar, three 1080p wave-only frames at seed 5
# and at seed 7 (static statistics), the fill measures, optionally the 30 s motion sequence
T=$(cd "$(dirname "$0")/.." && pwd); cd "$T" && . ./env.sh
N=$1; shift; M=0; [ "$1" = "motion" ] && { M=1; shift; }
python3 "$T/mkvar.py" $N "$@" || exit 1
nice -n 5 "$T/wvar.sh" $N 5 && nice -n 5 "$T/wvar.sh" $N 7
cd "$W" && python3 -I "$T/fill.py" $N=v$N/w3/f600.png,v$N/w3/f1200.png,v$N/w3/f1800.png > v$N/fill.txt 2>&1
python3 -I "$T/fill.py" $N=v$N/s7/f600.png,v$N/s7/f1500.png,v$N/s7/f3000.png > v$N/s7/fill.txt 2>&1
[ $M = 1 ] && nice -n 5 "$T/mvar.sh" $N
echo CONFIRMED $N
