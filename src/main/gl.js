// ---------------------------------------------------------------------------
// WebGL setup
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const SCORE = params.get('mode') === 'score';
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false,
  premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
if (!gl) { document.body.textContent = 'WebGL2 is not available.'; window.XMBW = { ready: Promise.reject(new Error('no WebGL2')) }; return; }
const floatRT = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
gl.getExtension('EXT_float_blend');

