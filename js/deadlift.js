// Stacchi da terra (convenzionale, sumo, rumeno) — modello quasi-statico.
// Tronco e braccia stanno sul piano sagittale; le gambe sono in 3D (z = distanza laterale
// dalla linea mediana) per tenere conto di larghezza dello stance e apertura delle punte.
//
// La posizione è determinata dalla geometria: il bilanciere sale in verticale sopra il
// centro del piede, la tibia ha l'avanzamento scelto (senza attraversare il bilanciere),
// le braccia hanno l'inclinazione scelta. L'anca è l'unico punto che chiude la catena
// ginocchio-anca-spalla. Il centro di pressione sotto il piede è un risultato.

import { G, TABLES, PROP, com } from './engine.js';

const D2R = Math.PI / 180;
const A0 = 3.5 * D2R;          // inclinazione delle gambe in piedi
const HIP_HALF = 0.055;        // semidistanza tra i centri delle anche (frazione di statura)
const SHOULDER_HALF = 0.105;   // semidistanza tra i centri delle spalle
const ARM_COM = 0.49;          // baricentro del braccio disteso, da spalla (da de Leva)
const PELVIS_AT = 0.12, LUMBAR_AT = 0.22;
const SHIN_GAP = 0.02;         // distanza minima tra asse del bilanciere e tibia (m)
const KNEE_OUT = 0.5;         // quanto il ginocchio flesso si porta sopra il piede (sumo)

// Valori tipici per variante, a partire dalla statura in cm
export const deadDefaults = H => ({
  // Stance e punte: medie di Escamilla et al. (2000), 32 cm e 14° contro 70 cm e 42°, scalate sulla statura
  conv: { shin: 15, armTilt: 7, stance: Math.round(0.18 * H), toe: 14, barLow: 22.5 },
  sumo: { shin: 14, armTilt: 5, stance: Math.round(0.40 * H), toe: 42, barLow: 22.5 },
  rdl: { shin: 4, armTilt: 16, stance: Math.round(0.18 * H), toe: 14, barLow: Math.round(0.24 * H) }
});

const lerp3 = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: (p.z || 0) + ((q.z || 0) - (p.z || 0)) * t });
const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y, z: (p.z || 0) - (q.z || 0) });
const norm = v => Math.hypot(v.x, v.y, v.z);
const angleAt = (o, p, q) => {
  const u = sub(p, o), v = sub(q, o);
  return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (norm(u) * norm(v))))) / D2R;
};

function feet(cfg) {
  const H = cfg.height, footLen = PROP.foot * H, w = cfg.stance / 2;
  const cp = Math.cos(cfg.toe), sp = Math.sin(cfg.toe);
  return {
    ankle: { x: 0, y: PROP.ankleH * H, z: w },
    heel: { x: -0.25 * footLen * cp, y: 0 },
    toe: { x: 0.75 * footLen * cp, y: 0 },
    mid: { x: 0.25 * footLen * cp, y: 0, z: w + 0.25 * footLen * sp }
  };
}

// Ginocchio e lunghezza sagittale della coscia. Lo scarto laterale piede-anca è ripartito
// tra tibia e coscia a gambe tese; flettendo, il ginocchio si porta sopra il piede.
function leg(cfg, a, bend) {
  const F = feet(cfg), hw = HIP_HALF * cfg.height, w = cfg.stance / 2;
  const Ls = cfg.shank, Lt = cfg.thigh;
  const t0 = Lt / (Ls + Lt);
  const kz = hw + (w - hw) * (t0 + (1 - t0) * KNEE_OUT * bend) + Ls * Math.sin(a) * Math.sin(cfg.toe);
  const fwd = Ls * Math.sin(a) * Math.cos(cfg.toe);
  const hs2 = Ls * Ls - (kz - w) ** 2 - fwd * fwd;
  const r2 = Lt * Lt - (kz - hw) ** 2;
  if (hs2 <= 0 || r2 <= 0) return null;
  return { ...F, a, knee: { x: fwd, y: F.ankle.y + Math.sqrt(hs2), z: kz }, rho: Math.sqrt(r2), hw };
}

