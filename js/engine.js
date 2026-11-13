// Motore biomeccanico di Leve — modello quasi-statico sul piano sagittale.
// Unità: metri, chilogrammi, radianti, newton. Asse x in avanti (verso le punte), y verso l'alto.
// La caviglia è l'origine orizzontale (x = 0).

export const G = 9.81;
const D2R = Math.PI / 180;

// Parametri inerziali dei segmenti: de Leva (1996), frazioni della massa corporea
// e posizione del baricentro come frazione della lunghezza dal capo prossimale.
export const TABLES = {
  M: {
    mass: { head: 0.0694, trunk: 0.4346, pelvis: 0.1117, upperArm: 0.0271, forearm: 0.0162, hand: 0.0061, thigh: 0.1416, shank: 0.0433, foot: 0.0137 },
    com: { thigh: 0.4095, shank: 0.4395, upperArm: 0.5772, trunkFromShoulder: 0.4310 }
  },
  F: {
    mass: { head: 0.0668, trunk: 0.4257, pelvis: 0.1247, upperArm: 0.0255, forearm: 0.0138, hand: 0.0056, thigh: 0.1478, shank: 0.0481, foot: 0.0129 },
    com: { thigh: 0.3612, shank: 0.4352, upperArm: 0.5754, trunkFromShoulder: 0.3782 }
  }
};

// Lunghezze dei segmenti come frazione della statura: Drillis & Contini, in Winter (2009).
export const PROP = { thigh: 0.245, shank: 0.246, trunk: 0.288, head: 0.182, upperArm: 0.186, foot: 0.152, ankleH: 0.039 };

// Posizione del bilanciere rispetto alla spalla, in frazioni di statura:
// u = lungo il tronco (positivo verso la testa), v = perpendicolare (positivo dietro).
export const VARIANTS = {
  high: { u: 0.02, v: 0.05 },
  low: { u: -0.03, v: 0.06 },
  front: { u: 0.005, v: -0.045 }
};

const STAND_LEAN = 3.5;  // gradi di inclinazione del corpo in piedi
// Avanzamento tipico delle ginocchia (dorsiflessione in buca, gradi) per variante:
// il low bar si esegue con tibie più verticali, il front squat con ginocchia più avanti.
export const TYPICAL_DORSI = { high: 32, low: 27, front: 38 };
const PELVIS_AT = 0.12;  // baricentro del bacino lungo il tronco (da anca)
const LUMBAR_AT = 0.22;  // L5-S1 lungo il tronco (da anca), stima

const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

// cfg: { sex, height, mass, load, thigh, shank, trunk, variant, a, b }  (a, b in radianti)
// c: inclinazione del tronco in avanti rispetto alla verticale (radianti)
export function build(cfg, c) {
  const H = cfg.height, T = TABLES[cfg.sex], m = cfg.mass;
  const footLen = PROP.foot * H, ankleH = PROP.ankleH * H;
  const ankle = { x: 0, y: ankleH };
  const heel = { x: -0.25 * footLen, y: 0 };
  const toe = { x: 0.75 * footLen, y: 0 };
  const mid = { x: 0.25 * footLen, y: 0 };
  const knee = { x: cfg.shank * Math.sin(cfg.a), y: ankleH + cfg.shank * Math.cos(cfg.a) };
  const hip = { x: knee.x - cfg.thigh * Math.sin(cfg.b), y: knee.y + cfg.thigh * Math.cos(cfg.b) };
  const d = { x: Math.sin(c), y: Math.cos(c) };      // asse del tronco
  const n = { x: -Math.cos(c), y: Math.sin(c) };     // normale posteriore
  const along = (u, v = 0) => ({ x: hip.x + u * d.x + v * n.x, y: hip.y + u * d.y + v * n.y });
  const shoulder = along(cfg.trunk);
  const lumbar = along(LUMBAR_AT * cfg.trunk);
  const hc = c * 0.5; // la testa compensa in parte l'inclinazione del tronco
  const headLen = PROP.head * H;
  const headTop = { x: shoulder.x + headLen * Math.sin(hc), y: shoulder.y + headLen * Math.cos(hc) };
  const V = VARIANTS[cfg.variant];
  const bar = along(cfg.trunk + V.u * H, V.v * H);

  // Braccia: posa schematica (in realtà sono fuori dal piano sagittale)
  const Lua = PROP.upperArm * H;
  let ed;
  if (cfg.variant === 'front') {
    const k = Math.hypot(0.95, 0.25);
    ed = { x: (-n.x * 0.95 - d.x * 0.25) / k, y: (-n.y * 0.95 - d.y * 0.25) / k };
  } else {
    const t = 35 * D2R;
    ed = { x: -d.x * Math.cos(t) + n.x * Math.sin(t), y: -d.y * Math.cos(t) + n.y * Math.sin(t) };
  }
  const elbow = { x: shoulder.x + 0.8 * Lua * ed.x, y: shoulder.y + 0.8 * Lua * ed.y };

  const M = T.mass;
  const wTrunk = 1 - T.com.trunkFromShoulder; // baricentro del tronco intero, da anca
  const torsoMass = M.trunk - M.pelvis;
  const torsoAt = (wTrunk * M.trunk - PELVIS_AT * M.pelvis) / torsoMass;

  const masses = [
    { id: 'foot', g: 'foot', kg: 2 * M.foot * m, p: { x: mid.x, y: ankleH / 2 } },
    { id: 'shank', g: 'shank', kg: 2 * M.shank * m, p: lerp(knee, ankle, T.com.shank) },
    { id: 'thigh', g: 'thigh', kg: 2 * M.thigh * m, p: lerp(hip, knee, T.com.thigh) },
    { id: 'pelvis', g: 'pelvis', kg: M.pelvis * m, p: along(PELVIS_AT * cfg.trunk) },
    { id: 'torso', g: 'torso', kg: torsoMass * m, p: along(torsoAt * cfg.trunk) },
    { id: 'head', g: 'torso', kg: M.head * m, p: lerp(shoulder, headTop, 0.6) },
    { id: 'upperArm', g: 'torso', kg: 2 * M.upperArm * m, p: lerp(shoulder, elbow, T.com.upperArm) },
    { id: 'forearm', g: 'torso', kg: 2 * (M.forearm + M.hand) * m, p: lerp(elbow, bar, 0.5) },
    { id: 'bar', g: 'torso', kg: cfg.load, p: bar }
  ];
  return { ankle, heel, toe, mid, knee, hip, lumbar, shoulder, headTop, elbow, bar, masses, c };
}

