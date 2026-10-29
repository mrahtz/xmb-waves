# xmb-waves

An original, from-scratch WebGL2 recreation of a well-known console menu
background: a flowing, luminous wave of fine lines drifting across a softly
coloured gradient, with glowing sparkles around it, whose colours follow the
time of day and the month.

![The wave at noon on 15 September (purple), 8 seconds at real speed](docs/media/demo.gif)

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
  point of the shaken edge moves, by less than one grid spacing, up and down
  on a slow 60 s cycle and towards and away on a 40 s cycle, with the timing
  offset building up across the width to about one cycle for the height and
  nearly two and a half for the depth, so the edge is itself wavy and,
  because the two offsets differ, the folds it sends along the sheet cross at
  shallow angles; the springs are soft, so the folds travel slowly. The
  damping is light (motion dies away over about 120 s, two of the slower
  cycles), so folds launched at the shaken end still reach the free end.
  Nothing pulls the net towards a rest shape: its form comes from the
  springs, the damping, the steady push and the shaking alone. The page
  starts from a stored, already settled state of the net (kept in
  `src/sim.js`), so the wave is in its running form from the first frame.
  Tiny random
  velocity kicks keep the motion alive and, because the across-the-width
  springs have no linear stiffness at rest length, also set how many strands
  the band shows (their size is tuned to the reference's three to four
  brightness peaks per column). The net is passed
  through a slow free-form deformation lattice, laid out unevenly so the free
  end covers more of the scene (a swell rolling from the shaken end to the free
  end and growing along it, which lifts the band strands together, plus a
  sliding bump, a slow bob and a small twist) and used as the control net of a bicubic
  B-spline surface evaluated on the GPU. The sheet lies fairly flat, its
  length across the view and its width running away from the camera, which
  has a moderate (40 degree) field of view and looks down on it at a small
  angle (8 degrees by day, 9.5 at dawn and dusk, 4.5 at night), so a typical
  bit of the sheet is seen at a slant rather than face-on.
- The sheet is shaded per vertex in the camera's projected space (clip space
  before the perspective divide, where the vertical is stretched relative to
  the horizontal), as spec version 16 describes. Each vertex gets the cosine
  between its normal and the line of sight, and a size factor: the normal's
  component along the line of sight divided by the distance. The light is the
  size factor times the sum of a sheen, which is cut off where the size factor
  is large (near, face-on bits, so the faces are faint and see-through), and a
  glow, a narrow peak looked up with the cosine times the size factor, which
  makes the soft bright strip just inside every fold. The light falls towards
  nothing exactly where the sheet turns edge-on, so there is no hard line at
  the silhouette, and overlapping layers add up. Every surface cell is drawn
  as its own small quad into a supersampled single-channel buffer with
  additive blending; cells thinner than a pixel are widened to a pixel and
  their light scaled by their true size, so silhouettes never shimmer. The
  buffer is averaged down in the final pass with a box exactly one output
  pixel wide.
- The background is a small image per month and per day/night, blended by
  the day of the month and by the hour, upscaled with a B-spline filter and
  eased from frame to frame. A bright-pass bloom pyramid of background plus
  wave adds the glare.
- About 2,000 sparkles are flung off the moving sheet, born at the sample
  points of its mesh: nearly all by bursts (a fixed batch on a large share of
  the steps), a few by a single walker that leaves short trails along the
  length. They keep the velocity they are flung with (slightly more of them
  rising than falling) and spin. Each is drawn as a flat round disc in 3D,
  turned by its spin (towards the camera when close to it), with a crisp edge
  that softens out of focus (depth of field), and fades as it turns edge-on,
  so a fully edge-on disc is invisible. One point light gives each disc a
  diffuse term and a sharp highlight tinted by an iridescent colour map
  indexed by the disc's facing direction, through a soft curve that saturates
  to white; there is no random brightness per sparkle, so the spread from
  faint to bright and the twinkle come from the light as the discs spin. A
  soft round glint pass is added, the same at every time of day. They are drawn
  straight onto the output after the final pass (the dither is applied just
  before them), which saves a full-resolution colour buffer.
- Everything is tuned by comparing deterministic renders (`mode=score`) side
  by side with public recordings of the original; see `docs/REFERENCES.md`.

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

After changing any of the spring net's constants in `src/sim.js`, run
`node tools/mkstate.js` to settle the net again and write the new starting
state into `src/sim.js`, then rebuild `index.html`. Until then the stored
state no longer matches, and the page settles the net itself at start-up,
which takes a few seconds.

Deterministic frames for side-by-side comparison come from `tools/render.js`
(needs Playwright with Chromium), for example:

    node tools/render.js frame.png '{"time":"2026-10-15T12:00:00","seed":1,"frames":300,"w":1280,"h":720}'

The same URL and `seed`, `frames`, `w`, `h` always give the same image on the
same browser and GPU; `layers=bg,wave,glare,sparkles,dither` picks layers.
The tools that measure the wave against the public references, including a
fast evaluator and a parameter optimiser, are in `tools/measure/` (see its
README).

## Status

The implementation follows spec version 16, but has **not yet been retuned**
against the public recordings since that change. Spec version 16 changed the
wave's shading and asked for the sheet to be seen at a slant (section 4.4d),
which needed a different camera and a flatter, wider sheet. Those were set by
hand, with the shading's values carried over from a quick test and the
brightness set by eye. Earlier measurements (spec versions 14 and 15) are in
`docs/references/tuning-log.md`, but they describe the previous camera and
shading and no longer apply.

- The wave: a typical bit of the sheet is now seen obliquely (the spec's
  projected cosine has a median of 0.41-0.55 depending on the mood, against
  0.82-0.88 before). Compared with the previous build by eye, the band is
  thinner and straighter, with less arch and a smaller swell. The band
  statistics of spec section 4.6 have not been re-measured.
- The sparkles: births, lighting and fades follow spec version 16; their
  lighting values are first guesses, not matched to the sparkle clips.
- Unchanged since the last comparison: the palettes, the night look of the
  background and the glare.

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
