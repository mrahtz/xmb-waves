#!/bin/bash
# Fit only the palettes of months the covered conditions do not show, leaving the lighting, the clock, the
# exposures, the tone curve and every other palette alone.
#
# usage: bash tools/measure/bgfit/newmonths.sh PAGE PREFIX WORKERS ROUNDS [GENS] [START.json]
#        BLOCKS="2 5 8 11" bash ... (the blocks to fit; the default is March, June, September and December)
#        (targets from bgfit/prep.py over work/scoreset/INDEX.json; results in tools/measure/work/bgfit/out)
#
# The default blocks are the four months no condition of the measured footage index shows: March, June,
# September and December. Each block's conditions are the 15th of the month before it (where it is the mix's
# second month) and the 15th of the month itself, both of which the measured index lacks, so fitting them
# leaves every condition the index does cover untouched to the pixel. The blocks' parameters and conditions
# are disjoint, so they are fitted at the same time and merged exactly.
#
# Blocks of two months (BLOCKS="1,2 4,5 7,8 10,11") fit the eight months the index does not cover, but those
# blocks' conditions include the 15th of January, April, July and October, whose mix shows February, May,
# August and November: measured on this build, one round over them took the eight new months from 9-13 to
# 4-8 levels a channel and moved 15 January's noon from 1.8 to 3.8, so a fit that may not move the covered
# months cannot have those four.
set -e
PAGE=$1; P=$2; NW=${3:-2}; NR=${4:-3}; GENS=${5:-700}; start=${6:-}
D=tools/measure/bgfit
O=tools/measure/work/bgfit/out; mkdir -p $O
BLOCKS="${BLOCKS:-2 5 8 11}"
prev=$start
for r in $(seq 1 $NR); do
  pids=""
  for b in $BLOCKS; do
    name=${P}r${r}_$(echo $b | tr , _)
    args="$PAGE $O/$name.json $GENS $NW --block $b --sigma 0.06"
    if [ -n "$prev" ]; then args="$args --start $prev"; fi
    python $D/fit.py $args > $O/$name.log 2>&1 &
    pids="$pids $!"
  done
  for p in $pids; do wait $p; done
  margs=""
  for b in $BLOCKS; do
    name=${P}r${r}_$(echo $b | tr , _)
    echo "$P round $r $b: $(tail -2 $O/$name.log | head -1)"
    margs="$margs $b=$O/$name.json"
  done
  m=$O/${P}r${r}_merged.json
  python $D/merge.py "${prev:--}" $m $margs
  prev=$m
done
echo "newmonths end: $prev"
