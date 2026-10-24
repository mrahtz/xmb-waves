# xmb-waves: functional specification (strict clean-room tier)

This document describes an effect: a flowing, luminous wave drifting across a softly coloured background, with glowing sparkles around it, whose colours follow the time of day and the month. It is the kind of animated menu background a game console might show.

It describes **what the viewer should see, how it should behave, and how the original is built in general terms**. Construction is given as recommended design: "the original does X; do the same, with your own values". It contains no colours, palettes, textures, constants, preset values or code from the original. The only numbers taken from the analysis of the original are the few listed in section 11 ("Structural numbers from observation and analysis"). Every other value, colour, texture and implementation detail is **your design**. Tune it by comparing your renders side by side with genuine public footage of the original (section 10). Where this document says "choose", the choice is yours.

**Version 3 (2026-10-24).** Changes from version 2:

- The private scorer is gone. Section 10 is replaced by "Testing against public references": you compare your renders side by side with genuine public footage and screenshots of the original (a vetted list is supplied separately) and log the references you used. Section 9 stays as your own deterministic render interface for that testing. All other mentions of the scorer are removed.
- New "Construction" parts in sections 3 to 7 describe, in general textbook terms, how the original builds each component: the wave's spring simulation, its smooth surface, the slow large-scale warp, the camera, how the sheet is shaded and anti-aliased, the background's month and time-of-day blending, the glare chain, the sparkles' birth, motion, life and rendering, and the dither.
- Section 4 "Look" is corrected and extended with details a viewer sees (placement, apparent thickness, strands, translucency, where it is brightest). It now says the sheet reads as smooth, streaky silk, not as individually visible threads (version 2 said "a dense set of fine luminous lines"); see 4.5.
- Section 5: the glare is made from the background and the wave only. The sparkles are drawn after it and get their own glint pass (version 2 said the glare also came from the sparkles).
- Section 7: themes 1 to 12 are defined relative to the months.
- Section 8 is now a list of required product features (viewer controls, settings remembered, iPad home-screen use, performance target). Section 1 adds the performance design.
- New section 11 lists the few structural numbers the user allowed from the analysis, each one marked with where it comes from.

**Version 2.** Section 4 required the wave to be a genuine three-dimensional surface seen through a perspective camera, and section 6 placed the sparkles in the same 3D space. Both requirements still apply.

## 1. Output and platform

- A single static web page, `index.html`, rendering with WebGL2. No build step is required (a build step is fine if the output is a static page). No network requests at run time; every texture is generated in code or shipped as your own original asset.
- The picture has a 16:9 aspect by default and must render correctly at any resolution, from small previews to 4K and above. 4:3 is a nice-to-have: show the same scene without stretching it, only narrower at the sides.
- It keeps animating indefinitely without visible loops or drift. In normal use it follows the viewer's local clock and date.
- **Performance target:** smooth 60 frames per second on a recent iPad in Safari **at render scale 4x** (section 8). Design for it:
  - Run the simulation (wave and sparkles) off the main thread in a **Web Worker**, on its own fixed-step clock, and hand finished vertex data to the main thread without copying (transferable buffers). The main thread only draws the newest finished state.
  - Keep the GPU passes lean: few full-screen passes, small intermediate targets wherever the content is soft (background, glare), no needless read-backs from the GPU, no per-draw error queries.
  - When the render is larger than the picture on screen, **average it down to the screen's pixel size** in your own final pass. Do not hand the browser a canvas at the full render size to scale.
  - Cap the frame rate at 60 frames per second on high-refresh displays.

## 2. Composition

The picture is built from these layers, back to front:

1. **Background**: a smooth colour gradient filling the screen.
2. **Wave**: a translucent, glowing sheet that crosses the screen roughly horizontally.
3. **Glare**: a soft bloom around the brightest parts of the background and wave.
4. **Sparkles**: many tiny glowing particles floating around the wave, plus a fainter glint on each.
5. **Dither**: a very faint per-pixel noise that hides colour banding in the smooth gradients.

All the luminous layers (wave, glare, sparkles) add light to what is behind them (additive blending); nothing in the effect darkens or hides the background. The result is clamped to the displayable range.

**Order of operations in the original** (recommended):

1. Compute this frame's low-resolution background gradient (section 3).
2. Draw the wave into its own off-screen intensity buffer (section 4.5).
3. Composite: background plus wave light, into the screen image.
4. Build the glare from that composite and add it (section 5).
5. Draw the sparkles additively on top, then their glint pass (section 6).
6. Add the dither just before the image is written out at 8 bits per channel.

