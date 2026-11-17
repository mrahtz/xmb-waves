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
    noise: 9.6e-5,                  // velocity kick per step (std dev). Besides keeping the motion alive, the kicks set how
                                    // many strands the band shows: the across-the-width springs have no linear stiffness at
                                    // rest length, so the kicks drive neighbouring rows apart into separate strands; 2e-5 gives a broad
                                    // ribbon of two or three layers whose lines stand too high above the band; much larger values
                                    // make the net jitter and the fold lines stipple. From the settled start (below) the net's own
                                    // agitation is what it is in equilibrium rather than what the flat start left behind, so this
                                    // sits as high as the check of 4.4e allows: the nudge-driven speed of the free half is then
                                    // 1.9 times the shaken edge's peak speed (tools/measure/nudgecheck.js; the spec asks for
                                    // within a factor of two)
    push: 0.012,                    // steady gentle pull on the free end, along the length, so the sheet stays extended
    // the drive (spec 14 and 18): smooth and unhurried, each end moving less than a grid spacing (0.056), up-and-down travel
    // clearly larger than the towards-and-away (5:3), which is the faster motion; the damping outlasts two cycles of the
    // slower motion. Nothing on screen shows the drive's own rate (spec 18), so it is set from those relative statements.
    // Spec 22: with the depth offset across the edge at 2.5 times the height offset (as before) the shared path coiled every
    // column of the net into a scroll of two to three turns, seen as one solid tube with a broad sheen and two lines; with
    // the offsets close ("somewhat more", spec 8) and the path a little larger, the sheet folds over itself gently instead
    driveA: 0.05, driveW1: 0.1047,   // driven end: height amplitude, angular frequency (a 60 s cycle)
    driveB: 0.03, driveW2: 0.1571,   // driven end: depth amplitude, angular frequency (a 40 s cycle)
    drivePhase1: 0.55, drivePhase2: 0.78,  // phase change per row for height and depth: the driven points are strung out along the
                                          // shared path (1.58 cycles across the edge in height, 2.23 in depth); the depth offset builds up more
                                          // than the height offset, and that difference between the axes is what makes the folds cross.
                                          // Spec 26: this is how much of the width's slack is folded, and it is the lever on the band's
                                          // substance rather than a larger or faster drive (the amplitudes and rates are untouched, so the
                                          // shaken edge's peak speed and the surface's speed on screen are too). At 1.28 / 1.58 cycles the
                                          // settled net showed 3.4 peaks and 0.44 partings a column against the footage's 4.1 and 0.75
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
    bumpAmp: 0.11047, bumpWidth: 0.25, bumpCentre: 0.3, bumpTravel: 0.72, bumpW: 0.01027,
    // the whole sheet rising and falling together, much more slowly than the swell. Spec 26: the bob is the main carrier
    // of the band's slow wandering over minutes, so it moves the band by more than the bump does.
    // Spec 30: the band's course over times since the start had the right shape with too little reach (0.46 to 0.60 H
    // over the twelve times the footage covers, against the original's 0.41 to 0.70), which is the slow parts' size and
    // not the camera's aim, so the two sizes and the two rates were fitted with the ceiling below and the phases, all
    // together, against the whole course (tools/measure/coursefit.js), and the aim only afterwards. A slow part's share
    // of how fast the band moves is its amplitude times its rate, and that was already right, so the fit was held to
    // candidates no quicker than the old values in either part: the bob is half as large again and half as slow again,
    // the bump a tenth larger and five times slower. The ordering of 4.4b holds and is wider than before: swell 21 s,
    // twist 21.7 s, bob 100 s, bump 612 s, the bob well inside 4.6's "over minutes"
    bobAmp: 0.0655, bobW: 0.06301,
    twistAmp: 0.04, twistW: 0.29,  // a gentle ripple, one cycle across the width, travelling across it
    // the four parts' phases at clock 0 (spec 18: fixed, the same at every start, never drawn per run): swell strength, bump,
    // bob, swell, twist. Spec 30 says not to fit these on their own to bring single moments into line, so they are no
    // longer fitted after the rates: they are searched together with the two slow sizes, the two slow rates and the
    // clock's ceiling against the band's whole course (the twelve times since the start the footage covers, 40 s to 30
    // minutes; the original's band is at the same height at a given time since the start whatever the date, so the four
    // noise conditions give one course, their spread per time being 0.008 to 0.021 H). Against it the joint fit is
    // 0.054 H rms where the old values were 0.085
    ph: [1.27744, 5.42093, 5.92774, 6.19384, 2.87612],
    // The clock every part of the warp reads is not unbounded (spec 30): it runs up to this ceiling, in seconds, and
    // restarts from its starting value, and because all four parts read it directly they jump together. The driven end
    // reads the same clock through the easing of NET.driveEase, so it is not set down at a new place: it is swept along
    // its usual path over about a second (the easing's time constant), which throws a real disturbance into the sheet
    // that then travels and dies away like any other. The ceiling is fitted with the rates and the sizes against the
    // band's height over times since the start (tools/measure/coursefit.js)
    // (2400 s: of 900, 1200, 1800, 2400 and no restart inside the footage's window at all, each with its own joint fit
    // of the rates, the sizes and the phases, 2400 s fitted the course best, 0.059 H rms before the aim and 0.040 after
    // it, against 0.080 for both 900 and 1800. It puts the restart 1326 s after a start, so a 10 s clip contains one
    // about once in 240.)
    clockMax: 2400,
  };
  // Scene mapping of the deformed net (scene units; x along the length, y up, z away).
  const SCENE = { len: 15, x0: 0.9, wid: 6.0, height: 3.5, y0: 0.05, z0: 0.0, tilt: 0.0 }; // tilt: rise per unit length towards the near end
  // x0: where the sheet sits along its own length in the scene, which is what sets the framing of 4.4d. Spec 30: the
  // band must thin, pinch and dim as it leaves the picture at the free-end edge, because the sheet's own end is there
  // and the fade it carries (4.4c) is already biting inside the picture. At 1.9 the free end lay 0.26 of the frame's
  // width beyond the right edge and the band left the picture at full strength: over the 38 recordings and renders the
  // band's mean light in the free-end tenth of the width was 1.27 times its light in the middle third, where the
  // footage's is 0.59 (tools/measure/freeend.py). At 0.9 the free end reaches screen x 1.12 and the ratio is 0.63; at
  // 0.4 (screen x 1.04) it fell to 0.42, past the original's. The band's thickness in that tenth is 1.01 of the middle
  // third's against the footage's 1.05
  // wid, height (spec 22, refitted for spec 26): the scales of the net's gathered width and of its height into the scene. The net
  // is bunched across its width (one shared driven path), so at wid 4.7 the visible surface spanned less depth down a screen
  // column than from left to right: a strip. At 6 the depth across the band is many times the change along the screen and the
  // far width shows. Both scale the net and the drive together (the drive is in net units), so lowering them from 7 and 4.1
  // slows everything on screen in proportion, as spec 26 asks: it brought the band's thickness from 0.185 to 0.151 H (footage
  // 0.151), the flow's vertical speed from 20.3 to 17.9 px/s (15.6) and its light over the background from 38.4 to 37.2 (36.5)

  const SPARK = {
    pool: 2000,
    // births (spec 16): bursts on a large share of the steps, each a fixed batch at random points of the sheet, supply nearly
    // all of them; a single walker leaves a trail along the length, one sparkle every other step, and its births come after
    // the bursts' so they are the ones dropped once the pool is full
    burstP: 0.6, burstN: 12,
    walkers: 1, walkerP: 0.02, walkMin: 40, walkMax: 220, walkStep: 0.045, // patches per step
    cone: 0.6, reverseP: 0.12,                      // cone: half-angle (rad) of the birth cone, deviation spread evenly up to it
    speedK: 0.25, speedPow: 0.5, speedMin: 0.033, // scene units / s: on screen about as fast as the band's lines rise and fall
    rateMean: 1 / 6.5, rateSpread: 0.30, rateMin: 1 / 14, // life per second
    rampIn: 0.025, rampOut: 0.045,                    // short linear ramps of the life (fraction), the fade-in the quicker
    // jitter (spec 25): the push, one value per axis, is mostly redrawn every step, but the share jitterHeld of its
    // strength is drawn once at birth and never changes, so a sparkle's average push is not quite zero: shimmer about a
    // straight course with a slow one-way bend building up over a long life. Gravity and friction are weak
    jitter: 0.05, jitterHeld: 0.15, gravity: 0.0002, friction: 0.03,  // per second units
    // spin (spec 17): the same schedule over every sparkle's life: angular velocity per axis = spinA x
    // sin(2 pi x spinCycles[axis] x life fraction + spinPhase[axis])
    spinA: 4.0, spinCycles: [0.9, 1.4, 0.6], spinPhase: [0.3, 2.1, 4.0],
    // the bounding box: more generous across the width and in depth than along the length, and (spec 25) no farther
    // outside the picture than it has to be, so a sparkle that has left the picture does not hold its slot for the rest
    // of its life. Along the length the faces sit just beyond the farthest a sparkle inside the picture ever reaches
    // (measured with tools/measure/sparkpool.js), so the fade below is still never seen on screen
    box: [[-4.4, 6.6], [-6, 6], [-3.5, 9]],
    boxFade: 0.30,                                  // sparkles fade out over this distance from the box's faces
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
  const START = {"n":19,"key":"{\"kStruct\":0.3119,\"kBend\":2.247,\"alongRest\":1,\"acrossK\":0.8382,\"damping\":0.000139,\"noise\":0.000096,\"push\":0.012,\"driveA\":0.05,\"driveW1\":0.1047,\"driveB\":0.03,\"driveW2\":0.1571,\"drivePhase1\":0.55,\"drivePhase2\":0.78,\"driveEase\":0.02}","t":999.2333333327532,"dt":998.4166666660866,"pos":[0,-0.0379465,0.526339,-0.000856409,0.0203756,0.523838,0.0587976,0.0417741,0.497606,0.10555,0.0245005,0.519543,0.161125,0.0519233,0.538468,0.216721,0.0462319,0.521519,0.277543,0.0608556,0.53045,0.306966,0.0875647,0.559794,0.37009,0.108945,0.563084,0.4206,0.0946454,0.554313,0.484276,0.100383,0.59578,0.535049,0.097303,0.550102,0.595356,0.114902,0.571728,0.625378,0.109083,0.624587,0.679661,0.130433,0.659816,0.7344,0.134288,0.654376,0.790151,0.134828,0.675432,0.852882,0.113503,0.69523,0.904425,0.122193,0.690342,0,-0.0493683,0.528825,0.0548068,-0.013954,0.537351,0.0966585,0.0180541,0.575021,0.159217,0.00751895,0.552516,0.206054,0.0368646,0.537676,0.266908,0.0349722,0.547828,0.316968,0.0553664,0.561267,0.369278,0.0582395,0.572165,0.423798,0.0570839,0.582133,0.483002,0.0696425,0.571299,0.530746,0.0813802,0.569397,0.588513,0.0647816,0.615497,0.632461,0.0786806,0.605922,0.690355,0.104487,0.633381,0.726225,0.126866,0.639375,0.792767,0.137642,0.628687,0.836044,0.116982,0.655329,0.893199,0.0971612,0.629145,0.956407,0.131351,0.624643,0,-0.0462289,0.514644,0.0722497,-0.0640064,0.541898,0.116387,-0.0376605,0.547,0.185599,-0.0535154,0.531797,0.234775,-0.0209342,0.522286,0.297774,-0.0214967,0.534495,0.348101,-0.0117616,0.540789,0.396572,0.0303946,0.540101,0.448799,0.0383272,0.538221,0.508747,0.0303558,0.525615,0.565658,0.0408242,0.544597,0.620581,0.0320197,0.551274,0.667392,0.0333263,0.579774,0.721831,0.0646216,0.595802,0.766655,0.0883462,0.602929,0.829372,0.0939748,0.602316,0.876378,0.0857457,0.620757,0.925845,0.0550026,0.635118,0.985142,0.0500033,0.645253,0,-0.0294542,0.491997,0.0642457,-0.0797236,0.459559,0.112923,-0.0589867,0.496153,0.180474,-0.0736904,0.483473,0.227869,-0.0726909,0.491284,0.290308,-0.0563509,0.495895,0.338757,-0.0395981,0.502934,0.393196,-0.0182433,0.503059,0.451516,-0.0050141,0.490127,0.511214,-0.0222087,0.519123,0.55871,0.014503,0.498008,0.614704,0.029187,0.513152,0.663762,0.0050153,0.53214,0.714526,0.0295945,0.560164,0.765913,0.0499659,0.570934,0.809932,0.0293899,0.602453,0.87414,0.0375124,0.582557,0.917844,0.00512098,0.602114,0.979651,0.0247179,0.594696,0,-0.00399201,0.473977,0.0436655,-0.0488354,0.44354,0.101267,-0.0640104,0.438549,0.135793,-0.105365,0.457222,0.213324,-0.0708519,0.434776,0.251292,-0.0828775,0.454501,0.319258,-0.0862464,0.465707,0.361036,-0.0580425,0.477003,0.422829,-0.0610866,0.484581,0.477495,-0.0687414,0.480917,0.535864,-0.044771,0.476301,0.575765,-0.00607898,0.464839,0.641379,-0.00517395,0.476637,0.677074,0.0337364,0.508404,0.734285,0.0286073,0.52175,0.759922,-0.000367197,0.587257,0.828936,0.00381332,0.573432,0.868418,-0.0271177,0.565259,0.93104,-0.0346817,0.585365,0,0.0226476,0.471002,0.023017,0.0240651,0.407618,0.0405194,-0.053124,0.408335,0.0818027,-0.0662471,0.442476,0.146885,-0.105121,0.425947,0.198037,-0.0660201,0.439409,0.251694,-0.0625301,0.442768,0.307295,-0.0842893,0.447906,0.359672,-0.0580498,0.457954,0.41626,-0.0573002,0.468404,0.469714,-0.0285888,0.45546,0.511011,-0.00316847,0.488511,0.577543,0.0242357,0.474056,0.616546,0.0265656,0.506926,0.6848,0.0353742,0.499056,0.711349,0.00105081,0.553967,0.786619,0.00616652,0.530837,0.819604,-0.0241988,0.528381,0.897098,-0.011746,0.540667,0,0.0426074,0.484794,-0.0415848,0.0110544,0.433723,0.00298717,-0.0613648,0.467657,0.0605744,-0.0405846,0.445111,0.113507,-0.0764359,0.467883,0.159306,-0.0976368,0.491726,0.212279,-0.0704981,0.496037,0.257895,-0.0604994,0.50126,0.319414,-0.0480187,0.508476,0.371445,-0.0602189,0.522147,0.432667,-0.0562238,0.51536,0.482578,-0.0463804,0.517434,0.539021,-0.0263804,0.514909,0.588754,-0.0325591,0.50919,0.650009,-0.0337545,0.487164,0.702982,-0.0135101,0.49135,0.76926,-0.0308541,0.499273,0.808163,-0.0509068,0.485523,0.887496,-0.046403,0.487237,0,0.05,0.507377,-0.000596257,-0.0197074,0.501608,0.0521838,-0.039607,0.517816,0.107033,-0.0215051,0.544248,0.156337,-0.0902583,0.530131,0.206216,-0.07645,0.544876,0.258246,-0.076632,0.55674,0.315087,-0.0563594,0.556974,0.362487,-0.0589733,0.565033,0.41857,-0.0718982,0.565075,0.475469,-0.0587911,0.572211,0.530589,-0.0984408,0.552326,0.577031,-0.0719862,0.529147,0.642595,-0.066371,0.535232,0.685185,-0.0756015,0.485803,0.741171,-0.0901371,0.487323,0.802785,-0.079238,0.465943,0.847018,-0.0840849,0.439834,0.91643,-0.0951951,0.473979,0,0.0426451,0.525695,0.0612464,0.00878707,0.470822,0.100673,-0.0161288,0.473166,0.151423,-0.0524204,0.484064,0.195843,-0.0471877,0.517264,0.252265,-0.0495734,0.522961,0.309634,-0.0497987,0.546006,0.365595,-0.04549,0.524884,0.424178,-0.0458879,0.560237,0.474132,-0.0403526,0.550596,0.535149,-0.0495726,0.554066,0.588985,-0.0489957,0.538251,0.636964,-0.0720131,0.505573,0.695502,-0.0621806,0.497678,0.737467,-0.0664767,0.465104,0.801557,-0.0508456,0.458636,0.842772,-0.0680526,0.443378,0.904498,-0.0677829,0.439675,0.965172,-0.071661,0.426236,0,0.022712,0.529157,0.0728695,0.0517935,0.480944,0.105655,0.0501345,0.464498,0.169466,0.0221918,0.460431,0.21292,-0.014134,0.4713,0.273319,-0.0108696,0.480597,0.325717,-0.0413322,0.478486,0.377924,-0.0176824,0.471428,0.439045,-0.0195146,0.505066,0.493148,-0.0311895,0.508941,0.554634,-0.0349435,0.507483,0.610982,-0.0405248,0.504065,0.668483,-0.0347064,0.494344,0.709852,-0.0371091,0.449112,0.762072,-0.0296107,0.432509,0.816995,-0.0217418,0.438093,0.871596,-0.0212032,0.40993,0.922253,-0.0225777,0.390345,0.981426,-0.028064,0.425322,0,-0.00392008,0.515761,0.0748553,0.0484061,0.556975,0.0974627,0.0725315,0.515466,0.172308,0.0624954,0.507426,0.212416,0.0550376,0.473877,0.276526,0.060356,0.469465,0.325756,0.00693868,0.460647,0.393536,0.0389173,0.45399,0.440985,0.0173049,0.46607,0.5078,0.0209686,0.462536,0.561628,0.00802587,0.46666,0.619655,0.00942097,0.454589,0.678612,0.0192347,0.458943,0.730604,0.0173073,0.430861,0.785716,0.0237805,0.427176,0.833503,0.0349331,0.386332,0.8918,0.0252968,0.403075,0.937606,0.0184871,0.366677,1.00363,0.0243086,0.387364,0,-0.0293959,0.493253,0.0648046,-0.0265954,0.554659,0.0867166,0.023042,0.56437,0.14016,0.0506379,0.559239,0.198489,0.0561627,0.548364,0.240685,0.0878501,0.519024,0.299849,0.058745,0.502481,0.352701,0.0835556,0.479858,0.409331,0.0709063,0.488593,0.452799,0.0659357,0.475192,0.514992,0.0611464,0.459064,0.577716,0.0568478,0.462186,0.621608,0.0455598,0.438023,0.679016,0.0676122,0.421662,0.723331,0.0709335,0.424116,0.798834,0.0801114,0.417251,0.845084,0.0835205,0.38753,0.895703,0.0760686,0.386504,0.959462,0.0715316,0.387782,0,-0.0462013,0.474645,0.0495089,-0.0474945,0.528486,0.0956895,-0.0275852,0.523227,0.131292,-0.00472856,0.586631,0.197425,0.0091623,0.571729,0.22732,0.0606715,0.566934,0.27498,0.0729362,0.53591,0.326912,0.104925,0.529259,0.372013,0.0939177,0.488194,0.440292,0.0911971,0.515949,0.492487,0.0933651,0.473907,0.552762,0.0832606,0.483844,0.605477,0.103683,0.464414,0.665269,0.0965152,0.45942,0.713508,0.100606,0.441933,0.775205,0.104911,0.436731,0.823364,0.0961445,0.453359,0.870383,0.0809252,0.433079,0.928529,0.0868684,0.432098,0,-0.0493797,0.470697,0.0227196,-0.113618,0.525567,0.0837238,-0.0830497,0.549598,0.0915534,-0.0429206,0.581113,0.122012,-0.000290825,0.597071,0.189184,0.0160705,0.588737,0.226087,0.0583309,0.577976,0.279579,0.0734316,0.569928,0.317205,0.107063,0.540175,0.372082,0.116842,0.521021,0.424078,0.097336,0.491037,0.489207,0.117323,0.502786,0.53878,0.108972,0.497922,0.600907,0.110631,0.487518,0.658521,0.115631,0.49438,0.693885,0.120906,0.431865,0.761706,0.119558,0.446773,0.804209,0.126015,0.412896,0.853897,0.105323,0.393212,0,-0.0379934,0.483691,-0.0120192,-0.111749,0.485195,0.0497095,-0.122393,0.507021,0.0748111,-0.090038,0.550578,0.111815,-0.0418293,0.56374,0.167347,-0.0257999,0.586319,0.213731,0.00246917,0.587894,0.252833,0.0256458,0.543246,0.313511,0.0388935,0.559695,0.3395,0.0693866,0.490667,0.390889,0.0505263,0.479307,0.453688,0.0511045,0.477058,0.50013,0.0550725,0.463931,0.563299,0.0638212,0.475088,0.609273,0.0755529,0.469044,0.674819,0.0757026,0.440657,0.717184,0.0469537,0.444557,0.775782,0.0553805,0.404673,0.832658,0.0572247,0.43598,0,-0.015401,0.506115,-0.0200141,-0.0442606,0.451099,0.0524578,-0.0741516,0.447994,0.0864792,-0.0830882,0.474111,0.139834,-0.078257,0.521262,0.189841,-0.0733175,0.513661,0.247507,-0.0453741,0.527228,0.285061,-0.021004,0.505712,0.341518,0.00128499,0.526894,0.366047,0.0161605,0.451112,0.41672,0.0018204,0.442269,0.478932,0.0159928,0.454273,0.533324,0.0371013,0.435085,0.584744,0.022579,0.428328,0.643463,0.0365174,0.424297,0.699705,0.0122393,0.410302,0.758582,0.00745182,0.416623,0.810381,0.00993701,0.431903,0.874059,0.000650043,0.438364,0,0.011734,0.525002,0.0262645,-0.0108568,0.467011,0.0723093,-0.035053,0.456961,0.137493,-0.0524826,0.460229,0.180705,-0.0638316,0.485753,0.231114,-0.0401217,0.508132,0.288174,-0.0466538,0.516367,0.340983,-0.0319749,0.50539,0.366751,-0.00613181,0.46118,0.419773,0.00103769,0.443578,0.464527,0.0147574,0.404341,0.529564,0.0129214,0.418249,0.587112,0.010611,0.404905,0.641434,0.00693416,0.414619,0.694967,0.0138382,0.431169,0.752645,-0.00672953,0.428846,0.806747,-0.0262475,0.420537,0.861173,-0.00819311,0.447197,0.916964,-0.0173456,0.439196,0,0.035408,0.529435,0.0419526,0.0373564,0.492318,0.102047,0.00428543,0.50613,0.1469,0.00129909,0.479255,0.213015,-0.00151934,0.493153,0.260958,0.00981393,0.484968,0.319113,0.0110439,0.495019,0.365668,0.008072,0.445198,0.424199,0.0416936,0.468435,0.477714,0.0423745,0.439346,0.520411,-0.00396392,0.417928,0.584949,0.0242495,0.446116,0.631927,0.0130421,0.433055,0.688911,0.0205432,0.470068,0.736013,0.00489603,0.472465,0.796953,0.00584102,0.442404,0.845509,-0.0154768,0.476546,0.890133,-0.0388675,0.492332,0.961648,-0.0322173,0.487614,0,0.0486384,0.516848,0.0741968,0.0615275,0.540576,0.117426,0.0606735,0.507722,0.174191,0.0330166,0.509759,0.227986,0.0362017,0.511444,0.278192,0.0505723,0.474128,0.341123,0.0534566,0.498807,0.39468,0.0494556,0.46668,0.453026,0.0447203,0.502485,0.513325,0.0457747,0.485932,0.555784,0.0326647,0.466726,0.622002,0.0431142,0.46668,0.669043,0.0336853,0.46934,0.730382,0.0640855,0.459176,0.787319,0.0348274,0.465055,0.845986,0.0447079,0.467449,0.894143,0.00536822,0.480351,0.943087,-0.0335608,0.496237,1.00945,0.00715197,0.479604],"vel":[0,0,0,0.0051894,-0.00021534,0.010829,0.033463,0.0029452,0.00001552,0.0080321,-0.012943,0.015538,0.0077237,-0.0050924,-0.0026304,0.004208,-0.0091955,0.0043552,0.0058914,-0.0056635,-0.0040421,0.0014847,-0.0071779,0.0026679,0.00088438,-0.0034571,-0.00015563,0.0092761,0.0080558,-0.0013034,0.013044,0.0048527,0.015768,0.015022,0.010474,0.0047257,-0.0034285,0.0094787,0.00014737,0.011321,0.0014294,-0.00089235,0.0076537,0.0026967,-0.0049115,0.0013022,-0.0088461,-0.002307,0.0010711,-0.0074741,-0.01855,0.013382,-0.0020793,-0.019886,0.009849,0.014365,-0.014103,0,0,0,0.010849,-0.00025176,-0.0016813,0.014297,-0.022537,0.0065925,0.012226,0.0021967,-0.0065897,0.0070476,-0.0012223,-0.0077321,0.0068951,-0.0054536,-0.0048247,-0.0098286,-0.010252,0.0042055,-0.0020232,-0.0047183,0.00084671,-0.0086374,0.0046872,-0.0095452,0.0038061,0.0031175,-0.0053501,0.0010091,-0.013394,-0.00091731,0.007302,0.0089749,0.0018908,-0.0011168,0.0057061,0.020967,0.0038023,-0.0080061,-0.0051006,0.00037851,0.015915,-0.0025191,0.0055212,0.013361,-0.0073865,0.0067762,0.000070457,-0.0014028,0.0085125,0.019617,-0.0076772,0.0017035,0.027927,-0.0088085,0,0,0,-0.001818,-0.00075358,-0.0011047,-0.0036341,-0.0068459,-0.002501,0.00558,-0.016608,0.01697,-0.0079408,-0.012741,-0.0039321,0.0045486,0.00088491,-0.00075003,0.017107,-0.0049154,0.0072175,-0.0065299,0.017523,-0.0016136,0.000077402,0.012018,-0.0069839,-0.0042319,0.012404,0.0028476,-0.0043748,0.0029299,-0.0052398,0.013274,-0.006502,0.0016959,0.0055786,0.0093565,-0.0013111,0.0045128,-0.00018592,-0.0049815,0.0045163,0.010119,0.0080899,-0.003968,-0.0010974,-0.00089198,0.0051562,0.0020652,-0.0051426,0.015143,-0.0045161,-0.0092142,-0.0052336,-0.0046551,-0.0047401,0,0,0,-0.0082444,0.01761,-0.024836,-0.0020309,-0.014242,-0.010824,-0.0053853,-0.015625,-0.0095074,-0.0030013,0.0047436,-0.013329,-0.00029745,0.0065586,0.007144,-0.0066876,-0.0024432,-0.0062024,-0.00083669,0.00018666,-0.0051362,0.0010856,0.0079224,0.0022332,-0.00010497,-0.0028138,0.0060201,-0.0048156,0.013223,0.0043469,0.0065076,-0.0038084,-0.0029354,-0.0048774,-0.0051844,0.0060598,0.0098301,0.003189,-0.00036141,0.0074726,0.0013605,0.0021405,0.0099778,0.0037525,-0.0025564,-0.0026874,0.0045341,-0.0061378,0.013041,0.01342,0.0075289,0.0068592,0.015732,0.00067875,0,0,0,0.011702,0.013956,-0.0015392,0.013507,0.0022766,-0.011778,0.0021517,0.013997,-0.011541,0.0082636,-0.010376,0.0012689,-0.0084066,0.01647,-0.0052648,0.013538,-0.022929,0.00067688,0.0019705,-0.0034621,-0.0091587,-0.0055754,0.013527,-0.011822,0.0060247,0.0097107,0.0090372,-0.0040537,-0.000017658,0.0093315,0.016524,-0.00052834,0.0054877,0.0056282,-0.0091957,0.0041661,-0.011971,0.0047726,0.0069872,-0.0019815,0.0057655,0.00024465,0.0003102,0.0082241,0.0048266,-0.01262,0.0057448,0.011726,-0.0014857,0.00029007,0.0085553,-0.0061208,0.0069347,-0.00063421,0,0,0,0.0037941,0.016511,0.030053,-0.016407,0.0059053,0.0018454,-0.0017506,-0.0015639,-0.014785,-0.0089662,0.007591,-0.010392,0.0025271,0.0012777,-0.0032605,-0.0013547,-0.0080829,0.0089408,-0.0096608,-0.0093101,-0.013124,-0.018701,0.014168,-0.0088671,-0.006182,0.010464,-0.0073831,0.0055836,0.0029781,-0.0014987,0.0055837,0.0018162,-0.010153,-0.0066542,0.0039831,-0.00099438,0.00070124,-0.0036236,0.0041589,-0.016045,0.0020838,0.0055514,-0.010444,-0.0067499,0.013478,0.019777,0.0076343,-0.00024874,0.0023566,-0.000057085,-0.0010443,0.0081367,0.0027523,0.0084048,0,0,0,0.0071974,0.014082,0.0064026,-0.0084607,-0.0016156,-0.0068057,-0.0118,0.0039057,-0.015412,-0.0016446,0.0088201,0.0038034,0.0012879,0.0057878,0.010832,0.0063257,-0.0021735,0.000093629,-0.008572,-0.00079349,0.003532,0.0042617,0.007912,0.0081359,0.0066504,0.0029703,-0.0002633,0.0053024,0.011229,0.011159,0.011797,0.011443,-0.00013846,-0.018507,-0.00018034,0.0079486,-0.0071713,0.00285,0.0064163,-0.016039,0.013018,0.012955,0.01322,0.0020947,-0.00097362,-0.0038047,0.00090465,0.012266,0.016536,0.0087827,0.00338,0.0014789,0.0092869,-0.0021102,0,0,0,-0.0034786,-0.00001811,0.014241,0.00060715,-0.014197,0.00037113,-0.0051847,-0.01755,-0.0023522,0.0088995,-0.0071054,-0.00084556,-0.0062147,-0.0031557,-0.024658,0.010235,-0.0017664,0.005057,0.0066367,0.020665,0.0070449,0.0024966,0.0020877,-0.010606,0.0025463,-0.0016401,0.0024428,0.0025675,-0.0025669,-0.0088219,0.016023,-0.0017292,-0.0049215,0.0073658,-0.011942,-0.0054417,-0.017101,-0.0063607,-0.00099006,0.020097,-0.0012397,0.002104,0.0086794,-0.007443,-0.0045779,0.014566,0.001586,0.00079091,-0.001551,-0.0029875,-0.0095988,0.010785,0.0035671,-0.0062886,0,0,0,0.0094069,-0.0051479,0.0026325,-0.0041035,0.0016319,-0.0077404,-0.0024113,-0.013628,0.0073443,0.010522,0.004252,-0.012464,0.0059177,-0.015311,-0.0012003,0.0085639,0.0010367,-0.0040011,0.0018336,-0.016216,0.0071065,0.0022429,0.0087132,0.015304,0.013944,0.013575,0.0056036,-0.001048,0.0024698,-0.00095676,0.0036723,0.0017967,-0.010377,-0.0047778,-0.010013,-0.010281,0.0065305,0.00074998,-0.010468,-0.0026977,-0.0045558,0.00279,0.0025659,0.0051766,-0.007745,-0.0069452,0.0063865,-0.013598,0.00032359,0.0020948,-0.0030191,0.023209,0.0057306,-0.0059264,0,0,0,0.0078112,-0.00049861,-0.010736,0.009042,-0.0008945,0.0034091,-0.018363,-0.0049604,0.0099704,-0.0040959,0.022118,0.00026182,-0.0047025,-0.0015613,0.0024033,0.0052666,0.0018977,-0.01017,0.0040162,0.0079471,0.0024143,0.003744,0.0049354,-0.009957,-0.001791,0.0043665,-0.013847,0.0076989,-0.009826,-0.0011406,0.0088455,0.0096326,-0.0066338,0.0027965,-0.0067715,0.0030038,0.0022291,-0.00031073,0.00047447,0.0068909,-0.0035398,0.0012871,-0.0052812,0.012263,-0.0067484,-0.0086205,0.0055724,-0.0080295,0.0008926,0.014006,-0.0098095,0.0024227,-0.00010635,0.0031104,0,0,0,-0.0066352,-0.0033477,-0.010321,-0.0041579,-0.010356,0.0054944,-0.020285,-0.010876,0.014579,0.0046914,0.0036455,0.00611,-0.000053503,-0.0040147,0.0079708,0.0027037,-0.0005134,0.0069088,-0.0073299,0.00048173,-0.0018109,-0.0038416,0.0088797,-0.0037158,-0.0023553,0.0017674,0.0030532,0.0065511,0.00043991,0.00051319,-0.0064554,-0.0017682,-0.005216,0.0045986,-0.000030256,0.0051635,0.00054855,0.017637,-0.0038882,0.00073698,0.011719,-0.0013716,0.0043078,-0.0073169,-0.0013183,-0.0035151,-0.0067251,0.0053421,0.0002213,-0.0055215,0.013995,-0.010191,0.012564,-0.0067687,0,0,0,0.0012429,-0.029284,-0.0023628,-0.0039874,-0.013821,0.0066615,-0.0050692,-0.012833,-0.014502,-0.0052395,0.0011802,0.0090558,0.0023195,-0.0029386,0.0012475,-0.010691,-0.0079739,0.0096987,-0.0084427,0.0065092,0.0031308,-0.0080671,0.00063873,-0.010691,-0.0025793,-0.0033605,-0.0067462,0.0094833,0.015316,0.0071621,0.0038639,0.0014187,-0.0033526,-0.0022419,-0.0014887,0.0089317,-0.0075675,-0.0047586,-0.0002345,0.0016139,0.0052803,-0.0018914,0.00012138,0.0066915,-0.0051056,-0.00018731,0.0065091,0.0031574,-0.015119,-0.0031631,0.0040343,0.0098666,0.0036722,0.0037253,0,0,0,0.003059,-0.0087161,-0.016159,-0.0030619,-0.0053803,0.0009189,-0.0025086,-0.0073238,-0.0034506,0.00068393,0.011504,-0.00079093,-0.0023629,-0.0029467,0.011303,0.01871,0.00012666,-0.00029667,0.0072209,-0.0043507,0.0056475,0.0098077,0.022108,0.0070252,0.006726,0.019925,0.011669,-0.0051722,-0.0040099,0.023251,-0.0090158,0.0016187,0.0057611,0.0051929,0.0044586,-0.016151,-0.0082721,0.0016167,0.012736,-0.0080624,0.0063691,0.0038974,-0.0039861,0.001748,0.013779,-0.004503,0.0088036,0.0082866,0.012524,0.0068926,-0.0021426,-0.0013042,-0.019215,-0.0040198,0,0,0,0.019372,-0.024569,-0.0041856,0.00087134,-0.015962,0.011434,-0.00015808,-0.0033279,-0.0015717,-0.0051943,-0.0023992,-0.0048326,0.0017403,0.003726,0.0040771,-0.0025153,-0.030955,-0.001101,0.0097628,-0.0014025,0.0050176,-0.0057743,-0.0053908,0.024544,-0.0046719,-0.00008923,-0.00014633,-0.0062719,-0.0062316,0.0046813,0.0054866,-0.011427,0.0015148,-0.00035105,-0.0032956,0.0089527,-0.0061829,-0.0079548,0.0043499,-0.00030883,0.0093778,0.013909,0.0012359,0.010639,0.0026574,0.010459,-0.017864,-0.0084468,0.0072782,-0.0068903,-0.0081396,-0.018115,0.0051326,0.011762,0,0,0,-0.020772,-0.0017669,-0.016672,0.012363,-0.0013503,-0.0058738,0.0061275,-0.0064068,-0.011468,0.0088689,0.0017471,-0.0045113,0.0092276,0.0054284,0.011048,-0.014224,0.0069229,-0.0069634,-0.0065095,-0.017064,0.0021697,-0.012176,-0.011961,0.010136,-0.0047785,0.0016776,0.0069009,-0.012269,0.0012216,-0.0062304,0.012356,-0.011889,0.023798,0.0049916,-0.02223,0.0022767,0.013787,-0.0051885,0.0081057,0.0088729,-0.0033324,0.0038404,-0.0021709,0.0006856,0.020211,0.00547,-0.017786,0.0018129,-0.0012081,-0.022633,0.001302,0.0049945,0.0059515,0.0036976,0,0,0,-0.0035001,-0.0078764,0.0054887,-0.00013002,0.0076564,-0.00077386,0.0044932,0.0054471,0.0053998,0.014607,0.0057125,-0.0058431,-0.0092776,0.0019365,-0.0074251,0.0058369,0.0043678,-0.0068334,-0.0031011,-0.0049825,0.005487,-0.0071534,-0.032823,-0.012171,0.000013323,-0.014967,-0.0085292,0.0077977,-0.007502,0.01212,0.018411,-0.0038237,-0.0013187,0.0074533,0.010092,0.0010535,0.0058627,-0.006553,-0.004135,0.0046858,-0.009691,0.0072966,0.007212,0.0081925,-0.00020408,0.0060147,0.004115,0.0040633,-0.0046403,-0.0094141,0.0042069,0.0024632,0.0054706,0.016337,0,0,0,-0.012346,0.0043286,0.020407,-0.0077317,0.0084967,0.008691,-0.016747,0.0097146,-0.015025,-0.019202,-0.0056343,-0.0048473,0.0022935,0.0061203,-0.0088493,0.008651,0.0068227,-0.0041017,-0.0022111,0.0033628,0.00022298,-0.0034482,-0.0039908,0.015009,0.010955,0.011738,0.022793,-0.0062926,-0.0031603,0.007152,0.0085702,0.010798,0.023421,-0.00018427,0.0077188,-0.0032061,0.0098178,-0.0046706,-0.0063775,0.0071658,0.00060856,0.0042754,0.0074432,0.00089997,0.00029401,-0.007514,-0.0013103,0.0075141,0.015108,-0.0082914,-0.01097,0.0033083,-0.014808,-0.0041832,0,0,0,0.0029988,0.010197,-0.0089527,-0.001068,0.0070939,0.000050718,-0.0071155,0.00071487,0.0017334,-0.0014754,-0.0037896,0.011022,0.0036374,0.002228,0.0059023,0.0052941,-0.00097663,0.009345,0.011752,0.018698,-0.0015572,0.0024732,0.0035988,-0.00012246,0.013099,-0.0011029,-0.019889,0.002712,-0.00054212,-0.0054349,-0.00032942,0.0059691,-0.00069801,0.010396,0.0030348,-0.013441,0.010551,-0.010201,0.001478,0.0096769,0.0089047,0.0043675,0.0045884,0.0059563,0.0026879,0.010117,0.0018814,0.0067025,0.015762,-0.0018028,0.0041019,-0.000227,0.0079964,-0.00042453,0,0,0,0.01185,0.0034559,0.020294,0.0010549,-0.0029157,0.0079033,-0.0077678,0.015078,-0.0099936,0.0046979,-0.0019602,0.00239,-0.007643,0.017766,0.0040889,-0.010354,0.015568,0.019537,0.003271,0.0065069,0.0062252,-0.0057636,0.0039636,0.023406,-0.0044069,0.0096052,0.010219,-0.0043756,0.011415,0.0030694,0.013053,0.0060525,0.0021406,-0.0039995,0.00747,0.0060856,0.00069476,0.0042838,0.0094758,-0.0050989,0.0016164,0.0031985,-0.0037044,-0.0095569,-0.0024223,-0.004734,0.008077,-0.015647,0.016803,0.00037245,-0.018038,0.0018196,0.0059648,-0.0036805]};
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
    // the one clock of the warp (spec 30): it advances by the fixed step and restarts from its starting value at the
    // ceiling. driveT is not wrapped with it: it goes on easing towards the clock, so at a restart the driven end sweeps
    // rapidly back along its own path instead of being set down at a new place
    function tick() { simTime += DT; if (simTime - CLOCK0 >= LAT.clockMax) simTime = CLOCK0; }
    const stored = !fresh && START && START.n === N && START.key === netKey();
    if (stored) {
      for (let k = 0; k < NP * 3; k++) { pos[k] = START.pos[k]; vel[k] = START.vel[k]; }
      // the stored state's clock, brought inside the ceiling, with the drive's lag behind it kept
      simTime = CLOCK0 + ((START.t - CLOCK0) % LAT.clockMax); driveT = simTime - (START.t - START.dt);
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
      // the unchanging part of the push, drawn once and kept for the whole life (spec 25)
      const jh = SPARK.jitter * SPARK.jitterHeld;
      sJit[k] = jh * gauss(); sJit[k + 1] = jh * gauss(); sJit[k + 2] = jh * gauss();
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
      const fr = SPARK.friction, g = SPARK.gravity, box = SPARK.box;
      // the push's fresh part, redrawn every step: the strength left over once the unchanging part is taken out, so
      // jitter is the whole push's strength and jitterHeld only moves it between the two parts
      const jf = SPARK.jitter * Math.sqrt(Math.max(0, 1 - SPARK.jitterHeld * SPARK.jitterHeld));
      for (let i = 0; i < S; i++) {
        if (!alive[i]) continue;
        const k = i * 3;
        spPrev[k] = sp[k]; spPrev[k + 1] = sp[k + 1]; spPrev[k + 2] = sp[k + 2];
        const ax = sJit[k] + jf * gauss() - fr * sv[k], ay = sJit[k + 1] + jf * gauss() - g - fr * sv[k + 1],
          az = sJit[k + 2] + jf * gauss() - fr * sv[k + 2];
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
      tick(); steps++;
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
      get clock() { return simTime; },   // the warp's one clock, for the measuring tools (spec 30: it runs to a ceiling)
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
          if (i < n - 900) { tick(); lattice(); stepNet(); } else step();
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
