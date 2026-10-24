# xmb-waves: functional specification (strict clean-room tier)

This document describes an effect: a flowing, luminous wave drifting across a softly coloured background, with glowing sparkles around it, whose colours follow the time of day and the month. It is the kind of animated menu background a game console might show.

It describes **what the viewer should see and how it should behave**. It deliberately contains no parameter values, colours, textures, counts or code. Every value, colour, texture and algorithmic detail not stated here is **your design**. Tune them until the private scorer (see "What the scorer measures") reports a good match. Where this document says "choose", the choice is yours.

**Version 2 (2026-10-24).** Change from version 1: section 4 now requires the wave to be a genuine three-dimensional surface seen through a perspective camera, and section 6 places the sparkles in the same 3D space (new "Geometry (required)" items; nothing else changed).

## 1. Output and platform

- A single static web page, `index.html`, rendering with WebGL2. No build step is required (a build step is fine if the output is a static page). No network requests at run time; every texture is generated in code or shipped as your own original asset.
- The picture has a 16:9 aspect by default and must render correctly at any resolution, from small previews to 4K and above. Other aspects (for example 4:3) are a nice-to-have.
- It runs smoothly (target: the display's refresh rate, at least 60 frames per second on a recent tablet) and keeps animating indefinitely without visible loops or drift.
- In normal use it follows the viewer's local clock and date.

## 2. Composition

The picture is built from these layers, back to front:

1. **Background**: a smooth colour gradient filling the screen.
2. **Wave**: a translucent, glowing sheet that crosses the screen roughly horizontally.
3. **Glare**: a soft bloom around the brightest parts of the image.
4. **Sparkles**: many tiny glowing particles floating around the wave, plus a fainter glint on each.
5. **Dither**: a very faint per-pixel noise that hides colour banding in the smooth gradients.

All the luminous layers (wave, glare, sparkles) add light to what is behind them (additive blending); nothing in the effect darkens or hides the background. The result is clamped to the displayable range.

## 3. Background

- A smooth gradient: mostly vertical (the brightness and hue change from top to bottom), with a gentle variation across the width. No visible bands or edges.
- Its palette depends on the **month**: each month of the year has its own palette (warm, cool, green, pink and so on); for example October's is a warm gold/brown. Choose twelve palettes that are pleasant and clearly distinct; tune them against the scorer's background score.
- It depends on the **time of day**: the same month looks brighter and more saturated around midday and darker and calmer at night, with dawn and dusk in between (see section 7).
- Changes are always gradual: no flicker from frame to frame and no visible jumps as the clock advances. How the palette behaves across the days of a month is yours to choose; the scorer samples each month on its 15th.

## 4. The wave

### Shape and motion

- The wave is a **sheet**: think of a long ribbon of cloth, wider than the screen, seen from a slightly raised, slightly oblique camera, so that it crosses the screen from left to right as a band whose thickness and height vary along its length. It folds over itself gently in places, so that parts of it are seen nearly edge-on.
- Its motion is a slow, organic undulation: ripples travel along it and its overall shape evolves over tens of seconds. It never repeats exactly, never settles and never moves abruptly. Its ends stay off screen.
- The surface looks perfectly smooth at any resolution (no visible facets or kinks).
- How the shape is generated and animated is entirely your design, within the geometry requirements below.
- The animation advances with real time (independent of the frame rate) and stays stable whatever the frame rate.

### Geometry (required)

- The wave is a genuine **three-dimensional surface** (two parameters: along and across the ribbon) that moves in 3D, rendered through a **perspective camera**. A screen-space curve or band that only imitates depth does not meet this requirement.
- Perspective is visible: the parts of the sheet nearer the camera look larger, and the spacing between its lines changes with distance and with the angle at which the sheet is seen.
- Brightness depends on the real angle between the surface and the line of sight (edge-on brighter, facing the camera fainter), computed from the 3D surface.
- The sheet can genuinely fold and pass in front of or behind other parts of itself; where layers overlap they add up (the wave never hides anything, section 2).

### Look

- The sheet is not drawn as a solid surface. It looks like a dense set of **fine luminous lines** running along its length, like the threads of a silk ribbon.
- The sheet looks brighter where it is seen **edge-on** and fainter where it faces the camera. Where it folds, the overlapping layers add up and the band glows more strongly.
- The lines are thin but anti-aliased: no shimmering or stair steps at any resolution (supersampling or filtering are both acceptable).
- The overall colour of the wave is a light, slightly warm white tinted by the background palette; it is never saturated. Its brightness follows the time of day like the background.
- The ends of the sheet fade out smoothly; no hard edges are visible on screen.

## 5. Glare

- The brightest parts of the image (mostly the densest parts of the wave and the brightest sparkles) get a soft halo.
- The halo is wide and faint, never a visible blob. The technique is yours to choose.
- Glare strength follows the time of day (subtle at night).

## 6. Sparkles

- A dense field of tiny glowing particles surrounding the wave, more of them near the wave than far from it. How many is yours to tune (the scorer reports the visible count).
- **Birth**: new sparkles appear continually near the wave and at first move along with it.
- **Life**: each sparkle drifts slowly and a little irregularly, fades in after it appears, lives for a while (lifetimes vary), then fades out.
- **Space**: sparkles live in the same 3D space as the wave and are seen through the same camera: some are in front of the sheet, some behind it, and their on-screen size and position follow from their 3D position.
- **Look**: each sparkle is a small soft disc of light whose colour shimmers slightly. Some are small and sharp; others are larger, softer and dimmer, like out-of-focus points of light (bokeh). Some twinkle.
- All randomness comes from a seeded pseudo-random generator of your own (see section 9).

## 7. Time of day, month and themes

- **Clock**: in normal use the effect reads the viewer's local date and time and updates continuously.
- **Moods**: the day has four moods: night, dawn, day and dusk. Each holds for a while around its part of the day and blends smoothly into the next over a few hours. The mood affects the background (brightness, saturation), the wave's brightness, the glare strength and the sparkles' brightness.
- **Months**: see section 3.
- **Themes**: besides the automatic mode (theme 0), there are twelve fixed colour themes (1 to 12) that do not follow the clock or the date. Their colour families are: 1 silver, 2 yellow, 3 light green, 4 pink, 5 green, 6 lavender, 7 teal, 8 blue, 9 purple, 10 gold, 11 brown, 12 red. Each theme is scored on its own.

## 8. Controls (normal mode)

Nice to have, not required: URL parameters or a small panel for the theme, a fixed time, the time speed, the render scale and pausing.

## 9. Scoring interface (required)

The private scorer drives the page through this interface. It must be exact.

### URL parameters

`index.html?mode=score&time=<ISO local date-time>&theme=<0..12>&seed=<int>&frames=<n>&w=<px>&h=<px>&layers=<list>`

- `mode=score`: no clock, no animation loop, no UI. The page renders only on request.
- `time`: the local date and time the scene represents, for example `2026-10-15T12:00:00`.
- `theme`: 0 = automatic (palette from `time`), 1..12 = fixed themes.
- `seed`: seeds every random choice (physics disturbance, sparkle births). The same URL must always give the same image, bit for bit, on the same browser and GPU.
- `frames`: the simulation runs this many steps of exactly 1/60 s each (this interface's convention), from a seeded start, before the frame is rendered. The state at frame 0 must already look like a typical running state: pre-run (warm up) the wave and the sparkles internally so that, for example, the sparkle population is not empty at the start. Frames `n` and `n+1` must be consecutive steps, so that motion between them can be measured.
- `w`, `h`: the size of the rendered image in pixels.
- `layers`: a comma-separated subset of `bg,wave,glare,sparkles,dither` to draw; default all. Omitted layers contribute nothing (for example `layers=bg` renders the background only, with no dither).

### JavaScript

The page defines `window.XMBW` with:

- `ready`: a Promise that resolves once the page can render (shaders compiled, textures made).
- `render(opts)`: renders one frame and returns `{ width, height, data }`, where `data` is a `Uint8ClampedArray` of RGBA bytes, rows top to bottom, alpha 255. `opts` takes the same fields as the URL (`time, theme, seed, frames, w, h, layers`); any field it omits defaults to the URL's value. Calling it with a larger `frames` than the previous call may continue the same simulation instead of restarting, as long as the result equals a fresh render with those settings.

## 10. What the scorer measures

The scorer compares your output with private reference material. You receive only numbers and coarse error maps; never reference images or values.

In this tier your wave and sparkles move independently of the reference, so per-pixel equality of whole frames is impossible and is not measured. The scorer compares:

- **Background**, per pixel: with `layers=bg`, the colour error in regions of the reference that the wave, glare and sparkles do not reach, for each month at midday and midnight, for each theme, and through the hours of one day.
- **Overall colour**: mean and spread of each colour channel and of brightness over whole frames, and their histograms, for the same conditions.
- **Wave**, statistically over many frames: where the band lies on screen (its centre line per column), how thick it is, how bright it is, and how these vary over time.
- **Sparkles**, statistically: how many are visible, their sizes and brightnesses, where they are on screen (density by height), and how far they move between consecutive frames.
- **Motion smoothness**: how much the image changes between consecutive frames, and that it never stalls or jumps.

Each score comes with the range the reference itself shows across different seeds and times, so "inside the range" means indistinguishable by that measure.