**Dither (construction).** The original adds fresh per-pixel noise every frame: independent from pixel to pixel and from frame to frame, uniformly distributed, the same value on all three channels, scaled so that it never moves a pixel by more than about one output level. It is added before the final 8-bit rounding. Any uniform or ordered dither with the same properties is fine.

## 3. Background

### Look

- A smooth gradient, mostly vertical (brightness and hue change from top to bottom), with gentle, sometimes curved or radial variation across the width. No visible bands or edges.
- Its palette depends on the **month**: each month has its own palette (warm, cool, green, pink and so on). For example October's is a warm gold/brown. Choose twelve palettes that are pleasant and clearly distinct, and tune them against the public footage.
- It depends on the **time of day**: the same month looks brighter and more saturated around midday and much darker at night, with dawn and dusk in between. At night the background is near-dark, keeping only a faint hint of the month's colour in part of the screen. Through the daytime its lighting also shifts gently: the brighter part of the background drifts slowly from one side towards the other over the course of the day.
- Changes are always gradual: no flicker from frame to frame and no visible jumps as the clock advances.

### Construction (how the original does it; do the same with your own palettes)

- **Two small images per month.** Each month has a *day* image and a *night* image: small, low-resolution colour images with soft structure. The night image is a dark version of the month's look.
- **Within the month** the gradient blends from this month's images towards next month's. The blend factor is the fraction of the month already gone, counted in whole days (section 11). So the first day shows this month's palette alone, and the last day is already close to the next month's. December blends towards January.
- **Day and night** are blended by a night weight that follows the local hour. The weight fades in smoothly (ease-in-out) in the evening and fades out smoothly through the small hours, and it is zero through the daytime (hours in section 11). The background's day/night blend runs on this schedule of its own, separate from the four moods in section 7.
- **Hour of day.** The gradient computation also takes a warped hour of day: it advances slowly around midday and quickly around midnight. That is what moves the background's lighting gently through the day. Choose your own way of shifting the light. A slow drift of a broad highlight is enough.
- **Low resolution, then smooth upscaling.** The gradient is computed into a small off-screen image each frame and stretched over the screen with smooth filtering. The content is soft, so a small image costs almost nothing and looks the same.
- **Easing from frame to frame.** Each frame's new gradient is blended over the previous frame's rather than replacing it, so any change in its inputs is smoothed out over time.

## 4. The wave

### 4.1 Shape and motion

- The wave is a **sheet**: think of a long ribbon of cloth, wider than the screen, seen from a slightly raised, slightly oblique camera, so that it crosses the screen from left to right as a band whose thickness and height vary along its length. It folds over itself gently in places, so that parts of it are seen nearly edge-on.
- It spans the full width of the screen with both **ends off screen**. Its band sits around or a little above the vertical middle of the screen, on a gentle arch or S-curve. The curve drifts, but the band stays well inside the screen.
- Its motion is slow and calm: the big shape evolves over tens of seconds while smaller ripples run along the sheet. It never repeats exactly, never settles and never moves abruptly.
- The surface looks perfectly smooth at any resolution (no visible facets or kinks).
- The animation advances with real time (independent of the frame rate) and stays stable whatever the frame rate.

### 4.2 Geometry (required)

- The wave is a genuine **three-dimensional surface** (two parameters: along and across the ribbon) that moves in 3D, rendered through a **perspective camera**. A screen-space curve or band that only imitates depth does not meet this requirement.
- Perspective is visible: the parts of the sheet nearer the camera look larger, and the spacing of its shading detail changes with distance and with the angle at which the sheet is seen.
- Brightness depends on the real angle between the surface and the line of sight (edge-on brighter, facing the camera fainter), computed from the 3D surface.
- The sheet can genuinely fold and pass in front of or behind other parts of itself; where layers overlap they add up (the wave never hides anything, section 2).

### 4.3 Look

