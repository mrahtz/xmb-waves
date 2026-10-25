# usage: mkprof.py NAME [ss=2] [samplesAlong=64] -> var_NAME.html: the current build with per-pass CPU timing (gl.finish between passes) and simulation step timing, for profiling only
import sys, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from buildsrc import read_sources, WORK
name=sys.argv[1]; kv=dict(a.split('=') for a in sys.argv[2:])
texts, order = read_sources(); head=texts['head.html']; sim=texts['sim.js']; main=''.join(texts['main/'+n] for n in order)
def rep(t,old,new):
    assert t.count(old)==1,(old[:50],t.count(old)); return t.replace(old,new)
main=rep(main,"window.XMBW = { ready: Promise.reject(new Error('no WebGL2')) }; return; }",
 "window.XMBW = { ready: Promise.reject(new Error('no WebGL2')) }; return; }\nwindow.__gl = gl; window.__P = { t: 0, acc: {}, fb: null, px: new Uint8Array(4), sync() { if (!this.fb) { const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); this.fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0); } const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px); gl.bindFramebuffer(gl.FRAMEBUFFER, prev); }, mark(n) { this.sync(); const t = performance.now(); this.acc[n] = (this.acc[n] || 0) + (t - this.t); this.t = t; } };")
main=rep(main,"function renderFrame(st, outTarget) {\n","function renderFrame(st, outTarget) {\n  __P.sync(); __P.t = performance.now();\n")
main=rep(main,"  if (stopAfter < 2) return;\n","  __P.mark('background gradient');\n  if (stopAfter < 2) return;\n")
main=rep(main,"  if (stopAfter < 3) return;\n","  __P.mark('wave draw (supersampled buffer)');\n  if (stopAfter < 3) return;\n")
main=rep(main,"  if (stopAfter < 4) return;\n","  __P.mark('glare pyramid');\n  if (stopAfter < 4) return;\n")
main=rep(main,"  if (stopAfter < 5) return;\n","  __P.mark('final composite (wave down-filter, background, glare, dither)');\n  if (stopAfter < 5) return;\n")
main=rep(main,"  // 6. wireframe overlays (settings menu)\n","  __P.mark('sparkles and glints');\n  // 6. wireframe overlays (settings menu)\n")
ss=kv.get('ss','2')
main=rep(main,"  ensureTargets(o.w, o.h, o.w, o.h, 2);","  ensureTargets(o.w, o.h, o.w, o.h, %s);"%ss)
sa=kv.get('samplesAlong')
if sa:
    main=rep(main,"  samplesAlong: 64,","  samplesAlong: %s,"%sa)
sim=rep(sim,"      stepNet();\n      const t = netPrev; netPrev = netCur; netCur = t;\n      deform(netCur);\n      stepSparks();\n      emit();\n",
 "      self.__steps = (self.__steps || 0) + 1; const __a = performance.now(); stepNet(); const __b = performance.now(); self.__simNet = (self.__simNet || 0) + (__b - __a);\n      const t = netPrev; netPrev = netCur; netCur = t;\n      deform(netCur); const __c = performance.now(); self.__simDeform = (self.__simDeform || 0) + (__c - __b);\n      stepSparks();\n      emit(); self.__simSpark = (self.__simSpark || 0) + (performance.now() - __c);\n")
os.makedirs(WORK, exist_ok=True); out=os.path.join(WORK,'var_%s.html'%name)
open(out,'w').write(head+sim+'</script>\n<script>\n'+"(function () {\n'use strict';\n"+main+'})();\n'+'</script>\n</body>\n</html>\n'); print('wrote', out)
