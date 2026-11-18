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

Built to spec version 33 (the background's painted images, its one rate in the height and its night floor; the sheet
and its motion to version 30; the composite's floor, the wave tint's ramp and the glare's locality to
version 27; the sparkles to version 25) and tuned against the
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
lowest band against 16 %). The background is fitted to 134 conditions covering all twelve months (version 33:
every month wants footage of its own month): the 4th and the 15th of each month at 00:00, 06:00, 12:00 and 18:00, the
hours between them the set reaches (January, July and October on the 4th from 02:00 to 22:00; January, April, July and
October on the 15th at 03:00, 04:00, 09:00, 15:00, 20:00 and 21:00), 15 and 29 October 21:30, and the index's own 19
recordings and 19 renders where they fall on those conditions. The 4th of a month is inside the first week, where that
month's images show alone, so a month's palette can at last be read on its own rather than only in a mid-month mix.
Each month's day and night image is a painted picture held as a coarse grid of colours, four columns wide so that the
bend across the width need not sit at the middle, with its rows crowded towards the bottom edge so that the knee just
above the edge can be held (day 4 x 6, night 4 x 7). Every curve of the clock - the daylight factor, the fading of the
day image up the frame, the deepening of its colour, the night image's envelope and its own fading - is a product of
one pair of smooth steps taken at two rates in fixed proportion, placed where the travelling spot crosses the bottom
edge (version 28). All three falls up the frame - the day image's value shaping, its saturation raise (that same fall
read the other way up, a rise levelling off towards a ceiling near the top rather than growing without limit) and the
night image's shaping - fall off at one rate in the height (7.79), differing only in the clock that drives each
(version 33), and the floor under the night level is applied last, to the whole product, so wherever it binds the night
picture is flat from the bottom edge to the top. The images, the lights, that rate, the ceiling and the two step rates
were fitted together over all 134 conditions. Measured month by month where the wave does not cover it, the mean
absolute difference per channel is 1.93-2.95 levels (mean over the twelve 2.47), against 6.30-28.33 before this round
(mean 16.50): the merged build was 6.3-11.1 levels in the four months it had been fitted on and 15.9-28.3 in the eight
it had never seen. On the days that show one month alone it was 20.50 levels against 8.94 on the mixed days, because
two neighbouring palettes wrong in opposite directions cancel in a mid-month mix and the old set was made of mixes;
it is now 2.15 against 2.55. By hour the daytime conditions went from 19.3 / 22.3 / 21.7 levels at 06:00 / 12:00 /
18:00 to 2.7 / 3.2 / 2.9, and the night ones from 6.2 at 00:00 to 1.3. The same comparison on the eighteen conditions
of the footage index alone - the only ones the old fit ever saw - goes the other way, 1.53 to 2.31 levels, and the
battery's pixel comparison over its 19 conditions with it (1.48 / 1.58 / 1.15 in R / G / B to 2.45 / 2.06 / 2.63, and
15 of the lane's 54 measures within the original's range to 12). That is the price of one lighting model having to
satisfy 134 conditions instead of 25; version 33's own test says where the rest of the fault now lies, and it is not
the painted pictures: split into the part that stands still over the hours of a month and the part that travels with
them, the residue was 13.75 standing against 12.41 travelling and is now 1.30 against 2.37, the travelling part the
larger in every month. The composite's black offset, each mood's exposure and the twelve month palettes are fitted together to the
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
palette is more coloured than the original's lean where the original's stay neutral. The wave's own light cannot
drive the picture to white in any mood (spec 27): rendered alone it reaches 61 of 255 by day, 84 at dawn, 110 at dusk
and 137 at night, and on the finished frames the share of pixels at 255 is 0.000075 against the footage's 0.0001
(measured at the larger floor the look lane fitted, and not re-measured since the floor was held at 0.03).
The wave tint's left-to-right ramp is fitted on the slope of the band's added light taken as a profile across the
whole width (`tools/measure/rampprof.py`, version 27, replacing version 20's ratio of the brightest places), but the
value in the build was fitted before the spec-26 sheet and is now the wrong way: pooled over the 19 conditions the
slope of the column peak is -0.44 against the footage's -0.035 +- 0.027 (the recordings +0.039, the lossless renders
-0.106), where the tint this build had before the merge gives -0.30. The tint answers to this at about +0.006 per
1 % of the left-to-right ratio, so closing the gap would need the left about 0.6 of the right - far outside the
"brightening slightly" the spec asks for - which puts the remaining slope in the sheet's shape rather than the tint,
the same place as the band's height profile. Each mood's bright-pass threshold sits inside the bracket measured on the
original's footage (spec 24), and the night runs the same glare chain without any halo (at most one output level). My
brightest day background is still the sun spot at the top, brighter than the original's brightest part, so by day my
background glares by itself in eight months of twelve instead of only around the turn of the year, as a visible blob
over the spot; but with the version-28 background and the re-tune after it the two months spec 24 names now fall on
the right sides of the day threshold of 0.68 - January passes at 0.686 and July does not at 0.671 - where before
January fell 0.025 short. At dawn the background passes in 2 months of 12 and at dusk in 3 (7 and 6 before), and at
night in none. Where the background stays under the
line the halo is local as version 27 asks (the glare changes a few per cent of a day frame by at most four levels);
where it passes, it lifts a broad part of the frame, which version 27 says to read as a broad bright-pass feed and
not as a mis-weighted pyramid. Spec 5 puts dusk's glare first, and mine still puts day's first. Still short: the background's remaining error
is hour structure that neither the exposure nor the palettes' level can reach, though the spec-26 sheet and the
re-tune after it have more than halved it at the two hours where it was largest. The band's light is now the open
question, and it is the wave's own brightness by mood rather than the composite's gain, which scales the background
with it: at noon the band's peak over the background is 56 against the original's 81 and its mean 23 against 33, while
at dusk it is 99 and 53 against 103 and 45. The night, where the band used to carry 68 levels of mean light against
the original's 43 because the brightest point of a column was a sparkle rather than a fold, now reads 43 against 43
and 90 against 106 at the peak. The spec-30 aim took about 8 levels off the band's peak over the whole set (93 to 85,
the original's 99) and left its mean where it was (42 against 41), the band having moved to a place on the screen
where the sheet is a little farther from the camera. On the sheet's own look, the lines are thinner than the original's (4.7 px against
5.5-7.4) and stand less above the band (1.27 against 1.38-1.88), while the broad sheen and the brightest line, which
were about twice as wide as the original's, came in with the spec-30 sheet to 37.5 px against 21-26 and 42.7 against
15-27: the per-mood sheen and wave brightness have not been refitted to this sheet, and neither has the wave tint.
Of the fixed battery's 168 measures, 123 lie inside the original's range at every one of the three seeds
(motion 49 of 50, look 40 of 42, sparkles 19 of 22, background 15 of 54, where 42 of that lane's 54 are the pixel
comparison whose original is zero by construction). Before this merge the same counts were 111, 113 and 112
(motion 44, look 37, sparkles 17/19/17, background 13/13/14). Nothing in the three other lanes moved away from the
original by more than that measure's own range except six region means of the background's pixel comparison, each by
at most 0.15 of an output level against a noise range of 0.02-0.05 (`bgpixel.bottom_right.R_mean` 0.13 -> 0.28 the
largest), while every whole-frame background figure is unchanged within its noise range.

Not verifiable from the references available so far: the size of the mid-month
saturation drop (the fit takes it to the lower end of the range it is allowed,
0.30, and the footage of the 4th and the 15th between them pin the two ends of
a month rather than the depth of the mix in between); and the look between
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
