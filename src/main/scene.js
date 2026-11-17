const SIMM = XMBW_SIM();
const NN = SIMM.N, DT = SIMM.DT, SPARK_STRIDE = SIMM.SPARK_STRIDE;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Palettes (original design). Each month has a day image and a night image:
// small painted pictures, each described by a coarse grid of colours read with
// smooth interpolation (spec 23). A grid can hold any smooth picture - the
// colour varies down the image, across it and diagonally, the hue drifts where
// the brightness does not, and the left-to-right difference may reverse down
// the frame - while staying too coarse to show an edge or to take in noise.
//   day:   BG_GRID_W x BG_GRID_H colours, row by row from the top of the image
//   night: BG_GRID_W x BG_NGRID_H colours, the same way (the month's dark look,
//          with structure of its own: the glow's lean and the lower corners)
// Colours are display values (sRGB-encoded) in 0..1, three numbers each.
// ---------------------------------------------------------------------------
const BG_GRID_W = 3, BG_GRID_H = 6, BG_NGRID_H = 5;
const PALETTES = [
  /*  1 silver      */ { day: [
    0.726, 0.741, 0.708,  0.661, 0.667, 0.680,  0.572, 0.613, 0.625,
    0.702, 0.691, 0.662,  0.647, 0.647, 0.692,  0.681, 0.643, 0.700,
    0.615, 0.661, 0.638,  0.631, 0.645, 0.619,  0.747, 0.674, 0.718,
    0.532, 0.542, 0.606,  0.558, 0.564, 0.647,  0.702, 0.669, 0.727,
    0.616, 0.589, 0.681,  0.569, 0.636, 0.583,  0.560, 0.697, 0.647,
    0.661, 0.650, 0.722,  0.671, 0.715, 0.644,  0.566, 0.726, 0.633
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.008, 0.000,
    0.111, 0.000, 0.000,  0.166, 0.090, 0.090,  0.192, 0.135, 0.153,
    0.518, 0.254, 0.306,  0.579, 0.361, 0.384,  0.631, 0.477, 0.451,
    1.169, 0.707, 0.825,  1.274, 0.781, 0.889,  1.255, 0.829, 0.893,
    1.500, 1.255, 1.319,  1.500, 1.169, 1.346,  1.500, 1.096, 1.391
  ] },
  /*  2 yellow      */ { day: [
    0.761, 0.814, 0.000,  0.900, 0.875, 0.000,  0.914, 0.863, 0.000,
    0.746, 0.740, 0.054,  0.891, 0.768, 0.000,  0.800, 0.828, 0.000,
    0.762, 0.706, 0.000,  0.783, 0.687, 0.000,  0.766, 0.757, 0.032,
    0.796, 0.679, 0.040,  0.810, 0.624, 0.000,  0.838, 0.740, 0.092,
    0.928, 0.811, 0.212,  0.896, 0.691, 0.228,  0.984, 0.778, 0.281,
    0.979, 0.927, 0.341,  0.971, 0.841, 0.387,  1.006, 0.853, 0.368
  ], night: [
    0.000, 0.248, 0.000,  0.000, 0.216, 0.000,  0.000, 0.191, 0.000,
    0.040, 0.326, 0.000,  0.013, 0.170, 0.000,  0.000, 0.000, 0.000,
    0.231, 0.500, 0.082,  0.139, 0.341, 0.044,  0.069, 0.079, 0.042,
    0.453, 0.689, 0.331,  0.515, 0.775, 0.352,  0.498, 0.717, 0.374,
    0.733, 0.993, 0.577,  0.806, 1.135, 0.731,  0.890, 1.373, 0.884
  ] },
  /*  3 light green */ { day: [
    0.508, 0.713, 0.087,  0.626, 0.857, 0.147,  0.573, 0.798, 0.113,
    0.531, 0.744, 0.131,  0.648, 0.885, 0.193,  0.597, 0.829, 0.159,
    0.573, 0.794, 0.221,  0.657, 0.896, 0.266,  0.629, 0.866, 0.246,
    0.604, 0.848, 0.279,  0.650, 0.907, 0.302,  0.649, 0.909, 0.300,
    0.625, 0.876, 0.343,  0.652, 0.909, 0.356,  0.664, 0.929, 0.364,
    0.647, 0.895, 0.390,  0.667, 0.924, 0.402,  0.685, 0.950, 0.412
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.002, 0.005, 0.001,  0.002, 0.005, 0.001,  0.002, 0.005, 0.001,
    0.118, 0.341, 0.010,  0.118, 0.341, 0.010,  0.118, 0.341, 0.010,
    0.279, 0.702, 0.067,  0.279, 0.702, 0.067,  0.279, 0.702, 0.067,
    0.457, 1.059, 0.154,  0.457, 1.059, 0.154,  0.457, 1.059, 0.154
  ] },
  /*  4 pink        */ { day: [
    0.649, 0.230, 0.369,  0.666, 0.276, 0.393,  0.665, 0.364, 0.408,
    0.591, 0.117, 0.303,  0.668, 0.196, 0.414,  0.674, 0.339, 0.466,
    0.583, 0.045, 0.299,  0.678, 0.125, 0.440,  0.707, 0.254, 0.539,
    0.634, 0.000, 0.320,  0.675, 0.000, 0.439,  0.720, 0.132, 0.538,
    0.771, 0.058, 0.468,  0.778, 0.081, 0.539,  0.805, 0.120, 0.605,
    0.988, 0.233, 0.661,  0.986, 0.267, 0.720,  0.991, 0.297, 0.692
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.172, 0.000, 0.085,  0.174, 0.000, 0.000,  0.207, 0.000, 0.000,
    0.485, 0.018, 0.342,  0.494, 0.000, 0.246,  0.583, 0.000, 0.152,
    1.099, 0.054, 0.804,  1.060, 0.000, 0.641,  1.056, 0.126, 0.445,
    1.500, 0.000, 1.077,  1.500, 0.060, 0.900,  1.500, 0.209, 0.686
  ] },
  /*  5 green       */ { day: [
    0.119, 0.435, 0.042,  0.017, 0.538, 0.000,  0.012, 0.600, 0.000,
    0.194, 0.598, 0.146,  0.055, 0.664, 0.000,  0.000, 0.696, 0.000,
    0.225, 0.654, 0.185,  0.117, 0.769, 0.064,  0.000, 0.835, 0.000,
    0.173, 0.674, 0.166,  0.086, 0.814, 0.071,  0.002, 0.918, 0.000,
    0.111, 0.633, 0.089,  0.079, 0.793, 0.071,  0.035, 0.902, 0.066,
    0.000, 0.505, 0.000,  0.019, 0.613, 0.000,  0.000, 0.724, 0.054
  ], night: [
    0.032, 0.147, 0.054,  0.000, 0.000, 0.000,  0.012, 0.000, 0.000,
    0.000, 0.205, 0.000,  0.000, 0.271, 0.049,  0.000, 0.371, 0.000,
    0.000, 0.410, 0.000,  0.014, 0.590, 0.129,  0.113, 0.785, 0.182,
    0.000, 0.837, 0.000,  0.084, 1.032, 0.246,  0.151, 1.136, 0.417,
    0.000, 1.171, 0.220,  0.000, 1.348, 0.404,  0.000, 1.415, 0.604
  ] },
  /*  6 lavender    */ { day: [
    0.523, 0.330, 0.936,  0.640, 0.420, 1.104,  0.587, 0.376, 1.038,
    0.553, 0.372, 0.964,  0.666, 0.461, 1.129,  0.618, 0.421, 1.067,
    0.605, 0.454, 1.015,  0.690, 0.521, 1.134,  0.663, 0.499, 1.105,
    0.639, 0.513, 1.069,  0.686, 0.548, 1.138,  0.686, 0.549, 1.144,
    0.666, 0.566, 1.091,  0.693, 0.590, 1.133,  0.707, 0.602, 1.159,
    0.694, 0.609, 1.108,  0.716, 0.627, 1.141,  0.736, 0.647, 1.173
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.003, 0.003, 0.005,  0.003, 0.003, 0.005,  0.003, 0.003, 0.005,
    0.179, 0.163, 0.298,  0.179, 0.163, 0.298,  0.179, 0.163, 0.298,
    0.385, 0.355, 0.613,  0.385, 0.355, 0.613,  0.385, 0.355, 0.613,
    0.599, 0.558, 0.918,  0.599, 0.558, 0.918,  0.599, 0.558, 0.918
  ] },
  /*  7 teal        */ { day: [
    0.000, 0.442, 0.551,  0.000, 0.547, 0.581,  0.000, 0.617, 0.607,
    0.000, 0.409, 0.524,  0.000, 0.549, 0.621,  0.024, 0.659, 0.672,
    0.047, 0.370, 0.516,  0.000, 0.539, 0.650,  0.005, 0.674, 0.690,
    0.000, 0.346, 0.493,  0.000, 0.549, 0.581,  0.000, 0.706, 0.685,
    0.000, 0.376, 0.487,  0.000, 0.611, 0.540,  0.038, 0.795, 0.706,
    0.005, 0.415, 0.460,  0.003, 0.640, 0.527,  0.000, 0.830, 0.708
  ], night: [
    0.000, 0.000, 0.126,  0.000, 0.000, 0.050,  0.018, 0.000, 0.000,
    0.000, 0.071, 0.231,  0.005, 0.025, 0.148,  0.000, 0.030, 0.138,
    0.030, 0.075, 0.373,  0.000, 0.099, 0.321,  0.012, 0.201, 0.378,
    0.031, 0.214, 0.671,  0.003, 0.315, 0.611,  0.000, 0.414, 0.614,
    0.000, 0.328, 0.945,  0.031, 0.535, 0.907,  0.000, 0.678, 0.840
  ] },
  /*  8 blue        */ { day: [
    0.219, 0.884, 0.993,  0.169, 0.931, 1.101,  0.084, 0.975, 1.230,
    0.113, 0.741, 0.859,  0.095, 0.800, 0.963,  0.012, 0.874, 1.030,
    0.000, 0.549, 0.759,  0.048, 0.649, 0.821,  0.000, 0.744, 0.860,
    0.000, 0.374, 0.580,  0.000, 0.469, 0.738,  0.000, 0.638, 0.847,
    0.000, 0.277, 0.443,  0.034, 0.346, 0.665,  0.000, 0.521, 0.871,
    0.010, 0.216, 0.375,  0.056, 0.292, 0.601,  0.070, 0.424, 0.799
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.018, 0.000,  0.013, 0.000, 0.000,
    0.000, 0.163, 0.141,  0.019, 0.107, 0.073,  0.000, 0.063, 0.000,
    0.016, 0.423, 0.253,  0.040, 0.267, 0.246,  0.020, 0.259, 0.258,
    0.090, 0.675, 0.379,  0.029, 0.593, 0.529,  0.000, 0.593, 0.652,
    0.211, 0.876, 0.488,  0.066, 0.921, 0.706,  0.000, 0.915, 0.884
  ] },
  /*  9 purple      */ { day: [
    0.305, 0.146, 0.600,  0.493, 0.281, 0.869,  0.315, 0.153, 0.626,
    0.334, 0.159, 0.639,  0.465, 0.253, 0.826,  0.348, 0.166, 0.667,
    0.420, 0.209, 0.751,  0.467, 0.244, 0.820,  0.435, 0.218, 0.780,
    0.523, 0.249, 0.913,  0.540, 0.259, 0.939,  0.544, 0.260, 0.948,
    0.616, 0.301, 1.035,  0.628, 0.308, 1.057,  0.641, 0.314, 1.075,
    0.675, 0.345, 1.100,  0.687, 0.352, 1.121,  0.701, 0.358, 1.142
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.002, 0.003, 0.010,  0.002, 0.003, 0.010,  0.002, 0.003, 0.010,
    0.107, 0.125, 0.539,  0.107, 0.125, 0.539,  0.107, 0.125, 0.539,
    0.282, 0.312, 1.104,  0.282, 0.312, 1.104,  0.282, 0.312, 1.104,
    0.499, 0.539, 1.473,  0.499, 0.539, 1.473,  0.499, 0.539, 1.473
  ] },
  /* 10 gold        */ { day: [
    0.677, 0.566, 0.061,  0.662, 0.548, 0.000,  0.602, 0.535, 0.000,
    0.704, 0.553, 0.061,  0.672, 0.524, 0.000,  0.607, 0.520, 0.000,
    0.673, 0.509, 0.097,  0.647, 0.469, 0.047,  0.607, 0.458, 0.017,
    0.667, 0.498, 0.085,  0.644, 0.480, 0.000,  0.607, 0.458, 0.000,
    0.695, 0.592, 0.163,  0.683, 0.585, 0.167,  0.718, 0.582, 0.151,
    0.801, 0.709, 0.256,  0.829, 0.747, 0.247,  0.914, 0.743, 0.209
  ], night: [
    0.028, 0.000, 0.000,  0.059, 0.000, 0.000,  0.066, 0.030, 0.000,
    0.195, 0.086, 0.000,  0.156, 0.051, 0.000,  0.173, 0.000, 0.000,
    0.532, 0.301, 0.000,  0.499, 0.262, 0.000,  0.456, 0.216, 0.046,
    1.029, 0.602, 0.000,  1.052, 0.615, 0.000,  0.988, 0.600, 0.126,
    1.500, 1.019, 0.179,  1.500, 0.950, 0.176,  1.500, 0.899, 0.232
  ] },
  /* 11 brown       */ { day: [
    0.519, 0.480, 0.000,  0.651, 0.444, 0.147,  0.751, 0.442, 0.232,
    0.590, 0.489, 0.009,  0.668, 0.439, 0.157,  0.767, 0.452, 0.194,
    0.609, 0.454, 0.056,  0.677, 0.439, 0.091,  0.739, 0.428, 0.000,
    0.596, 0.407, 0.000,  0.632, 0.392, 0.077,  0.686, 0.400, 0.009,
    0.626, 0.372, 0.004,  0.628, 0.335, 0.000,  0.614, 0.323, 0.000,
    0.560, 0.323, 0.000,  0.521, 0.269, 0.000,  0.494, 0.230, 0.000
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.008, 0.000,  0.000, 0.000, 0.026,
    0.020, 0.000, 0.000,  0.001, 0.000, 0.033,  0.000, 0.025, 0.021,
    0.156, 0.047, 0.000,  0.173, 0.036, 0.000,  0.252, 0.041, 0.000,
    0.406, 0.155, 0.000,  0.496, 0.227, 0.000,  0.544, 0.250, 0.000,
    0.548, 0.318, 0.087,  0.740, 0.452, 0.000,  0.827, 0.480, 0.000
  ] },
  /* 12 red         */ { day: [
    0.741, 0.021, 0.033,  0.881, 0.072, 0.085,  0.825, 0.039, 0.050,
    0.764, 0.041, 0.058,  0.902, 0.091, 0.110,  0.847, 0.059, 0.078,
    0.801, 0.083, 0.111,  0.901, 0.120, 0.150,  0.875, 0.098, 0.130,
    0.840, 0.082, 0.122,  0.898, 0.096, 0.140,  0.900, 0.088, 0.135,
    0.856, 0.103, 0.154,  0.890, 0.111, 0.163,  0.909, 0.111, 0.164,
    0.871, 0.133, 0.188,  0.898, 0.138, 0.195,  0.921, 0.140, 0.200
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.008, 0.001, 0.001,  0.008, 0.001, 0.001,  0.008, 0.001, 0.001,
    0.375, 0.031, 0.011,  0.375, 0.031, 0.011,  0.375, 0.031, 0.011,
    0.773, 0.112, 0.072,  0.773, 0.112, 0.072,  0.773, 0.112, 0.072,
    1.162, 0.220, 0.164,  1.162, 0.220, 0.164,  1.162, 0.220, 0.164
  ] },
];
const BG_W = 32, BG_H = 18; // size of each generated background image

