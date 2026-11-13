// Tirate: trazioni alla sbarra, lat machine, rematore con bilanciere.
// Stesso modello delle spinte (braccia in 3D, quasi-statico) con la forza sulla mano
// rivolta verso l'alto nelle trazioni e alla lat machine, verso il basso nel rematore.
//
// Trazioni: l'unico appoggio è la sbarra, quindi il baricentro del corpo resta sotto le mani.
// Lat machine: corpo fermo sul sedile, la sbarra scende; il cavo è considerato verticale.
// Rematore: busto inclinato, gambe ferme, baricentro sopra il centro del piede.

import { G, TABLES, PROP, com } from './engine.js';
import { V, add, sub, mul, lerp, angleAt, armIK, armMoments, armLengths, SHOULDER_HALF, HIP_HALF, PELVIS_AT, LUMBAR_AT } from './press.js';

const D2R = Math.PI / 180;

function bodyMasses(cfg, pts, arm) {
  const T = TABLES[cfg.sex], M = T.mass, m = cfg.mass;
  const torsoMass = M.trunk - M.pelvis;
  const torsoAt = ((1 - T.com.trunkFromShoulder) * M.trunk - PELVIS_AT * M.pelvis) / torsoMass;
  const along = u => lerp(pts.hip, pts.shoulder, u);
  return [
    { g: 'foot', kg: 2 * M.foot * m, p: lerp(pts.heel, pts.toe, 0.5) },
    { g: 'shank', kg: 2 * M.shank * m, p: lerp(pts.knee, pts.ankle, T.com.shank) },
    { g: 'thigh', kg: 2 * M.thigh * m, p: lerp(pts.hip, pts.knee, T.com.thigh) },
    { g: 'pelvis', kg: M.pelvis * m, p: along(PELVIS_AT) },
    { g: 'torso', kg: torsoMass * m, p: along(torsoAt) },
    { g: 'torso', kg: M.head * m, p: lerp(pts.shoulder, pts.headTop, 0.6) },
    { g: 'torso', kg: 2 * M.upperArm * m, p: lerp(arm.S, arm.elbow, T.com.upperArm) },
    { g: 'torso', kg: 2 * (M.forearm + M.hand) * m, p: lerp(arm.elbow, arm.hand, 0.5) }
  ];
}

// Articolazioni del braccio per le tirate: i segni sono rovesciati rispetto alle spinte.
function pullJoints(arm, mom, forceN, sideLabel, sidePos, sideSign) {
  const F = Math.abs(forceN) || 1;
  const mk = (id, p, moment, barArm, extra) => ({ id, p, moment, weight: F, arm: moment / F, barArm, ...extra });
  return [
    mk('shoulderF', arm.S, -mom.flex, arm.hand.x - arm.S.x, {
      label: 'Spalla, estensione', pos: 'estensori della spalla (gran dorsale, grande rotondo, deltoide posteriore)', neg: 'flessori della spalla' }),
    mk('shoulderA', arm.S, sideSign * mom.abd, arm.hand.z - arm.S.z, {
      label: sideLabel, pos: sidePos, neg: 'muscoli opposti', noLever: true, noPivot: true, armLabel: 'braccio laterale della presa' }),
    mk('elbow', arm.elbow, -mom.elbow, arm.hand.x - arm.elbow.x, {
      pos: 'flessori del gomito (bicipite, brachiale, brachioradiale)', neg: 'estensori del gomito' })
  ];
}

const elevation = (pts, arm) => angleAt(arm.S, V(pts.hip.x, pts.hip.y, arm.S.z), arm.elbow);

// ---------- Trazioni ----------

function hanging(cfg, tilt, phase) {
  const H = cfg.height, footLen = PROP.foot * H;
  const { Lua, Lfa } = armLengths(cfg);
  const sw = SHOULDER_HALF * H, gz = cfg.grip / 2, dz = gz - sw;
  const yBar = 1.32 * H;
  const hand = V(0, yBar, gz);
  const drop = Math.sqrt(Math.max(0.01, (0.995 * (Lua + Lfa)) ** 2 - dz * dz));
  const yLow = yBar - drop, yHigh = yBar - 0.10;          // in alto: spalle 10 cm sotto la sbarra
  const S = V(-0.12 * (1 - phase), yHigh - (yHigh - yLow) * phase, sw);
  const d = V(Math.sin(tilt), -Math.cos(tilt));            // dal busto verso i piedi
  const shoulder = V(S.x, S.y);
  const hip = add(shoulder, mul(d, cfg.trunk));
  const knee = add(hip, mul(d, cfg.thigh));
  const ankle = add(knee, mul(d, cfg.shank));
  const sole = add(ankle, mul(d, PROP.ankleH * H));
  const fwd = V(Math.cos(tilt), Math.sin(tilt));
  const heel = add(sole, mul(fwd, -0.25 * footLen)), toe = add(sole, mul(fwd, 0.75 * footLen));
  const headTop = add(shoulder, V(0.02, PROP.head * H));
  const ik = armIK(S, hand, Lua, Lfa);
  const arm = { S, elbow: ik.elbow, hand: ik.hand };
  const pts = { ankle, heel, toe, mid: lerp(heel, toe, 0.5), knee, hip, lumbar: lerp(hip, shoulder, LUMBAR_AT), shoulder, headTop };
  const masses = bodyMasses(cfg, pts, arm);
  masses.push({ g: 'pelvis', kg: cfg.ballast, p: add(hip, V(0, -0.1)) });
  return { pts, arm, masses, reach: ik.reach, rom: yHigh - yLow, yBar };
}

