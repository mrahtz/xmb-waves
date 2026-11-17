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

## The fixed battery (`battery.py`)

One command measures every footage clip and the clean build at the same conditions with the tools below, and
writes the measurer's `metrics.json`. Its numbers are meant to be compared from round to round, so its settings
are fixed. A change to what it measures raises `BATTERY_VERSION` in `battery.py`, which also invalidates the cache.

    python3 battery.py                                  # HEAD's committed index.html, all lanes, every clip in the index
    python3 battery.py --commit main --lanes motion,look --out DIR
    python3 battery.py --commit worktree                # the working tree's src/, assembled as mkvar.py does
    python3 battery.py --clips '2026-10-15_1200'        # only clips whose id matches (ids are listed in clips.json)
    python3 battery.py --seeds 1,2,3 --out DIR          # three seeds in one run: DIR/seed1/, DIR/seed2/, DIR/seed3/
    MEASURE_CACHE=/path/to/shared/cache python3 battery.py --seeds 1,2,3   # a cache shared with other jobs
    python3 battery.py --help                           # every option

Needs ffmpeg/ffprobe, Node.js with Playwright, and Python 3 with numpy, scipy, Pillow and OpenCV.

**What it renders.** It reads every clip in the footage index (`--index`, default
`C:\xmb-share\footage\INDEX.json`) that is not marked `"heldout": true`: recordings, renders and noise clips.
For each clip it renders the build through score mode (spec section 9) in headless Chromium **on the GPU**
(`--use-angle=d3d11 --ignore-gpu-blocklist`; `--cpu` uses SwiftShader instead). The render uses the clip's
console date and time as `time`, its colour as `theme`, its seed (or `--seed`, default 1, when the clip has
none) and its size. Simulation frame `60 * since_start_s + round(60 * t)` is used for each sample time `t`
of the clip. `time` is held at the clip's first frame. The background changes too little within 30 s to
matter, and in score mode a new `time` would restart the simulation. `battery_render.js` streams the frames
to `battery_frames.py` as raw RGB. The page hands each frame's bytes to the script by an HTTP POST to a server
the script runs on 127.0.0.1, which takes about 0.03 s a frame. The older transfer, base64 through
`page.evaluate`, took about 0.17 s a frame under load and gives the same bytes; `XMBW_TRANSFER=cdp` still
selects it.

**Several seeds.** `--seeds 1,2,3` measures the footage once and runs every seed's renders in the same pool of
processes. Each seed's outputs go to `<out>/seed<N>/` and are byte-identical to those of a separate
`--seed N` run (checked: see the timing below). `--seed N` alone writes to `<out>/` as before.

**Frames measured** (`battery_frames.py`). Footage and renders go through identical frame handling. Sample
times are `t = k/30` s from the first frame: footage frame `round(t * fps)`. Footage is decoded with ffmpeg
to 8-bit RGB. H.264 goes through its tagged matrix and range (BT.709, limited range), which is what plain
`ffmpeg -i clip.mp4 f%04d.png` gives. The RGB `clip.mkv` renders are converted straight to rgb24. Decoding
was checked to be exact on lossless ffv1 and libx264rgb files. No frames are deduplicated.

| Frames | Measures | Lane |
| --- | --- | --- |
| stills at t = 1, 5, 9, ... s, full size | `bgremove.py`, then `spec46.py` (placement, tilt, arch, thickness → motion; peaks, faces, folds, widths, edges, partings, lines → look) and `fill.py`; a clip's value is the median over its stills | motion, look |
| the same stills | `cycle.py`'s band peak and mean over the background; `bgcompare.py`'s four regions (R, G, B); mean over the stills | look, background |
| 10 fps over the whole clip, full size | `bgremove.py`, then `spec46m.py`, `motion2.py`, `thick.py` | motion |
| 30 fps over the first 8 s, scaled to 1280 x 720 (Lanczos) | `sparks.py --hp` | sparkles |
| 1 fps, 480 x 270 (area average) | background pixel comparison (below) | background |

**Background pixel comparison.** Each clip's background is the per-pixel temporal median of its 1 fps frames.
Its wave mask comes from the clip itself: `bgremove.py`'s light, 5 px median per frame, maximum over time,
above 2 levels, grown by 24 px (at 1080p) for the glare. The clean render and the footage clip of the same
condition are compared (clean minus footage) where neither mask is set. For each channel, and for the whole
frame and a 3 x 3 grid of regions, the result is the mean signed difference and the mean, p50, p90 and p99
of the absolute difference. Noise clips of one condition are compared with each other in the same way. In
`metrics.json` the original of these measures is 0 (the footage against itself) and their noise range comes
from those comparisons.

**Output** (`--out`, default `work/battery/out/<commit>/`):

