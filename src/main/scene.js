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
    0.754, 0.771, 0.726,  0.686, 0.694, 0.697,  0.594, 0.638, 0.640,
    0.730, 0.720, 0.679,  0.672, 0.673, 0.709,  0.709, 0.669, 0.717,
    0.641, 0.689, 0.654,  0.657, 0.673, 0.635,  0.778, 0.703, 0.737,
    0.555, 0.565, 0.622,  0.582, 0.589, 0.665,  0.733, 0.698, 0.747,
    0.644, 0.614, 0.700,  0.595, 0.664, 0.600,  0.586, 0.727, 0.666,
    0.693, 0.679, 0.743,  0.703, 0.747, 0.662,  0.593, 0.759, 0.651
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.006, 0.000,
    0.088, 0.000, 0.000,  0.131, 0.076, 0.076,  0.151, 0.116, 0.130,
    0.409, 0.217, 0.258,  0.458, 0.308, 0.324,  0.499, 0.407, 0.382,
    0.923, 0.603, 0.698,  1.007, 0.665, 0.751,  0.991, 0.707, 0.754,
    1.500, 1.070, 1.115,  1.484, 0.997, 1.137,  1.500, 0.935, 1.175
  ] },
  /*  2 yellow      */ { day: [
    0.788, 0.840, 0.000,  0.931, 0.904, 0.000,  0.945, 0.891, 0.000,
    0.773, 0.764, 0.054,  0.922, 0.794, 0.000,  0.828, 0.855, 0.000,
    0.789, 0.730, 0.000,  0.812, 0.711, 0.000,  0.793, 0.783, 0.032,
    0.825, 0.703, 0.040,  0.839, 0.646, 0.000,  0.869, 0.766, 0.093,
    0.963, 0.840, 0.215,  0.929, 0.715, 0.231,  1.021, 0.806, 0.285,
    1.017, 0.961, 0.347,  1.008, 0.871, 0.393,  1.045, 0.883, 0.374
  ], night: [
    0.000, 0.213, 0.000,  0.000, 0.186, 0.000,  0.000, 0.164, 0.000,
    0.032, 0.280, 0.000,  0.011, 0.146, 0.000,  0.000, 0.000, 0.000,
    0.189, 0.429, 0.070,  0.113, 0.294, 0.038,  0.056, 0.068, 0.036,
    0.370, 0.592, 0.282,  0.421, 0.666, 0.301,  0.406, 0.617, 0.320,
    0.598, 0.853, 0.493,  0.657, 0.975, 0.624,  0.726, 1.179, 0.755
  ] },
  /*  3 light green */ { day: [
    0.526, 0.737, 0.086,  0.647, 0.885, 0.147,  0.592, 0.824, 0.112,
    0.550, 0.769, 0.131,  0.671, 0.915, 0.193,  0.618, 0.856, 0.159,
    0.594, 0.820, 0.222,  0.681, 0.926, 0.267,  0.652, 0.896, 0.247,
    0.626, 0.878, 0.281,  0.674, 0.938, 0.305,  0.673, 0.940, 0.303,
    0.648, 0.906, 0.348,  0.676, 0.941, 0.362,  0.689, 0.962, 0.370,
    0.672, 0.928, 0.396,  0.693, 0.958, 0.409,  0.711, 0.984, 0.419
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.002, 0.005, 0.001,  0.002, 0.005, 0.001,  0.002, 0.005, 0.001,
    0.097, 0.294, 0.008,  0.097, 0.294, 0.008,  0.097, 0.294, 0.008,
    0.227, 0.603, 0.057,  0.227, 0.603, 0.057,  0.227, 0.603, 0.057,
    0.373, 0.909, 0.132,  0.373, 0.909, 0.132,  0.373, 0.909, 0.132
  ] },
  /*  4 pink        */ { day: [
    0.666, 0.235, 0.373,  0.684, 0.283, 0.398,  0.682, 0.372, 0.413,
    0.608, 0.120, 0.307,  0.687, 0.201, 0.420,  0.693, 0.347, 0.472,
    0.600, 0.046, 0.304,  0.698, 0.129, 0.446,  0.728, 0.261, 0.547,
    0.654, 0.000, 0.327,  0.695, 0.000, 0.448,  0.742, 0.136, 0.548,
    0.796, 0.060, 0.478,  0.803, 0.084, 0.551,  0.831, 0.124, 0.619,
    1.021, 0.243, 0.678,  1.019, 0.278, 0.740,  1.025, 0.309, 0.709
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.139, 0.000, 0.073,  0.140, 0.000, 0.000,  0.166, 0.000, 0.000,
    0.391, 0.016, 0.292,  0.399, 0.000, 0.210,  0.470, 0.000, 0.130,
    0.887, 0.047, 0.686,  0.856, 0.000, 0.547,  0.852, 0.108, 0.380,
    1.397, 0.000, 0.919,  1.423, 0.051, 0.769,  1.443, 0.181, 0.586
  ] },
  /*  5 green       */ { day: [
    0.123, 0.449, 0.042,  0.017, 0.555, 0.000,  0.012, 0.620, 0.000,
    0.201, 0.618, 0.146,  0.057, 0.687, 0.000,  0.000, 0.719, 0.000,
    0.233, 0.677, 0.185,  0.121, 0.795, 0.064,  0.000, 0.864, 0.000,
    0.179, 0.697, 0.168,  0.090, 0.842, 0.072,  0.002, 0.950, 0.000,
    0.115, 0.656, 0.090,  0.083, 0.821, 0.072,  0.036, 0.934, 0.067,
    0.000, 0.523, 0.000,  0.019, 0.636, 0.000,  0.000, 0.750, 0.055
  ], night: [
    0.026, 0.126, 0.046,  0.000, 0.000, 0.000,  0.010, 0.000, 0.000,
    0.000, 0.176, 0.000,  0.000, 0.232, 0.042,  0.000, 0.318, 0.000,
    0.000, 0.352, 0.000,  0.012, 0.507, 0.110,  0.092, 0.674, 0.155,
    0.000, 0.719, 0.000,  0.068, 0.886, 0.210,  0.123, 0.976, 0.357,
    0.000, 1.006, 0.188,  0.000, 1.158, 0.345,  0.000, 1.216, 0.516
  ] },
  /*  6 lavender    */ { day: [
    0.541, 0.341, 0.932,  0.662, 0.433, 1.100,  0.608, 0.389, 1.034,
    0.572, 0.385, 0.964,  0.690, 0.476, 1.129,  0.639, 0.435, 1.067,
    0.627, 0.470, 1.020,  0.715, 0.538, 1.140,  0.687, 0.516, 1.111,
    0.662, 0.530, 1.079,  0.711, 0.567, 1.150,  0.711, 0.568, 1.156,
    0.691, 0.586, 1.106,  0.719, 0.611, 1.148,  0.734, 0.623, 1.174,
    0.721, 0.632, 1.129,  0.743, 0.650, 1.162,  0.764, 0.670, 1.194
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.003, 0.003, 0.005,  0.003, 0.003, 0.005,  0.003, 0.003, 0.005,
    0.146, 0.140, 0.254,  0.146, 0.140, 0.254,  0.146, 0.140, 0.254,
    0.314, 0.306, 0.523,  0.314, 0.306, 0.523,  0.314, 0.306, 0.523,
    0.489, 0.479, 0.785,  0.489, 0.479, 0.785,  0.489, 0.479, 0.785
  ] },
  /*  7 teal        */ { day: [
    0.000, 0.460, 0.582,  0.000, 0.568, 0.614,  0.000, 0.641, 0.641,
    0.000, 0.425, 0.553,  0.000, 0.570, 0.655,  0.022, 0.684, 0.709,
    0.044, 0.384, 0.543,  0.000, 0.559, 0.685,  0.005, 0.699, 0.727,
    0.000, 0.360, 0.519,  0.000, 0.570, 0.611,  0.000, 0.733, 0.721,
    0.000, 0.390, 0.511,  0.000, 0.633, 0.567,  0.035, 0.824, 0.742,
    0.005, 0.430, 0.483,  0.003, 0.664, 0.554,  0.000, 0.860, 0.742
  ], night: [
    0.000, 0.000, 0.109,  0.000, 0.000, 0.043,  0.015, 0.000, 0.000,
    0.000, 0.060, 0.200,  0.005, 0.021, 0.128,  0.000, 0.026, 0.120,
    0.025, 0.064, 0.324,  0.000, 0.085, 0.279,  0.010, 0.171, 0.329,
    0.026, 0.183, 0.583,  0.003, 0.269, 0.531,  0.000, 0.354, 0.534,
    0.000, 0.280, 0.821,  0.026, 0.457, 0.789,  0.000, 0.579, 0.730
  ] },
  /*  8 blue        */ { day: [
    0.226, 0.914, 0.989,  0.175, 0.961, 1.097,  0.086, 1.007, 1.225,
    0.117, 0.766, 0.859,  0.099, 0.826, 0.963,  0.012, 0.904, 1.030,
    0.000, 0.568, 0.762,  0.050, 0.672, 0.825,  0.000, 0.770, 0.865,
    0.000, 0.387, 0.586,  0.000, 0.486, 0.744,  0.000, 0.661, 0.855,
    0.000, 0.287, 0.449,  0.035, 0.359, 0.675,  0.000, 0.539, 0.884,
    0.010, 0.223, 0.381,  0.058, 0.303, 0.613,  0.072, 0.440, 0.814
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.016, 0.000,  0.011, 0.000, 0.000,
    0.000, 0.140, 0.121,  0.016, 0.092, 0.062,  0.000, 0.054, 0.000,
    0.013, 0.363, 0.216,  0.032, 0.229, 0.210,  0.017, 0.222, 0.221,
    0.073, 0.580, 0.324,  0.023, 0.510, 0.452,  0.000, 0.510, 0.557,
    0.172, 0.752, 0.417,  0.054, 0.791, 0.603,  0.000, 0.786, 0.755
  ] },
  /*  9 purple      */ { day: [
    0.315, 0.151, 0.598,  0.510, 0.290, 0.866,  0.327, 0.159, 0.624,
    0.346, 0.165, 0.640,  0.482, 0.262, 0.827,  0.360, 0.172, 0.667,
    0.435, 0.216, 0.754,  0.484, 0.251, 0.824,  0.451, 0.225, 0.784,
    0.542, 0.258, 0.922,  0.559, 0.268, 0.948,  0.563, 0.269, 0.957,
    0.639, 0.312, 1.050,  0.651, 0.319, 1.071,  0.664, 0.325, 1.090,
    0.701, 0.358, 1.120,  0.713, 0.365, 1.142,  0.728, 0.371, 1.163
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.002, 0.003, 0.008,  0.002, 0.003, 0.008,  0.002, 0.003, 0.008,
    0.087, 0.107, 0.460,  0.087, 0.107, 0.460,  0.087, 0.107, 0.460,
    0.230, 0.268, 0.943,  0.230, 0.268, 0.943,  0.230, 0.268, 0.943,
    0.407, 0.463, 1.421,  0.407, 0.463, 1.421,  0.407, 0.463, 1.421
  ] },
  /* 10 gold        */ { day: [
    0.703, 0.584, 0.054,  0.688, 0.564, 0.000,  0.625, 0.551, 0.000,
    0.730, 0.569, 0.056,  0.698, 0.540, 0.000,  0.630, 0.535, 0.000,
    0.698, 0.523, 0.090,  0.671, 0.482, 0.044,  0.630, 0.470, 0.016,
    0.691, 0.510, 0.080,  0.667, 0.492, 0.000,  0.629, 0.470, 0.000,
    0.719, 0.606, 0.156,  0.707, 0.599, 0.160,  0.743, 0.596, 0.145,
    0.828, 0.726, 0.249,  0.856, 0.764, 0.241,  0.945, 0.760, 0.203
  ], night: [
    0.024, 0.000, 0.000,  0.050, 0.000, 0.000,  0.057, 0.027, 0.000,
    0.166, 0.075, 0.000,  0.133, 0.044, 0.000,  0.148, 0.000, 0.000,
    0.453, 0.262, 0.000,  0.425, 0.228, 0.000,  0.388, 0.187, 0.039,
    0.876, 0.522, 0.000,  0.895, 0.534, 0.000,  0.841, 0.520, 0.107,
    1.492, 0.885, 0.153,  1.364, 0.825, 0.150,  1.356, 0.781, 0.197
  ] },
  /* 11 brown       */ { day: [
    0.537, 0.496, 0.000,  0.673, 0.458, 0.147,  0.778, 0.456, 0.231,
    0.611, 0.506, 0.009,  0.692, 0.453, 0.157,  0.794, 0.467, 0.194,
    0.631, 0.470, 0.056,  0.702, 0.454, 0.092,  0.766, 0.442, 0.000,
    0.618, 0.420, 0.000,  0.655, 0.405, 0.078,  0.711, 0.413, 0.009,
    0.649, 0.385, 0.004,  0.651, 0.347, 0.000,  0.637, 0.334, 0.000,
    0.582, 0.334, 0.000,  0.541, 0.279, 0.000,  0.513, 0.237, 0.000
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.006, 0.000,  0.000, 0.000, 0.022,
    0.017, 0.000, 0.000,  0.001, 0.000, 0.028,  0.000, 0.021, 0.017,
    0.127, 0.040, 0.000,  0.141, 0.031, 0.000,  0.205, 0.036, 0.000,
    0.331, 0.134, 0.000,  0.405, 0.195, 0.000,  0.444, 0.215, 0.000,
    0.447, 0.273, 0.074,  0.604, 0.388, 0.000,  0.675, 0.413, 0.000
  ] },
  /* 12 red         */ { day: [
    0.766, 0.021, 0.033,  0.911, 0.074, 0.084,  0.853, 0.040, 0.050,
    0.791, 0.042, 0.058,  0.933, 0.094, 0.110,  0.878, 0.061, 0.078,
    0.830, 0.086, 0.112,  0.933, 0.124, 0.150,  0.906, 0.102, 0.131,
    0.871, 0.084, 0.123,  0.931, 0.100, 0.141,  0.933, 0.092, 0.136,
    0.888, 0.107, 0.157,  0.923, 0.115, 0.166,  0.943, 0.115, 0.167,
    0.904, 0.138, 0.191,  0.932, 0.143, 0.198,  0.956, 0.146, 0.203
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.006, 0.001, 0.001,  0.006, 0.001, 0.001,  0.006, 0.001, 0.001,
    0.306, 0.027, 0.009,  0.306, 0.027, 0.009,  0.306, 0.027, 0.009,
    0.630, 0.096, 0.061,  0.630, 0.096, 0.061,  0.630, 0.096, 0.061,
    0.948, 0.189, 0.140,  0.948, 0.189, 0.140,  0.948, 0.189, 0.140
  ] },
];
const BG_W = 32, BG_H = 18; // size of each generated background image

