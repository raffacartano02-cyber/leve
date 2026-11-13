// Spinte: military press in piedi e panca piana — modello quasi-statico con braccia in 3D.
// Asse x in avanti (military) o verso i piedi (panca), y verso l'alto, z laterale.
//
// Mano e spalla sono date dalla traiettoria del bilanciere e dalla larghezza della presa;
// il gomito è il punto più basso tra quelli possibili, cioè con l'avambraccio più vicino
// alla verticale. Il bilanciere spinge solo in verticale: le forze laterali delle mani
// sulla sbarra non sono considerate.

import { G, TABLES, PROP, com } from './engine.js';

const D2R = Math.PI / 180;
export const SHOULDER_HALF = 0.105, HIP_HALF = 0.055;
const UPPER_ARM_SHARE = 0.186 / 0.382;   // quota dell'omero sulla lunghezza spalla-presa
export const PELVIS_AT = 0.12, LUMBAR_AT = 0.22;
const A0 = 3.5 * D2R;

export const V = (x, y, z = 0) => ({ x, y, z });
export const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a, k) => V(a.x * k, a.y * k, a.z * k);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = a => Math.hypot(a.x, a.y, a.z);
export const lerp = (p, q, t) => add(p, mul(sub(q, p), t));
export const angleAt = (o, p, q) => {
  const u = sub(p, o), v = sub(q, o);
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (norm(u) * norm(v))))) / D2R;
};

// yMin: quota sotto cui il gomito non può scendere (limite di estensione della spalla in panca).
// Se il punto più basso la supera, il gomito si sposta lungo il cerchio verso l'esterno.
export function armIK(S, Hd, Lua, Lfa, yMin = -Infinity, up = false) {
  let dv = sub(Hd, S), d = norm(dv), reach = true, hand = Hd;
  const max = Lua + Lfa - 1e-4;
  if (d > max) { reach = false; hand = add(S, mul(dv, max / d)); dv = sub(hand, S); d = max; }
  const u = mul(dv, 1 / d);
  const al = (Lua * Lua - Lfa * Lfa + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, Lua * Lua - al * al));
  let w = sub(mul(u, u.y), V(0, 1, 0));           // verso il basso, perpendicolare all'asse spalla-mano
  const wl = norm(w);
  w = wl > 1e-6 ? mul(w, 1 / wl) : V(1, 0, 0);
  if (up) w = mul(w, -1);                         // gomito in alto, dietro il busto (rematore)
  const C = add(S, mul(u, al));
  let elbow = add(C, mul(w, h));
  if (elbow.y < yMin && h > 1e-6 && w.y < -1e-6) {
    const v = cross(u, w);                         // orizzontale, perpendicolare al piano spalla-mano
    const cosPhi = Math.max(-1, Math.min(1, (yMin - C.y) / (h * w.y)));
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi) * (v.z >= 0 ? 1 : -1);
    elbow = add(C, add(mul(w, h * cosPhi), mul(v, h * sinPhi)));
  }
  return { elbow, hand, reach };
}

// Momenti su spalla e gomito di un braccio; restituisce i totali dei due arti.
// Una forza verticale f verso il basso applicata in r dà M = (r.z·f, 0, −r.x·f).
export function armMoments(S, E, Hd, loadKg, T, bodyKg) {
  const M = T.mass;
  const forces = [
    { p: Hd, f: loadKg / 2 * G, distal: true },
    { p: lerp(E, Hd, 0.5), f: (M.forearm + M.hand) * bodyKg * G, distal: true },
    { p: lerp(S, E, T.com.upperArm), f: M.upperArm * bodyKg * G, distal: false }
  ];
  let flex = 0, abd = 0, ex = 0, ez = 0;
  for (const q of forces) {
    const r = sub(q.p, S);
    flex += r.x * q.f;      // bilanciere davanti alla spalla: richiesta dei flessori
    abd += r.z * q.f;       // mano più larga della spalla: richiesta di abduttori / adduttori orizzontali
    if (q.distal) { const re = sub(q.p, E); ex += re.z * q.f; ez -= re.x * q.f; }
  }
  // Gomito: positivo quando il carico tende a fletterlo (lavora il tricipite)
  const n = cross(sub(Hd, E), sub(S, E)), nl = norm(n);
  const elbow = nl > 1e-6 ? (ex * n.x + ez * n.z) / nl : 0;
  return { flex: 2 * flex, abd: 2 * abd, elbow: 2 * elbow };
}

