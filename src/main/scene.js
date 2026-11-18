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
// Spec 33 names two shapes the description has to be able to hold, and they are
// independent of each other: a bend across the width that is not at the middle
// of it (four columns, the fewest that can put the bend anywhere across the
// width rather than only tilting or arching about the centre), and the knee
// just above the bottom edge, where the picture stays nearly level for a short
// way and then gives way (the rows are therefore placed unevenly, crowded
// towards the bottom edge, rather than spread evenly up the image).
// ---------------------------------------------------------------------------
const BG_GRID_W = 4, BG_GRID_H = 6, BG_NGRID_H = 7;
// How the rows crowd towards the bottom edge: row j of n sits at
// 1 - (1 - j / (n - 1))^BG_GRID_CROWD of the image's height from the top, so
// the lowest gap is about a fifth of the highest.
const BG_GRID_CROWD = 1.6;
function bgGridRows(n) {
  const o = [];
  for (let j = 0; j < n; j++) o.push(1 - Math.pow(1 - j / (n - 1), BG_GRID_CROWD));
  return o;
}
const BG_GRID_ROWS = bgGridRows(BG_GRID_H), BG_NGRID_ROWS = bgGridRows(BG_NGRID_H);
const PALETTES = [
  /*  1 silver      */ { day: [
    0.823, 0.822, 0.822,  0.807, 0.808, 0.796,  0.798, 0.799, 0.785,  0.686, 0.698, 0.680,
    0.793, 0.796, 0.779,  0.743, 0.739, 0.732,  0.775, 0.771, 0.764,  0.757, 0.754, 0.746,
    0.682, 0.680, 0.689,  0.655, 0.652, 0.647,  0.703, 0.687, 0.682,  0.750, 0.730, 0.686,
    0.778, 0.778, 0.772,  0.716, 0.711, 0.710,  0.759, 0.755, 0.755,  0.767, 0.763, 0.763,
    0.868, 0.874, 0.875,  0.877, 0.881, 0.869,  0.873, 0.864, 0.868,  0.830, 0.827, 0.812,
    0.957, 0.942, 0.955,  0.944, 0.941, 0.945,  0.942, 0.917, 0.923,  0.845, 0.847, 0.854
  ], night: [
    0.029, 0.000, 0.006,  0.051, 0.067, 0.035,  0.015, 0.000, 0.000,  0.000, 0.025, 0.000,
    0.066, 0.074, 0.066,  0.080, 0.115, 0.112,  0.085, 0.129, 0.139,  0.174, 0.169, 0.176,
    0.396, 0.396, 0.358,  0.276, 0.323, 0.326,  0.310, 0.374, 0.430,  0.383, 0.578, 0.571,
    0.563, 0.599, 0.604,  0.608, 0.566, 0.573,  0.610, 0.604, 0.618,  0.642, 0.790, 0.824,
    0.824, 0.860, 0.851,  0.910, 0.891, 0.895,  0.947, 0.952, 0.960,  0.991, 0.964, 1.031,
    1.034, 1.066, 1.033,  1.118, 1.116, 1.115,  1.194, 1.179, 1.194,  1.091, 1.141, 1.099,
    1.172, 1.110, 1.184,  1.179, 1.226, 1.260,  1.130, 1.329, 1.248,  1.031, 1.339, 1.313
  ] },
  /*  2 yellow      */ { day: [
    0.803, 0.827, 0.157,  0.806, 0.806, 0.140,  0.810, 0.813, 0.147,  0.812, 0.821, 0.171,
    0.799, 0.776, 0.089,  0.791, 0.716, 0.099,  0.812, 0.736, 0.121,  0.824, 0.807, 0.152,
    0.763, 0.666, 0.071,  0.752, 0.585, 0.033,  0.760, 0.616, 0.062,  0.811, 0.756, 0.169,
    0.809, 0.714, 0.126,  0.794, 0.631, 0.092,  0.824, 0.682, 0.116,  0.845, 0.772, 0.187,
    0.854, 0.761, 0.156,  0.857, 0.718, 0.153,  0.880, 0.762, 0.177,  0.876, 0.804, 0.209,
    0.843, 0.778, 0.171,  0.868, 0.757, 0.176,  0.879, 0.781, 0.197,  0.870, 0.795, 0.206
  ], night: [
    0.111, 0.126, 0.000,  0.131, 0.135, 0.000,  0.130, 0.132, 0.000,  0.162, 0.168, 0.037,
    0.151, 0.171, 0.011,  0.158, 0.150, 0.000,  0.139, 0.150, 0.000,  0.132, 0.116, 0.000,
    0.336, 0.338, 0.072,  0.294, 0.296, 0.004,  0.322, 0.298, 0.057,  0.327, 0.275, 0.087,
    0.617, 0.561, 0.279,  0.624, 0.565, 0.301,  0.658, 0.606, 0.316,  0.659, 0.598, 0.325,
    0.891, 0.783, 0.440,  0.991, 0.926, 0.541,  1.059, 0.995, 0.636,  1.014, 0.967, 0.630,
    1.077, 0.980, 0.599,  1.246, 1.178, 0.762,  1.376, 1.319, 0.944,  1.269, 1.221, 0.895,
    1.242, 1.145, 0.768,  1.338, 1.239, 0.888,  1.434, 1.340, 0.996,  1.424, 1.309, 1.034
  ] },
  /*  3 light green */ { day: [
    0.477, 0.610, 0.123,  0.465, 0.652, 0.128,  0.461, 0.695, 0.116,  0.335, 0.576, 0.088,
    0.499, 0.632, 0.148,  0.419, 0.622, 0.118,  0.422, 0.695, 0.119,  0.435, 0.668, 0.099,
    0.461, 0.590, 0.152,  0.412, 0.619, 0.123,  0.435, 0.643, 0.131,  0.537, 0.728, 0.145,
    0.490, 0.676, 0.183,  0.476, 0.709, 0.157,  0.548, 0.714, 0.175,  0.618, 0.729, 0.160,
    0.523, 0.744, 0.186,  0.581, 0.791, 0.205,  0.630, 0.781, 0.219,  0.653, 0.731, 0.129,
    0.513, 0.760, 0.185,  0.589, 0.814, 0.213,  0.641, 0.786, 0.197,  0.647, 0.733, 0.123
  ], night: [
    0.031, 0.000, 0.004,  0.036, 0.000, 0.058,  0.002, 0.000, 0.015,  0.039, 0.039, 0.010,
    0.013, 0.029, 0.000,  0.036, 0.027, 0.000,  0.000, 0.032, 0.000,  0.017, 0.076, 0.002,
    0.179, 0.296, 0.047,  0.184, 0.268, 0.100,  0.196, 0.252, 0.103,  0.171, 0.342, 0.054,
    0.467, 0.535, 0.276,  0.503, 0.608, 0.353,  0.496, 0.608, 0.341,  0.494, 0.571, 0.289,
    0.690, 0.804, 0.437,  0.819, 0.929, 0.565,  0.810, 0.905, 0.550,  0.705, 0.807, 0.417,
    0.816, 0.976, 0.506,  0.989, 1.145, 0.684,  1.002, 1.145, 0.713,  0.817, 1.028, 0.511,
    1.021, 1.102, 0.532,  1.058, 1.274, 0.716,  1.091, 1.257, 0.822,  0.931, 1.137, 0.697
  ] },
  /*  4 pink        */ { day: [
    0.738, 0.262, 0.468,  0.765, 0.358, 0.515,  0.745, 0.411, 0.516,  0.725, 0.453, 0.532,
    0.778, 0.339, 0.525,  0.794, 0.386, 0.540,  0.765, 0.500, 0.585,  0.783, 0.565, 0.603,
    0.877, 0.404, 0.516,  0.820, 0.464, 0.560,  0.829, 0.547, 0.585,  0.807, 0.671, 0.647,
    0.874, 0.454, 0.587,  0.880, 0.526, 0.610,  0.864, 0.631, 0.678,  0.828, 0.646, 0.680,
    0.913, 0.508, 0.608,  0.956, 0.602, 0.675,  0.921, 0.685, 0.719,  0.885, 0.674, 0.689,
    0.904, 0.524, 0.586,  0.918, 0.595, 0.700,  0.966, 0.679, 0.731,  0.862, 0.669, 0.696
  ], night: [
    0.138, 0.030, 0.113,  0.035, 0.000, 0.007,  0.028, 0.042, 0.005,  0.010, 0.078, 0.019,
    0.173, 0.000, 0.058,  0.193, 0.043, 0.153,  0.198, 0.030, 0.113,  0.199, 0.024, 0.100,
    0.445, 0.187, 0.323,  0.471, 0.137, 0.318,  0.499, 0.101, 0.287,  0.528, 0.106, 0.352,
    0.731, 0.355, 0.626,  0.782, 0.503, 0.601,  0.814, 0.555, 0.628,  0.813, 0.407, 0.678,
    1.097, 0.462, 0.902,  1.100, 0.626, 0.873,  1.183, 0.738, 0.877,  1.141, 0.647, 0.927,
    1.278, 0.498, 1.055,  1.330, 0.874, 1.143,  1.391, 0.936, 1.124,  1.319, 0.709, 1.047,
    1.436, 0.509, 1.287,  1.476, 0.916, 1.237,  1.359, 0.948, 1.194,  1.269, 0.823, 1.185
  ] },
  /*  5 green       */ { day: [
    0.048, 0.395, 0.041,  0.071, 0.435, 0.083,  0.100, 0.509, 0.095,  0.075, 0.546, 0.088,
    0.066, 0.400, 0.064,  0.085, 0.436, 0.089,  0.096, 0.512, 0.080,  0.101, 0.554, 0.080,
    0.064, 0.361, 0.050,  0.081, 0.431, 0.075,  0.076, 0.501, 0.094,  0.092, 0.552, 0.094,
    0.071, 0.396, 0.075,  0.099, 0.451, 0.085,  0.112, 0.546, 0.102,  0.110, 0.590, 0.115,
    0.087, 0.402, 0.078,  0.114, 0.485, 0.106,  0.133, 0.580, 0.137,  0.139, 0.629, 0.127,
    0.099, 0.406, 0.091,  0.142, 0.505, 0.130,  0.146, 0.577, 0.117,  0.163, 0.634, 0.152
  ], night: [
    0.019, 0.085, 0.013,  0.000, 0.118, 0.000,  0.000, 0.147, 0.000,  0.000, 0.146, 0.030,
    0.000, 0.187, 0.076,  0.000, 0.169, 0.000,  0.000, 0.163, 0.015,  0.075, 0.224, 0.070,
    0.058, 0.336, 0.154,  0.023, 0.237, 0.000,  0.021, 0.224, 0.000,  0.000, 0.379, 0.083,
    0.067, 0.287, 0.061,  0.047, 0.253, 0.072,  0.055, 0.375, 0.075,  0.055, 0.458, 0.081,
    0.068, 0.332, 0.047,  0.128, 0.420, 0.153,  0.150, 0.604, 0.181,  0.178, 0.647, 0.170,
    0.072, 0.463, 0.174,  0.206, 0.633, 0.187,  0.231, 0.807, 0.230,  0.285, 0.842, 0.217,
    0.117, 0.546, 0.197,  0.132, 0.584, 0.133,  0.184, 0.749, 0.222,  0.418, 0.877, 0.336
  ] },
  /*  6 lavender    */ { day: [
    0.388, 0.332, 0.594,  0.445, 0.359, 0.728,  0.498, 0.387, 0.830,  0.491, 0.346, 0.812,
    0.429, 0.333, 0.582,  0.497, 0.375, 0.723,  0.564, 0.392, 0.832,  0.567, 0.414, 0.840,
    0.473, 0.324, 0.537,  0.552, 0.380, 0.724,  0.628, 0.409, 0.845,  0.613, 0.443, 0.805,
    0.498, 0.325, 0.570,  0.618, 0.398, 0.755,  0.727, 0.479, 0.867,  0.735, 0.489, 0.817,
    0.550, 0.334, 0.585,  0.694, 0.448, 0.756,  0.791, 0.531, 0.898,  0.782, 0.507, 0.828,
    0.541, 0.355, 0.590,  0.736, 0.420, 0.788,  0.826, 0.513, 0.894,  0.747, 0.586, 0.774
  ], night: [
    0.000, 0.061, 0.000,  0.031, 0.022, 0.000,  0.000, 0.020, 0.000,  0.000, 0.009, 0.003,
    0.000, 0.000, 0.000,  0.039, 0.002, 0.061,  0.050, 0.000, 0.136,  0.000, 0.062, 0.058,
    0.338, 0.258, 0.371,  0.279, 0.174, 0.319,  0.290, 0.167, 0.444,  0.317, 0.214, 0.399,
    0.685, 0.492, 0.706,  0.686, 0.528, 0.802,  0.748, 0.529, 0.857,  0.689, 0.428, 0.768,
    0.934, 0.703, 1.064,  1.037, 0.829, 1.188,  1.075, 0.847, 1.207,  1.054, 0.727, 1.096,
    1.256, 0.840, 1.265,  1.394, 1.038, 1.417,  1.405, 1.053, 1.465,  1.207, 0.976, 1.299,
    1.465, 0.824, 1.433,  1.500, 0.984, 1.500,  1.437, 1.023, 1.500,  1.165, 1.016, 1.500
  ] },
  /*  7 teal        */ { day: [
    0.000, 0.688, 0.689,  0.000, 0.749, 0.758,  0.000, 0.829, 0.830,  0.059, 0.860, 0.851,
    0.000, 0.674, 0.677,  0.000, 0.732, 0.725,  0.020, 0.827, 0.813,  0.050, 0.865, 0.859,
    0.049, 0.622, 0.600,  0.000, 0.719, 0.671,  0.052, 0.802, 0.763,  0.000, 0.835, 0.863,
    0.018, 0.650, 0.586,  0.041, 0.748, 0.672,  0.067, 0.834, 0.782,  0.000, 0.882, 0.842,
    0.000, 0.689, 0.581,  0.061, 0.777, 0.680,  0.073, 0.871, 0.814,  0.097, 0.909, 0.858,
    0.060, 0.671, 0.583,  0.054, 0.780, 0.671,  0.082, 0.883, 0.807,  0.000, 0.922, 0.856
  ], night: [
    0.000, 0.093, 0.133,  0.023, 0.095, 0.084,  0.000, 0.000, 0.071,  0.032, 0.108, 0.136,
    0.021, 0.108, 0.131,  0.025, 0.076, 0.064,  0.000, 0.005, 0.062,  0.030, 0.090, 0.104,
    0.039, 0.168, 0.173,  0.000, 0.141, 0.126,  0.000, 0.176, 0.198,  0.000, 0.242, 0.293,
    0.000, 0.209, 0.216,  0.001, 0.263, 0.235,  0.014, 0.400, 0.388,  0.000, 0.498, 0.480,
    0.000, 0.307, 0.287,  0.027, 0.475, 0.437,  0.000, 0.697, 0.645,  0.007, 0.735, 0.714,
    0.000, 0.467, 0.403,  0.000, 0.647, 0.598,  0.000, 0.858, 0.825,  0.000, 0.908, 0.841,
    0.041, 0.612, 0.553,  0.047, 0.654, 0.626,  0.051, 0.823, 0.815,  0.067, 1.012, 0.809
  ] },
  /*  8 blue        */ { day: [
    0.238, 0.587, 0.799,  0.221, 0.641, 0.820,  0.176, 0.669, 0.822,  0.054, 0.685, 0.833,
    0.162, 0.404, 0.727,  0.144, 0.502, 0.753,  0.095, 0.588, 0.802,  0.024, 0.603, 0.839,
    0.000, 0.141, 0.511,  0.000, 0.265, 0.622,  0.000, 0.387, 0.618,  0.000, 0.517, 0.731,
    0.000, 0.046, 0.358,  0.000, 0.121, 0.465,  0.000, 0.303, 0.600,  0.000, 0.483, 0.771,
    0.000, 0.013, 0.285,  0.002, 0.080, 0.397,  0.000, 0.272, 0.637,  0.000, 0.389, 0.734,
    0.000, 0.047, 0.247,  0.000, 0.122, 0.395,  0.000, 0.240, 0.609,  0.064, 0.340, 0.689
  ], night: [
    0.041, 0.153, 0.439,  0.000, 0.078, 0.335,  0.003, 0.065, 0.147,  0.035, 0.033, 0.000,
    0.000, 0.212, 0.480,  0.008, 0.138, 0.376,  0.006, 0.160, 0.241,  0.000, 0.096, 0.146,
    0.018, 0.323, 0.478,  0.000, 0.228, 0.488,  0.000, 0.213, 0.375,  0.000, 0.141, 0.311,
    0.019, 0.497, 0.653,  0.000, 0.418, 0.636,  0.000, 0.312, 0.555,  0.000, 0.312, 0.563,
    0.000, 0.624, 0.811,  0.000, 0.626, 0.853,  0.004, 0.576, 0.808,  0.000, 0.512, 0.723,
    0.005, 0.703, 0.886,  0.026, 0.814, 0.988,  0.038, 0.827, 1.010,  0.009, 0.714, 0.902,
    0.037, 0.626, 0.958,  0.055, 0.826, 1.072,  0.101, 0.865, 1.087,  0.048, 0.888, 1.026
  ] },
  /*  9 purple      */ { day: [
    0.791, 0.367, 0.842,  0.776, 0.366, 0.820,  0.722, 0.313, 0.768,  0.660, 0.244, 0.724,
    0.808, 0.390, 0.864,  0.750, 0.326, 0.800,  0.695, 0.270, 0.741,  0.651, 0.228, 0.714,
    0.748, 0.330, 0.829,  0.700, 0.286, 0.723,  0.638, 0.229, 0.664,  0.552, 0.234, 0.621,
    0.788, 0.385, 0.848,  0.712, 0.289, 0.742,  0.640, 0.246, 0.664,  0.573, 0.228, 0.615,
    0.811, 0.404, 0.886,  0.746, 0.326, 0.760,  0.636, 0.262, 0.684,  0.542, 0.231, 0.619,
    0.827, 0.403, 0.846,  0.744, 0.325, 0.745,  0.659, 0.272, 0.665,  0.530, 0.232, 0.607
  ], night: [
    0.003, 0.009, 0.058,  0.035, 0.000, 0.000,  0.000, 0.000, 0.004,  0.003, 0.000, 0.000,
    0.016, 0.000, 0.072,  0.119, 0.000, 0.185,  0.035, 0.000, 0.077,  0.046, 0.000, 0.000,
    0.200, 0.019, 0.321,  0.212, 0.000, 0.306,  0.150, 0.000, 0.203,  0.149, 0.000, 0.172,
    0.446, 0.000, 0.682,  0.379, 0.000, 0.521,  0.265, 0.000, 0.385,  0.243, 0.033, 0.320,
    0.570, 0.000, 0.833,  0.504, 0.000, 0.718,  0.393, 0.000, 0.543,  0.272, 0.000, 0.422,
    0.560, 0.031, 0.902,  0.579, 0.000, 0.832,  0.482, 0.000, 0.649,  0.344, 0.076, 0.555,
    0.509, 0.178, 0.843,  0.527, 0.086, 0.755,  0.401, 0.061, 0.709,  0.353, 0.177, 0.727
  ] },
  /* 10 gold        */ { day: [
    0.769, 0.737, 0.000,  0.827, 0.688, 0.000,  0.833, 0.674, 0.000,  0.824, 0.664, 0.058,
    0.853, 0.725, 0.001,  0.855, 0.647, 0.000,  0.852, 0.643, 0.045,  0.863, 0.659, 0.087,
    0.875, 0.685, 0.111,  0.846, 0.634, 0.075,  0.846, 0.605, 0.074,  0.879, 0.645, 0.109,
    0.893, 0.700, 0.081,  0.891, 0.676, 0.103,  0.898, 0.656, 0.089,  0.900, 0.631, 0.065,
    0.923, 0.720, 0.116,  0.936, 0.722, 0.150,  0.960, 0.693, 0.128,  0.928, 0.651, 0.079,
    0.930, 0.731, 0.106,  0.954, 0.725, 0.142,  0.936, 0.702, 0.110,  0.937, 0.624, 0.070
  ], night: [
    0.027, 0.000, 0.009,  0.000, 0.000, 0.047,  0.020, 0.000, 0.050,  0.057, 0.000, 0.000,
    0.167, 0.084, 0.000,  0.138, 0.042, 0.000,  0.142, 0.035, 0.000,  0.117, 0.056, 0.000,
    0.412, 0.169, 0.047,  0.380, 0.158, 0.028,  0.360, 0.151, 0.000,  0.351, 0.118, 0.046,
    0.695, 0.385, 0.000,  0.687, 0.385, 0.000,  0.691, 0.391, 0.031,  0.714, 0.381, 0.039,
    1.030, 0.543, 0.000,  1.106, 0.659, 0.000,  1.109, 0.665, 0.000,  1.053, 0.621, 0.000,
    1.252, 0.651, 0.000,  1.357, 0.836, 0.031,  1.355, 0.873, 0.006,  1.284, 0.797, 0.000,
    1.291, 0.873, 0.107,  1.453, 0.886, 0.000,  1.500, 0.812, 0.000,  1.442, 0.800, 0.132
  ] },
  /* 11 brown       */ { day: [
    0.553, 0.406, 0.174,  0.551, 0.425, 0.166,  0.554, 0.428, 0.155,  0.555, 0.419, 0.161,
    0.534, 0.390, 0.140,  0.542, 0.387, 0.143,  0.534, 0.386, 0.151,  0.522, 0.395, 0.152,
    0.457, 0.314, 0.061,  0.463, 0.294, 0.000,  0.467, 0.304, 0.054,  0.440, 0.309, 0.081,
    0.451, 0.287, 0.087,  0.460, 0.300, 0.026,  0.457, 0.296, 0.048,  0.449, 0.282, 0.069,
    0.460, 0.301, 0.083,  0.498, 0.310, 0.074,  0.488, 0.305, 0.072,  0.467, 0.298, 0.086,
    0.489, 0.308, 0.010,  0.494, 0.318, 0.073,  0.516, 0.303, 0.065,  0.495, 0.299, 0.017
  ], night: [
    0.000, 0.000, 0.035,  0.008, 0.009, 0.060,  0.000, 0.000, 0.045,  0.003, 0.015, 0.031,
    0.000, 0.067, 0.000,  0.122, 0.036, 0.000,  0.098, 0.047, 0.000,  0.093, 0.028, 0.019,
    0.256, 0.134, 0.000,  0.247, 0.122, 0.024,  0.260, 0.139, 0.018,  0.260, 0.149, 0.019,
    0.433, 0.225, 0.000,  0.433, 0.251, 0.000,  0.462, 0.256, 0.000,  0.465, 0.295, 0.000,
    0.551, 0.346, 0.000,  0.593, 0.357, 0.047,  0.640, 0.355, 0.019,  0.641, 0.349, 0.000,
    0.667, 0.392, 0.046,  0.755, 0.456, 0.065,  0.816, 0.458, 0.028,  0.800, 0.398, 0.000,
    0.675, 0.357, 0.099,  0.780, 0.484, 0.069,  0.831, 0.554, 0.064,  0.952, 0.443, 0.000
  ] },
  /* 12 red         */ { day: [
    0.795, 0.242, 0.174,  0.833, 0.287, 0.212,  0.880, 0.287, 0.208,  0.845, 0.245, 0.194,
    0.791, 0.265, 0.188,  0.835, 0.262, 0.205,  0.876, 0.271, 0.202,  0.874, 0.280, 0.203,
    0.794, 0.227, 0.155,  0.842, 0.287, 0.201,  0.865, 0.288, 0.214,  0.817, 0.294, 0.225,
    0.818, 0.280, 0.206,  0.878, 0.299, 0.220,  0.908, 0.307, 0.220,  0.892, 0.294, 0.209,
    0.861, 0.282, 0.209,  0.909, 0.324, 0.224,  0.950, 0.332, 0.252,  0.921, 0.309, 0.219,
    0.831, 0.186, 0.208,  0.951, 0.350, 0.254,  0.956, 0.342, 0.252,  0.900, 0.262, 0.218
  ], night: [
    0.000, 0.020, 0.000,  0.049, 0.029, 0.000,  0.115, 0.000, 0.031,  0.151, 0.023, 0.000,
    0.124, 0.000, 0.000,  0.000, 0.046, 0.000,  0.042, 0.013, 0.034,  0.153, 0.041, 0.008,
    0.138, 0.079, 0.000,  0.010, 0.013, 0.000,  0.147, 0.001, 0.000,  0.357, 0.020, 0.000,
    0.166, 0.014, 0.000,  0.230, 0.078, 0.015,  0.435, 0.099, 0.021,  0.594, 0.070, 0.034,
    0.362, 0.069, 0.053,  0.471, 0.139, 0.124,  0.765, 0.177, 0.065,  0.810, 0.197, 0.030,
    0.566, 0.122, 0.089,  0.725, 0.190, 0.081,  1.005, 0.262, 0.091,  1.011, 0.295, 0.091,
    0.677, 0.101, 0.141,  0.848, 0.235, 0.118,  0.981, 0.258, 0.118,  0.877, 0.279, 0.179
  ] },
];
// size of each generated background image: still low resolution and still read through a smooth upscale, but with enough
// rows to carry the knee the crowded grid rows describe just above the bottom edge (spec 33)
const BG_W = 32, BG_H = 36;

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
// Glare (spec 5, versions 20, 24 and 28): each mood's bright-pass threshold is fixed, in the composite's output units after its
// curve, and the same chain runs in every mood. Placed inside the brackets measured on the original's footage at the bright-pass's
// resolution (tools/measure/brightfoot.py): at dawn and dusk above every background and below the dimmest month's brightest fold;
// at night above the band's brightest folds, so the night is free of halo on the screen.
// By day the bracket is re-read for version 28, which corrects the weeks in which the background glares by itself to the last
// weeks before the turn of the year - the window opens in the second half of November and is over well before New Year - so
// January's background must **not** pass. On the original's footage January's day background reaches 0.698 and 0.702 at the
// bright-pass's resolution, the highest of the four months there, and the dimmest day band is April's 0.744, which leaves
// 0.70 to 0.74 for the day threshold; 0.72 is the middle of it. Version 24 was read the other way - the threshold was put at
// 0.68, between July's background and January's, so that January glared - and that is the reading version 28 withdraws.
// Version 28 adds that the night's threshold is the **lowest** of the four in the original, and that the night is free of halo
// because the night band never comes near even that - not because the threshold is out of reach. On the original's footage the
// night band reaches 0.527 to 0.592 at the bright-pass's resolution and the night background 0.21 to 0.34 (brightfoot.py over
// the eight night clips), so the window for a night threshold that is both the lowest of the four and above every night fold is
// 0.60 to the day's 0.68; 0.64 is the middle of it. It was 0.9, the highest of the four, which version 28 names as the right
// answer by the wrong route.
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
// waveBright, the mood's own wave brightness, is that per-mood scale on the two shading terms, and spec 4.5 (version 31)
// keeps it apart from the gain because the screen does: the gain multiplies the background and the wave together, this
// multiplies the wave alone. It is fitted on version 31's observable - the band's added light integrated down each column
// over the band's extent, divided by the fitted background under the band at the same column, which the gain very nearly
// cancels out of (tools/measure/bandlevel.py, bandlevelset.py), per mood against footage of that mood, over the index's
// 15 or 16 conditions of each mood hold at 5 moments each. Against the footage of the same conditions the ratio now comes
// out at 1.007 (dawn), 1.043 (day) and 0.970 (dusk) of the original's, from 1.213, 1.074 and 1.509 before this round, and
// the share of band pixels at the top output level at dusk - the ceiling that ends that observable - from 0.038 to 0.0024,
// the footage's own 0.0024. The night is fitted on the band's added light itself instead (1.001 of the original's) and not
// on the ratio: at night the ratio's denominator is the night background under the band, which is 7.9 levels in the
// original's night recordings and 25 in mine (and scatters from 0.69 to 1.74 of the original's over the noise clips as the
// band sweeps the night gradient), so the ratio there would absorb a background error into the wave's brightness.
// Version 31 says the original's wave brightness is lowest by day, a little above that at night, clearly higher at dusk and
// highest of all at dawn, against gains in the opposite order. By the light these values actually deliver over the sheet
// (geomcheck.js's dump through the two curves) this build now gives day 0.039 < dusk 0.051 < night 0.054 < dawn 0.056: the
// day lowest and the dawn highest as version 31 has it, with the night and dusk the other way round and 5 % apart, which
// is inside what the observable can tell on this build. Before this round the order was day < night < dawn < dusk.
const MOODS = {
  night: { waveBright: 0.216, base: 1.6, fres: 1.7, sizeK: 0.54,
    latX: 1.00, latY: 0.92, latZ: 1.00, envCross: 0.20, camPitch: -10.0, camLift: 0.2745,
    exposure: 1.385, white: 1.0, glareThr: 0.64, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.6,
    focusFar: 4.38, sparkSize: 1.1, sparkBright: 1.0, glint: 0.30 },
  dawn: { waveBright: 0.217, base: 1.8, fres: 1.6, sizeK: 0.6,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.25, camPitch: -15.0, camLift: 0,
    exposure: 1.220, white: 1.0, glareThr: 0.7, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.23, sparkSize: 1.1, sparkBright: 1.0, glint: 0.35 },
  day: { waveBright: 0.18, base: 1.2, fres: 2.4, sizeK: 0.6,
    latX: 1.00, latY: 1.00, latZ: 1.00, envCross: 0.28, camPitch: -15.0, camLift: 0,
    exposure: 1.128, white: 0.9, glareThr: 0.72, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.20, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dusk: { waveBright: 0.192, base: 1.8, fres: 1.6, sizeK: 0.54,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.20, camPitch: -15.0, camLift: 0,
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
const BGW = { warp: 0.900, noon: 12.013, stepW: 0.278, stepRatio: 0.770 };
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
// Spec 34: where that step sits and how broad it is are fitted from footage like anything else, so the five numbers that
// place it are in BGL - the centre climbs in a straight line from monC0 (below the bottom edge) to monC1 (above the top
// edge) between the progresses monP0 and monP1, and the half-width is monW0 away from the middle of the month with a
// further monWMid over a window monWP of the progress wide.
function monthStep(p) {
  const c = BGL.monC0 + (BGL.monC1 - BGL.monC0) * Math.min(Math.max((p - BGL.monP0) / (BGL.monP1 - BGL.monP0), 0), 1);
  return [c, BGL.monW0 + BGL.monWMid * Math.exp(-Math.pow((p - 0.5) / BGL.monWP, 2))];
}
// How far the mid-month lowering of the saturation reaches through the month (spec 34): it is plainly there several days
// either side of the middle, dies away only gradually towards the month's ends, and even on the first and last days a
// trace of it survives, so it is a broad bell of breadth midW standing on a floor midTrace rather than a bell that
// returns to nothing. Its depth is BGL.midSat; this is its breadth, and the two are fitted together against the bottom
// band's saturation through the days of one month.
function midMonth(p) {
  return BGL.midTrace + (1 - BGL.midTrace) * Math.exp(-Math.pow((p - 0.5) / BGL.midW, 2));
}
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

function sceneParams(tp, theme) {
  const [y, mon, day, hh, mm, ss] = tp;
  const hour = hh + mm / 60 + ss / 3600;
  if (theme >= 1 && theme <= 12) { // month n's palette at midday at the start of month n, day mood
    const a = dayAngle(BGW.noon);
    return { monA: theme - 1, monB: theme % 12, monC: -5, monW: 0.15, mid: midMonth(0), night: 0, aday: a, daylight: daylightOf(a),
      topV: shapeVal(a), topS: shapeSat(a), anight: nightAngle(12), nightEnv: 0, nightTop: 0, mood: { ...MOODS.day } };
  }
  const p = (day - 1) / daysInMonth(y, mon), [monC, monW] = monthStep(p), a = dayAngle(hour), an = nightAngle(hour);
  return { monA: mon - 1, monB: mon % 12, monC, monW, mid: midMonth(p), night: nightWeight(hour),
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
// times the footage covers (40 s to 30 minutes) the original's band centre runs from 0.41 to 0.70 H with a mean of 0.564, which
// is also 4.6's median of about 0.57. Spec 30: the sizes of the warp's slow parts are fitted first and the aim only after them,
// because a course of the right typical height with too little reach is their business and not the aim's. After that fit the
// build's course had the original's reach but sat 0.042 H high in the mean, so every mood's aim went 3.0 degrees more negative
// (0.0141 H a degree, measured: more negative puts the band lower on the screen), and 1.0 degree more again when the swell's
// wavelength was fitted. The band's centre over the twelve times is then 0.5646 against the footage's 0.5644, with nothing else
// in the picture moved; the battery's rendered centre over the 19 recording and render conditions is 0.451 against 0.427.
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
// background (spec 19, 23, 28, 34; original design). The picture starts from a fixed share of the image's own value and
// each light adds its own lift on top of that; the two lifts add, and nothing is clamped anywhere (spec 34). What keeps
// the picture from passing the image's own colour is the geometry rather than any clamp: the two lights travel across the
// width as mirrors of each other, so when either is near the middle of the width the other is at the top edge or below
// the bottom, and the most the picture is ever carried to is base plus a single light's lift. base + max(spot, glow) < 1
// therefore holds here with room to spare, and the fit is held to settings where the true maximum of base + the two
// lights' total over the frame and the whole day stays under 1, so no clamp is ever wanted.
// That share is one and the same for the day picture and for the night picture (spec 34): both arms start from base and
// add the same two lifts at the same strengths and widths, and they differ only in the clock that drives their lights and
// their curves, in the floor under the night level, and in that the day arm's lifts also pale the saturation.
// Day images: base: the fixed share, shared with the night arm; spot: the sun-like spot's lift, oval (centre x
// amplitude, centre y amplitude: the centre is on the top edge at midday, crosses the bottom edge towards either end of the
// warped daylight hours and is 1 - 2 ovalY below the bottom at midnight) and radii; band: the bottom glow's lift, centre x
// amplitude (mirrored from the spot), half-width, centre height (a little above the bottom edge, spec 28) and half-height;
// bandWide, bandWideW: how much the glow broadens about the middle of the day and how narrow that window of the clock is
// (its half-width x (1 + bandWide x exp(-(angle / bandWideW)^2)), the same once more at the dead of night on the night
// clock); pale: how much paler lit areas get; midSat: the depth of the mid-month saturation drop, midW and midTrace its
// breadth and the trace of it that survives the month's ends (spec 34, monthStep and midMonth above, where monC0, monC1,
// monP0, monP1, monW0, monWMid and monWP place the month handover's step and set how broad it is).
// heightRate (spec 33): the one rate in the height. Every fall of this kind in the background falls off at it, and only
// the clock driving each differs - the day image's value shaping (value x exp(-heightRate x shapeVal x height)), the day
// image's saturation raise (x (1 + satCeil x (1 - exp(-heightRate x shapeSat x height))), the same fall read the other way
// up, levelling off towards the ceiling 1 + satCeil near the top instead of growing without limit) and the night image's
// own shaping up the frame (x exp(-heightRate x nightShape x height)). So there is one rate here for the whole
// background, fitted where the footage pins it - the day image's value - with the other two following it; satCeil is the
// ceiling, read from the saturation of a band across the middle of the frame against one at the bottom.
// Night images: nightMix: their share at full night weight; the unlit share is base, as above. nightFloorF: the floor
// under the night level, as a share of that unlit share, so the floor always lies below the share the lighting starts
// from (spec 34) and cannot stand over the whole frame and swallow the light and the shaping with it. It is applied
// last, to the whole of the night level (after the envelope, the shaping and the lighting, spec 33), so wherever it
// binds the night picture is flat all the way up the frame - which, the floor being under the share, is only the upper
// part of the frame towards either end of the night, where the shaping has already brought the level down.
const BGL = { base: 0.508, spot: 0.195, ovalX: 0.853, ovalY: 0.796, spotW: 0.462, spotH: 0.373,
  glow: 0.149, bandX: 0.437, bandW: 0.491, bandY: 0.044, bandH: 0.316, bandWide: 1.123, bandWideW: 0.037,
  pale: 1.695, midSat: 0.300, midW: 0.30, midTrace: 0.12, heightRate: 7.794, satCeil: 0.598,
  monC0: -0.20, monC1: 1.20, monP0: 0.20, monP1: 0.85, monW0: 0.15, monWMid: 3.00, monWP: 0.10,
  nightMix: 0.563, nightFloorF: 0.710 };
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