// ---------------------------------------------------------------------------
// Moods: complete parameter sets, blended linearly with one shared factor.
// ---------------------------------------------------------------------------
const MOOD_KEYS = [
  'waveBright', 'base', 'fres', 'sizeK',
  'latX', 'latY', 'latZ', 'envCross', 'camPitch', 'camLift',
  'exposure', 'white', 'glareThr', 'glareSigma', 'glareRatio', 'glareStrength',
  'focusFar', 'sparkSize', 'sparkBright', 'glint',
];
// The composite's black offset (spec 4.5, versions 20, 24 and 27): the same in every mood (the moods set only the gain and
// the white point). What it pins down is not the floor on its own but where the dark end of the night background sits
// relative to the point at which the curve reaches zero (version 27): moving the floor and moving that dark end by the same
// amount give the same frame pixel for pixel, so this value and the night palettes are one knob. It is fitted on the colour
// the band's added light takes over the dark parts of a night frame, in version 27's form - the three channel shares taken
// separately at moments with the band in clearly different places (tools/measure/bandpos.py), with only the months that
// speak (a channel of the night background cut away under the band: July and October of the footage, whose night
// backgrounds are strongly coloured) allowed to vote, and the count of qualifying pixels reported beside every share.
// The look lane fitted 0.06 that way (the best of 0.03, 0.06, 0.09 and 0.12 over 17 speaking moments of six night
// conditions at three band positions per month), and version 27 says not to let a whole-frame comparison of the background
// choose it, because a fit that may only scale the palettes cannot follow the floor and will always prefer the value the
// build already has.
// It is held at 0.03 all the same, by the joint re-tune at the lane's merge, and the reason is the size of the cost rather
// than the direction of the evidence. Three builds were re-tuned to convergence at 0.03, 0.045 and 0.06 (each: every mood's
// gain and the twelve month palettes through tools/measure/jointfit.py --weight=1.0, step 0.7, rounds until the background
// stopped improving) and both observables measured on each. The night band's colour (tools/measure/bandpos.py over the same
// 30 moments of six night conditions, against the footage's) improves slowly with the floor: mean |share error| per channel
// 0.0258 at 0.03, 0.0214 at 0.045, 0.0199 at 0.06, against 0.0254 on main - a span of 0.006 where one moment's own error
// runs 0.011 to 0.038. The background away from the band gets worse quickly: mean absolute difference per channel over the
// 38 recording and render conditions 1.73, 2.46 and 3.46 levels, against 1.56 on main and a noise range of 0.09 levels.
// At 0.06 that is nineteen times the original's own variation in a measure of another lane, so the floor waits for the
// remedy version 27 itself names - a background fit that lets the dark end of the night images move, which the palette
// scaling used here cannot do and tools/measure/bgfit/ can. Until that is run, the whole-frame figure above is biased
// towards 0.03 (the grids were fitted there) and is evidence of the cost, not of the right value.
let TONE_BLACK = 0.03;
// Glare (spec 5, versions 20 and 24): each mood's bright-pass threshold is fixed, in the composite's output units after its
// curve, and the same chain runs in every mood. Placed inside the brackets measured on the original's footage at the bright-pass's
// resolution (tools/measure/brightfoot.py): by day between July's brightest background (which does not glare) and January's and
// December's (which do); at dawn and dusk above every background and below the dimmest month's brightest fold; at night above the
// band's brightest folds, so the night is free of halo on the screen.
// The exposures (the gain of spec 4.5) are fitted with the palettes on the background's level and the band's peak
// (tools/measure/jointfit.py). Spec 4.5's order is kept and is not negotiable (version 27): lowest by day, slightly higher
// at dawn - held to at most 1.10 times the day's, which it reaches - higher again at dusk, highest at night.
// The joint re-tune at the look lane's merge left them where the merge before it put them: with the floor held at 0.03,
// the branch changes nothing that moves a level (its wave tint keeps the same mean across the screen), and a further step
// of the fit from here makes the background worse, not better (1.56 -> 1.66 levels per channel), so this is its fixed
// point. A note on what the fit cannot settle: the gain and a palette's level multiply, so the background alone fixes
// only their product, and the split is pinned by the band, which the gain scales and the palettes do not. Letting the
// band pull on the gain (--weight below 1) raises it until the background follows the band away from the footage, because
// the band is short of the original by its own brightness and not by the gain: at this fixed point the band's peak over
// the background is 93 against the original's 99 and its mean 42 against 41, and the shortfall is by mood (day 72 against
// 81, dawn 89 against 97) - the per-mood waveBright above, which has not been refitted to the spec-26 sheet.
const MOODS = {
  night: { waveBright: 0.22, base: 1.6, fres: 1.7, sizeK: 0.54,
    latX: 1.00, latY: 0.92, latZ: 1.00, envCross: 0.20, camPitch: -7.7, camLift: 0.2745,
    exposure: 1.385, white: 1.0, glareThr: 0.9, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.6,
    focusFar: 4.38, sparkSize: 1.1, sparkBright: 1.0, glint: 0.30 },
  dawn: { waveBright: 0.20, base: 1.8, fres: 1.6, sizeK: 0.6,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.25, camPitch: -12.7, camLift: 0,
    exposure: 1.208, white: 1.0, glareThr: 0.7, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.23, sparkSize: 1.1, sparkBright: 1.0, glint: 0.35 },
  day: { waveBright: 0.15, base: 1.2, fres: 2.4, sizeK: 0.6,
    latX: 1.00, latY: 1.00, latZ: 1.00, envCross: 0.28, camPitch: -12.7, camLift: 0,
    exposure: 1.098, white: 0.9, glareThr: 0.68, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.20, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dusk: { waveBright: 0.24, base: 1.8, fres: 1.6, sizeK: 0.54,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.20, camPitch: -12.7, camLift: 0,
    exposure: 1.372, white: 1.0, glareThr: 0.785, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.22, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
};
// Mood schedule (local hours): hold windows and blends between them.
const MOOD_SCHEDULE = [ // [start, end, from, to]  (from === to: hold)
  [23, 25, 'night', 'night'], [1, 5, 'night', 'dawn'], [5, 7, 'dawn', 'dawn'], [7, 11, 'dawn', 'day'],
  [11, 13, 'day', 'day'], [13, 17, 'day', 'dusk'], [17, 19, 'dusk', 'dusk'], [19, 23, 'dusk', 'night'],
];
function ease(t) { t = Math.min(Math.max(t, 0), 1); return t * t * (3 - 2 * t); }
function moodAt(hour) {
  let h = ((hour % 24) + 24) % 24;
  for (const [s, e, a, b] of MOOD_SCHEDULE) {
    const hh = h < s && e > 24 ? h + 24 : h;
    if (hh >= s && hh < e) return blendMood(MOODS[a], MOODS[b], a === b ? 0 : ease((hh - s) / (e - s)));
  }
  return blendMood(MOODS.night, MOODS.night, 0);
}
function blendMood(A, B, f) { const o = {}; for (const k of MOOD_KEYS) o[k] = A[k] + (B[k] - A[k]) * f; return o; }
// Background night weight (N6): fades out 00:00-05:00, zero by day, fades in 18:30-20:30.
function nightWeight(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5) return 1 - ease(h / 5);
  if (h < 18.5) return 0;
  if (h < 20.5) return ease((h - 18.5) / 2);
  return 1;
}
// Background clock (spec 19, 23). The warped hour advances slowly around midday and quickly around midnight; one angle of
// it (0 at the warp's midday, +-pi at its midnight) drives the day image's two lights, its daylight factor and its shaping
// down the frame. BGW: warp strength, the hour the warp centres on, the daylight factor's floor, its morning step (mornAt:
// how far after the warped midnight the rise begins, mornW: its width) and its evening step (eveAt: how far before the
// warped midnight the fall has finished, eveW: its width), the widths of the two turns of the shaping down the frame
// (topMornW, topEveW: the same two places, steepnesses of their own), and the night envelope's exponent.
const BGW = { warp: 0.900, noon: 11.901, dayFloor: 0.037, mornAt: 0.058, mornW: 3.100, eveAt: 0.000, eveW: 3.100,
  topMornW: 1.256, topEveW: 1.890, envPow: 1.453 };
function wrapPi(a) { return a - TAU * Math.floor((a + Math.PI) / TAU); }
function dayAngle(hour) {
  const p = wrapPi(((hour - BGW.noon) / 24) * TAU);
  return p - BGW.warp * Math.sin(p);
}
// A smooth step of the warped angle, rising from 0 to 1 over the width w about the angle c.
function angStep(a, c, w) { return ease((a - c) / w + 0.5); }
// Where the two steps turn: the morning one a mornW/2 past the start of its rise, the evening one an eveW/2 before the end
// of its fall. Both steps are flat at the warped midnight, so the day's curves meet there with no jump.
function mornTurn() { return -Math.PI + BGW.mornAt + BGW.mornW / 2; }
function eveTurn() { return Math.PI - BGW.eveAt - BGW.eveW / 2; }
// The day image's daylight factor (spec 23): the product of a morning step and an evening step of the warped angle, each
// with its own steepness. The evening fall is the steeper side, so the factor peaks in the later afternoon rather than at
// midday. It is lowest (close to nothing) at midnight and rises from there without turning back; the picture's minimum
// after midnight comes from the mix with the night image.
function daylightOf(a) {
  const d = angStep(a, mornTurn(), BGW.mornW) * (1 - angStep(a, eveTurn(), BGW.eveW));
  return BGW.dayFloor + (1 - BGW.dayFloor) * d;
}
// Strength of the clock's shaping of the day image down the frame: nothing from early morning until late evening, full
// through the late evening and the small hours. It turns at the same two places as the daylight factor, with widths of its
// own (held to the room each turn has, so the shaping too is flat at the warped midnight).
function topShape(a) {
  const cm = mornTurn(), ce = eveTurn();
  const m = angStep(a, cm, Math.min(BGW.topMornW, 2 * (cm + Math.PI)));
  const e = 1 - angStep(a, ce, Math.min(BGW.topEveW, 2 * (Math.PI - ce)));
  return 1 - m * e;
}
// The night images' clock: not warped, one steady turn a day counted from midday (0 at midnight, -pi/2 at 18:00 with the
// light at the left edge, +pi/2 at 06:00 at the right edge, +-pi at midday below the picture).
function nightAngle(hour) { return wrapPi(((hour - 12) / 24) * TAU - Math.PI); }
// The night images' time envelope: highest in the middle of the night, lowest at dusk and dawn (and by day).
function nightEnvelope(a) { return Math.pow(0.5 + 0.5 * Math.cos(a), BGW.envPow); }
// Next month's images rising from the bottom (N7): the centre of the S-shaped step (in screen heights, 0 = bottom) and its
// half-width for the month's progress p (whole days): nothing before about the 6th, about half and half over the whole
// screen in the middle (a very broad step), next month's complete at the bottom by about the 22nd and the top by the 26th.
function monthStep(p) {
  const c = -0.2 + 1.4 * Math.min(Math.max((p - 0.2) / 0.65, 0), 1);
  return [c, 0.15 + 3.0 * Math.exp(-Math.pow((p - 0.5) / 0.1, 2))];
}
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

function sceneParams(tp, theme) {
  const [y, mon, day, hh, mm, ss] = tp;
  const hour = hh + mm / 60 + ss / 3600;
  if (theme >= 1 && theme <= 12) { // month n's palette at midday at the start of month n, day mood
    const a = dayAngle(BGW.noon);
    return { monA: theme - 1, monB: theme % 12, monC: -5, monW: 0.15, mid: 0, night: 0, aday: a, daylight: daylightOf(a),
      top: topShape(a), anight: nightAngle(12), nightEnv: 0, mood: { ...MOODS.day } };
  }
  const p = (day - 1) / daysInMonth(y, mon), [monC, monW] = monthStep(p), a = dayAngle(hour), an = nightAngle(hour);
  return { monA: mon - 1, monB: mon % 12, monC, monW, mid: Math.exp(-Math.pow((p - 0.5) / 0.15, 2)), night: nightWeight(hour),
    aday: a, daylight: daylightOf(a), top: topShape(a), anight: an, nightEnv: nightEnvelope(an), mood: moodAt(hour) };
}
function parseTime(s) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?)?)?/.exec(s || '');
  if (!m) return null;
  return [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
}
function partsOf(d) {
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds() + d.getMilliseconds() / 1000];
}

