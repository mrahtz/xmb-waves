# xmb-waves

An original, from-scratch WebGL2 recreation of a well-known console menu
background: a flowing, luminous wave of fine lines drifting across a softly
coloured gradient, with glowing sparkles around it, whose colours follow the
time of day and the month.

![The original (left) and this project (right) at 12:00 on 15 October, 10 seconds side by side at real speed](docs/media/demo.gif)

Above: the original (left; footage in `comparison/original/`) and this project
(right) at the same date and time, side by side.

Not affiliated with, endorsed by or connected to Sony Interactive Entertainment. PlayStation, PS3 and XMB are trademarks or terms of Sony Interactive Entertainment.

## Process (clean room)

- A functional specification ([docs/SPEC.md](docs/SPEC.md)) was written by a
  separate party from observation and analysis of the original effect. It
  describes what the viewer sees, with no parameter values, colours, textures
  or code.
- This implementation was written from that specification alone, with no
  access to the original's code, data, firmware or system files, and without
  looking at anyone else's reimplementation.
- At first it was to be tuned against numeric scores only; that private
  scorer was dropped before any score was reported. Tuning is instead done by
  comparing renders side by side with public recordings of the original effect
  running. Every reference used is listed in
  [docs/REFERENCES.md](docs/REFERENCES.md).
