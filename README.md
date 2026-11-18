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
  frequencies, 60 s and 40 s, with the phase drifting from row to row, a
  little faster in depth than in height), so that end is gathered and twists.
  The net is square, so it carries as much cloth across its width as along
  its length, and nothing pulls the width flat: it hangs in folds the whole
  way along, over six times longer than the straight line between its edges,
  where the length runs nearly straight. That folding is what the band is
  made of. The bending springs are much stiffer
  than the stretching ones, and small random kicks keep the net moving and
  set how many strands the band shows. A stored, settled start state means
  the first frame already looks like a running one, and every start is the
  same: the clock, the warp's phases, the warm-up and the kicks' generator
  are fixed, so the wave at a given time since the start does not depend on
  the seed (only the sparkles do). The state is settled over eight decay
  times (about 1000 s of simulation), which is where the net's own motion
  stops easing off; a shorter warm-up leaves the whole picture running fast.
  An envelope along the length scales the
  net's height and depth about one fixed axis, fullest at the shaken end.
  The gathered width is spread over enough depth in the scene that, down a
  column of the screen, the distance to the sheet changes several times more
  than it does from left to right.
- The net is passed through a free-form deformation lattice laid out
  unevenly along the length, with enough cells across the width for the
  twist and held at the sheet's ends: a swell rolling from the shaken end to
  the free end and growing along it (22 s, a little under one and a half
  wavelengths along the sheet, so its crest crosses the screen in 10.6 s), a
  large bump sliding back and forth (562 s), a slow bob of the whole sheet
  (100 s) and a small twist across the width (22 s). Their rates, their
  sizes and the ceiling of the one clock they read are fitted together
  against the band's whole course over times since the start, rather than
  each part being given a free phase. The clock runs to that ceiling (2400 s)
  and restarts, which all four parts follow at once: the band's height steps
  by a quarter of the frame in one frame, and the driven end, which reads the
  same clock through the drive's easing, sweeps back along its own path over
  about a second and throws a disturbance into the sheet. The deformed net is the control net of a bicubic B-spline
  surface. The control points are projected first, so the surface and its
  normals live in the projected space, as the spec asks. The camera's
  placement (below the sheet, which runs out past the left edge of the
  picture; raised at night) and its aim (one pitch about the axis along the
  sheet's length, with only a trace of turn) are separate settings. The aim
  is fitted against the band's typical height over many times since the
  start, from tens of seconds to tens of minutes, rather than one moment.
- Each patch of the B-spline surface is sampled 24 by 24, comparably finely
  across the ribbon and along it, because the folds across the width are as
  fine as anything along the length.
- Shading is computed per vertex from two terms, each scaled by a size factor
  that falls with the first power of distance: a sheen that stays flat and
  then fades where the size factor is large, and a Fresnel-like glow indexed
  by the viewing cosine times the size factor (nothing below a threshold, a
  smooth rise to a peak, then an exponential tail). The two curves' shapes are
  set by where the sheet has to sit on them: the typical bit of sheet lies
  above the Fresnel-like peak on its falling side, and the sheen's cut-off
  takes between a quarter and two fifths of the sheen's light off the bits
  that appear large on screen. Where that cut-off begins and how long its fall
  runs is what decides how much light the faces between the folds carry; the
  sheen is most of the light in every mood and is what fills those faces, and
  the Fresnel-like term makes the folds. A linear fade softens the
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
  an extended Reinhard tone curve with a white point; each mood also has its
  own wave brightness, which multiplies the wave and not the background. The
  glare is a bloom
  pyramid read from that composite through a colour-keeping bright-pass
  (one weight per pixel from its brightest channel, not divided by how bright
  the pixel is and carried at the picture's own precision), with blue spread
  widest. The pyramid's first level is a fixed coarse grid over the picture,
  so the halo keeps its width as a fraction of the picture at any output size.
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

Built to spec version 36 (the shading's two terms and where each of them lands, the sheen's cut-off as the lever on
the band's face level, the two ceilings read on the finished frame in every mood and month, and the band-level
observable's denominator and the stretch of footage it is averaged over; the background's painted images, its one rate
in the height, its night floor, one unlit share for both arms with nothing clamped, and the breadth of the mid-month
lowering and of the month handover fitted to version 35;
where the sheet sits on the two shading curves, the mood's own wave brightness apart from the composite's gain, and the
glare chain sized from the picture rather than from the output to version 31; the sheet and its motion to version 30;
the composite's floor, the wave tint's ramp and the glare's locality to version 27; the sparkles to version 25) and
tuned against the
original's footage - the 19 recordings in `comparison/original/`, the 19 lossless
reference renders of the footage index, the 48 noise clips from 40 s to 30 minutes after the start, and, for the
background, 134 conditions covering all twelve months - measured with
the same tools as my renders and with the fixed battery (see `docs/references/tuning-log.md`). The sheet's width is
folded slack over the whole length: the path the net follows across its width is 6.4 times the straight line between
its edges (1.04 along the length), the width turns over four times down a screen column, and down that column the
distance to the sheet changes about three times as much as from the left of the screen to the right. The start state is
settled over eight decay times, so the picture no longer runs fast in the first minutes. The camera's placement and
aim are separate settings, with only a trace of turn.

Version 30's own points, in the order it puts them. The band's thickness, its pinching and its height are read as
series against time since the start, from the twelve times the noise clips cover (the original's band is at the same
height at a given time since the start whatever the date, its spread over the four conditions being 0.008-0.021 H, so
the four give one course). The band's course over those times ran 0.459-0.604 H against the original's 0.412-0.697:
the right shape with too little reach, which is the slow parts' size and not the aim. The warp's two slow sizes, their
two rates, the ceiling of the one clock they read and the five phases were therefore fitted together against the whole
course (`tools/measure/coursefit.js`) and the aim only after them; the fit was held to candidates whose amplitude times
rate is no larger than before in either part, because without that it bought the reach with a bob three times as quick
and swung the band out of the top of the frame. The course now runs 0.437-0.669 H with its mean at 0.5646 against the
original's 0.5644, 0.062 H rms from it against 0.085 before. The clock runs to a 2400 s ceiling and restarts: the band's
height then steps 0.24 H within one frame against a median step of 0.0002 H, and the driven end, which reads the same
clock through the drive's easing, sweeps back along its own path over about a second (`tools/measure/restart.js`); the
disturbance it leaves is mild, the net's typical point speed rising by about 4 %. The swell's rate and wavelength are
fitted against two observables and not one (`tools/measure/swelllag.py`, the same code on footage and on renders): the
original's crest crosses the screen in 11.0 and 11.5 s on the two 30 s recordings with the outer bands of columns
correlating -0.54 and -0.82 at no lag, where this build crossed in 7.9-8.2 s at -0.37 to -0.39 - too long a wavelength,
not too fast a clock - and now crosses in 10.6 s at -0.68. The uneven layout is read on the screen rather than in the
sheet's own coordinates: one step of the sheet's material covers 265 px at the shaken-end edge of the frame and 362 px
at the free-end edge (ratio 1.36 in every mood). That check passed before this round too, so the free-end third's
slower travel was the framing and not the layout: the free end lay 0.26 of the frame's width past the right edge, and
the band left the picture at full strength. The sheet now sits so that its free end reaches screen x 1.12, and the band
thins and dims as it goes: over the same twelve clips the band's mean light in the free-end tenth of the width is 0.48
of its light in the middle third, where the footage's is 0.58 and this build's was 1.27 (`tools/measure/freeend.py`).

Measured on the merged build with the fixed battery (the 19 recording and render conditions; the medians below, the
original's beside them), 49 of the 50 motion measures lie inside the original's range at every one of the three seeds,
against 44 before this round. Matched: where the band sits (centre 0.451 H, original 0.427, range 0.388-0.505), how high and low it goes
(0.328 and 0.672; 0.300 and 0.622), its thickness (0.176 H; 0.155), the band's centre speed (0.015 H/s; 0.019), how
differently neighbouring strands move (7.8 px/s; 8.5), the peak speed (14.9; 15.3), the kymograph's vertical speed
(10.6; 11.1), the optical flow's speed and spread (21.4 and 40.0; 23.0 and 44.4), the spectrum's three bands and its
centroid (0.314 Hz; 0.338), the arch and the tilt; the band keeps its substance over 30 minutes. The free-end third of
the screen now travels faster than the shaken-end third, as the original's does (23.0 against 19.6 px/s, the original
28.0 and 20.7), where before this round the two were the wrong way round (22.8 against 24.2). The band's topmost lit
row stays 0.11 H from the top of the frame (the original's 0.12, over a range of 0 to 0.21), and the sheet's own
surface never rises above 0.31 H of the frame in any mood. Like the original, every start is the same, so at a given
time since the start the wave does not depend on the seed. The geometry checks of 4.4d (framing, depth, camera below
the sheet) and 4.5 (where the sheet sits on the shading curves) pass in every mood, as do version 26's folded-slack
checks. Still short of the original: the picture one second on is too much like the picture now (0.41 against 0.15,
inside the noise clips' range but outside the recordings' 0.003-0.356), and matching the crest's crossing time has made
that worse rather than better, which by 4.4b is the band's structure and its shading to answer for and not the clocks;
the surface's detail travels a little too fast where the flow finds texture (11.4 px/s against 9.66, the one measure of
the fifty outside the range); the free-end third is still slower than the original's; the band never pinches below
0.08 H where the original's columns do so 14 % of the time at 40 s after the start (and not at all at most other times
since the start); and the band is a tenth too thick and far too even in thickness along the screen (thickest over
thinnest 3.45 against 7.07).

Matched over all 16 reference conditions: the sparkles' in-focus size, brightness range, colour (share and strength of
the coloured minority, its tie to brightness, its hues), twinkle and motion. The sparkles yield slightly fewer
separate points per frame than the original (about 847 against 886 at full size over four hours of 15 October, after
the bounding box was drawn in so that 0.62-0.65 of the full pool is inside the picture rather than 0.49; in the fixed
battery's own measure 777 against 801, inside the original's range, with 20 of its 22 sparkle measures within range at
seed 1 and at seeds 2 and 3), and slightly too many of them move upwards. The out-of-focus discs now come from the far
side of the focus range (14-22 a frame at 00, 06 and 12 h against the original's 11-24, but only 5 at 18 h against 13,
and all of them about 10 px wide against 12-22); a bright core's halo matches the original's profile from 3 px out to
15 px; and a sparkle's path bends and wanders as the original's does. The brightest tenth of the sparkles is still too
bright (peak 55-72 levels against 46-51), which goes with the faint end being too thin (11-14 % of the points in the
lowest band against 16 %). The background is fitted to 140 conditions covering all twelve months and the days through one of them
(version 33: every month wants footage of its own month; version 34: and a day on which that month shows alone, and the
days in the first and the last third of a month, which no usual set holds). The set is one index
(`tools/measure/scoreset.py`): the measured index's 19 conditions, the 4th and the 15th of every month at 00:00,
06:00, 12:00 and 18:00, the hours between them the requested footage reaches, thirteen days through April at 12:00
(the 1st and the 30th asked for this round), and 15 October at 11:00 and 13:00, without which the breadth of the
window over which the bottom glow broadens cannot be fitted at all. The 4th of a month is inside the first week, where
that month's images show alone. Each month's day and night image is a painted picture held as a coarse grid of colours,
four columns wide so that the bend across the width need not sit at the middle, with its rows crowded towards the
bottom edge so that the knee just above the edge can be held (day 4 x 6, night 4 x 7). Every curve of the clock is a
product of one pair of smooth steps taken at two rates in fixed proportion (0.816), placed where the travelling spot
crosses the bottom edge (version 28), and all three falls up the frame use one rate in the height (8.42), differing
only in the clock that drives each (version 33). Version 34's three mechanisms are in: one unlit share (0.517) serves
the day picture and the night picture alike, with the floor under the night level below it (0.448, 0.867 of the share)
rather than above it as it was; nothing is clamped anywhere, the share plus the largest total the two lights ever put
over one place coming to 0.712 of the image's own colour; and the mid-month lowering of the saturation and the month
handover's step are fitted rather than chosen - the lowering is a bell 0.346 of a month wide standing on a trace of
0.110 that survives the month's ends, and seven numbers place the handover's step and set its breadth.
Measured over the 140 conditions with the same tools, the mean absolute difference per channel is 1.85 levels, against
12.40 on `main` and 2.69 on the branch this round started from; by month it runs 1.56 to 2.11, where `main` runs 6.8 to
22.5. On the measured index's 19 conditions alone it is 1.35 levels against `main`'s 1.49 - the previous round's branch
reached 2.38 there and failed the merge gate for it, and what fixes that is a weight of three on those conditions and
on the hours between the four tuning hours, of which the set holds 16 against 120 (`bgfit/fit.py --iw --sw`). Through
the fixed battery on those 19 conditions the pixel comparison is 1.419 levels a channel against `main`'s 1.516 and the
signed mean -0.087 against +0.156, with 19 of the lane's 54 measures inside the original's range against 15.
Version 34's own readings: the balance between the two lights' lifts, read within one daytime frame, is 1.139 in the
footage and 1.143 here over 52 conditions; the bottom band's saturation through the days of April, with April's level
divided out, is 0.467 / 0.745 / 0.963 in the footage at the middle of the month, a quarter and three quarters through,
and the month's ends, against 0.463 / 0.760 / 0.964 here. Split into the part that stands still over the hours of a
month and the part that travels with them, the residue is 1.29 standing against 1.53 travelling, the travelling part
the larger in ten months of twelve. The composite's black offset, each mood's exposure and the twelve month palettes are fitted together to the
original's renders and recordings at four months (January, April, July, October) and four hours
(`tools/measure/jointfit.py`, with the offset swept around the fit; since the spec-26 sheet the gain is fitted on the
background alone, `--weight=1.0`, because the band's shortfall by day is its own brightness and the gain cannot reach
it without taking the background with it). The joint re-tune after the spec-30 sheet found the shared settings already
at that fit's fixed point: the sheet changed no pixel of the background, the fit's step moves the three daylight gains
by 0.1 % and the grids by at most 1.6 %, and taking it leaves the background 0.005 levels worse, so every gain and all
twelve palettes were kept. Letting the band pull on the gain was measured again on this sheet and is still the wrong
trade (at weight 0.5 the background goes from 1.52 to 3.09 levels a channel and noon from 1.43 to 5.48 for 2 levels of
band peak; at 0.8, 1.71 for 1), and so is letting the fit have the night (00:00 from 1.17 to 1.09 but 21:30 from 1.00
to 1.86). The offset is a trade between the colour the band's light takes over the
dark parts of a night frame, which wants it large, and the background away from the band, which wants it small,
because the offset cuts the dark end where the palettes can only scale colours. Version 27 restates the first of
those as the three channel shares taken separately at several clearly different band positions, in the months whose
night background is coloured enough to speak (`tools/measure/bandpos.py`), and warns that a palette fit which may
only scale cannot follow the floor and will therefore always prefer the value the build already has. On the
version-27 background three builds were re-tuned to convergence at 0.03, 0.045 and 0.06 and both sides measured on
each: the night band's colour improved slowly (mean absolute share error per channel over 30 moments 0.0258, 0.0214,
0.0199, against a per-moment error of 0.011-0.038) and the background away from the band got worse quickly (1.73,
2.46, 3.46 levels per channel, against 1.56 at that build's settings and a noise range of 0.09). Both of the floor's
observables have now been re-read on the version-28 background, which is a fit of the kind version 27 prescribes and
was itself run at 0.03 (`bandpos.py` over the same 30 moments of the six night conditions, `blackfoot.py` on the four
00:00 conditions, the merged build and three variants of it): the night band's colour is 0.0200 at 0.03, 0.0143 at
0.045 and 0.0182 at 0.06, and the night black top is 0.273 H at 0.03, 0.369 at 0.045 and 0.374 at 0.06 against the
original's 0.331-0.335 (0.291-0.352 by month). So on this background both observables want a dark end about as low as
a floor of 0.0375-0.045 would put it, where before version 28 the foot at 0.03 was already 0.03-0.04 H deeper than the
original's. The cost is still the background: re-tuned to convergence at 0.045 (five `jointfit.py --weight=1.0` steps)
the background away from the band goes from 1.52 to 2.01 levels a channel, five times that measure's noise range,
while the band's colour improves by 0.005 and the foot comes to 0.351 H. The offset is therefore still held at 0.03,
and what the two readings now ask for is the background lane's: the same lowering of the night images' dark end,
fitted with `tools/measure/bgfit/`, which costs the background nothing because the images move rather than scale.
At 0.03 the band's added light by day is within 0.002 of the original's channel shares, and
background pixels away from the band differ by about 1.5 levels per channel on average. July's and October's night bands lean towards the
background's colour as the original's do, though less (R share 0.29 against 0.24 in July), and months whose night
palette is more coloured than the original's lean where the original's stay neutral. The wave's own light cannot drive the picture to white in any mood (spec 27): rendered alone it reaches 80 of 255 by
day, 98 at dawn, 92 at dusk and 107 at night (72, 102, 134 and 106 before this round), and after the version-31 fit of
the moods' wave brightness the composite no longer reaches the top output level at dusk at all (the share of the frame
there 0.0013 -> 0.00000, the maximum 255 -> 242); where the finished frame still clipped it was the background and
not the band, and the last of that went with this round's palettes - over all twelve months and the four mood holds
(`wavetop.js`, 1280 x 720, the same moment on both sides) the composite reached the top output level only in August
by day, over 0.0098 of the frame, and now reaches it in no month and no mood (August by day 255 -> 247, with the
September palette the mid-August frame reads). At the four dusk conditions
the footage covers, the share of band pixels at the top level is 0.0024, the footage's own 0.0024, where it was 0.038.

