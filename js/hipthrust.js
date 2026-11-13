// Hip thrust con bilanciere — modello quasi-statico sul piano sagittale.
// Il corpo poggia in due punti: la schiena sul bordo della panca e i piedi a terra.
// Asse x verso i piedi, y verso l'alto; il bordo della panca è a x = 0.
//
// Con due appoggi il sistema ha un'incognita in più delle equazioni: si assume che le
// reazioni siano verticali e che quella dei piedi passi poco davanti alla caviglia
// («spinta sui talloni»). Da qui si ricavano le due reazioni e i momenti articolari.

import { G, TABLES, PROP } from './engine.js';

const D2R = Math.PI / 180;
const CONTACT = 0.78;     // punto di appoggio sulla panca lungo il tronco (da anca)
const BAR_UP = 0.09;      // distanza dell'asse del bilanciere dal centro dell'anca (m)
const COP_FWD = 0.10;     // centro di pressione davanti alla caviglia (frazione del piede)
const PELVIS_AT = 0.12, LUMBAR_AT = 0.22;

const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
const angleAt = (o, p, q) => {
  const ux = p.x - o.x, uy = p.y - o.y, vx = q.x - o.x, vy = q.y - o.y;
  return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))))) / D2R;
};

// cfg: { sex, height, mass, load, thigh, shank, trunk, bench, kneeTop } in m e radianti
export function solveHipThrust(cfg, phase) {
  const H = cfg.height, T = TABLES[cfg.sex], M = T.mass, m = cfg.mass;
  const footLen = PROP.foot * H, ankleH = PROP.ankleH * H;
  const Lb = CONTACT * cfg.trunk, Lt = cfg.thigh, Ls = cfg.shank, hb = cfg.bench;
  const B = { x: 0, y: hb };

  // In alto: tronco e coscia allineati, ginocchio flesso dell'angolo scelto, piede a terra.
  const ankleY = th => hb + (Lb + Lt) * Math.sin(th) + Ls * Math.sin(th - cfg.kneeTop);
  let lo = -40 * D2R, hi = 45 * D2R;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (ankleY(mid) > ankleH) hi = mid; else lo = mid; }
  const thTop = (lo + hi) / 2;
  const ankle = { x: (Lb + Lt) * Math.cos(thTop) + Ls * Math.cos(thTop - cfg.kneeTop), y: ankleH };

  // In basso: i dischi toccano terra (oppure l'anca arriva a 12 cm dal suolo)
  const barY = th => hb + Lb * Math.sin(th) + BAR_UP * Math.cos(th);
  const low = Math.max(0.225, 0.12 + BAR_UP);
  lo = -80 * D2R; hi = thTop;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (barY(mid) > low) hi = mid; else lo = mid; }
  const thBot = (lo + hi) / 2;

  const th = thTop + (thBot - thTop) * phase;
  const d = { x: Math.cos(th), y: Math.sin(th) };
  const along = u => ({ x: B.x + (Lb - u) * d.x, y: B.y + (Lb - u) * d.y }); // u = distanza dall'anca lungo il tronco
  const hip = along(0);
  const shoulder = along(cfg.trunk), lumbar = along(LUMBAR_AT * cfg.trunk);
  const headLen = PROP.head * H;
  const headTop = { x: shoulder.x - headLen * Math.cos(th * 0.4), y: shoulder.y - headLen * Math.sin(th * 0.4) + 0.02 };
  const bar = { x: hip.x - BAR_UP * d.y, y: hip.y + BAR_UP * d.x };

  // Ginocchio: intersezione dei cerchi di coscia e tibia, soluzione alta
  const dx = ankle.x - hip.x, dy = ankle.y - hip.y, dist = Math.min(Math.hypot(dx, dy), Lt + Ls - 1e-4);
  const al = (Lt * Lt - Ls * Ls + dist * dist) / (2 * dist);
  const hh = Math.sqrt(Math.max(0, Lt * Lt - al * al));
  const dd = Math.hypot(dx, dy);
  const knee = { x: hip.x + (al * dx - hh * dy) / dd, y: hip.y + (al * dy + hh * dx) / dd };

  const heel = { x: ankle.x - 0.25 * footLen, y: 0 }, toe = { x: ankle.x + 0.75 * footLen, y: 0 };
  const mid = { x: ankle.x + 0.25 * footLen, y: 0 };
  const cop = ankle.x + COP_FWD * footLen;

  const torsoMass = M.trunk - M.pelvis;
  const torsoAt = ((1 - T.com.trunkFromShoulder) * M.trunk - PELVIS_AT * M.pelvis) / torsoMass;
  const arms = 2 * (M.upperArm + M.forearm + M.hand) * m;
  const W = kg => kg * G;
  const leg = [
    { kg: 2 * M.foot * m, p: { x: mid.x, y: ankleH / 2 }, g: 'foot' },
    { kg: 2 * M.shank * m, p: lerp(knee, ankle, T.com.shank), g: 'shank' },
    { kg: 2 * M.thigh * m, p: lerp(hip, knee, T.com.thigh), g: 'thigh' }
  ];
  const upper = [
    { kg: torsoMass * m, p: along(torsoAt * cfg.trunk) },
    { kg: M.head * m, p: lerp(shoulder, headTop, 0.6) },
    { kg: arms, p: lerp(shoulder, bar, 0.5) }
  ];
  const all = [...leg, ...upper, { kg: M.pelvis * m, p: along(PELVIS_AT * cfg.trunk) }, { kg: cfg.load, p: bar }];

  // Equilibrio: momenti rispetto al bordo della panca
  const totalW = all.reduce((s, q) => s + W(q.kg), 0);
  const Rf = all.reduce((s, q) => s + W(q.kg) * q.p.x, 0) / cop;
  const Rb = totalW - Rf;

  const sumLeg = (x0, groups) => leg.filter(q => groups.includes(q.g)).reduce((s, q) => s + W(q.kg) * (q.p.x - x0), 0);
  const mHip = Rf * (cop - hip.x) - sumLeg(hip.x, ['foot', 'shank', 'thigh']);
  const mKnee = -(Rf * (cop - knee.x) - sumLeg(knee.x, ['foot', 'shank']));
  const mAnkle = Rf * (cop - ankle.x) - sumLeg(ankle.x, ['foot']);
  const mLumbar = Rb * lumbar.x - upper.reduce((s, q) => s + W(q.kg) * (lumbar.x - q.p.x), 0);

  const j = (id, p, moment, force, lineX, armLabel) => ({
    id, p, moment, weight: force, arm: moment / force, barArm: lineX - p.x, leverX: lineX, armLabel
  });
  const feetLabel = 'braccio della reazione dei piedi', benchLabel = 'braccio della reazione della panca';
  return {
    P: { ankle, heel, toe, mid, knee, hip, lumbar, shoulder, headTop, bar, armSolid: false, elbow: lerp(shoulder, bar, 0.55) },
    joints: [
      j('lumbar', lumbar, mLumbar, Rb, B.x, benchLabel),
      j('hip', hip, mHip, Rf, cop, feetLabel),
      j('knee', knee, mKnee, Rf, cop, feetLabel),
      j('ankle', ankle, mAnkle, Rf, cop, feetLabel)
    ],
    cop, balanced: Rb > 0 && Rf > 0, reach: Math.hypot(dx, dy) <= Lt + Ls,
    Rf, Rb, totalW,
    rom: barY(thTop) - barY(thBot),
    frame: { x0: -0.62, x1: Math.max(1.2, toe.x + 0.1) },
    props: [{ x: -0.34, y: 0, w: 0.34, h: hb }],
    forces: [
      { x: cop, y: 0, label: `piedi ${Math.round(Rf)} N` },
      { x: B.x, y: hb, label: `panca ${Math.round(Rb)} N` }
    ],
    angles: {
      hip: 180 - angleAt(hip, B, knee),
      knee: 180 - angleAt(knee, hip, ankle),
      trunk: th / D2R
    }
  };
}

export function thrustConfigFromState(s) {
  return {
    sex: s.sex, height: s.height / 100, mass: s.mass, load: s.load,
    thigh: s.thigh / 100, shank: s.shank / 100, trunk: s.trunk / 100,
    bench: s.thBench / 100, kneeTop: s.thKnee * D2R
  };
}
