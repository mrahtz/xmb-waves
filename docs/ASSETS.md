# Assets

Everything visual is generated in code at run time (background images, the
wave, sparkles, glare). The only shipped files besides the page are:

| File | What | How it was made |
| --- | --- | --- |
| `icon-512.png`, `icon-192.png`, `icon-180.png` | Home-screen icons | Rendered by this project's own `index.html` (score mode: 1 September, 12:00, seed 7, 300 frames, 512 x 512), then downscaled with Lanczos filtering. |
| `manifest.webmanifest` | Web-app manifest (full screen on the iPad home screen) | Hand-written. |