Each mood's own wave brightness is now kept apart from the composite's gain (spec 31) and fitted on that section's
observable: the band's added light integrated down each column over the band's extent, divided by the fitted
background under the band at the same column (`tools/measure/bandlevel.py`, `bandlevelset.py`), per mood against
footage of that mood over the 15 or 16 clips of each mood hold at five moments each. Version 36 says this fit goes
stale whenever the sheet or the camera moves and that the figure must be averaged over a stretch long enough that it
stops depending on where the stretch starts, with how long to be established rather than assumed; it was re-run after
this round's shading change, and the stretch was established first (`bandlevelwin.py`, the figure over every window of
a given length). A 10 s window - which is all any clip of the index is - leaves the band's added light spreading 8 %
between windows on the 30 s lossless day render, 28 % on a 120 s day render and 54 % on a 120 s night render, and the
ratio form at night spreads 136 %; 60 s brings those to 7 % and 14 %. This build's own band breathes about twice as
hard as the original's (frame to frame 17 % against 10 % over the same 120 s day condition), which version 36 says is
the sheet's motion showing up in a look measurement. The fit therefore pools the index's twelve noise clips of each
condition, 120 s of one condition sampled from 40 s to 30 minutes after the start, whose standard error is about 3 %.
On that footage only the day was outside its own uncertainty after the shading change (ratio 1.374 +- 0.060, nine
standard errors, against night 0.937 +- 0.049 on the added light, dawn 0.995 +- 0.039 and dusk 0.963 +- 0.035), so
only the day moved: `waveBright` 0.18 -> 0.137, which brings its ratio to 1.003 +- 0.044 and its added light to 0.968.
Over the matched 120 s stretch of the day condition instead of the index's clips the same figure reads 0.889, about
one and a half times the two estimates' combined standard error away, so the day is settled to within about 10 %
either way and the stretch study says no form of this measurement does better than about 5 % on the footage
available. Version 36's extension of the observable's first caution - that the denominator carries the background's
own gradient and so the band's own placement, and that where the two sides' backgrounds under the band disagree the
fit must be made on the band's added light instead, with the difference reported beside it - is now printed on both
sides by `bandlevelset.py compare`: the background under the band is 0.97 of the footage's by day, 1.00 at dawn, 0.99
at dusk and 1.09 at night, so the ratio is the measurement in the three daylight moods and the night is read on the
added light, which is also the steadier of the two there. (The background lane's version-35 fit is what made that
denominator usable at night: it was 25 levels against the original's 7.9 and is now 6.8 against 6.4.) Version 31 says
this value leaves the band's structure very nearly where it was, and on this build it does not quite: the day's 24 %
cut took its face level from 0.078 to 0.054 and its fold-to-face ratio from 12.9 to 18.6, because the composite's
black offset crushes the faces' faint light. By the light the two shading terms deliver over the sheet, the per-mood
wave brightness runs day 0.040 < dusk 0.056 < night 0.059 < dawn 0.062 against spec 31's day < night < dusk < dawn:
the day lowest and the dawn highest as stated, with the night and dusk 5 % apart and the other way round, which is
inside what the observable can tell here - bringing the night under the dusk would take it away from its own
observable, which already reads 0.94. The gains are unchanged and keep the spec's order and spacing (day 1.128, dawn 1.220,
dusk 1.343, night 1.385); refitted on the background alone they want x 1.001 in the three daylight moods, and with the
band allowed to pull, the fit now wants day x 1.110 against dawn x 1.040, so it no longer asks for the push on the
dawn gain that spec 27 refuses (at main it wanted day x 1.126 against dusk x 0.985).

