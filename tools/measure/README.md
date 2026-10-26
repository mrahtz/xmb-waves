# Measurement tools

These are the tools used to compare the wave against the public references. Every comparison in
[docs/references/tuning-log.md](../../docs/references/tuning-log.md) was made with them. They measure the
reference footage and this project's renders with the same code, so the numbers compare like for like.

The tools need Python 3 with numpy, scipy and Pillow, and Node.js with Playwright (Chromium).

## Directories

- **Work directory:** variant pages, renders and statistics go to `tools/measure/work/`. Git ignores it.
  Set `MEASURE_WORK` to use another directory.
- **Reference frames:** `REF_DIR` (default `work/refs/`) holds the raw reference frames, named
  `NDx_HHMM.png` for the 4K day-cycle frames at clock time HH:MM. These frames come from third-party
  recordings, so they are not in the repository. [docs/references/sources.md](../../docs/references/sources.md)
  lists where they come from.

## Measuring the reference

Remove the background from the frames, then run the statistics on the result:

    python3 -I bgremove.py work/refwave --size 1920x1080 work/refs/NDx_*.png
    python3 -I spec46.py work/refwave/NDx_0900.png work/refwave/NDx_1200.png ...
    python3 -I fill.py REF=work/refwave/NDx_0900.png,work/refwave/NDx_1200.png,...

For a clip, extract its frames (for example with ffmpeg), remove the background from each frame without
`--size`, and run `spec46m.py DIR FPS` on the directory.

## Measuring a variant of the build

    python3 mkvar.py NAME day.camPitch=6 net.noise=0.00008   # work/var_NAME.html: current sources with the changes
    ./wvar.sh NAME 5      # three wave-only 1080p frames, seed 5, and their statistics (vNAME/spec46.txt)
    ./wvar.sh NAME 7      # the same with seed 7 (vNAME/s7/spec46.txt)
    ./mvar.sh NAME        # 30 s of motion at 10 fps and its statistics (vNAME/spec46m.txt)
    ./tseq.sh NAME        # one frame a minute for 40 minutes: band thickness over time (vNAME/thick.txt)
    ./cycle.sh NAME       # band brightness at eight clock times beside the reference frames
    python3 -I cmp46.py REF=refstats.txt BUILD=work/vNAME/spec46.txt    # side-by-side table

The keys for `mkvar.py` are listed in `buildsrc.py`. They cover mood values, simulation constants, the
camera, the wave settings and literal replacements. `apply.py` takes the same keys, writes the changes into
`src/` and rebuilds `index.html`.

## The tools

| Tool | What it does |
| --- | --- |
| `spec46.py` | Static statistics of wave-only frames (spec section 4.6): placement, thickness, peaks and partings per column, face and fold levels, line widths, edges, thin lines. |
| `spec46m.py` | Motion statistics of a frame sequence: centre speed, swell travel, picture correlation, strand coherence, parting drift and lifetimes. |
| `fill.py` | How much of the band is lit: shares above 40 % and 25 % of the column maximum, mean level, dark share. |
| `thick.py` | Band thickness and centre per frame over a long sequence. |
| `sparks.py`, `sparkseq.sh`, `sparkmotion.js` | Sparkles: counts, look classes (dots, streaks, discs) and colour from sparkles-only renders, with motion from tracks; and their on-screen motion (share rising, speed) and count straight from the simulation. |
| `cycle.py` | Band peak and mean brightness over the background, mine beside the reference frames. |
| `cmp46.py` | Tabulates several statistics files side by side (median and range per measure). |
| `bgremove.py` | Removes the background from reference frames and clip frames. |
| `buildsrc.py`, `mkvar.py`, `apply.py` | Read the sources, change tunables, write a variant page or apply the change to `src/`. |
| `shot.js`, `seq.js` | Deterministic renders through the page's score mode: single frames, or sequences. |
| `wvar.sh`, `mvar.sh`, `tseq.sh`, `cycle.sh` | Render a variant and measure it, as above. |
| `sbs.py`, `plotprof.py`, `yt.py`, `xt.py` | Same-zoom side-by-side crops, column brightness profiles, and column-versus-time and row-versus-time plots. |
| `xsec.js`, `meany.js`, `soak60.js` | Simulation only (no rendering): cross-sections of the net, its mean height along the length, and a 60-minute bounds check. |
| `big.js`, `menucheck.js` | Page checks: 4K and 5K renders, and the settings panel with console errors. |
| `mkprof.py`, `prof.js` | Per-pass frame-time profile: builds a timing-instrumented page and measures it. |

## Fast evaluator and optimiser (`opt/`)

A geometry-only evaluator computes the same statistics without a browser in about 60 ms per frame. It
steps the page's own simulation in Node, projects the B-spline surface through the real camera, and splats
the page's shading response at low resolution. A CMA-ES optimiser uses it to tune the tunables against the
reference statistics.

| Tool | What it does |
| --- | --- |
| `opt/fastwave.js` | The evaluator: simulation, surface, raster and the ported statistics. |
| `opt/fw_frame.js`, `opt/fw_prof.js` | Evaluate single frames of a page, and time the evaluator's parts. |
| `opt/fw_validate.js`, `opt/validate.py` | Compare the evaluator with the full renders of existing variants, metric by metric and by ranking. |
| `opt/fw_worker.js`, `opt/cmaes.py` | A persistent evaluator process, and the optimiser with its objective. Logs go to `work/opt/`. |
| `opt/recheck.py` | Re-evaluates the best candidates on fresh seeds. |
| `opt/confirm.sh` | Full-renders a candidate with the normal pipeline (both seeds, fill, optionally motion). |
| `opt/sheet.py` | Same-zoom crop sheet of several frames. |
| `opt/soak.js` | Long-run bounds of the net with the fast simulation. |

`cmaes.py` starts from the current build's values (`BASE_PAGE`, default `index.html`). Its targets are the
reference statistics measured with these tools. See `cmaes.py` for the parameter bounds and the spec's
constraints it enforces.
