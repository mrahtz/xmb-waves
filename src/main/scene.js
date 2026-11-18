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
const BG_GRID_W = 3, BG_GRID_H = 6, BG_NGRID_H = 7;
const PALETTES = [
  /*  1 silver      */ { day: [
    0.769, 0.762, 0.681,  0.714, 0.730, 0.681,  0.640, 0.687, 0.651,
    0.707, 0.688, 0.672,  0.660, 0.715, 0.674,  0.660, 0.704, 0.666,
    0.606, 0.691, 0.656,  0.657, 0.683, 0.673,  0.675, 0.738, 0.682,
    0.537, 0.534, 0.594,  0.564, 0.601, 0.600,  0.600, 0.627, 0.667,
    0.584, 0.576, 0.656,  0.641, 0.600, 0.592,  0.692, 0.668, 0.679,
    0.638, 0.668, 0.743,  0.763, 0.691, 0.671,  0.834, 0.812, 0.768
  ], night: [
    0.002, 0.000, 0.005,  0.000, 0.030, 0.024,  0.046, 0.000, 0.000,
    0.027, 0.036, 0.000,  0.102, 0.104, 0.107,  0.193, 0.094, 0.140,
    0.174, 0.135, 0.085,  0.273, 0.203, 0.234,  0.380, 0.234, 0.305,
    0.495, 0.330, 0.332,  0.574, 0.362, 0.451,  0.688, 0.477, 0.555,
    0.835, 0.607, 0.596,  0.934, 0.657, 0.753,  1.008, 0.730, 0.899,
    1.128, 0.847, 0.842,  1.204, 0.895, 1.008,  1.239, 0.967, 1.156,
    1.500, 1.186, 1.209,  1.500, 1.211, 1.359,  1.497, 1.321, 1.465
  ] },
  /*  2 yellow      */ { day: [
    0.728, 0.800, 0.096,  0.844, 0.786, 0.000,  0.755, 0.713, 0.021,
    0.796, 0.717, 0.000,  0.872, 0.692, 0.000,  0.856, 0.684, 0.000,
    0.954, 0.577, 0.000,  0.827, 0.578, 0.049,  0.860, 0.702, 0.000,
    0.855, 0.626, 0.000,  0.803, 0.599, 0.034,  0.835, 0.768, 0.123,
    0.916, 0.816, 0.200,  0.869, 0.746, 0.255,  0.902, 0.803, 0.251,
    0.975, 0.877, 0.338,  0.894, 0.852, 0.362,  0.813, 0.750, 0.288
  ], night: [
    0.002, 0.248, 0.001,  0.049, 0.112, 0.000,  0.089, 0.265, 0.063,
    0.000, 0.180, 0.002,  0.008, 0.167, 0.000,  0.015, 0.194, 0.014,
    0.031, 0.196, 0.026,  0.016, 0.235, 0.008,  0.025, 0.225, 0.000,
    0.108, 0.278, 0.068,  0.051, 0.337, 0.018,  0.097, 0.351, 0.000,
    0.355, 0.510, 0.287,  0.365, 0.617, 0.230,  0.357, 0.595, 0.160,
    0.574, 0.743, 0.468,  0.645, 0.858, 0.440,  0.638, 0.847, 0.397,
    0.896, 1.125, 0.722,  1.069, 1.206, 0.787,  1.123, 1.262, 0.870
  ] },
  /*  3 light green */ { day: [
    0.529, 0.741, 0.063,  0.653, 0.890, 0.123,  0.598, 0.829, 0.088,
    0.547, 0.764, 0.111,  0.669, 0.908, 0.173,  0.614, 0.850, 0.138,
    0.589, 0.817, 0.199,  0.676, 0.923, 0.243,  0.647, 0.892, 0.223,
    0.601, 0.839, 0.270,  0.648, 0.898, 0.292,  0.647, 0.900, 0.290,
    0.614, 0.855, 0.333,  0.640, 0.887, 0.346,  0.652, 0.907, 0.354,
    0.645, 0.879, 0.398,  0.667, 0.908, 0.410,  0.685, 0.934, 0.420
  ], night: [
    0.002, 0.005, 0.000,  0.002, 0.005, 0.000,  0.002, 0.005, 0.000,
    0.000, 0.000, 0.001,  0.000, 0.000, 0.001,  0.000, 0.000, 0.001,
    0.033, 0.100, 0.002,  0.033, 0.100, 0.002,  0.033, 0.100, 0.002,
    0.124, 0.381, 0.006,  0.124, 0.381, 0.006,  0.124, 0.381, 0.006,
    0.209, 0.564, 0.043,  0.209, 0.564, 0.043,  0.209, 0.564, 0.043,
    0.316, 0.782, 0.099,  0.316, 0.782, 0.099,  0.316, 0.782, 0.099,
    0.481, 1.089, 0.196,  0.481, 1.089, 0.196,  0.481, 1.089, 0.196
  ] },
  /*  4 pink        */ { day: [
    0.654, 0.106, 0.280,  0.665, 0.211, 0.341,  0.650, 0.354, 0.389,
    0.563, 0.096, 0.374,  0.628, 0.127, 0.399,  0.651, 0.226, 0.375,
    0.563, 0.000, 0.455,  0.643, 0.066, 0.430,  0.647, 0.130, 0.392,
    0.641, 0.033, 0.489,  0.723, 0.000, 0.482,  0.690, 0.000, 0.438,
    0.817, 0.113, 0.547,  0.852, 0.102, 0.541,  0.765, 0.073, 0.448,
    0.964, 0.223, 0.634,  0.964, 0.280, 0.639,  0.910, 0.223, 0.429
  ], night: [
    0.034, 0.000, 0.000,  0.045, 0.000, 0.000,  0.093, 0.002, 0.008,
    0.122, 0.000, 0.057,  0.170, 0.019, 0.070,  0.243, 0.000, 0.066,
    0.228, 0.000, 0.124,  0.313, 0.034, 0.148,  0.396, 0.041, 0.168,
    0.388, 0.000, 0.223,  0.537, 0.048, 0.259,  0.618, 0.165, 0.355,
    0.753, 0.025, 0.396,  0.854, 0.084, 0.473,  0.945, 0.197, 0.551,
    1.064, 0.052, 0.545,  1.127, 0.121, 0.631,  1.198, 0.202, 0.704,
    1.500, 0.101, 0.758,  1.500, 0.185, 0.820,  1.500, 0.167, 0.894
  ] },
  /*  5 green       */ { day: [
    0.000, 0.598, 0.068,  0.000, 0.623, 0.056,  0.000, 0.635, 0.000,
    0.302, 0.644, 0.042,  0.096, 0.753, 0.000,  0.000, 0.820, 0.081,
    0.305, 0.672, 0.001,  0.100, 0.805, 0.000,  0.004, 0.980, 0.098,
    0.172, 0.642, 0.000,  0.000, 0.801, 0.000,  0.013, 0.991, 0.095,
    0.072, 0.590, 0.000,  0.000, 0.736, 0.054,  0.044, 0.926, 0.163,
    0.035, 0.494, 0.000,  0.017, 0.617, 0.077,  0.037, 0.776, 0.244
  ], night: [
    0.015, 0.082, 0.017,  0.000, 0.025, 0.000,  0.000, 0.000, 0.000,
    0.018, 0.283, 0.039,  0.000, 0.228, 0.021,  0.013, 0.265, 0.047,
    0.014, 0.420, 0.060,  0.000, 0.379, 0.063,  0.013, 0.471, 0.106,
    0.000, 0.567, 0.083,  0.000, 0.549, 0.140,  0.000, 0.707, 0.195,
    0.032, 0.754, 0.195,  0.055, 0.840, 0.267,  0.093, 0.943, 0.364,
    0.074, 0.919, 0.303,  0.125, 1.071, 0.382,  0.155, 1.164, 0.516,
    0.154, 1.158, 0.477,  0.255, 1.376, 0.555,  0.220, 1.494, 0.743
  ] },
  /*  6 lavender    */ { day: [
    0.536, 0.319, 0.975,  0.659, 0.409, 1.150,  0.603, 0.364, 1.082,
    0.563, 0.363, 0.992,  0.679, 0.451, 1.163,  0.628, 0.412, 1.097,
    0.614, 0.440, 1.048,  0.700, 0.506, 1.171,  0.673, 0.484, 1.141,
    0.634, 0.500, 1.060,  0.680, 0.534, 1.128,  0.680, 0.535, 1.134,
    0.653, 0.548, 1.070,  0.680, 0.572, 1.110,  0.694, 0.583, 1.136,
    0.696, 0.609, 1.091,  0.718, 0.628, 1.124,  0.738, 0.647, 1.155
  ], night: [
    0.002, 0.002, 0.004,  0.002, 0.002, 0.004,  0.002, 0.002, 0.004,
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.050, 0.047, 0.088,  0.050, 0.047, 0.088,  0.050, 0.047, 0.088,
    0.191, 0.181, 0.333,  0.191, 0.181, 0.333,  0.191, 0.181, 0.333,
    0.295, 0.281, 0.493,  0.295, 0.281, 0.493,  0.295, 0.281, 0.493,
    0.423, 0.405, 0.682,  0.423, 0.405, 0.682,  0.423, 0.405, 0.682,
    0.610, 0.589, 0.946,  0.610, 0.589, 0.946,  0.610, 0.589, 0.946
  ] },
  /*  7 teal        */ { day: [
    0.000, 0.444, 0.490,  0.000, 0.541, 0.541,  0.000, 0.591, 0.607,
    0.000, 0.432, 0.445,  0.000, 0.515, 0.582,  0.000, 0.560, 0.633,
    0.000, 0.258, 0.436,  0.000, 0.532, 0.516,  0.000, 0.638, 0.620,
    0.000, 0.212, 0.463,  0.000, 0.445, 0.457,  0.009, 0.641, 0.549,
    0.000, 0.305, 0.486,  0.000, 0.530, 0.423,  0.019, 0.708, 0.647,
    0.000, 0.391, 0.462,  0.074, 0.632, 0.557,  0.175, 0.789, 0.715
  ], night: [
    0.000, 0.000, 0.103,  0.000, 0.079, 0.047,  0.000, 0.039, 0.102,
    0.000, 0.000, 0.163,  0.000, 0.081, 0.164,  0.000, 0.031, 0.119,
    0.009, 0.050, 0.299,  0.000, 0.000, 0.223,  0.000, 0.000, 0.239,
    0.000, 0.018, 0.415,  0.000, 0.000, 0.306,  0.009, 0.138, 0.401,
    0.000, 0.000, 0.406,  0.000, 0.000, 0.445,  0.000, 0.171, 0.506,
    0.000, 0.187, 0.625,  0.000, 0.192, 0.635,  0.091, 0.271, 0.644,
    0.000, 0.270, 0.750,  0.099, 0.426, 0.903,  0.182, 0.372, 0.963
  ] },
  /*  8 blue        */ { day: [
    0.197, 0.924, 1.134,  0.175, 1.018, 1.237,  0.066, 1.051, 1.222,
    0.128, 0.760, 1.020,  0.085, 0.872, 1.023,  0.013, 1.012, 1.086,
    0.000, 0.680, 0.855,  0.000, 0.746, 0.894,  0.000, 0.791, 1.032,
    0.000, 0.497, 0.604,  0.000, 0.587, 0.862,  0.000, 0.664, 0.962,
    0.000, 0.360, 0.446,  0.052, 0.403, 0.723,  0.000, 0.550, 0.882,
    0.076, 0.203, 0.363,  0.036, 0.341, 0.606,  0.000, 0.410, 0.772
  ], night: [
    0.027, 0.297, 0.146,  0.000, 0.000, 0.027,  0.000, 0.000, 0.011,
    0.025, 0.203, 0.130,  0.000, 0.103, 0.054,  0.000, 0.000, 0.000,
    0.000, 0.259, 0.132,  0.002, 0.251, 0.139,  0.001, 0.263, 0.077,
    0.007, 0.423, 0.268,  0.000, 0.434, 0.293,  0.092, 0.481, 0.304,
    0.011, 0.624, 0.393,  0.000, 0.650, 0.431,  0.111, 0.571, 0.492,
    0.175, 0.756, 0.551,  0.000, 0.990, 0.727,  0.053, 0.865, 0.758,
    0.238, 0.883, 0.719,  0.055, 1.108, 0.858,  0.013, 1.090, 0.812
  ] },
  /*  9 purple      */ { day: [
    0.312, 0.134, 0.626,  0.505, 0.268, 0.905,  0.321, 0.141, 0.653,
    0.339, 0.147, 0.658,  0.473, 0.240, 0.852,  0.353, 0.153, 0.686,
    0.422, 0.191, 0.775,  0.472, 0.225, 0.846,  0.439, 0.199, 0.805,
    0.518, 0.240, 0.906,  0.535, 0.250, 0.931,  0.539, 0.250, 0.940,
    0.604, 0.289, 1.016,  0.615, 0.296, 1.037,  0.628, 0.301, 1.054,
    0.678, 0.354, 1.084,  0.689, 0.361, 1.104,  0.703, 0.368, 1.125
  ], night: [
    0.001, 0.002, 0.008,  0.001, 0.002, 0.008,  0.001, 0.002, 0.008,
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.028, 0.037, 0.161,  0.028, 0.037, 0.161,  0.028, 0.037, 0.161,
    0.110, 0.134, 0.602,  0.110, 0.134, 0.602,  0.110, 0.134, 0.602,
    0.206, 0.238, 0.898,  0.206, 0.238, 0.898,  0.206, 0.238, 0.898,
    0.334, 0.376, 1.184,  0.334, 0.376, 1.184,  0.334, 0.376, 1.184,
    0.538, 0.595, 1.490,  0.538, 0.595, 1.490,  0.538, 0.595, 1.490
  ] },
  /* 10 gold        */ { day: [
    0.591, 0.610, 0.039,  0.573, 0.554, 0.059,  0.537, 0.485, 0.050,
    0.572, 0.561, 0.036,  0.579, 0.485, 0.014,  0.582, 0.423, 0.092,
    0.517, 0.487, 0.015,  0.596, 0.435, 0.000,  0.657, 0.425, 0.070,
    0.508, 0.544, 0.000,  0.586, 0.503, 0.000,  0.668, 0.429, 0.027,
    0.666, 0.654, 0.000,  0.659, 0.617, 0.101,  0.644, 0.525, 0.121,
    0.940, 0.829, 0.123,  0.821, 0.782, 0.274,  0.652, 0.648, 0.203
  ], night: [
    0.122, 0.016, 0.000,  0.000, 0.003, 0.000,  0.005, 0.003, 0.064,
    0.187, 0.028, 0.000,  0.103, 0.000, 0.000,  0.119, 0.000, 0.014,
    0.291, 0.063, 0.000,  0.243, 0.043, 0.000,  0.256, 0.045, 0.000,
    0.474, 0.124, 0.000,  0.469, 0.159, 0.001,  0.472, 0.165, 0.001,
    0.743, 0.336, 0.016,  0.805, 0.408, 0.000,  0.808, 0.425, 0.000,
    1.013, 0.546, 0.026,  1.104, 0.647, 0.023,  1.105, 0.644, 0.007,
    1.447, 0.888, 0.035,  1.500, 1.019, 0.099,  1.500, 0.952, 0.031
  ] },
  /* 11 brown       */ { day: [
    0.761, 0.357, 0.000,  0.888, 0.455, 0.037,  0.932, 0.561, 0.093,
    0.863, 0.493, 0.044,  0.839, 0.515, 0.147,  0.825, 0.628, 0.045,
    0.866, 0.481, 0.000,  0.794, 0.497, 0.098,  0.722, 0.537, 0.000,
    0.768, 0.373, 0.074,  0.710, 0.381, 0.083,  0.644, 0.428, 0.031,
    0.636, 0.302, 0.135,  0.648, 0.321, 0.079,  0.661, 0.359, 0.000,
    0.457, 0.224, 0.089,  0.545, 0.249, 0.000,  0.655, 0.272, 0.000
  ], night: [
    0.050, 0.007, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.006, 0.041, 0.017,  0.056, 0.064, 0.000,  0.103, 0.088, 0.027,
    0.032, 0.070, 0.024,  0.124, 0.109, 0.000,  0.203, 0.140, 0.027,
    0.123, 0.106, 0.027,  0.228, 0.158, 0.000,  0.347, 0.180, 0.000,
    0.278, 0.180, 0.006,  0.370, 0.222, 0.000,  0.440, 0.230, 0.000,
    0.397, 0.248, 0.005,  0.502, 0.304, 0.005,  0.561, 0.303, 0.000,
    0.546, 0.351, 0.027,  0.701, 0.454, 0.022,  0.780, 0.450, 0.000
  ] },
  /* 12 red         */ { day: [
    0.786, 0.000, 0.013,  0.931, 0.041, 0.053,  0.873, 0.007, 0.019,
    0.797, 0.016, 0.034,  0.942, 0.065, 0.084,  0.884, 0.033, 0.053,
    0.837, 0.051, 0.081,  0.940, 0.087, 0.117,  0.913, 0.065, 0.098,
    0.840, 0.073, 0.113,  0.899, 0.087, 0.130,  0.901, 0.079, 0.125,
    0.845, 0.097, 0.146,  0.878, 0.105, 0.155,  0.896, 0.105, 0.156,
    0.860, 0.149, 0.201,  0.887, 0.154, 0.209,  0.910, 0.156, 0.214
  ], night: [
    0.005, 0.000, 0.000,  0.005, 0.000, 0.000,  0.005, 0.000, 0.000,
    0.000, 0.000, 0.001,  0.000, 0.000, 0.001,  0.000, 0.000, 0.001,
    0.108, 0.008, 0.003,  0.108, 0.008, 0.003,  0.108, 0.008, 0.003,
    0.404, 0.029, 0.007,  0.404, 0.029, 0.007,  0.404, 0.029, 0.007,
    0.600, 0.079, 0.046,  0.600, 0.079, 0.046,  0.600, 0.079, 0.046,
    0.831, 0.148, 0.105,  0.831, 0.148, 0.105,  0.831, 0.148, 0.105,
    1.155, 0.264, 0.209,  1.155, 0.264, 0.209,  1.155, 0.264, 0.209
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
// The joint re-tune at the background lane's merge moved the three daylight gains and the day grids with them, to
// convergence (six rounds of jointfit.py --weight=1.0 --hold=night, step 0.7): the background away from the band goes
// from 2.26 levels a channel just after the merge to 1.53, against 1.56 on main, and the day gain lands near the value
// the branch itself was fitted at (1.098 -> 1.128, the branch's 1.120). The night is held out of the fit (--hold=night):
// this fit reads the night at 00:00 on the 15th alone, but the night gain and the night images also carry 21:30, where
// the index has two more conditions and the branch's own fit (bgfit/, which moves the images and not a scaling of them)
// used all of them. Let the fit have the night and it brings 15 October 21:30 from 1.0 levels to 2.3 while taking 00:00
// only from 1.20 to 1.21, and the whole comparison from 1.53 to 1.71; that trade is the night images' shape over the
// night, which a scaling cannot reach.
// A note on what the fit cannot settle: the gain and a palette's level multiply, so the background alone fixes
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
  dawn: { waveBright: 0.2, base: 1.8, fres: 1.6, sizeK: 0.6,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.25, camPitch: -12.7, camLift: 0,
    exposure: 1.220, white: 1.0, glareThr: 0.7, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.23, sparkSize: 1.1, sparkBright: 1.0, glint: 0.35 },
  day: { waveBright: 0.15, base: 1.2, fres: 2.4, sizeK: 0.6,
    latX: 1.00, latY: 1.00, latZ: 1.00, envCross: 0.28, camPitch: -12.7, camLift: 0,
    exposure: 1.128, white: 0.9, glareThr: 0.68, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.20, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dusk: { waveBright: 0.24, base: 1.8, fres: 1.6, sizeK: 0.54,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.20, camPitch: -12.7, camLift: 0,
    exposure: 1.343, white: 1.0, glareThr: 0.785, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
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
// Background clock (spec 19, 23, 28). The warped hour advances slowly around midday and quickly around midnight; one angle
// of it (0 at the warp's midday, +-pi at its midnight) drives the day image's two lights and all of its curves of the
// clock. BGW: warp strength, the hour the warp centres on, and the one pair of steps every curve is made of (stepW: the
// gentler step's width in warped radians; stepRatio: the sharper step's width as a fraction of it, the one fixed
// proportion of spec 28, so there are two rates in the whole build and no width of its own for any curve).
const BGW = { warp: 0.900, noon: 12.010, stepW: 0.279, stepRatio: 0.808 };
function wrapPi(a) { return a - TAU * Math.floor((a + Math.PI) / TAU); }
function dayAngle(hour) {
  const p = wrapPi(((hour - BGW.noon) / 24) * TAU);
  return p - BGW.warp * Math.sin(p);
}
// Where the pair of steps sits (spec 28): not fitted on its own, but the two angles at which the travelling spot's centre
// crosses the bottom edge of the picture (centre height 1 - ovalY (1 - cos a), 0 at the bottom edge), so the oval and the
// clock's curves turn at the same two moments.
function stepTurn() { return Math.acos(Math.min(1, Math.max(-1, 1 - 1 / Math.max(BGL.ovalY, 1e-3)))); }
// One smooth step (spec 28): it leaves one value and approaches the other closely but never exactly, and goes on
// approaching for as long as the clock runs, so there is no stretch of the clock over which it is flat and no floor is
// added back to stand in for a missing tail.
function step(x) { return 1 / (1 + Math.exp(-x)); }
// A curve of the clock: the morning step of width wm rising at -c times the evening step of width we falling at +c. The
// neighbouring days' copies are added in, so the two tails meet at the clock's midnight and the curve is smooth and
// periodic there (each copy's far tail is negligible by then).
function stepPair(a, c, wm, we) {
  let s = 0;
  for (let n = -1; n <= 1; n++) { const x = a + n * TAU; s += step((x + c) / wm) * step((c - x) / we); }
  return Math.min(1, s);
}
// The three curves the day image needs (spec 28), from that one pair at its two rates:
//   daylight: the gentler morning step times the sharper evening step, so it rises the gradual way, holds near its full
//     height from the middle of the morning well into the evening and then falls the fast way (its peak in the later
//     afternoon). It is lowest at midnight, where it is close to nothing but never nothing.
//   the value shaping's clock: the gentler step at both ends, so it is symmetric about midday and acts over the widest
//     stretch of the clock (the top loses the day image earliest in the evening).
//   the saturation shaping's clock: the sharper step at both ends, the narrowest stretch (the colour low in the frame
//     deepens last in the evening). The two therefore do not turn together.
function daylightOf(a) { return stepPair(a, stepTurn(), BGW.stepW, BGW.stepW * BGW.stepRatio); }
function shapeVal(a) { return 1 - stepPair(a, stepTurn(), BGW.stepW, BGW.stepW); }
function shapeSat(a) { const w = BGW.stepW * BGW.stepRatio; return 1 - stepPair(a, stepTurn(), w, w); }
// The night images' clock: not warped, one steady turn a day counted from midday (0 at midnight, -pi/2 at 18:00 with the
// light at the left edge, +pi/2 at 06:00 at the right edge, +-pi at midday below the picture).
function nightAngle(hour) { return wrapPi(((hour - 12) / 24) * TAU - Math.PI); }
// The night image's two curves are two of the same products read on that unwarped clock (spec 28): its envelope across the
// night is the gentler step as the evening comes on times the sharper one at dawn (so it comes up gradually and gives way
// quickly), and its shaping down the frame is driven by the gentler step at both ends (nothing at the dead of night, a
// great deal at either end of the night).
function nightEnvelope(a) { return stepPair(a, stepTurn(), BGW.stepW, BGW.stepW * BGW.stepRatio); }
function nightShape(a) { return 1 - stepPair(a, stepTurn(), BGW.stepW, BGW.stepW); }
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
      topV: shapeVal(a), topS: shapeSat(a), anight: nightAngle(12), nightEnv: 0, nightTop: 0, mood: { ...MOODS.day } };
  }
  const p = (day - 1) / daysInMonth(y, mon), [monC, monW] = monthStep(p), a = dayAngle(hour), an = nightAngle(hour);
  return { monA: mon - 1, monB: mon % 12, monC, monW, mid: Math.exp(-Math.pow((p - 0.5) / 0.15, 2)), night: nightWeight(hour),
    aday: a, daylight: daylightOf(a), topV: shapeVal(a), topS: shapeSat(a), anight: an, nightEnv: nightEnvelope(an),
    nightTop: nightShape(an), mood: moodAt(hour) };
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
  // The shapes of the two curves, set by where the sheet has to sit on them (spec 4.5, version 31, which replaces version
  // 17's form of that check). Version 31 states it against the features of each build's own curves, so it is checked with
  // the build's own fresZero and fresTail (tools/measure/geomcheck.js): the typical sample must lie above the Fresnel-like
  // peak on its falling side, more of the sheet must lie beyond the response's half-height point on the falling side than
  // below the matching point on the rising side, and the sheen's cut-off must remove a substantial share of the sheen's
  // light rather than a trace. Version 17's shape constraints still hold: the response is exactly zero below fresZero of
  // the peak, narrow (its width at half height, here 0.48 of the peak's distance from zero, is less than that distance),
  // and falls above the peak in a long thin tail; the sheen's profile stays flat until well past the size factor at which
  // the Fresnel-like peak sits (sheenCut0 is 1.5 times fresPeak / the typical viewing cosine of 0.69, against 1.25 before).
  // Version 31's third warning says one scale cannot satisfy the check, and it could not here: scaling the size factor
  // slides the sheet along both curves together, so the shapes themselves were moved. From the version-17 values
  // (fresPeak 0.12, fresTail 0.1403, sheenCut0 0.2179, sheenCut1 0.599), which gave a typical sample at 0.80 to 1.01 of
  // the peak (below it in three moods of four) and a cut-off that removed 0.06 to 0.13 of the sheen - the "sheet far below
  // the original's" that version 31 says version 17's check passes comfortably - these give 1.13 to 1.43 of the peak, the
  // falling-side share above the rising-side one by 0.11 to 0.31, and a cut-off that removes 0.25 to 0.42.
  sheenCut0: 0.185, sheenCut1: 0.32, // the sheen falls linearly between these size factors (the fused thread profile)
  // the Fresnel-like peak: where it sits in cosine x size factor; zero below fresZero of that; the tail's length above it
  fresPeak: 0.085, fresZero: 0.5961, fresTail: 0.40,
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
// background (spec 19, 23, 28; original design). The picture starts from a fixed share of the image's own value and each
// light adds its own lift on top of that; the two lifts add, and base + spot + glow <= 1 keeps the total from carrying the
// picture past the image's own colour. Day images: base: the fixed share; spot: the sun-like spot's lift, oval (centre x
// amplitude, centre y amplitude: the centre is on the top edge at midday, crosses the bottom edge towards either end of the
// warped daylight hours and is 1 - 2 ovalY below the bottom at midnight) and radii; band: the bottom glow's lift, centre x
// amplitude (mirrored from the spot), half-width, centre height (a little above the bottom edge, spec 28) and half-height;
// bandWide, bandWideW: how much the glow broadens about the middle of the day and how narrow that window of the clock is
// (its half-width x (1 + bandWide x exp(-(angle / bandWideW)^2)), the same once more at the dead of night on the night
// clock); pale: how much paler lit areas get; midSat: the mid-month saturation drop; topDark, topSat: the clock's shaping
// down the frame, proportional in the height (value x exp(-topDark x clock x height), saturation x exp(+topSat x clock x
// height), each clock its own, spec 28). Night images: nightMix: their share at full night weight; nightBase: their fixed
// share; nightFloor: the floor under the lit, enveloped level; nightTop: their level's own proportional shaping up the
// frame, strong at either end of the night.
const BGL = { base: 0.554, spot: 0.226, ovalX: 0.856, ovalY: 0.830, spotW: 0.421, spotH: 0.322,
  glow: 0.152, bandX: 0.365, bandW: 0.365, bandY: 0.040, bandH: 0.259, bandWide: 1.024, bandWideW: 0.111,
  pale: 0.978, midSat: 0.333, topDark: 6.488, topSat: 2.204,
  nightMix: 0.525, nightBase: 0.231, nightFloor: 0.400, nightTop: 0.361 };
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