// ---------------------------------------------------------------------------
// Moods: complete parameter sets, blended linearly with one shared factor.
// ---------------------------------------------------------------------------
const MOOD_KEYS = [
  'waveBright', 'base', 'fres', 'sizeK',
  'latX', 'latY', 'latZ', 'envCross', 'camPitch',
  'exposure', 'white', 'glareThr', 'glareSigma', 'glareRatio', 'glareStrength',
  'focusFar', 'sparkSize', 'sparkBright', 'glint',
];
// The composite's black offset (spec 4.5, versions 20 and 24): the same in every mood (the moods set only the gain and the
// white point). It is a shared setting with three observables pulling against each other, so it is fitted together with each
// mood's gain and the palettes: the colour the band's added light takes over the dark parts of a night frame
// (tools/measure/bandcolour.py, which wants it large), how far down a night frame the top stays flat
// (tools/measure/blackfoot.py, best near 0.03) and the background away from the band (bgcompare, which wants it small,
// because the offset cuts the dark end and the palettes can only scale colours). 0.03 is the joint best of the four values
// tried, each with the gains and palettes refitted to convergence; the daytime band stays as near-neutral as the original's.
let TONE_BLACK = 0.03;
// Glare (spec 5, versions 20 and 24): each mood's bright-pass threshold is fixed, in the composite's output units after its
// curve, and the same chain runs in every mood. Placed inside the brackets measured on the original's footage at the bright-pass's
// resolution (tools/measure/brightfoot.py): by day between July's brightest background (which does not glare) and January's and
// December's (which do); at dawn and dusk above every background and below the dimmest month's brightest fold; at night above the
// band's brightest folds, so the night is free of halo on the screen.
const MOODS = {
  night: { waveBright: 0.22, base: 1.6, fres: 1.7, sizeK: 0.54,
    latX: 1.00, latY: 0.92, latZ: 1.00, envCross: 0.20, camPitch: -3,
    exposure: 1.629, white: 1.0, glareThr: 0.9, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.6,
    focusFar: 30.0, sparkSize: 1.1, sparkBright: 1.0, glint: 0.30 },
  dawn: { waveBright: 0.20, base: 1.8, fres: 1.6, sizeK: 0.6,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.25, camPitch: -8,
    exposure: 1.158, white: 1.0, glareThr: 0.7, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 30.0, sparkSize: 1.1, sparkBright: 1.0, glint: 0.35 },
  day: { waveBright: 0.15, base: 1.2, fres: 2.4, sizeK: 0.6,
    latX: 1.00, latY: 1.00, latZ: 1.00, envCross: 0.28, camPitch: -8,
    exposure: 1.087, white: 0.9, glareThr: 0.68, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 30.0, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dusk: { waveBright: 0.24, base: 1.8, fres: 1.6, sizeK: 0.54,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.20, camPitch: -8,
    exposure: 1.233, white: 1.0, glareThr: 0.785, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 30.0, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
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
// Camera (original design): looks across the sheet from in front, very nearly at right angles to its length (a slight
// yaw puts the shaken left side nearer), from slightly below it, looking up (negative pitch); the pitch follows the mood
// (flatter at night).
// ---------------------------------------------------------------------------
const CAMERA = { fovY: 64.4, yaw: 6, dist: 3.161, target: [0.8, -0.1, 0.0], near: 0.1, far: 40 }; // a moderate field of view, close; the sheet seen from slightly below (spec 17)
function cameraFor(pitchDeg, aspect) {
  const d2r = Math.PI / 180, p = pitchDeg * d2r, yw = CAMERA.yaw * d2r;
  const fwd = [Math.sin(yw) * Math.cos(p), -Math.sin(p), Math.cos(yw) * Math.cos(p)];
  const right = [Math.cos(yw), 0, -Math.sin(yw)];
  const up = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]];
  const pos = CAMERA.target.map((t, i) => t - CAMERA.dist * fwd[i]);
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
  samplesAlong: 64, samplesAcross: 6,   // per patch (16 x 16 patches)
  sheenCut0: 0.2179, sheenCut1: 0.599, // the sheen falls linearly between these size factors (the fused thread profile)
  // the Fresnel-like peak: where it sits in cosine x size factor; zero below fresZero of that; the tail's length above it
  fresPeak: 0.12, fresZero: 0.5961, fresTail: 0.1403,
  fade: 0.06,                           // fraction of the sheet over which it fades out, linearly, at the ends and edges
  filterSpread: 1.0,                    // width of the down-filter over the wave buffer: one output pixel (spec 16)
  // a neutral tint brightening slightly from left to right (spec 20: measured, the band's brightest places left against right
  // over 48 clips of the original, matched by my renders at the same conditions): left 0.82 of right, with the mean over
  // the screen kept at the earlier tint's (0.97) so the band's overall level is unchanged
  tintL: [0.875, 0.875, 0.875], tintR: [1.067, 1.067, 1.067],
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
  // by up to blur times its size and dims a little (dofDim); only the near side of the focus range is reached
  size: 0.010, blur: 0.5, dofDim: 0.3, nearSoft: 0.72, farSoft: 1.5, focusNear: 2.59,
  turn: 0.3,                       // part of the way every disc is turned towards the camera (fully when close)
  bright: 0.55, glintSize: 4.5, glintBright: 0.10,
  // lighting (spec 16 and 17): one point light in the scene in front of the camera, diffuse kd and specular ks with exponent
  // shin, the highlight tinted by the iridescent map (saturation mapSat everywhere, exponent mapExp = 1 leaves it unchanged),
  // the sum through 1 - exp(-satGain x); opacity falls as a disc turns towards edge-on, with the power tiltPow of one minus
  // the cosine
  light: [1.3, 0.7, -1.5], kd: 0.25, ks: 1.5, shin: 40, mapExp: 1.0, mapSat: 0.15, satGain: 1.5, tiltPow: 1.0,
};
let DITHER = 0.85; // output levels, peak