function assemble(cfg, L, hip, shoulder, bar) {
  const H = cfg.height, T = TABLES[cfg.sex], m = cfg.mass, M = T.mass;
  const c = Math.atan2(shoulder.x - hip.x, shoulder.y - hip.y);
  const along = u => ({ x: hip.x + u * Math.sin(c), y: hip.y + u * Math.cos(c) });
  const headLen = PROP.head * H;
  const headTop = { x: shoulder.x + headLen * Math.sin(c / 2), y: shoulder.y + headLen * Math.cos(c / 2) };
  const torsoMass = M.trunk - M.pelvis;
  const torsoAt = ((1 - T.com.trunkFromShoulder) * M.trunk - PELVIS_AT * M.pelvis) / torsoMass;
  const masses = [
    { id: 'foot', g: 'foot', kg: 2 * M.foot * m, p: { x: L.mid.x, y: L.ankle.y / 2, z: L.mid.z } },
    { id: 'shank', g: 'shank', kg: 2 * M.shank * m, p: lerp3(L.knee, L.ankle, T.com.shank) },
    { id: 'thigh', g: 'thigh', kg: 2 * M.thigh * m, p: lerp3(hip, L.knee, T.com.thigh) },
    { id: 'pelvis', g: 'pelvis', kg: M.pelvis * m, p: along(PELVIS_AT * cfg.trunk) },
    { id: 'torso', g: 'torso', kg: torsoMass * m, p: along(torsoAt * cfg.trunk) },
    { id: 'head', g: 'torso', kg: M.head * m, p: lerp3(shoulder, headTop, 0.6) },
    { id: 'arm', g: 'arm', kg: 2 * (M.upperArm + M.forearm + M.hand) * m, p: lerp3(shoulder, bar, ARM_COM) },
    { id: 'bar', g: 'arm', kg: cfg.load, p: bar }
  ];
  return {
    a: L.a, ankle: L.ankle, heel: L.heel, toe: L.toe, mid: L.mid, knee: L.knee, hip,
    lumbar: along(LUMBAR_AT * cfg.trunk), shoulder, headTop, bar, masses, c
  };
}

// Arrivo: gambe tese appena inclinate in avanti, braccia verticali.
function lockout(cfg) {
  const L = leg(cfg, A0, 0);
  const hip = { x: L.knee.x + L.rho * Math.sin(A0), y: L.knee.y + L.rho * Math.cos(A0), z: L.hw };
  const sx = L.mid.x, dx = Math.max(-cfg.trunk, Math.min(cfg.trunk, sx - hip.x));
  const shoulder = { x: sx, y: hip.y + Math.sqrt(cfg.trunk ** 2 - dx * dx) };
  return assemble(cfg, L, hip, shoulder, { x: sx, y: shoulder.y - cfg.arm });
}

function poseAt(cfg, phase, ybar) {
  const ankleH = PROP.ankleH * cfg.height;
  const F = feet(cfg);
  // La tibia non può attraversare il bilanciere: limita l'avanzamento a ogni altezza
  const aClear = Math.atan((F.mid.x - SHIN_GAP) / Math.max(0.05, ybar - ankleH) / Math.cos(cfg.toe));
  const a = Math.min(A0 + (cfg.shin - A0) * phase, Math.max(0, aClear));
  const L = leg(cfg, a, phase);
  if (!L) return null;
  const phi = cfg.armTilt * phase;
  const bar = { x: L.mid.x, y: ybar };
  const shoulder = { x: bar.x + cfg.arm * Math.sin(phi), y: bar.y + cfg.arm * Math.cos(phi) };
  // Anca: intersezione tra il cerchio della coscia (dal ginocchio) e quello del tronco (dalla spalla), lato posteriore
  const dx = shoulder.x - L.knee.x, dy = shoulder.y - L.knee.y, d = Math.hypot(dx, dy);
  let reach = true, hip;
  if (d >= L.rho + cfg.trunk) {
    reach = false;
    const t = L.rho / (L.rho + cfg.trunk);
    hip = { x: L.knee.x + dx * t, y: L.knee.y + dy * t, z: L.hw };
  } else {
    const al = (L.rho ** 2 - cfg.trunk ** 2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L.rho ** 2 - al * al));
    hip = { x: L.knee.x + (al * dx - h * dy) / d, y: L.knee.y + (al * dy + h * dx) / d, z: L.hw };
  }
  const P = assemble(cfg, L, hip, shoulder, bar);
  P.reach = reach;
  return P;
}

