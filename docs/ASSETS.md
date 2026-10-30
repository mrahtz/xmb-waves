# Assets

Everything visual is generated in code at run time (background images, the
wave, sparkles, glare). The only shipped files besides the page are:

| File | What | How it was made |
| --- | --- | --- |
| `assets/icon-512.png`, `assets/icon-192.png`, `assets/icon-180.png` | Home-screen icons | Rendered by this project's own `index.html` (score mode: 1 September, 12:00, seed 7, 300 frames, 512 x 512), then downscaled with Lanczos filtering. |
| `docs/media/demo.gif` | Comparison in the README (not used by the page): 10 s of the original and of this project, side by side | The left half is `comparison/original/original-2026-10-29-2130.mp4` (footage of the original, see its README). The right half is rendered by this project's own `index.html` (score mode: 29 October 2026, 21:30, automatic theme, seed 1, frames 600 to 1198 every 2nd frame, 960 x 540). Both halves scaled to 480 x 270 at 10 fps, labelled, placed side by side (960 x 270) and assembled with ffmpeg with a 128-colour palette and ordered dither. |
| `assets/manifest.webmanifest` | Web-app manifest (full screen on the iPad home screen) | Hand-written. |