- **Apparent thickness.** The band is broad where the sheet faces the viewer and pinches to a thin bright line where the sheet turns edge-on.
- **Strands.** The band often reads as two or three overlapping strands that cross and separate along the screen.
- **Silk, not separate threads.** The sheet reads as smooth translucent silk or satin, with soft streaks running along its length. The streaks are finest at the fringes of the band and where it pinches. At normal viewing resolutions individual threads are not distinguishable.
- **Translucent faces.** Where the sheet faces the viewer it is faint and see-through: the background shows through, only slightly lifted.
- **Brightest** along the folds where the sheet is edge-on, and where several layers overlap.
- **Colour.** The wave adds near-neutral white light, so over the background it reads as a pale, lighter version of the background's hue. It is never saturated. It is dimmer at night.
- **Edges.** The ends and the long edges of the sheet fade out smoothly; no hard edge ever shows.
- **Never jagged.** No shimmering, crawling or stair steps at any resolution, including when the sheet is nearly edge-on.

### 4.4 Construction: simulation, surface, warp and camera

The original builds the sheet in four stages. Do the same, with your own values.

**a. A spring-mass control grid (the motion).**

- A coarse square grid of control points (section 11) is simulated as a **mass-spring net**, the textbook cloth model. Each point is joined by springs to its immediate neighbours along both grid directions (structural springs, rest length = the grid spacing). It is also joined to the points two away along both directions (bending springs, rest length twice the spacing, stiffer), which keeps the sheet smooth instead of crumpled.
- **Damping:** each step, every point's velocity is reduced in proportion to itself.
- **Disturbance:** each step, every point gets a small random kick to its velocity in all three axes, from a deterministic pseudo-random generator. This keeps the motion alive and never repeating.
- **Which points are held.** One end of the sheet is driven. The last point of every row along the length is placed kinematically (its velocity is zeroed) on a slow oscillating path in height and depth. The height and depth use two different frequencies that do not divide each other, and the phase changes gradually from row to row, so the driven end twists and undulates. Motion runs from that end along the sheet as travelling waves. The other end is free, but each step it gets a steady gentle push along the length, which keeps the sheet extended like a flag in a light breeze. The time that drives the end is itself eased (it follows the simulation clock smoothly), so the driven end never jumps.
- **Envelope along the length.** Before the net is used, its points' height and depth offsets are scaled by a smooth envelope along the length: subdued over one part of the sheet, fuller over another. The crossover point shifts slightly with the time-of-day mood.
- **Time step.** The net is integrated with a **fixed time step** (semi-implicit Euler is enough): velocity from forces, then position from velocity, then damping. Real elapsed time (capped, so that a stall or a hidden tab does not produce a huge catch-up) is accumulated, and whole fixed steps are taken while enough has built up. For drawing, the net is **interpolated** between the previous and the current step by the leftover fraction, so the motion is smooth at any frame rate. ("Fix your timestep" with interpolation.) Step rate: section 11.
- **Start.** The original starts from a stored, already-settled state. Pre-run your net (section 9) so that the first frame already looks like a typical running state.

**b. The slow large-scale warp (free-form deformation).**

- The whole net is passed through a **free-form deformation lattice**: a coarse 3D lattice with more cells along the length than across or in depth, spanning the sheet's region. Each control point is mapped into the lattice's normalised coordinates (an offset and a scale). It is then displaced by a **tricubic B-spline** blend of the lattice's displacements and scaled again into the scene.
- The lattice displacement is **vertical only**: a smooth curve along the length that varies somewhat with depth. That is what gives the band its overall arch or S-shape and makes it drift up and down.
- **What drives it:** the displacement at each lattice cell is a smooth procedural function of the cell's position and of a slowly advancing time. It combines a few slow sinusoidal sways with a soft bump that travels along the length. The result is eased towards each new value (blended with the previous one) rather than replaced, so it moves very gently. Its time advances with the simulation clock.
- The lattice's scales vary slightly with the time-of-day mood, so the sheet's proportions change subtly over the day.

**c. The smooth surface.**

- The (deformed) net is the control net of a **uniform bicubic B-spline surface**: each 4 x 4 block of neighbouring control points defines one patch (the textbook arrangement), so the surface is smooth (curvature-continuous) everywhere. It approximates the net and does not pass through its points.
- Each patch is **sampled on a regular grid** in parameter space. All patches use the same number of samples, enough that the facets never show. At each sample the original evaluates the position and the **normal**, as the cross product of the two partial derivatives (left unnormalised: its length is the area of the surface element). It then builds an indexed triangle-strip mesh over all samples.
- **Edge fade:** every sample also carries a weight that is 1 over most of the sheet and falls smoothly to 0 at both ends and along both long edges. It multiplies the sheet's light.
- The original deforms and projects the control points before it evaluates the surface. Evaluating in world or view space and then projecting is equally acceptable.

