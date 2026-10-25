# xmb-waves

An original, from-scratch WebGL2 recreation of a well-known console menu
background: a flowing, luminous wave of fine lines drifting across a softly
coloured gradient, with glowing sparkles around it, whose colours follow the
time of day and the month.

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

- A 19 x 19 mass-spring net, shaken at the far end and gently pulled at the
  free end, is simulated at 60 fixed steps per second in a Web Worker. Each
  point of the shaken edge moves up and down by one slow oscillation and
  towards and away by another, with the timing offset building up across the
  width to about one and a half cycles for the height and two for the depth,
  so the edge is itself wavy and, because the two offsets differ, the folds
  it sends along the sheet cross at shallow angles; the springs are soft, so
  the folds travel slowly.
  Nothing pulls the net towards a rest shape: its form comes from the
  springs, the damping, the steady push and the shaking alone. Tiny random
  velocity kicks keep the motion alive and, because the across-the-width
  springs have no linear stiffness at rest length, also set how many strands
  the band shows (their size is tuned to the reference's three to four
  brightness peaks per column). The net is passed
  through a slow free-form deformation lattice (two slow twisting sways and a
  gentle swell about two screen widths long that travels along the band and
  lifts it, strands together) and used as the control net of a bicubic
  B-spline surface evaluated on the GPU and seen through a slightly raised
  (7 degrees), oblique perspective camera placed far back with a narrow field
  of view, so the near and far parts of the band look alike.
- The sheet is lit by the angle between its normal and the line of sight
  with a flat-topped response: the nearly edge-on faces of the shallowly
  seen sheet stay near full brightness, faces that turn towards the viewer
  fade to a faint level, and where a layer turns exactly edge-on a weak soft
  line is added. The band is therefore a broad, evenly lit ribbon whose folds
  stand only moderately above the faces, as in the reference, and overlapping
  layers add up. Every surface cell is drawn as its own small quad into a
  supersampled single-channel buffer with additive blending; cells thinner
  than a pixel are widened to a pixel and their light scaled by their true
  size, so silhouettes never shimmer. The buffer is filtered down in the
  final pass.
- The background is a small image per month and per day/night, blended by
  the day of the month and by the hour, upscaled with a B-spline filter and
  eased from frame to frame. A bright-pass bloom pyramid of background plus
  wave adds the glare.
- About 2,000 sparkles are flung off the moving sheet by bursts and trail
  walkers, drift with Brownian jitter, spin, and are drawn as billboards with
  depth of field and an iridescent tint, plus a glint pass. They are drawn
  straight onto the output after the final pass (the dither is applied just
  before them), which saves a full-resolution colour buffer.
- Everything is tuned by comparing deterministic renders (`mode=score`) side
  by side with public recordings of the original; see `docs/REFERENCES.md`.

## Building and testing

`index.html` is assembled from `src/` by `python3 tools/build.py` (no
dependencies); the committed `index.html` is that output. Deterministic
frames for side-by-side comparison come from `tools/render.js` (needs
Playwright with Chromium), for example:

    node tools/render.js frame.png '{"time":"2026-10-15T12:00:00","seed":1,"frames":300,"w":1280,"h":720}'

The same URL and `seed`, `frames`, `w`, `h` always give the same image on the
same browser and GPU; `layers=bg,wave,glare,sparkles,dither` picks layers.

## Status

Verified side by side against public recordings (see `docs/REFERENCES.md`)
and, like for like, against the reference frames and clips run through the
same measurement tools as my renders (the spec's section 4.6 statistics,
re-measured that way): the band's placement, its brightness over the day,
the number of strands per column, how much of the band is lit, the
face-to-fold contrast, the width of its lines and edges, the line-to-band
contrast, the partings between strands, the strands moving together, the
gentle swell and the slow drift of features. Still short of the reference:
the band has slightly more brightness peaks per column, is at times thicker
than the reference's thickest frame (about one frame in twenty over 40
minutes), and its picture changes a little faster (0.3 correlation after
one second against 0.4);
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
