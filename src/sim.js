// Simulation module: the wave's spring net, its free-form deformation, and the
// sparkle pool. Pure JavaScript with no DOM access, so the same source runs in a
// Web Worker (normal mode) and on the main thread (deterministic score mode).
function XMBW_SIM() {
  'use strict';
  const N = 19;            // control grid, N x N points
  const DT = 1 / 60;       // fixed step
  const H = 1 / (N - 1);   // grid spacing in net units (the net is a unit square)

  // ---- tunables (all original design values) ----
  const NET = {
    kStruct: 0.3119, kBend: 2.247,    // spring constants along the length (unit masses); the bending springs are much
                                    // stiffer than the direct ones (eight times; spec 17)
    alongRest: 1.0,                 // rest length of the along-springs relative to the grid spacing: 1.0 keeps the
                                    // sheet smooth; above 1 the slack buckles into standing wrinkles (wirier than the reference)
    acrossK: 0.8382,                 // the across-the-width springs are comparable to the along ones (a little stiffer); with the
                                    // stiffer bending springs this makes the picture hold together longer from second to second
    damping: 0.000139,              // fraction of velocity removed per step: light, a decay time of 120 s, two cycles of the
                                    // slower drive motion (spec 14); folds launched at the shaken end still travel at the free end
    noise: 8e-5,                  // velocity kick per step (std dev). Besides keeping the motion alive, the kicks set how
                                    // many strands the band shows: the across-the-width springs have no linear stiffness at
                                    // rest length, so the kicks drive neighbouring rows apart into separate strands; 3.5e-4 gives
                                    // the reference's 3-4 brightness peaks and about 0.8 dark partings per column, 2e-5 a broad
                                    // ribbon of two or three layers whose lines stand too high above the band; much larger values
                                    // make the net jitter and the fold lines stipple
    push: 0.012,                    // steady gentle pull on the free end, along the length, so the sheet stays extended
    // the drive (spec 14 and 18): smooth and unhurried, each end moving less than a grid spacing (0.056), up-and-down travel
    // clearly larger than the towards-and-away (5:3), which is the faster motion; the damping outlasts two cycles of the
    // slower motion. Nothing on screen shows the drive's own rate (spec 18), so it is set from those relative statements.
    // Spec 22: with the depth offset across the edge at 2.5 times the height offset (as before) the shared path coiled every
    // column of the net into a scroll of two to three turns, seen as one solid tube with a broad sheen and two lines; with
    // the offsets close ("somewhat more", spec 8) and the path a little larger, the sheet folds over itself gently instead
    driveA: 0.05, driveW1: 0.1047,   // driven end: height amplitude, angular frequency (a 60 s cycle)
    driveB: 0.03, driveW2: 0.1571,   // driven end: depth amplitude, angular frequency (a 40 s cycle)
    drivePhase1: 0.4472, drivePhase2: 0.55,  // phase change per row for height and depth: the driven points are strung out along the
                                          // shared path (about 1.3 cycles across the edge in height, 1.6 in depth); the depth offset builds up more
                                          // than the height offset, and that difference between the axes is what makes the folds cross
    driveEase: 0.02,                // easing of the driving clock towards sim time
    // envelope along the length (spec 17, 18): fullest near the shaken end, falling to envLow by the mood's crossover, with a
    // dip of envDip (width envWidth) just past it; moderate and nearly even over the rest, which includes all that is visible.
    // It scales the net's height and depth coordinates about one fixed axis along the length (height 0, depth envAxis: the
    // centre line of the shared driven path), a plain scaling of the shape the net has reached; no rest grid takes part.
    // It does not change the net's motion, so it is not part of the stored state's key
    envLow: 0.95, envDip: 0.15, envWidth: 0.08, envAxis: 0.5,
    warm: 6000,                     // warm-up steps before frame 0, at least. Without a stored state the lightly damped net
                                    // needs several decay times to settle into its running state from the flat start, so the
                                    // warm-up runs warmDecays of them (the first warmSettle steps with heavy damping).
                                    // Spec 26: a changed sheet needs a new warm-up, far longer than three decay times. From the
                                    // flat start the net's own motion still eases off until about 700 s of simulation (its typical
                                    // point speed falls from 1.5e-2 at 400 s to 1.1e-2, and the path it follows along its length
                                    // from 1.27 to 1.15 of the straight line); eight decay times (1000 s) is past that, and the
                                    // checks of 4.4a have stopped trending there (tools/measure/settlecheck.js)
    warmSettle: 1500, warmDecays: 8,
    warmNet: 3600,                  // from the stored state: the net alone for this many steps, then 900 full steps (fixed)
  };
  // Free-form deformation lattice: more cells along the length than across or in depth. Across the width (nw) there are
  // enough cells for the one-cycle twist (spec 18): 7 spans over the lattice's width, about six control values per cycle
  // (with 4 cells there was one span, and the twist's samples, 1.2 apart, aliased into a slow ramp)
  const LAT = { nu: 10, nv: 4, nw: 10,
    spread: 5.614,                    // uneven layout along the length: the cells at the free end are this many times longer than
                                    // at the shaken end (fixed), so the free end of the net covers far more of the scene
    // The vertical displacement is the sum of four slow parts, computed directly from the clock (rates in rad/s). The rates
    // were fitted (spec 18) to the original's 1 s and 5 s picture correlation, the share of the band's motion at its quick
    // and slow ends, the partings' lifetimes, the swell's crossing and the tilt's period (22 s in the footage), measured the
    // same way on the footage and on renders at 23 moments; periods: swell 21 s, twist 22 s, bob 70 s, bump 113 s (the
    // swell's strength 102 s):
    // a wave rolling from the shaken end to the free end, growing along the length, whose strength swells and fades.
    // It is the swell: its crest crossing the screen is the band's slow left-to-right rise and fall
    // (spec 26: its strength changes appreciably within the time one crest takes to cross the screen. The crest advances
    // rollW / (2 pi rollWaves) = 0.042 of the length a second and the screen spans about 0.46 of it, so a crossing takes
    // 11 s; the strength's own period is 31 s, so no two crossings are alike. At the earlier 102 s the strength only crept
    // while a crest travelled and the picture 5 s on was too exactly the reverse of the picture now)
    rollAmp: 0.05, rollGrow: 2.664, rollWaves: 1.141, rollW: 0.3, rollMod: 0.35, rollModW: 0.2,
    // one soft hump sliding back and forth along the length (centre and travel as fractions of the length; part of
    // its travel lies beyond the shaken end, and over the rest it passes over every part of the sheet, including the
    // part at the right of the screen, which the free end reaches (spec 26))
    bumpAmp: 0.10, bumpWidth: 0.25, bumpCentre: 0.3, bumpTravel: 0.72, bumpW: 0.0555,
    // the whole sheet rising and falling together, much more slowly than the swell. Spec 26: the bob is the main carrier
    // of the band's slow wandering over minutes, so it moves the band by more than the bump does (over 10 minutes, by
    // tools/measure/slowparts.js: bob 0.033 H rms, bump 0.022; with the earlier amplitudes the bump led, 0.026 to 0.020)
    bobAmp: 0.045, bobW: 0.09,
    twistAmp: 0.04, twistW: 0.29,  // a gentle ripple, one cycle across the width, travelling across it
    // the four parts' phases at clock 0 (spec 18: fixed, the same at every start, never drawn per run): swell strength, bump,
    // bob, swell, twist. Fitted with tools/measure/phasefit.js to the band's height, tilt and centre speed that the footage
    // shows 40 s and 240 s after the start
    ph: [3.3562, 0.4816, 2.2871, 2.684, 3.8807],
  };
  // Scene mapping of the deformed net (scene units; x along the length, y up, z away).
  const SCENE = { len: 15, x0: 1.9, wid: 7, height: 4.1, y0: 0.05, z0: 0.0, tilt: 0.0 }; // tilt: rise per unit length towards the near end
  // wid, height (spec 22): the scales of the net's gathered width and of its height into the scene. The net is bunched across
  // its width (one shared driven path), so at wid 4.7 the visible surface spanned less depth down a screen column than from left
  // to right: a strip. At 7 the depth across the band is many times the change along the screen and the far width shows;
  // the height (4.1) brings the open sheet's strands (3.4 per column) and its light back into the footage's range

  const SPARK = {
    pool: 2000,
    // births (spec 16): bursts on a large share of the steps, each a fixed batch at random points of the sheet, supply nearly
    // all of them; a single walker leaves a trail along the length, one sparkle every other step, and its births come after
    // the bursts' so they are the ones dropped once the pool is full
    burstP: 0.6, burstN: 12,
    walkers: 1, walkerP: 0.02, walkMin: 40, walkMax: 220, walkStep: 0.045, // patches per step
    cone: 0.6, reverseP: 0.12,                      // cone: half-angle (rad) of the birth cone, deviation spread evenly up to it
    speedK: 0.29, speedPow: 0.5, speedMin: 0.033, // scene units / s: on screen about as fast as the band's lines rise and fall
    rateMean: 1 / 6.5, rateSpread: 0.30, rateMin: 1 / 14, // life per second
    rampIn: 0.04, rampOut: 0.07,                    // short linear ramps of the life (fraction), the fade-in the quicker
    // jitter (spec 17): each sparkle's push, one value per axis, is held for long stretches (redrawn jitterRedraw times per
    // second on average), a small steady acceleration differing from sparkle to sparkle; gravity and friction are weak
    jitter: 0.004, jitterRedraw: 0.3, gravity: 0.0002, friction: 0.03,  // per second units
    // spin (spec 17): the same schedule over every sparkle's life: angular velocity per axis = spinA x
    // sin(2 pi x spinCycles[axis] x life fraction + spinPhase[axis])
    spinA: 2.2, spinCycles: [0.9, 1.4, 0.6], spinPhase: [0.3, 2.1, 4.0],
    box: [[-10, 10], [-6, 6], [-3.5, 9]],          // the bounding box: its faces lie outside the view
    boxFade: 0.8,                                   // sparkles fade out over this distance from the box's faces
  };
  const SPARK_STRIDE = 11; // prev xyz, cur xyz, facing xyz, opacity, random

  function mulberry(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0; let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash32(a) {
    a |= 0; a = (a ^ 61) ^ (a >>> 16); a = Math.imul(a, 9); a ^= a >>> 4;
    a = Math.imul(a, 0x27d4eb2d); a ^= a >>> 15; return a >>> 0;
  }

  // Uniform cubic B-spline basis and derivative.
  function bsp(t, out) {
    const t2 = t * t, t3 = t2 * t, u = 1 - t;
    out[0] = u * u * u / 6; out[1] = (3 * t3 - 6 * t2 + 4) / 6;
    out[2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6; out[3] = t3 / 6;
    return out;
  }

  // Live tuning from the settings menu: values maps dotted paths into the tunables
  // above ('NET.kStruct', 'LAT.rollW', ...) to numbers. Only a number that
  // already exists is set, so a stale or mistyped key does nothing. Sizes fixed at
  // creation (the pool, the lattice cells, the walker count) are not tunable.
  const TUNABLES = { NET, LAT, SCENE, SPARK };
  // Settled starting state of the net, written by tools/mkstate.js from this simulation's own run (positions and
  // velocities, the clocks, and the net constants it was made with). It is used only while those constants are unchanged;
  // otherwise the warm-up settles the net from the flat start.
  const START = {"n":19,"key":"{\"kStruct\":0.3119,\"kBend\":2.247,\"alongRest\":1,\"acrossK\":0.8382,\"damping\":0.000139,\"noise\":0.00008,\"push\":0.012,\"driveA\":0.05,\"driveW1\":0.1047,\"driveB\":0.03,\"driveW2\":0.1571,\"drivePhase1\":0.4472,\"drivePhase2\":0.55,\"driveEase\":0.02}","t":999.2333333327532,"dt":998.4166666660866,"pos":[0,-0.0379465,0.526339,0.0614338,-0.0158642,0.515524,0.110183,-0.00545379,0.497317,0.172598,-0.0199324,0.492051,0.225713,-0.00149664,0.489273,0.281053,0.00400911,0.474786,0.32831,0.0218707,0.461498,0.382106,-0.00849115,0.438342,0.441504,-0.00954623,0.436108,0.498149,-0.0110093,0.430262,0.541371,-0.0611325,0.449396,0.576968,-0.0701999,0.487293,0.627503,-0.0756855,0.514356,0.655728,-0.0716223,0.558643,0.722118,-0.0613497,0.55974,0.75922,-0.0290596,0.57371,0.79992,0.0208761,0.595675,0.857348,0.0347583,0.592793,0.905383,0.0466667,0.572877,0,-0.0482946,0.529961,0.0561889,-0.085401,0.477779,0.102029,-0.0464384,0.481791,0.157549,-0.095078,0.49469,0.206825,-0.0633439,0.468669,0.270841,-0.0671305,0.486026,0.32255,-0.0536021,0.468115,0.37481,-0.0768306,0.478319,0.423823,-0.0656122,0.470805,0.485298,-0.0634943,0.4801,0.53823,-0.0718482,0.516042,0.589946,-0.0654851,0.52798,0.647793,-0.0367308,0.525789,0.698847,-0.0436148,0.541498,0.760451,-0.0306583,0.552123,0.800005,0.00801622,0.559115,0.855587,0.0338717,0.563941,0.901209,0.0656906,0.586919,0.96442,0.0443873,0.568031,0,-0.0491443,0.524746,0.0452317,-0.115025,0.544164,0.104397,-0.103388,0.544708,0.163851,-0.0985678,0.562091,0.215054,-0.0860877,0.551528,0.272226,-0.066828,0.548356,0.330853,-0.0685548,0.538747,0.388406,-0.057231,0.541398,0.440703,-0.0396086,0.537111,0.505144,-0.043985,0.540912,0.554571,-0.00541204,0.540502,0.615551,0.000583222,0.548403,0.666167,0.0162367,0.557499,0.724415,0.0166988,0.536839,0.777956,0.0289918,0.532558,0.829046,0.0600669,0.563985,0.883598,0.0824618,0.545748,0.933567,0.115433,0.55364,0.998077,0.0866171,0.547248,0,-0.0403285,0.512232,0.0570083,-0.0722233,0.577889,0.101986,-0.0396165,0.577285,0.158854,-0.0330703,0.583491,0.214626,-0.0125396,0.566444,0.277575,-0.0114199,0.580263,0.328027,0.0083157,0.557334,0.378834,0.0168909,0.542637,0.438215,0.016748,0.546742,0.504687,0.0202776,0.538664,0.553777,0.0346189,0.542327,0.607431,0.039084,0.518886,0.663063,0.074494,0.536258,0.718628,0.0674559,0.533102,0.779599,0.0720887,0.512394,0.81764,0.104279,0.498803,0.879743,0.117202,0.48352,0.93249,0.114941,0.480299,1.00054,0.106742,0.48665,0,-0.0235809,0.49611,0.0615571,-0.0117442,0.555238,0.107904,0.00892472,0.538535,0.173279,0.0111802,0.553656,0.226652,0.0285486,0.544455,0.285737,0.045809,0.542559,0.33973,0.0515361,0.519876,0.397104,0.0595398,0.527712,0.444667,0.077921,0.519767,0.505678,0.0710405,0.518432,0.548721,0.102086,0.501893,0.612302,0.103569,0.515186,0.663627,0.103521,0.481897,0.720406,0.109079,0.485115,0.778947,0.113887,0.470755,0.827478,0.0973735,0.449963,0.887671,0.113141,0.43772,0.937941,0.105581,0.436144,1.00503,0.109018,0.439342,0,-0.00219555,0.481135,0.0648038,0.0230048,0.514786,0.111789,0.0462792,0.51238,0.176196,0.0518152,0.510869,0.225425,0.0827966,0.50249,0.283446,0.0656206,0.498603,0.342504,0.0895091,0.475562,0.394094,0.0879608,0.471861,0.450656,0.103681,0.463008,0.504675,0.0960264,0.459804,0.564276,0.0937777,0.444855,0.624524,0.0936618,0.435441,0.678963,0.0917461,0.423428,0.737135,0.0988977,0.42582,0.792932,0.0941547,0.40659,0.84446,0.0670496,0.400768,0.909136,0.0828491,0.376508,0.954165,0.0802402,0.374052,1.02985,0.0808019,0.381495,0,0.0196216,0.471725,0.0489017,0.0800465,0.504448,0.0999729,0.0919382,0.465567,0.15727,0.0768722,0.469132,0.218539,0.103599,0.455387,0.27254,0.0943775,0.450211,0.328864,0.0862198,0.418818,0.375743,0.0592619,0.424925,0.440309,0.0619667,0.411138,0.484929,0.0312343,0.425182,0.547427,0.0353714,0.425213,0.603332,0.0407971,0.426624,0.659549,0.0330445,0.398759,0.719919,0.0416612,0.394987,0.773475,0.0263847,0.394238,0.827648,0.0192731,0.372678,0.889461,0.0201726,0.36904,0.940447,0.0296066,0.353939,1.00958,0.0240888,0.367298,0,0.0375797,0.470654,0.0814542,0.108061,0.436842,0.0910171,0.0550159,0.406,0.162953,0.044933,0.399661,0.208436,0.044477,0.404997,0.27301,0.0392585,0.400437,0.334682,0.0233154,0.396689,0.388127,0.00580253,0.411265,0.451453,0.00958151,0.401326,0.495218,-0.0049783,0.415697,0.554212,-0.0146658,0.423741,0.619214,-0.0131899,0.424714,0.675556,-0.0212972,0.414158,0.730388,-0.000501055,0.427207,0.779514,-0.00590289,0.430501,0.828221,-0.0429191,0.399605,0.896851,-0.024264,0.410457,0.941744,-0.0267477,0.393448,1.01599,-0.0178473,0.400075,0,0.0481467,0.478239,0.0707502,0.0166736,0.425758,0.103418,-0.0160179,0.458395,0.176061,-0.01822,0.433222,0.221099,0.00120425,0.457054,0.287491,-0.00635138,0.441204,0.340636,-0.0230731,0.44354,0.39672,-0.0409187,0.44769,0.449884,-0.0464625,0.428992,0.504384,-0.0657698,0.445337,0.563893,-0.0620118,0.444088,0.622079,-0.0685657,0.461756,0.678048,-0.0776738,0.432581,0.728385,-0.0609158,0.447871,0.785459,-0.0670534,0.435865,0.843496,-0.075633,0.433604,0.897943,-0.0681359,0.429438,0.948346,-0.0404184,0.440191,1.00466,-0.0632829,0.425416,0,0.0492443,0.492242,0.0616069,0.00836205,0.472062,0.10837,0.0102858,0.50117,0.170532,-0.0113589,0.488009,0.22214,-0.0146057,0.501196,0.283387,-0.0223987,0.500457,0.337128,-0.0143607,0.50851,0.39418,-0.0408339,0.517299,0.441989,-0.0562752,0.485284,0.48785,-0.0866988,0.495901,0.548211,-0.0957517,0.496858,0.597995,-0.092559,0.507314,0.657204,-0.0956311,0.492606,0.707821,-0.0939707,0.492761,0.767738,-0.094389,0.486065,0.816972,-0.0801468,0.497332,0.877466,-0.093079,0.502644,0.928795,-0.0832625,0.484865,0.994862,-0.0762994,0.487625,0,0.0406567,0.508534,0.0666596,0.02452,0.538045,0.112297,0.0464803,0.547255,0.175014,0.0324855,0.531485,0.227535,0.0440656,0.568292,0.283547,0.0191081,0.554426,0.338852,0.0330873,0.546336,0.389691,0.00693223,0.551872,0.441019,-0.020996,0.526533,0.483615,-0.0418146,0.548018,0.541588,-0.0557073,0.544398,0.595045,-0.0622252,0.564954,0.658834,-0.0558842,0.543304,0.709402,-0.0539027,0.547099,0.767132,-0.0825396,0.54354,0.817975,-0.0552363,0.532439,0.879566,-0.0733722,0.545678,0.921116,-0.0684976,0.554761,0.991368,-0.0399077,0.531286,0,0.0240729,0.522308,0.02674,0.0770228,0.540638,0.0833821,0.100272,0.548837,0.141745,0.0691793,0.562554,0.190298,0.073025,0.557418,0.261067,0.0805192,0.556349,0.298408,0.0628039,0.579657,0.355257,0.0265753,0.605249,0.408058,0.0173219,0.563987,0.454185,-0.0128338,0.569127,0.512802,-0.0196509,0.566044,0.562484,-0.0150518,0.58343,0.62873,-0.0285286,0.575752,0.675556,-0.027961,0.576399,0.739344,-0.0297403,0.566087,0.78497,-0.0298028,0.581656,0.857809,-0.0199672,0.573319,0.900952,-0.02333,0.576482,0.965311,-0.0342575,0.579323,0,0.0027545,0.529503,-0.0285229,0.081199,0.533584,0.0264206,0.0976878,0.487608,0.0827998,0.0813267,0.509186,0.131801,0.0571487,0.526982,0.187613,0.069015,0.551361,0.23991,0.0832607,0.54519,0.283363,0.0394069,0.577939,0.352004,0.0447945,0.559701,0.399547,0.0259029,0.566357,0.462156,0.0215168,0.554928,0.519596,0.014157,0.584901,0.577858,0.00551999,0.562493,0.641471,0.028652,0.585488,0.698833,0.0035573,0.579318,0.760229,0.00963481,0.602333,0.817326,0.0211319,0.590176,0.869238,0.0212938,0.600191,0.928011,0.0247819,0.602987,0,-0.0191057,0.527995,-0.0089721,-0.00183729,0.465986,0.0436878,0.0395897,0.450141,0.0909286,0.018454,0.481241,0.155422,0.020239,0.467493,0.200281,0.0304398,0.492489,0.26435,0.058563,0.480899,0.31605,0.0622293,0.499694,0.374177,0.0850979,0.488735,0.425643,0.0809249,0.517111,0.47895,0.0820681,0.514421,0.532687,0.0789513,0.548523,0.587226,0.079304,0.540762,0.628497,0.0704736,0.577101,0.691269,0.0718859,0.589069,0.742444,0.0721778,0.580208,0.794464,0.0678458,0.545473,0.856255,0.079058,0.582992,0.905276,0.0622689,0.556002,0,-0.0372082,0.518231,0.0343307,0.00393918,0.467127,0.0976241,0.01593,0.465248,0.150016,-0.00422989,0.471325,0.208784,-0.00365616,0.486118,0.2584,0.026438,0.48272,0.312239,0.0211767,0.480495,0.364582,0.0438666,0.498036,0.419069,0.0470992,0.477083,0.472161,0.0388582,0.476296,0.525091,0.0690594,0.488303,0.575454,0.0622874,0.512894,0.628594,0.0863396,0.502001,0.68241,0.0906715,0.511758,0.721237,0.117498,0.558337,0.78275,0.10745,0.544907,0.837902,0.120505,0.565806,0.89156,0.121477,0.551254,0.950158,0.122538,0.559955,0,-0.0479927,0.503089,0.0608972,-0.0375182,0.534775,0.110459,-0.0182558,0.505235,0.171426,-0.0294856,0.534233,0.230008,-0.0488952,0.501134,0.278527,-0.0333638,0.523706,0.33979,-0.0196203,0.523948,0.395233,-0.00986261,0.518616,0.452755,0.00734504,0.49931,0.500326,-0.00053325,0.472519,0.561112,0.013485,0.470132,0.613021,0.010192,0.508745,0.676042,0.0261367,0.488756,0.721362,0.0585293,0.520772,0.781876,0.0710194,0.519022,0.833586,0.0826006,0.51954,0.899095,0.0914763,0.517892,0.947018,0.107802,0.536675,1.01367,0.100711,0.548932,0,-0.0493382,0.487036,0.0504787,-0.0858423,0.518781,0.108063,-0.0855732,0.517802,0.163472,-0.0921861,0.523554,0.216415,-0.083355,0.551143,0.275679,-0.0830218,0.515335,0.337032,-0.0705294,0.52223,0.390484,-0.0483706,0.543718,0.449484,-0.0475559,0.544653,0.496938,-0.0347629,0.542186,0.559342,-0.0195834,0.522828,0.609466,-0.0413095,0.53194,0.673759,-0.0155599,0.515423,0.723477,-0.00212029,0.542294,0.777092,0.0267558,0.544646,0.83443,0.012032,0.522043,0.892251,0.0387045,0.526651,0.944016,0.0422106,0.511865,1.01217,0.0399406,0.518747,0,-0.0409799,0.474807,0.0291866,-0.118213,0.460213,0.0839011,-0.120158,0.492155,0.144932,-0.121787,0.478218,0.189878,-0.146552,0.516322,0.253198,-0.137042,0.53072,0.304087,-0.128472,0.519787,0.362317,-0.111984,0.518769,0.415706,-0.0962243,0.520144,0.474162,-0.0800391,0.548526,0.527833,-0.088015,0.524664,0.581866,-0.0990162,0.523683,0.636553,-0.0616708,0.54043,0.686774,-0.05269,0.52821,0.750246,-0.038352,0.546272,0.799589,-0.0299799,0.532297,0.855314,-0.0108082,0.524762,0.908682,0.0107963,0.505462,0.963655,0.0116826,0.50081,0,-0.0245619,0.470009,0.00402501,-0.100308,0.420628,0.0625988,-0.109216,0.420963,0.0836929,-0.155742,0.476111,0.139573,-0.140865,0.493751,0.201696,-0.165698,0.499597,0.25521,-0.140576,0.497427,0.306063,-0.125131,0.524622,0.374427,-0.127334,0.515918,0.420497,-0.113483,0.513963,0.469207,-0.0835073,0.551579,0.522892,-0.102836,0.555985,0.587475,-0.0912244,0.536135,0.631717,-0.0571454,0.552392,0.697965,-0.0461824,0.516579,0.74384,-0.0473122,0.515379,0.815552,-0.0545734,0.516262,0.859059,-0.0358259,0.519769,0.92155,-0.0170646,0.495168],"vel":[0,0,0,-0.0092363,-0.0009211,-0.012059,-0.0033887,-0.000070648,-0.00060731,-0.0005056,-0.0053385,-0.0019765,-0.0065092,0.00015892,0.019441,-0.012927,-0.01094,-0.002851,-0.010478,0.0034841,0.0041583,0.0025162,-0.0073857,0.01637,0.0049002,0.0002505,0.015111,-0.0045956,0.0081223,0.016202,0.0064992,0.00028913,0.010795,0.0066978,0.0052028,-0.0030606,0.009879,0.0051351,-0.0027276,-0.0049883,0.0098375,-0.012092,-0.011147,0.011118,-0.0065293,0.001186,-0.0068037,-0.0048256,-0.0020058,0.0073924,-0.022989,-0.004196,0.015512,-0.015504,-0.012911,0.012741,-0.012827,0,0,0,0.0070065,0.0048192,0.0017323,0.002577,0.0070042,0.013721,0.0041769,0.00030933,0.033343,-0.0028453,0.0019838,0.017269,0.0098446,0.0038221,0.016237,-0.00084207,0.0012609,0.0032328,0.0001593,-0.0020985,0.02437,0.0016753,-0.0073386,-0.00045824,-0.0021615,-0.0011985,-0.0062624,0.0048215,-0.0040718,0.0077779,0.0083121,0.0065372,0.0081983,-0.0010684,0.0076751,0.0097446,0.001499,-0.013343,-0.0082736,-0.00015206,-0.0032292,0.016002,-0.0098382,0.0054216,0.013028,-0.010914,0.020385,-0.0039395,-0.015134,0.015233,-0.0083407,0.0082124,0.011232,0.010198,0,0,0,-0.0093154,-0.0085279,-0.00061942,-0.0084299,0.013393,0.0043134,-0.0035179,-0.0081637,0.021646,-0.011097,-0.005829,0.0073787,0.0014214,-0.0090518,0.012108,0.0031507,0.017013,0.017306,-0.012822,-0.0011601,0.0031158,-0.0077145,0.012058,0.005893,-0.0078021,-0.0032946,0.008143,-0.013524,0.0097944,-0.007734,-0.00058153,-0.0057101,0.0023334,-0.0082869,0.0078084,0.0074279,-0.0033288,0.0092985,-0.0017308,-0.0096491,0.0091796,0.0010663,-0.0032438,-0.0071993,0.0011485,-0.0018742,0.01303,-0.014215,-0.0088222,0.011514,-0.013546,0.0014572,-0.0035627,0.0066415,0,0,0,-0.011338,-0.0087736,0.013388,-0.0023855,0.011204,0.0026775,-0.010649,-0.0056086,-0.0044129,-0.0067497,0.0083269,0.0038332,-0.011988,-0.0069164,0.00016547,-0.011896,0.014422,0.0032684,-0.0084975,0.0023589,0.0076368,-0.017075,0.01016,-0.0035247,-0.0065466,-0.0029042,-0.0084689,-0.01133,0.011141,-0.004697,0.0019452,-0.0043577,-0.0045819,0.0068078,0.0044929,0.00027012,-0.0076777,0.013302,-0.017255,-0.009453,0.014401,0.00030679,-0.003339,-0.0062269,-0.0071854,-0.0037181,0.0069943,-0.020734,-0.007175,0.0071635,-0.0095959,-0.0029233,-0.00099957,-0.014415,0,0,0,0.0033924,0.010308,-0.0047001,0.0063129,-0.011219,-0.0026478,0.0035098,0.0008452,0.0027595,0.0029809,0.0014261,-0.004466,-0.0057161,0.0026071,-0.014715,-0.0024073,-0.00029807,0.0029454,-0.0022264,-0.0067289,-0.0067649,0.0031478,0.0081003,-0.0044372,-0.016504,0.012179,-0.016341,-0.0021504,-0.0041844,-0.013787,-0.0043111,-0.00056954,-0.005263,-0.00561,0.0012245,-0.0094628,-0.0081052,-0.0055745,-0.0070328,0.0067243,-0.00023243,-0.0080981,0.0010557,-0.0052539,-0.0055646,0.0048963,-0.0097058,-0.016072,-0.0011992,-0.013998,-0.015275,0.0073948,-0.0080152,-0.0038865,0,0,0,0.0027334,0.00050906,0.013892,0.0010287,-0.0061396,0.0014918,-0.0064401,0.010702,-0.010661,0.0039831,-0.0026261,-0.0031631,0.00058388,0.0077936,0.0026693,0.0057834,-0.005073,0.017922,0.001949,0.0054001,-0.0019543,0.014177,-0.0090827,-0.003935,0.0075356,-0.0032021,0.0026931,0.009713,-0.010222,-0.0076135,0.0045555,-0.023661,-0.017338,0.010332,0.0036406,-0.0096723,0.00043207,-0.0067954,0.0026039,0.0054247,-0.0086319,0.0013806,0.0021462,-0.020425,0.014592,0.00029291,-0.019864,0.00065746,-0.00060207,-0.0086924,0.0096796,0.0080618,-0.015422,-0.0091186,0,0,0,-0.0076202,0.0030987,-0.010924,0.010377,-0.0026936,-0.0035354,-0.0036362,0.000060646,-0.00042809,0.0045742,0.0041961,-0.0096254,-0.0014219,0.0086278,0.0022804,0.016595,0.0086578,0.0014576,-0.0063365,-0.0031078,0.0060051,0.0017796,0.0084029,-0.011676,0.0013325,-0.0056842,-0.013763,0.015302,-0.0075338,-0.012616,0.01029,-0.014392,-0.014863,0.012791,-0.012558,-0.010619,0.0058748,-0.014163,0.0022894,0.0025103,-0.0049666,-0.01007,0.011715,-0.022375,-0.017998,0.011553,-0.027287,0.0075558,0.0080076,-0.022796,-0.0091319,0.0035146,-0.015186,-0.012356,0,0,0,0.0046364,0.0054301,0.010905,0.016688,0.0090026,0.0042091,0.015824,-0.0021975,0.0013068,-0.0029327,0.017022,0.012307,-0.00046954,-0.0021397,0.0041921,0.0041676,0.011493,0.002726,0.01326,-0.014405,0.01383,-0.00069374,-0.0071765,-0.0044661,0.022532,-0.0087369,-0.0017352,-0.00091446,-0.015363,-0.010171,0.0083904,-0.02001,-0.000032149,-0.0034772,0.0052441,-0.0015906,-0.0033198,-0.010645,-0.013553,-0.0034132,-0.015781,0.0021504,0.0058223,-0.0047472,0.00023562,-0.0085899,-0.002412,-0.005569,-0.0080182,-0.012484,0.0028226,-0.00038333,-0.014309,0.010016,0,0,0,-0.0011264,0.0010744,-0.005468,-0.0085994,0.0025824,0.0034967,-0.011846,0.00087703,-0.0076638,-0.003649,0.0005684,0.0059384,-0.013989,0.0095654,0.00095865,-0.0088627,-0.003747,0.0047802,-0.0038687,0.00014098,-0.0035238,0.0016319,-0.0052189,0.0077561,-0.0057238,0.0054342,-0.0096341,0.0063729,0.0076022,0.012107,-0.00080851,-0.00094743,-0.0022392,0.0057275,-0.016619,0.0029412,0.0072611,-0.0064029,0.0065532,0.0030573,-0.023168,0.0020917,0.0065276,0.0063149,0.020798,0.0053678,-0.0079381,-0.0027094,-0.0055725,0.015846,-0.005786,0.012868,-0.0084782,-0.0032519,0,0,0,0.0092439,0.007026,0.0045274,-0.0032411,0.0065089,0.0062317,-0.0046961,0.0055382,-0.0067996,-0.0026794,-0.0001646,-0.0048351,-0.0047404,-0.011614,-0.0093607,-0.016522,0.0054189,0.0044851,0.0030436,0.0067098,0.0011867,-0.0021616,0.0062079,0.0014426,0.0043825,0.0017312,0.0027523,-0.010148,0.011603,-0.0096665,0.013597,0.004581,0.0043973,-0.013059,0.0044723,0.0015945,0.0011765,-0.00027561,0.0024103,0.0047514,-0.00099817,0.018525,0.0043299,0.0023661,0.0023056,0.0050331,-0.00011026,-0.0020819,-0.018375,-0.0061581,0.0064416,-0.0046412,-0.014234,0.0011123,0,0,0,0.0095495,-0.0044636,0.0021614,0.014972,-0.0028583,-0.0050537,0.015949,0.0028671,0.0068876,0.001623,-0.0039483,0.01625,0.00021797,0.0032318,0.0038715,-0.0021709,-0.0035421,-0.0022305,-0.0053471,-0.0013569,0.014518,0.010659,0.013434,-0.00097749,-0.0040851,-0.004396,0.00039114,0.0022496,0.0058825,0.0020195,0.014019,-0.00053737,0.011838,0.0088462,0.0076781,0.011121,0.0028761,0.014242,0.015491,0.0068045,0.011822,0.018124,0.0085525,0.0081968,0.0088005,-0.0016713,-0.0063059,0.013456,-0.0010105,0.0044898,0.013641,0.015743,-0.010722,0.010733,0,0,0,-0.0018373,-0.0048383,0.00063381,-0.0091532,-0.01227,0.0081193,-0.00022485,0.0038572,0.0021663,-0.0041277,-0.00041359,0.0014705,-0.000058825,0.0019833,0.0012548,-0.0083085,-0.0078401,0.0042447,-0.0050961,0.013612,-0.0017229,0.0084963,0.0042848,0.002177,0.015846,-0.0022302,0.013321,0.014116,0.0016591,0.0097033,-0.0019646,-0.002213,0.0077312,0.0067211,0.014121,0.0072153,0.0015653,0.013989,0.018617,0.012295,0.001624,-0.0040888,0.0035356,0.018174,-0.00070662,0.006574,0.00096633,-0.005561,0.0010084,0.0065631,0.010514,0.0016959,0.0087904,0.014601,0,0,0,-0.0048974,0.0040998,0.012034,0.0011471,0.002864,-0.013497,0.0084871,-0.01811,0.009472,0.0075058,-0.0086641,-0.00079641,0.0097106,-0.0013663,-0.0011851,0.0022073,0.0019329,-0.0018628,-0.0093391,0.0019613,-0.013428,0.012259,0.0017159,-0.0002624,-0.0094607,-0.0057286,-0.0070333,-0.0043509,0.005272,0.0018446,-0.0082292,0.005491,-0.0012162,-0.000074126,0.0078376,0.011765,0.00044923,0.0034076,0.010572,-0.0049503,0.0096584,-0.0044104,-0.0031581,0.016788,-0.015078,0.00020291,0.0087474,-0.0014833,0.0022848,-0.0020637,-0.0041223,0.00041093,0.01739,-0.0011323,0,0,0,0.0052793,0.0057272,0.0052446,-0.01312,-0.016844,-0.011345,0.0023426,0.0021876,-0.008699,0.00012732,0.0076773,0.0068177,0.0066012,-0.013085,0.0037042,-0.00094254,-0.0017065,-0.0025781,0.0086503,-0.012553,0.002727,0.012688,-0.0090728,0.0037067,-0.0028672,0.0015576,-0.015171,0.0084639,-0.007955,-0.0085338,0.0076063,0.0067164,-0.0040929,0.0027502,0.0051343,-0.012767,0.00072402,0.015902,-0.0025961,0.0022453,0.0096889,0.010651,-0.0017653,0.0068032,-0.0061379,-0.00012382,0.013032,0.00079599,0.000043966,0.0015056,-0.0069865,0.0023181,0.021077,-0.017217,0,0,0,-0.0053451,0.0014905,0.0011409,-0.0084944,-0.0015177,0.00072833,-0.0054806,0.00018133,-0.01666,0.0019802,-0.0014353,0.0085622,0.024453,0.0066698,0.013994,0.0028019,-0.013823,0.013174,-0.0002423,-0.0034037,0.0050346,-0.00063414,-0.018817,-0.008531,0.01316,-0.014987,-0.0083255,0.011009,-0.01473,-0.00044882,0.011308,-0.0058412,-0.0045171,0.0096788,-0.000038891,-0.0030332,-0.0042762,-0.012369,0.00049303,-0.0011678,0.0096073,-0.013787,-0.010041,0.0085765,-0.0061971,0.0089282,0.0048004,-0.0056485,-0.0017158,0.0097526,-0.0086845,-0.0039422,0.008565,-0.0067125,0,0,0,0.012776,-0.00099324,0.0033329,0.0077237,-0.0014113,0.0095845,0.0046963,-0.011369,0.0072459,0.0062034,-0.0019807,0.0072033,-0.0017363,-0.0021081,0.00060567,-0.013481,0.00059653,0.0018815,0.0018962,-0.01284,-0.0031282,0.0032954,-0.0034941,0.012646,-0.0026824,-0.0054972,0.011395,0.015041,-0.0073434,0.017859,-0.01412,-0.013453,-0.010606,0.0066783,-0.001914,-0.0004008,-0.0045949,-0.0095323,-0.0037096,-0.0014079,-0.010408,0.0036782,-0.00060078,0.000013948,-0.0085894,0.0083733,-0.018586,-0.0071826,-0.0065593,0.0044638,-0.013462,0.012478,-0.012445,-0.0073946,0,0,0,0.013106,0.007073,0.002272,0.0085481,-0.0091811,-0.0049851,-0.002025,-0.0011681,0.0098451,-0.012016,-0.020742,0.010485,0.0074679,-0.0037842,0.0043312,-0.010427,-0.0093529,0.013822,0.010941,-0.00075615,-0.0061751,0.0043379,-0.015788,-0.0074792,-0.013171,-0.0088335,-0.00035874,-0.0029692,-0.011832,0.010492,-0.0073351,-0.00058232,0.017413,-0.0040184,0.0018029,0.011193,0.0007883,-0.0019556,0.0010533,0.0011536,0.013772,0.011299,-0.0084583,0.0098651,0.0031644,-0.007458,0.0063442,0.000072635,0.0031718,-0.0017079,-0.014923,0.003236,-0.00087661,-0.010707,0,0,0,-0.0036973,-0.0094457,-0.020968,-0.0090878,-0.00083845,-0.0043955,-0.0010502,0.0028237,-0.01338,-0.0046939,-0.0065738,-0.014212,-0.0076779,0.0051673,-0.0010098,0.0049617,-0.0094444,0.010228,0.0031351,-0.016603,0.00039151,0.0099782,-0.00055434,0.010435,0.0054264,-0.0021106,0.01507,0.0029161,0.0016297,0.016519,0.0015469,0.0025693,0.014034,-0.0019819,0.0016352,0.0054665,-0.0042474,0.0018753,0.013972,-0.0028925,0.0088678,0.00033687,-0.005568,0.0026704,0.0048704,-0.0084334,0.0025686,0.0062074,-0.0057988,0.0084607,0.00093703,-0.017449,0.0097027,-0.0056652,0,0,0,-0.0036397,0.0045842,0.00015645,-0.0002129,0.0090714,-0.0046816,-0.00074928,0.0047371,0.0025164,0.012405,-0.0087951,-0.0075247,-0.0042397,-0.011657,0.0020114,-0.000071329,-0.012287,0.0042311,0.0029365,-0.013366,0.0068751,0.00039512,-0.016288,0.00062497,0.0041576,-0.01424,0.010005,-0.0058303,-0.010744,-0.0035841,0.0013945,-0.011771,0.012684,0.00010406,0.0025734,0.012953,-0.005152,0.0057358,-0.0077935,-0.01137,-0.0030542,-0.00010963,0.0041945,0.0043506,-0.001189,-0.0070708,0.006899,0.012926,0.0051031,0.0029201,0.0023714,0.005754,-0.0067399,0.0080843]};
  // the net constants the stored state depends on (the envelope and the warm-up lengths only act after the net)
  const NOT_KEY = { warm: 1, warmSettle: 1, warmDecays: 1, warmNet: 1, envLow: 1, envDip: 1, envWidth: 1, envAxis: 1 };
  function netKey() { return JSON.stringify(NET, (k, v) => (NOT_KEY[k] ? undefined : v)); }
  function setTunables(values) {
    for (const path in values) {
      const p = path.split('.'); let o = TUNABLES[p[0]];
      for (let i = 1; o != null && i < p.length - 1; i++) o = o[p[i]];
      const k = p[p.length - 1], v = values[path];
      if (o != null && typeof o[k] === 'number' && typeof v === 'number' && isFinite(v)) o[k] = v;
    }
  }

  // Clock value at a fresh (flat) start, and the fixed starting point of the net's nudge generator (spec 18: nothing
  // about the start is drawn per run).
  const CLOCK0 = 0, NET_RNG0 = 0x2f6b1c3d;
  function gaussOf(r) { return () => { let u = r(); if (u < 1e-12) u = 1e-12; return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * r()); }; }
  function createSim(seed, fresh) {
    // Two generators: the net's nudges come from one started at a fixed point, so the sheet's motion and the warp at a
    // given time since the start do not depend on the seed (spec 18); the seed drives the sparkles only.
    const rng = mulberry(hash32(seed ^ 0x5eed1234) ^ 0x9e3779b9);
    const gauss = gaussOf(rng);
    const netGauss = gaussOf(mulberry(NET_RNG0));
    const NP = N * N;
    const pos = new Float64Array(NP * 3), vel = new Float64Array(NP * 3), acc = new Float64Array(NP * 3);
    const rest = new Float64Array(NP * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 3; rest[k] = i * H; rest[k + 1] = 0; rest[k + 2] = j * H;
      pos[k] = rest[k]; pos[k + 2] = rest[k + 2];
    }
    // springs: [a, b, rest, k]
    const springs = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * N + i;
      if (i + 1 < N) springs.push([a, a + 1, H * NET.alongRest, NET.kStruct]);
      if (j + 1 < N) springs.push([a, a + N, H, NET.kStruct * NET.acrossK]);
      if (i + 2 < N) springs.push([a, a + 2, 2 * H * NET.alongRest, NET.kBend]);
      if (j + 2 < N) springs.push([a, a + 2 * N, 2 * H, NET.kBend * NET.acrossK]);
    }
    const SA = Int32Array.from(springs.map(s => s[0])), SB = Int32Array.from(springs.map(s => s[1]));
    const SR = Float64Array.from(springs.map(s => s[2])), SK = Float64Array.from(springs.map(s => s[3]));
    // Re-derive the rest lengths and spring constants from NET after a live change
    // of the tunables (the same order and expressions as above).
    function rebuildSprings() {
      let s = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (i + 1 < N) { SR[s] = H * NET.alongRest; SK[s] = NET.kStruct; s++; }
        if (j + 1 < N) { SR[s] = H; SK[s] = NET.kStruct * NET.acrossK; s++; }
        if (i + 2 < N) { SR[s] = 2 * H * NET.alongRest; SK[s] = NET.kBend; s++; }
        if (j + 2 < N) { SR[s] = 2 * H; SK[s] = NET.kBend * NET.acrossK; s++; }
      }
    }

    // lattice displacement values (vertical)
    const NL = LAT.nu * LAT.nv * LAT.nw;
    const lat = new Float64Array(NL);
    const latPh = LAT.ph;

    let simTime = CLOCK0, driveT = simTime, steps = 0;
    const stored = !fresh && START && START.n === N && START.key === netKey();
    if (stored) {
      for (let k = 0; k < NP * 3; k++) { pos[k] = START.pos[k]; vel[k] = START.vel[k]; }
      simTime = START.t; driveT = START.dt;
    }
    const mood = { envCross: 0.55, latScale: [1, 1, 1], camFwd: [-0.34, -0.12, 0.93] };

    // deformed scene-space nets (previous and current step)
    let netPrev = new Float32Array(NP * 3), netCur = new Float32Array(NP * 3);

    // sparkle pool
    const S = SPARK.pool;
    const sp = new Float64Array(S * 3), sv = new Float64Array(S * 3), spPrev = new Float64Array(S * 3);
    const sq = new Float64Array(S * 4), sAge = new Float64Array(S), sRate = new Float64Array(S);
    const sJit = new Float64Array(S * 3), sRnd = new Float64Array(S);
    const alive = new Uint8Array(S);
    const free = new Int32Array(S); let nFree = S;
    for (let i = 0; i < S; i++) free[i] = S - 1 - i;
    const walkers = [];
    for (let w = 0; w < SPARK.walkers; w++) walkers.push({ on: false, s: 0, t: 0, dir: 1, left: 0 });

    function lattice() {
      const T = simTime, L = LAT;
      const roll = L.rollAmp * (1 + L.rollMod * Math.sin(L.rollModW * T + latPh[0]));
      const ub = L.bumpCentre + L.bumpTravel * Math.sin(L.bumpW * T + latPh[1]);
      const bob = L.bobAmp * Math.sin(L.bobW * T + latPh[2]);
      for (let iw = 0; iw < L.nw; iw++) for (let iv = 0; iv < L.nv; iv++) for (let iu = 0; iu < L.nu; iu++) {
        // the cell's position as a fraction of the net's length (0 at the shaken end) and of its width
        // Cells beyond the sheet's ends take the value at the end (spec 18: held, the parts do not go on growing
        // outside the sheet)
        const fx = Math.min(Math.max((iu - 1) / (L.nu - 3) * 1.2 - 0.1, 0), 1);
        const fz = Math.min(Math.max((iw - 1) / (L.nw - 3) * 1.2 - 0.1, 0), 1);
        const du = (fx - ub) / (0.5 * L.bumpWidth);
        const k = (iw * L.nv + iv) * L.nu + iu;
        lat[k] = roll * (1 + L.rollGrow * fx) * Math.sin(6.2832 * L.rollWaves * fx - L.rollW * T + latPh[3])
          + L.bumpAmp * Math.exp(-du * du) + bob
          + L.twistAmp * Math.sin(6.2832 * fz - L.twistW * T + latPh[4]);
      }
    }
    // fixed uneven layout along the length: net fraction -> scene fraction, cell length growing by 'spread' end to end
    function layout(x) { const a = Math.log(Math.max(LAT.spread, 1.0001)); return Math.expm1(a * x) / Math.expm1(a); }

    const bu = [0, 0, 0, 0], bv = [0, 0, 0, 0], bw = [0, 0, 0, 0];
    function ffd(u, v, w) { // tricubic B-spline blend of lattice values at normalised coords
      const fu = Math.min(Math.max(u, 0), 1) * (LAT.nu - 3), fv = Math.min(Math.max(v, 0), 1) * (LAT.nv - 3), fw = Math.min(Math.max(w, 0), 1) * (LAT.nw - 3);
      const iu = Math.min(Math.floor(fu), LAT.nu - 4), iv = Math.min(Math.floor(fv), LAT.nv - 4), iw = Math.min(Math.floor(fw), LAT.nw - 4);
      bsp(fu - iu, bu); bsp(fv - iv, bv); bsp(fw - iw, bw);
      let d = 0;
      for (let c = 0; c < 4; c++) for (let b = 0; b < 4; b++) {
        const wbc = bv[b] * bw[c]; const base = ((iw + c) * LAT.nv + (iv + b)) * LAT.nu + iu;
        d += wbc * (bu[0] * lat[base] + bu[1] * lat[base + 1] + bu[2] * lat[base + 2] + bu[3] * lat[base + 3]);
      }
      return d;
    }
    function smooth(e0, e1, x) { const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); }

    // net -> envelope -> FFD -> scene
    function deform(out) {
      const ls = mood.latScale;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = (j * N + i) * 3;
        const fx = i / (N - 1);
        const dd = (fx - mood.envCross) / NET.envWidth;
        const env = NET.envLow + (1 - NET.envLow) * (1 - smooth(0, mood.envCross, fx)) - NET.envDip * Math.exp(-dd * dd);
        // a plain scaling of the coordinates about the one fixed axis (height 0, depth envAxis), the same for every point
        const x = pos[k];
        const y = pos[k + 1] * env;
        const z = NET.envAxis + (pos[k + 2] - NET.envAxis) * env;
        // lattice normalised coords: the lattice spans the net's region with a margin
        const u = (x + 0.1) / 1.2, v = (y + 0.5), w = (z + 0.1) / 1.2;
        const dy = ffd(u, v, w);
        out[k] = ((layout(x) - 0.5) * SCENE.len + SCENE.x0) * ls[0];
        out[k + 1] = (y + dy) * SCENE.height * ls[1] + SCENE.y0 + SCENE.tilt * out[k];
        out[k + 2] = (z - 0.5) * SCENE.wid * ls[2] + SCENE.z0;
      }
    }

    function stepNet() {
      acc.fill(0);
      for (let s = 0; s < SA.length; s++) {
        const a = SA[s] * 3, b = SB[s] * 3;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const f = SK[s] * (L - SR[s]) / L;
        acc[a] += f * dx; acc[a + 1] += f * dy; acc[a + 2] += f * dz;
        acc[b] -= f * dx; acc[b + 1] -= f * dy; acc[b + 2] -= f * dz;
      }
      for (let j = 0; j < N; j++) acc[(j * N + N - 1) * 3] += NET.push; // free end i = N-1, pulled outwards
      for (let p = 0; p < N * N; p++) {
        const k = p * 3;
        vel[k] += acc[k] * DT + NET.noise * netGauss();
        vel[k + 1] += acc[k + 1] * DT + NET.noise * netGauss();
        vel[k + 2] += acc[k + 2] * DT + NET.noise * netGauss();
        pos[k] += vel[k] * DT; pos[k + 1] += vel[k + 1] * DT; pos[k + 2] += vel[k + 2] * DT;
        vel[k] *= 1 - NET.damping; vel[k + 1] *= 1 - NET.damping; vel[k + 2] *= 1 - NET.damping;
      }
      // driven end i = 0 (the far end), placed kinematically. Every row's driven point lies on the one shared path
      // (height and depth oscillations about the middle of the edge), only earlier or later along it, so the driven
      // end acts like a single point moving along a path and gathers that end of the sheet across its width
      driveT += (simTime - driveT) * NET.driveEase;
      for (let j = 0; j < N; j++) {
        const k = (j * N) * 3;
        pos[k] = rest[k];
        pos[k + 1] = NET.driveA * Math.sin(NET.driveW1 * driveT + j * NET.drivePhase1);
        pos[k + 2] = 0.5 + NET.driveB * Math.sin(NET.driveW2 * driveT + j * NET.drivePhase2 + 1.3);
        vel[k] = vel[k + 1] = vel[k + 2] = 0;
      }
    }

    // B-spline surface evaluation on a deformed net: s in [0, N-3] along, t in [0, N-3] across.
    const es = [0, 0, 0, 0], et = [0, 0, 0, 0];
    function surf(net, s, t, out) {
      const is = Math.min(Math.max(Math.floor(s), 0), N - 4), it = Math.min(Math.max(Math.floor(t), 0), N - 4);
      bsp(s - is, es); bsp(t - it, et);
      let x = 0, y = 0, z = 0;
      for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) {
        const w = es[a] * et[b], k = ((it + b) * N + is + a) * 3;
        x += w * net[k]; y += w * net[k + 1]; z += w * net[k + 2];
      }
      out[0] = x; out[1] = y; out[2] = z; return out;
    }

    const P0 = [0, 0, 0], P1 = [0, 0, 0];
    function birth(s, t) {
      if (nFree === 0) return;
      surf(netPrev, s, t, P0); surf(netCur, s, t, P1);
      let dx = P1[0] - P0[0], dy = P1[1] - P0[1], dz = P1[2] - P0[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-7) return;
      dx /= d; dy /= d; dz /= d;
      // spread within a cone with a hard edge: a random direction at right angles to the motion, turned by an angle spread
      // evenly up to the cone's half-angle
      let px = gauss(), py = gauss(), pz = gauss();
      const pd = px * dx + py * dy + pz * dz; px -= pd * dx; py -= pd * dy; pz -= pd * dz;
      const pn = Math.sqrt(px * px + py * py + pz * pz) || 1, th = SPARK.cone * rng(), ct = Math.cos(th), st = Math.sin(th) / pn;
      dx = dx * ct + px * st; dy = dy * ct + py * st; dz = dz * ct + pz * st;
      if (rng() < SPARK.reverseP) { dx = -dx; dy = -dy; dz = -dz; }
      // the component along the viewing axis is removed and the rest is not rescaled, so a birth moving partly towards or
      // away from the camera starts slower
      const f = mood.camFwd, along = dx * f[0] + dy * f[1] + dz * f[2];
      dx -= along * f[0]; dy -= along * f[1]; dz -= along * f[2];
      if (dx * dx + dy * dy + dz * dz < 1e-12) return;
      const speed = Math.max(SPARK.speedMin, SPARK.speedK * Math.pow(d / DT, SPARK.speedPow)) * (0.6 + 0.8 * rng());
      const i = free[--nFree];
      alive[i] = 1;
      const k = i * 3;
      sp[k] = spPrev[k] = P1[0]; sp[k + 1] = spPrev[k + 1] = P1[1]; sp[k + 2] = spPrev[k + 2] = P1[2];
      sv[k] = dx * speed; sv[k + 1] = dy * speed; sv[k + 2] = dz * speed;
      sJit[k] = SPARK.jitter * gauss(); sJit[k + 1] = SPARK.jitter * gauss(); sJit[k + 2] = SPARK.jitter * gauss();
      sAge[i] = 0;
      sRate[i] = Math.max(SPARK.rateMin, SPARK.rateMean * (1 + SPARK.rateSpread * gauss()));
      // random initial orientation
      let qx = gauss(), qy = gauss(), qz = gauss(), qw = gauss();
      const qn = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1;
      sq[i * 4] = qx / qn; sq[i * 4 + 1] = qy / qn; sq[i * 4 + 2] = qz / qn; sq[i * 4 + 3] = qw / qn;
      sRnd[i] = rng();
    }
    // a random point of the sheet, uniform in the surface's two parameters (spec 17), so births crowd where the sheet is compressed
    function randPoint() { return [rng() * (N - 3), rng() * (N - 3)]; }

    function emit() {
      if (rng() < SPARK.burstP) for (let b = 0; b < SPARK.burstN; b++) { const p = randPoint(); birth(p[0], p[1]); }
      for (const w of walkers) {
        if (!w.on) {
          if (rng() < SPARK.walkerP) {
            const p = randPoint(); w.on = true; w.s = p[0]; w.t = p[1];
            w.dir = rng() < 0.5 ? -1 : 1; w.left = SPARK.walkMin + Math.floor(rng() * (SPARK.walkMax - SPARK.walkMin));
          }
          continue;
        }
        if (w.left % 2 === 0) birth(w.s, w.t);
        w.s += w.dir * SPARK.walkStep;
        if (--w.left <= 0 || w.s < 0 || w.s > N - 3) w.on = false;
      }
    }

    function stepSparks() {
      const fr = SPARK.friction, g = SPARK.gravity, jit = SPARK.jitter, box = SPARK.box;
      for (let i = 0; i < S; i++) {
        if (!alive[i]) continue;
        const k = i * 3;
        spPrev[k] = sp[k]; spPrev[k + 1] = sp[k + 1]; spPrev[k + 2] = sp[k + 2];
        if (rng() < SPARK.jitterRedraw * DT) { sJit[k] = jit * gauss(); sJit[k + 1] = jit * gauss(); sJit[k + 2] = jit * gauss(); }
        const ax = sJit[k] - fr * sv[k], ay = sJit[k + 1] - g - fr * sv[k + 1], az = sJit[k + 2] - fr * sv[k + 2];
        sv[k] += ax * DT; sv[k + 1] += ay * DT; sv[k + 2] += az * DT;
        sp[k] += sv[k] * DT; sp[k + 1] += sv[k + 1] * DT; sp[k + 2] += sv[k + 2] * DT;
        sAge[i] += sRate[i] * DT;
        // spin: the same schedule over the life fraction for every sparkle
        const lf = 6.283185307179586 * sAge[i], cy = SPARK.spinCycles, ph = SPARK.spinPhase;
        const wx = SPARK.spinA * Math.sin(cy[0] * lf + ph[0]);
        const wy = SPARK.spinA * Math.sin(cy[1] * lf + ph[1]);
        const wz = SPARK.spinA * Math.sin(cy[2] * lf + ph[2]);
        const q = i * 4, x = sq[q], y = sq[q + 1], z = sq[q + 2], w = sq[q + 3], h = 0.5 * DT;
        let nx = x + h * (wx * w + wy * z - wz * y), ny = y + h * (wy * w + wz * x - wx * z);
        let nz = z + h * (wz * w + wx * y - wy * x), nw = w - h * (wx * x + wy * y + wz * z);
        const n = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
        sq[q] = nx / n; sq[q + 1] = ny / n; sq[q + 2] = nz / n; sq[q + 3] = nw / n;
        if (sAge[i] >= 1 || sp[k] < box[0][0] || sp[k] > box[0][1] || sp[k + 1] < box[1][0] ||
            sp[k + 1] > box[1][1] || sp[k + 2] < box[2][0] || sp[k + 2] > box[2][1]) {
          alive[i] = 0; free[nFree++] = i;
        }
      }
    }

    function step() {
      simTime += DT; steps++;
      lattice();
      stepNet();
      const t = netPrev; netPrev = netCur; netCur = t;
      deform(netCur);
      stepSparks();
      emit();
    }

    // Pack the alive sparkles for drawing.
    function packSparks(out) {
      let n = 0;
      for (let i = 0; i < S; i++) {
        if (!alive[i]) continue;
        const k = i * 3, o = n * SPARK_STRIDE, a = sAge[i];
        out[o] = spPrev[k]; out[o + 1] = spPrev[k + 1]; out[o + 2] = spPrev[k + 2];
        out[o + 3] = sp[k]; out[o + 4] = sp[k + 1]; out[o + 5] = sp[k + 2];
        // facing = q * (0, 0, 1)
        const q = i * 4, x = sq[q], y = sq[q + 1], z = sq[q + 2], w = sq[q + 3];
        out[o + 6] = 2 * (x * z + w * y); out[o + 7] = 2 * (y * z - w * x); out[o + 8] = 1 - 2 * (x * x + y * y);
        const op = Math.min(1, a / SPARK.rampIn, (1 - a) / SPARK.rampOut);  // linear ramps
        // fade near the bounding box's faces
        const box = SPARK.box; let edge = Infinity;
        for (let ax = 0; ax < 3; ax++) edge = Math.min(edge, sp[k + ax] - box[ax][0], box[ax][1] - sp[k + ax]);
        const bf = Math.min(1, Math.max(0, edge / SPARK.boxFade));
        out[o + 9] = op * bf * bf * (3 - 2 * bf);
        out[o + 10] = sRnd[i];
        n++;
      }
      return n;
    }

    function setMood(m) {
      if (m.envCross != null) mood.envCross = m.envCross;
      if (m.latScale) mood.latScale = m.latScale.slice();
      if (m.camFwd) mood.camFwd = m.camFwd.slice();
    }

    lattice();
    deform(netCur); netPrev.set(netCur);
    return {
      N, DT, SPARK_STRIDE, pool: S,
      step, setMood, packSparks, surf,
      get netPrev() { return netPrev; }, get netCur() { return netCur; },
      get steps() { return steps; },
      // Warm-up, the same length at every start (spec 18). From the stored state: the net alone for warmNet steps, then
      // the full step for the last 15 s so the sparkles are populated as in a running state. From the flat start: the net
      // alone, heavily damped at first to clear the flat start, then for warmDecays decay times at its own damping, then
      // the same 15 s. Only the sparkles depend on the seed.
      warm(n) {
        const d = NET.damping;
        if (stored) n = NET.warmNet + 900;
        else n = Math.max(n, NET.warmSettle + Math.ceil(NET.warmDecays / Math.max(d, 1e-5)) + 900);
        for (let i = 0; i < n; i++) {
          NET.damping = !stored && i < NET.warmSettle ? Math.max(d, 0.02) : d;
          if (i < n - 900) { simTime += DT; lattice(); stepNet(); } else step();
        }
        NET.damping = d; steps = 0;
      },
      // the net's state for tools/mkstate.js
      state() { return { n: N, key: netKey(), t: simTime, dt: driveT, pos: Array.from(pos, v => +v.toPrecision(6)), vel: Array.from(vel, v => +v.toPrecision(5)) }; },
      warmSteps: NET.warm,
      tune(values) { setTunables(values); rebuildSprings(); }, // live changes from the settings menu
      // recompute the current step's warp and deformed net after a change of the warp's tunables (tools/measure/phasefit.js;
      // the warp does not act back on the net, so the net's own state is untouched)
      redeform() { lattice(); deform(netCur); },
      debug: { pos, vel, alive: () => S - nFree },
    };
  }
  return { createSim, N, DT, SPARK_STRIDE, tunables: TUNABLES, setTunables };
}
