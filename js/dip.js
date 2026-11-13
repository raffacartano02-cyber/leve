// Dip alle parallele — modello quasi-statico con braccia in 3D.
// Il corpo è appoggiato solo sulle mani: le parallele lo spingono verso l'alto con tutto il
// suo peso (più la zavorra), e il baricentro deve restare sulla verticale delle mani.
// Asse x in avanti, y verso l'alto, z laterale. Le mani sono a x = 0.

import { G, TABLES, PROP, com } from './engine.js';
import { V, add, sub, mul, lerp, angleAt, armMoments, armLengths, SHOULDER_HALF, HIP_HALF, PELVIS_AT, LUMBAR_AT } from './press.js';

const D2R = Math.PI / 180;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = a => Math.hypot(a.x, a.y, a.z);

// Gomito rivolto all'indietro: nel piano che contiene l'asse spalla-mano e la direzione posteriore
function elbowBack(S, Hd, Lua, Lfa) {
  const dv = sub(Hd, S), d = Math.min(norm(dv), Lua + Lfa - 1e-4);
  const u = mul(dv, 1 / norm(dv));
  const al = (Lua * Lua - Lfa * Lfa + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, Lua * Lua - al * al));
  let w = sub(V(-1, 0, 0), mul(u, dot(V(-1, 0, 0), u)));
  w = mul(w, 1 / (norm(w) || 1));
  return add(add(S, mul(u, al)), mul(w, h));
}

function pose(cfg, phi, phase) {
  const H = cfg.height, T = TABLES[cfg.sex], M = T.mass, m = cfg.mass;
  const footLen = PROP.foot * H;
  const { Lua, Lfa } = armLengths(cfg);
  const sw = SHOULDER_HALF * H, gz = cfg.grip / 2, dz = gz - sw;
  // Distanza spalla-mano: braccia tese in alto, gomito flesso dell'angolo scelto in basso
  const top = Math.sqrt(Math.max(0.01, (0.995 * (Lua + Lfa)) ** 2 - dz * dz));
  const k = cfg.dipElbow;
  const bot = Math.sqrt(Math.max(0.01, Lua * Lua + Lfa * Lfa + 2 * Lua * Lfa * Math.cos(k) - dz * dz));
  const dSag = top + (bot - top) * phase;
  const hand = V(0, 0, gz);
  const S = V(dSag * Math.sin(phi), dSag * Math.cos(phi), sw);
  const elbow = elbowBack(S, hand, Lua, Lfa);

  // Busto inclinato in avanti; gambe sulla linea del busto, ginocchia flesse con i piedi dietro
  const c = cfg.dipLean * phase + 4 * D2R;
  const down = V(-Math.sin(c), -Math.cos(c));
  const shoulder = V(S.x, S.y);
  const hip = add(shoulder, mul(down, cfg.trunk));
  const knee = add(hip, mul(down, cfg.thigh));
  const q = -cfg.dipKnee;                                 // flessione del ginocchio: tibia verso dietro
  const shankDir = V(down.x * Math.cos(q) - down.y * Math.sin(q), down.x * Math.sin(q) + down.y * Math.cos(q));
  const ankle = add(knee, mul(shankDir, cfg.shank));
  const footDir = V(-shankDir.y, shankDir.x);             // piede perpendicolare alla tibia, punta in basso
  const heel = add(ankle, mul(footDir, -0.25 * footLen)), toe = add(ankle, mul(footDir, 0.75 * footLen));
  const headTop = add(shoulder, V(PROP.head * H * Math.sin(c / 2), PROP.head * H * Math.cos(c / 2)));

  const torsoMass = M.trunk - M.pelvis;
  const torsoAt = ((1 - T.com.trunkFromShoulder) * M.trunk - PELVIS_AT * M.pelvis) / torsoMass;
  const along = u => lerp(hip, shoulder, u);
  const masses = [
    { g: 'leg', kg: 2 * M.foot * m, p: lerp(heel, toe, 0.4) },
    { g: 'leg', kg: 2 * M.shank * m, p: lerp(knee, ankle, T.com.shank) },
    { g: 'leg', kg: 2 * M.thigh * m, p: lerp(hip, knee, T.com.thigh) },
    { g: 'body', kg: M.pelvis * m, p: along(PELVIS_AT) },
    { g: 'body', kg: torsoMass * m, p: along(torsoAt) },
    { g: 'body', kg: M.head * m, p: lerp(shoulder, headTop, 0.6) },
    { g: 'arm', kg: 2 * M.upperArm * m, p: lerp(S, elbow, T.com.upperArm) },
    { g: 'arm', kg: 2 * (M.forearm + M.hand) * m, p: lerp(elbow, hand, 0.5) },
    { g: 'body', kg: cfg.ballast, p: add(hip, V(0.05, -0.12)) }
  ];
  return { S, elbow, hand, shoulder, hip, knee, ankle, heel, toe, headTop, masses, top, bot, lumbar: lerp(hip, shoulder, LUMBAR_AT) };
}

