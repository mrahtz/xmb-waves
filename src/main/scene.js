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
    0.825, 0.819, 0.816,  0.809, 0.805, 0.790,  0.800, 0.796, 0.779,  0.688, 0.696, 0.675,
    0.792, 0.791, 0.771,  0.743, 0.735, 0.725,  0.774, 0.766, 0.756,  0.756, 0.749, 0.739,
    0.679, 0.673, 0.682,  0.651, 0.645, 0.641,  0.700, 0.680, 0.675,  0.746, 0.723, 0.679,
    0.772, 0.768, 0.763,  0.711, 0.702, 0.703,  0.753, 0.745, 0.746,  0.761, 0.753, 0.754,
    0.858, 0.861, 0.865,  0.867, 0.868, 0.859,  0.863, 0.851, 0.858,  0.821, 0.815, 0.803,
    0.943, 0.926, 0.942,  0.931, 0.925, 0.933,  0.929, 0.901, 0.911,  0.833, 0.834, 0.842
  ], night: [
    0.018, 0.000, 0.004,  0.032, 0.042, 0.022,  0.009, 0.000, 0.000,  0.000, 0.016, 0.000,
    0.041, 0.047, 0.042,  0.050, 0.072, 0.070,  0.053, 0.081, 0.087,  0.109, 0.106, 0.111,
    0.248, 0.249, 0.225,  0.173, 0.203, 0.205,  0.194, 0.235, 0.271,  0.239, 0.364, 0.359,
    0.352, 0.377, 0.380,  0.380, 0.356, 0.361,  0.381, 0.380, 0.389,  0.401, 0.497, 0.519,
    0.515, 0.541, 0.536,  0.569, 0.561, 0.563,  0.592, 0.599, 0.604,  0.619, 0.607, 0.649,
    0.646, 0.671, 0.650,  0.699, 0.702, 0.702,  0.746, 0.742, 0.751,  0.682, 0.718, 0.692,
    0.733, 0.699, 0.745,  0.737, 0.772, 0.793,  0.706, 0.836, 0.785,  0.644, 0.843, 0.826
  ] },
  /*  2 yellow      */ { day: [
    0.787, 0.829, 0.084,  0.800, 0.797, 0.085,  0.798, 0.807, 0.075,  0.792, 0.805, 0.125,
    0.791, 0.757, 0.091,  0.792, 0.699, 0.050,  0.807, 0.735, 0.063,  0.823, 0.796, 0.129,
    0.745, 0.656, 0.059,  0.741, 0.566, 0.007,  0.751, 0.610, 0.000,  0.779, 0.755, 0.097,
    0.795, 0.702, 0.085,  0.791, 0.611, 0.040,  0.811, 0.649, 0.081,  0.847, 0.747, 0.131,
    0.846, 0.737, 0.124,  0.840, 0.703, 0.125,  0.863, 0.742, 0.134,  0.856, 0.776, 0.167,
    0.842, 0.737, 0.112,  0.857, 0.719, 0.141,  0.864, 0.771, 0.164,  0.856, 0.781, 0.197
  ], night: [
    0.000, 0.038, 0.018,  0.072, 0.070, 0.020,  0.087, 0.068, 0.000,  0.111, 0.139, 0.025,
    0.113, 0.117, 0.000,  0.109, 0.095, 0.000,  0.107, 0.080, 0.006,  0.087, 0.082, 0.026,
    0.235, 0.162, 0.000,  0.237, 0.192, 0.000,  0.200, 0.219, 0.030,  0.223, 0.272, 0.082,
    0.440, 0.404, 0.209,  0.440, 0.385, 0.227,  0.450, 0.444, 0.234,  0.460, 0.416, 0.208,
    0.609, 0.605, 0.275,  0.635, 0.598, 0.352,  0.630, 0.581, 0.384,  0.568, 0.558, 0.365,
    0.643, 0.597, 0.367,  0.726, 0.670, 0.460,  0.775, 0.715, 0.521,  0.713, 0.687, 0.529,
    0.723, 0.574, 0.341,  0.757, 0.734, 0.472,  0.817, 0.794, 0.546,  0.805, 0.798, 0.568
  ] },
  /*  3 light green */ { day: [
    0.468, 0.605, 0.150,  0.448, 0.659, 0.080,  0.438, 0.701, 0.087,  0.325, 0.584, 0.064,
    0.478, 0.626, 0.000,  0.396, 0.622, 0.109,  0.412, 0.691, 0.079,  0.391, 0.659, 0.080,
    0.446, 0.574, 0.098,  0.381, 0.618, 0.085,  0.415, 0.634, 0.081,  0.506, 0.747, 0.094,
    0.472, 0.675, 0.139,  0.455, 0.700, 0.119,  0.523, 0.711, 0.145,  0.593, 0.720, 0.133,
    0.489, 0.727, 0.143,  0.562, 0.798, 0.185,  0.613, 0.764, 0.200,  0.629, 0.718, 0.095,
    0.488, 0.750, 0.156,  0.574, 0.802, 0.174,  0.626, 0.779, 0.179,  0.653, 0.720, 0.080
  ], night: [
    0.000, 0.000, 0.001,  0.000, 0.054, 0.000,  0.000, 0.040, 0.016,  0.000, 0.000, 0.063,
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.068, 0.145, 0.000,
    0.185, 0.236, 0.107,  0.123, 0.187, 0.089,  0.107, 0.228, 0.051,  0.164, 0.293, 0.000,
    0.320, 0.352, 0.141,  0.311, 0.374, 0.226,  0.327, 0.374, 0.223,  0.331, 0.397, 0.129,
    0.394, 0.387, 0.205,  0.476, 0.553, 0.325,  0.468, 0.570, 0.340,  0.438, 0.510, 0.313,
    0.502, 0.588, 0.300,  0.559, 0.628, 0.404,  0.594, 0.659, 0.433,  0.533, 0.576, 0.337,
    0.611, 0.779, 0.411,  0.575, 0.692, 0.432,  0.586, 0.762, 0.466,  0.492, 0.672, 0.410
  ] },
  /*  4 pink        */ { day: [
    0.795, 0.259, 0.424,  0.819, 0.307, 0.449,  0.793, 0.370, 0.463,  0.753, 0.433, 0.469,
    0.837, 0.299, 0.460,  0.839, 0.340, 0.488,  0.814, 0.456, 0.541,  0.800, 0.535, 0.577,
    0.812, 0.346, 0.504,  0.838, 0.441, 0.552,  0.824, 0.546, 0.598,  0.811, 0.630, 0.641,
    0.886, 0.419, 0.545,  0.878, 0.498, 0.589,  0.869, 0.603, 0.654,  0.856, 0.637, 0.673,
    0.900, 0.467, 0.569,  0.956, 0.553, 0.679,  0.936, 0.649, 0.701,  0.885, 0.636, 0.683,
    0.910, 0.476, 0.581,  0.950, 0.608, 0.651,  0.946, 0.655, 0.712,  0.898, 0.611, 0.671
  ], night: [
    0.113, 0.006, 0.011,  0.000, 0.000, 0.000,  0.000, 0.038, 0.000,  0.016, 0.000, 0.000,
    0.112, 0.000, 0.042,  0.122, 0.095, 0.095,  0.145, 0.077, 0.082,  0.144, 0.045, 0.072,
    0.386, 0.089, 0.081,  0.448, 0.207, 0.186,  0.431, 0.183, 0.221,  0.487, 0.219, 0.275,
    0.528, 0.317, 0.378,  0.541, 0.391, 0.427,  0.597, 0.406, 0.406,  0.588, 0.305, 0.356,
    0.634, 0.479, 0.555,  0.675, 0.466, 0.532,  0.715, 0.547, 0.610,  0.729, 0.504, 0.584,
    0.804, 0.541, 0.613,  0.775, 0.636, 0.644,  0.807, 0.672, 0.661,  0.758, 0.598, 0.632,
    1.070, 0.445, 0.621,  0.869, 0.612, 0.706,  0.830, 0.577, 0.696,  0.782, 0.539, 0.532
  ] },
  /*  5 green       */ { day: [
    0.051, 0.384, 0.012,  0.033, 0.442, 0.034,  0.036, 0.507, 0.046,  0.039, 0.556, 0.024,
    0.000, 0.395, 0.049,  0.062, 0.436, 0.016,  0.056, 0.521, 0.036,  0.062, 0.563, 0.052,
    0.081, 0.369, 0.030,  0.047, 0.428, 0.033,  0.031, 0.491, 0.029,  0.055, 0.557, 0.060,
    0.036, 0.402, 0.057,  0.072, 0.462, 0.061,  0.081, 0.543, 0.075,  0.069, 0.588, 0.069,
    0.054, 0.408, 0.051,  0.074, 0.490, 0.087,  0.089, 0.584, 0.101,  0.095, 0.613, 0.093,
    0.089, 0.389, 0.047,  0.119, 0.461, 0.102,  0.103, 0.582, 0.111,  0.105, 0.611, 0.106
  ], night: [
    0.000, 0.083, 0.000,  0.000, 0.044, 0.027,  0.006, 0.045, 0.000,  0.056, 0.222, 0.027,
    0.000, 0.139, 0.000,  0.024, 0.101, 0.009,  0.000, 0.139, 0.047,  0.041, 0.189, 0.091,
    0.020, 0.226, 0.000,  0.046, 0.167, 0.000,  0.000, 0.129, 0.013,  0.032, 0.174, 0.000,
    0.045, 0.220, 0.074,  0.000, 0.124, 0.044,  0.015, 0.251, 0.090,  0.049, 0.354, 0.005,
    0.000, 0.201, 0.027,  0.107, 0.312, 0.093,  0.095, 0.336, 0.059,  0.112, 0.380, 0.010,
    0.069, 0.314, 0.063,  0.113, 0.323, 0.123,  0.147, 0.457, 0.149,  0.155, 0.545, 0.162,
    0.056, 0.287, 0.040,  0.081, 0.360, 0.087,  0.097, 0.448, 0.138,  0.184, 0.548, 0.282
  ] },
  /*  6 lavender    */ { day: [
    0.368, 0.307, 0.599,  0.434, 0.343, 0.724,  0.479, 0.345, 0.822,  0.466, 0.349, 0.811,
    0.412, 0.313, 0.580,  0.481, 0.335, 0.728,  0.534, 0.373, 0.840,  0.553, 0.367, 0.813,
    0.408, 0.288, 0.533,  0.562, 0.350, 0.725,  0.618, 0.392, 0.826,  0.592, 0.381, 0.820,
    0.493, 0.305, 0.579,  0.614, 0.371, 0.738,  0.714, 0.440, 0.858,  0.724, 0.463, 0.820,
    0.540, 0.310, 0.588,  0.693, 0.399, 0.774,  0.803, 0.501, 0.895,  0.767, 0.491, 0.836,
    0.532, 0.328, 0.591,  0.708, 0.397, 0.793,  0.803, 0.487, 0.910,  0.818, 0.497, 0.836
  ], night: [
    0.000, 0.060, 0.059,  0.000, 0.000, 0.016,  0.035, 0.000, 0.000,  0.019, 0.000, 0.008,
    0.000, 0.000, 0.017,  0.000, 0.032, 0.000,  0.084, 0.000, 0.082,  0.083, 0.000, 0.109,
    0.232, 0.114, 0.286,  0.203, 0.113, 0.294,  0.209, 0.098, 0.281,  0.184, 0.090, 0.310,
    0.421, 0.297, 0.531,  0.468, 0.339, 0.503,  0.485, 0.359, 0.537,  0.480, 0.295, 0.547,
    0.626, 0.399, 0.688,  0.601, 0.457, 0.684,  0.658, 0.509, 0.750,  0.708, 0.502, 0.741,
    0.724, 0.472, 0.754,  0.788, 0.613, 0.822,  0.784, 0.587, 0.873,  0.817, 0.578, 0.802,
    0.797, 0.520, 0.823,  0.803, 0.597, 0.888,  0.846, 0.646, 0.847,  0.739, 0.542, 0.836
  ] },
  /*  7 teal        */ { day: [
    0.000, 0.680, 0.680,  0.000, 0.731, 0.761,  0.000, 0.819, 0.823,  0.000, 0.857, 0.870,
    0.000, 0.655, 0.674,  0.000, 0.736, 0.728,  0.000, 0.827, 0.825,  0.026, 0.869, 0.845,
    0.000, 0.635, 0.619,  0.000, 0.698, 0.677,  0.000, 0.793, 0.737,  0.000, 0.819, 0.853,
    0.000, 0.651, 0.576,  0.000, 0.737, 0.660,  0.000, 0.829, 0.778,  0.022, 0.867, 0.827,
    0.000, 0.666, 0.570,  0.023, 0.763, 0.653,  0.040, 0.866, 0.784,  0.011, 0.898, 0.841,
    0.000, 0.638, 0.546,  0.000, 0.764, 0.662,  0.041, 0.867, 0.798,  0.051, 0.878, 0.833
  ], night: [
    0.000, 0.080, 0.108,  0.000, 0.018, 0.000,  0.000, 0.000, 0.059,  0.000, 0.128, 0.085,
    0.010, 0.000, 0.067,  0.006, 0.032, 0.061,  0.025, 0.000, 0.061,  0.000, 0.048, 0.092,
    0.000, 0.224, 0.177,  0.011, 0.058, 0.024,  0.000, 0.110, 0.100,  0.000, 0.130, 0.160,
    0.008, 0.152, 0.136,  0.000, 0.197, 0.183,  0.000, 0.261, 0.251,  0.000, 0.313, 0.334,
    0.000, 0.192, 0.212,  0.000, 0.296, 0.265,  0.000, 0.411, 0.383,  0.015, 0.465, 0.427,
    0.023, 0.241, 0.257,  0.000, 0.358, 0.357,  0.000, 0.521, 0.459,  0.026, 0.494, 0.565,
    0.048, 0.315, 0.305,  0.000, 0.395, 0.306,  0.061, 0.480, 0.460,  0.004, 0.547, 0.487
  ] },
  /*  8 blue        */ { day: [
    0.142, 0.567, 0.802,  0.155, 0.613, 0.809,  0.144, 0.688, 0.811,  0.000, 0.673, 0.830,
    0.097, 0.402, 0.707,  0.080, 0.480, 0.758,  0.041, 0.559, 0.799,  0.000, 0.612, 0.829,
    0.000, 0.133, 0.502,  0.000, 0.263, 0.617,  0.000, 0.366, 0.629,  0.000, 0.539, 0.728,
    0.000, 0.030, 0.350,  0.000, 0.105, 0.461,  0.000, 0.294, 0.587,  0.000, 0.446, 0.750,
    0.000, 0.013, 0.272,  0.000, 0.063, 0.399,  0.032, 0.245, 0.640,  0.000, 0.366, 0.715,
    0.000, 0.032, 0.261,  0.000, 0.070, 0.400,  0.010, 0.217, 0.605,  0.055, 0.325, 0.681
  ], night: [
    0.000, 0.109, 0.234,  0.000, 0.073, 0.200,  0.017, 0.056, 0.111,  0.000, 0.000, 0.000,
    0.000, 0.138, 0.299,  0.000, 0.081, 0.237,  0.000, 0.072, 0.161,  0.000, 0.054, 0.129,
    0.000, 0.162, 0.389,  0.005, 0.196, 0.341,  0.000, 0.130, 0.279,  0.000, 0.046, 0.187,
    0.000, 0.312, 0.477,  0.000, 0.302, 0.435,  0.000, 0.241, 0.376,  0.007, 0.204, 0.364,
    0.000, 0.404, 0.505,  0.000, 0.426, 0.532,  0.050, 0.325, 0.480,  0.000, 0.312, 0.457,
    0.000, 0.459, 0.533,  0.000, 0.533, 0.604,  0.125, 0.497, 0.564,  0.128, 0.396, 0.535,
    0.008, 0.473, 0.630,  0.148, 0.455, 0.665,  0.168, 0.465, 0.573,  0.159, 0.559, 0.553
  ] },
  /*  9 purple      */ { day: [
    0.771, 0.359, 0.847,  0.757, 0.325, 0.818,  0.702, 0.276, 0.771,  0.645, 0.225, 0.717,
    0.780, 0.359, 0.852,  0.748, 0.313, 0.797,  0.686, 0.254, 0.743,  0.638, 0.196, 0.697,
    0.740, 0.330, 0.798,  0.689, 0.257, 0.719,  0.632, 0.189, 0.666,  0.585, 0.213, 0.573,
    0.775, 0.334, 0.850,  0.707, 0.268, 0.731,  0.628, 0.210, 0.664,  0.559, 0.189, 0.620,
    0.799, 0.358, 0.875,  0.745, 0.290, 0.760,  0.641, 0.242, 0.677,  0.547, 0.204, 0.600,
    0.738, 0.359, 0.897,  0.743, 0.292, 0.767,  0.651, 0.227, 0.681,  0.525, 0.167, 0.612
  ], night: [
    0.000, 0.044, 0.047,  0.033, 0.000, 0.140,  0.000, 0.000, 0.068,  0.019, 0.000, 0.046,
    0.118, 0.013, 0.302,  0.090, 0.021, 0.142,  0.046, 0.000, 0.058,  0.000, 0.000, 0.000,
    0.174, 0.000, 0.331,  0.137, 0.015, 0.235,  0.142, 0.000, 0.165,  0.000, 0.000, 0.023,
    0.305, 0.002, 0.484,  0.241, 0.000, 0.339,  0.180, 0.000, 0.233,  0.101, 0.000, 0.162,
    0.355, 0.000, 0.508,  0.281, 0.000, 0.420,  0.211, 0.000, 0.319,  0.162, 0.000, 0.260,
    0.330, 0.000, 0.536,  0.329, 0.018, 0.471,  0.217, 0.000, 0.363,  0.160, 0.011, 0.279,
    0.336, 0.011, 0.515,  0.343, 0.024, 0.388,  0.254, 0.059, 0.305,  0.191, 0.098, 0.372
  ] },
  /* 10 gold        */ { day: [
    0.788, 0.718, 0.000,  0.822, 0.689, 0.000,  0.833, 0.645, 0.000,  0.815, 0.651, 0.000,
    0.863, 0.730, 0.000,  0.843, 0.631, 0.000,  0.855, 0.604, 0.000,  0.857, 0.638, 0.031,
    0.847, 0.674, 0.025,  0.851, 0.628, 0.000,  0.832, 0.577, 0.000,  0.885, 0.628, 0.052,
    0.885, 0.680, 0.022,  0.880, 0.643, 0.057,  0.886, 0.634, 0.048,  0.895, 0.609, 0.000,
    0.907, 0.687, 0.056,  0.939, 0.715, 0.132,  0.939, 0.674, 0.089,  0.924, 0.630, 0.022,
    0.900, 0.704, 0.091,  0.938, 0.700, 0.086,  0.932, 0.663, 0.076,  0.905, 0.635, 0.000
  ], night: [
    0.022, 0.000, 0.000,  0.000, 0.000, 0.057,  0.047, 0.000, 0.000,  0.000, 0.000, 0.007,
    0.097, 0.001, 0.000,  0.052, 0.000, 0.000,  0.045, 0.009, 0.000,  0.098, 0.000, 0.000,
    0.357, 0.122, 0.085,  0.223, 0.068, 0.000,  0.220, 0.000, 0.000,  0.294, 0.089, 0.000,
    0.547, 0.281, 0.071,  0.480, 0.264, 0.003,  0.485, 0.267, 0.032,  0.496, 0.235, 0.032,
    0.649, 0.433, 0.085,  0.705, 0.431, 0.012,  0.708, 0.437, 0.008,  0.683, 0.377, 0.033,
    0.873, 0.539, 0.070,  0.862, 0.554, 0.000,  0.840, 0.523, 0.000,  0.804, 0.490, 0.049,
    0.889, 0.467, 0.002,  0.974, 0.496, 0.018,  0.919, 0.457, 0.000,  0.992, 0.407, 0.103
  ] },
  /* 11 brown       */ { day: [
    0.547, 0.399, 0.088,  0.552, 0.402, 0.114,  0.539, 0.399, 0.129,  0.548, 0.379, 0.165,
    0.533, 0.365, 0.113,  0.542, 0.370, 0.089,  0.530, 0.386, 0.118,  0.531, 0.389, 0.122,
    0.445, 0.308, 0.060,  0.466, 0.276, 0.065,  0.448, 0.302, 0.078,  0.478, 0.289, 0.042,
    0.446, 0.273, 0.037,  0.469, 0.285, 0.063,  0.468, 0.281, 0.044,  0.442, 0.263, 0.053,
    0.469, 0.270, 0.061,  0.485, 0.306, 0.058,  0.493, 0.295, 0.068,  0.460, 0.256, 0.056,
    0.462, 0.297, 0.075,  0.494, 0.289, 0.091,  0.501, 0.279, 0.072,  0.471, 0.261, 0.098
  ], night: [
    0.101, 0.013, 0.000,  0.000, 0.009, 0.000,  0.004, 0.002, 0.023,  0.000, 0.000, 0.043,
    0.060, 0.008, 0.000,  0.117, 0.054, 0.000,  0.062, 0.048, 0.004,  0.001, 0.000, 0.000,
    0.154, 0.086, 0.000,  0.197, 0.088, 0.033,  0.253, 0.116, 0.005,  0.192, 0.135, 0.000,
    0.278, 0.140, 0.006,  0.263, 0.144, 0.000,  0.290, 0.157, 0.000,  0.299, 0.189, 0.000,
    0.324, 0.149, 0.008,  0.352, 0.182, 0.025,  0.349, 0.200, 0.044,  0.348, 0.182, 0.000,
    0.359, 0.238, 0.000,  0.387, 0.238, 0.002,  0.411, 0.239, 0.032,  0.422, 0.245, 0.021,
    0.358, 0.172, 0.116,  0.410, 0.221, 0.074,  0.443, 0.254, 0.079,  0.451, 0.301, 0.024
  ] },
  /* 12 red         */ { day: [
    0.767, 0.231, 0.160,  0.832, 0.241, 0.165,  0.861, 0.248, 0.189,  0.844, 0.252, 0.159,
    0.787, 0.220, 0.161,  0.840, 0.242, 0.168,  0.878, 0.253, 0.166,  0.855, 0.237, 0.164,
    0.760, 0.178, 0.110,  0.828, 0.238, 0.154,  0.845, 0.233, 0.145,  0.831, 0.250, 0.158,
    0.806, 0.240, 0.157,  0.877, 0.261, 0.178,  0.905, 0.263, 0.188,  0.872, 0.241, 0.159,
    0.837, 0.260, 0.169,  0.920, 0.305, 0.224,  0.941, 0.303, 0.223,  0.897, 0.274, 0.178,
    0.801, 0.275, 0.166,  0.941, 0.297, 0.220,  0.955, 0.321, 0.209,  0.887, 0.212, 0.176
  ], night: [
    0.056, 0.000, 0.000,  0.024, 0.040, 0.000,  0.016, 0.000, 0.018,  0.128, 0.057, 0.000,
    0.083, 0.000, 0.015,  0.000, 0.000, 0.000,  0.039, 0.000, 0.000,  0.045, 0.000, 0.044,
    0.114, 0.002, 0.000,  0.043, 0.000, 0.000,  0.068, 0.000, 0.025,  0.144, 0.003, 0.000,
    0.063, 0.000, 0.000,  0.140, 0.058, 0.000,  0.288, 0.061, 0.030,  0.407, 0.074, 0.000,
    0.129, 0.073, 0.043,  0.281, 0.084, 0.055,  0.465, 0.114, 0.036,  0.547, 0.104, 0.023,
    0.238, 0.089, 0.056,  0.407, 0.085, 0.000,  0.619, 0.154, 0.000,  0.664, 0.171, 0.091,
    0.402, 0.012, 0.000,  0.449, 0.127, 0.081,  0.642, 0.091, 0.062,  0.552, 0.158, 0.063
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
// (geomcheck.js's dump through the two curves) this build now gives day 0.040 < dusk 0.056 < night 0.059 < dawn 0.062: the
// day lowest and the dawn highest as version 31 has it, with the night and dusk the other way round and 5 % apart, which
// is inside what the observable can tell on this build. Before this round the order was day < night < dawn < dusk.
// Re-fitted for version 36, which says this fit goes stale whenever the sheet or the camera moves and that the figure must
// be averaged over a stretch long enough that it stops depending on where the stretch starts. How long that is was
// established rather than assumed (tools/measure/bandlevelwin.py, over every window of a given length): on the longest
// footage of one condition - the 30 s lossless render of 15 October 12:00 at 240 s - the band's added light over a 10 s
// window, which is all any clip of the index is, still spreads 8 % between windows, and 4 % over 20 s; on this build at the
// same condition over 120 s it spreads 46 % over a 10 s window, 19 % over 30 s and 10 % over 60 s, because this band
// breathes about twice as hard as the original's (frame to frame 17 % against the footage's 8 %), which version 36 says is
// the sheet's motion showing up in a look measurement and not this value's business. The index's twelve noise clips of a
// condition, spread over 40 s to 30 minutes, are therefore the stretch this is fitted on: 120 s of one condition sampled
// across half an hour, whose standard error comes to about 3 %.
// On that footage the shading change above left the day 37 % over on the ratio (1.374 +- 0.060, nine standard errors),
// and the other three moods inside one and a half standard errors of matched (night 0.937 +- 0.049 on the added light,
// dawn 0.995 +- 0.039, dusk 0.963 +- 0.035), so only the day moved: 0.18 -> 0.137, which brings its ratio to 1.003 +-
// 0.044. Version 36's extension of the first caution - that the denominator carries the background's own gradient and so
// the band's own placement, and that where the two sides' backgrounds under the band disagree the fit must be made on the
// added light instead - is reported on both sides by bandlevelset.py compare: the background under the band is 0.97 of
// the footage's by day, 1.00 at dawn, 0.99 at dusk and 1.09 at night, so the ratio is the measurement in the three
// daylight moods and the night is still read on the added light.
// base and fres are the mood's balance between the two shading terms and sizeK its scale of the size factor.
// The balance keeps spec 4.5's order: by day the Fresnel-like term is clearly the stronger (2.4 against 1.8, a third
// more), at night the two are close (1.7 against 1.6), and at dawn and dusk the sheen is slightly the stronger (1.8
// against 1.6). The day's sheen was raised from 1.2 for version 36, which says that sentence is about the two per-mood
// strengths and not about where the light ends up: with the Fresnel-like response as narrow as it is, most of the sheet's
// light must still be the sheen's in every mood, the day included, and a build that reads it the other way gets a band of
// separate strands with the background between them. At 1.2 the day's own figures were that picture exactly - face level
// 0.001 against the footage's 0.180, fold-to-face 1071 against 5.7, 2.6 partings a column against 0.8 - and the sheen was
// only 0.62 of the day's sheet light against 0.76 to 0.79 in the other moods; it is now 0.74, and rendering each term
// alone confirms where each lands (the Fresnel-like term alone gives a face level of 0.00 and 4 to 7 px lines in every
// mood, the sheen alone fills the night's faces to 0.33). What the balance will not do is buy face level: lowering the
// day's fres to 1.7 left its face level at 0.001, which is version 36's own pricing of a gain-like move.
// sizeK is slightly lower at night and at dusk than by day and at dawn, as spec 4.5 asks, and nearly the same in all
// four moods, as version 36 says the original's is. Night's 0.54 -> 0.585 and dusk's 0.54 -> 0.555 are the re-check
// version 36 asks for after a change to the shared cut-off: the curve is one curve that every mood reads, the night's
// faces were already right before the change and overshot after it (face level 0.357 against 0.279, its brightest line
// 56 px against 23), and raising its scale slides its sheet back up the one curve. The day's would want to go the other
// way and may not, because spec 4.5's order forbids it; that is where the day's remaining face-level gap sits.
const MOODS = {
  night: { waveBright: 0.216, base: 1.6, fres: 1.7, sizeK: 0.585,
    latX: 1.00, latY: 0.92, latZ: 1.00, envCross: 0.20, camPitch: -10.0, camLift: 0.2745,
    exposure: 1.385, white: 1.0, glareThr: 0.64, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.6,
    focusFar: 4.38, sparkSize: 1.1, sparkBright: 1.0, glint: 0.30 },
  dawn: { waveBright: 0.217, base: 1.8, fres: 1.6, sizeK: 0.6,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.25, camPitch: -15.0, camLift: 0,
    exposure: 1.223, white: 1.0, glareThr: 0.7, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.23, sparkSize: 1.1, sparkBright: 1.0, glint: 0.35 },
  day: { waveBright: 0.137, base: 1.8, fres: 2.4, sizeK: 0.6,
    latX: 1.00, latY: 1.00, latZ: 1.00, envCross: 0.28, camPitch: -15.0, camLift: 0,
    exposure: 1.131, white: 0.9, glareThr: 0.72, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.20, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dusk: { waveBright: 0.192, base: 1.8, fres: 1.6, sizeK: 0.555,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.20, camPitch: -15.0, camLift: 0,
    exposure: 1.346, white: 1.0, glareThr: 0.785, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
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
const BGW = { warp: 0.900, noon: 12.031, stepW: 0.280, stepRatio: 0.816 };
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
  // Version 36 names the shape of this cut-off as the strongest and cheapest lever on the band's face level and withdraws
  // version 24's conclusion that no shape of the two responses can tell the band's faces from the picture outside it: the
  // sheen fills the faces and the Fresnel-like term makes the folds. Read mood by mood (tools/measure/looksweep.py), this
  // build had version 36's first fault in three moods of four - the folds at the right level and the faces empty, the
  // fold-to-face ratio far above the original's, more partings and more peaks in a column - and the faint light just
  // outside the band short in the same three moods (skirt.py), which version 36 says makes the move free of cost there.
  // So where the fall starts and how long it runs were fitted on that table against the footage's own figures at the four
  // mood holds, scored against the range the original shows for each measure (lookscore.py): sheenCut0 0.185 -> 0.205 and
  // sheenCut1 0.32 -> 0.35, which takes the lane's per-mood score from 0.927 to 0.355 ranges. Further than that the dark
  // moods' bands fuse: at 0.25 / 0.50 the day's face level comes right (0.187 against 0.180) but the night's brightest
  // line goes to 59 px against the footage's 23 and its broad sheen to 52 against 24, so the cut-off's useful range here
  // ends well before the day's face level is matched. The night, whose faces were already right, overshoots at the new
  // shape, and version 36 says to expect that and to re-check the per-mood size scale after it, which is what night's
  // and dusk's sizeK below do.
  sheenCut0: 0.205, sheenCut1: 0.35, // the sheen falls linearly between these size factors (the fused thread profile)
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
const BGL = { base: 0.517, spot: 0.195, ovalX: 0.853, ovalY: 0.775, spotW: 0.421, spotH: 0.352,
  glow: 0.144, bandX: 0.447, bandW: 0.482, bandY: 0.046, bandH: 0.314, bandWide: 1.104, bandWideW: 0.030,
  pale: 1.391, midSat: 0.300, midW: 0.346, midTrace: 0.110, heightRate: 8.418, satCeil: 0.655,
  monC0: -0.356, monC1: 1.372, monP0: 0.215, monP1: 0.804, monW0: 0.193, monWMid: 4.638, monWP: 0.158,
  nightMix: 0.535, nightFloorF: 0.867 };
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