**d. The camera.**

- A **perspective camera** with a moderate vertical field of view. It looks along the sheet from in front and slightly to one side, rotated about a tilted axis so that the sheet is seen from slightly above and obliquely. That is why the band crosses the screen and varies in thickness. The near and far planes are ordinary.
- The camera's tilt changes slightly with the time-of-day mood (the night mood tilts it a little differently).

### 4.5 Construction: shading, anti-aliasing and compositing

**Which direction.** The sheet's shading is built from a periodic thread pattern across the ribbon. The pattern is a function of the across-ribbon surface coordinate, so its iso-lines (the threads) run **along the length**. The original has a thread-width control and a profile that is pre-filtered by on-screen density (below). In the settings it actually uses, the threads are at full width and fuse into a continuous sheen. What reads as "threads" is the soft streaking produced by the angle-dependent shading of a rippled sheet and by overlapping layers. Recommended: make the continuous, angle-shaded sheet right first. Add a thread texture along the length only if it stays subtle and never shows as distinct lines at normal resolutions.

**Brightness and view angle.** Per surface sample, the original computes:

- the cosine of the angle between the line of sight and the surface normal;
- a **projected-size factor**: how large this bit of surface appears on screen, i.e. the cosine times the surface element's area, reduced with distance.

The light of each bit of sheet is the sum of two terms:

- a **sheen term**: a base brightness times a smooth response looked up from the view angle;
- a **Fresnel-like term**: strongest towards grazing angles and weaker where the sheet faces the camera.

Both terms are scaled by the projected-size factor and by the edge fade. The scaling keeps the light smooth where the sheet is strongly foreshortened: many surface elements pile into each pixel there, and the scaling stops that from blowing up exactly at the silhouette. The glow concentrates along the folds next to where the sheet turns edge-on, and overlapping layers add up. Where the sheet is compressed on screen, the original uses a **pre-filtered** (averaged) version of the thread profile. It chooses the version from the projected-size factor, much like a mip level. Dense detail therefore becomes an even sheen instead of aliasing. The mood (section 7) changes the base brightness, the strength of the Fresnel-like term and the response curve slightly.

**Anti-aliasing.** The sheet is drawn into its own **off-screen buffer at a higher resolution than the screen** (supersampling). The buffer holds a single intensity and is accumulated with additive blending, at enough precision that many overlapping faint layers add up without banding or clipping. When the composite reads the buffer, it filters it down with a small smoothing filter. Supersampling plus filtering is the requirement; the factor and the filter are yours.

**Compositing.** In one full-screen pass the original:

1. upscales the background gradient smoothly and multiplies it by a near-white tint that varies gently down the screen;
2. adds the filtered wave intensity times a near-white tint that varies gently across the screen;
3. applies the exposure and writes the result.

The wave is near-neutral light, and its colour on screen comes from the background it is added to.

## 5. Glare

### Look

- The brightest parts of the background-plus-wave image (mostly the densest folds of the wave on a bright daytime background) get a soft, wide, faint halo, never a visible blob.
- Glare strength follows the time of day. It is clearly visible in daytime moods and **absent at night**, when nothing is bright enough to pass the bright-pass.

### Construction (the textbook HDR bloom chain the original uses)

1. **Bright-pass** at reduced resolution, taken from the composited background and wave (not from the sparkles): apply an exposure and a soft tone curve with a white point, keeping only what exceeds it.
2. **Mip pyramid:** downsample repeatedly, halving the size each time, down to a very small level.
3. **Blur** each level with a **separable Gaussian** (horizontal, then vertical). The radius differs slightly between the colour channels, which gives the halo a faint colour fringe.
4. **Weighted sum** of the blurred levels, coarsest to finest. The weights form a geometric series (each level a fixed ratio of the next), normalised to an overall glare strength.
5. **Add** the result to the screen.

Exposure, white point, radii, ratio and strength are all set per mood (section 7).

## 6. Sparkles

### Look

