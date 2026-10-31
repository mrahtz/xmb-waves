# Assets

Everything visual is generated in code at run time (background images, the
wave, sparkles, glare). The only shipped files besides the page are:

| File | What | How it was made |
| --- | --- | --- |
| `assets/icon-512.png`, `assets/icon-192.png`, `assets/icon-180.png` | Home-screen icons | Rendered by this project's own `index.html` (score mode: 1 September, 12:00, seed 7, 300 frames, 512 x 512), then downscaled with Lanczos filtering. |
| `assets/manifest.webmanifest` | Web-app manifest (full screen on the iPad home screen) | Hand-written. |
| `docs/media/demo.gif` | README demonstration: the original (left) beside this project (right), 21:30 on 29 October, 10 seconds | Rendered from this project's own `index.html` with `tools/measure/seq.js` (score mode, seed 1, from 2400 frames in steps of 6) beside frames of `comparison/original/original-2026-10-29-2130.mp4`, both downscaled with Lanczos filtering and joined into a GIF with ffmpeg. |
