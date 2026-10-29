# Assets

Everything visual is generated in code at run time (background images, the
wave, sparkles, glare). The only shipped files besides the page are:

| File | What | How it was made |
| --- | --- | --- |
| `assets/icon-512.png`, `assets/icon-192.png`, `assets/icon-180.png` | Home-screen icons | Rendered by this project's own `index.html` (score mode: 1 September, 12:00, seed 7, 300 frames, 512 x 512), then downscaled with Lanczos filtering. |
| `docs/media/demo.gif` | Animated demonstration in the README (not used by the page) | Rendered by this project's own `index.html` (score mode: 15 September, 12:00, seed 1, frames 600 to 1076 every 4th frame, 480 x 270, without the dither layer), assembled with ffmpeg at 15 fps with a 128-colour palette and ordered dither. |
| `assets/manifest.webmanifest` | Web-app manifest (full screen on the iPad home screen) | Hand-written. |