function joints(S, E, Hd, mom, loadKg, abdLabel, abdPos) {
  const F = loadKg * G || 1;
  const mk = (id, p, moment, barArm, extra = {}) => ({ id, p, moment, weight: F, arm: moment / F, barArm, ...extra });
  return [
    mk('shoulderF', S, mom.flex, Hd.x - S.x),
    mk('shoulderA', S, mom.abd, Hd.z - S.z, { label: abdLabel, pos: abdPos, noLever: true, noPivot: true, frontArm: true, armLabel: 'braccio laterale del bilanciere' }),
    mk('elbow', E, mom.elbow, Hd.x - E.x)
  ];
}

export const armLengths = cfg => { const Lua = cfg.arm * UPPER_ARM_SHARE; return { Lua, Lfa: cfg.arm - Lua }; };

// ---------- Military press ----------

function standing(cfg, lean, phase) {
  const H = cfg.height, T = TABLES[cfg.sex], M = T.mass, m = cfg.mass;
  const footLen = PROP.foot * H, ankleH = PROP.ankleH * H;
  const { Lua, Lfa } = armLengths(cfg);
  const d = V(Math.sin(lean), Math.cos(lean));
  const ankle = V(0, ankleH), heel = V(-0.25 * footLen, 0), toe = V(0.75 * footLen, 0), mid = V(0.25 * footLen, 0);
  const knee = add(ankle, mul(d, cfg.shank)), hip = add(knee, mul(d, cfg.thigh));
  const along = u => add(hip, mul(d, u));
  const shoulder2 = along(cfg.trunk), lumbar = along(LUMBAR_AT * cfg.trunk);
  const headTop = add(shoulder2, V(0, PROP.head * H));
  const sw = SHOULDER_HALF * H, gz = cfg.grip / 2;
  const S = V(shoulder2.x, shoulder2.y, sw);
  const dz = gz - sw;
  const yTop = S.y + Math.sqrt(Math.max(0.01, (0.995 * (Lua + Lfa)) ** 2 - dz * dz));
  const yLow = S.y + 0.03 * H;                       // bilanciere sulle clavicole
  const Hd = V(S.x + cfg.barFront * phase, yTop - (yTop - yLow) * phase, gz);
  const ik = armIK(S, Hd, Lua, Lfa);
  const torsoMass = M.trunk - M.pelvis;
  const torsoAt = ((1 - T.com.trunkFromShoulder) * M.trunk - PELVIS_AT * M.pelvis) / torsoMass;
  const masses = [
    { g: 'foot', kg: 2 * M.foot * m, p: V(mid.x, ankleH / 2) },
    { g: 'shank', kg: 2 * M.shank * m, p: lerp(knee, ankle, T.com.shank) },
    { g: 'thigh', kg: 2 * M.thigh * m, p: lerp(hip, knee, T.com.thigh) },
    { g: 'pelvis', kg: M.pelvis * m, p: along(PELVIS_AT * cfg.trunk) },
    { g: 'torso', kg: torsoMass * m, p: along(torsoAt * cfg.trunk) },
    { g: 'torso', kg: M.head * m, p: lerp(shoulder2, headTop, 0.6) },
    { g: 'torso', kg: 2 * M.upperArm * m, p: lerp(S, ik.elbow, T.com.upperArm) },
    { g: 'torso', kg: 2 * (M.forearm + M.hand) * m, p: lerp(ik.elbow, ik.hand, 0.5) },
    { g: 'torso', kg: cfg.load, p: ik.hand }
  ];
  return { ankle, heel, toe, mid, knee, hip, lumbar, shoulder: shoulder2, headTop, S, elbow: ik.elbow, bar: ik.hand, reach: ik.reach, masses, yTop, yLow, sw, gz };
}