export function solvePullUp(cfg, phase) {
  const f = t => com(hanging(cfg, t, phase).masses).x;
  let lo = -30 * D2R, hi = 45 * D2R;
  for (let i = 0; i < 40; i++) { const c = (lo + hi) / 2; if (f(c) > 0) hi = c; else lo = c; }
  const tilt = (lo + hi) / 2;
  const Q = hanging(cfg, tilt, phase);
  const totalKg = cfg.mass + cfg.ballast;
  // La sbarra spinge le mani verso l'alto con il peso di tutto il corpo
  const mom = armMoments(Q.arm.S, Q.arm.elbow, Q.arm.hand, -totalKg, TABLES[cfg.sex], cfg.mass);
  return {
    P: { ...Q.pts, S: Q.arm.S, elbow: Q.arm.elbow, bar: Q.arm.hand, armSolid: true },
    joints: pullJoints(Q.arm, mom, totalKg * G, 'Spalla, adduzione', 'adduttori della spalla (gran dorsale, grande rotondo, gran pettorale)', -1),
    cop: null, balanced: true, reach: Q.reach, rom: Q.rom, refKg: totalKg,
    noPlates: true, loadUp: true,
    angles: { shoulder: elevation(Q.pts, Q.arm), elbow: 180 - angleAt(Q.arm.elbow, Q.arm.S, Q.arm.hand), lean: tilt / D2R },
    front: { mode: 'hang', shoulder: SHOULDER_HALF * cfg.height, grip: cfg.grip / 2, elbow: Q.arm.elbow.z, hip: HIP_HALF * cfg.height, footY: Q.pts.ankle.y }
  };
}

// ---------- Lat machine ----------

export function solveLat(cfg, phase) {
  const H = cfg.height, footLen = PROP.foot * H, ankleH = PROP.ankleH * H;
  const { Lua, Lfa } = armLengths(cfg);
  const sw = SHOULDER_HALF * H, gz = cfg.grip / 2, dz = gz - sw;
  const hip = V(0, ankleH + cfg.shank);
  const knee = V(cfg.thigh, hip.y), ankle = V(knee.x, ankleH);
  const heel = V(ankle.x - 0.25 * footLen, 0), toe = V(ankle.x + 0.75 * footLen, 0);
  const lean = cfg.latLean;                                // busto inclinato all'indietro
  const shoulder = add(hip, V(-cfg.trunk * Math.sin(lean), cfg.trunk * Math.cos(lean)));
  const headTop = add(shoulder, V(0.02, PROP.head * H));
  const S = V(shoulder.x, shoulder.y, sw);
  const L = Math.sqrt(Math.max(0.01, (0.995 * (Lua + Lfa)) ** 2 - dz * dz));
  const topH = add(S, V(L * Math.sin(8 * D2R), L * Math.cos(8 * D2R), dz));   // braccia tese verso la carrucola
  const lowH = add(S, V(0.13, 0.02, dz));                                      // sbarra alle clavicole
  const hand = lerp(topH, lowH, phase === undefined ? 1 : 1 - phase);
  const ik = armIK(S, hand, Lua, Lfa);
  const arm = { S, elbow: ik.elbow, hand: ik.hand };
  const mom = armMoments(S, arm.elbow, arm.hand, -cfg.load, TABLES[cfg.sex], cfg.mass);
  const pts = { ankle, heel, toe, mid: lerp(heel, toe, 0.5), knee, hip, lumbar: lerp(hip, shoulder, LUMBAR_AT), shoulder, headTop };
  return {
    P: { ...pts, S, elbow: arm.elbow, bar: arm.hand, armSolid: true },
    joints: pullJoints(arm, mom, cfg.load * G, 'Spalla, adduzione', 'adduttori della spalla (gran dorsale, grande rotondo, gran pettorale)', -1),
    cop: null, balanced: true, reach: ik.reach, rom: topH.y - lowH.y, refKg: cfg.load + 0.3 * cfg.mass,
    noPlates: true, loadUp: true,
    props: [{ x: -0.22, y: hip.y - 0.13, w: 0.5, h: 0.06 }, { x: -0.02, y: 0, w: 0.06, h: hip.y - 0.13 }, { x: cfg.thigh - 0.2, y: hip.y + 0.07, w: 0.2, h: 0.07 }],
    angles: { shoulder: elevation(pts, arm), elbow: 180 - angleAt(arm.elbow, S, arm.hand) },
    front: { mode: 'hang', shoulder: sw, grip: gz, elbow: arm.elbow.z, hip: HIP_HALF * H, footY: hip.y - 0.07, seat: hip.y - 0.13 }
  };
}