- `metrics.json`: the measurer's format. Every measure has `original` (median, range and count over the
  recordings and renders), `noise` (the range over the noise clips of the same conditions; left out when
  there are none) and `clean` (over the clean renders at the recordings' and renders' conditions). `within`
  is true when the clean median lies inside the wider of the original and noise ranges. `visible_gaps` is
  left empty.
- `clips.json`: every measure per clip, original and clean.
- `bgpixel.json`: the pixel comparison per clip, region and channel, with the share of pixels compared.
- `noise.json`: per noise set, every measure's min, median, max and standard deviation, also for the clean
  renders at the noise clips' conditions.
- `timings.json`, `summary.txt`: the printed table and the time each part took. Parts are summed over
  processes, and the wall time is given where marked.

**How it runs.** Each clip, footage or clean render, is measured by one process (`battery_frames.py measure`).
The process decodes the clip with ffmpeg or renders it in a browser, and runs every tool on the frames as they
arrive, without writing frame files. The tools are imported and their functions called on the same 8-bit arrays
that their command lines read from PNG files. PNG is lossless, so the numbers are the same. Each tool's command
line still works as before and gives the same output. Up to `--procs` (default 8) such processes run at once,
and at most `--browsers` (8) of them render. Each process uses about one core, plus the decoder's or browser's
share, so the default leaves half of a 16-core machine to other jobs. The numeric libraries run on one thread in
these processes; their results do not depend on the thread count. Renders and the longest clips start first.

**Cache.** One folder per footage clip and per clean condition, holding one JSON per tool:

    <cache>/<code key>/footage/<clip id>_<file hash>/
    <cache>/<code key>/clean/<page hash>/<condition>/

`<cache>` is `$MEASURE_CACHE` if set, otherwise `work/battery/` (in `MEASURE_WORK`). The outputs stay in
`work/battery/out/` either way. The keys are what the numbers depend on:

- the code key: `BATTERY_VERSION`, a hash of the measuring code (`battery_frames.py`, `battery_render.js`
  and the tools it runs, with line endings normalised), and the Python, numpy, scipy, Pillow and OpenCV versions;
- the file hash: the clip's contents;
- the page hash: the page's contents. Commits with the same `index.html` share renders.

A changed clip, page or measuring code is therefore never served from the cache, and old entries are simply
no longer used. Every cached file is written under a temporary name and renamed, so another job reading at the
same time sees the whole file or none. While a job measures an entry it holds `<entry>.lock`, which it
refreshes every 20 s; a lock older than 3 minutes is taken as left by a dead job. Another job that needs the
same entry waits for the results instead of measuring it again. Two jobs measuring the same clips at once
into one cache were checked to measure each entry once and write identical outputs. The stills are kept in
each entry for looking. `--keep-frames` also writes all the measured frames (and their background-removed
versions) as PNG into `<entry>/frames/`. A second run on the same commit only collects the cached results.
`--force` measures again and replaces the cached results.

**Timing** (the clean side's machine: a fast desktop GPU, 32 threads; 19 recordings, 17 of 10 s and 2 of 30 s,
and their 19 clean renders; `--procs 7 --browsers 7`). Parts are summed over processes:

| | before (Nov 13, `c163b56`) | after |
| --- | --- | --- |
| cold, all lanes, one seed | 773 s | 364 s |
| warm (all cached) | 0.4 s | 0.4 s |
| one more seed (footage cached) | 419 s | 191 s (`--seeds 1,2,3` with seed 1 cached: 384 s for seeds 2 and 3) |
| sparkles (`sparks.py --hp`), cold, summed | 2,160 s | 1,203 s |
| rendering, summed | 862 s (the transfer out of the browser) | 36 s waiting for frames (rendering overlaps the measuring) |
| background removal, summed | 832 s (with PNG reading and writing) | 249 s |
| `spec46m` / `motion2` / `thick`, summed | 425 / 279 / 194 s | 287 / 240 / 131 s |
| decoding, summed | 253 s | 4 s waiting for frames |

