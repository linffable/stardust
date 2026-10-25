/* 碎星 Stardust — core：工具 / 画布 / 输入 / 音效 / 粒子 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) {
    if (b === undefined) { b = a; a = 0; }
    return a + Math.random() * (b - a);
  }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function dist2(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; }
  function ang(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }
  function hexA(hex, a) {
    var h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!isFinite(n)) return 'rgba(255,255,255,' + a + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---------- 画布 ---------- */
  var Screen = {
    W: 960, H: 600,
    canvas: null, ctx: null,
    init: function (canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      var self = this;
      window.addEventListener('resize', function () { self.fit(); });
      this.fit();
    },
    fit: function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.W * dpr);
      this.canvas.height = Math.round(this.H * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var scale = Math.min(window.innerWidth / this.W, window.innerHeight / this.H);
      scale = Math.min(scale, 1.5);
      var cw = Math.round(this.W * scale) + 'px';
      var ch = Math.round(this.H * scale) + 'px';
      this.canvas.style.width = cw;
      this.canvas.style.height = ch;
      document.documentElement.style.setProperty('--cw', cw);
      document.documentElement.style.setProperty('--ch', ch);
    },
    toGame: function (cx, cy) {
      var r = this.canvas.getBoundingClientRect();
      return {
        x: (cx - r.left) * (this.W / r.width),
        y: (cy - r.top) * (this.H / r.height)
      };
    }
  };

  /* ---------- 输入 ---------- */
  var Input = {
    keys: {},
    pressed: {},
    mx: 480, my: 300, mdown: false, hasPointer: false,
    init: function (canvas) {
      var self = this;
      window.addEventListener('keydown', function (e) {
        if (!self.keys[e.code]) self.pressed[e.code] = true;
        self.keys[e.code] = true;
        if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
      });
      window.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
      window.addEventListener('blur', function () { self.keys = {}; self.mdown = false; });
      canvas.addEventListener('pointerdown', function (e) {
        self.mdown = true;
        var p = Screen.toGame(e.clientX, e.clientY);
        self.mx = p.x; self.my = p.y;
      });
      window.addEventListener('pointerup', function () { self.mdown = false; });
      canvas.addEventListener('pointermove', function (e) {
        var p = Screen.toGame(e.clientX, e.clientY);
        self.mx = p.x; self.my = p.y;
        self.hasPointer = true;
      });
    },
    down: function () {
      for (var i = 0; i < arguments.length; i++) if (this.keys[arguments[i]]) return true;
      return false;
    },
    once: function (code) { return !!this.pressed[code]; },
    endFrame: function () { this.pressed = {}; }
  };

  /* ---------- 音效（WebAudio 合成，无资源文件） ---------- */
  var Sfx = {
    ctx: null, master: null, muted: false, noiseBuf: null,
    init: function () {
      if (this.ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      var len = Math.floor(this.ctx.sampleRate);
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    },
    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    setMuted: function (m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.55;
    },
    tone: function (type, f0, f1, dur, vol, delay) {
      if (!this.ctx || this.muted) return;
      var c = this.ctx, t0 = c.currentTime + (delay || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(1, f0), t0);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.03);
    },
    noise: function (dur, vol, freq, q, delay) {
      if (!this.ctx || this.muted || !this.noiseBuf) return;
      var c = this.ctx, t0 = c.currentTime + (delay || 0);
      var src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      var f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
      var g = c.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0); src.stop(t0 + dur + 0.02);
    },
    shoot: function () { this.tone('square', 690 + Math.random() * 160, 400 + Math.random() * 70, 0.06, 0.02); },
    hit: function () { this.noise(0.05, 0.05, 2000 + Math.random() * 700, 1.4); },
    kill: function () { this.noise(0.16, 0.07, 620 + Math.random() * 240, 0.8); this.tone('sine', 240 + Math.random() * 60, 70, 0.2, 0.04); },
    boom: function () { this.noise(0.5, 0.13, 300, 0.6); this.tone('sine', 140, 34, 0.55, 0.1); },
    hurt: function () { this.tone('sawtooth', 190, 72, 0.24, 0.07); this.noise(0.18, 0.06, 500, 0.7); },
    dash: function () { this.noise(0.18, 0.05, 1200, 1.6); this.tone('triangle', 480, 900, 0.12, 0.03); },
    level: function () {
      this.tone('triangle', 660, 660, 0.1, 0.05);
      this.tone('triangle', 880, 880, 0.1, 0.05, 0.08);
      this.tone('triangle', 1180, 1180, 0.16, 0.05, 0.16);
    },
    elite: function () { this.tone('sawtooth', 90, 60, 0.6, 0.06); },
    ui: function () { this.tone('triangle', 640, 900, 0.08, 0.04); }
  };

  /* ---------- 粒子 / 冲击 / 飘字 ---------- */
  var FX = {
    parts: [], rings: [], floats: [],
    shake: 0, flash: 0, flashColor: '#ff2d55',

    spark: function (x, y, color, n, spd, size, life) {
      n = n || 6; spd = spd || 180; size = size || 2.2; life = life || 0.45;
      for (var i = 0; i < n; i++) {
        if (this.parts.length > 700) return;
        var a = rand(TAU), s = rand(spd * 0.25, spd);
        var L = rand(life * 0.6, life * 1.25);
        this.parts.push({
          x: x, y: y,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: L, max: L,
          size: rand(size * 0.5, size),
          color: color
        });
      }
    },
    ring: function (x, y, color, r0, r1, life, width) {
      this.rings.push({
        x: x, y: y, color: color,
        r0: r0, r1: r1,
        life: life || 0.4, max: life || 0.4,
        width: width || 2
      });
      if (this.rings.length > 40) this.rings.shift();
    },
    float: function (x, y, text, color, size) {
      if (this.floats.length > 60) return;
      this.floats.push({ x: x, y: y, text: String(text), color: color, size: size || 12, life: 0.7 });
    },
    shakeAdd: function (v) { this.shake = Math.min(34, this.shake + v); },
    flashAdd: function (v, color) {
      this.flash = Math.min(0.9, this.flash + v);
      if (color) this.flashColor = color;
    },
    update: function (dt) {
      var i, k, p, r, f;
      for (i = this.parts.length - 1; i >= 0; i--) {
        p = this.parts[i];
        p.life -= dt;
        if (p.life <= 0) { this.parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        k = Math.pow(0.06, dt);
        p.vx *= k; p.vy *= k;
      }
      for (i = this.rings.length - 1; i >= 0; i--) {
        r = this.rings[i];
        r.life -= dt;
        if (r.life <= 0) this.rings.splice(i, 1);
      }
      for (i = this.floats.length - 1; i >= 0; i--) {
        f = this.floats[i];
        f.life -= dt; f.y -= 26 * dt;
        if (f.life <= 0) this.floats.splice(i, 1);
      }
      this.shake = Math.max(0, this.shake - dt * 34);
      this.flash = Math.max(0, this.flash - dt * 2.4);
    },
    draw: function (ctx) {
      var i, a, p, r, f, k;
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < this.parts.length; i++) {
        p = this.parts[i];
        a = p.life / p.max;
        if (a <= 0) continue;
        ctx.globalAlpha = Math.min(1, a);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.35 + a * 0.65), 0, TAU);
        ctx.fill();
      }
      for (i = 0; i < this.rings.length; i++) {
        r = this.rings[i];
        k = 1 - r.life / r.max;
        ctx.globalAlpha = Math.max(0, 1 - k) * 0.85;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.width * (1 - k * 0.6);
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      for (i = 0; i < this.floats.length; i++) {
        f = this.floats[i];
        ctx.globalAlpha = Math.min(1, f.life / 0.35);
        ctx.fillStyle = f.color;
        ctx.font = '700 ' + f.size + 'px "PingFang SC", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
    }
  };

  /* ---------- 星尘背景 ---------- */
  var Stars = {
    list: [],
    init: function (W, H) {
      this.list = [];
      for (var i = 0; i < 150; i++) {
        this.list.push({
          x: Math.random() * W, y: Math.random() * H,
          z: 0.25 + Math.random() * 0.75,
          s: 0.6 + Math.random() * 1.6,
          ph: Math.random() * TAU
        });
      }
    },
    draw: function (ctx, W, H, px, py, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#cfe9ff';
      for (var i = 0; i < this.list.length; i++) {
        var s = this.list[i];
        var x = s.x - (px - W / 2) * 0.02 * s.z;
        var y = s.y - (py - H / 2) * 0.02 * s.z;
        x = ((x % W) + W) % W;
        y = ((y % H) + H) % H;
        var tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.7 + s.ph));
        ctx.globalAlpha = 0.10 + s.z * 0.5 * tw;
        ctx.fillRect(x, y, s.s, s.s);
      }
      ctx.restore();
    }
  };

  window.G = {
    TAU: TAU, clamp: clamp, lerp: lerp, rand: rand, randInt: randInt,
    pick: pick, dist2: dist2, ang: ang, hexA: hexA,
    Screen: Screen, Input: Input, Sfx: Sfx, FX: FX, Stars: Stars
  };
})();
