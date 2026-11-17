#!/bin/bash
# One round is the lighting block over every condition and then each month pair over its own conditions; rounds are
# repeated until the blocks stop improving.
# usage: bash tools/measure/bgfit/chain.sh PAGE START.json PREFIX WORKERS ROUNDS   (results in tools/measure/work/bgfit/out)
set -e
PAGE=$1; prev=$2; P=$3; NW=$4; NR=$5
O=tools/measure/work/bgfit/out
for r in $(seq 1 $NR); do
  python tools/measure/bgfit/fit.py $PAGE $O/${P}r${r}_light.json 500 $NW --block light --start $prev --sigma 0.06 > $O/${P}r${r}_light.log 2>&1
  prev=$O/${P}r${r}_light.json
  echo "$P round $r light: $(tail -2 $O/${P}r${r}_light.log | head -1)"
  for b in 0,1 3,4 6,7 9,10; do
    name=${P}r${r}_$(echo $b | tr , _)
    python tools/measure/bgfit/fit.py $PAGE $O/$name.json 700 $NW --block $b --start $prev --sigma 0.06 > $O/$name.log 2>&1
    prev=$O/$name.json
    echo "$P round $r $b: $(tail -2 $O/$name.log | head -1)"
  done
done
echo "$P chain end: $prev"