export function com(masses, groups) {
  let kg = 0, sx = 0, sy = 0;
  for (const q of masses) {
    if (groups && !groups.includes(q.g)) continue;
    kg += q.kg; sx += q.kg * q.p.x; sy += q.kg * q.p.y;
  }
  return { kg, x: sx / kg, y: sy / kg };
}

const C_MIN = -8 * D2R, C_MAX = 80 * D2R;

// Trova l'inclinazione del tronco che porta il baricentro del sistema sopra il centro del piede.
export function solve(cfg) {
  const f = c => { const P = build(cfg, c); return com(P.masses).x - P.mid.x; };
  let lo = C_MIN, hi = C_MAX, c;
  if (f(lo) >= 0) c = lo;
  else if (f(hi) <= 0) c = hi;
  else {
    for (let i = 0; i < 40; i++) { c = (lo + hi) / 2; if (f(c) > 0) hi = c; else lo = c; }
    c = (lo + hi) / 2;
  }
  const P = build(cfg, c);
  const total = com(P.masses);
  const off = total.x - P.mid.x;

  // Momento esterno netto su ogni articolazione: somma di m·g·distanza orizzontale
  // per tutte le masse sostenute sopra l'articolazione. Segno positivo = richiesta
  // degli estensori (flessori plantari per la caviglia). Totale dei due arti.
  const def = [
    { id: 'lumbar', p: P.lumbar, groups: ['torso'], sign: 1 },
    { id: 'hip', p: P.hip, groups: ['torso', 'pelvis'], sign: 1 },
    { id: 'knee', p: P.knee, groups: ['torso', 'pelvis', 'thigh'], sign: -1 },
    { id: 'ankle', p: P.ankle, groups: ['torso', 'pelvis', 'thigh', 'shank'], sign: 1 }
  ];
  const joints = def.map(j => {
    const s = com(P.masses, j.groups);
    const arm = j.sign * (s.x - j.p.x);
    return {
      id: j.id, p: j.p, supported: s,
      weight: s.kg * G,
      arm,                                   // braccio effettivo (m)
      barArm: j.sign * (P.bar.x - j.p.x),    // braccio del solo bilanciere (m)
      moment: s.kg * G * arm                 // N·m
    };
  });

  return {
    P, joints, total,
    balanced: Math.abs(off) < 0.004, offset: off,
    angles: {
      trunk: c / D2R,
      hip: (cfg.b + c) / D2R,
      knee: (cfg.a + cfg.b) / D2R,
      ankle: cfg.a / D2R
    }
  };
}

// Traduce lo stato dell'interfaccia (cm, gradi, fase 0-1) nella configurazione del motore.
export function configFromState(s, phase = s.phase) {
  const aBottom = s.dorsi * D2R;
  const bBottom = Math.min(s.depth, 150 - s.dorsi) * D2R;
  // In piedi il corpo è una linea quasi dritta, appena inclinata in avanti dalla caviglia,
  // così il baricentro cade sul centro del piede con il ginocchio esteso.
  const a0 = STAND_LEAN * D2R;
  return {
    sex: s.sex, height: s.height / 100, mass: s.mass, load: s.load,
    thigh: s.thigh / 100, shank: s.shank / 100, trunk: s.trunk / 100,
    variant: s.variant, a: a0 + (aBottom - a0) * phase, b: -a0 + (bBottom + a0) * phase
  };
}
