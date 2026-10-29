// Psychedelischer Kaleidoskop-Hintergrund mit Blumenformen (WebGL)
// - läuft schneller, solange Musik spielt
// - pausiert im Hintergrund, steht still bei «Bewegung reduzieren»
// - lässt sich über den Knopf oben rechts aus- und einschalten
(() => {
  const canvas = document.getElementById('bg');
  const toggle = document.getElementById('bgToggle');
  if (!canvas) return;
  const audio = document.getElementById('audio');
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let enabled = true;
  try { enabled = localStorage.getItem('pep-bg') !== 'off'; } catch (e) {}

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) { canvas.remove(); if (toggle) toggle.hidden = true; document.documentElement.classList.remove('has-bg'); return; }

  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `
precision mediump float;
uniform vec2 r; uniform float t;
const float TAU = 6.28318530718;

vec3 pal(float x){ return 0.5 + 0.5*cos(TAU*(x + vec3(0.0, 0.33, 0.67))); }
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

// Blüte: Radius pulsiert mit dem Winkel -> Blütenblätter
float flower(vec2 p, float petals, float size){
  float a = atan(p.y, p.x);
  float rr = length(p);
  float edge = size * (0.45 + 0.55*abs(cos(a*petals*0.5)));
  float body = 1.0 - smoothstep(edge - 0.06, edge, rr);
  float core = 1.0 - smoothstep(size*0.18, size*0.24, rr);
  return body * (0.75 + 0.25*sin(rr*40.0/size)) + core*0.6;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*r) / min(r.x, r.y);
  float d = length(uv);

  // Kaleidoskop: Winkel in 8 gespiegelte Segmente falten
  float a = atan(uv.y, uv.x) + t*0.04;
  float seg = TAU / 8.0;
  a = mod(a, seg); a = abs(a - seg*0.5);
  vec2 p = vec2(cos(a), sin(a)) * d;

  // Hintergrundwirbel
  vec3 col = pal(d*0.9 - t*0.05 + a*0.6) * 0.22;

  // Fünf Blüten, die ineinander gleiten (additiv gemischt)
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = vec2(0.18 + 0.22*sin(t*0.21 + fi*1.7), 0.10*cos(t*0.17 + fi*2.3));
    vec2 q = rot(t*0.25*(mod(fi,2.0)*2.0 - 1.0) + fi) * (p - c*(1.0 + 0.5*sin(t*0.13 + fi)));
    float s = 0.16 + 0.09*sin(t*0.33 + fi*2.1);
    col += pal(fi*0.17 + t*0.03 + d*0.5) * flower(q, 5.0 + fi, s) * 0.5;
  }

  // Grosse Blüte in der Mitte
  col += pal(t*0.04 + 0.5) * flower(rot(-t*0.1)*uv, 12.0, 0.24 + 0.05*sin(t*0.4)) * 0.35;

  // Rand leicht abdunkeln
  col *= 1.0 - smoothstep(0.6, 1.4, d)*0.5;
  gl_FragColor = vec4(col, 1.0);
}`;

  function shader(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('Hintergrund deaktiviert:', e); canvas.remove(); if (toggle) toggle.hidden = true; return; }

  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(prog, 'r'), uT = gl.getUniformLocation(prog, 't');

  // Halbe Auflösung reicht für weiche Formen und schont den Akku
  function resize() {
    const scale = Math.min(0.6, 900 / Math.max(innerWidth, innerHeight)) * Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(innerWidth * scale)), h = Math.max(1, Math.round(innerHeight * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }

  let t = 20 + Math.random() * 100, speed = 0.4, last = 0, raf = 0;
  function draw() { resize(); gl.uniform2f(uR, canvas.width, canvas.height); gl.uniform1f(uT, t); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;                       // ~30 Bilder pro Sekunde
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const target = audio && !audio.paused ? 1.0 : 0.35; // mit Musik lebendiger
    speed += (target - speed) * 0.03;
    t += dt * speed;
    draw();
  }
  function start() { if (!raf && enabled && !reduce && document.visibilityState === 'visible') { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  function apply() {
    document.documentElement.classList.toggle('has-bg', enabled);
    canvas.hidden = !enabled;
    if (toggle) { toggle.setAttribute('aria-pressed', String(enabled)); toggle.title = enabled ? 'Hintergrund ausschalten' : 'Hintergrund einschalten'; }
    if (enabled) { draw(); start(); } else stop();
  }
  if (toggle) toggle.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem('pep-bg', enabled ? 'on' : 'off'); } catch (e) {}
    apply();
  });
  document.addEventListener('visibilitychange', () => { document.visibilityState === 'visible' ? start() : stop(); });
  window.addEventListener('resize', () => { if (enabled && !raf) draw(); });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  apply();
})();
