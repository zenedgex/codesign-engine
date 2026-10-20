// Home hero: the Aizawa attractor as long trails of light.
// WebGL2: trails are integrated on the CPU (RK4) and kept in a float texture, one column per frame; the
// GPU draws every trail as additive lines into an HDR target (MSAA), blooms it through a five-level
// dual-filter chain, tone-maps (ACES), and adds a vignette and grain. Without WebGL2, a canvas fallback.
(() => {
  const cv = document.getElementById('zx-attractor');
  if (!cv) return;
  const pos = document.querySelector('.zx-hero__pos');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // framing and exposure, tuned by eye against the reference
  const O = { el: 1.0, dist: 2.25, fov: 58, tz: .6, gain: .45, bloom: .75, exposure: 1.15, near: .5, n: 360, l: 512, tail: .6, sx: .3, sy: .04 };

  // the site's own greens (zx.css --green, --leaf, --lime): the ramp each strand takes its colour from
  const pal = ['#4A7A16', '#A9CC72', '#D0E6A5'];
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = c => c.map(v => Math.pow(v, 2.2));

  // ---------------------------------------------------------------- the system
  const A = .95, B = .7, C = .6, D = 3.5, E = .25, F = .1;
  const deriv = (x, y, z, o) => {
    o[0] = (z - B) * x - D * y;
    o[1] = D * x + (z - B) * y;
    o[2] = C + A * z - z * z * z / 3 - (x * x + y * y) * (1 + E * z) + F * z * x * x * x;
  };
  const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0];
  const rk4 = (p, dt) => {
    const [x, y, z] = p;
    deriv(x, y, z, k1);
    deriv(x + k1[0] * dt / 2, y + k1[1] * dt / 2, z + k1[2] * dt / 2, k2);
    deriv(x + k2[0] * dt / 2, y + k2[1] * dt / 2, z + k2[2] * dt / 2, k3);
    deriv(x + k3[0] * dt, y + k3[1] * dt, z + k3[2] * dt, k4);
    p[0] += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    p[1] += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    p[2] += dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
  };
  const DT = .0042, SUB = 3;
  const seed = p => {
    // a third start far out and sweep in across the frame; the rest start on the attractor
    const far = Math.random() > O.near, a = Math.random() * Math.PI * 2;
    const r = far ? 1.7 + Math.random() * 2.6 : .2 + Math.random() * 1.1;
    p[0] = Math.cos(a) * r; p[1] = Math.sin(a) * r; p[2] = far ? -1.2 + Math.random() * 3.4 : Math.random() * 1.5;
    if (!far) for (let i = 0, n = 200 + Math.random() * 600; i < n; i++) rk4(p, DT * 2);
    p.life = 900 + Math.random() * 2600;
  };
  const sample = p => { for (let i = 0; i < SUB; i++) rk4(p, DT); };
  const lost = p => !(Math.abs(p[0]) < 14 && Math.abs(p[1]) < 14 && Math.abs(p[2]) < 14);

  // ---------------------------------------------------------------- camera
  const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; };
  const lookAt = (e, c, u) => {
    let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; const zl = Math.hypot(...z); z = z.map(v => v / zl);
    let x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]; const xl = Math.hypot(...x); x = x.map(v => v / xl);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -d(x, e), -d(y, e), -d(z, e), 1];
  };
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  const TARGET = [0, 0, O.tz];
  const cam = { az: 2.2, el: O.el, dist: O.dist, paz: 0, pel: 0, tpaz: 0, tpel: 0 };
  addEventListener('pointermove', e => { cam.tpaz = (e.clientX / innerWidth - .5) * .35; cam.tpel = (e.clientY / innerHeight - .5) * .16; }, { passive: true });
  const view = (w, h) => {
    const az = cam.az + cam.paz, el = cam.el + cam.pel;
    const eye = [TARGET[0] + cam.dist * Math.cos(el) * Math.cos(az), TARGET[1] + cam.dist * Math.cos(el) * Math.sin(az), TARGET[2] + cam.dist * Math.sin(el)];
    return mul(persp(O.fov * Math.PI / 180, w / h, .05, 50), lookAt(eye, TARGET, [0, 0, 1]));
  };
  // where the attractor sits in the frame: right of the copy on wide screens, above it on phones
  const shift = (w, h) => (w > 760 ? [O.sx, O.sy] : [0, .3]);

  let gl = null;
  try { gl = cv.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' }); } catch { gl = null; }
  if (gl) webgl(gl); else canvas2d();

  // ================================================================ WebGL2
  function webgl(gl) {
    const hdr = !!gl.getExtension('EXT_color_buffer_float');
    const IF = hdr ? gl.RGBA16F : gl.RGBA8, TY = hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const small = Math.min(innerWidth, innerHeight) < 700 || innerWidth < 760;
    const N = small ? Math.round(O.n * .6) : O.n, L = small ? Math.round(O.l * .75) : O.l;

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = (vs, fs) => {
      const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
      return { p, u };
    };
    const H = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
    const QUAD = H + 'out vec2 vUv;\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }';

    let lines, down, up, comp;
    try {
      lines = prog(H + `uniform highp sampler2D uPos;
uniform int uL, uHead;
uniform mat4 uMVP;
uniform vec2 uShift;
uniform vec3 uC0, uC1, uC2;
uniform float uTail;
out vec3 vCol;
out float vA;
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
void main() {
  int seg = gl_VertexID >> 1, end = gl_VertexID & 1, L1 = uL - 1;
  int s = seg / L1, i = seg - s * L1 + end, j = seg - s * L1 + 1 - end;
  vec4 p = texelFetch(uPos, ivec2((uHead + 1 + i) % uL, s), 0);
  float g = texelFetch(uPos, ivec2(uHead, s), 0).w;
  float g2 = texelFetch(uPos, ivec2((uHead + 1 + j) % uL, s), 0).w;
  float alive = (p.w == g && g2 == g) ? 1.0 : 0.0;
  vec4 c = uMVP * vec4(p.xyz, 1.0);
  c.xy += uShift * c.w;
  gl_Position = alive > 0.5 ? c : vec4(2.0, 2.0, 2.0, 1.0);
  float t = float(i) / float(L1), h = hash(float(s) + 0.5), h2 = hash(float(s) * 1.7 + 3.1);
  // each strand keeps one colour along the ramp; its head warms toward the brightest stop
  vec3 strand = h < 0.5 ? mix(uC0, uC1, h * 2.0) : mix(uC1, uC2, h * 2.0 - 1.0);
  vCol = mix(strand, uC2, smoothstep(0.8, 1.0, t) * 0.45);
  float depth = clamp(1.55 - c.w * 0.2, 0.3, 1.25);
  vA = alive * pow(t, uTail) * depth * (0.45 + 1.1 * h2 * h2);
}`, H + `in vec3 vCol;
in float vA;
uniform float uGain;
out vec4 o;
void main() { o = vec4(vCol * vA * uGain, 1.0); }`);
      down = prog(QUAD, H + `in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uHalf;
uniform float uKnee;
out vec4 o;
void main() {
  vec3 s = texture(uTex, vUv).rgb * 4.0 + texture(uTex, vUv - uHalf).rgb + texture(uTex, vUv + uHalf).rgb
    + texture(uTex, vUv + vec2(uHalf.x, -uHalf.y)).rgb + texture(uTex, vUv - vec2(uHalf.x, -uHalf.y)).rgb;
  s /= 8.0;
  if (uKnee > 0.0) { float b = max(s.r, max(s.g, s.b)); s *= smoothstep(0.0, uKnee, b); }
  o = vec4(s, 1.0);
}`);
      up = prog(QUAD, H + `in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uHalf;
out vec4 o;
void main() {
  vec2 h = uHalf;
  vec3 s = texture(uTex, vUv + vec2(-2.0 * h.x, 0.0)).rgb + texture(uTex, vUv + vec2(-h.x, h.y)).rgb * 2.0
    + texture(uTex, vUv + vec2(0.0, 2.0 * h.y)).rgb + texture(uTex, vUv + vec2(h.x, h.y)).rgb * 2.0
    + texture(uTex, vUv + vec2(2.0 * h.x, 0.0)).rgb + texture(uTex, vUv + vec2(h.x, -h.y)).rgb * 2.0
    + texture(uTex, vUv + vec2(0.0, -2.0 * h.y)).rgb + texture(uTex, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  o = vec4(s / 12.0, 1.0);
}`);
      comp = prog(QUAD, H + `in vec2 vUv;
uniform sampler2D uScene, uBloom;
uniform float uBloomK, uExposure, uTime, uFade;
uniform vec3 uBg;
out vec4 o;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec3 c = (texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomK) * uExposure * uFade;
  c = aces(c);
  vec2 q = vUv - 0.5;
  c += uBg * (1.0 - c) * (1.0 - dot(q, q) * 1.2);
  c *= 1.0 - dot(q, q) * 0.55;
  c = pow(c, vec3(1.0 / 2.2));
  float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(c + (n - 0.5) * 0.022, 1.0);
}`);
    } catch (err) { console.warn('hero: WebGL2 shaders failed, using canvas', err); canvas2d(); return; }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // trail history: L samples × N trails, xyz + generation in w
    const ps = [], gen = new Float32Array(N), hist = new Float32Array(N * L * 4);
    for (let s = 0; s < N; s++) {
      const p = [0, 0, 0]; seed(p); ps.push(p);
      for (let i = 0; i < L; i++) { sample(p); const o = (s * L + i) * 4; hist[o] = p[0]; hist[o + 1] = p[1]; hist[o + 2] = p[2]; hist[o + 3] = 0; }
    }
    let head = L - 1;
    const posTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, posTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, L, N, 0, gl.RGBA, gl.FLOAT, hist);
    const col = new Float32Array(N * 4);
    const step = () => {
      head = (head + 1) % L;
      for (let s = 0; s < N; s++) {
        const p = ps[s];
        if (--p.life < 0 || lost(p)) { seed(p); gen[s] = (gen[s] + 1) % 4096; }
        sample(p);
        col[s * 4] = p[0]; col[s * 4 + 1] = p[1]; col[s * 4 + 2] = p[2]; col[s * 4 + 3] = gen[s];
      }
      gl.bindTexture(gl.TEXTURE_2D, posTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, head, 0, 1, N, gl.RGBA, gl.FLOAT, col);
    };

    // render targets
    const tex = (w, h) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, IF, w, h, 0, gl.RGBA, TY, null);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { t, f, w, h };
    };
    let W = 0, Hh = 0, msFb = null, msRb = null, scene = null, levels = [];
    const free = () => {
      if (msFb) { gl.deleteFramebuffer(msFb); gl.deleteRenderbuffer(msRb); }
      [scene, ...levels].forEach(r => { if (r) { gl.deleteTexture(r.t); gl.deleteFramebuffer(r.f); } });
    };
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, small ? 2 : 1.75);
      const w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
      if (w === W && h === Hh) return;
      free(); W = cv.width = w; Hh = cv.height = h;
      const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
      msRb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, msRb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, IF, W, Hh);
      msFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, msFb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msRb);
      scene = tex(W, Hh);
      levels = []; let lw = W, lh = Hh;
      for (let i = 0; i < 6; i++) { lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1); levels.push(tex(lw, lh)); }
    };

    const [c0, c1, c2] = pal.map(rgb).map(lin);
    const bg = lin(rgb('#090B0A'));
    const quad = (p, target) => { gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null); gl.viewport(0, 0, target ? target.w : W, target ? target.h : Hh); gl.useProgram(p.p); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    const born = performance.now();
    const draw = now => {
      const w = cv.clientWidth, h = cv.clientHeight;
      // trails, additive, into the multisampled HDR target
      gl.bindFramebuffer(gl.FRAMEBUFFER, msFb); gl.viewport(0, 0, W, Hh);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(lines.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, posTex);
      gl.uniform1i(lines.u.uPos, 0); gl.uniform1i(lines.u.uL, L); gl.uniform1i(lines.u.uHead, head);
      gl.uniformMatrix4fv(lines.u.uMVP, false, view(w, h)); gl.uniform2fv(lines.u.uShift, shift(w, h));
      gl.uniform1f(lines.u.uTail, O.tail); gl.uniform3fv(lines.u.uC0, c0); gl.uniform3fv(lines.u.uC1, c1); gl.uniform3fv(lines.u.uC2, c2);
      gl.uniform1f(lines.u.uGain, (hdr ? O.gain : O.gain * .55) * (small ? 1.5 : 1) * Math.min(1.4, Math.max(.75, W / 2200)));
      gl.drawArrays(gl.LINES, 0, N * (L - 1) * 2);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, scene.f);
      gl.blitFramebuffer(0, 0, W, Hh, 0, 0, W, Hh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      // bloom: down the chain (soft knee on the first pass), then back up, adding each level
      gl.useProgram(down.p); gl.uniform1i(down.u.uTex, 0);
      let src = scene;
      levels.forEach((dst, i) => {
        gl.useProgram(down.p); gl.bindTexture(gl.TEXTURE_2D, src.t);
        gl.uniform2f(down.u.uHalf, .5 / src.w, .5 / src.h); gl.uniform1f(down.u.uKnee, i === 0 ? .9 : 0);
        quad(down, dst); src = dst;
      });
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = levels.length - 1; i > 0; i--) {
        gl.useProgram(up.p); gl.uniform1i(up.u.uTex, 0); gl.bindTexture(gl.TEXTURE_2D, levels[i].t);
        gl.uniform2f(up.u.uHalf, .5 / levels[i].w, .5 / levels[i].h);
        quad(up, levels[i - 1]);
      }
      gl.disable(gl.BLEND);
      // composite to the screen
      gl.useProgram(comp.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, levels[0].t);
      gl.uniform1i(comp.u.uScene, 0); gl.uniform1i(comp.u.uBloom, 1);
      gl.uniform1f(comp.u.uBloomK, O.bloom); gl.uniform1f(comp.u.uExposure, O.exposure);
      gl.uniform1f(comp.u.uTime, now / 1000); gl.uniform3fv(comp.u.uBg, bg);
      gl.uniform1f(comp.u.uFade, reduce ? 1 : Math.min(1, (now - born) / 1400));
      quad(comp, null);
      gl.activeTexture(gl.TEXTURE0);
    };

    let raf = 0, visible = true, last = 0, acc = 0, frames = 0;
    const showPos = () => { if (!pos) return; const p = ps[0]; pos.innerHTML = ['x', 'y', 'z'].map((q, i) => `<span>${p[i].toFixed(3)}<sub>${q}</sub></span>`).join(''); };
    const loop = now => {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = last ? Math.min(.1, (now - last) / 1000) : 1 / 60; last = now;
      acc += dt * 60; let n = 0;
      while (acc >= 1 && n < 3) { step(); acc -= 1; n++; }
      if (n === 3) acc = 0;
      // the view drifts slowly round the attractor and leans toward the pointer
      cam.az += dt * .045;
      cam.paz += (cam.tpaz - cam.paz) * Math.min(1, dt * 2.5); cam.pel += (cam.tpel - cam.pel) * Math.min(1, dt * 2.5);
      draw(now);
      if (++frames % 8 === 0) showPos();
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!raf && !reduce && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(loop); } };
    resize(); showPos();
    if (reduce) draw(born + 1e5); else start();
    let rt;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); if (reduce) draw(born + 1e5); }, 120); });
    new IntersectionObserver(es => { visible = es[0].isIntersecting; start(); }).observe(cv);
    document.addEventListener('visibilitychange', start);
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; visible = false; });
  }

  // ================================================================ canvas fallback
  function canvas2d() {
    const fresh = cv.cloneNode(); cv.replaceWith(fresh);
    const ctx = fresh.getContext('2d');
    const cols = pal.slice(), N = innerWidth < 760 ? 260 : 520, LEN = 120;
    let w = 0, h = 0, ps = [], rot = 2.2;
    const proj = (x, y, z, o) => {
      const cr = Math.cos(rot), sr = Math.sin(rot), X = x * cr - y * sr, Y = x * sr + y * cr, ct = Math.cos(.3), st = Math.sin(.3);
      const up = z * ct - Y * st, depth = Y * ct + z * st, s = 4 / (4 - depth), k = Math.min(w * (w > 760 ? .3 : .42), h * .36), [sx, sy] = shift(w, h);
      o[0] = w / 2 + sx * w / 2 + X * k * s; o[1] = h / 2 - sy * h / 2 - (up - .62) * k * s;
    };
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2); w = fresh.clientWidth; h = fresh.clientHeight;
      fresh.width = Math.round(w * dpr); fresh.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ps = []; for (let i = 0; i < N; i++) { const p = [0, 0, 0]; seed(p); p.tr = []; p.c = cols[i % 3]; for (let j = 0; j < LEN; j++) { sample(p); p.tr.push([p[0], p[1], p[2]]); } ps.push(p); }
    };
    const a = [0, 0], b = [0, 0];
    const frame = () => {
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#090B0A'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1;
      for (const p of ps) {
        if (!reduce) { if (--p.life < 0 || lost(p)) { seed(p); p.tr = []; } sample(p); p.tr.push([p[0], p[1], p[2]]); if (p.tr.length > LEN) p.tr.shift(); }
        ctx.strokeStyle = p.c; ctx.globalAlpha = .28; ctx.beginPath();
        for (let j = 1; j < p.tr.length; j++) { proj(...p.tr[j - 1], a); proj(...p.tr[j], b); if (j === 1) ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!reduce) { rot += .0008; requestAnimationFrame(frame); }
    };
    resize(); frame();
    addEventListener('resize', resize);
  }
})();