// ---------- Rematore con bilanciere ----------

function bent(cfg, b, phase) {
  const H = cfg.height, footLen = PROP.foot * H, ankleH = PROP.ankleH * H;
  const { Lua, Lfa } = armLengths(cfg);
  const sw = SHOULDER_HALF * H, gz = cfg.grip / 2, dz = gz - sw;
  const a = 8 * D2R, c = cfg.rowLean;
  const ankle = V(0, ankleH), heel = V(-0.25 * footLen, 0), toe = V(0.75 * footLen, 0), mid = V(0.25 * footLen, 0);
  const knee = add(ankle, V(cfg.shank * Math.sin(a), cfg.shank * Math.cos(a)));
  const hip = add(knee, V(-cfg.thigh * Math.sin(b), cfg.thigh * Math.cos(b)));
  const d = V(Math.sin(c), Math.cos(c)), n = V(-Math.cos(c), Math.sin(c));   // asse del tronco, normale posteriore
  const shoulder = add(hip, mul(d, cfg.trunk));
  const headTop = add(shoulder, V(PROP.head * H * Math.sin(c / 2), PROP.head * H * Math.cos(c / 2)));
  const S = V(shoulder.x, shoulder.y, sw);
  const L = Math.sqrt(Math.max(0.01, (0.995 * (Lua + Lfa)) ** 2 - dz * dz));
  const lowH = V(S.x, S.y - L, gz);                                           // braccia tese, bilanciere appeso
  const t = add(add(hip, mul(d, 0.4 * cfg.trunk)), mul(n, -0.13));            // contatto sull'addome
  const topH = V(t.x, t.y, gz);
  const ik = armIK(S, lerp(topH, lowH, phase), Lua, Lfa, -Infinity, true);
  const arm = { S, elbow: ik.elbow, hand: ik.hand };
  const pts = { ankle, heel, toe, mid, knee, hip, lumbar: add(hip, mul(d, LUMBAR_AT * cfg.trunk)), shoulder, headTop };
  const masses = bodyMasses(cfg, pts, arm);
  masses.push({ g: 'torso', kg: cfg.load, p: arm.hand });
  return { pts, arm, masses, reach: ik.reach, rom: topH.y - lowH.y };
}

export function solveRow(cfg, phase) {
  const f = b => { const Q = bent(cfg, b, phase); return com(Q.masses).x - Q.pts.mid.x; };
  let lo = -5 * D2R, hi = 85 * D2R;                         // più le anche vanno indietro, più il baricentro arretra
  for (let i = 0; i < 40; i++) { const b = (lo + hi) / 2; if (f(b) < 0) hi = b; else lo = b; }
  const b = (lo + hi) / 2;
  const Q = bent(cfg, b, phase);
  const off = com(Q.masses).x - Q.pts.mid.x;
  const mom = armMoments(Q.arm.S, Q.arm.elbow, Q.arm.hand, cfg.load, TABLES[cfg.sex], cfg.mass);
  const js = pullJoints(Q.arm, mom, cfg.load * G, 'Spalla, abduzione orizzontale',
    'abduttori orizzontali (deltoide posteriore, infraspinato) con i retrattori delle scapole', 1);
  for (const [id, p, groups] of [['lumbar', Q.pts.lumbar, ['torso']], ['hip', Q.pts.hip, ['torso', 'pelvis']]]) {
    const s = com(Q.masses, groups), arm = s.x - p.x;
    js.push({ id, p, supported: s, weight: s.kg * G, arm, moment: s.kg * G * arm, barArm: Q.arm.hand.x - p.x });
  }
  return {
    P: { ...Q.pts, S: Q.arm.S, elbow: Q.arm.elbow, bar: Q.arm.hand, armSolid: true },
    joints: js, balanced: Math.abs(off) < 0.004, offset: off, reach: Q.reach, rom: Q.rom,
    angles: { shoulder: elevation(Q.pts, Q.arm), elbow: 180 - angleAt(Q.arm.elbow, Q.arm.S, Q.arm.hand), trunk: cfg.rowLean / D2R }
  };
}

export function pullConfigFromState(s) {
  return {
    sex: s.sex, height: s.height / 100, mass: s.mass, load: s.load, ballast: s.ballast,
    thigh: s.thigh / 100, shank: s.shank / 100, trunk: s.trunk / 100, arm: s.arm / 100,
    grip: s.grip / 100, latLean: s.latLean * D2R, rowLean: s.rowLean * D2R
  };
}