// ---------------------------------------------------------------------------
// Camera (original design; spec 22): where the camera stands (its placement) and where it points (its aim) are two
// separate choices. The placement is CAMERA's px, py, pz, raised or lowered per mood by camLift; it sets the angles the sheet is
// seen at. The aim is one rotation of the view about the horizontal axis along the sheet's length (camPitch, degrees,
// negative = looking up); it sets where the band falls on the screen. A turn about the vertical axis (yaw) is at most a
// trace (2.5 degrees, which with the placement keeps the shaken left side slightly nearer), and there is no roll. dist is only the reference distance of the size factor (4.5), not where the camera stands.
// The aim (spec 26) is fitted against the band's typical height over many times since the start, not one moment: over the twelve
// times the footage covers (40 s to 30 minutes, at 12:00 and at 00:00) the original's band centre runs from 0.39 to 0.71 H with a
// median of 0.567, which is also 4.6's median of about 0.57. At camPitch -8 this build's own spread matched (0.24 against 0.29 H)
// but its median sat 0.066 H too high, so every mood's aim was lowered by 4.7 degrees (0.0141 H a degree, measured); the band's
// centre over the same clips is then 0.529 against the footage's 0.533, with nothing else in the picture moved.
// ---------------------------------------------------------------------------
const CAMERA = { fovY: 64.4, px: 0.8, py: -0.5399, pz: -3.1131, yaw: 2.5, dist: 3.161, near: 0.1, far: 40 };
function cameraFor(pitchDeg, aspect, lift) {
  const d2r = Math.PI / 180, p = pitchDeg * d2r, yw = CAMERA.yaw * d2r;
  const fwd = [Math.sin(yw) * Math.cos(p), -Math.sin(p), Math.cos(yw) * Math.cos(p)];
  const right = [Math.cos(yw), 0, -Math.sin(yw)];
  const up = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]];
  const pos = [CAMERA.px, CAMERA.py + (lift || 0), CAMERA.pz];
  const f = 1 / Math.tan(CAMERA.fovY * d2r / 2), n = CAMERA.near, fa = CAMERA.far;
  // view: rows right, up, -fwd (right-handed clip convention); column-major for GL
  const tx = -(right[0] * pos[0] + right[1] * pos[1] + right[2] * pos[2]);
  const ty = -(up[0] * pos[0] + up[1] * pos[1] + up[2] * pos[2]);
  const tz = (fwd[0] * pos[0] + fwd[1] * pos[1] + fwd[2] * pos[2]);
  const view = [right[0], up[0], -fwd[0], 0, right[1], up[1], -fwd[1], 0, right[2], up[2], -fwd[2], 0, tx, ty, tz, 1];
  const proj = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
  const vp = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) vp[c * 4 + r] += proj[k * 4 + r] * view[c * 4 + k];
  return { pos, fwd, right, up, vp, f };
}