- From 31 October 2026, by the project owner's decision, the background-only
  recordings of the original in [comparison/original/](comparison/original/)
  (an emulator running the console's menu, with icons and text hidden) are
  also used as tuning references, in the same way as the public recordings:
  footage of the effect running, with no values or code taken from it.
- Every value, colour and algorithm here is original. No assets are shipped;
  everything is generated in code (see [docs/ASSETS.md](docs/ASSETS.md)).

## Use

Open `index.html` (any static file server, or straight from disk). It follows
your local clock and date.

The round button in the bottom-right corner (it appears when the pointer moves
or the screen is touched) opens the settings panel; so does the `H` key. The
panel floats over the picture, scrolls, and has collapsible sections:

- **Picture**: output shape (16:9 or 4:3); render scale 0.25x to 4x of the
  picture's size on screen, with the resulting render size in pixels shown
  underneath (above 1x the render is averaged down to the screen in the final
  pass; below 1x the browser enlarges it); fit to window (fill, whole picture,
  stretch, or one picture pixel per screen pixel); show pixels when enlarged.
- **Performance**: the frame-rate counter with its history graph (also the `F`
  key); detailed stats (render, wave buffer and output sizes, the simulation
  thread's time per step, the quality options in effect); a button that
  measures the GPU time of each rendering pass where the browser exposes GPU
  timers (`EXT_disjoint_timer_query_webgl2`), and says so where it does not;
  the frame-rate cap (60, 30 or the display's own rate); the wave buffer
  quality (full supersampling, or one sample per rendered pixel from 1.5x up).
- **Time and theme**: the date and time with a Now button; a time-of-day
  slider; the clock speed (stopped, real time, 1 min/s, 10 min/s, 1 h/s,
  6 h/s); the wave speed (frozen, 0.25x to 4x; the wave and sparkles only);
  pause/play (`Space`), step one frame while paused (`.` or `→`), restart the
  wave from a fresh settled state; the colour (automatic, or one of the twelve
  themes by name); the mood (follow the clock, or hold night, dawn, day or dusk).
- **Layers**: background gradient, wave, glare, sparkles, sparkle glints,
  dither, and the background's frame-to-frame easing.
- **Wireframes**: the wave surface's mesh, the control grid and the sparkle
  quads, drawn as line overlays of the real geometry.
- **Inspect**: any intermediate buffer (background gradient, wave buffer, the
  glare pyramid's bright, blurred and combined levels, the control net
  texture) with a gain slider and an automatic gain for faint buffers, and
  "stop after pass" to show the frame only up to a chosen pass.
- **Parameters**: sliders for the tunable values, grouped by wave motion, wave
  look, camera, background, glare and sparkles, each with a reset and a
  reset-all. They change the picture live (the simulation values are sent to
  the worker); a dimmed slider follows the mood of the moment until it is moved.

Every setting, including which sections are open, is remembered on the device
(storage is read and written defensively; the page works without it).

URL parameters override the remembered settings: `theme=0..12`,
`time=2026-10-15T12:00` (fixed date and time), `speed=60` (clock speed in
seconds per second: 0, 1, 60, 600, 3600 or 21600), `scale=2` (render scale,
snapped to the menu's steps), `fps=1`, `layers=bg,wave,glare,sparkles,dither`,
`seed=<int>`, `pause=1`.

On an iPad, "Add to Home Screen" opens it full screen; it keeps the screen
awake while shown where the browser allows it.

Deterministic renders for side-by-side testing: `index.html?mode=score&time=...&theme=...&seed=...&frames=...&w=...&h=...`
and `window.XMBW.render(opts)` (see section 9 of the spec).

## How it works (short)

- A 19 x 19 mass-spring net, shaken at one end and gently pushed at the free
  end, is simulated at 60 fixed steps per second in a Web Worker. Every row's
  shaken point follows one shared slow path in height and depth (two
  frequencies, 60 s and 40 s, with the phase drifting from row to row), so
  that end is gathered and twists. The bending springs are much stiffer
  than the stretching ones, and small random kicks keep the net moving and
  set how many strands the band shows. A stored, settled start state means
  the first frame already looks like a running one.
- The net is passed through a free-form deformation lattice laid out
  unevenly along the length: a swell rolling from the shaken end to the free
  end and growing along it, a large bump sliding back and forth, a slow bob of
  the whole sheet and a small twist across the width (the swell fastest, the
  bump slowest). The deformed net is the control net of a bicubic B-spline
  surface. The control points are projected first, so the surface and its
  normals live in the projected space, as the spec asks. The camera sits
  slightly below the sheet, which runs out past the left edge of the
  picture.
- Shading is computed per vertex from two terms, each scaled by a size factor
  that falls with the first power of distance: a sheen that stays flat and
  then fades where the size factor is large, and a Fresnel-like glow indexed
  by the viewing cosine times the size factor (nothing below a threshold, a
  smooth rise to a peak, then an exponential tail). A linear fade softens the
  sheet's long edges. Every cell is drawn additively into a supersampled
  single-channel buffer, then filtered down one output pixel wide.
- The background is made per frame from a small day image and night image
  per month, each painted as a coarse grid of colours read with smooth
  interpolation. Each month's day image is processed on its own in hue,
  saturation and value and the two months are then mixed (next month's
  rising from the bottom). One angle of a warped hour drives a sun-like spot
  whose centre goes round an oval larger than the frame and a mirrored band
  of light along the bottom edge, which broadens in a narrow window about
  midday; the two lights' lifts add on top of a fixed share of the image's own
  colour, and lit areas are brighter and paler. Every curve of the clock is a
  product of one pair of smooth steps, placed where the spot crosses the
  bottom edge and taken at a gentler or a sharper rate in fixed proportion:
  the day image's daylight factor (gentle in the morning, sharp in the
  evening), the fading of the day image up the frame late in the evening and
  in the small hours (gentle at both ends) and the deepening of its colour up
  the frame (sharp at both ends), both proportional in the height. The
  night images are only scaled in brightness: lit by the same two lights on
  an unwarped clock, under an envelope across the night (two of the same
  steps), above a floor, and faded up the frame at either end of the night.
- The composite of background and wave goes through each mood's exposure and
  an extended Reinhard tone curve with a white point. The glare is a bloom
  pyramid read from that composite through a colour-keeping bright-pass
  (one weight per pixel from its brightest channel), with blue spread widest.
- Sparkles are born uniformly over the surface's parameters, mostly in
  bursts. They leave in a cone around the surface normal, with a random push
  that is mostly redrawn each step and a small part of it held for life, light
  gravity and friction. The box they live in is drawn in to just outside the
  picture, so a sparkle that has left the picture does not hold its slot. They ramp in and out linearly, spin,
  and are hard-edged discs sized in scene units; only the near, large ones
  turn towards the camera, so the rest pass through edge-on and twinkle. They
  are lit by a point light in front of the camera, the highlight tinted at
  full strength by an iridescent colour map of coloured patches (pinks,
  magentas, peach, gold, red-orange, violet-blue) between near-neutral
  regions, with depth of field whose far side lies inside the field, so
  the farthest few grow into soft discs while keeping most of their brightness,
  and a camera-facing glint whose wide patch holds its light near the middle,
  giving a bright sparkle a sharp core in a faint skirt. They are
  drawn straight onto the output after the final pass.
- Four moods (night, dawn, day, dusk) each hold a full parameter set
  (shading, camera tilt, exposure and tone curve, glare and sparkles) and
  blend over a few hours.
- Everything is tuned by comparing deterministic renders (`mode=score`) side
  by side with the original's recordings in `comparison/original/`, using the
  measurement tools in `tools/measure/`. The log is
  `docs/references/tuning-log.md`.

## Building and testing

`index.html` is assembled from `src/` by `python3 tools/build.py` (no
dependencies); the committed `index.html` is that output, so the page works
straight from the repository and on GitHub Pages. The sources:

| Path | What |
| --- | --- |
| `src/head.html` | Markup, styles and the start of the simulation script |
| `src/sim.js` | The simulation (spring net, deformation lattice, sparkles), shared by the worker and score mode |
| `src/main/scene.js` | Palettes, moods and their schedule, camera, wave/glare/sparkle settings |
| `src/main/gl.js`, `shaders.js`, `resources.js` | WebGL context, all shaders, programs and render targets |
| `src/main/render.js` | One frame: background, wave, glare, composite, sparkles, menu overlays |
| `src/main/score.js` | The deterministic score mode (spec section 9) |
| `src/main/settings.js`, `menu.js`, `loop.js` | Stored settings and tunables, the settings panel, the draw loop |
| `assets/` | Home-screen icons and the web-app manifest |

The files in `src/main/` share one scope and are joined in the order listed
in `src/main/ORDER`.

Deterministic frames for side-by-side comparison come from `tools/render.js`
(needs Playwright with Chromium), for example:

    node tools/render.js frame.png '{"time":"2026-10-15T12:00:00","seed":1,"frames":300,"w":1280,"h":720}'

The same URL and `seed`, `frames`, `w`, `h` always give the same image on the
same browser and GPU; `layers=bg,wave,glare,sparkles,dither` picks layers.
The tools that measure the wave against the public references, including a
fast evaluator and a parameter optimiser, are in `tools/measure/` (see its
README).

## Status

Built to spec version 28 (sections 4 to 6 to version 25) and tuned
against the original's recordings in `comparison/original/` and the lossless
reference renders of the footage index, measured with the same tools as my
renders (see `docs/references/tuning-log.md`). Matched: the band's centre speed and
height change over time, the sideways drift of the dark partings, the number
of strands per column, the band's brightness at night, and the sparkles'
in-focus size, brightness range, colour (share and strength of the coloured
minority, its tie to brightness, its hues), twinkle and motion over all 16
reference conditions. The sparkles yield slightly fewer separate points per
frame than the original (about 847 against 886 at full size over four hours of
15 October, after the bounding box was drawn in so that 0.62-0.65 of the full
pool is inside the picture rather than 0.49; in the fixed battery's own measure
777 against 801, inside the original's range, with 20 of its 22 sparkle measures
within range at seed 1 and at seeds 2 and 3), and slightly too many of them move upwards. The out-of-focus discs now come from the far side of the focus range
(14-22 a frame at 00, 06 and 12 h against the original's 11-24, but only 5 at
18 h against 13, and all of them about 10 px wide against 12-22); a bright
core's halo matches the original's profile from 3 px out to 15 px; and a
sparkle's path bends and wanders as the original's does. The brightest tenth of
the sparkles is still too bright (peak 55-72 levels against 46-51), which goes
with the faint end being too thin (11-14 % of the points in the lowest band
against 16 %). The geometry checks of 4.4d
(framing, depth, camera below the sheet) and 4.5 (where the sheet sits on the
shading curves) pass in every mood. Still short of the original: the picture
changes faster (0.08 correlation after one second against 0.15-0.36), the swell
crosses a little quickly (20 s against 25-107 s), the band arches less and is
thinner, and its lines stand out more over the band. The background is fitted to the original's 19 recordings
and renders (15 January, April, July and October at four hours, 15 and 29
October 21:30) and to six renders asked for at hours between them (15 October
04:00, 09:00, 15:00 and 20:00; 15 April 04:00 and 09:00): each month's day and
night image is a painted picture held as a coarse grid of colours (day 3 x 6,
night 3 x 7), and every curve of the clock is a product of one pair of smooth
steps taken at two rates in fixed proportion (version 28), the images, the
lights and the rates fitted together over all 25 conditions. Where the wave
does not cover it, the mean absolute difference per channel is about 1.5
levels, against 2.3 before this background, 3.1 before the joint re-tune that
preceded it, 9.5 before the version-23 one and 10.5-12.3 before the
version-19 one; by hour it is 1.3 at midnight, 1.6 at dawn, 1.4 at noon, 2.0
at dusk and 1.0 at 21:30. The hours in the shoulders of the day, which the
index does not cover, went from 8.9 levels to 1.1.
The composite's black offset, each mood's exposure and the twelve month palettes are fitted
together to the original's renders and recordings at four months (January, April, July, October) and four hours
(`tools/measure/jointfit.py`, with the offset swept around the fit). The offset is a three-way trade:
the colour the band's light takes over the dark parts of a night frame (spec 24) wants it large, the depth of the
night picture's black top wants it near 0.03, and the background away from the band wants it small, because the
offset cuts the dark end where the palettes can only scale colours. At the chosen 0.03 the night band's colour is
within 0.023 RMS of the original's channel shares, the black top is 0.0195 H from the original's on average
(0.29-0.35 H there), the band's added light by day is within 0.002 of the original's channel shares, and
background pixels away from the band differ by about 1.5 levels per channel on average (the three band-colour
and black-top figures were measured before the joint re-tune moved each mood's exposure, and before the
version-28 background fit moved the palettes again, and have not been measured since; the exposures and the
black offset were not touched by that fit). July's and October's
night bands lean towards the background's colour as the original's do, though less (R share 0.29 against 0.24
in July), and months whose night palette is more coloured than the original's lean where the original's stay neutral.
The band's brightest places compare left to right as the original's do.
Each mood's bright-pass threshold sits inside the bracket measured on the original's footage (spec 24), and the night runs
the same glare chain without any halo (at most one output level). With the version-28 background the day picture's own
maximum at midday has come down (January 0.76 to 0.69, July 0.69 to 0.67, December 0.77 to 0.76 against the day mood's
threshold of 0.68), so the background now glares by itself around the turn of the year, as spec 24 says the original does,
rather than in eight months. Spec 5 puts dusk's glare first, and mine still puts day's first.
Still short: the background's largest remaining errors are at dusk (2.0 levels) and at midnight, where the bottom edge's
left-to-right lean runs the wrong way in January and October (2.5 and 3.9 levels across the bottom band) - the night
image's own painted lean rather than its lighting; and the band carries about 9 levels more
mean light over the background than the original's (50 against 41), though its peak is within 5.
At night that excess is the sparkles rather than the band: at 00:00 the brightest point of a band column is now a
sparkle, not a fold (130 levels over the background against the original's 105), and the band's mean over the
background is 68 against 43, which is the sparkle lane's own open gap (its brightest points are too bright,
worst at night). The composite's exposure cannot reach it: sparkles are drawn after the final pass.

Not verifiable from the references available so far: each month's palette
on its own (the footage shows two-month mixes on the 15th, and November nearly
alone on 29 October), so the split between a month and the next, the palettes
of March, June, September and December and the size of the mid-month
saturation drop are design choices that follow the spec; likewise the look
between 01:00 and 03:00 and between 22:00 and 23:30, which follows the spec's
description (section 3, N8). The day's own light is built as spec 28 says - a
gentler morning step times a sharper evening one, the two rates in fixed
proportion - and the footage now reaches into both shoulders (04:00 and
20:00), but it asks for only a mild difference between the two rates (the
sharper is 0.81 of the gentler); which end of the day is the sharp one is
taken from the specification and not fitted.

Performance has been checked only in a software renderer (headless Chromium
with SwiftShader), where the frame time goes to drawing rather than to the
cloth: at 1920 x 1080 the final composite with the wave down-filter takes
about half the frame, the wave draw into the supersampled buffer a third,
glare and sparkles a tenth each, and the simulation under a millisecond; at
3840 x 2160 the composite dominates further. The wave buffer at one sample
per rendered pixel (the menu's default above 1.5x) saves a fifth of the
frame at 1080p and a third at 4K. The 60 fps target on an iPad has not been
measured on a device yet.

## Licence

MIT, see [LICENSE](LICENSE).