export function solveDip(cfg, phase) {
  const f = phi => com(pose(cfg, phi, phase).masses).x;
  let lo = -40 * D2R, hi = 60 * D2R, ok = f(lo) < 0 && f(hi) > 0;
  for (let i = 0; i < 40; i++) { const p = (lo + hi) / 2; if (f(p) > 0) hi = p; else lo = p; }
  const phi = (lo + hi) / 2;
  const Q = pose(cfg, phi, phase);

  // Sposta tutto in alto così i piedi restano sopra il pavimento anche in basso
  const lowest = pose(cfg, phi, 1);
  const lift = Math.max(0.55 * cfg.height, 0.08 - Math.min(lowest.toe.y, lowest.heel.y, lowest.knee.y, lowest.ankle.y));
  const up = p => add(p, V(0, lift));
  const pts = {};
  for (const k of ['S', 'elbow', 'hand', 'shoulder', 'hip', 'knee', 'ankle', 'heel', 'toe', 'headTop', 'lumbar']) pts[k] = up(Q[k]);

  const totalKg = cfg.mass + cfg.ballast;
  // La parallela spinge la mano verso l'alto: carico negativo nella convenzione delle spinte
  const mom = armMoments(Q.S, Q.elbow, Q.hand, -totalKg, TABLES[cfg.sex], cfg.mass);
  const F = totalKg * G;
  const mk = (id, p, moment, barArm, extra = {}) => ({ id, p, moment, weight: F, arm: moment / F, barArm, ...extra });
  const joints = [
    mk('shoulderF', pts.S, mom.flex, pts.hand.x - pts.S.x, {
      pos: 'flessori della spalla (gran pettorale, deltoide anteriore)', armLabel: 'braccio della reazione delle parallele' }),
    mk('shoulderA', pts.S, -mom.abd, pts.hand.z - pts.S.z, {
      label: 'Spalla, adduzione', pos: 'adduttori della spalla (gran pettorale sternocostale, gran dorsale)', neg: 'abduttori della spalla',
      noLever: true, noPivot: true, armLabel: 'braccio laterale delle mani' }),
    mk('elbow', pts.elbow, mom.elbow, pts.hand.x - pts.elbow.x, { armLabel: 'braccio della reazione delle parallele' })
  ];

  const shoulderExt = angleAt(Q.S, V(Q.hip.x, Q.hip.y, Q.S.z), Q.elbow);
  const elbowFlex = 180 - angleAt(Q.elbow, Q.S, Q.hand);
  return {
    P: { ...pts, mid: lerp(pts.heel, pts.toe, 0.5), bar: pts.hand, armSolid: true },
    joints, cop: null, balanced: ok, reach: true, noPlates: true, loadUp: true,
    rom: Q.top - Q.bot, refKg: totalKg,
    frame: { x0: -0.75, x1: 0.75 },
    props: [{ x: -0.32, y: lift - 0.02, w: 0.64, h: 0.035 }, { x: 0.26, y: 0, w: 0.04, h: lift - 0.02 }],
    readouts: [
      [Math.round(shoulderExt) + '°', 'Omero', 'dietro al busto'], [Math.round(elbowFlex) + '°', 'Gomito', 'flessione'],
      [Math.round((cfg.dipLean * phase) / D2R + 4) + '°', 'Busto', 'inclinazione'], [Math.round((Q.top - Q.bot) * 100) + ' cm', 'Corsa', 'delle spalle']
    ],
    angles: { elbow: elbowFlex },
    front: { mode: 'hang', parallel: true, shoulder: SHOULDER_HALF * cfg.height, grip: cfg.grip / 2, elbow: Q.elbow.z, hip: HIP_HALF * cfg.height, footY: pts.knee.y }
  };
}

export function dipConfigFromState(s) {
  return {
    sex: s.sex, height: s.height / 100, mass: s.mass, ballast: s.ballast,
    thigh: s.thigh / 100, shank: s.shank / 100, trunk: s.trunk / 100, arm: s.arm / 100,
    grip: s.dipWidth / 100, dipLean: s.dipLean * D2R, dipElbow: s.dipElbow * D2R, dipKnee: s.dipKnee * D2R
  };
}