- A dense field of tiny glowing particles. They are densest along and just around the band, often in loose trails along it, and thin out with distance. A sprinkling of them reaches far across the screen, including near the top and bottom. The count stays roughly constant once the effect has been running for a while (section 11).
- **Life:** each sparkle drifts slowly and a little irregularly, fades in quickly after it appears, lives for several seconds (lifetimes vary), then fades out.
- **Space:** sparkles live in the same 3D space as the wave and are seen through the same camera. Some are in front of the sheet and some behind it, and their on-screen size and position follow from their 3D position.
- **Look:** each sparkle is a small soft point of light, mostly white with faint iridescent tints that change as it turns. Some twinkle. Most are small and sharp; some, far from the focus distance, are larger, softer and dimmer, like out-of-focus points of light (bokeh).
- All randomness comes from a seeded pseudo-random generator of your own (see section 9).

### Construction (how the original does it; do the same with your own values)

**Pool.** A fixed-size pool of particles. A free list holds the unused slots. Once the effect has been running for a while the pool is nearly always full, so births are limited by deaths. A birth with no free slot is simply dropped.

**Birth: where.** Sparkles are born **on the wave surface**, at sample points of the sheet's mesh. There are two sources:

- **Bursts:** occasionally, a handful of sparkles at once, each at an independently chosen random point of the sheet.
- **A walker:** from time to time a walker starts at a random point of the sheet. It then emits one sparkle at a steady pace while it steps point by point along one surface direction. It stops after a random number of steps or at the sheet's end. This produces **trails** of sparkles along the sheet.

**Birth: velocity.**

- The base direction is the **wave point's own motion over the last step**: the sparkle is flung off the moving sheet. The direction is spread randomly within a narrow cone around that motion.
- A small fraction of births have the direction **reversed**.
- The component along the camera's viewing axis is removed, so new sparkles start moving parallel to the screen.
- The speed grows with the wave point's speed, but more slowly than it (sublinearly), with a minimum and some random variation. A wave point that is not moving emits nothing.
- The sparkle starts at the point's current position.

**Life.**

- Each sparkle gets its own ageing rate, a random spread around a mean with a floor, so lifetimes vary.
- Its opacity ramps up over a small fraction of its life, holds at full, and ramps down over a slightly larger fraction at the end.
- It dies when its life is over **or when it leaves a bounding region**: a large box around the scene, more generous in some directions than in others.

**Motion, per fixed step.**

- Acceleration = **Brownian jitter** (an independent random value per axis, every step) + **gravity** (very weak, downwards) − **friction** proportional to velocity.
- Velocity is updated from the acceleration, then position from velocity (semi-implicit Euler). The step rate is in section 11.
- **Spin:** each sparkle carries an orientation (a quaternion). Every step it rotates by a small angular velocity that varies slowly and smoothly with the sparkle's age (different slow oscillations on each axis), and it is renormalised.

**Rendering.**

- Each sparkle is a camera-facing quad (billboard) at its 3D position, drawn with additive blending and with its opacity from the life ramp.
- **Iridescent tint by orientation:** the sparkle's facing direction comes from its quaternion. Its colour is looked up from a smooth iridescent colour ramp, indexed by the angle between that direction and the view, sharpened with an exponent. It appears to be lit by a few fixed light directions (not confirmed), so a sparkle flares when its face catches a light. As sparkles spin, this makes them twinkle and shift colour.
- **Depth of field:** each sparkle's size and brightness depend on its distance from a **focus range** (a near and a far focus distance, each with a soft transition). In focus: small and sharp. Nearer or farther: larger, softer and dimmer, so the total light stays similar. Sparkles very close to the camera are faded further.
- **Second glint pass:** the same sparkles are drawn again additively as a second, softer glint. Its strength follows the mood's glare setting.
- The mood (section 7) shifts the far focus distance and the sparkle size slightly.

## 7. Time of day, month and themes

- **Clock**: in normal use the effect reads the viewer's local date and time and updates continuously.
- **Moods**: the day has four moods: night, dawn, day and dusk. Each is a complete set of parameters for the wave (brightness, Fresnel-like strength and response, thread spacing, pre-filtering, lattice scales, envelope crossover, camera tilt), the glare (exposure, white point, radii, strength) and the sparkles (focus, size, glint). Each mood holds for a while around its part of the day and then blends into the next with a smooth ease-in-out fade lasting a few hours, longer than the hold (hours in section 11). The blend is linear in every parameter with one shared factor.
- **Background**: the month blend and the background's own day/night weight are described in section 3.
- **Themes**: besides the automatic mode (theme 0), there are twelve fixed colour themes (1 to 12) that do not follow the clock or the date. Their colour families are: 1 silver, 2 yellow, 3 light green, 4 pink, 5 green, 6 lavender, 7 teal, 8 blue, 9 purple, 10 gold, 11 brown, 12 red. **Theme n is month n's palette, frozen as it looks at midday at the start of month n, with the day mood for the wave, glare and sparkles, whatever the actual time.** So the theme colours and the month palettes are the same twelve palettes.

