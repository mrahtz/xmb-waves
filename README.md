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
your local clock and date. Move the pointer or tap near the bottom-right corner
for the settings button (or press `p`); space pauses, `.` steps one frame.

URL parameters: `theme=0..12`, `time=2026-10-15T12:00` (fixed date and time),
`speed=60` (day clock speed), `scale=2` (render pixels per CSS pixel; `0` or
absent = the device's pixel ratio), `fps=1`, `layers=bg,wave,glare,sparkles,dither`,
`seed=<int>`, `pause=1`. Settings changed in the panel are remembered on the device.

On an iPad, "Add to Home Screen" opens it full screen; it keeps the screen
awake while shown where the browser allows it.

Deterministic renders for side-by-side testing: `index.html?mode=score&time=...&theme=...&seed=...&frames=...&w=...&h=...`
and `window.XMBW.render(opts)` (see section 9 of the spec).

## How it works (short)

- A 19 x 19 mass-spring net, driven at the far end and pulled gently at the
  near end, is simulated at 60 fixed steps per second in a Web Worker, passed
  through a slow free-form deformation lattice, and used as the control net of
  a bicubic B-spline surface evaluated on the GPU and seen through a slightly
  raised, oblique perspective camera placed far back with a narrow field of
  view, so the near and far parts of the band look alike.
- The sheet is lit by the angle between its normal and the line of sight: the
  light falls off exponentially with the cosine of that angle (brightest
  edge-on, about a quarter as bright face-on) plus a weak edge-on line, so
  each fold shows a broad soft gradient and overlapping layers add up to the
  reference's filled band with soft humps. Every surface cell is
  drawn as its own small quad into a supersampled single-channel buffer with
  additive blending; cells thinner than a pixel are widened to a pixel and
  their light scaled by their true size, so silhouettes never shimmer. The
  buffer is filtered down in the final pass.
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

Verified side by side against public recordings (see `docs/REFERENCES.md`),
most closely against 4K frames and a 10 s clip of one emulator recording:
the wave's placement, band height, brightness over the day, its filled
stack of broad soft translucent layers with crossing fold lines, its
softness at 4K, its pace, and the drift of its pattern along the band. The layers' brightness gradients are still a
little flatter than the reference's;
the night look; the palettes for February, April (through a late-March
capture), May, August, October/November and September (purple); the sparkle
population and look; the glare's subtlety.

Not verifiable from the references available so far: the palettes for
January, March, June, July and December (and theme 1, silver), the look in
the small hours and at dawn, and the exact month-to-month blend in the
middle of a month. These are design guesses that follow the spec.

Performance has been checked only in a software renderer; the 60 fps target
on an iPad has not been measured on a device yet.

## Licence

MIT, see [LICENSE](LICENSE).
