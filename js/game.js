/* 碎星 Stardust — 游戏主体 */
(function () {
  'use strict';

  var G = window.G;
  var clamp = G.clamp, lerp = G.lerp, rand = G.rand, randInt = G.randInt,
      dist2 = G.dist2, ang = G.ang, TAU = G.TAU, hexA = G.hexA;
  var Screen = G.Screen, Input = G.Input, Sfx = G.Sfx, FX = G.FX, Stars = G.Stars;

  var W = 960, H = 600;

  function $(id) { return document.getElementById(id); }

  var el = {
    canvas: $('game'), hud: $('hud'), menu: $('menu'), levelup: $('levelup'),
    pause: $('pause'), over: $('over'), cards: $('cards'),
    hpFill: $('hpFill'), hpText: $('hpText'), xpFill: $('xpFill'),
    lvText: $('lvText'), waveText: $('waveText'), timeText: $('timeText'),
    scoreText: $('scoreText'), bestText: $('bestText'), comboText: $('comboText'),
    startBtn: $('startBtn'), againBtn: $('againBtn'),
    overScore: $('overScore'), overTime: $('overTime'), overKills: $('overKills'),
    overBest: $('overBest'), menuBest: $('menuBest'), buildList: $('buildList')
  };

  /* ---------------- 状态 ---------------- */
  var mode = 'menu';
  var demoMode = /[?&]demo\b/.test(location.search);
  var godMode = /[?&]god\b/.test(location.search);
  var aimMode = 'mouse';
  var elapsed = 0, score = 0, kills = 0, wave = 1;
  var pendingLevels = 0, spawnT = 1.1, waveBreak = 0;
  var enemies = [], bullets = [], ebullets = [], shards = [], hazards = [];
  var player = null;
  var eid = 1;
  var banner = { text: '', life: 0, max: 1 };
  var taken = {};
  var currentCards = [];
  var best = 0;
  var combo = 0, comboTimer = 0, bestCombo = 0;
  var hitStop = 0;
  var bossRef = null, bossKills = 0;
  var deathTimer = 0, overShown = false;
  var bgGrad = null, vignette = null, dangerGrad = null;
  var lastT = 0, fpsT = 0;

  try { best = parseInt(localStorage.getItem('stardust.best') || '0', 10) || 0; } catch (e) { best = 0; }

  /* ---------------- 敌人模板 ---------------- */
  var TYPES = {
    grunt:    { hp: 20, speed: 68,  r: 13, dmg: 9,  xp: 2, score: 10, color: '#ff5d73', sides: 3 },
    chaser:   { hp: 13, speed: 138, r: 10, dmg: 7,  xp: 2, score: 12, color: '#ffa94d', sides: 4 },
    tank:     { hp: 90, speed: 44,  r: 22, dmg: 16, xp: 7, score: 30, color: '#b06bff', sides: 6 },
    shooter:  { hp: 32, speed: 72,  r: 14, dmg: 10, xp: 4, score: 22, color: '#4fd1ff', sides: 5, ranged: true },
    splitter: { hp: 38, speed: 84,  r: 16, dmg: 11, xp: 4, score: 20, color: '#7dff9b', sides: 8, split: true }
  };

  /* ---------------- 升级卡 ---------------- */
  var UPGRADES = [
    { id: 'dmg',    name: '强击', desc: '子弹伤害 +22%',              rare: false, max: 8, apply: function (p) { p.dmg *= 1.22; } },
    { id: 'rate',   name: '急速', desc: '射速 +14%',                  rare: false, max: 8, apply: function (p) { p.fireInterval = Math.max(0.075, p.fireInterval * 0.875); } },
    { id: 'multi',  name: '多重', desc: '弹道 +1',                    rare: true,  max: 4, apply: function (p) { p.projectiles += 1; } },
    { id: 'pierce', name: '穿透', desc: '子弹多穿透 1 个目标',         rare: true,  max: 4, apply: function (p) { p.pierce += 1; } },
    { id: 'speed',  name: '疾行', desc: '移动速度 +10%',              rare: false, max: 5, apply: function (p) { p.speed *= 1.10; } },
    { id: 'magnet', name: '磁吸', desc: '拾取范围 +45%',              rare: false, max: 4, apply: function (p) { p.pickup = Math.min(320, p.pickup * 1.45); } },
    { id: 'armor',  name: '护盾', desc: '生命上限 +25，并回复 25',    rare: false, max: 6, apply: function (p) { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
    { id: 'dash',   name: '迅闪', desc: '冲刺冷却 -22%',              rare: false, max: 4, apply: function (p) { p.dashMax = Math.max(0.8, p.dashMax * 0.78); } },
    { id: 'crit',   name: '暴击', desc: '暴击率 +9%',                 rare: false, max: 6, apply: function (p) { p.crit = Math.min(0.75, p.crit + 0.09); } },
    { id: 'regen',  name: '回春', desc: '每秒回复 +0.9 生命',         rare: true,  max: 4, apply: function (p) { p.regen += 0.9; } },
    { id: 'vel',    name: '弹速', desc: '子弹速度 +18%',              rare: false, max: 4, apply: function (p) { p.bulletSpeed *= 1.18; } },
    { id: 'boom',   name: '爆裂', desc: '子弹命中时引发小范围爆炸',    rare: true,  max: 1, apply: function (p) { p.explode = true; } },
    { id: 'exec',   name: '处决', desc: '对生命低于 25% 的敌人伤害翻倍', rare: true, max: 1, apply: function (p) { p.execute = true; } },
    { id: 'frost',  name: '霜冻', desc: '命中使敌人减速 35%，持续 1.2 秒', rare: true, max: 3, apply: function (p) { p.frost = Math.min(0.65, p.frost + 0.35); } },
    { id: 'orbit',  name: '环刃', desc: '环绕刀刃 +1，接触造成伤害',     rare: true, max: 3, apply: function (p) { p.orbs += 1; } }
  ];

  /* 叠满某张卡后，它的「进化版」才会出现在卡池里（一次性，质变而不是再加数值） */
  var EVOLUTIONS = [
    { id: 'evo_dmg', reqId: 'dmg', evo: true, name: '破甲弹', desc: '子弹命中时引发爆炸，伤害再 +20%', max: 1,
      apply: function (p) { p.dmg *= 1.2; p.explode = true; } },
    { id: 'evo_orbit', reqId: 'orbit', evo: true, name: '回旋刃', desc: '环刃半径与转速大幅提升，命中把敌人击退', max: 1,
      apply: function (p) { p.orbR = 102; p.orbSpd = 3.9; p.orbKnock = true; } },
    { id: 'evo_rate', reqId: 'rate', evo: true, name: '过载', desc: '射速再 +25%，连击倍率上限提升到 ×4', max: 1,
      apply: function (p) { p.fireInterval = Math.max(0.06, p.fireInterval * 0.8); p.evoCombo = 1; } }
  ];

  /* 卡池被抽干时的保底三选一，避免升级界面空着卡死 */
  var FILLERS = [
    { id: 'fix', name: '修理', desc: '立即回复 35 生命', max: 999, apply: function (p) { p.hp = Math.min(p.maxHp, p.hp + 35); } },
    { id: 'bounty', name: '赏金', desc: '立即获得 300 分', max: 999, apply: function (p) { score += 300; } },
    { id: 'tough', name: '强身', desc: '生命上限 +10，并回复 10', max: 999, apply: function (p) { p.maxHp += 10; p.hp = Math.min(p.maxHp, p.hp + 10); } }
  ];

  /* ---------------- 工具 ---------------- */
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    var m = Math.floor(s / 60), ss = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function xpNeed(level) {
    return Math.round(6 + (level - 1) * 3.4 + Math.pow(level - 1, 1.5) * 1.7);
  }

  /* ---------------- 生命周期 ---------------- */
  function resetGame() {
    elapsed = 0; score = 0; kills = 0; wave = 1;
    pendingLevels = 0; spawnT = demoMode ? 0.2 : 0.9; waveBreak = 0;
    enemies = []; bullets = []; ebullets = []; shards = []; hazards = [];
    taken = {}; currentCards = []; deathTimer = 0; overShown = false;
    combo = 0; comboTimer = 0; bestCombo = 0; hitStop = 0;
    bossRef = null; bossKills = 0;
    eid = 1;
    banner = { text: '', life: 0, max: 1 };
    FX.parts = []; FX.rings = []; FX.floats = []; FX.shake = 0; FX.flash = 0;

    player = {
      x: W / 2, y: H / 2, vx: 0, vy: 0, r: 11,
      hp: 100, maxHp: 100,
      speed: 265, fireInterval: 0.30, dmg: 9, bulletSpeed: 690,
      projectiles: 1, pierce: 0, pickup: 92, crit: 0.05, critMul: 2.0, regen: 0,
      dashMax: 2.2, dashCd: 0, dashT: 0, dashX: 1, dashY: 0,
      invuln: 1.2, fireCd: 0, aim: -Math.PI / 2,
      level: 1, xp: 0, xpNeed: 6, explode: false, execute: false, frost: 0,
      orbs: 0, orbAngle: 0, orbR: 66, orbSpd: 2.6, orbKnock: false, evoCombo: 0,
      trail: []
    };
  }

  function start() {
    Sfx.init();
    Sfx.resume();
    resetGame();
    mode = 'playing';
    for (var si = 0; si < 2; si++) spawnEnemy();
    var om = /[?&]orbs=(\d)/.exec(location.search);
    if (om) player.orbs = Math.min(3, parseInt(om[1], 10));
    if (/[?&]maxed\b/.test(location.search)) {
      for (var mi = 0; mi < UPGRADES.length; mi++) {
        var mu = UPGRADES[mi];
        for (var mn = 0; mn < mu.max; mn++) mu.apply(player);
        taken[mu.id] = mu.max;
      }
    }
    el.menu.classList.add('hidden');
    el.over.classList.add('hidden');
    el.levelup.classList.add('hidden');
    el.pause.classList.add('hidden');
    el.hud.classList.remove('hidden');
    if (el.startBtn.blur) el.startBtn.blur();
    if (el.againBtn.blur) el.againBtn.blur();
    lastT = performance.now();
    updateHUD();
    if (!demoMode) Sfx.ui();
    if (/[?&]cards\b/.test(location.search)) {
      mode = 'levelup';
      el.levelup.classList.remove('hidden');
      renderCards([UPGRADES[0], UPGRADES[6], EVOLUTIONS[1]]);
    }
  }

  function die() {
    if (mode !== 'playing') return;
    mode = 'dead';
    deathTimer = 1.15;
    overShown = false;
    FX.shakeAdd(30);
    FX.flash = 0.25;
    FX.flashColor = '#ff2d55';
    FX.spark(player.x, player.y, '#a8f6ff', 40, 520, 4, 0.9);
    FX.ring(player.x, player.y, '#ff4d7d', 10, 280, 0.9, 6);
    FX.ring(player.x, player.y, '#ffffff', 4, 120, 0.35, 3);
    Sfx.boom();
    if (score > best) {
      best = score;
      try { localStorage.setItem('stardust.best', String(best)); } catch (e) {}
    }
  }

  function showOver() {
    overShown = true;
    el.overScore.textContent = String(score);
    el.overTime.textContent = fmtTime(elapsed);
    el.overKills.textContent = String(kills);
    el.overBest.textContent = ((score >= best && score > 0)
      ? '新纪录 · 最高分 ' + best
      : '最高分 ' + best)
      + (bestCombo >= 3 ? ' · 最高连击 ' + bestCombo : '')
      + (bossKills > 0 ? ' · 击破裂核 ×' + bossKills : '');
    var parts = [];
    for (var bi = 0; bi < UPGRADES.length; bi++) {
      var bu = UPGRADES[bi];
      var bn = taken[bu.id] || 0;
      if (bn > 0) parts.push(bu.name + (bn > 1 ? ' ×' + bn : ''));
    }
    for (var ei2 = 0; ei2 < EVOLUTIONS.length; ei2++) {
      if ((taken[EVOLUTIONS[ei2].id] || 0) > 0) parts.push('★' + EVOLUTIONS[ei2].name);
    }
    el.buildList.textContent = parts.length ? '构筑 · ' + parts.join('  /  ') : '';
    el.bestText.textContent = 'BEST ' + best;
    el.over.classList.remove('hidden');
  }

  function togglePause() {
    if (mode === 'playing') {
      mode = 'paused';
      el.pause.classList.remove('hidden');
    } else if (mode === 'paused') {
      mode = 'playing';
      el.pause.classList.add('hidden');
      lastT = performance.now();
    }
  }

  /* ---------------- 主角 ---------------- */
  function updatePlayer(dt) {
    var p = player;
    var dx = 0, dy = 0;

    if (demoMode) {
      dx = Math.cos(elapsed * 1.25) * 0.9;
      dy = Math.sin(elapsed * 1.85) * 0.9;
    } else {
      if (Input.down('KeyA', 'ArrowLeft')) dx -= 1;
      if (Input.down('KeyD', 'ArrowRight')) dx += 1;
      if (Input.down('KeyW', 'ArrowUp')) dy -= 1;
      if (Input.down('KeyS', 'ArrowDown')) dy += 1;
    }
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) { dx /= len; dy /= len; }

    p.invuln = Math.max(0, p.invuln - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

    if (!demoMode && Input.once('Space') && p.dashCd <= 0 && len > 0) {
      p.dashT = 0.16;
      p.dashCd = p.dashMax;
      p.dashX = dx; p.dashY = dy;
      p.invuln = Math.max(p.invuln, 0.22);
      Sfx.dash();
      FX.ring(p.x, p.y, '#6ee7ff', 8, 52, 0.32, 3);
    }

    if (p.dashT > 0) {
      p.dashT -= dt;
      p.x += p.dashX * p.speed * 3.1 * dt;
      p.y += p.dashY * p.speed * 3.1 * dt;
      FX.spark(p.x, p.y, '#6ee7ff', 1, 60, 2.2, 0.25);
    } else {
      p.vx = lerp(p.vx, dx * p.speed, Math.min(1, 14 * dt));
      p.vy = lerp(p.vy, dy * p.speed, Math.min(1, 14 * dt));
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    p.x = clamp(p.x, p.r + 4, W - p.r - 4);
    p.y = clamp(p.y, p.r + 4, H - p.r - 4);

    if (p.orbs > 0) {
      p.orbAngle += p.orbSpd * dt;
      for (var oi = 0; oi < p.orbs; oi++) {
        var oa = p.orbAngle + oi * TAU / p.orbs;
        var ox = p.x + Math.cos(oa) * p.orbR;
        var oy = p.y + Math.sin(oa) * p.orbR;
        for (var ei = 0; ei < enemies.length; ei++) {
          var en = enemies[ei];
          if (en.dead || en.orbCd > 0) continue;
          var orr = 13 + en.r;
          if (dist2(ox, oy, en.x, en.y) < orr * orr) {
            en.orbCd = 0.45;
            damageEnemy(en, p.dmg * 0.95, false);
            if (p.orbKnock && !en.dead) {
              var ka = Math.atan2(en.y - p.y, en.x - p.x);
              en.vx += Math.cos(ka) * 280;
              en.vy += Math.sin(ka) * 280;
            }
            FX.spark(ox, oy, '#9ff5ff', 4, 130, 2.2, 0.25);
          }
        }
      }
    }

    var lastPt = p.trail[p.trail.length - 1];
    if (!lastPt || dist2(lastPt.x, lastPt.y, p.x, p.y) > 16) {
      p.trail.push({ x: p.x, y: p.y, life: 0.32 });
      if (p.trail.length > 18) p.trail.shift();
    }
    for (var i = p.trail.length - 1; i >= 0; i--) {
      p.trail[i].life -= dt;
      if (p.trail[i].life <= 0) p.trail.splice(i, 1);
    }

    p.fireCd -= dt;
    if (demoMode && Input.hasPointer) {
      var aimT = nearestEnemy(p.x, p.y, 900);
      if (aimT) { Input.mx = aimT.x; Input.my = aimT.y; }
    }
    if (p.fireCd <= 0) {
      if (aimMode === 'mouse' && Input.hasPointer) {
        fireDir(Math.atan2(Input.my - p.y, Input.mx - p.x));
      } else {
        var target = nearestEnemy(p.x, p.y, 1100);
        if (target) fireAt(target);
        else p.fireCd = 0.1;
      }
    }
  }

  function nearestEnemy(x, y, range) {
    if (bossRef && !bossRef.dead && dist2(x, y, bossRef.x, bossRef.y) < 480 * 480) return bossRef;
    var bestD = range * range, found = null;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      if (e.x < -8 || e.x > W + 8 || e.y < -8 || e.y > H + 8) continue;
      var d = dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; found = e; }
    }
    return found;
  }

  function fireDir(a) {
    var p = player;
    p.aim = a;
    var n = p.projectiles;
    var spread = n > 1 ? 0.11 : 0;
    var mx = p.x + Math.cos(a) * 16, my = p.y + Math.sin(a) * 16;
    for (var i = 0; i < n; i++) {
      var off = (i - (n - 1) / 2) * spread;
      var aa = a + off + rand(-0.02, 0.02);
      var crit = Math.random() < p.crit;
      bullets.push({
        x: mx, y: my,
        vx: Math.cos(aa) * p.bulletSpeed,
        vy: Math.sin(aa) * p.bulletSpeed,
        r: 4,
        dmg: p.dmg * (crit ? p.critMul : 1),
        crit: crit,
        pierce: p.pierce,
        life: 1.4,
        explode: p.explode,
        hits: {}
      });
    }
    p.fireCd = p.fireInterval;
    Sfx.shoot();
    FX.spark(mx, my, '#9ff5ff', 2, 150, 2, 0.18);
  }

  function fireAt(target) {
    fireDir(ang(player.x, player.y, target.x, target.y));
  }

  /* ---------------- 敌人 ---------------- */
  function makeEnemy(type, x, y, opts) {
    opts = opts || {};
    var t = TYPES[type];
    var elite = !!opts.elite;
    var scale = opts.scale || 1;
    var wf = 1 + (wave - 1) * 0.22;
    var hp = t.hp * wf * scale * (elite ? 3.5 : 1);
    return {
      id: eid++,
      type: type, x: x, y: y, vx: 0, vy: 0,
      r: t.r * scale * (elite ? 1.75 : 1),
      hp: hp, maxHp: hp,
      speed: t.speed * (1 + (wave - 1) * 0.02) * (elite ? 0.8 : 1),
      dmg: t.dmg * (elite ? 1.6 : 1),
      xp: Math.max(1, Math.round(t.xp * (elite ? 3 : 1))),
      score: t.score * (elite ? 12 : 1),
      color: elite ? '#ffd166' : t.color,
      sides: t.sides,
      rot: rand(TAU), rotSpd: rand(-1.1, 1.1),
      flash: 0, age: rand(10), dead: false, slowT: 0, orbCd: 0,
      ranged: !!t.ranged, shootCd: rand(0.9, 2.4),
      split: !!t.split, elite: elite, wob: rand(TAU)
    };
  }

  function edgePoint() {
    var m = 36;
    var side = randInt(0, 3);
    var x, y;
    if (side === 0) { x = rand(-m, W + m); y = -m; }
    else if (side === 1) { x = W + m; y = rand(-m, H + m); }
    else if (side === 2) { x = rand(-m, W + m); y = H + m; }
    else { x = -m; y = rand(-m, H + m); }
    return { x: x, y: y };
  }

  function rollType() {
    var w = wave;
    var table = [
      ['grunt', 52],
      ['chaser', w >= 2 ? 26 : 0],
      ['shooter', w >= 3 ? 14 : 0],
      ['tank', w >= 3 ? 10 : 0],
      ['splitter', w >= 4 ? 12 : 0]
    ];
    var total = 0, i;
    for (i = 0; i < table.length; i++) total += table[i][1];
    var r = Math.random() * total;
    for (i = 0; i < table.length; i++) {
      r -= table[i][1];
      if (r <= 0) return table[i][0];
    }
    return 'grunt';
  }

  function spawnEnemy(typeOverride) {
    var pt = edgePoint();
    var e = makeEnemy(typeOverride || rollType(), pt.x, pt.y, {});
    enemies.push(e);
    return e;
  }

  function spawnElite() {
    var pt = edgePoint();
    enemies.push(makeEnemy('tank', pt.x, pt.y, { elite: true }));
    banner.text = 'ELITE';
    banner.life = 1.6; banner.max = 1.6;
    Sfx.elite();
    FX.shakeAdd(8);
  }

  /* ---- Boss：裂核（弹幕型）/ 母巢（地面腐蚀 + 召唤 + 冲锋） ---- */
  function spawnBoss() {
    var isHive = (wave / 4) % 2 === 0;
    var pt = edgePoint();
    var b = makeEnemy('tank', pt.x, pt.y, {});
    var hp = (isHive ? 520 : 440) * (1 + (wave / 4 - 1) * 0.75);
    b.boss = true;
    b.elite = false;
    b.bossType = isHive ? 'hive' : 'core';
    b.hp = hp; b.maxHp = hp;
    b.xp = 18;
    b.score = 2500;
    b.aimRot = 0;
    b.phase = 1;
    if (isHive) {
      b.r = 48;
      b.speed = 38;
      b.dmg = 30;
      b.color = '#7dff9b';
      b.sides = 7;
      b.rotSpd = 0.45;
      b.hazCd = 1.4;
      b.summonCd = 3.2;
      b.chargeCd = 5.0;
      b.chargeWind = 0;
      b.chargeDash = 0;
      b.chargeVX = 0; b.chargeVY = 0;
      banner.text = '母巢 · 出现';
    } else {
      b.r = 54;
      b.speed = 44;
      b.dmg = 26;
      b.color = '#ffd166';
      b.sides = 8;
      b.rotSpd = 0.3;
      b.bossT = 2.0;
      banner.text = '裂核 · 出现';
    }
    bossRef = b;
    enemies.push(b);
    banner.life = 2.2; banner.max = 2.2;
    Sfx.elite();
    FX.shakeAdd(16);
    FX.ring(b.x, b.y, b.color, 20, 320, 0.9, 4);
  }

  /* ---- 母巢的压力来自地面，不是弹幕 ---- */
  function updateHive(e, dt, d) {
    e.flash = Math.max(0, e.flash - dt * 3.5);

    if (e.chargeWind > 0) {
      e.chargeWind -= dt;
      e.flash = 1;
      if (e.chargeWind <= 0) {
        var ca = ang(e.x, e.y, player.x, player.y);
        e.chargeVX = Math.cos(ca) * 620;
        e.chargeVY = Math.sin(ca) * 620;
        e.chargeDash = 0.55;
        Sfx.elite();
      }
      return;
    }
    if (e.chargeDash > 0) {
      e.chargeDash -= dt;
      e.x += e.chargeVX * dt;
      e.y += e.chargeVY * dt;
      FX.spark(e.x, e.y, '#7dff9b', 2, 140, 3, 0.28);
      return;
    }

    var k = e.hp / e.maxHp;
    e.hazCd -= dt;
    if (e.hazCd <= 0) {
      e.hazCd = k > 0.5 ? 1.9 : 1.35;
      var n = k > 0.5 ? 1 : 2;
      for (var i = 0; i < n; i++) {
        spawnHazard(player.x + rand(-45, 45), player.y + rand(-45, 45), 56 + (1 - k) * 26);
      }
    }

    e.summonCd -= dt;
    if (e.summonCd <= 0) {
      e.summonCd = 5.5;
      for (var s = 0; s < 3; s++) {
        var pt = edgePoint();
        var kind = s === 0 ? 'grunt' : (s === 1 ? 'chaser' : 'splitter');
        enemies.push(makeEnemy(kind, pt.x, pt.y, {}));
      }
      banner.text = '母巢 孵化';
      banner.life = 1.0; banner.max = 1.0;
      FX.ring(e.x, e.y, '#7dff9b', e.r, e.r * 2.4, 0.5, 3);
    }

    e.chargeCd -= dt;
    if (e.chargeCd <= 0 && d > 130) {
      e.chargeCd = 6.2;
      e.chargeWind = 0.5;
      FX.ring(e.x, e.y, '#ffffff', e.r * 0.8, e.r * 1.7, 0.45, 3);
    }
  }

  function spawnHazard(x, y, r) {
    hazards.push({ x: x, y: y, r: r, t: 0, warn: 0.95, life: 1.7 });
    if (hazards.length > 26) hazards.shift();
  }

  function updateHazards(dt) {
    for (var i = hazards.length - 1; i >= 0; i--) {
      var h = hazards[i];
      h.t += dt;
      if (h.t > h.warn + h.life) { hazards.splice(i, 1); continue; }
      if (h.t > h.warn && dist2(player.x, player.y, h.x, h.y) < h.r * h.r) {
        hurtPlayer(9);
      }
    }
  }

  function bossRing(e, n, a0, spd, color) {
    for (var i = 0; i < n; i++) {
      var a = a0 + (i / n) * TAU;
      ebullets.push({
        x: e.x + Math.cos(a) * (e.r * 0.75),
        y: e.y + Math.sin(a) * (e.r * 0.75),
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        r: 6.5, dmg: 9, life: 6, color: color
      });
    }
  }

  function bossAimed(e, spread, spd) {
    var a = ang(e.x, e.y, player.x, player.y) + spread;
    ebullets.push({
      x: e.x + Math.cos(a) * e.r * 0.8,
      y: e.y + Math.sin(a) * e.r * 0.8,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      r: 6, dmg: 9, life: 6, color: '#ff8fa3'
    });
  }

  function bossAttack(e) {
    var k = e.hp / e.maxHp;
    e.phase = k > 0.6 ? 1 : (k > 0.3 ? 2 : 3);
    e.flash = 0.7;
    if (e.phase === 1) {
      bossRing(e, 12, rand(TAU), 195, '#ffb703');
      e.bossT = 2.3;
    } else if (e.phase === 2) {
      e.aimRot += 0.45;
      bossRing(e, 16, e.aimRot, 215, '#ffb703');
      bossAimed(e, -0.12, 265);
      bossAimed(e, 0, 265);
      bossAimed(e, 0.12, 265);
      e.bossT = 1.9;
    } else {
      e.aimRot += 0.62;
      bossRing(e, 20, e.aimRot, 235, '#ffb703');
      bossAimed(e, -0.2, 285);
      bossAimed(e, 0, 285);
      bossAimed(e, 0.2, 285);
      e.bossT = 1.45;
    }
    if (ebullets.length > 260) ebullets.splice(0, ebullets.length - 260);
  }

  function updateSpawner(dt) {
    if (waveBreak > 0) { return; }
    spawnT -= dt;
    if (spawnT > 0) return;
    if (enemies.length > 110) { spawnT = 0.55; return; }
    var rate = Math.min(4.5, 0.95 + elapsed * 0.014);
    if (bossRef && !bossRef.dead) rate *= 0.5;
    var count = 1 + Math.min(4, Math.floor(elapsed / 45));
    spawnT = (count / rate) * rand(0.85, 1.15);
    for (var i = 0; i < count; i++) spawnEnemy();
  }

  function updateEnemies(dt) {
    var px = player.x, py = player.y;
    var i, j, e, o;

    for (i = 0; i < enemies.length; i++) {
      e = enemies[i];
      if (e.dead) continue;

      e.age += dt;
      e.rot += e.rotSpd * dt;
      e.flash = Math.max(0, e.flash - dt * 5);
      if (e.slowT > 0) e.slowT -= dt;
      if (e.orbCd > 0) e.orbCd -= dt;

      var dx = px - e.x, dy = py - e.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = dx / d, ny = dy / d;
      var ax = nx, ay = ny;

      if (e.boss) {
        var want = e.bossType === 'hive' ? 190 : 235;
        if (d > want + 45) { ax = nx; ay = ny; }
        else if (d < want - 55) { ax = -nx * 0.8; ay = -ny * 0.8; }
        else { ax = -ny * 0.55; ay = nx * 0.55; }
      } else if (e.type === 'shooter') {
        if (d < 250) { ax = -nx; ay = -ny; }
        else if (d < 380) { ax = -ny; ay = nx; }
      } else if (e.type === 'chaser') {
        var s = Math.sin(e.age * 6 + e.wob) * 0.7;
        ax = nx - ny * s;
        ay = ny + nx * s;
      }

      if (!e.boss) {
        for (j = 0; j < enemies.length; j++) {
          o = enemies[j];
          if (o === e || o.dead) continue;
          var ddx = e.x - o.x, ddy = e.y - o.y;
          var dd = ddx * ddx + ddy * ddy;
          var minD = (e.r + o.r) * 0.85;
          if (dd < minD * minD && dd > 0.01) {
            var dl = Math.sqrt(dd);
            ax += (ddx / dl) * 1.1;
            ay += (ddy / dl) * 1.1;
          }
        }
      }

      var al = Math.sqrt(ax * ax + ay * ay) || 1;
      ax /= al; ay /= al;
      var acc = Math.min(1, 7 * dt);
      var spd = e.speed * (e.slowT > 0 ? Math.max(0.3, 1 - player.frost) : 1);
      e.vx = lerp(e.vx, ax * spd, acc);
      e.vy = lerp(e.vy, ay * spd, acc);
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      if (e.boss) {
        if (e.bossType === 'hive') updateHive(e, dt, d);
        else { e.bossT -= dt; if (e.bossT <= 0) bossAttack(e); }
      }

      if (e.ranged) {
        e.shootCd -= dt;
        if (e.shootCd <= 0 && d < 560) {
          e.shootCd = rand(1.6, 2.6);
          e.flash = 1;
          ebullets.push({
            x: e.x + nx * (e.r + 4), y: e.y + ny * (e.r + 4),
            vx: nx * 235, vy: ny * 235,
            r: 5.5, dmg: 8, life: 4.5, color: '#ff6b8a'
          });
        }
      }

      var tdx = e.x - px, tdy = e.y - py;
      var td2 = tdx * tdx + tdy * tdy;
      var rr = e.r + player.r;
      if (td2 < rr * rr && player.invuln <= 0) {
        var tl = Math.sqrt(td2) || 1;
        hurtPlayer(e.dmg);
        e.vx = -(tdx / tl) * 240;
        e.vy = -(tdy / tl) * 240;
      }
    }

    var alive = [];
    for (i = 0; i < enemies.length; i++) if (!enemies[i].dead) alive.push(enemies[i]);
    enemies = alive;
  }

  function hurtPlayer(dmg) {
    if (mode !== 'playing' || player.invuln > 0 || godMode) return;
    player.hp -= dmg;
    player.invuln = 0.85;
    FX.shakeAdd(12);
    FX.flashAdd(0.22, '#ff2d55');
    FX.spark(player.x, player.y, '#ff8fa3', 9, 220, 3, 0.45);
    Sfx.hurt();
    if (player.hp <= 0) {
      player.hp = 0;
      die();
    }
  }

  function damageEnemy(e, dmg, crit) {
    if (e.dead) return;
    if (player.execute && e.hp < e.maxHp * 0.25) dmg *= 2;
    e.hp -= dmg;
    if (player.frost > 0) e.slowT = 1.2;
    e.flash = 1;
    FX.spark(e.x, e.y, crit ? '#fff2a8' : e.color, crit ? 5 : 3, 160, 2, 0.25);
    FX.float(e.x + rand(-6, 6), e.y - e.r * 0.6, Math.round(dmg), crit ? '#ffe066' : '#cfe9ff', crit ? 18 : 12);
    Sfx.hit();
    if (e.hp <= 0) killEnemy(e);
  }

  function comboMult() {
    var cap = 2 + (player.evoCombo || 0);
    return 1 + Math.min(cap, combo * 0.1);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    combo++;
    comboTimer = 1.35;
    if (combo > bestCombo) bestCombo = combo;
    score += Math.round(e.score * comboMult());
    kills++;
    FX.ring(e.x, e.y, e.color, e.r * 0.6, e.r * 3.2, 0.35, 2);
    FX.spark(e.x, e.y, e.color, e.elite ? 34 : 14, 340, 3.4, 0.7);
    if (e.boss) {
      bossKills++;
      bossRef = null;
      hitStop = 0.22;
      player.hp = Math.min(player.maxHp, player.hp + 30);
      FX.flashAdd(0.22, '#ffd166');
      FX.ring(e.x, e.y, '#ffd166', 20, 420, 1.0, 6);
      FX.ring(e.x, e.y, '#ffffff', 10, 220, 0.6, 3);
      FX.spark(e.x, e.y, '#ffd166', 56, 620, 4.5, 1.1);
      banner.text = e.bossType === 'hive' ? '母巢 击破' : '裂核 击破';
      banner.life = 2.2; banner.max = 2.2;
      Sfx.boom();
    } else if (e.elite) {
      FX.ring(e.x, e.y, '#ffd166', 20, 200, 0.8, 4);
      FX.shakeAdd(18);
      hitStop = 0.13;
      Sfx.boom();
    } else {
      Sfx.kill();
    }
    var n = e.boss ? 18 : Math.min(8, e.xp);
    for (var i = 0; i < n; i++) {
      var a = rand(TAU), s = rand(40, 170);
      shards.push({
        x: e.x, y: e.y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 20, age: 0, value: 1
      });
    }
    if (e.split) {
      for (var k = 0; k < 2; k++) {
        var ch = makeEnemy('grunt', e.x + rand(-14, 14), e.y + rand(-14, 14), { scale: 0.7 });
        ch.hp = ch.hp * 0.6;
        ch.maxHp = ch.hp;
        enemies.push(ch);
      }
    }
  }

  function explodeAt(x, y, radius, dmg) {
    FX.ring(x, y, '#ffd166', 6, radius * 1.6, 0.28, 3);
    FX.spark(x, y, '#ffd166', 10, 260, 3, 0.4);
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      var rr = radius + e.r;
      if (dist2(x, y, e.x, e.y) < rr * rr) damageEnemy(e, dmg, false);
    }
    Sfx.hit();
  }

  /* ---------------- 子弹 / 碎片 ---------------- */
  function updateBullets(dt) {
    var i, j, b, e;
    for (i = bullets.length - 1; i >= 0; i--) {
      b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -60 || b.x > W + 60 || b.y < -60 || b.y > H + 60) {
        bullets.splice(i, 1);
        continue;
      }
      for (j = 0; j < enemies.length; j++) {
        e = enemies[j];
        if (e.dead) continue;
        if (b.hits[e.id]) continue;
        var rr = b.r + e.r;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          damageEnemy(e, b.dmg, b.crit);
          b.hits[e.id] = true;
          if (b.explode) explodeAt(b.x, b.y, 62, b.dmg * 0.55);
          if (b.pierce > 0) { b.pierce--; b.dmg *= 0.9; }
          else { bullets.splice(i, 1); }
          break;
        }
      }
    }
  }

  function updateEnemyBullets(dt) {
    for (var i = ebullets.length - 1; i >= 0; i--) {
      var b = ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      var rr = b.r + player.r;
      if (player.invuln <= 0 && dist2(b.x, b.y, player.x, player.y) < rr * rr) {
        hurtPlayer(b.dmg);
        ebullets.splice(i, 1);
        continue;
      }
      if (b.life <= 0 || b.x < -50 || b.x > W + 50 || b.y < -50 || b.y > H + 50) ebullets.splice(i, 1);
    }
  }

  function updateShards(dt) {
    var p = player;
    for (var i = shards.length - 1; i >= 0; i--) {
      var s = shards[i];
      s.life -= dt;
      s.age += dt;
      var d2 = dist2(s.x, s.y, p.x, p.y);
      var pr = p.pickup;
      var pulling = d2 < pr * pr;
      if (pulling || s.age > 3.2) {
        var d = Math.sqrt(d2) || 1;
        var sp = pulling ? 320 + 640 * (1 - d / pr) : 150;
        s.x += (p.x - s.x) / d * sp * dt;
        s.y += (p.y - s.y) / d * sp * dt;
      } else {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        var k = Math.pow(0.12, dt);
        s.vx *= k;
        s.vy *= k;
      }
      if (d2 < 420) {
        addXp(s.value);
        FX.spark(s.x, s.y, '#9ff5ff', 2, 90, 2, 0.25);
        shards.splice(i, 1);
      } else if (s.life <= 0) {
        shards.splice(i, 1);
      }
    }
  }

  /* ---------------- 经验 / 升级 ---------------- */
  function addXp(v) {
    player.xp += v;
    while (player.xp >= player.xpNeed) {
      player.xp -= player.xpNeed;
      player.level++;
      player.xpNeed = xpNeed(player.level);
      pendingLevels++;
      FX.ring(player.x, player.y, '#6ee7ff', 18, 150, 0.6, 3);
      Sfx.level();
    }
    if (pendingLevels > 0 && mode === 'playing') openLevelUp();
  }

  function weightedIndex(list) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i].evo ? 1.8 : (list[i].rare ? 0.55 : 1);
    var r = Math.random() * total;
    for (i = 0; i < list.length; i++) {
      r -= list[i].evo ? 1.8 : (list[i].rare ? 0.55 : 1);
      if (r <= 0) return i;
    }
    return list.length - 1;
  }

  function rollCards(n) {
    var avail = [];
    for (var i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i];
      if ((taken[u.id] || 0) < u.max) avail.push(u);
    }
    for (var e = 0; e < EVOLUTIONS.length; e++) {
      var ev = EVOLUTIONS[e];
      if ((taken[ev.id] || 0) >= ev.max) continue;
      for (var b = 0; b < UPGRADES.length; b++) {
        if (UPGRADES[b].id === ev.reqId) {
          if ((taken[ev.reqId] || 0) >= UPGRADES[b].max) avail.push(ev);
          break;
        }
      }
    }
    var out = [];
    for (var k = 0; k < n && avail.length > 0; k++) {
      var idx = weightedIndex(avail);
      out.push(avail[idx]);
      avail.splice(idx, 1);
    }
    if (out.length < n) {
      for (var f = 0; f < FILLERS.length && out.length < n; f++) {
        out.push(FILLERS[f]);
      }
    }
    return out;
  }

  function renderCards(list) {
    currentCards = list || rollCards(3);
    el.cards.innerHTML = '';
    for (var i = 0; i < currentCards.length; i++) {
      (function (idx) {
        var u = currentCards[idx];
        var b = document.createElement('button');
        b.className = 'card' + (u.rare ? ' rare' : '') + (u.evo ? ' evo' : '');
        var num = document.createElement('div'); num.className = 'idx'; num.textContent = String(idx + 1);
        var nm = document.createElement('div'); nm.className = 'cname'; nm.textContent = u.name;
        var ds = document.createElement('div'); ds.className = 'cdesc'; ds.textContent = u.desc;
        var st = document.createElement('div'); st.className = 'cstack';
        st.textContent = u.evo ? '进化 · 一次性' : 'Lv ' + ((taken[u.id] || 0) + 1) + ' / ' + u.max;
        b.appendChild(num); b.appendChild(nm); b.appendChild(ds); b.appendChild(st);
        b.addEventListener('click', function () { choose(idx); });
        el.cards.appendChild(b);
      })(i);
    }
  }

  function choose(idx) {
    if (mode !== 'levelup') return;
    var u = currentCards[idx];
    if (!u) return;
    u.apply(player);
    taken[u.id] = (taken[u.id] || 0) + 1;
    pendingLevels = Math.max(0, pendingLevels - 1);
    Sfx.ui();
    updateHUD();
    if (pendingLevels > 0) {
      renderCards();
    } else {
      el.levelup.classList.add('hidden');
      mode = 'playing';
      FX.ring(player.x, player.y, '#6ee7ff', 20, 90, 0.4, 3);
      lastT = performance.now();
    }
  }

  function openLevelUp() {
    if (mode !== 'playing') return;
    mode = 'levelup';
    el.levelup.classList.remove('hidden');
    renderCards();
    if (currentCards.length === 0) {
      // 兜底：真的没有任何卡可给时，直接放回游戏，别把玩家卡在空界面
      el.levelup.classList.add('hidden');
      pendingLevels = 0;
      mode = 'playing';
      return;
    }
    if (demoMode) {
      var guard = 0;
      while (pendingLevels > 0 && mode === 'levelup' && guard < 12) {
        var pick = 0;
        for (var ci = 0; ci < currentCards.length; ci++) {
          if (currentCards[ci].evo) { pick = ci; break; }
        }
        choose(pick);
        guard++;
      }
    }
  }

  /* ---------------- HUD / 渲染 ---------------- */
  function updateHUD() {
    if (!player) return;
    el.hpFill.style.width = clamp(player.hp / player.maxHp * 100, 0, 100) + '%';
    el.hpText.textContent = String(Math.max(0, Math.ceil(player.hp)));
    el.xpFill.style.width = clamp(player.xp / player.xpNeed * 100, 0, 100) + '%';
    el.lvText.textContent = 'LV ' + player.level;
    el.waveText.textContent = 'WAVE ' + wave;
    el.timeText.textContent = fmtTime(elapsed);
    el.scoreText.textContent = String(score);
    el.bestText.textContent = 'BEST ' + Math.max(best, score);
    if (combo >= 2) {
      el.comboText.textContent = '×' + comboMult().toFixed(2) + '  ' + combo + ' COMBO';
      el.comboText.classList.add('on');
    } else {
      el.comboText.classList.remove('on');
    }
  }

  function drawHazards(ctx) {
    for (var i = 0; i < hazards.length; i++) {
      var h = hazards[i];
      if (h.t <= h.warn) {
        var k = h.t / h.warn;
        ctx.strokeStyle = 'rgba(125,255,155,' + (0.22 + 0.55 * k) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * (0.35 + 0.65 * k), 0, TAU);
        ctx.stroke();
        ctx.fillStyle = 'rgba(125,255,155,0.05)';
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, TAU);
        ctx.fill();
      } else {
        var a = 1 - (h.t - h.warn) / h.life;
        ctx.fillStyle = 'rgba(125,255,155,' + (0.05 + 0.16 * a) + ')';
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(125,255,155,' + (0.55 * a) + ')';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function drawShard(ctx, s) {
    ctx.fillStyle = 'rgba(120,240,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 5);
    ctx.lineTo(s.x + 3.2, s.y);
    ctx.lineTo(s.x, s.y + 5);
    ctx.lineTo(s.x - 3.2, s.y);
    ctx.closePath();
    ctx.fill();
  }

  function drawEnemy(ctx, e) {
    if (e.boss) { drawBoss(ctx, e); return; }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    var r = e.r, sides = e.sides;
    ctx.beginPath();
    for (var i = 0; i < sides; i++) {
      var a = (i / sides) * TAU - Math.PI / 2;
      var px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (e.slowT > 0) ctx.fillStyle = hexA('#8fe8ff', 0.30);
    else ctx.fillStyle = hexA(e.color, e.flash > 0.4 ? 0.75 : 0.16);
    ctx.fill();
    ctx.lineWidth = e.elite ? 3 : 2;
    ctx.strokeStyle = e.flash > 0.4 ? '#ffffff' : e.color;
    ctx.stroke();
    if (e.elite) {
      ctx.rotate(-e.rot);
      ctx.strokeStyle = 'rgba(255,209,102,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.35, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    if (e.elite || e.maxHp > 60) {
      var w = e.elite ? 84 : 40;
      var yy = e.y - e.r - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(e.x - w / 2, yy, w, 4);
      ctx.fillStyle = e.elite ? '#ffd166' : 'rgba(230,245,255,0.75)';
      ctx.fillRect(e.x - w / 2, yy, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }

  function drawBoss(ctx, e) {
    if (e.bossType === 'hive') { drawHiveBoss(ctx, e); return; }
    var pulse = 0.5 + 0.5 * Math.sin(e.age * 3.2);
    var i, a, rr, px, py;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 30;
    ctx.rotate(e.rot);
    ctx.beginPath();
    for (i = 0; i < 8; i++) {
      a = (i / 8) * TAU;
      rr = e.r * (1 + 0.06 * Math.sin(e.age * 4 + i));
      px = Math.cos(a) * rr; py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,209,102,' + (0.10 + 0.10 * pulse) + ')';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = e.flash > 0.3 ? '#ffffff' : '#ffd166';
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.rotate(-e.rot * 2.4);
    ctx.beginPath();
    for (i = 0; i < 6; i++) {
      a = (i / 6) * TAU;
      rr = e.r * 0.6;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,240,200,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff6dd';
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.22 * (0.9 + 0.15 * pulse), 0, TAU);
    ctx.fill();
    ctx.restore();

    var k = clamp(e.hp / e.maxHp, 0, 1);
    ctx.strokeStyle = 'rgba(255,209,102,' + (0.22 + 0.3 * pulse) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 1.22, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
  }

  function drawHiveBoss(ctx, e) {
    var pulse = 0.5 + 0.5 * Math.sin(e.age * 4);
    var i, a, rr;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.shadowColor = '#7dff9b';
    ctx.shadowBlur = 26;
    ctx.rotate(e.rot);
    ctx.beginPath();
    for (i = 0; i < 7; i++) {
      a = (i / 7) * TAU;
      rr = e.r * (1 + 0.10 * Math.sin(e.age * 3 + i * 1.7));
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(125,255,155,' + (0.10 + 0.10 * pulse) + ')';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = e.flash > 0.3 ? '#ffffff' : '#7dff9b';
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.rotate(-e.rot * 1.8);
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.42, 0, TAU);
    ctx.strokeStyle = 'rgba(210,255,220,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(190,255,205,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.18 * (0.85 + 0.2 * pulse), 0, TAU);
    ctx.fill();
    ctx.restore();

    if (e.chargeWind > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (1.6 + 0.25 * Math.sin(e.age * 34)), 0, TAU);
      ctx.stroke();
    }

    var k = clamp(e.hp / e.maxHp, 0, 1);
    ctx.strokeStyle = 'rgba(125,255,155,' + (0.22 + 0.3 * pulse) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 1.22, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
  }

  function drawBullet(ctx, b) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = b.crit ? 'rgba(255,224,102,0.18)' : 'rgba(110,231,255,0.16)';
    ctx.lineWidth = b.crit ? 7 : 5.5;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.stroke();
    ctx.strokeStyle = b.crit ? '#ffe066' : '#d8fbff';
    ctx.lineWidth = b.crit ? 3 : 2.2;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.013, b.y - b.vy * 0.013);
    ctx.stroke();
  }

  function drawPlayer(ctx) {
    var p = player;

    if (p.orbs > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (var oi = 0; oi < p.orbs; oi++) {
        var oa = p.orbAngle + oi * TAU / p.orbs;
        var ox = p.x + Math.cos(oa) * p.orbR;
        var oy = p.y + Math.sin(oa) * p.orbR;
        ctx.fillStyle = 'rgba(120,235,255,0.20)';
        ctx.beginPath(); ctx.arc(ox, oy, 14, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c8f9ff';
        ctx.beginPath(); ctx.arc(ox, oy, 6, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < p.trail.length; i++) {
      var t = p.trail[i];
      var a = Math.max(0, t.life / 0.32);
      ctx.globalAlpha = a * 0.22;
      ctx.fillStyle = '#6ee7ff';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 9 * a + 3, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    var inv = p.invuln > 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim + Math.PI / 2);
    if (inv && Math.floor(p.invuln * 18) % 2 === 0) ctx.globalAlpha = 0.45;

    ctx.shadowColor = '#6ee7ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(11, 12);
    ctx.lineTo(0, 6);
    ctx.lineTo(-11, 12);
    ctx.closePath();
    ctx.fillStyle = '#a8f6ff';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#eafcff';
    ctx.stroke();
    ctx.restore();

    if (p.dashCd > 0 && p.dashCd < p.dashMax) {
      var k = 1 - p.dashCd / p.dashMax;
      ctx.strokeStyle = 'rgba(110,231,255,' + (0.20 + 0.35 * k) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 19, -Math.PI / 2, -Math.PI / 2 + TAU * k);
      ctx.stroke();
    }
  }

  function render(t) {
    var ctx = Screen.ctx, i;

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(110,231,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gx = 0; gx <= W; gx += 64) { ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, H); }
    for (var gy = 0; gy <= H; gy += 48) { ctx.moveTo(0, gy + 0.5); ctx.lineTo(W, gy + 0.5); }
    ctx.stroke();

    Stars.draw(ctx, W, H, player ? player.x : W / 2, player ? player.y : H / 2, t);

    ctx.save();
    if (FX.shake > 0.2) {
      ctx.translate(rand(-1, 1) * FX.shake * 0.5, rand(-1, 1) * FX.shake * 0.5);
    }

    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < shards.length; i++) drawShard(ctx, shards[i]);
    ctx.globalCompositeOperation = 'source-over';

    drawHazards(ctx);

    for (i = 0; i < enemies.length; i++) if (!enemies[i].dead) drawEnemy(ctx, enemies[i]);

    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < ebullets.length; i++) {
      var eb = ebullets[i];
      ctx.fillStyle = hexA(eb.color, 0.8);
      ctx.beginPath();
      ctx.arc(eb.x, eb.y, eb.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (i = 0; i < bullets.length; i++) drawBullet(ctx, bullets[i]);
    ctx.globalCompositeOperation = 'source-over';

    if (player && (mode === 'playing' || mode === 'levelup' || mode === 'paused')) drawPlayer(ctx);

    FX.draw(ctx);
    ctx.restore();

    if (aimMode === 'mouse' && Input.hasPointer && mode === 'playing') {
      var cx = Input.mx, cy = Input.my;
      ctx.strokeStyle = 'rgba(168,246,255,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy); ctx.lineTo(cx - 5, cy);
      ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 15, cy);
      ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy - 5);
      ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 15);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,250,255,0.9)';
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    if (player && mode !== 'menu' && player.hp > 0 && player.hp / player.maxHp < 0.35) {
      var lowK = 1 - player.hp / player.maxHp / 0.35;
      var pulse = 0.55 + 0.45 * Math.sin(t * 7);
      ctx.globalAlpha = Math.min(0.6, lowK * (0.28 + 0.26 * pulse));
      ctx.fillStyle = dangerGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    if (bossRef && !bossRef.dead && mode !== 'menu') {
      var bwid = 320, bhei = 8;
      var bx = (W - bwid) / 2, by = 30;
      var bk = clamp(bossRef.hp / bossRef.maxHp, 0, 1);
      var bcol = bossRef.bossType === 'hive'
        ? (bk > 0.5 ? 'rgba(125,255,155,0.95)' : 'rgba(255,190,90,0.95)')
        : (bk > 0.6 ? 'rgba(255,209,102,0.95)'
          : (bk > 0.3 ? 'rgba(255,150,70,0.95)' : 'rgba(255,80,95,0.95)'));
      ctx.fillStyle = 'rgba(8,14,24,0.75)';
      ctx.fillRect(bx - 3, by - 3, bwid + 6, bhei + 6);
      ctx.fillStyle = bcol;
      ctx.fillRect(bx, by, bwid * bk, bhei);
      ctx.font = '700 11px "PingFang SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255,225,170,0.9)';
      ctx.fillText(bossRef.bossType === 'hive' ? '母巢 · HIVE' : '裂核 · SPLITCORE', W / 2, by - 7);
    }

    if (FX.flash > 0.01) {
      ctx.globalAlpha = Math.min(1, FX.flash);
      ctx.fillStyle = FX.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    if (banner.life > 0) {
      var ba = Math.min(1, banner.life / 0.7);
      ctx.globalAlpha = ba * 0.92;
      ctx.fillStyle = '#eaf7ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 46px "PingFang SC", system-ui, sans-serif';
      ctx.fillText(banner.text, W / 2, H * 0.28);
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';
    }

    if (mode !== 'menu') updateHUD();
  }

  /* ---------------- 主循环 ---------------- */
  function update(dt) {
    elapsed += dt;

    var w = 1 + Math.floor(elapsed / 22);
    if (w !== wave) {
      wave = w;
      banner.text = 'WAVE ' + wave;
      banner.life = 1.8; banner.max = 1.8;
      waveBreak = 1.5;
      if (wave % 4 === 0) spawnBoss();
      else if (wave % 4 === 2 && wave >= 6) spawnElite();
    }

    if (banner.life > 0) banner.life -= dt;
    if (waveBreak > 0) waveBreak -= dt;

    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) { combo = 0; comboTimer = 0; }
    }

    updatePlayer(dt);
    updateSpawner(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateEnemyBullets(dt);
    updateHazards(dt);
    updateShards(dt);
    FX.update(dt);
  }

  function frame(now) {
    if (!lastT) lastT = now;
    var dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;

    var sdt = dt;
    if (hitStop > 0) { hitStop -= dt; sdt = dt * 0.18; }

    if (mode === 'playing') {
      update(sdt);
    } else if (mode === 'dead') {
      FX.update(dt * 0.3);
      if (!overShown) {
        deathTimer -= dt;
        if (deathTimer <= 0) showOver();
      }
    } else if (mode === 'menu') {
      FX.update(dt);
    }

    render(now / 1000);
    Input.endFrame();
    requestAnimationFrame(frame);
  }

  /* ---------------- 初始化 ---------------- */
  function buildBackdrop() {
    var ctx = Screen.ctx;
    bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.42, 60, W * 0.5, H * 0.5, W * 0.78);
    bgGrad.addColorStop(0, '#0a1728');
    bgGrad.addColorStop(0.55, '#060c17');
    bgGrad.addColorStop(1, '#02040a');
    vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.30, W / 2, H / 2, H * 1.02);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.78)');
    dangerGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.80);
    dangerGrad.addColorStop(0, 'rgba(255,40,70,0)');
    dangerGrad.addColorStop(0.65, 'rgba(255,40,70,0.35)');
    dangerGrad.addColorStop(1, 'rgba(255,26,60,1)');
  }

  function onKey(e) {
    if (mode === 'levelup') {
      var code = e.code;
      if (code === 'Digit1' || code === 'Numpad1') choose(0);
      else if (code === 'Digit2' || code === 'Numpad2') choose(1);
      else if (code === 'Digit3' || code === 'Numpad3') choose(2);
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      aimMode = aimMode === 'mouse' ? 'auto' : 'mouse';
      banner.text = aimMode === 'mouse' ? '鼠标瞄准' : '自动瞄准';
      banner.life = 1.2; banner.max = 1.2;
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      togglePause();
      return;
    }
    if (e.code === 'KeyM') {
      Sfx.init();
      Sfx.setMuted(!Sfx.muted);
      banner.text = Sfx.muted ? 'MUTED' : 'SOUND ON';
      banner.life = 1.0; banner.max = 1.0;
      return;
    }
    if ((e.code === 'KeyR' || e.code === 'Enter') && mode === 'dead' && overShown) start();
    if ((e.code === 'Enter' || e.code === 'Space') && mode === 'menu') start();
  }

  function warmup(seconds) {
    var steps = Math.round(seconds * 60);
    for (var i = 0; i < steps && mode === 'playing'; i++) update(1 / 60);
  }

  function init() {
    Screen.init(el.canvas);
    Input.init(el.canvas);
    Stars.init(W, H);
    buildBackdrop();
    el.menuBest.textContent = '最高分 ' + best;
    el.bestText.textContent = 'BEST ' + best;

    resetGame();
    mode = 'menu';

    el.startBtn.addEventListener('click', start);
    el.againBtn.addEventListener('click', start);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', function () {
      if (mode === 'playing') togglePause();
    });

    requestAnimationFrame(frame);

    if (demoMode) {
      Input.hasPointer = true;
      Input.mx = W / 2 + 120;
      Input.my = H / 2;
      start();
      var m = /[?&]t=(\d+)/.exec(location.search);
      if (m) {
        warmup(parseInt(m[1], 10));
        banner.text = 'K' + kills + ' L' + player.level + ' HP' + Math.round(player.hp) +
          ' E' + enemies.length + ' W' + wave + ' S' + score;
        banner.life = 9999; banner.max = 9999;
      }
    }
  }

  window.addEventListener('error', function (ev) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99;max-width:70vw;padding:10px 14px;' +
      'border-radius:8px;background:#3a0d16;color:#ffb4c0;font:12px/1.5 monospace;white-space:pre-wrap;';
    d.textContent = 'ERROR: ' + ev.message + '\n' + (ev.filename || '') + ':' + (ev.lineno || '');
    document.body.appendChild(d);
  });

  init();
})();