// Momento estensorio al ginocchio in 3D, dal basso: reazione del suolo (metà del peso
// totale, verticale, sul centro di pressione) meno peso di piede e tibia, proiettato
// sull'asse di flessione del ginocchio. Restituisce il totale dei due arti.
function kneeMoment(P, cfg, total) {
  // Distanze misurate lungo l'asse del piede (ruotato dell'apertura delle punte) a partire
  // dalla caviglia: il ginocchio avanza in quella direzione. Gli scarti laterali producono
  // momenti sul piano frontale, che qui non vengono calcolati.
  const cp = Math.cos(cfg.toe);
  const tK = cfg.shank * Math.sin(P.a);
  const tCop = total.x / cp;
  const tFoot = P.mid.x / cp;
  const tShank = tK * (1 - TABLES[cfg.sex].com.shank);
  const F = total.kg * G / 2;
  const foot = P.masses[0].kg * G / 2, shank = P.masses[1].kg * G / 2;
  return 2 * (F * (tK - tCop) - foot * (tK - tFoot) - shank * (tK - tShank));
}

// cfg: { sex, height, mass, load, thigh, shank, trunk, arm, stance, toe, shin, armTilt, barLow } in m e radianti
export function solveDeadlift(cfg, phase) {
  const top = lockout(cfg);
  const yLock = top.bar.y;
  const yLow = Math.min(cfg.barLow, yLock);
  const moving = phase > 0.002;
  const P = (moving && poseAt(cfg, phase, yLock - (yLock - yLow) * phase)) || { ...top, reach: !moving };

  const total = com(P.masses);
  const kneeFlex = 180 - angleAt(P.knee, P.ankle, P.hip);
  const def = [
    { id: 'shoulder', p: P.shoulder, groups: ['arm'], sign: -1 },
    { id: 'lumbar', p: P.lumbar, groups: ['arm', 'torso'], sign: 1 },
    { id: 'hip', p: P.hip, groups: ['arm', 'torso', 'pelvis'], sign: 1 },
    { id: 'knee', p: P.knee, groups: ['arm', 'torso', 'pelvis', 'thigh'], sign: -1 },
    { id: 'ankle', p: P.ankle, groups: ['arm', 'torso', 'pelvis', 'thigh', 'shank'], sign: 1 }
  ];
  const joints = def.map(j => {
    const s = com(P.masses, j.groups);
    const weight = s.kg * G;
    let moment = weight * j.sign * (s.x - j.p.x);
    if (j.id === 'knee') moment = kneeMoment(P, cfg, total);
    if (j.id === 'ankle') moment /= Math.cos(cfg.toe); // sull'asse del piede ruotato
    return { id: j.id, p: j.p, supported: s, weight, moment, arm: moment / weight, barArm: j.sign * (P.bar.x - j.p.x) };
  });

  return {
    P, joints, total,
    cop: total.x, offset: total.x - P.mid.x,
    balanced: total.x > P.heel.x + 0.02 && total.x < P.toe.x - 0.03,
    reach: P.reach,
    rom: yLock - yLow, yLock,
    angles: {
      trunk: P.c / D2R,
      // rispetto alla posizione in piedi con lo stesso stance, così l'abduzione non conta come flessione
      hip: Math.max(0, angleAt(top.hip, top.knee, { ...top.shoulder, z: top.hip.z }) - angleAt(P.hip, P.knee, { ...P.shoulder, z: P.hip.z })),
      knee: kneeFlex
    },
    front: {
      stance: cfg.stance / 2, hip: HIP_HALF * cfg.height, knee: P.knee.z,
      shoulder: SHOULDER_HALF * cfg.height,
      grip: cfg.sumoGrip ? SHOULDER_HALF * cfg.height : Math.max(SHOULDER_HALF * cfg.height, cfg.stance / 2 + 0.07),
      footOut: PROP.foot * cfg.height * Math.sin(cfg.toe)
    }
  };
}

export function deadConfigFromState(s) {
  return {
    sex: s.sex, height: s.height / 100, mass: s.mass, load: s.load,
    thigh: s.thigh / 100, shank: s.shank / 100, trunk: s.trunk / 100, arm: s.arm / 100,
    stance: s.stance / 100, toe: s.toe * D2R, shin: s.shin * D2R, armTilt: s.armTilt * D2R,
    barLow: s.barLow / 100, sumoGrip: s.dvar === 'sumo'
  };
}