The two shading curves' shapes were moved to satisfy spec 31's check of where the sheet sits on them, which the
version-17 shapes failed in almost every mood (the typical bit of sheet at 0.80 to 1.01 of the Fresnel-like peak, and
a cut-off that removed 0.06 to 0.13 of the sheen); no scale of the size factor can satisfy it, as version 31 warns,
so the shapes themselves changed (fresPeak 0.12 -> 0.085, fresTail 0.1403 -> 0.40, sheenCut0 0.2179 -> 0.185,
sheenCut1 0.599 -> 0.32). The typical sample now lies at 1.13 to 1.43 of the peak on its falling side, more of the
sheet lies beyond the response's falling half-height than below its rising one in every mood, and the cut-off removes
0.25 to 0.41 of the sheen's light; version 17's own rules still hold (the response's width at half height is 0.48 of
the peak's distance from zero, and the sheen stays flat until 1.50 times the size factor at which the peak sits).

Version 36's round moved the cut-off's own shape, which that version names as the strongest and cheapest lever on the
band's face level, and withdrew version 24's conclusion that no shape of the two responses can tell the band's faces
from the picture outside it. Read mood by mood (`tools/measure/looksweep.py`, the battery's own code on this build's
renders and on the footage of the four mood holds) this build had version 36's first fault in three moods of four:
the folds at the right level and the faces empty, with a fold-to-face ratio far above the original's, more partings
and more peaks in a column. Face level, footage against this build before the round: night 0.274 / 0.228, dawn
0.219 / 0.099, day 0.181 / 0.002, dusk 0.247 / 0.123; fold-to-face 3.66 / 4.47, 4.58 / 10.07, 5.55 / 574,
4.06 / 8.10. The faint light just outside the band (`skirt.py`) was short in the same three moods (dawn 0.80 / 0.37,
day 0.46 / 0.27, dusk 0.84 / 0.33 levels 1 to 10 rows out), which version 36 says makes the cure free of cost there.
Version 36's pricing of the three mechanisms holds on this build: raising the day's sheen strength from 1.2 to 1.8
moved its face level only 0.001 -> 0.028 and lowering its Fresnel-like strength moved it not at all, while the cut-off
moved it from 0.001 to 0.087 at 0.22 / 0.38 and to 0.187 at 0.25 / 0.50 - over the whole of what the original shows,
as version 36 says. What stops it is the cost version 36 also names: by 0.25 / 0.50 the dark moods' bands have fused
(the night's brightest line 59 px against the footage's 23, its broad sheen 52 against 24). The round therefore takes
`sheenCut0` 0.185 -> 0.205 and `sheenCut1` 0.32 -> 0.35 on the shared curve, raises the night's and dusk's size scale
(0.54 -> 0.585 and 0.555) as version 36 says to expect after a change to a curve every mood reads, and raises the
day's sheen strength to 1.8 so that the sheen carries most of the day's light, which version 36 says it must in every
mood. Over the whole index the face level goes from 0.102 to 0.167 (the original's 0.236), the fold-to-face ratio from
9.85 to 5.99 (4.24), the brightest fold over the average face from 6.07 to 4.05 (2.96), the overlap ratio from 65.3 to
17.6 (3.74), the partings from 1.63 to 1.21 a column (0.63) and their median length from 0.233 to 0.187 W (0.097),
the fill's mean over its maximum from 0.294 to 0.327 (0.313) and the broad sheen's width from 22.6 to 24.2 px (23.7).
Mood by mood the night is now matched measure for measure (face level 0.286 against 0.279, fold-to-face 3.50 against
3.58), dawn and dusk are two thirds of the way and the day a third. What it costs is the widths: the typical line
6.73 -> 7.05 px (6.61), the brightest line 18.9 -> 22.9 (19.5) and the width of all peaks 12.0 -> 14.3 (10.5), the
last of these the largest move away from the original anywhere in the build and a quarter of that measure's own range.
All three of version 31's placement points still pass in every mood, and the figures now vary less between moods than
between moments of one mood, which is what version 36 asks: the typical product 1.41 / 1.55 / 1.61 / 1.44 of the peak
(spread 0.20) against a wobble of 0.41 to 0.46 between the five moments of a single mood, the falling-minus-rising
share 0.28 / 0.35 / 0.39 / 0.30 (spread 0.11, wobble 0.28 to 0.33) and the cut-off's bite 0.27 / 0.35 / 0.37 / 0.28
(spread 0.10, wobble 0.32 to 0.33). The sheen is 0.74 to 0.81 of the sheet's light in every mood, the day's having
risen from 0.62, and rendering each term alone confirms version 36's account of where each lands: the Fresnel-like
term alone gives a face level of 0.00 to 0.02, a fold-to-face ratio of 49 to 19,000 and 4 to 7 px lines, which is
version 36's "what the Fresnel-like term alone looks like with the band's peak made to match", while the sheen alone
fills the night's faces to 0.33 and carries two thirds of the day band's mean light.

The wave tint's left-to-right ramp is fitted on the slope of the band's added light taken as a profile across the
whole width (`tools/measure/rampprof.py` through `rampset.py`, version 27, replacing version 20's ratio of the
brightest places) and was re-run on this shading, as versions 28 and 36 both ask. Pooled over all 38 clips the
original gives sum -0.952 +- 0.051, column peak -0.035 +- 0.027 and band height -0.581 +- 0.096; this build now gives
-0.688 +- 0.059, -0.633 +- 0.024 and +0.108 +- 0.035, where before this round it gave -0.353, -0.544 and +0.350. So
the shading change took the sum form two thirds of the way to the footage's and the band-height form from the wrong
sign to nearly flat, and left the peak form slightly worse. The peak form wants the tint steeper by about 96 % of the
width, which the spec's "slight" forbids outright, and the sum form wants it flatter, so no tint satisfies both: the
tint is left as it is (left 0.952 of right 0.990, the slight brightening the spec asks for) and the residual belongs
to the sheet's shape.

The glare chain's first level is now a fixed 240-cell grid laid over the picture rather than the output's width over
8 (spec 28), so the halo keeps its width as a fraction of the picture: at 1280 x 720 and 2560 x 1440 it is 0.1125 and
0.1104 of the height at a tenth of its peak, where the old chain gave 0.192 and 0.144 with the peak growing from 1.36
to 2.00 levels. Nothing changes at 1920 x 1080, where everything here is measured. The bright-pass weight is no longer
divided by the pixel's brightest channel and is carried at the picture's own precision (spec 28), so a source that
only grazes the knee now contributes nothing at all. Each mood's threshold sits inside the bracket the original's
footage allows: the night's is the lowest of the four (0.64, where footage allows 0.60 to 0.68) and the night band
reaches only 0.46-0.51 in every month, so the night is free of halo with a margin and not by an unreachable
threshold as before (it was 0.9, the highest of the four); the day's is 0.72, re-read from version 28's correction
that the background glares by itself in the last weeks before the turn of the year and not around it, so that
January's day background (0.698-0.702 on footage) does not pass and the dimmest day band (0.744) does. On this build
January's background now produces no glare at all and November's and December's do. My brightest day background is
still the sun spot at the top, brighter than the original's brightest part, so by day my background passes the
threshold by itself in 6 months of 12 (8 before) and lifts a broad part of the frame in August, June and November,
which version 27 says to read as a bright-pass feed that is wrong and not as a mis-weighted pyramid; at dawn it
passes in 2 months and at dusk in 3, and at night in none. The day halo swings from nothing at all in April and
September to a visible lift in August, which is the swing version 28 asks for. Spec 5 puts dusk's glare first and
mine now puts dawn's first: my dusk band's peak sits below the original's while its added light matches, so less of
it clears a threshold placed where the footage puts it. The month-by-month glare totals and both sides of the bright-pass in this paragraph were read on the look lane's branch, before the spec-30 sheet was merged into it, and have not been read again on the merged build; the band's light moved with that sheet (below), so the margins by mood will have moved with it.

Still short: the background's remaining error is hour structure that neither the exposure nor the palettes' level can
reach. On the sheet's own look every one of the look lane's 42 measures is inside the original's range at every one of
the three seeds, as it was before this round: the typical line 7.1 px (the original 6.6, range 5.5-7.4), the broad
sheen 24.2 (23.7, 21.0-26.1), the brightest line 22.9 (19.5, 15.0-27.0) and the line's peak over the band 1.57 (1.63,
1.38-1.88). What version 36's round fixed is how the band's light is shared between its folds and its faces (above);
what is still short is the band's own light and the day's faces. The band's peak over the background is 80 levels
against the original's 99 (range 73-112) and its mean 34 against 41 (27-52), up from 75 and 30 on `main` but still at
the low edge of the original's own variation. The day's faces carry 0.054 of the column maximum against the footage's
0.180 at that mood hold, and the day's fold-to-face ratio is 18.6 against 5.70; the shared cut-off cannot be taken
further without fusing the dark moods' bands, and the day's sheet would have to sit lower on that one curve than the
night's does, which spec 4.5's order on the per-mood size scale forbids - so what is left of the day's faces is the
per-mood geometry (camera pitch and lift, lattice scale, envelope crossover), which belongs to 4.1 and 4.4 and not to
this lane. The band's own light points the same way: the original's day band has one and a half times this build's
ratio of peak to column integral, and no pair of strengths can give both (solving for them gives a negative sheen),
so that too is the band's structure and the length of its outer edge rise rather than any level this lane sets.

Of the fixed battery's 168 measures, 122 lie inside the original's range at every one of the three seeds (motion 47 of
50, look 42 of 42, sparkles 18 of 22, background 15 of 54, where 42 of that lane's 54 are the pixel comparison whose
original is zero by construction). Before this merge the same count was 123 at every seed (motion 49, look 40,
sparkles 19, background 15). Every one of the look lane's own 42 measures is now inside the range at every seed, where
40 were before; the merge gained `wave.line_width_median` (4.67 -> 7.09 px, the original 6.61) and
`wave.line_peak_over_band_median` (1.27 -> 1.70, the original 1.63). Three measures of the other two lanes crossed
from inside their range to just outside it, each by a small fraction of that measure's own range, and nothing moved
away from the original by more than its range (the merge gate's test): the picture's correlation with itself five
seconds on (-0.121 -> -0.044 against the original's -0.284, the noise clips reaching -0.051; 0.16 of the range), how
differently neighbouring strands move (7.86 -> 6.40 px/s against 8.45, the noise clips reaching 6.44; 0.38 of the
range) and the sparkles' ninetieth-percentile count (800 -> 767 against 838, the noise clips reaching 770; 0.15 of the
range). All three follow from the shading: crisper, better separated lines with see-through faces change what the
flow and the strand-to-strand measures find, and they are the price of the four look measures that came inside.

The joint re-tune after this merge found the shared settings at the fit's fixed point again. One step of
`jointfit.py --weight=1.0 --hold=night` (step 0.7) moves the four gains by 0.1 % and the twelve palette grids by at
most 1.6 %, and taking it leaves the background away from the band 0.005 levels a channel worse (1.516 -> 1.521 over
the 38 clips, against 0.05 between two noise clips of one condition) with the band's peak unmoved (77.28 -> 77.33), so
every gain and all twelve palettes are kept. The merge itself changed that figure by 0.001 levels (main 1.517), and by
hour it is 1.17 at midnight, 1.63 at dawn, 1.43 at noon, 2.11 at dusk and 1.00 at 21:30, all within 0.004 of main's:
the glare chain's new first level and its unnormalised bright-pass do not reach the background away from the band at
1920 x 1080. The two alternatives were measured again on this build and are still the wrong trades: letting the band
pull on the gain (`--weight=0.5`) takes the background from 1.516 to 1.976 levels a channel, and dawn from 1.62 to
2.96, for 5.8 levels of band peak; letting the fit have the night takes 00:00 from 1.173 to 1.088 and 21:30 from 0.995
to 1.860. The camera needs nothing: the merge leaves the band's place on the screen untouched to four figures (centre
0.4509 H, lowest 0.3292, highest 0.6713, top lit row 0.1111, all identical to main's), so the aim the motion lane
fitted still stands. The floor was re-read rather than re-fitted: on the merged build the night black top is 0.273 H
(`blackfoot.py` at the four 00:00 conditions, 0.2667-0.2815 by month) against the original's 0.332 (0.291-0.352 over
the same eight clips), the same reading as before this merge, so the floor stays at 0.03 and the lowering the
observable asks for still belongs to the night images themselves, which `bgfit/` can move and a palette scaling
cannot.

The background lane's round after that merge changed no pixel of the build: it added the lane's scored set, the
background error by hour and month, the night bottom read as a curve and the fit of the four unshown months
described above, which it left unapplied. The merge gate was therefore vacuous and passed exactly - the merged
build's page is main's page byte for byte, and all 168 measures are identical at all three seeds (122 inside the
original's range, motion 47 of 50, look 42 of 42, sparkles 18 of 22, background 15 of 54). The joint re-tune after
it took that fit, which is the one thing in the round that moves a level, and found everything else at its fixed
point again: one step of `jointfit.py --weight=1.0 --hold=night` (step 0.7) moves the four gains by 0.1 % and the
twelve grids by at most 1.6 %, and taking it leaves the background away from the band 0.005 levels a channel worse
(1.516 -> 1.521 over the 38 clips) with the band's peak unmoved (77.28 -> 77.33), so every gain and the eight
palettes the index can see are kept; the two alternatives (the band pulling on the gain, and letting the fit have
the night) are the same refusals as last round, on the same build. The four fitted palettes do not reach the
measured index at all: with them applied the whole battery is identical to main's at all three seeds, every one of
the 19 scored conditions is unchanged to +-0.000 levels, and the background away from the band stays at 1.516
levels a channel (by hour 1.17 / 1.63 / 1.43 / 2.11 / 1.00). The camera needs nothing (the band's place is main's to
four figures) and the floor stays at 0.03: read again on this build, the night black top is 0.261 H
(`blackfoot.py` at the four 00:00 conditions, 0.2556-0.2685 by month, lift 0.5 levels; 0.2718 H and 0.2667-0.2815
at lift 1) against the original's 0.3296 and 0.3440 by the same code over the same eight clips, so what the
observable asks for is still the night images' own dark end and not a deeper floor.

The version-35 background went in behind the gate and the shared settings were then re-fitted on it. The gate's own
test - that no other lane moves away from the original by more than that measure's own range - passes with room to
spare: over all 168 measures at three seeds the largest move away from the original outside this lane is 0.50 of that
measure's range (`wave.lines_25pct_count`, 0 -> 1 of a range of 2, at one seed), then 0.42
(`wave.fold_over_face_p90`, whose range is enormous), and the worst in the motion and sparkle lanes are 0.11 and 0.06.
One measure outside the lane crossed from inside its range to just outside it, by two sparkles
(`sparkles.count_median` 739 -> 737 against the original's 801, the noise clips reaching 739; 0.01 of the range).
Of the 168 measures, 125 lie inside the original's range at every one of the three seeds against main's 122 (motion
47 of 50, look 42 of 42, sparkles 17 of 22, background 19 of 54). Through the fixed battery the background away from
the band goes from 1.516 levels a channel on main to 1.419 on the merge, and by hour from 1.17 / 1.63 / 1.43 / 2.11 /
1.00 at 00 / 06 / 12 / 18 h and 21:30 to 0.82 / 1.37 / 2.02 / 1.49 / 1.09: midnight, dawn and dusk come down and noon
goes up, which is the lane's own reading of its fit. Unlike the last three rounds the joint re-tune after the merge
was not at the fit's fixed point, because the painted images moved: `jointfit.py --weight=1.0 --hold=night` (step 0.7)
takes the background from 1.419 to 1.344 levels a channel in one step and 1.325 in two, and then stops - ten steps run
in a row give 1.344, 1.325, 1.330, 1.325, 1.311, 1.325, 1.322, 1.329, 1.325, 1.328, a plateau whose spread (0.018) is
below the measure's own noise (0.043-0.093 between two noise clips of one condition). Two steps are taken. They move
the three daylight gains by 0.2-0.3 % (day 1.128 -> 1.131, dawn 1.220 -> 1.223, dusk 1.343 -> 1.346; the night's 1.385
is held out of the fit) and the twelve palette grids by at most 2.6 %, leave the band's peak over the background where
it was (75.27 -> 75.44 levels, against 77.28 on main) and bring noon from 2.02 to 1.65 levels a channel, the hour the
merge had made worse. What they cost is the signed level: the whole-frame signed mean goes from -0.087 to +0.142
levels, where one step leaves it at +0.039 and main sits at +0.156, and five signed region means at the top of the
frame that happened to land inside their +-0.03 level noise band on the merge fall just outside it again, which is why
the lane's count reads 15 of 54 after the re-tune rather than 19. The absolute error is the figure every round quotes
and the signed one is a tenth of a level either way, so the second step is kept; if the lane would rather hold the
signed mean near zero, one step is the build to take. The two alternatives are still the wrong trades, measured again
on this background: letting the band pull on the gain (`--weight=0.5`) takes the background from 1.419 to 1.949 levels
a channel and dawn from 1.37 to 3.34 for 6.9 levels of band peak, and letting the fit have the night leaves midnight
where it is (0.817 -> 0.816) and takes 21:30 from 1.09 to 1.45. The camera needs nothing: the band's place on the
screen is main's to three figures (centre 0.450 H against 0.451, lowest 0.329, highest 0.672, thickness 0.179 H, all
unmoved by the background), so the aim the motion lane fitted still stands. And the floor is no longer a trade. The
remedy version 27 named - a background fit that lets the dark end of the night images move rather than scaling them -
is what this lane's round did, and on the result all three of the floor's readings prefer 0.03: the night black top is
0.305 H (`blackfoot.py` at the four 00:00 conditions, 0.169-0.327 by month, lift 0.5) against the original's 0.330
(0.272-0.336 over the same eight clips) where main read 0.261, and a build re-tuned to convergence at 0.045 (seven
`jointfit.py --weight=1.0 --hold=night` steps) reads 0.357 and overshoots in all four months; the night band's colour
(`bandpos.py` over 30 moments of the six night conditions) is 0.0157 mean absolute share error per channel at 0.03
against 0.0218 at 0.045, where on the version-28 images it was 0.0200 and 0.0143 - the direction has turned over; and
the background away from the band is 1.325 levels a channel at 0.03 against 1.762 at 0.045. The night background under
the band, which used to be 25 levels against the original's 7.9, is now 6.8 against 6.4 over the same 30 moments, so
version 31's ratio for the night is no longer absorbing a background error. Spec 27's ceiling still holds after the
re-tune: over the twelve months and the four mood holds the composite of background and wave reaches 241 of 255 at
most (September at dawn) and the top output level in none of the 48, and the wave alone reaches 77 by day, 100 at
dawn, 92 at dusk and 86 at night (`wavetop.js`, 1280 x 720).

Version 36 replaces that single ceiling with two, the second of them on the finished frame - background, wave, glare
and sparkles together as the screen gets it - in every mood and every month rather than only the months there is
footage of, with the clipped pixels sorted by what they need rather than merely counted. Both pass, over 96 conditions
(twelve months x the 4th, where a month's own images show alone, and the 15th x the four mood holds; `wavetop.js
--sweep`, `ceilings.py`, 1280 x 720, five renders each). The wave alone reaches 158 of 255 at night, 115 at dawn, 93
by day and 102 at dusk, well short in every mood. The background on its own never reaches the top level in any mood or
month - its highest is 202, April at dusk - which version 36 says the original's never does and is the strict part of
the test. The finished frame does reach the top level, at every mood hold and in many months, a bare handful at night
(0.00002 of the frame) and more in the daylight moods (0.0023 at dawn), and in two months at dawn over a connected
patch: 1636 pixels at (0.04, 0.45) on 4 October, which needs the wave (1894 of the 2115 clipped pixels there) and the
glare (1715). That is version 36's description of the original's own character, the crest of the band topping out with
its glare over it. In none of the 96 conditions does a pixel still clip with the wave and the sparkles taken away, so
nothing here is a background too bright for its mood or a bright-pass being fed too much.

Measured through the fixed battery at three seeds, version 36's round takes 123 of the 168 measures inside the
original's range at every one of the three seeds against `main`'s 121 at seed 1 and 122 at seeds 2 and 3 (motion 47 of
50 unchanged, look 42 of 42 unchanged, sparkles 17 -> 19, background 15 of 54 unchanged). No measure crosses from
inside its range to outside it, and the merge gate's own test - that no other lane moves away from the original by
more than that measure's own range - passes with room to spare: the largest move away outside this lane is 0.32 of
that measure's range (`bgpixel.middle_centre.R_mean`, 1.056 -> 1.069 levels where the range is the noise clips' 0.040),
and the worst in the motion and sparkle lanes are 0.06 and 0.04. The background away from the band is untouched to
four figures (1.353 levels a channel on both sides, the battery's median over the 19 conditions), as it must be, and
the two sparkle count measures that sat just outside their range come inside (`count_p90` 767 -> 776 against the
original's 838). Within the look lane 69 of its 126 measure-seeds move towards the original and 47 away; the largest
of those away is the width of all peaks (12.0 -> 14.3 px against the original's 10.5, a quarter of its range).

The version-36 look round went in behind the gate, which was run again on the merge itself (the whole battery, all
four lanes, three seeds, `battery.py` on the merge commit and on `main`, `gate.py` between the two) and reads as the
lane's own run does: 123 of the 168 measures inside the original's range at every seed against `main`'s 121, 122 and
122 (motion 47 of 50, look 42 of 42, sparkles 17 -> 19, background 15 of 54), no measure crossing from inside its
range to outside it, four sparkle measure-seeds crossing in, and the largest move away from the original outside this
lane 0.32 of that measure's range (`bgpixel.middle_centre.R_mean` 1.056 -> 1.069 levels, where the range is the noise
clips' 0.040 and the whole move is 0.013 of a level), then 0.06 in the motion lane (`motion.parting_right_share`) and
0.04 in the sparkle lane (`sparkles.tracks`); inside the lane the largest is 0.25 (`wave.peak_width_all_median`). The
band's light is the merge's own gain: its peak over the background goes from 75.4 levels on `main` to 79.6 (the
original's 98.8) and its mean from 30.3 to 34.0 (41.2). The background away from the band is untouched - 1.325 levels
a channel on both sides as the mean over the 19 conditions (the 1.353 above is the same quantity taken as the
battery's own median per channel) and by hour 0.82 / 1.39 / 1.65 / 1.47 / 1.10 at 00 / 06 / 12 / 18 h and 21:30, every
figure within 0.001 of `main`'s (`bgtable.py` on the battery's `bgpixel.json`) - as a change to the sheet's shading
must be.

The joint re-tune after this merge found the shared settings at the fit's fixed point. One step of `jointfit.py
--weight=1.0 --hold=night` (step 0.7) moves the three daylight gains by at most 0.1 % and the twelve palette grids by
at most 2.7 % (July's bottom row in red, 0.973; every other factor within 2 %), and taking it leaves the background
away from the band 0.001 levels a channel better (1.325 -> 1.324) with the band's peak unmoved (79.589 -> 79.589);
eight steps run in a row give 1.324, 1.326, 1.323, 1.314, 1.334, 1.332, 1.333, 1.336, a plateau whose spread (0.022)
is well below the measure's own noise (0.043-0.093 between two noise clips of one condition). Nothing is taken: every
gain and all twelve palettes are kept where the background lane's round left them. The two alternatives are the same
refusals as before, measured again on this sheet: letting the band pull on the gain (`--weight=0.5`) takes the
background from 1.325 to 2.020 levels a channel in one step and dawn from 1.39 to 3.46 for 5.2 levels of band peak,
and to 3.212 levels over five steps for 21.8 levels of peak; letting the fit have the night leaves midnight where it
is (0.816 -> 0.814) and takes 21:30 from 1.10 to 1.45. The camera needs nothing: the band's place on the screen is
`main`'s (centre 0.4505 H on both, lowest 0.3292 -> 0.3287, highest 0.6718, thickness 0.1787 H), so the aim the motion
lane fitted still stands. And the floor stays at 0.03, with all three of its readings taken again on this build, whose
night band is brighter than `main`'s: the night black top is 0.305 H (`blackfoot.py` at the four 00:00 conditions,
0.169-0.327 by month, lift 0.5) against the original's 0.330 (0.272-0.336 over the same eight clips), and a build
re-tuned to convergence at 0.045 (seven `jointfit.py --weight=1.0 --hold=night` steps) reads 0.359 and overshoots in
all four months; the night band's colour (`bandpos.py` over 30 moments of the six night conditions) is 0.0166 mean
absolute share error per channel at 0.03 against 0.0210 at that re-tuned 0.045 build, where `main` read 0.0157, so the
new night shading moves this reading by 0.0009 and not its direction; and the background away from the band is 1.325
levels a channel at 0.03 against 1.762 at 0.045. Version 36's two ceilings were read on both sides of the merge by one
sweep of the 15th of all twelve months at the four mood holds (`wavetop.js --sweep`, `ceilings.py`, 1280 x 720): the
wave alone reaches 158 of 255 at night, 115 at dawn, 93 by day and 102 at dusk against `main`'s 154 / 115 / 101 / 100,
the background alone never reaches the top level (its highest is 198, December at dusk, on both), and on neither build
does a clipped pixel of any of the 48 conditions survive dropping the wave and the sparkles.

What this merge does not settle, from the round's own measurer (their figures, not re-measured here): seventeen of the
battery's 19 scored conditions sit at 40 s after the start, so the battery's "42 of 42" is one pose of the cloth, and
over the index's twelve noise clips per mood hold - 40 s to 30 minutes - only 134 of 168 of the same look readings lie
inside the footage's range. Those that fail are one family: over minutes this band keeps fewer, broader strands
(3.1-3.6 peaks a column against 4.2-4.3; 6 or more peaks in 2-5 % of columns against 11-17 %) and a thinner, far less
variable body (0.133-0.136 H in every mood against 0.157-0.213), and its level reverses by mood (8-12 % high at night
and dawn, a seventh short by day) where the 40 s pose reads a fifth dim everywhere. The night's faint skirt is also
over the original's own spread 1-10 and 11-25 rows outside the band. Those are the look lane's next round and the
sheet's motion behind it, not this merge's.

Not verifiable from the references available so far: the depth of the mid-month
saturation drop still sits at the lower end of the range it is allowed (0.30),
though its breadth and the trace of it that survives the month's ends are now
read from the days through one month rather than chosen; where the month
handover's step sits, which version 34 asks to be read from the halfway row
through the days of a month, could not be read in April, whose picture and
May's differ by less than a level at noon, and was fitted through the
whole-frame error on those days instead; and the look between
01:00 and 03:00 and between 22:00 and 23:30, which follows the spec's
description (section 3, N8). Every month's palette is now read on footage of
its own month, and on days (the 4th) where that month's images show alone, so
the twelve palettes and the split between a month and the next are no longer
design choices alone. The day's own light is built as spec 28 says - a
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
