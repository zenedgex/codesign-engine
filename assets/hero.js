// Home hero: a dynamical system drawn as long trails of light.
// Trails are integrated on the CPU (RK4), normalized into a unit-sized frame, and kept in a float texture,
// one column per frame. The GPU draws every trail as additive lines into an HDR target (MSAA), blooms it
// through a five-level dual-filter chain, tone-maps (ACES), and adds a vignette and grain. Each system is
// centred, scaled and paced automatically from a probe run. Without WebGL2, a canvas fallback.
// ZXHero.mount(canvas, { system, ...overrides }); the page's #zx-attractor mounts itself (data-system).
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the site's own greens (zx.css --green, --leaf, --lime): the ramp each strand takes its colour from
  const PAL = ['#4A7A16', '#A9CC72', '#D0E6A5'];
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = c => c.map(v => Math.pow(v, 2.2));

  // ---------------------------------------------------------------- systems
  // f: the vector field; start: a point on (or near) the attractor; up: the axis drawn vertically;
  // dt: the largest stable step; view: camera defaults for this shape
  const SYSTEMS = {
    aizawa: {
      f(x, y, z, o) { o[0] = (z - .7) * x - 3.5 * y; o[1] = 3.5 * x + (z - .7) * y; o[2] = .6 + .95 * z - z * z * z / 3 - (x * x + y * y) * (1 + .25 * z) + .1 * z * x * x * x; },
      start: [.1, 0, 0], up: [0, 0, 1], dt: .005, view: { el: .35, dist: 4.2 },
    },
    halvorsen: {
      f(x, y, z, o) { const a = 1.89; o[0] = -a * x - 4 * y - 4 * z - y * y; o[1] = -a * y - 4 * z - 4 * x - z * z; o[2] = -a * z - 4 * x - 4 * y - x * x; },
      start: [-1.48, -1.51, 2.04], up: [1, 1, 1], dt: .004, view: { el: 1.15, dist: 3.9 },
    },
    dadras: {
      f(x, y, z, o) { o[0] = y - 3 * x + 2.7 * y * z; o[1] = 1.7 * y - x * z + z; o[2] = 2 * x * y - 9 * z; },
      start: [1.1, 2.1, -2], up: [0, 0, 1], dt: .004, view: { el: .5, dist: 5.6, gain: .15 }, sx: .32, sy: .04,
    },
    scrolls: {  // three-scroll unified chaotic system (TSUCS2)
      f(x, y, z, o) { o[0] = 40 * (y - x) + .16 * x * z; o[1] = 55 * x - x * z + 20 * y; o[2] = 1.833 * z + x * y - .65 * x * x; },
      start: [-.29, -.25, -.59], up: [0, 0, 1], dt: .0004, view: { el: .3, dist: 4.6, gain: .14 },
    },
    thomas: {
      f(x, y, z, o) { const b = .208186; o[0] = Math.sin(y) - b * x; o[1] = Math.sin(z) - b * y; o[2] = Math.sin(x) - b * z; },
      start: [1.1, 1.1, -.01], up: [1, 1, 1], dt: .05, view: { el: .4, dist: 4.3 },
    },
    lorenz: {
      f(x, y, z, o) { o[0] = 10 * (y - x); o[1] = x * (28 - z) - y; o[2] = x * y - 8 / 3 * z; },
      start: [1, 1, 1], up: [0, 0, 1], dt: .004, view: { el: .15, dist: 4.3, gain: .09 },
    },
    // not an attractor: strands carried left to right through a slowly changing wave field, a sheet of silk
    silk: {
      flow: true,
      f(x, y, z, o, t) {
        o[0] = 1;
        o[1] = .62 * Math.sin(1.15 * x + .9 * z + t * .21) + .26 * Math.sin(2.4 * x - 1.3 * z + 1.7 + t * .13);
        o[2] = .42 * Math.cos(.85 * x - 1.1 * y + t * .17) + .2 * Math.sin(1.9 * x + .6);
      },
      dt: .0065, view: { el: .4, dist: 3.0, fov: 46, n: 1400, l: 560, gain: .26, tail: .4, bloom: .75 }, sx: .04, sy: .34,
    },
  };

  // ---------------------------------------------------------------- camera maths
  const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; };
  const lookAt = (e, c, u) => {
    let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; const zl = Math.hypot(...z); z = z.map(v => v / zl);
    let x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]; const xl = Math.hypot(...x); x = x.map(v => v / xl);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -d(x, e), -d(y, e), -d(z, e), 1];
  };
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  // rotation taking unit vector u onto +z (Rodrigues)
  const toZ = u => {
    const l = Math.hypot(...u), a = u.map(v => v / l), c = a[2];
    if (c > .9999) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const k = [a[1], -a[0], 0], s = Math.hypot(k[0], k[1]), kx = k[0] / s, ky = k[1] / s, v = 1 - c;
    return [c + kx * kx * v, kx * ky * v, ky * s, kx * ky * v, c + ky * ky * v, -kx * s, -ky * s, kx * s, c];
  };

  function mount(cv, opts = {}) {
    const S = SYSTEMS[opts.system || cv.dataset.system] || SYSTEMS.silk;
    const O = Object.assign({ el: .35, dist: 4.2, fov: 40, gain: .17, bloom: .6, exposure: 1.15, n: 420, l: 420, tail: .9, fog: .35, sx: .32, sy: .02, pace: .028, interactive: true },
      S.view || {}, S.sx !== undefined ? { sx: S.sx, sy: S.sy } : {}, opts);

    // ------------------------------------------------------------ the simulation
    const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0];
    let time = 0;
    const rk4 = (p, dt) => {
      const [x, y, z] = p, f = S.f;
      f(x, y, z, k1, time);
      f(x + k1[0] * dt / 2, y + k1[1] * dt / 2, z + k1[2] * dt / 2, k2, time);
      f(x + k2[0] * dt / 2, y + k2[1] * dt / 2, z + k2[2] * dt / 2, k3, time);
      f(x + k3[0] * dt, y + k3[1] * dt, z + k3[2] * dt, k4, time);
      p[0] += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      p[1] += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      p[2] += dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    };
    // probe: where the attractor lives, how big it is, and how fast a trail moves across it
    const R = S.flow ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : toZ(S.up);
    let center = [0, 0, 0], scale = 1, SUB = 1, pool = [];
    const rot = (p, o) => { o[0] = R[0] * p[0] + R[1] * p[1] + R[2] * p[2]; o[1] = R[3] * p[0] + R[4] * p[1] + R[5] * p[2]; o[2] = R[6] * p[0] + R[7] * p[1] + R[8] * p[2]; };
    const norm = (p, o) => { rot([p[0] - center[0], p[1] - center[1], p[2] - center[2]], o); o[0] *= scale; o[1] *= scale; o[2] *= scale; };
    if (S.flow) SUB = 1;
    else {
      const p = S.start.slice(), pts = [];
      for (let i = 0; i < 4000; i++) rk4(p, S.dt);
      for (let i = 0; i < 24000; i++) { rk4(p, S.dt); if (i % 4 === 0) pts.push(p.slice()); }
      center = [0, 1, 2].map(k => pts.reduce((s, q) => s + q[k], 0) / pts.length);
      const r = pts.map(q => Math.hypot(q[0] - center[0], q[1] - center[1], q[2] - center[2])).sort((a, b) => a - b);
      scale = 1.15 / r[Math.floor(r.length * .97)];
      let travel = 0; const a = [0, 0, 0], b = [0, 0, 0];
      for (let i = 1; i < 2000; i++) { norm(pts[i - 1], a); norm(pts[i], b); travel += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
      const perStep = travel / 1999 / 4;
      SUB = Math.max(1, Math.min(14, Math.round(O.pace / perStep)));
      pool = pts;
    }
    const seed = p => {
      if (S.flow) {
        // a sheet: strands start along the left edge, spread in depth, close together in height
        const z = (Math.random() - .5) * 1.9;
        p[0] = -2.9 - Math.random() * .3; p[1] = .35 * Math.sin(z * 2.2) + (Math.random() - .5) * .4; p[2] = z;
        p.life = 1e9;
        return;
      }
      const q = pool[(Math.random() * pool.length) | 0];
      p[0] = q[0] * (1 + (Math.random() - .5) * .002); p[1] = q[1]; p[2] = q[2];
      p.life = 900 + Math.random() * 2600;
    };
    const sample = p => { if (S.flow) { const o = k1; S.f(p[0], p[1], p[2], o, time); p[0] += o[0] * S.dt; p[1] += o[1] * S.dt; p[2] += o[2] * S.dt; } else for (let i = 0; i < SUB; i++) rk4(p, S.dt); };
    const out = [0, 0, 0];
    const view3 = p => { if (S.flow) { out[0] = p[0]; out[1] = p[2]; out[2] = p[1]; } else norm(p, out); return out; };
    const lost = p => { if (S.flow) return p[0] > 3.1; const v = view3(p); return !(Math.abs(v[0]) < 5 && Math.abs(v[1]) < 5 && Math.abs(v[2]) < 5); };

    // ------------------------------------------------------------ camera
    const cam = { az: S.flow ? -1.5708 : 2.2, el: O.el, dist: O.dist, paz: 0, pel: 0, tpaz: 0, tpel: 0 };
    if (O.interactive) addEventListener('pointermove', e => { cam.tpaz = (e.clientX / innerWidth - .5) * (S.flow ? .18 : .35); cam.tpel = (e.clientY / innerHeight - .5) * .16; }, { passive: true });
    const reach = (w, h) => cam.dist * (w / h < 1 ? Math.min(2.1, Math.pow(h / w, .75)) : 1);
    const view = (w, h) => {
      const az = cam.az + cam.paz, el = cam.el + cam.pel, d = reach(w, h);
      const eye = [d * Math.cos(el) * Math.cos(az), d * Math.cos(el) * Math.sin(az), d * Math.sin(el)];
      return mul(persp(O.fov * Math.PI / 180, w / h, .05, 50), lookAt(eye, [0, 0, 0], [0, 0, 1]));
    };
    // landscape: the shape sits right of the copy; portrait: above it
    const shift = (w, h) => (w / h > 1.1 ? [O.sx, O.sy] : [0, S.flow ? .5 : .42]);

    let gl = null;
    try { gl = cv.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' }); } catch { gl = null; }
    if (gl) webgl(gl); else canvas2d();

    // ============================================================ WebGL2
    function webgl(gl) {
      const hdr = !!gl.getExtension('EXT_color_buffer_float');
      const IF = hdr ? gl.RGBA16F : gl.RGBA8, TY = hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
      const small = Math.min(innerWidth, innerHeight) < 700 || innerWidth < 760;
      const N = small ? Math.round(O.n * .7) : O.n, L = small ? Math.round(O.l * .75) : O.l;

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
uniform float uTail, uDist, uFog, uEdge;
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
  float depth = clamp(1.0 + (uDist - c.w) * uFog, 0.12, 1.5);
  // flows fade in and out at the left and right edges of the field
  float edge = uEdge > 0.0 ? smoothstep(-2.1, -0.4, p.x) * (1.0 - smoothstep(2.0, 3.0, p.x)) : 1.0;
  vA = alive * pow(t, uTail) * depth * edge * (0.45 + 1.1 * h2 * h2);
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

      gl.bindVertexArray(gl.createVertexArray());

      // trail history: L samples × N trails, normalized xyz + generation in w
      const ps = [], gen = new Float32Array(N), hist = new Float32Array(N * L * 4);
      for (let s = 0; s < N; s++) {
        const p = [0, 0, 0]; seed(p); ps.push(p);
        // flows start already spread across the field, so the first frame is full
        if (S.flow) { const pre = (Math.random() * 900) | 0; for (let i = 0; i < pre; i++) { sample(p); if (lost(p)) seed(p); } }
        for (let i = 0; i < L; i++) { sample(p); const v = view3(p), o = (s * L + i) * 4; hist[o] = v[0]; hist[o + 1] = v[1]; hist[o + 2] = v[2]; hist[o + 3] = 0; }
      }
      let head = L - 1;
      const posTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, posTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, L, N, 0, gl.RGBA, gl.FLOAT, hist);
      const col = new Float32Array(N * 4);
      const step = () => {
        head = (head + 1) % L; time += 1 / 60;
        for (let s = 0; s < N; s++) {
          const p = ps[s];
          if (--p.life < 0 || lost(p)) { seed(p); gen[s] = (gen[s] + 1) % 4096; }
          sample(p);
          const v = view3(p);
          col[s * 4] = v[0]; col[s * 4 + 1] = v[1]; col[s * 4 + 2] = v[2]; col[s * 4 + 3] = gen[s];
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

      const [c0, c1, c2] = PAL.map(rgb).map(lin);
      const bg = lin(rgb('#090B0A'));
      const quad = (p, target) => { gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null); gl.viewport(0, 0, target ? target.w : W, target ? target.h : Hh); gl.useProgram(p.p); gl.drawArrays(gl.TRIANGLES, 0, 3); };
      const born = performance.now();
      const draw = now => {
        const w = cv.clientWidth, h = cv.clientHeight;
        gl.bindFramebuffer(gl.FRAMEBUFFER, msFb); gl.viewport(0, 0, W, Hh);
        gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(lines.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, posTex);
        gl.uniform1i(lines.u.uPos, 0); gl.uniform1i(lines.u.uL, L); gl.uniform1i(lines.u.uHead, head);
        gl.uniformMatrix4fv(lines.u.uMVP, false, view(w, h)); gl.uniform2fv(lines.u.uShift, shift(w, h));
        gl.uniform1f(lines.u.uTail, O.tail); gl.uniform1f(lines.u.uDist, reach(w, h)); gl.uniform1f(lines.u.uFog, O.fog); gl.uniform1f(lines.u.uEdge, S.flow ? 1 : 0);
        gl.uniform3fv(lines.u.uC0, c0); gl.uniform3fv(lines.u.uC1, c1); gl.uniform3fv(lines.u.uC2, c2);
        gl.uniform1f(lines.u.uGain, (hdr ? O.gain : O.gain * .55) * (small ? 1.5 : 1) * Math.min(1.4, Math.max(.75, W / 2200)));
        gl.drawArrays(gl.LINES, 0, N * (L - 1) * 2);
        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, scene.f);
        gl.blitFramebuffer(0, 0, W, Hh, 0, 0, W, Hh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        // bloom: down the chain (soft knee on the first pass), then back up, adding each level
        let src = scene;
        levels.forEach((dst, i) => {
          gl.useProgram(down.p); gl.uniform1i(down.u.uTex, 0); gl.bindTexture(gl.TEXTURE_2D, src.t);
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

      let raf = 0, visible = true, last = 0, acc = 0;
      const loop = now => {
        raf = 0;
        if (!visible || document.hidden) return;
        const dt = last ? Math.min(.1, (now - last) / 1000) : 1 / 60; last = now;
        acc += dt * 60; let n = 0;
        while (acc >= 1 && n < 3) { step(); acc -= 1; n++; }
        if (n === 3) acc = 0;
        // the view drifts slowly round the shape (a flow sways instead) and leans toward the pointer
        if (S.flow) cam.az = -1.5708 + Math.sin(time * .05) * .22; else cam.az += dt * .045;
        cam.paz += (cam.tpaz - cam.paz) * Math.min(1, dt * 2.5); cam.pel += (cam.tpel - cam.pel) * Math.min(1, dt * 2.5);
        draw(now);
        raf = requestAnimationFrame(loop);
      };
      const start = () => { if (!raf && !reduce && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(loop); } };
      resize();
      if (reduce) draw(born + 1e5); else start();
      let rt;
      addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); if (reduce) draw(born + 1e5); }, 120); });
      new IntersectionObserver(es => { visible = es[0].isIntersecting; start(); }).observe(cv);
      document.addEventListener('visibilitychange', start);
      cv.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; visible = false; });
    }

    // ============================================================ canvas fallback
    function canvas2d() {
      const fresh = cv.cloneNode(); cv.replaceWith(fresh);
      const ctx = fresh.getContext('2d');
      const N = innerWidth < 760 ? 160 : 300, LEN = 160;
      let w = 0, h = 0, ps = [], az = cam.az;
      const proj = (v, o) => {
        const ca = Math.cos(az), sa = Math.sin(az), X = v[0] * -sa + v[1] * ca, Y = v[0] * ca + v[1] * sa, ct = Math.cos(O.el), st = Math.sin(O.el);
        const up = v[2] * ct - Y * st, depth = Y * ct + v[2] * st, s = O.dist / (O.dist - depth), k = Math.min(w, h) * .32, [sx, sy] = shift(w, h);
        o[0] = w / 2 + sx * w / 2 + X * k * s; o[1] = h / 2 - sy * h / 2 - up * k * s;
      };
      const resize = () => {
        const dpr = Math.min(devicePixelRatio || 1, 2); w = fresh.clientWidth; h = fresh.clientHeight;
        fresh.width = Math.round(w * dpr); fresh.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ps = []; for (let i = 0; i < N; i++) { const p = [0, 0, 0]; seed(p); p.tr = []; p.c = PAL[i % 3]; for (let j = 0; j < LEN; j++) { sample(p); p.tr.push(view3(p).slice()); } ps.push(p); }
      };
      const a = [0, 0], b = [0, 0];
      const frame = () => {
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#090B0A'; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1;
        for (const p of ps) {
          if (!reduce) { if (--p.life < 0 || lost(p)) { seed(p); p.tr = []; } sample(p); p.tr.push(view3(p).slice()); if (p.tr.length > LEN) p.tr.shift(); }
          ctx.strokeStyle = p.c; ctx.globalAlpha = .22; ctx.beginPath();
          for (let j = 1; j < p.tr.length; j++) { proj(p.tr[j - 1], a); proj(p.tr[j], b); if (j === 1) ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (!reduce) { time += 1 / 60; requestAnimationFrame(frame); }
      };
      resize(); frame();
      addEventListener('resize', resize);
    }
  }

  window.ZXHero = { mount, systems: Object.keys(SYSTEMS) };
  const cv = document.getElementById('zx-attractor');
  if (cv) mount(cv, window.ZX_HERO || {});
})();
