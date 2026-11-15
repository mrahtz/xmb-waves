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
                                    // warm-up runs warmDecays of them (the first warmSettle steps with heavy damping)
    warmSettle: 1500, warmDecays: 3,
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
    rollAmp: 0.05, rollGrow: 2.664, rollWaves: 1.141, rollW: 0.3, rollMod: 0.35, rollModW: 0.0615,
    // one soft hump sliding back and forth along the length (centre and travel as fractions of the length; part of
    // its travel lies beyond the shaken end)
    bumpAmp: 0.12, bumpWidth: 0.25, bumpCentre: 0.25, bumpTravel: 0.5, bumpW: 0.0555,
    bobAmp: 0.02617, bobW: 0.09,     // the whole sheet rising and falling together, much more slowly than the swell
    twistAmp: 0.04, twistW: 0.29,  // a gentle ripple, one cycle across the width, travelling across it
    // the four parts' phases at clock 0 (spec 18: fixed, the same at every start, never drawn per run): swell strength, bump,
    // bob, swell, twist. Fitted with tools/measure/phasefit.js to the band's height, tilt and centre speed that the footage
    // shows 40 s and 240 s after the start
    ph: [3.3562, 0.4816, 2.2871, 2.684, 3.8807],
  };
  // Scene mapping of the deformed net (scene units; x along the length, y up, z away).
  const SCENE = { len: 15, x0: 1.9, wid: 8, height: 3.8, y0: 0.05, z0: 0.0, tilt: 0.0 }; // tilt: rise per unit length towards the near end
  // wid (spec 22): the scale of the net's gathered width into the scene. The net is bunched across its width (one shared driven
  // path), so at 4.7 the visible surface spanned less depth down a screen column than from left to right: a strip. At 8 the
  // depth across the band is about ten times the change along the screen, and the far width shows above and below the folds

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
  const START = {"n":19,"key":"{\"kStruct\":0.3119,\"kBend\":2.247,\"alongRest\":1,\"acrossK\":0.8382,\"damping\":0.000139,\"noise\":0.00008,\"push\":0.012,\"driveA\":0.05,\"driveW1\":0.1047,\"driveB\":0.03,\"driveW2\":0.1571,\"drivePhase1\":0.4472,\"drivePhase2\":0.55,\"driveEase\":0.02}","t":399.7166666666318,"dt":398.8999999999652,"pos":[0,-0.0399047,0.5272,0.0736236,-0.0763582,0.53854,0.116223,-0.0372203,0.531847,0.184656,-0.0619885,0.517463,0.237112,-0.0474873,0.532657,0.302596,-0.0442229,0.508391,0.343846,-0.0121621,0.530777,0.413424,-0.025599,0.520119,0.458624,-0.00662253,0.543105,0.508801,0.0177969,0.546154,0.5747,0.00190888,0.554789,0.619517,-0.0140598,0.569479,0.667664,0.00402357,0.597177,0.726378,0.00111549,0.595664,0.783015,-0.00021814,0.605028,0.839121,-0.00902997,0.60222,0.896443,0.0190014,0.621997,0.938514,0.0185745,0.641925,1.01417,0.0171071,0.63955,0,-0.0490086,0.529803,0.044845,0.00441317,0.519609,0.0946067,-0.0265541,0.486032,0.151203,-0.0207208,0.523793,0.199581,-0.0105509,0.516046,0.264015,0.00384386,0.49576,0.31455,0.0180678,0.504064,0.370729,0.0260485,0.502728,0.42578,0.0328689,0.512257,0.479663,0.0572032,0.50926,0.531371,0.0541928,0.532227,0.5778,0.0161996,0.552538,0.632733,0.0377597,0.582463,0.685369,0.0341323,0.572201,0.740024,0.0251731,0.574793,0.797799,-0.005844,0.584079,0.848089,-0.0030881,0.600448,0.904725,0.0206473,0.606995,0.965535,-0.00221405,0.601934,0,-0.0484736,0.523616,-0.00612965,0.00687168,0.519819,0.0460261,0.0312732,0.478172,0.0971664,-0.00346402,0.487894,0.152206,0.00810391,0.479072,0.205287,0.00265366,0.477318,0.266029,0.0295253,0.471432,0.312906,0.0205691,0.504971,0.379172,0.041348,0.490181,0.429598,0.0428856,0.482551,0.496896,0.0433007,0.489445,0.541274,0.0405558,0.511499,0.600351,0.053651,0.514529,0.656263,0.0338287,0.521807,0.706571,0.0300932,0.535473,0.76389,0.0165727,0.540034,0.814473,0.0376036,0.554638,0.863118,0.0516452,0.57348,0.927373,0.0328466,0.573145,0,-0.038405,0.510463,-0.0537711,-0.0112676,0.46122,0.00715069,0.0213322,0.421092,0.0603552,-0.00824681,0.446707,0.120878,-0.00606675,0.435432,0.174168,-0.0435995,0.446283,0.226649,-0.0170774,0.451612,0.279673,-0.0213663,0.455984,0.339016,-0.0142026,0.470419,0.391932,-0.00501552,0.473468,0.460221,0.00570673,0.463394,0.506018,0.0102563,0.480274,0.571703,0.0034362,0.496979,0.611736,0.0130912,0.486796,0.671969,0.0195939,0.479565,0.727102,-0.000225896,0.502211,0.776212,-0.00684506,0.515108,0.841027,-0.00973149,0.531176,0.894057,-0.00277788,0.524961,0,-0.0207829,0.494224,-0.00760677,-0.0597049,0.440951,0.0280959,-0.0398801,0.390287,0.0827759,-0.03506,0.384685,0.137905,-0.0561712,0.396116,0.196034,-0.0609446,0.381173,0.250166,-0.0560316,0.398767,0.304291,-0.0558301,0.41974,0.357322,-0.0537627,0.427685,0.40986,-0.0570512,0.452398,0.465151,-0.0488602,0.450928,0.524796,-0.0473834,0.444042,0.584303,-0.0211821,0.444122,0.643126,-0.0365305,0.438548,0.699356,-0.0153759,0.437218,0.755919,-0.0218571,0.43881,0.80663,-0.0231292,0.469347,0.860263,0.00111247,0.479178,0.91,-0.0469189,0.487657,0,0.000926589,0.479689,0.042598,-0.0474522,0.446729,0.080505,-0.0628635,0.427606,0.134836,-0.0733178,0.399282,0.199323,-0.0715846,0.402924,0.24984,-0.0746161,0.374876,0.307399,-0.0538469,0.393331,0.362863,-0.056432,0.395783,0.420034,-0.0624275,0.420881,0.473932,-0.0471942,0.417558,0.535323,-0.063064,0.427982,0.589467,-0.0372496,0.434783,0.651852,-0.0467908,0.432391,0.700241,-0.0310006,0.431689,0.76035,-0.0169088,0.428673,0.815335,-0.033435,0.441186,0.869521,-0.021862,0.461583,0.923216,0.00375451,0.448263,0.982952,-0.0372641,0.463674,0,0.0224539,0.471144,0.0843238,-0.000148264,0.449363,0.121936,-0.0123378,0.443499,0.183284,-0.0446035,0.419148,0.231672,-0.0706681,0.439418,0.292545,-0.0836453,0.436556,0.345917,-0.072831,0.448684,0.405656,-0.0831988,0.452713,0.462548,-0.0511287,0.457124,0.515976,-0.0585659,0.464041,0.576132,-0.0258276,0.470559,0.628772,-0.0398854,0.469788,0.691203,-0.0229491,0.471727,0.738359,-0.0430638,0.482866,0.799081,-0.0399142,0.489415,0.848792,-0.0360909,0.501758,0.905369,-0.0541801,0.520317,0.960152,-0.0272507,0.493149,1.01498,-0.0462532,0.509738,0,0.039565,0.471111,0.0805532,0.0395646,0.49711,0.115684,0.0195957,0.48258,0.17953,0.00532555,0.456151,0.227029,-0.0181468,0.493039,0.288431,-0.0234367,0.465064,0.346366,-0.011477,0.488417,0.401192,-0.00889924,0.479523,0.461833,0.000311962,0.492546,0.505546,-0.0265699,0.526611,0.567794,-0.023153,0.524204,0.614794,-0.00788646,0.539766,0.674905,0.0107003,0.522578,0.718995,-0.0277169,0.547822,0.785184,0.000527448,0.535282,0.83792,-0.0215925,0.553948,0.8891,-0.0261324,0.572259,0.940781,0.00175295,0.560535,1.00279,-0.0257524,0.568437,0,0.0488946,0.479598,0.0407481,0.0481959,0.54013,0.0862944,0.0161703,0.530092,0.143173,0.00400958,0.507833,0.19922,0.00507651,0.521601,0.25603,-0.00278155,0.51103,0.30842,-0.00757554,0.523555,0.36586,-0.00869723,0.526939,0.425082,0.0101277,0.536705,0.48237,0.0176613,0.532997,0.52833,0.0274074,0.557602,0.588398,0.0182265,0.550629,0.64135,0.02579,0.550328,0.695365,0.024256,0.56612,0.751817,0.037417,0.554777,0.800946,0.00789669,0.590109,0.854277,0.0159045,0.593792,0.908451,0.0217442,0.587657,0.969746,0.0229496,0.574948,0,0.0486078,0.494103,-0.0133579,-0.00327621,0.531115,0.0457596,-0.0494292,0.528795,0.0943571,-0.0273134,0.507874,0.133649,0.0252446,0.50574,0.184628,0.0233109,0.491517,0.247909,0.0207491,0.518837,0.300327,0.0151208,0.514365,0.36168,0.0257683,0.526118,0.40857,0.03077,0.520004,0.471834,0.0410713,0.527519,0.513181,0.0391502,0.541801,0.570722,0.0120611,0.559378,0.626501,0.0284793,0.560585,0.682564,0.0214055,0.579412,0.737247,0.00667158,0.577429,0.778608,-0.0305857,0.606176,0.840436,-0.029937,0.598031,0.894379,-0.0114294,0.605926,0,0.0387609,0.510348,-0.0118952,-0.00282397,0.464284,0.0269709,-0.0473518,0.452247,0.090596,-0.0419689,0.429789,0.123491,0.00889704,0.442173,0.185191,0.0166544,0.424504,0.234492,-0.00376492,0.44313,0.288284,-0.017418,0.454766,0.34523,-0.00970434,0.463529,0.400575,0.0149862,0.460189,0.458038,0.0135015,0.474653,0.512303,0.0187626,0.476376,0.559959,-0.0357116,0.504184,0.618081,-0.0139476,0.497769,0.671225,-0.0403644,0.527044,0.724103,-0.0223566,0.519133,0.775319,-0.0511868,0.54564,0.828349,-0.0296547,0.529654,0.894853,-0.0646308,0.536006,0,0.0212906,0.52354,0.0511526,0.0412599,0.468794,0.0602745,-0.00484944,0.430313,0.117381,-0.0246932,0.400785,0.177012,-0.0127212,0.417754,0.233364,-0.0340379,0.40828,0.277277,-0.0319928,0.432024,0.339095,-0.0276334,0.415726,0.383568,-0.0277422,0.444884,0.447236,-0.0217275,0.439247,0.491697,-0.0340774,0.451957,0.550054,-0.0403817,0.478157,0.602637,-0.0558099,0.479535,0.664817,-0.0505914,0.494425,0.721685,-0.0536568,0.507141,0.773652,-0.0528589,0.492058,0.832473,-0.0605135,0.52605,0.889241,-0.0404165,0.497176,0.943144,-0.0478682,0.508905,0,-0.000367007,0.529789,0.0895564,0.009746,0.498532,0.116231,0.0213598,0.474098,0.187063,-0.000655298,0.441807,0.231039,-0.0139982,0.466502,0.288403,-0.0114512,0.448524,0.338139,-0.0473329,0.459795,0.392803,-0.0559306,0.446627,0.443363,-0.0640195,0.476729,0.50422,-0.0402301,0.459697,0.550453,-0.0591927,0.469968,0.615309,-0.0342357,0.474766,0.667477,-0.0420633,0.473363,0.723746,-0.0479794,0.466353,0.772939,-0.0538722,0.478946,0.821699,-0.0363863,0.503687,0.885581,-0.0410559,0.517293,0.928383,-0.0352734,0.469024,0.999595,-0.0366972,0.501462,0,-0.0219525,0.527252,0.0933802,-0.0535092,0.508926,0.1234,-0.0093001,0.512985,0.190418,-0.0154742,0.491949,0.241457,-0.0277371,0.505773,0.306094,-0.0267453,0.491978,0.356405,-0.0313272,0.504776,0.425888,-0.0221983,0.503896,0.474475,-0.0252618,0.513999,0.536503,-0.0234141,0.50418,0.58612,-0.00687262,0.492776,0.643427,-0.00210685,0.476346,0.698631,0.0086785,0.485384,0.753891,0.00755657,0.471532,0.80632,0.0104271,0.470879,0.860907,0.00859851,0.492107,0.914102,0.0135747,0.483259,0.969979,0.0215166,0.463476,1.02299,0.00484207,0.456896,0,-0.0392204,0.516677,0.0723661,-0.10067,0.54095,0.115994,-0.065562,0.536295,0.18092,-0.0583656,0.543109,0.229075,-0.0446077,0.57401,0.294618,-0.043439,0.544255,0.351407,-0.0315778,0.566314,0.409112,-0.0165715,0.552275,0.46173,0.0202442,0.545594,0.519899,0.0250461,0.551781,0.569677,0.039522,0.525559,0.627389,0.0561933,0.532413,0.673527,0.0602786,0.476716,0.733224,0.0566572,0.489386,0.782899,0.0511516,0.447477,0.835137,0.0518953,0.438338,0.893347,0.0374446,0.43748,0.945506,0.0611024,0.413684,1.00864,0.0470831,0.425665,0,-0.0487745,0.501183,0.0266909,-0.0764277,0.581642,0.0612722,-0.0251223,0.594698,0.12866,-0.028106,0.575105,0.177249,-0.00358821,0.590607,0.238034,-0.0142988,0.580806,0.29189,0.00691323,0.573247,0.344738,0.011004,0.567338,0.406824,0.0424413,0.57657,0.450858,0.0464443,0.547889,0.502146,0.0564563,0.519602,0.558801,0.0700828,0.513655,0.612344,0.076446,0.491828,0.665078,0.086791,0.465324,0.723895,0.0937379,0.46634,0.772654,0.0592238,0.448315,0.830987,0.0737396,0.435623,0.881564,0.0473765,0.406366,0.942563,0.0723536,0.41824,0,-0.0487359,0.48534,-0.00392836,-0.0249355,0.547934,0.0450631,0.0177644,0.563541,0.0997051,0.0236947,0.556672,0.154223,0.020148,0.535862,0.201562,0.00486053,0.523628,0.261107,-0.0115093,0.53254,0.313296,0.0116538,0.520635,0.365487,0.0301809,0.532416,0.417894,0.0396785,0.495538,0.468198,0.0343426,0.497223,0.52773,0.0774992,0.476461,0.56512,0.0669344,0.442264,0.630842,0.088435,0.437207,0.681167,0.0885143,0.420549,0.735701,0.0622107,0.388061,0.791595,0.0633761,0.391021,0.843065,0.0698809,0.351426,0.905802,0.0839222,0.388286,0,-0.039112,0.473821,0.0184,-0.00815636,0.500994,0.0278787,0.0537591,0.529436,0.0982887,0.0733525,0.518324,0.126307,0.0254461,0.491562,0.169367,-0.0209871,0.487824,0.228312,-0.0116045,0.488061,0.278818,-0.0300757,0.481463,0.33395,-0.00262265,0.512141,0.382294,0.00806464,0.473285,0.417967,0.028301,0.453111,0.468022,0.077262,0.45273,0.526147,0.0435722,0.435535,0.574571,0.0561885,0.43324,0.642762,0.0475657,0.415169,0.673229,0.0644535,0.384519,0.735516,0.0771869,0.371991,0.790681,0.0565157,0.35953,0.853154,0.0711168,0.357479,0,-0.0217956,0.470024,-0.01527,0.0500467,0.473052,0.0412562,0.0806068,0.474354,0.0969982,0.0883994,0.473506,0.146826,0.0776909,0.44426,0.167302,0.0189517,0.425769,0.210981,-0.00863083,0.439832,0.236353,-0.0523145,0.473696,0.311184,-0.0466204,0.471327,0.340008,-0.0219457,0.437585,0.404531,-0.0191246,0.422662,0.427141,0.0437734,0.445657,0.474413,0.0613266,0.381407,0.532711,0.0581107,0.402504,0.584756,0.0527796,0.366974,0.627466,0.0802863,0.340031,0.690182,0.0780424,0.364657,0.738639,0.0575049,0.355372,0.804195,0.0619154,0.349292],"vel":[0,0,0,0.0039623,0.0067904,0.0068557,-0.004619,-0.010952,0.009003,0.0058421,0.0057956,0.015036,0.0050978,-0.0027947,0.013692,0.0091417,-0.0078978,-0.0046483,-0.0037776,-0.008162,0.0073917,0.010017,-0.0023603,0.0082317,0.011889,0.007919,-0.0085782,-0.0067151,0.001739,-0.0019321,0.0067704,0.0020826,-0.0024495,0.00031163,0.00061704,0.0073499,0.0070899,0.014005,-0.0027505,0.0168,-0.0066434,0.0030609,-0.0055815,0.0048299,0.018062,0.0050386,0.012254,-0.0010378,0.0098107,0.01408,0.0017578,-0.0035128,0.014982,-0.00655,-0.010683,0.011402,-0.0031364,0,0,0,-0.0033499,-0.0071599,-0.0034658,-0.002673,-0.001018,-0.0015109,-0.00092801,-0.0031382,0.0025545,-0.0033461,-0.0016308,0.017829,-0.018656,0.00070499,0.0068272,-0.0054091,-0.0071258,-0.0067315,0.00080777,-0.010954,0.017313,0.0079318,0.013167,-0.001042,0.0072938,0.0027438,-0.0011178,0.00035205,-0.011531,-0.0036523,0.0054163,0.0076399,-0.011884,0.00034871,0.00058893,-0.00063168,0.0005174,-0.0089398,-0.003652,0.012827,0.0091759,0.014286,-0.0043697,0.0038613,0.0020083,0.0095073,0.0077343,0.0044335,0.0025088,0.012112,0.0044322,0.0048291,0.016247,-0.0054614,0,0,0,-0.0025103,0.0020921,0.007192,0.00013262,-0.0058318,-0.0077706,0.0043487,0.0043384,0.0010652,0.00044531,0.0017066,0.0069246,-0.0039486,-0.0063783,0.0091478,0.0035667,-0.0038809,0.0015141,-0.0026391,-0.014681,0.0043838,-0.00042427,-0.0015804,0.0074574,0.011944,-0.0025646,0.0035142,0.0075783,-0.009592,0.00078535,0.0032628,-0.00065978,-0.0082709,0.0050264,-0.0036335,-0.017613,0.003564,0.0043025,-0.0048162,-0.0047643,0.0052208,-0.0073075,0.012325,0.0077901,-0.0032729,0.012275,0.0025721,-0.0035293,0.0043243,0.011151,-0.014481,0.002861,-0.00052757,-0.0074256,0,0,0,0.010818,0.010164,-0.019192,0.0038403,-0.005046,-0.0040351,-0.0050657,0.0025755,-0.004158,0.010757,0.005738,0.0022163,-0.00057904,-0.017885,-0.0090941,0.00045619,-0.01118,-0.0020102,0.0066892,-0.0027639,-0.0052363,0.018169,-0.0062417,-0.0046131,-0.0033644,0.002208,0.0092133,-0.007264,0.0024629,-0.010024,-0.0064096,-0.0024276,-0.0098215,0.0081841,0.0048116,-0.017665,-0.0068971,-0.010206,0.0048908,0.005483,0.0052216,0.0083041,0.014315,-0.0074694,0.0023437,0.0040119,0.0060322,-0.013905,0.0088779,0.015595,-0.0047665,0.0048703,-0.0061462,-0.0093621,0,0,0,0.0066,0.0043295,-0.001543,0.0026711,-0.0082537,-0.000823,0.0057666,0.013241,-0.0095892,0.0029773,-0.00082183,-0.0029733,0.00018675,0.0036517,0.0028052,0.0080525,0.009716,-0.019711,0.017229,-0.001212,-0.011044,-0.0028358,0.002649,-0.0053274,0.013934,-0.001054,-0.00031533,0.0030552,-0.00037844,0.0028813,-0.004369,-0.013637,-0.0059228,-0.0068672,-0.0085911,-0.010368,0.0025055,0.000037235,0.013347,0.0030224,-0.0063478,-0.0052326,-0.0020671,-0.0057036,-0.00030715,-0.00058074,-0.0016643,-0.010303,0.01841,-0.0012659,-0.00035673,-0.0074317,-0.027605,0.0029276,0,0,0,0.011049,0.014952,0.00062887,0.001228,0.0075,0.011878,0.0017845,-0.01861,0.0057031,0.0084181,-0.0049452,-0.00049921,0.00066468,-0.0029243,-0.0026621,0.00039128,-0.007516,-0.0099528,0.015481,-0.00070699,-0.0096928,-0.006361,0.0022721,-0.0015729,0.0064114,-0.0069238,-0.0047139,0.0039622,-0.010258,0.011308,-0.010108,0.001683,0.0067828,0.013591,-0.013809,0.0099836,0.0053672,-0.0008288,0.0021411,0.0034738,-0.026472,-0.0003775,0.011778,-0.014614,-0.0064252,0.011513,-0.020452,0.0062739,0.0048505,-0.023093,-0.0013599,0.0029953,-0.0020116,-0.0033712,0,0,0,0.012343,0.0048168,-0.012863,-0.0069153,0.011994,-0.000065032,0.0081111,0.015233,-0.0091612,-0.0045265,0.0088141,0.00027605,0.0041743,0.011369,0.017477,-0.0016078,0.0010741,-0.0014147,-0.0085372,-0.0060141,0.0021534,0.000098914,0.0057042,0.0046037,-0.0075308,-0.0023046,0.0041446,-0.00083978,-0.0077803,-0.00055184,-0.0071433,-0.01557,-0.0029162,0.0039664,-0.0049137,-0.0017764,0.0016185,-0.0070019,0.0060333,0.0018642,0.0045253,-0.002129,-0.0064842,-0.012915,0.0027269,-0.0048809,-0.0061851,0.0076741,0.012687,-0.00707,0.0059375,-0.0022946,-0.0089338,0.0034154,0,0,0,0.016206,0.0093565,0.005517,-0.0083739,-0.0018126,0.0077084,0.0011878,-0.0041041,0.010401,-0.0013063,0.0063584,0.0024821,0.0024881,-0.0024253,-0.0029984,0.0094988,-0.0068041,0.0074458,0.0053134,0.0039336,0.0023104,-0.0016266,0.0017949,0.0024836,-0.0064083,0.005656,-0.0039253,0.00046767,0.012129,0.0027918,0.0060633,0.013122,-0.0046493,0.0080558,0.0078297,-0.0018454,-0.010788,-0.0012092,0.0051048,0.00073145,0.0056489,-0.0023055,-0.010871,-0.0021645,0.0069612,-0.0013047,0.0010938,0.016775,0.0040637,0.0057086,-0.0013507,-0.00065078,-0.0036673,0.0099866,0,0,0,-0.012926,-0.0054646,0.004095,-0.00088211,0.0049192,-0.00048207,-0.011832,0.0050765,-0.0036935,-0.010791,0.00054856,-0.0021016,0.011207,0.0059203,-0.003316,-0.0097982,0.0058758,0.0035254,0.004638,0.028437,-0.0022561,0.00080648,0.0084096,-0.0077746,-0.0048098,0.012637,-0.010217,-0.00055372,0.012404,-0.0095985,0.015662,0.0068301,-0.0021345,0.0023621,0.0013229,-0.014263,0.0022737,0.0055434,0.0031886,0.0087505,-0.004265,-0.02583,0.010098,0.011595,-0.0011259,0.0017721,0.009966,-0.0095176,0.019586,0.0078649,-0.0029067,0.00095983,0.0021421,-0.0091197,0,0,0,-0.00019674,0.0078511,-0.0075872,0.013871,-0.0050435,0.009737,0.010699,-0.0079091,0.013198,0.0048735,0.00092628,-0.001385,0.0088125,-0.0018712,-0.0076728,-0.0044937,0.0045198,-0.014232,0.0028995,-0.00088839,-0.0023069,-0.0089149,0.013916,-0.0089538,0.0045411,0.0025327,-0.018005,-0.001002,0.0091543,-0.0013874,-0.0012647,0.005158,-0.0078276,-0.0033068,-0.00053099,-0.0051577,0.014995,0.0062371,-0.00010403,0.0075083,-0.0065319,-0.000074751,0.0055934,0.00043906,0.0061349,0.0060838,0.01462,0.0067037,0.0042758,0.012694,-0.0085833,0.0073213,0.026404,-0.0049813,0,0,0,0.0041215,-0.011996,0.0086024,0.013937,-0.0033229,0.0032414,-0.007661,0.0066336,0.0052974,0.00823,-0.012947,0.013685,0.01001,-0.0083302,-0.00088103,0.005617,0.004953,-0.0088329,0.0053955,0.0078409,0.0023158,0.0034575,0.0079795,0.0021431,0.000084355,0.0056321,0.0060912,-0.003823,-0.0058273,-0.0030429,0.0067746,-0.010104,-0.0066599,0.010019,0.0047763,0.011827,-0.003507,0.0086948,0.0013992,-0.0021036,0.0088727,0.0016223,0.0023233,-0.010901,0.010488,0.0011106,0.0022561,0.012332,0.014001,0.00061363,0.017166,0.012347,0.0084555,-0.00032895,0,0,0,-0.007489,-0.0038372,-0.012007,0.0056941,-0.008545,0.0018799,-0.0038193,-0.000009735,0.011159,0.010403,-0.0045707,0.0079231,0.0011123,0.0049896,-0.0014317,0.0088661,0.0027049,-0.000039097,0.0018338,0.0010793,-0.00095844,0.0020826,0.0051075,-0.00029103,-0.008241,0.0080219,-0.0028789,0.0030187,-0.0093765,-0.0098653,0.0095356,-0.00051256,0.00016588,0.0098832,-0.0022289,-0.0010044,0.0042685,0.005082,0.0030648,0.0039141,0.0059947,-0.0016265,0.0080533,0.0028301,0.01346,-0.0010568,-0.000027326,0.0034791,0.0012679,0.012867,0.0094822,-0.00074124,0.01499,-0.0051957,0,0,0,0.0014322,-0.0024809,0.00050653,0.0050014,-0.0025335,0.0092702,-0.0034887,0.0014693,0.00032457,0.0031581,-0.00023036,0.010714,0.0038938,0.0052453,0.0076102,-0.0018759,0.015364,0.011807,0.0047065,0.01135,0.014408,0.0097051,-0.0022555,0.014205,-0.0010381,0.0095015,0.011016,0.0082151,-0.005543,-0.0066995,-0.0014694,0.0038335,-0.0047232,-0.0020991,0.00021675,-0.00046813,0.0023698,-0.0098229,-0.0025318,-0.0039202,0.00081133,-0.020265,-0.012283,0.0087071,0.0013745,-0.0070264,-0.0018801,-0.0019258,0.0013263,0.0060843,0.002612,0.0017053,0.0051342,0.016313,0,0,0,-0.0020761,0.008253,-0.0037211,0.013299,-0.010388,-0.00094013,0.0032706,-0.0036948,0.013262,0.0067227,-0.011153,-0.003322,-0.0028433,-0.010309,0.0091655,-0.0018721,0.0018098,-0.0065841,0.0070389,0.0051787,0.0010184,0.0045919,-0.0047293,0.0069039,0.00043417,0.0005274,0.0037033,-0.0062712,0.0068453,0.0091858,0.0034072,0.0076936,-0.0029809,-0.0023034,0.00058799,0.00064862,-0.0033741,-0.0051321,-0.0019035,-0.0042859,0.00078775,0.0031964,-0.0029482,0.012235,0.014771,0.00089819,-0.0040837,0.00045336,0.0033056,0.0078754,-0.016795,0.0025929,0.00099274,-0.011404,0,0,0,0.013354,0.0026301,-0.0069829,-0.012528,-0.0023739,-0.0020899,0.0029779,-0.01153,-0.00073393,-0.0044043,-0.014228,0.0089253,-0.0055049,-0.010688,0.0022924,-0.0047365,-0.010156,0.0050636,-0.0071628,0.0089881,0.013748,-0.016393,0.0033622,-0.00068385,-0.0018926,-0.0026317,-0.0047258,-0.0013209,0.0012587,-0.014577,0.0080665,0.0051575,-0.00033186,0.0039963,0.0070797,0.0085566,-0.011837,0.013288,-0.007921,0.0081929,0.0064792,-0.0024458,0.0024673,0.0050421,-0.014225,-0.0089931,0.0050135,0.0012892,-0.014721,0.0042311,0.0026186,-0.0056232,0.0065195,0.013508,0,0,0,0.0080417,-0.002271,0.0074931,-0.005337,-0.0023278,-0.00013928,0.0020036,-0.017078,-0.00011977,0.00094438,-0.0088721,0.0031074,0.0031496,-0.004717,0.012639,0.0042343,-0.011711,-0.0054462,-0.010515,-0.0058933,0.0021343,-0.0040678,-0.0139,0.015312,-0.0038882,-0.011594,0.0026692,-0.011828,-0.0014969,0.014922,-0.0014638,0.0025027,0.011746,-0.0080927,-0.0026944,0.0049532,-0.0037297,-0.010767,0.0050057,-0.0024942,0.0063006,0.010205,-0.0136,-0.0042068,-0.0027802,-0.005953,-0.0054394,-0.0063753,0.0070816,0.0049234,0.010129,0.0017361,-0.0061707,0.0059887,0,0,0,-0.0070213,-0.0028258,-0.00030474,0.01005,-0.007136,0.001691,0.0041903,-0.0037169,-0.0024413,0.0048319,0.0066937,0.004565,0.010059,-0.0084171,-0.0077682,0.006424,-0.0053296,0.0053561,0.0044035,0.0030739,0.0052457,0.0020266,-0.0026514,0.0011768,-0.0054767,-0.005663,-0.0085075,-0.0041864,0.0060112,-0.0024364,-0.003145,-0.010725,-0.00024436,-0.0056533,-0.0040507,0.0042181,-0.00053978,0.014285,0.0097945,-0.00039102,0.0051081,-0.002375,-0.0098043,-0.0012185,0.0057145,-0.0049739,0.0053865,0.0064418,-0.000442,-0.0023908,0.001794,-0.00018489,-0.017277,0.010492,0,0,0,0.0057578,-0.0028918,0.0058892,0.0053539,0.013195,0.010181,0.02222,-0.000080083,0.025232,-0.0059247,-0.011626,-0.0040881,-0.0050466,-0.0020104,-0.00059669,-0.0085613,-0.010631,-0.008074,0.0023958,0.0053616,-0.00042638,-0.0044571,-0.0087941,0.0077732,-0.0095806,0.001856,-0.0068531,-0.0079144,0.0000017802,-0.002671,0.0025697,0.0066074,0.0054548,0.00028126,0.0013203,-0.0074402,-0.0028689,0.00062511,0.00058828,-0.0020708,0.0042104,-0.005056,0.015497,0.00061267,0.0023085,-0.0015869,0.0039325,-0.00033637,-0.007427,-0.0032104,0.0096123,0.00073978,0.016883,0.0057936,0,0,0,-0.00062133,0.012389,-0.0018564,0.01049,0.0059375,0.011985,-0.00016945,-0.011507,0.0034002,0.016503,0.0022464,0.0065999,0.0085675,0.013911,0.0094558,-0.012407,-0.0029928,0.0092124,-0.0074632,-0.0067202,-0.0015573,-0.0032697,0.0083387,0.016413,0.0045055,-0.0016667,-0.00055788,-0.00043069,0.0012672,-0.0056606,0.0015468,-0.0085333,-0.01517,0.0088398,-0.0091265,0.0013701,-0.0078281,-0.0097459,0.0079112,0.00057455,0.0025886,0.0067634,-0.002907,0.011667,0.006702,-0.003806,-0.0092131,0.0017109,-0.0092978,0.00052785,-0.010417,0.0069841,-0.0019927,0.0037307]};
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