The gains come from measuring in memory (no PNG files, no process per tool or per chunk of 40 frames), the
faster render transfer, and identical-result changes in the tools. `sparks.py` takes one 3-channel median
instead of three single-channel ones and an OpenCV maximum, and checks for edge contact before measuring a
region's shape. `spec46m.py` and `thick.py` find the band's extent in all columns at once. `bgremove.py` works
on blocks of rows. The run is CPU bound: sparkle detection is half of it, mostly the 15 px median.

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
| `spec46.py` | Static statistics of wave-only frames (spec section 4.6): placement, thickness, peaks and partings per column, face and fold levels, line widths, edges, thin lines. `--json OUT` also writes the numbers per frame (as do `spec46m.py`, `fill.py`, `thick.py` and `sparks.py`). |
| `spec46m.py` | Motion statistics of a frame sequence: centre speed, swell travel, picture correlation, strand coherence, parting drift and lifetimes. |
| `fill.py` | How much of the band is lit: shares above 40 % and 25 % of the column maximum, mean level, dark share. |
| `thick.py` | Band thickness and centre per frame over a long sequence. |
| `sparks.py`, `sparkseq.sh`, `sparkmotion.js` | Sparkles: counts, look classes (dots, streaks, discs) and colour from sparkles-only renders, with motion from tracks; and their on-screen motion (share rising, speed) and count straight from the simulation. `sparks.py --hp` uses OpenCV for its 15 px median when installed (identical result, about 100 times faster). |
| `spark21.py`, `spark21set.py` | The sparkle measures of spec 21 at full size and 60 fps, on a lossless clip or a build's score-mode render: per-sparkle peak and raw core level, width at half the peak, elongation, colour saturation and hue (also without clipped cores), placement about each column strip's median row, and twinkle along 60 fps tracks (track length, frame-to-frame change, share of a track below half its maximum, autocorrelation lag). Maxima on a flat plateau count once. `spark21set.py` runs it over the index's 16 lossless renders (or its noise clips, `--noise`) for footage or a page, and tabulates the means. `sparkdump.js` writes per-sparkle lighting samples from a page's simulation, and `sparkmapfit.py` fits the colour map's lobes and the lighting constants to the footage's colour and brightness distributions in an offline model of the sparkle shader on those samples (the model reproduces a render's per-sparkle saturation and hue). |
| `cycle.py` | Band peak and mean brightness over the background, mine beside the reference frames. |
| `cmp46.py` | Tabulates several statistics files side by side (median and range per measure). |
| `battery.py`, `battery_frames.py`, `battery_render.js` | The fixed battery (above): footage and clean renders at the same conditions, every measure, `metrics.json`. |
| `bgremove.py` | Removes the background from reference frames and clip frames. |
| `blackfoot.py` | Night frames (spec 4.5, version 20): how far down the frame the top stays flat at the darkest level, on the temporal median of a clip's frames, as a fraction of the height. |
| `bandcolour.py`, `bandcolour_render.js` | Spec 4.5 (version 24): the colour of the band's added light, the observable for the composite's black offset. Per frame, a 9 px horizontal median removes the sparkles; the background under the band (bgremove's light above 3 levels, grown by 15 rows) is interpolated per column and channel from the rows just outside it and subtracted; the added light is summed per channel over the band's pixels whose background is dark (largest channel under 10 levels) and over all of them. Prints each channel's share. On my renders it agrees with the exact added light (`--exact`, frames rendered with and without the wave) to 0.003. `bandcolour_render.js` renders the frames (raw RGB) on the GPU. |
| `brightfoot.py`, `brightmax.js` | Spec 5 (version 24): both sides of the bright-pass threshold. `brightfoot.py` measures a final frame (footage or my full renders, the same code) at the bright-pass's resolution (8 x 8 block means, largest channel, sparkles removed by a 9 px horizontal median): the band's maximum and the background's maximum away from the band, with its position. `brightmax.js` renders my composite with and without the wave (no glare, sparkles or dither) and returns both maxima per condition with the mood's threshold. |
| `ramp.py` | The band's brightest places in the left third against the right third, background removed (spec 4.5, version 20: the wave tint's ramp); compare right / left over many clips. |
| `glareab.js` | The glare measured by rendering each frame with the glare layer on and off in one page (spec 5, version 20): total, maximum and area of the difference, also for the background alone; takes in-page overrides of the mood values. |
| `buildsrc.py`, `mkvar.py`, `apply.py` | Read the sources, change tunables, write a variant page or apply the change to `src/`. |
| `jointfit.py` | One joint step for the shared settings from a battery run (`--seeds`): each mood's exposure from the background's level and the band peak together (kept in spec 4.5's order: day < dawn, at most 1.10 x day, < dusk < night), and the month palettes from what remains, per month, row and channel; rewrites `src/main/scene.js` (`--dry` only prints; `--exposure-only` leaves the palettes alone). Loop: battery `--commit worktree --lanes background,look --no-clean-noise`, `jointfit.py`, `build.py`. |
| `shot.js`, `seq.js` | Deterministic renders through the page's score mode: single frames, or sequences. `XMBW_GPU=1` renders on the GPU (ANGLE on Direct3D 11; also `tools/render.js --gpu`); the default stays SwiftShader for `shot.js` and Chromium's own choice for `seq.js` and `render.js`. |
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

## Background fit (`bgfit/`)

The background's settings and the months' painted images (spec section 3, versions 23 and 28) are fitted to the
footage's backgrounds with real GPU renders.

    MEASURE_CACHE=DIR python3 battery.py --lanes background --footage-only   # the footage's bgest.npz files
    python3 bgfit/prep.py DIR [--index INDEX.json]   # targets in work/bgfit/: per condition the mean of the clips'
                                       # background estimates at 240 x 135, and where none of them shows the wave;
                                       # --index names the conditions to keep (a shared cache holds many more)
    python3 bgfit/fit.py PAGE OUT.json [GENS] [WORKERS] [--start OUT0.json] [--block light|all|MONTHS] [--sigma 0.06]
                                       #   [--seed N] [--regions W] [--rows W] [--explain 1]
    python3 bgfit/unseen.py OUT.json FINAL.json   # the months the footage never shows: the fitted months' mean change
    python3 bgfit/applyfit.py FINAL.json           # writes BGL, BGW and the PALETTES block into src/main/scene.js
    python3 bgfit/regrid.py GW GH NGH              # changes how coarse the images' grids are, keeping the same pictures
    python3 bgfit/view.py PAGE sheet.png           # footage beside the build's background, per condition
    python3 bgfit/curve.py PAGE [OUT.json|-] [DATE]   # the picture over the day: brightness, top/bottom, saturation
    python3 bgfit/steady.py PAGE [sheet.png]       # the part of the error that does not move with the hour, per month
    python3 bgfit/profiles.py PAGE [OUT.json]      # the bottom edge left to right, and the middle of the frame row by row
    python3 bgfit/smooth.py PAGE                   # how far the picture departs from a quadratic over 3 x 3 windows
    python3 bgfit/rowfall.py PAGE [OUT.json] [--hours 00,20,04]   # how far up the frame the picture survives: the share
                                       # of the bottom band left at each height and where it halves (spec 28: the night
                                       # glow's climb at the dead of night, and the law of the shaping in the shoulders)
    python3 bgfit/lifts.py PAGE [OUT.json] [--date D] [--hours 09,15]   # spec 28: the largest channel at a place a light
                                       # passes over, compared between the hour it is over it and the hour it is away
                                       # (the two lifts and the fixed share), and the smallest over the largest (the paling)

`bgworker.js` keeps one headless Chromium on the GPU per worker. Each candidate sets the settings through
`XMBW._internals.bg`, remakes the images and renders the background only (score mode, `layers=bg`: the composite's
exposure and tone curve included, no simulation) at the conditions the block needs. Its score is the mean absolute
difference in levels over the pixels where neither clip shows the wave; the worker also returns the signed mean
difference over a 3 x 3 grid of regions, as the battery's `bgpixel` measures take it.

`fit.py` is a CMA-ES over the lighting terms (`BGL`, `BGW`) and the images of the eight months the footage shows
(January, February, April, May, July, August, October and November; the 15th of a month shows it mixed with the next).
Each image is a grid of colours (`BG_GRID_W` x `BG_GRID_H`, the night image `BG_NGRID_H` rows), so a month's pair is
`3 x 6 + 3 x 7` colours = 117 numbers and the whole fit is 25 + 8 x 117 = 961 values. At that size one CMA-ES over
everything at once never leaves its start (every candidate moves all 961 values), so the fit runs in blocks that are
alternated to convergence: `--block light` over every condition, then `--block 0,1`, `3,4`, `6,7`, `9,10`, each over
the conditions that show those months only. `bgfit/chain.sh` runs rounds of the five blocks.

The objective adds soft penalties for what the spec asks and the footage cannot show: N8's brightness over the day
(darkest about 02:00 and darker than at midnight, steep rise 03:00-06:00, fading 19:00-22:00); the night image at its
floor near dusk and dawn and clear of it at midnight; the daylight factor's peak in the afternoon, its full height
from the middle of the morning to the early evening and its lowest point at local midnight (version 28); the two
lights' lifts adding to no more than the image's own value and the spot's centre lying far below the picture at
midnight (version 23; where the pair of steps turns is now the bottom-edge crossing itself, so it is no longer asked
for); how high the night glow climbs at the dead of night, read from the footage month by month (version 28,
`--rows W`, off by default at weight 20); each month kept in its colour family (spec 7: January silver, near neutral; the others within 20 degrees
of hue of their starting colours and within a factor 1.5 in value); and each image kept a picture of one palette - its
hue within 30 degrees of the image's own mean hue and its variation across the width gentle beside the one down the
image - without which the fit paints two consecutive months in complementary colours that cancel in the mid-month mix,
which the footage cannot tell apart. A small second-difference term keeps the grids smooth and stops them taking in the
footage's noise. One generation (21 candidates) takes about 0.05 s per condition per worker.
