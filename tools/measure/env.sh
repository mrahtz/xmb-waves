# sourced by the runner scripts: T = this directory, ROOT = the repository, W = the work directory
# (variant pages and their renders; MEASURE_WORK overrides), REF_DIR = the reference frames (see README.md)
T=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$T/../.." && pwd)
W=${MEASURE_WORK:-$T/work}; REF_DIR=${REF_DIR:-$W/refs}; mkdir -p "$W"
export MEASURE_WORK=$W REF_DIR
