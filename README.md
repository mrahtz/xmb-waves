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

- A 19 x 19 mass-spring net, driven at one end and pulled gently at the other,
  is simulated at 60 fixed steps per second in a Web Worker, passed through a
  slow free-form deformation lattice, and used as the control net of a bicubic
  B-spline surface evaluated on the GPU and seen through a perspective camera.
- The sheet is shaded by the angle between its normal and the line of sight,
  drawn additively into a supersampled single-channel buffer, and composited
  over a small, smoothly upscaled background made from per-month day and night
  images; a bright-pass bloom pyramid adds the glare.
- About 2,000 sparkles are flung off the moving sheet by bursts and trail
  walkers, drift with Brownian jitter, spin, and are drawn as billboards with
  depth of field and an iridescent tint, plus a glint pass.

## Licence

MIT, see [LICENSE](LICENSE).