export function solveOverhead(cfg, phase) {
  const f = lean => { const P = standing(cfg, lean, phase); return com(P.masses).x - P.mid.x; };
  let lo = -15 * D2R, hi = 15 * D2R;
  for (let i = 0; i < 40; i++) { const c = (lo + hi) / 2; if (f(c) > 0) hi = c; else lo = c; }
  const lean = (lo + hi) / 2;
  const P = standing(cfg, lean, phase);
  const T = TABLES[cfg.sex];
  const mom = armMoments(P.S, P.elbow, P.bar, cfg.load, T, cfg.mass);
  const js = joints(P.S, P.elbow, P.bar, mom, cfg.load, 'Spalla, abduzione', 'abduttori (deltoide medio, sovraspinato)');
  const sup = com(P.masses, ['torso']);
  const mL = sup.kg * G * (sup.x - P.lumbar.x);
  js.push({ id: 'lumbar', p: P.lumbar, supported: sup, moment: mL, weight: sup.kg * G, arm: sup.x - P.lumbar.x, barArm: P.bar.x - P.lumbar.x });
  const off = com(P.masses).x - P.mid.x;
  return {
    P: { ...P, armSolid: true }, joints: js,
    balanced: Math.abs(off) < 0.004, offset: off, reach: P.reach,
    rom: P.yTop - P.yLow, yLock: P.yTop,
    angles: {
      lean: lean / D2R,
      shoulder: angleAt(P.S, V(P.S.x, P.S.y - 1, P.S.z), P.elbow),
      elbow: 180 - angleAt(P.elbow, P.S, P.bar)
    },
    front: { mode: 'stand', shoulder: P.sw, grip: P.gz, elbow: P.elbow.z, hip: HIP_HALF * cfg.height }
  };
}

// ---------- Panca piana ----------

export function solveBench(cfg, phase) {
  const H = cfg.height, T = TABLES[cfg.sex];
  const footLen = PROP.foot * H, ankleH = PROP.ankleH * H;
  const { Lua, Lfa } = armLengths(cfg);
  const hb = 0.43, sy = hb + 0.10;                   // panca standard; spalla 10 cm sopra il piano
  const sw = SHOULDER_HALF * H, gz = cfg.grip / 2, dz = gz - sw;
  const S = V(0, sy, sw);
  const hip = V(cfg.trunk, sy - 0.02);
  const lumbar = lerp(hip, V(0, sy), LUMBAR_AT);
  const kneeY = Math.min(hip.y - 0.01, ankleH + cfg.shank * Math.cos(15 * D2R));
  const knee = V(hip.x + Math.sqrt(Math.max(0.01, cfg.thigh ** 2 - (hip.y - kneeY) ** 2)), kneeY);
  const ankle = V(knee.x - Math.sqrt(Math.max(0, cfg.shank ** 2 - (kneeY - ankleH) ** 2)), ankleH);
  const heel = V(ankle.x - 0.25 * footLen, 0), toe = V(ankle.x + 0.75 * footLen, 0), mid = V(ankle.x + 0.25 * footLen, 0);
  const headTop = V(-PROP.head * H, sy + 0.01);

  const yTop = sy + Math.sqrt(Math.max(0.01, (0.995 * (Lua + Lfa)) ** 2 - dz * dz));
  const yLow = sy + cfg.chest;                       // bilanciere sul petto
  const Hd = V(cfg.touch * phase, yTop - (yTop - yLow) * phase, gz);
  const ik = armIK(S, Hd, Lua, Lfa, sy - Lua * Math.sin(35 * D2R)); // omero al massimo 35° sotto l'orizzontale
  const mom = armMoments(S, ik.elbow, ik.hand, cfg.load, T, cfg.mass);
  const js = joints(S, ik.elbow, ik.hand, mom, cfg.load, 'Spalla, adduzione orizzontale', 'adduttori orizzontali (gran pettorale, deltoide anteriore)');
  return {
    P: { ankle, heel, toe, mid, knee, hip, lumbar, shoulder: V(0, sy), headTop, S, elbow: ik.elbow, bar: ik.hand, armSolid: true },
    joints: js, cop: null, balanced: true, reach: ik.reach,
    rom: yTop - yLow, yLock: yTop,
    frame: { x0: -0.5, x1: Math.max(1.3, toe.x + 0.08) },
    props: [{ x: -0.42, y: hb - 0.07, w: cfg.trunk + 0.62, h: 0.07 }, { x: -0.3, y: 0, w: 0.05, h: hb - 0.07 }, { x: cfg.trunk + 0.05, y: 0, w: 0.05, h: hb - 0.07 }],
    angles: {
      abd: angleAt(S, V(1, sy, sw), V(ik.elbow.x, sy, ik.elbow.z)),   // apertura dell'omero rispetto al busto, vista dall'alto
      elbow: 180 - angleAt(ik.elbow, S, ik.hand)
    },
    front: { mode: 'bench', shoulder: sw, grip: gz, elbow: ik.elbow.z, benchH: hb }
  };
}

export function pressConfigFromState(s) {
  return {
    sex: s.sex, height: s.height / 100, mass: s.mass, load: s.load,
    thigh: s.thigh / 100, shank: s.shank / 100, trunk: s.trunk / 100, arm: s.arm / 100,
    grip: s.grip / 100, barFront: s.barFront / 100, touch: s.touch / 100, chest: s.chest / 100
  };
}
