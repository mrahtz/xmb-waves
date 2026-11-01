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
  per month, processed in hue, saturation and value. It is lit by a sun-like
  spot on an arc and an opposite glow along the bottom, both following the
  hour (the night image has its own clock). The day image is scaled by a
  daylight factor, and dawn and dusk darken and deepen the top. The next
  month's images rise in from the bottom towards the end of a month.
- The composite of background and wave goes through each mood's exposure and
  an extended Reinhard tone curve with a white point. The glare is a bloom
  pyramid read from that composite through a colour-keeping bright-pass
  (one weight per pixel from its brightest channel), with blue spread widest.
- Sparkles are born uniformly over the surface's parameters, mostly in
  bursts. They leave in a cone around the surface normal, with a held random
  jitter, light gravity and friction. They ramp in and out linearly, spin,
  and are sized in scene units with a partial turn towards the camera. They
  are lit by a point light in front of the camera through an iridescent
  colour map, with depth of field that grows a disc while keeping most of its
  brightness, and a camera-facing glint that follows the highlight. They are
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

Verified side by side against public recordings (see `docs/REFERENCES.md`)
and, like for like, against the reference frames and clips run through the
same measurement tools as my renders (the spec's section 4.6 statistics,
re-measured that way): the band's placement, its brightness over the day,
the number of strands per column, how much of the band is lit, the
face-to-fold contrast, the width of its lines and edges, the line-to-band
contrast, the partings between strands, the strands moving together, the
gentle swell and the slow drift of features. Still short of the reference:
its lines sit more in the middle of the band than at the fringes, it has
somewhat fewer crossings and dark partings between strands, its faces are a
little brighter relative to the folds, and its picture changes a little
faster (0.3 correlation after one second against 0.4);
the night look; the palettes for February, April (through a late-March
capture), May, August, October/November and September (purple); the sparkle
population and look; the glare's subtlety.

Not verifiable from the references available so far: the palettes for
January, March, June, July and December (and theme 1, silver), the look in
the small hours and at dawn, and the exact month-to-month blend in the
middle of a month. These are design guesses that follow the spec.

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
