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
    0.775, 0.742, 0.679,  0.720, 0.734, 0.679,  0.683, 0.717, 0.671,  0.635, 0.677, 0.649,
    0.660, 0.698, 0.669,  0.662, 0.703, 0.678,  0.667, 0.713, 0.679,  0.678, 0.735, 0.676,
    0.539, 0.568, 0.604,  0.572, 0.606, 0.613,  0.592, 0.630, 0.632,  0.616, 0.658, 0.676,
    0.570, 0.555, 0.645,  0.606, 0.582, 0.596,  0.633, 0.608, 0.605,  0.671, 0.653, 0.680,
    0.610, 0.632, 0.716,  0.688, 0.644, 0.651,  0.734, 0.678, 0.658,  0.781, 0.761, 0.739,
    0.632, 0.674, 0.756,  0.737, 0.687, 0.691,  0.794, 0.729, 0.698,  0.848, 0.832, 0.784
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.025, 0.020,  0.014, 0.027, 0.023,  0.058, 0.000, 0.006,
    0.068, 0.066, 0.010,  0.142, 0.128, 0.123,  0.198, 0.151, 0.178,  0.278, 0.150, 0.215,
    0.432, 0.291, 0.276,  0.495, 0.316, 0.376,  0.551, 0.357, 0.440,  0.643, 0.442, 0.516,
    0.833, 0.606, 0.590,  0.910, 0.642, 0.711,  0.959, 0.678, 0.797,  1.016, 0.739, 0.910,
    1.107, 0.831, 0.816,  1.171, 0.868, 0.947,  1.203, 0.902, 1.037,  1.230, 0.958, 1.153,
    1.370, 1.068, 1.072,  1.392, 1.090, 1.196,  1.402, 1.127, 1.274,  1.409, 1.207, 1.366,
    1.500, 1.208, 1.223,  1.500, 1.221, 1.342,  1.500, 1.260, 1.413,  1.500, 1.353, 1.491
  ] },
  /*  2 yellow      */ { day: [
    0.700, 0.808, 0.084,  0.824, 0.795, 0.011,  0.841, 0.766, 0.000,  0.764, 0.700, 0.024,
    0.890, 0.642, 0.000,  0.863, 0.629, 0.021,  0.858, 0.642, 0.019,  0.872, 0.689, 0.000,
    0.897, 0.594, 0.000,  0.820, 0.572, 0.017,  0.805, 0.618, 0.044,  0.839, 0.766, 0.090,
    0.900, 0.796, 0.160,  0.866, 0.736, 0.202,  0.865, 0.739, 0.223,  0.899, 0.810, 0.237,
    0.959, 0.860, 0.282,  0.904, 0.824, 0.317,  0.875, 0.800, 0.314,  0.852, 0.771, 0.271,
    0.984, 0.880, 0.344,  0.919, 0.869, 0.366,  0.870, 0.830, 0.350,  0.799, 0.737, 0.283
  ], night: [
    0.000, 0.245, 0.000,  0.028, 0.138, 0.000,  0.050, 0.142, 0.012,  0.076, 0.262, 0.060,
    0.010, 0.174, 0.012,  0.008, 0.193, 0.006,  0.007, 0.197, 0.004,  0.008, 0.192, 0.004,
    0.092, 0.252, 0.058,  0.045, 0.299, 0.020,  0.042, 0.318, 0.003,  0.080, 0.323, 0.000,
    0.354, 0.501, 0.289,  0.361, 0.591, 0.245,  0.361, 0.616, 0.209,  0.356, 0.593, 0.155,
    0.556, 0.719, 0.460,  0.613, 0.817, 0.437,  0.630, 0.846, 0.415,  0.618, 0.829, 0.377,
    0.775, 0.987, 0.632,  0.888, 1.062, 0.658,  0.937, 1.098, 0.678,  0.957, 1.120, 0.710,
    0.904, 1.145, 0.734,  1.051, 1.207, 0.789,  1.118, 1.247, 0.835,  1.157, 1.293, 0.907
  ] },
  /*  3 light green */ { day: [
    0.515, 0.725, 0.055,  0.625, 0.856, 0.109,  0.645, 0.881, 0.117,  0.589, 0.819, 0.082,
    0.558, 0.778, 0.146,  0.652, 0.889, 0.194,  0.670, 0.913, 0.202,  0.626, 0.866, 0.174,
    0.597, 0.832, 0.255,  0.643, 0.890, 0.277,  0.657, 0.908, 0.283,  0.649, 0.900, 0.277,
    0.608, 0.849, 0.322,  0.631, 0.877, 0.333,  0.642, 0.892, 0.338,  0.650, 0.905, 0.344,
    0.631, 0.867, 0.371,  0.649, 0.891, 0.381,  0.660, 0.906, 0.387,  0.672, 0.924, 0.394,
    0.646, 0.879, 0.402,  0.663, 0.902, 0.411,  0.675, 0.917, 0.417,  0.689, 0.938, 0.425
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.008, 0.023, 0.001,  0.008, 0.023, 0.001,  0.008, 0.023, 0.001,  0.008, 0.023, 0.001,
    0.107, 0.332, 0.004,  0.107, 0.332, 0.004,  0.107, 0.332, 0.004,  0.107, 0.332, 0.004,
    0.211, 0.570, 0.043,  0.211, 0.570, 0.043,  0.211, 0.570, 0.043,  0.211, 0.570, 0.043,
    0.309, 0.769, 0.095,  0.309, 0.769, 0.095,  0.309, 0.769, 0.095,  0.309, 0.769, 0.095,
    0.424, 0.984, 0.163,  0.424, 0.984, 0.163,  0.424, 0.984, 0.163,  0.424, 0.984, 0.163,
    0.492, 1.109, 0.202,  0.492, 1.109, 0.202,  0.492, 1.109, 0.202,  0.492, 1.109, 0.202
  ] },
  /*  4 pink        */ { day: [
    0.637, 0.116, 0.282,  0.653, 0.176, 0.332,  0.657, 0.239, 0.360,  0.651, 0.350, 0.387,
    0.544, 0.044, 0.418,  0.606, 0.082, 0.417,  0.634, 0.120, 0.405,  0.646, 0.188, 0.375,
    0.606, 0.012, 0.485,  0.678, 0.007, 0.474,  0.696, 0.009, 0.458,  0.672, 0.022, 0.425,
    0.783, 0.101, 0.534,  0.824, 0.083, 0.534,  0.813, 0.069, 0.510,  0.742, 0.048, 0.443,
    0.905, 0.175, 0.597,  0.919, 0.203, 0.605,  0.903, 0.198, 0.559,  0.844, 0.159, 0.424,
    0.973, 0.225, 0.637,  0.974, 0.280, 0.654,  0.959, 0.281, 0.593,  0.917, 0.228, 0.410
  ], night: [
    0.038, 0.000, 0.003,  0.047, 0.001, 0.004,  0.066, 0.001, 0.005,  0.108, 0.000, 0.009,
    0.166, 0.000, 0.086,  0.214, 0.021, 0.101,  0.255, 0.024, 0.106,  0.319, 0.007, 0.105,
    0.343, 0.000, 0.202,  0.457, 0.030, 0.225,  0.521, 0.071, 0.259,  0.581, 0.153, 0.328,
    0.746, 0.022, 0.391,  0.827, 0.065, 0.451,  0.882, 0.115, 0.495,  0.952, 0.208, 0.559,
    1.043, 0.046, 0.531,  1.093, 0.099, 0.599,  1.133, 0.142, 0.645,  1.191, 0.208, 0.701,
    1.349, 0.078, 0.680,  1.365, 0.143, 0.735,  1.379, 0.170, 0.776,  1.398, 0.179, 0.834,
    1.500, 0.097, 0.768,  1.500, 0.169, 0.815,  1.500, 0.187, 0.853,  1.500, 0.161, 0.911
  ] },
  /*  5 green       */ { day: [
    0.057, 0.599, 0.071,  0.025, 0.630, 0.052,  0.009, 0.643, 0.036,  0.000, 0.646, 0.010,
    0.358, 0.656, 0.024,  0.176, 0.754, 0.000,  0.079, 0.824, 0.019,  0.000, 0.919, 0.106,
    0.220, 0.644, 0.000,  0.068, 0.763, 0.000,  0.012, 0.862, 0.021,  0.011, 1.017, 0.100,
    0.091, 0.591, 0.000,  0.014, 0.706, 0.030,  0.002, 0.803, 0.072,  0.045, 0.954, 0.157,
    0.052, 0.526, 0.000,  0.019, 0.627, 0.046,  0.017, 0.713, 0.107,  0.044, 0.850, 0.222,
    0.034, 0.479, 0.000,  0.021, 0.572, 0.052,  0.022, 0.651, 0.123,  0.038, 0.775, 0.262
  ], night: [
    0.017, 0.108, 0.020,  0.004, 0.061, 0.004,  0.000, 0.038, 0.000,  0.002, 0.025, 0.003,
    0.019, 0.361, 0.051,  0.004, 0.316, 0.039,  0.003, 0.320, 0.045,  0.018, 0.376, 0.076,
    0.001, 0.547, 0.073,  0.000, 0.518, 0.111,  0.000, 0.554, 0.139,  0.000, 0.682, 0.180,
    0.030, 0.750, 0.190,  0.048, 0.815, 0.246,  0.065, 0.869, 0.294,  0.094, 0.953, 0.371,
    0.068, 0.899, 0.292,  0.107, 1.019, 0.351,  0.130, 1.087, 0.411,  0.155, 1.156, 0.517,
    0.120, 1.062, 0.413,  0.190, 1.219, 0.469,  0.210, 1.306, 0.540,  0.195, 1.386, 0.677,
    0.150, 1.158, 0.485,  0.240, 1.337, 0.540,  0.258, 1.434, 0.616,  0.220, 1.500, 0.772
  ] },
  /*  6 lavender    */ { day: [
    0.523, 0.309, 0.954,  0.631, 0.389, 1.109,  0.650, 0.402, 1.140,  0.594, 0.358, 1.069,
    0.579, 0.392, 1.006,  0.669, 0.460, 1.137,  0.687, 0.474, 1.165,  0.646, 0.442, 1.114,
    0.628, 0.486, 1.056,  0.674, 0.520, 1.121,  0.688, 0.531, 1.143,  0.681, 0.525, 1.139,
    0.646, 0.538, 1.064,  0.669, 0.558, 1.098,  0.681, 0.568, 1.117,  0.690, 0.575, 1.135,
    0.677, 0.583, 1.080,  0.696, 0.600, 1.108,  0.707, 0.610, 1.127,  0.721, 0.622, 1.149,
    0.698, 0.612, 1.090,  0.715, 0.627, 1.116,  0.727, 0.638, 1.134,  0.743, 0.653, 1.158
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.012, 0.011, 0.021,  0.012, 0.011, 0.021,  0.012, 0.011, 0.021,  0.012, 0.011, 0.021,
    0.166, 0.157, 0.291,  0.166, 0.157, 0.291,  0.166, 0.157, 0.291,  0.166, 0.157, 0.291,
    0.298, 0.284, 0.499,  0.298, 0.284, 0.499,  0.298, 0.284, 0.499,  0.298, 0.284, 0.499,
    0.415, 0.397, 0.671,  0.415, 0.397, 0.671,  0.415, 0.397, 0.671,  0.415, 0.397, 0.671,
    0.546, 0.526, 0.855,  0.546, 0.526, 0.855,  0.546, 0.526, 0.855,  0.546, 0.526, 0.855,
    0.622, 0.601, 0.963,  0.622, 0.601, 0.963,  0.622, 0.601, 0.963,  0.622, 0.601, 0.963
  ] },
  /*  7 teal        */ { day: [
    0.000, 0.463, 0.478,  0.000, 0.513, 0.537,  0.000, 0.543, 0.574,  0.000, 0.575, 0.615,
    0.000, 0.340, 0.426,  0.000, 0.484, 0.526,  0.000, 0.553, 0.583,  0.000, 0.598, 0.641,
    0.000, 0.183, 0.455,  0.000, 0.392, 0.461,  0.002, 0.518, 0.490,  0.008, 0.655, 0.566,
    0.000, 0.274, 0.493,  0.000, 0.447, 0.428,  0.000, 0.562, 0.468,  0.012, 0.704, 0.643,
    0.000, 0.341, 0.473,  0.029, 0.529, 0.485,  0.060, 0.642, 0.547,  0.113, 0.767, 0.705,
    0.000, 0.380, 0.453,  0.056, 0.573, 0.536,  0.109, 0.687, 0.609,  0.195, 0.804, 0.729
  ], night: [
    0.000, 0.000, 0.099,  0.000, 0.070, 0.070,  0.000, 0.086, 0.068,  0.000, 0.042, 0.093,
    0.006, 0.027, 0.227,  0.001, 0.039, 0.205,  0.000, 0.031, 0.188,  0.000, 0.000, 0.164,
    0.003, 0.033, 0.416,  0.000, 0.000, 0.314,  0.002, 0.019, 0.306,  0.008, 0.119, 0.387,
    0.000, 0.001, 0.407,  0.000, 0.000, 0.435,  0.001, 0.046, 0.463,  0.001, 0.190, 0.514,
    0.002, 0.184, 0.617,  0.000, 0.179, 0.623,  0.019, 0.202, 0.627,  0.094, 0.272, 0.633,
    0.000, 0.233, 0.700,  0.045, 0.321, 0.784,  0.088, 0.348, 0.825,  0.157, 0.336, 0.855,
    0.000, 0.261, 0.746,  0.076, 0.403, 0.878,  0.130, 0.433, 0.943,  0.193, 0.371, 0.987
  ] },
  /*  8 blue        */ { day: [
    0.205, 0.892, 1.124,  0.184, 0.977, 1.195,  0.142, 1.026, 1.216,  0.049, 1.079, 1.200,
    0.062, 0.718, 0.956,  0.044, 0.787, 0.942,  0.028, 0.841, 0.971,  0.000, 0.921, 1.063,
    0.000, 0.538, 0.645,  0.000, 0.605, 0.814,  0.000, 0.643, 0.905,  0.000, 0.683, 0.986,
    0.000, 0.378, 0.443,  0.037, 0.410, 0.674,  0.037, 0.464, 0.797,  0.000, 0.582, 0.904,
    0.042, 0.261, 0.377,  0.046, 0.335, 0.582,  0.034, 0.392, 0.702,  0.000, 0.473, 0.826,
    0.086, 0.181, 0.341,  0.047, 0.300, 0.533,  0.024, 0.359, 0.648,  0.000, 0.403, 0.774
  ], night: [
    0.034, 0.295, 0.156,  0.007, 0.070, 0.054,  0.000, 0.000, 0.013,  0.004, 0.000, 0.003,
    0.012, 0.210, 0.119,  0.004, 0.182, 0.095,  0.000, 0.154, 0.067,  0.000, 0.107, 0.012,
    0.004, 0.392, 0.237,  0.000, 0.399, 0.260,  0.019, 0.419, 0.267,  0.081, 0.467, 0.262,
    0.015, 0.622, 0.394,  0.000, 0.648, 0.422,  0.027, 0.633, 0.450,  0.123, 0.568, 0.500,
    0.185, 0.730, 0.530,  0.038, 0.931, 0.675,  0.005, 0.960, 0.734,  0.061, 0.841, 0.752,
    0.231, 0.821, 0.649,  0.080, 1.015, 0.777,  0.026, 1.064, 0.815,  0.029, 1.006, 0.791,
    0.256, 0.873, 0.718,  0.105, 1.061, 0.835,  0.039, 1.122, 0.859,  0.009, 1.101, 0.809
  ] },
  /*  9 purple      */ { day: [
    0.289, 0.118, 0.592,  0.461, 0.238, 0.840,  0.464, 0.240, 0.848,  0.299, 0.125, 0.620,
    0.364, 0.159, 0.693,  0.445, 0.215, 0.809,  0.450, 0.217, 0.818,  0.381, 0.166, 0.724,
    0.496, 0.229, 0.877,  0.511, 0.238, 0.898,  0.517, 0.241, 0.907,  0.517, 0.239, 0.912,
    0.590, 0.280, 0.999,  0.599, 0.286, 1.016,  0.606, 0.289, 1.027,  0.615, 0.292, 1.039,
    0.648, 0.327, 1.056,  0.656, 0.333, 1.072,  0.663, 0.336, 1.084,  0.674, 0.341, 1.099,
    0.682, 0.358, 1.087,  0.691, 0.364, 1.103,  0.698, 0.368, 1.114,  0.709, 0.373, 1.131
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.007, 0.010, 0.039,  0.007, 0.010, 0.039,  0.007, 0.010, 0.039,  0.007, 0.010, 0.039,
    0.094, 0.116, 0.526,  0.094, 0.116, 0.526,  0.094, 0.116, 0.526,  0.094, 0.116, 0.526,
    0.208, 0.240, 0.907,  0.208, 0.240, 0.907,  0.208, 0.240, 0.907,  0.208, 0.240, 0.907,
    0.326, 0.367, 1.170,  0.326, 0.367, 1.170,  0.326, 0.367, 1.170,  0.326, 0.367, 1.170,
    0.468, 0.520, 1.385,  0.468, 0.520, 1.385,  0.468, 0.520, 1.385,  0.468, 0.520, 1.385,
    0.551, 0.609, 1.500,  0.551, 0.609, 1.500,  0.551, 0.609, 1.500,  0.551, 0.609, 1.500
  ] },
  /* 10 gold        */ { day: [
    0.597, 0.618, 0.041,  0.578, 0.569, 0.049,  0.561, 0.529, 0.055,  0.532, 0.467, 0.060,
    0.543, 0.522, 0.030,  0.578, 0.467, 0.006,  0.599, 0.439, 0.024,  0.622, 0.418, 0.097,
    0.491, 0.520, 0.004,  0.561, 0.489, 0.000,  0.611, 0.462, 0.002,  0.679, 0.420, 0.032,
    0.630, 0.635, 0.000,  0.637, 0.609, 0.057,  0.642, 0.573, 0.087,  0.647, 0.498, 0.102,
    0.833, 0.759, 0.059,  0.777, 0.730, 0.172,  0.726, 0.685, 0.201,  0.640, 0.590, 0.167,
    0.968, 0.844, 0.119,  0.871, 0.811, 0.252,  0.784, 0.759, 0.274,  0.640, 0.646, 0.200
  ], night: [
    0.133, 0.015, 0.001,  0.033, 0.002, 0.000,  0.001, 0.000, 0.014,  0.014, 0.000, 0.061,
    0.234, 0.045, 0.000,  0.178, 0.019, 0.000,  0.164, 0.011, 0.001,  0.181, 0.013, 0.003,
    0.440, 0.106, 0.000,  0.429, 0.126, 0.000,  0.427, 0.135, 0.001,  0.431, 0.138, 0.000,
    0.740, 0.330, 0.017,  0.792, 0.390, 0.004,  0.810, 0.416, 0.000,  0.809, 0.425, 0.000,
    0.989, 0.525, 0.026,  1.066, 0.609, 0.022,  1.092, 0.637, 0.017,  1.088, 0.631, 0.005,
    1.292, 0.760, 0.028,  1.348, 0.863, 0.065,  1.367, 0.885, 0.062,  1.363, 0.841, 0.018,
    1.472, 0.899, 0.029,  1.500, 1.014, 0.090,  1.500, 1.031, 0.089,  1.500, 0.965, 0.026
  ] },
  /* 11 brown       */ { day: [
    0.770, 0.377, 0.014,  0.856, 0.441, 0.053,  0.898, 0.498, 0.074,  0.927, 0.593, 0.093,
    0.886, 0.509, 0.010,  0.837, 0.516, 0.112,  0.807, 0.542, 0.110,  0.771, 0.606, 0.005,
    0.802, 0.399, 0.043,  0.750, 0.406, 0.074,  0.709, 0.419, 0.067,  0.648, 0.451, 0.017,
    0.659, 0.311, 0.136,  0.659, 0.322, 0.099,  0.658, 0.339, 0.063,  0.656, 0.373, 0.001,
    0.526, 0.255, 0.115,  0.571, 0.272, 0.053,  0.607, 0.287, 0.022,  0.664, 0.309, 0.000,
    0.438, 0.217, 0.092,  0.510, 0.236, 0.016,  0.570, 0.250, 0.000,  0.662, 0.267, 0.002
  ], night: [
    0.043, 0.010, 0.003,  0.012, 0.007, 0.000,  0.003, 0.008, 0.001,  0.010, 0.011, 0.005,
    0.002, 0.053, 0.024,  0.064, 0.079, 0.004,  0.104, 0.097, 0.007,  0.153, 0.120, 0.035,
    0.097, 0.095, 0.030,  0.179, 0.136, 0.007,  0.242, 0.158, 0.000,  0.332, 0.175, 0.005,
    0.272, 0.177, 0.007,  0.346, 0.212, 0.002,  0.392, 0.226, 0.000,  0.448, 0.231, 0.000,
    0.384, 0.240, 0.004,  0.467, 0.285, 0.005,  0.513, 0.300, 0.003,  0.556, 0.297, 0.000,
    0.485, 0.309, 0.019,  0.596, 0.381, 0.018,  0.656, 0.405, 0.012,  0.708, 0.398, 0.000,
    0.544, 0.349, 0.029,  0.672, 0.438, 0.025,  0.740, 0.467, 0.017,  0.799, 0.458, 0.000
  ] },
  /* 12 red         */ { day: [
    0.769, 0.000, 0.007,  0.898, 0.033, 0.045,  0.923, 0.035, 0.047,  0.863, 0.004, 0.016,
    0.806, 0.028, 0.052,  0.916, 0.068, 0.091,  0.940, 0.073, 0.097,  0.894, 0.047, 0.072,
    0.837, 0.068, 0.106,  0.894, 0.084, 0.124,  0.912, 0.086, 0.127,  0.906, 0.076, 0.120,
    0.840, 0.091, 0.138,  0.869, 0.098, 0.147,  0.884, 0.100, 0.149,  0.896, 0.099, 0.149,
    0.852, 0.127, 0.178,  0.875, 0.132, 0.185,  0.889, 0.134, 0.188,  0.905, 0.135, 0.190,
    0.859, 0.153, 0.204,  0.880, 0.156, 0.211,  0.895, 0.158, 0.215,  0.913, 0.160, 0.219
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.026, 0.002, 0.002,  0.026, 0.002, 0.002,  0.026, 0.002, 0.002,  0.026, 0.002, 0.002,
    0.353, 0.024, 0.005,  0.353, 0.024, 0.005,  0.353, 0.024, 0.005,  0.353, 0.024, 0.005,
    0.607, 0.079, 0.046,  0.607, 0.079, 0.046,  0.607, 0.079, 0.046,  0.607, 0.079, 0.046,
    0.817, 0.144, 0.101,  0.817, 0.144, 0.101,  0.817, 0.144, 0.101,  0.817, 0.144, 0.101,
    1.044, 0.224, 0.173,  1.044, 0.224, 0.173,  1.044, 0.224, 0.173,  1.044, 0.224, 0.173,
    1.176, 0.272, 0.216,  1.176, 0.272, 0.216,  1.176, 0.272, 0.216,  1.176, 0.272, 0.216
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
    latX: 1.00, latY: 0.92, latZ: 1.00, envCross: 0.20, camPitch: -10.0, camLift: 0.2745,
    exposure: 1.385, white: 1.0, glareThr: 0.9, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.6,
    focusFar: 4.38, sparkSize: 1.1, sparkBright: 1.0, glint: 0.30 },
  dawn: { waveBright: 0.20, base: 1.8, fres: 1.6, sizeK: 0.6,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.25, camPitch: -15.0, camLift: 0,
    exposure: 1.220, white: 1.0, glareThr: 0.7, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.23, sparkSize: 1.1, sparkBright: 1.0, glint: 0.35 },
  day: { waveBright: 0.15, base: 1.2, fres: 2.4, sizeK: 0.6,
    latX: 1.00, latY: 1.00, latZ: 1.00, envCross: 0.28, camPitch: -15.0, camLift: 0,
    exposure: 1.128, white: 0.9, glareThr: 0.68, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.20, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dusk: { waveBright: 0.24, base: 1.8, fres: 1.6, sizeK: 0.54,
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
// background (spec 19, 23, 28; original design). The picture starts from a fixed share of the image's own value and each
// light adds its own lift on top of that; the two lifts add, and base + spot + glow <= 1 keeps the total from carrying the
// picture past the image's own colour. Day images: base: the fixed share; spot: the sun-like spot's lift, oval (centre x
// amplitude, centre y amplitude: the centre is on the top edge at midday, crosses the bottom edge towards either end of the
// warped daylight hours and is 1 - 2 ovalY below the bottom at midnight) and radii; band: the bottom glow's lift, centre x
// amplitude (mirrored from the spot), half-width, centre height (a little above the bottom edge, spec 28) and half-height;
// bandWide, bandWideW: how much the glow broadens about the middle of the day and how narrow that window of the clock is
// (its half-width x (1 + bandWide x exp(-(angle / bandWideW)^2)), the same once more at the dead of night on the night
// clock); pale: how much paler lit areas get; midSat: the mid-month saturation drop.
// heightRate (spec 33): the one rate in the height. Every fall of this kind in the background falls off at it, and only
// the clock driving each differs - the day image's value shaping (value x exp(-heightRate x shapeVal x height)), the day
// image's saturation raise (x (1 + satCeil x (1 - exp(-heightRate x shapeSat x height))), the same fall read the other way
// up, levelling off towards the ceiling 1 + satCeil near the top instead of growing without limit) and the night image's
// own shaping up the frame (x exp(-heightRate x nightShape x height)). So there is one rate here for the whole
// background, fitted where the footage pins it - the day image's value - with the other two following it; satCeil is the
// ceiling, read from the saturation of a band across the middle of the frame against one at the bottom.
// Night images: nightMix: their share at full night weight; nightBase: their fixed share; nightFloor: the floor, applied
// last to the whole of the night level (after the envelope, the shaping and the lighting, spec 33), so wherever it binds
// the night picture is flat all the way up the frame.
const BGL = { base: 0.554, spot: 0.226, ovalX: 0.856, ovalY: 0.830, spotW: 0.421, spotH: 0.322,
  glow: 0.152, bandX: 0.365, bandW: 0.365, bandY: 0.040, bandH: 0.259, bandWide: 1.024, bandWideW: 0.111,
  pale: 0.978, midSat: 0.333, heightRate: 6.488, satCeil: 2.090,
  nightMix: 0.525, nightBase: 0.231, nightFloor: 0.400 };
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