// ---------------------------------------------------------------------------
// Wave, glare, sparkle and output settings (original design)
// ---------------------------------------------------------------------------
const WAVE = {
  // per patch (16 x 16 patches), comparably fine across the ribbon and along it (spec 26, 4.4c): the folds and the turns
  // where the sheet goes edge-on are as fine across the width as anything along the length. At the earlier 64 along and 6
  // across the whole width carried 96 samples; the band's statistics come out the same at 16, 24 and 64 samples across
  // (thickness, peaks per column and fill identical to two figures), so the across direction was not short of structure,
  // but it was sampled an order more coarsely than the length. 24 x 24 is 1.5 times the cells of 64 x 6
  samplesAlong: 24, samplesAcross: 24,
  sheenCut0: 0.2179, sheenCut1: 0.599, // the sheen falls linearly between these size factors (the fused thread profile)
  // the Fresnel-like peak: where it sits in cosine x size factor; zero below fresZero of that; the tail's length above it
  fresPeak: 0.12, fresZero: 0.5961, fresTail: 0.1403,
  fade: 0.06,                           // fraction of the sheet over which it fades out, linearly, at the ends and edges
  filterSpread: 1.0,                    // width of the down-filter over the wave buffer: one output pixel (spec 16)
  // a neutral tint brightening slightly from left to right. Spec 27 replaces the version-20 measurement (a ratio of the
  // band's brightest places, left against right) with the slope of the band's added light taken as a profile across the
  // whole width and pooled over everything available (tools/measure/rampprof.py). Pooled over all 38 footage clips, the
  // slope of the per-column peak is -0.035 +- 0.027 of its own mean across the width (the recordings alone +0.039 +- 0.044,
  // the lossless renders alone -0.106 +- 0.018, so the two kinds disagree by more than either's scatter); my build's slope
  // answers to this tint at +0.0062 per 1 % of the left-to-right ratio, so the whole footage range sits between a flat tint
  // and about +7 %. The spec requires a brightening, so the ratio is the middle of that: left 0.962 of right, with the mean
  // over the screen kept at the earlier tint's (0.971) so the band's overall level is unchanged.
  tintL: [0.952, 0.952, 0.952], tintR: [0.990, 0.990, 0.990],
};
// (these scalars are let, not const, only so the settings menu can change them live)
// background (spec 19, 23; original design). The picture starts from a fixed share of the image's own value and each light
// adds its own lift on top of that; the two lifts add, and base + spot + glow <= 1 keeps the total from carrying the
// picture past the image's own colour. Day images: base: the fixed share; spot: the sun-like spot's lift, oval (centre x
// amplitude, centre y amplitude: the centre is on the top edge at midday, crosses the bottom edge towards either end of the
// warped daylight hours and is 1 - 2 ovalY below the bottom at midnight) and radii; band: the bottom glow's lift, centre x
// amplitude (mirrored from the spot), half-width, centre height and half-height; bandWide, bandWidePow: how much the glow
// broadens around the middle of the day (its half-width x (1 + bandWide x cos(angle)^bandWidePow)); pale: how much paler lit
// areas get; midSat: the mid-month saturation drop; topDark, topSat, topPow: the clock's shaping down the frame (value
// reduced, and saturation raised, by strength x height^topPow). Night images: nightMix: their share at full night weight;
// nightBase: their fixed share; nightFloor: the floor under the lit, enveloped level.
const BGL = { base: 0.556, spot: 0.243, ovalX: 0.887, ovalY: 0.981, spotW: 0.425, spotH: 0.326,
  glow: 0.199, bandX: 0.365, bandW: 0.437, bandY: 0.000, bandH: 0.312, bandWide: 0.373, bandWidePow: 4.647,
  pale: 0.993, midSat: 0.300, topDark: 1.333, topSat: 4.571, topPow: 0.300,
  nightMix: 0.322, nightBase: 0.556, nightFloor: 0.550 };