## 8. Product requirements (viewer controls and app behaviour)

These are required.

- **Viewer controls**, in a small unobtrusive panel (and as URL parameters where sensible):
  - theme 0 to 12;
  - a fixed date and time instead of the clock, and a time speed (to run the day faster);
  - pause, and single-step while paused;
  - render scale, including **4x**;
  - toggles for each layer (background, wave, glare, sparkles, dither);
  - a frames-per-second counter overlay.
- **Settings remembered** between visits on the same device (browser storage, read and written defensively: the page must work when storage is unavailable).
- **iPad home screen:** when added to the iPad home screen, it opens full screen with no browser interface (web-app manifest and the relevant meta tags).
- **Screen awake:** while shown, it keeps the screen awake if the browser allows it (Screen Wake Lock API, re-acquired when the page becomes visible again).
- **Pauses when hidden:** no simulation or drawing while the page is hidden. On return it resumes without a jump (the capped time step of 4.4a).
- **Aspect and resolution:** 16:9 by default, 4:3 nice to have, any resolution (section 1).
- **Performance:** 60 frames per second on a recent iPad in Safari at render scale 4x, built as described in section 1.

## 9. Deterministic render interface (required)

This interface is for your own side-by-side testing (section 10): it lets you render exactly the same frame again, at any size, for any time, theme and seed. It must be exact.

### URL parameters

`index.html?mode=score&time=<ISO local date-time>&theme=<0..12>&seed=<int>&frames=<n>&w=<px>&h=<px>&layers=<list>`

- `mode=score`: no clock, no animation loop, no UI. The page renders only on request. (The name is kept from version 2.)
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

## 10. Testing against public references

- Compare your renders **side by side with genuine public footage and screenshots of the original**. A vetted list of public references is supplied separately. Use only references from that list or ones the user gives you directly. Fan recreations, re-renders and recoloured versions do not count.
- Use section 9 to render the matching moment: the month and time of day shown in the reference, the matching theme, the same picture size. Where the footage shows motion, compare motion over the same span of seconds.
- Judge the **overall look first**: background colours and gradient, the wave's placement, size, brightness, translucency and folds, the density and look of the sparkles, the glare, and the pace of the motion. Then refine details.
- **Ignore other on-screen elements** in the footage (menus, icons, clock, text, cursors) and compression artefacts. Your output never contains them.
- Your wave and sparkles move independently of any reference, so do not aim for pixel equality. Aim for a frame that would be indistinguishable in kind.
- **Log every reference you use** in `docs/REFERENCES.md`: the URL or source, the timestamp or frame, what it shows (month, time, theme if known) and what you compared or changed because of it.

## 11. Structural numbers from observation and analysis

The user allowed these few numbers from the analysis of the original. Use them as structure. Everything else stays your choice.

| # | What | Value in the original |
|---|---|---|
| N1 | Control grid of the wave's spring net (4.4a) | 19 x 19 points |
| N2 | Thread pattern across the sheet's width (4.5) | about 400 thread periods across the sheet. In the settings actually used the threads are at full width and fuse into a sheen, so they are not seen as about 400 separate lines |
| N3 | Sparkles on screen (6) | about 2,000 once settled (the pool is nearly always full); around 1,000 while it is still filling up after a start |
| N4 | Simulation step rate (4.4a, 6) | 60 fixed steps per second, for both the wave and the sparkles |
| N5 | Time-of-day moods (7), local time | night holds from about 23:00 to 01:00; blends to dawn from about 01:00 to 05:00; dawn holds about 05:00 to 07:00; blends to day about 07:00 to 11:00; day holds about 11:00 to 13:00; blends to dusk about 13:00 to 17:00; dusk holds about 17:00 to 19:00; blends to night about 19:00 to 23:00 |
| N6 | Background night weight (3), local time | fades out from midnight to about 05:00; zero through the day; fades in from about 18:30 to about 20:30 |
| N7 | Month palette shift (3) | changes once a day, at local midnight, in equal steps: this month's palette alone on the 1st, then one more step towards next month's each day, so the last day is one step short of next month's palette |