let BG_EASE = 0.05; // how far the background gradient moves towards its new value each frame
const SPARKR = {
  // size in scene units (spec 17: set in the scene, so smaller the farther away; no random size); out of focus a disc grows
  // by up to blur times its size and dims a little (dofDim). Spec 25: the focus range sits so that the near side hardly
  // reaches the field (focusNear is nearer than all but a few sparkles) while the far side, which the mood shifts, lies
  // inside the field's far end, blurring the farthest sparkles only part of the way along its transition
  size: 0.0062, blur: 12.0, dofDim: 0.3, nearSoft: 0.72, farSoft: 0.95, focusNear: 2.0,
  // turn towards the camera (spec 21): none for a disc whose in-focus apparent radius is below turn0 px (at 1080 lines), complete
  // from turn1 px, so only the few near, large discs face the viewer and the rest pass through edge-on
  turn0: 2.0, turn1: 2.6,
  // in focus a crisp edge edge px wide (0: hard, spec 21's hard-edged discs); a disc below minPx px radius is drawn at that
  // radius, dimmed by its area (0: never, so a disc smaller than a pixel shows only where it covers a pixel's centre)
  edge: 0, minPx: 0.7,
  // the glint halo (spec 25): a wide patch (glintSize disc radii) with the light gathered near the middle, falling away
  // as a power of the distance (core radius glintCore disc radii, power glintFall), so a bright sparkle keeps a narrow
  // core and carries a faint skirt well out from it
  bright: 1.00, glintSize: 14.0, glintCore: 1.5, glintFall: 1.05, glintBright: 0.15,
  // lighting (spec 16, 17 and 21): one point light in the scene in front of the camera, diffuse kd and specular ks with
  // exponent shin, the highlight tinted at full strength by the iridescent map (below; mapStr scales every lobe's strength,
  // mapR their radii; exponent mapExp = 1 leaves it unchanged), the sum through 1 - exp(-satGain x); opacity falls as a disc
  // turns towards edge-on, with the power tiltPow of one minus the cosine
  light: [1.3, 0.7, -1.5], kd: 0.204, ks: 1.509, shin: 30, mapExp: 1.0, mapStr: 1.20, mapR: 1.0, satGain: 0.629, tiltPow: 6.0,
};
// The iridescent map's lobes (spec 21, original design): position in the map (the facing direction's right and up
// components), radius, strength, and colour at full strength (its brightness included). Between them the map is near-neutral
// white. The hues come in clusters: pinks and magentas, peach and gold, red-orange, a little violet-blue; no green or cyan.
const SPARK_LOBES_DEF = [
  // x,     y,     r,  strength  colour
  [-0.92, -0.50, 0.154, 1.5, [1.00, 0.62, 0.35]], // peach
  [-0.66, -0.50, 0.154, 1.5, [1.00, 0.72, 0.22]], // gold
  [-0.14, -0.50, 0.154, 1.5, [1.00, 0.30, 0.12]], // red-orange
  [0.12, -0.50, 0.154, 1.5, [1.00, 0.62, 0.35]], // peach
  [0.90, -0.50, 0.154, 1.5, [1.00, 0.35, 0.65]], // pink
  [-0.53, -0.20, 0.154, 1.5, [1.00, 0.35, 0.65]], // pink
  [-0.01, -0.20, 0.154, 1.5, [1.00, 0.62, 0.35]], // peach
  [0.25, -0.20, 0.154, 1.5, [0.55, 0.45, 1.00]], // violet-blue
  [0.77, -0.20, 0.154, 1.5, [0.55, 0.45, 1.00]], // violet-blue
  [-0.92, 0.10, 0.154, 1.5, [1.00, 0.72, 0.22]], // gold
  [-0.66, 0.10, 0.154, 1.5, [0.55, 0.45, 1.00]], // violet-blue
  [-0.14, 0.10, 0.154, 1.5, [0.90, 0.25, 0.95]], // magenta
  [0.12, 0.10, 0.154, 1.5, [1.00, 0.62, 0.35]], // peach
  [0.38, 0.10, 0.154, 1.5, [1.00, 0.72, 0.22]], // gold
  [0.90, 0.10, 0.154, 1.5, [0.55, 0.45, 1.00]], // violet-blue
  [-0.53, 0.40, 0.154, 1.5, [1.00, 0.72, 0.22]], // gold
  [-0.01, 0.40, 0.154, 1.5, [1.00, 0.30, 0.12]], // red-orange
  [0.25, 0.40, 0.154, 1.5, [0.90, 0.25, 0.95]], // magenta
  [0.77, 0.40, 0.154, 1.5, [0.90, 0.25, 0.95]], // magenta
  [1.03, 0.40, 0.154, 1.5, [1.00, 0.35, 0.65]], // pink
];
const SPARK_LOBES = SPARK_LOBES_DEF.length;
const SPARK_LOBE_POS = new Float32Array(SPARK_LOBES_DEF.flatMap(l => [l[0], l[1], l[2], l[3]]));
const SPARK_LOBE_COL = new Float32Array(SPARK_LOBES_DEF.flatMap(l => l[4]));
let DITHER = 0.85; // output levels, peak

