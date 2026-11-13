import { solve, configFromState, PROP, G, TYPICAL_DORSI } from './engine.js';
import { solveDeadlift, deadConfigFromState, deadDefaults } from './deadlift.js';
import { solveHipThrust, thrustConfigFromState } from './hipthrust.js';
import { solveOverhead, solveBench, pressConfigFromState } from './press.js';
import { solvePullUp, solveLat, solveRow, pullConfigFromState } from './pull.js';
import { solveDip, dipConfigFromState } from './dip.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v, d = 0) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

const DEFAULTS = {
  ex: 'squat', view: 'side',
  sex: 'M', height: 175, mass: 75, load: 100,
  thigh: 42.9, shank: 43.1, trunk: 50.4, arm: 66.9,
  variant: 'high', depth: 95, dorsi: 32,
  dvar: 'conv', ...deadDefaults(175).conv,
  tvar: 'bar', thBench: 40, thKnee: 90,
  pvar: 'ohp', grip: 58, barFront: 8, touch: 12, chest: 16,
  lvar: 'pullup', ballast: 0, latLean: 10, rowLean: 60,
  dipWidth: 50, dipLean: 20, dipElbow: 90, dipKnee: 80,
  phase: 1, sel: 'hip'
};
const BODY_KEYS = ['sex', 'height', 'mass', 'thigh', 'shank', 'trunk', 'arm'];
const ARM_PROP = 0.382;

const JOINTS = {
  shoulder: { name: 'Spalla', pos: 'estensori della spalla (gran dorsale)', neg: 'flessori della spalla', color: 'var(--shoulder)' },
  shoulderF: { name: 'Spalla, flessione', pos: 'flessori della spalla (deltoide anteriore, gran pettorale clavicolare)', neg: 'estensori della spalla', color: 'var(--shoulder)' },
  shoulderA: { name: 'Spalla, abduzione', pos: 'abduttori della spalla', neg: 'adduttori della spalla', color: 'var(--abd)' },
  elbow: { name: 'Gomito', pos: 'estensori del gomito (tricipite)', neg: 'flessori del gomito', color: 'var(--elbow)' },
  lumbar: { name: 'Lombare (L5–S1, stima)', pos: 'estensori della colonna', neg: 'flessori del tronco', color: 'var(--lumbar)' },
  hip: { name: 'Anca', pos: 'estensori dell\'anca', neg: 'flessori dell\'anca', color: 'var(--hip)' },
  knee: { name: 'Ginocchio', pos: 'estensori del ginocchio', neg: 'flessori del ginocchio (ischiocrurali)', color: 'var(--knee)' },
  ankle: { name: 'Caviglia', pos: 'flessori plantari', neg: 'flessori dorsali', color: 'var(--ankle)' }
};

const PRESETS = [
  { name: 'Proporzioni medie', thigh: PROP.thigh, shank: PROP.shank, trunk: PROP.trunk, arm: ARM_PROP },
  { name: 'Femori lunghi', thigh: 0.265, shank: 0.246, trunk: 0.275, arm: ARM_PROP },
  { name: 'Busto lungo', thigh: 0.232, shank: 0.246, trunk: 0.305, arm: ARM_PROP },
  { name: 'Femori corti, tibie lunghe', thigh: 0.230, shank: 0.262, trunk: 0.288, arm: ARM_PROP },
  { name: 'Braccia lunghe', thigh: PROP.thigh, shank: PROP.shank, trunk: PROP.trunk, arm: 0.41 },
  { name: 'Braccia corte', thigh: PROP.thigh, shank: PROP.shank, trunk: PROP.trunk, arm: 0.355 }
];

const BODY_ROWS = [
  { key: 'height', label: 'Statura', unit: 'cm', min: 145, max: 210, step: 0.5 },
  { key: 'mass', label: 'Peso corporeo', unit: 'kg', min: 40, max: 140, step: 0.5 },
  { key: 'thigh', label: 'Femore (anca → ginocchio)', unit: 'cm', min: 30, max: 58, step: 0.1 },
  { key: 'shank', label: 'Tibia (ginocchio → caviglia)', unit: 'cm', min: 30, max: 58, step: 0.1 },
  { key: 'trunk', label: 'Busto (anca → spalla)', unit: 'cm', min: 38, max: 66, step: 0.1 },
  { key: 'arm', label: 'Braccio (spalla → presa), usato negli stacchi', unit: 'cm', min: 50, max: 85, step: 0.1 }
];

const LOAD_ROW = { key: 'load', label: 'Bilanciere', unit: 'kg', min: 0, max: 400, step: 2.5 };

const COMMON_SOURCES = [
  'de Leva P. Adjustments to Zatsiorsky-Seluyanov\'s segment inertia parameters. <i>J Biomech</i>. 1996;29(9):1223-1230.',
  'Winter DA. <i>Biomechanics and Motor Control of Human Movement</i>. 4th ed. Wiley; 2009.'
];

// ---------- Esercizi ----------

const EX = {
  squat: {
    vkey: 'variant',
    variants: [['high', 'High bar'], ['low', 'Low bar'], ['front', 'Front']],
    tech: [
      LOAD_ROW,
      { key: 'depth', label: 'Profondità (angolo della coscia dalla verticale)', unit: '°', min: 50, max: 125, step: 1,
        note: v => v < 80 ? 'mezzo squat' : v <= 100 ? 'circa parallelo' : 'profondo' },
      { key: 'dorsi', label: 'Avanzamento ginocchia (dorsiflessione in buca)', unit: '°', min: 5, max: 45, step: 1 }
    ],
    bottom: 'buca', hamK: 0.5, copLabel: 'centro piede',
    aria: 'Figura dello squat vista di lato con bracci di leva',
    onVariant(v) { state.dorsi = TYPICAL_DORSI[v]; },
    solve: s => solve(configFromState(s)),
    readouts: R => [
      [fmt(R.angles.trunk) + '°', 'Tronco', 'inclinazione'], [fmt(R.angles.hip) + '°', 'Anca', 'flessione'],
      [fmt(R.angles.knee) + '°', 'Ginocchio', 'flessione'], [fmt(R.angles.ankle) + '°', 'Caviglia', 'dorsiflessione']
    ],
    warn: R => R.balanced ? '' :
      `Posizione non equilibrata: il baricentro cade ${fmt(Math.abs(R.offset) * 100, 1)} cm ${R.offset > 0 ? 'davanti al' : 'dietro il'} centro del piede. ` +
      (R.offset > 0 ? 'Il tronco non può raddrizzarsi oltre.' : 'Servono più avanzamento delle ginocchia o meno profondità.'),
    muscles: [
      ['hip', 'Estensori dell\'anca', '<b>Grande gluteo, grande adduttore, ischiocrurali.</b> Gli ischiocrurali, biarticolari, hanno nello squat un\'attività solo moderata<sup>5</sup>; il contributo del grande gluteo cresce con la profondità<sup>8</sup>. Per questo nella figura sono disegnati a intensità dimezzata.'],
      ['knee', 'Estensori del ginocchio', '<b>Vasti (mediale, laterale, intermedio) e retto femorale.</b> Il momento al ginocchio cresce con l\'avanzamento delle ginocchia; limitarlo sposta il carico su anca e zona lombare<sup>6</sup>. A parità di carico relativo (quindi con un bilanciere più leggero) il front squat dà un\'attivazione muscolare simile al back squat, con forze compressive e momenti estensori al ginocchio minori<sup>4</sup>; a parità di chili, come nel confronto che fai qui, il momento al ginocchio del front squat risulta invece più alto.'],
      ['ankle', 'Flessori plantari', '<b>Soleo e gastrocnemio.</b> Controllano l\'avanzamento della tibia e tengono il carico sul centro del piede; l\'attivazione del gastrocnemio nello squat è moderata<sup>5</sup>.'],
      ['lumbar', 'Estensori della colonna', '<b>Erettori spinali e multifido</b>, in isometria per mantenere il tronco rigido. Il low bar aumenta l\'inclinazione del tronco e sposta il lavoro verso l\'anca rispetto all\'high bar<sup>3,7</sup>.']
    ],
    notes: [
      'Figura a segmenti rigidi sul piano sagittale, vista di lato; i due arti sono sommati.',
      'Coscia e tibia seguono profondità e avanzamento delle ginocchia scelti; l\'inclinazione del tronco è quella che porta il baricentro di corpo + bilanciere sopra il centro del piede.',
      'A parità di posizione delle gambe, spostare il bilanciere cambia solo il tronco: i momenti su anca e ginocchio restano uguali. Le differenze tra high bar, low bar e front squat nascono dal diverso avanzamento delle ginocchia, che l\'app imposta a 32°, 27° e 38° quando cambi variante e che puoi modificare. L\'ordine tra high e low bar segue la letteratura (high bar: più flessione di ginocchio e tronco più verticale)<sup>3</sup>; i gradi esatti e il valore del front squat sono stime mie.',
      'Semplificazioni: colonna rigida, posizione di L5–S1 e del bilanciere stimate, braccia schematiche, larghezza dello stance non considerata.'
    ],
    sources: [
      'Glassbrook DJ, Helms ER, Brown SR, Storey AG. A review of the biomechanical differences between the high-bar and low-bar back-squat. <i>J Strength Cond Res</i>. 2017;31(9):2618-2634.',
      'Gullett JC, Tillman MD, Gutierrez GM, Chow JW. A biomechanical comparison of back and front squats in healthy trained individuals. <i>J Strength Cond Res</i>. 2009;23(1):284-292.',
      'Schoenfeld BJ. Squatting kinematics and kinetics and their application to exercise performance. <i>J Strength Cond Res</i>. 2010;24(12):3497-3506.',
      'Fry AC, Smith JC, Schilling BK. Effect of knee position on hip and knee torques during the barbell squat. <i>J Strength Cond Res</i>. 2003;17(4):629-633.',
      'Wretenberg P, Feng Y, Arborelius UP. High- and low-bar squatting techniques during weight-training. <i>Med Sci Sports Exerc</i>. 1996;28(2):218-224.',
      'Caterisano A, Moss RF, Pellinger TK, et al. The effect of back squat depth on the EMG activity of 4 superficial hip and thigh muscles. <i>J Strength Cond Res</i>. 2002;16(3):428-432.'
    ]
  },

  dead: {
    vkey: 'dvar',
    variants: [['conv', 'Convenzionale'], ['sumo', 'Sumo'], ['rdl', 'Rumeno']],
    tech: [
      LOAD_ROW,
      { key: 'barLow', label: 'Altezza del bilanciere nel punto più basso', unit: 'cm', min: 10, max: 70, step: 0.5,
        note: v => v === 22.5 ? 'a terra, dischi standard' : v < 22.5 ? 'in deficit' : 'da rialzo o a mezz\'aria' },
      { key: 'shin', label: 'Avanzamento della tibia in basso', unit: '°', min: 0, max: 20, step: 1,
        note: v => v <= 7 ? 'anche alte' : v >= 14 ? 'anche basse' : '' },
      { key: 'armTilt', label: 'Spalle davanti al bilanciere (inclinazione braccia)', unit: '°', min: 0, max: 25, step: 1 },
      { key: 'stance', label: 'Larghezza dello stance (tra le caviglie)', unit: 'cm', min: 10, max: 95, step: 1 },
      { key: 'toe', label: 'Apertura delle punte', unit: '°', min: 0, max: 60, step: 1 }
    ],
    bottom: 'in basso', hamK: 1, front: true, copLabel: 'centro di pressione',
    aria: 'Figura dello stacco vista di lato con bracci di leva',
    onVariant(v) { Object.assign(state, deadDefaults(state.height)[v]); },
    solve: s => solveDeadlift(deadConfigFromState(s), s.phase),
    readouts: R => [
      [fmt(R.angles.trunk) + '°', 'Tronco', 'inclinazione'], [fmt(R.angles.hip) + '°', 'Anca', 'flessione'],
      [fmt(R.angles.knee) + '°', 'Ginocchio', 'flessione'], [fmt(R.rom * 100) + ' cm', 'Corsa', 'del bilanciere']
    ],
    warn: R => !R.reach
      ? 'Con queste misure la posizione non si chiude: le mani non arrivano al bilanciere. Aumenta l\'avanzamento della tibia o l\'inclinazione delle braccia, oppure stringi lo stance.'
      : R.balanced ? '' : `Posizione non equilibrata: il centro di pressione cade ${R.offset > 0 ? 'oltre le punte' : 'dietro il tallone'}.`,
    muscles: [
      ['hip', 'Estensori dell\'anca', '<b>Grande gluteo, ischiocrurali, grande adduttore.</b> È il momento dominante dello stacco. Con il ginocchio poco flesso gli ischiocrurali lavorano in allungamento: il rumeno è tra gli esercizi con la maggiore attivazione di questo gruppo<sup>7</sup>.'],
      ['knee', 'Estensori del ginocchio', '<b>Vasti e retto femorale.</b> Momento piccolo rispetto all\'anca; quando diventa negativo sono gli ischiocrurali a controllare il ginocchio. Nel sumo l\'attività elettromiografica dei vasti è maggiore che nel convenzionale<sup>4</sup>.'],
      ['ankle', 'Flessori plantari', '<b>Soleo e gastrocnemio.</b> Il gastrocnemio mediale è più attivo nel convenzionale che nel sumo<sup>4</sup>.'],
      ['lumbar', 'Estensori della colonna', '<b>Erettori spinali e multifido</b>, in isometria. Il tronco più verticale del sumo riduce il momento lombare; su L4–L5 è stata misurata una riduzione di circa il 10 %<sup>5,6</sup>.'],
      ['shoulder', 'Estensori della spalla', '<b>Gran dorsale, grande rotondo, capo lungo del tricipite.</b> Tengono il bilanciere vicino al corpo: più le spalle sono davanti al bilanciere, più devono lavorare.']
    ],
    notes: [
      'Tronco e braccia sul piano sagittale; gambe in tre dimensioni per tenere conto di stance e apertura delle punte. I due arti sono sommati.',
      'Il bilanciere sale in verticale sopra il centro del piede. Avanzamento della tibia e inclinazione delle braccia li scegli tu; l\'anca è il punto che chiude la catena ginocchio–anca–spalla. La tibia non può attraversare il bilanciere.',
      'Il centro di pressione sotto il piede è un risultato del calcolo, non un vincolo: di norma cade poco dietro il centro del piede.',
      'Nel sumo le cosce sono abdotte: viste di lato sono più corte, l\'anca è più vicina al bilanciere, il tronco più verticale e la corsa più breve<sup>3</sup>. Il modello calcola solo i momenti di flesso-estensione: quelli sul piano frontale e le forze laterali dei piedi sul suolo non sono considerati, quindi il lavoro di adduttori e rotatori dell\'anca non compare.',
      'Stance e apertura delle punte iniziali riprendono le medie misurate su powerlifter (convenzionale 32 cm e 14°, sumo 70 cm e 42°)<sup>3</sup>, scalate sulla statura. Avanzamento della tibia e inclinazione delle braccia sono invece stime mie: modificale per riprodurre un\'esecuzione reale.',
      'Nelle misure su atleti il sumo ha tronco e cosce 5–10° più verticali e momenti all\'anca non significativamente diversi dal convenzionale<sup>3</sup>: se il modello mostra differenze maggiori, dipende dalle stime sulla posizione del ginocchio.',
      'Semplificazioni: colonna rigida, posizione di L5–S1 stimata, presa e scapole non modellate.'
    ],
    sources: [
      'Escamilla RF, Francisco AC, Fleisig GS, et al. A three-dimensional biomechanical analysis of sumo and conventional style deadlifts. <i>Med Sci Sports Exerc</i>. 2000;32(7):1265-1275.',
      'Escamilla RF, Francisco AC, Kayes AV, Speer KP, Moorman CT. An electromyographic analysis of sumo and conventional style deadlifts. <i>Med Sci Sports Exerc</i>. 2002;34(4):682-688.',
      'Cholewicki J, McGill SM, Norman RW. Lumbar spine loads during the lifting of extremely heavy weights. <i>Med Sci Sports Exerc</i>. 1991;23(10):1179-1186.',
      'McGuigan MRM, Wilson BD. Biomechanical analysis of the deadlift. <i>J Strength Cond Res</i>. 1996;10(4):250-255.',
      'McAllister MJ, Hammond KG, Schilling BK, et al. Muscle activation during various hamstring exercises. <i>J Strength Cond Res</i>. 2014;28(6):1573-1580.'
    ]
  },

  thrust: {
    vkey: 'tvar',
    variants: [['bar', 'Bilanciere']],
    tech: [
      LOAD_ROW,
      { key: 'thBench', label: 'Altezza della panca', unit: 'cm', min: 28, max: 52, step: 1 },
      { key: 'thKnee', label: 'Flessione del ginocchio in alto', unit: '°', min: 65, max: 125, step: 1,
        note: v => v < 85 ? 'piedi lontani' : v > 100 ? 'piedi vicini' : 'tibia verticale' }
    ],
    bottom: 'in basso', topLabel: 'in alto', hamK: 1, copLabel: 'centro di pressione', sel: 'hip',
    aria: 'Figura dell\'hip thrust vista di lato con reazioni degli appoggi',
    onVariant() {},
    solve: s => solveHipThrust(thrustConfigFromState(s), s.phase),
    readouts: R => [
      [fmt(R.angles.hip) + '°', 'Anca', 'flessione'], [fmt(R.angles.knee) + '°', 'Ginocchio', 'flessione'],
      [fmt(R.Rf / R.totalW * 100) + ' %', 'Piedi', 'quota del peso'], [fmt(R.Rb / R.totalW * 100) + ' %', 'Panca', 'quota del peso']
    ],
    warn: R => !R.reach ? 'Piedi troppo lontani: con queste misure la gamba non arriva a terra.' : '',
    muscles: [
      ['hip', 'Estensori dell\'anca', '<b>Grande gluteo, ischiocrurali, grande adduttore.</b> Il momento all\'anca resta alto anche ad anca estesa, mentre in squat e stacco si azzera in piedi. Con carichi da 10RM l\'hip thrust ha mostrato un\'attività di grande gluteo e bicipite femorale maggiore del back squat<sup>3</sup>.'],
      ['knee', 'Ginocchio', '<b>Quadricipite o ischiocrurali, secondo la posizione dei piedi.</b> Con i piedi lontani la reazione del suolo passa davanti al ginocchio e servono i flessori (ischiocrurali); con i piedi vicini passa dietro e lavora il quadricipite. Nello stesso studio l\'attività del vasto laterale non differiva da quella dello squat<sup>3</sup>.'],
      ['ankle', 'Flessori plantari', '<b>Soleo e gastrocnemio.</b> Richiesta minima se la spinta passa vicino al tallone.'],
      ['lumbar', 'Estensori della colonna', '<b>Erettori spinali e multifido</b>, in isometria tra l\'appoggio sulla panca e il bacino.']
    ],
    notes: [
      'Figura a segmenti rigidi sul piano sagittale; i due arti sono sommati. La schiena ruota attorno al bordo della panca, i piedi restano fermi dove li mette l\'angolo del ginocchio scelto per la posizione alta.',
      'Il corpo ha due appoggi, panca e piedi: le reazioni si ricavano dall\'equilibrio assumendo che siano verticali e che quella dei piedi passi poco davanti alla caviglia (spinta sui talloni). I momenti si calcolano da queste reazioni, non dal solo bilanciere.',
      'Il bilanciere poggia sull\'anca, quindi il suo braccio di leva diretto sull\'anca è quasi nullo: la leva che conta è la distanza tra l\'anca e la reazione dei piedi.',
      'Semplificazioni: nessun attrito su panca e suolo, punto di appoggio sulla schiena fisso, colonna rigida.'
    ],
    sources: [
      'Contreras B, Vigotsky AD, Schoenfeld BJ, Beardsley C, Cronin J. A comparison of gluteus maximus, biceps femoris, and vastus lateralis electromyographic activity in the back squat and barbell hip thrust exercises. <i>J Appl Biomech</i>. 2015;31(6):452-458.'
    ]
  },

  press: {
    vkey: 'pvar',
    variants: [['ohp', 'Military'], ['bench', 'Panca'], ['dip', 'Dip']],
    tech: s => s.pvar === 'dip' ? [
      { key: 'ballast', label: 'Zavorra', unit: 'kg', min: 0, max: 100, step: 2.5 },
      { key: 'dipWidth', label: 'Distanza tra le parallele (tra le mani)', unit: 'cm', min: 35, max: 75, step: 1 },
      { key: 'dipLean', label: 'Inclinazione del busto in avanti in basso', unit: '°', min: 0, max: 50, step: 1,
        note: v => v <= 10 ? 'busto verticale' : v >= 30 ? 'busto inclinato' : '' },
      { key: 'dipElbow', label: 'Profondità (flessione del gomito in basso)', unit: '°', min: 50, max: 120, step: 1 },
      { key: 'dipKnee', label: 'Flessione delle ginocchia', unit: '°', min: 0, max: 120, step: 1 }
    ] : [
      LOAD_ROW,
      { key: 'grip', label: 'Larghezza della presa (tra le mani)', unit: 'cm', min: 30, max: 100, step: 1 },
      ...(s.pvar === 'ohp'
        ? [{ key: 'barFront', label: 'Bilanciere davanti alle spalle in partenza', unit: 'cm', min: 0, max: 18, step: 0.5 }]
        : [{ key: 'touch', label: 'Punto di contatto sul petto (distanza dalle spalle verso i piedi)', unit: 'cm', min: 0, max: 22, step: 0.5 },
           { key: 'chest', label: 'Altezza del bilanciere sul petto rispetto alla spalla (torace e arco)', unit: 'cm', min: 8, max: 26, step: 0.5 }])
    ],
    bottom: 'in basso', topLabel: 'in alto', hamK: 1, front: true, copLabel: 'centro piede', sel: 'shoulderF',
    aria: 'Figura della spinta vista di lato con bracci di leva',
    onVariant(v) { if (v !== 'dip') state.grip = Math.round((v === 'ohp' ? 0.33 : 0.46) * state.height); },
    onEnter() { this.onVariant(state.pvar); },
    solve: s => s.pvar === 'dip' ? solveDip(dipConfigFromState(s), s.phase)
      : (s.pvar === 'ohp' ? solveOverhead : solveBench)(pressConfigFromState(s), s.phase),
    readouts: R => R.readouts ? R.readouts : R.angles.lean !== undefined
      ? [[fmt(R.angles.shoulder) + '°', 'Omero', 'elevazione'], [fmt(R.angles.elbow) + '°', 'Gomito', 'flessione'],
         [fmt(R.angles.lean, 1) + '°', 'Corpo', 'inclinazione'], [fmt(R.rom * 100) + ' cm', 'Corsa', 'del bilanciere']]
      : [[fmt(R.angles.abd) + '°', 'Omero', 'apertura dal busto'], [fmt(R.angles.elbow) + '°', 'Gomito', 'flessione'],
         [fmt(R.rom * 100) + ' cm', 'Corsa', 'del bilanciere']],
    warn: R => !R.reach ? 'Con questa presa e queste misure le braccia non arrivano al bilanciere in questa posizione.'
      : R.balanced ? '' : R.loadUp ? 'Con questa inclinazione del busto il baricentro non riesce a stare sopra le mani.'
      : 'Posizione non equilibrata: il baricentro non resta sopra il centro del piede.',
    muscleHint: 'Momenti calcolati dal modello nella posizione mostrata, totali dei due arti. Sono una richiesta meccanica, non un\'attivazione misurata.',
    muscles: [
      ['dip', 'Il dip in breve', 'Il corpo è appeso alle mani: le parallele spingono verso l\'alto con tutto il peso, e il baricentro resta sulla loro verticale. Più il busto si inclina in avanti, più le spalle passano davanti alle mani e cresce il braccio di leva dei flessori della spalla (gran pettorale, deltoide anteriore). In basso l\'omero va dietro al busto: è questa estensione della spalla sotto carico che rende il dip impegnativo per la parte anteriore della spalla<sup>6</sup>. Gran pettorale e tricipite sono i muscoli principali, e la loro attività cresce con la fatica senza grandi cambi di tecnica<sup>7</sup>.'],
      ['shoulderF', 'Flessori della spalla', '<b>Deltoide anteriore e capo clavicolare del gran pettorale.</b> Lavorano in proporzione a quanto il bilanciere sta davanti alla spalla (military press) o verso i piedi rispetto alla spalla (panca).'],
      ['shoulderA', 'Abduttori o adduttori orizzontali', '<b>Deltoide medio e sovraspinato nel military press; gran pettorale sternocostale e deltoide anteriore in panca.</b> Il braccio di leva è la distanza laterale tra mano e spalla, visibile nella vista di fronte: cresce con la larghezza della presa. In panca, stringendo la presa l\'attività del gran pettorale sternocostale cala e quella del tricipite aumenta<sup>3</sup>.'],
      ['elbow', 'Estensori del gomito', '<b>Tricipite brachiale.</b> Il momento dipende da quanto la mano è spostata rispetto alla verticale del gomito. Attenzione: nella panca reale le mani spingono anche verso l\'esterno lungo la sbarra, per circa un quarto della forza verticale<sup>5</sup>; il modello considera solo la forza verticale, quindi sottostima il lavoro del tricipite e sovrastima quello di adduzione orizzontale.'],
      ['lumbar', 'Stabilizzatori del tronco', '<b>Erettori spinali o addominali</b>, secondo che il carico sostenuto cada davanti o dietro la zona lombare. In piedi la richiesta di stabilità è maggiore: nelle spinte sopra la testa l\'attività dei deltoidi è risultata più alta in piedi e con i manubri che da seduti e con il bilanciere<sup>4</sup>.']
    ],
    notes: [
      'Braccia in tre dimensioni: la spalla è ferma, la mano segue il bilanciere alla larghezza di presa scelta, il gomito è il punto più basso possibile (avambraccio il più verticale possibile), con l\'omero al massimo 35° sotto l\'orizzontale in panca. La posizione del gomito è quindi una stima, ed è la parte meno affidabile del modello: il momento al gomito va letto come ordine di grandezza.',
      'Il momento alla spalla è scomposto in due: flessione (bilanciere davanti alla spalla, vista di lato) e abduzione o adduzione orizzontale (mano più larga della spalla, vista di fronte). I due arti sono sommati.',
      'Military press: corpo dritto, inclinato dalle caviglie quanto serve per tenere il baricentro sopra il centro del piede; il bilanciere parte dalle clavicole, davanti alle spalle, e arriva sopra le spalle.',
      'Panca: il bilanciere scende sul petto verso i piedi e risale sopra le spalle; panca alta 43 cm; spinta delle gambe e retrazione delle scapole non sono modellate; spessore del torace e arco li regoli con l\'altezza del bilanciere sul petto (16 cm sopra la spalla è una mia stima).',
      'Il bilanciere esercita solo forza verticale: le forze laterali delle mani sulla sbarra, misurate in panca<sup>5</sup>, non sono considerate.',
      'Dip: le parallele reggono tutto il peso (corpo più zavorra); il busto si inclina in avanti scendendo fino all\'angolo scelto, le gambe seguono il busto con le ginocchia flesse e i piedi dietro, e la posizione delle spalle rispetto alle mani è quella che porta il baricentro sulla verticale delle mani. Il gomito punta all\'indietro. Inclinazione del busto, flessione delle ginocchia e profondità iniziali sono stime mie.'
    ],
    sources: [
      'Lehman GJ. The influence of grip width and forearm pronation/supination on upper-body myoelectric activity during the flat bench press. <i>J Strength Cond Res</i>. 2005;19(3):587-591.',
      'Saeterbakken AH, Fimland MS. Effects of body position and loading modality on muscle activity and strength in shoulder presses. <i>J Strength Cond Res</i>. 2013;27(7):1824-1831.',
      'Duffey MJ, Challis JH. Vertical and lateral forces applied to the bar during the bench press in novice lifters. <i>J Strength Cond Res</i>. 2011;25(9):2442-2447.',
      'McKenzie A, Crowley-McHattan Z, Meir R, Whitting J, Volschenk W. Bench, bar, and ring dips: do kinematics and muscle activity differ? <i>Int J Environ Res Public Health</i>. 2022;19(20):13211.',
      'McKenzie A, Crowley-McHattan Z, Meir R, Whitting J, Volschenk W. Fatigue increases muscle activations but does not change maximal joint angles during the bar dip. <i>Int J Environ Res Public Health</i>. 2022;19(21):14390.'
    ]
  },

  pull: {
    vkey: 'lvar',
    variants: [['pullup', 'Trazioni'], ['lat', 'Lat machine'], ['row', 'Rematore']],
    tech: s => [
      s.lvar === 'pullup'
        ? { key: 'ballast', label: 'Zavorra', unit: 'kg', min: 0, max: 100, step: 2.5 }
        : { ...LOAD_ROW, label: s.lvar === 'lat' ? 'Carico al cavo' : 'Bilanciere' },
      { key: 'grip', label: 'Larghezza della presa (tra le mani)', unit: 'cm', min: 20, max: 110, step: 1 },
      ...(s.lvar === 'lat' ? [{ key: 'latLean', label: 'Busto inclinato all\'indietro', unit: '°', min: 0, max: 35, step: 1 }] : []),
      ...(s.lvar === 'row' ? [{ key: 'rowLean', label: 'Inclinazione del busto dalla verticale', unit: '°', min: 20, max: 90, step: 1,
        note: v => v >= 80 ? 'busto orizzontale' : v <= 40 ? 'busto quasi eretto' : '' }] : [])
    ],
    bottom: 'braccia distese', topLabel: 'contrazione', hamK: 1, front: true, copLabel: 'centro piede', sel: 'shoulderF', pull: true,
    aria: 'Figura della tirata vista di lato con bracci di leva',
    onVariant(v) { state.grip = Math.round(({ pullup: 0.37, lat: 0.4, row: 0.33 })[v] * state.height); },
    onEnter() { this.onVariant(state.lvar); },
    solve: s => ({ pullup: solvePullUp, lat: solveLat, row: solveRow })[s.lvar](pullConfigFromState(s), s.phase),
    readouts: R => [
      [fmt(R.angles.shoulder) + '°', 'Omero', 'elevazione dal busto'], [fmt(R.angles.elbow) + '°', 'Gomito', 'flessione'],
      ...(R.angles.lean !== undefined ? [[fmt(R.angles.lean, 1) + '°', 'Corpo', 'inclinazione']] : []),
      ...(R.angles.trunk !== undefined ? [[fmt(R.angles.trunk) + '°', 'Tronco', 'inclinazione']] : []),
      [fmt(R.rom * 100) + ' cm', 'Corsa', R.noPlates && R.angles.lean !== undefined ? 'del corpo' : 'della sbarra']
    ],
    warn: R => !R.reach ? 'Con questa presa e queste misure le braccia non arrivano alla sbarra in questa posizione.'
      : R.balanced ? '' : 'Posizione non equilibrata: il baricentro non resta sopra il centro del piede.',
    muscleHint: 'Momenti calcolati dal modello nella posizione mostrata, totali dei due arti. Sono una richiesta meccanica, non un\'attivazione misurata.',
    muscles: [
      ['shoulderF', 'Estensori della spalla', '<b>Gran dorsale, grande rotondo, deltoide posteriore, capo lungo del tricipite.</b> Lavorano in proporzione a quanto la mano sta davanti alla spalla (trazioni e lat machine) o dietro (rematore, a fine tirata). Nelle trazioni il gran dorsale è il muscolo più attivo, oltre il 100 % della contrazione massima volontaria<sup>3</sup>.'],
      ['shoulderA', 'Adduttori o abduttori orizzontali', '<b>Trazioni e lat machine: gran dorsale, grande rotondo, gran pettorale (adduzione). Rematore: deltoide posteriore e infraspinato, con romboidi e trapezio medio che retraggono le scapole.</b> Il braccio di leva è la distanza laterale tra mano e spalla, visibile di fronte. Alla lat machine, però, l\'attivazione del gran dorsale è risultata simile con prese tra 1 e 2 volte la larghezza delle spalle, e con la presa larga il carico sollevabile era minore<sup>4</sup>: un braccio di leva maggiore non significa di per sé più stimolo.'],
      ['elbow', 'Flessori del gomito', '<b>Bicipite brachiale, brachiale, brachioradiale.</b> Nelle trazioni il bicipite è il secondo muscolo più attivo, e lo è di più con la presa supina (chin-up) che con la prona<sup>3</sup>; il modello non distingue le due prese. Quando l\'avambraccio resta inclinato verso l\'esterno, come a fine tirata con presa larga, il modello può indicare una richiesta sugli estensori del gomito: è un effetto della geometria rigida, perché nella realtà busto e scapole si adattano per allineare l\'avambraccio alla forza.'],
      ['lumbar', 'Estensori della colonna', '<b>Erettori spinali e multifido</b>, in isometria per reggere il busto inclinato. Tra gli esercizi di remata confrontati in uno studio, il rematore in piedi a busto flesso è quello con il carico maggiore sulla colonna lombare<sup>5</sup>.'],
      ['hip', 'Estensori dell\'anca', '<b>Grande gluteo e ischiocrurali</b>, in isometria per tenere il bacino: è la stessa richiesta di uno stacco rumeno fermo a metà.']
    ],
    notes: [
      'Braccia in tre dimensioni, come nelle spinte: spalla e mano sono date, il gomito è il punto più basso possibile nelle trazioni e alla lat machine, il più alto nel rematore. La posizione del gomito è una stima, quindi il momento al gomito vale come ordine di grandezza.',
      'Il momento alla spalla è scomposto in due: estensione (vista di lato) e adduzione o abduzione orizzontale (vista di fronte). I due arti sono sommati.',
      'Trazioni: la sbarra regge tutto il peso (corpo più zavorra) e il baricentro resta sotto le mani; il corpo è rigido e si inclina quanto serve. In alto le spalle arrivano 10 cm sotto la sbarra e 12 cm dietro.',
      'Lat machine: corpo fermo, cavo considerato verticale, sbarra che scende dalle braccia tese alle clavicole. A parità di chili sulla mano è lo stesso esercizio delle trazioni visto dall\'altra parte.',
      'Rematore: busto all\'inclinazione scelta, ginocchia appena flesse, anche arretrate quanto serve per tenere il baricentro sopra il centro del piede; il bilanciere sale dalle braccia tese all\'addome.',
      'Il movimento delle scapole non è modellato: retrazione, depressione e il lavoro di trapezio e romboidi non compaiono nei numeri. Presa prona, supina o neutra non cambiano il calcolo.'
    ],
    sources: [
      'Youdas JW, Amundson CL, Cicero KS, Hahn JJ, Harezlak DT, Hollman JH. Surface electromyographic activation patterns and elbow joint motion during a pull-up, chin-up, or perfect-pullup rotational exercise. <i>J Strength Cond Res</i>. 2010;24(12):3404-3414.',
      'Andersen V, Fimland MS, Wiik E, Skoglund A, Saeterbakken AH. Effects of grip width on muscle strength and activation in the lat pull-down. <i>J Strength Cond Res</i>. 2014;28(4):1135-1142.',
      'Fenwick CMJ, Brown SHM, McGill SM. Comparison of different rowing exercises: trunk muscle activation and lumbar spine motion, load, and stiffness. <i>J Strength Cond Res</i>. 2009;23(2):350-358.'
    ]
  }
};
const techRows = () => { const t = ex().tech; return typeof t === 'function' ? t(state) : t; };

const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* archiviazione non disponibile */ } }
};

const state = { ...DEFAULTS, ...store.get('leve.state', {}) };
if (!EX[state.ex]) state.ex = 'squat';
let profiles = store.get('leve.profiles', []);
const ex = () => EX[state.ex];

// ---------- Controlli ----------

function buildRows(host, rows) {
  host.innerHTML = rows.map(r => `
    <div class="row">
      <label for="r-${r.key}"><span>${r.label}</span><span id="n-${r.key}"></span></label>
      <input type="range" id="r-${r.key}" min="${r.min}" max="${r.max}" step="${r.step}">
      <input type="number" id="i-${r.key}" min="${r.min}" max="${r.max}" step="${r.step}" inputmode="decimal" aria-label="${r.label} (${r.unit})">
    </div>`).join('');
  for (const r of rows) {
    const apply = raw => {
      const v = clamp(parseFloat(raw), r.min, r.max);
      if (Number.isNaN(v)) return;
      setValue(r.key, v);
    };
    $('r-' + r.key).addEventListener('input', e => apply(e.target.value));
    $('i-' + r.key).addEventListener('change', e => apply(e.target.value));
  }
}

function setValue(key, v) {
  if (key === 'height') {
    // Cambiando la statura le proporzioni restano le stesse
    const k = v / state.height;
    for (const s of ['thigh', 'shank', 'trunk', 'arm']) state[s] = Math.round(state[s] * k * 10) / 10;
  }
  state[key] = v;
  render();
}

function buildExercise() {
  const E = ex();
  for (const b of $('exercises').children) b.classList.toggle('on', b.dataset.ex === state.ex);
  $('variant').innerHTML = E.variants.map(([v, label]) => `<button type="button" data-v="${v}">${label}</button>`).join('');
  $('variant').hidden = E.variants.length < 2;
  $('view').hidden = !E.front;
  buildRows($('technique'), techRows());
  if (!E.front) state.view = 'side';
  state.sel = E.sel || 'hip';
  drawSources();
}

function syncControls() {
  const E = ex();
  for (const r of [...techRows(), ...BODY_ROWS]) {
    const v = state[r.key];
    $('r-' + r.key).value = v;
    if (document.activeElement !== $('i-' + r.key)) $('i-' + r.key).value = v;
    $('n-' + r.key).textContent = r.note ? r.note(v) : '';
  }
  for (const [id, key] of [['variant', E.vkey], ['sex', 'sex'], ['view', 'view']]) {
    for (const b of $(id).children) b.classList.toggle('on', b.dataset.v === state[key]);
  }
  $('phase').value = Math.round(state.phase * 100);
  $('phaseLabel').textContent = state.phase > 0.97 ? E.bottom : state.phase < 0.03 ? (E.topLabel || 'in piedi') : fmt(state.phase * 100) + ' %';
}

function buildProfiles() {
  $('profileList').innerHTML = profiles.length
    ? profiles.map((p, i) => `<option value="${i}">${p.name.replace(/[<&]/g, '')}</option>`).join('')
    : '<option value="">Nessun profilo salvato</option>';
}

// ---------- Figura ----------

const line = (a, b, cls, extra = '') => `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="${cls}" ${extra}/>`;
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const scale = () => 400 / (1.1 * state.height / 100);

function drawSide(R) {
  const E = ex(), H = state.height / 100, S = scale();
  const px = p => ({ x: 190 + p.x * S, y: 440 - p.y * S });
  const P = R.P, q = {};
  for (const k of ['ankle', 'heel', 'toe', 'mid', 'knee', 'hip', 'lumbar', 'shoulder', 'headTop', 'bar']) q[k] = px(P[k]);
  if (P.elbow) q.elbow = px(P.elbow);

  const ref = (R.refKg ?? state.mass + state.load) * G * 0.2 * H;
  const level = {};
  for (const j of R.joints) level[j.id] = clamp(j.moment / ref, 0, 1);

  // Fascia muscolare parallela a un segmento (dist > 0: davanti per l'arto inferiore, dietro per il tronco)
  const band = (a, b, t0, t1, dist, w, id, k = 1) => {
    if (level[id] === undefined) return '';
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const nx = dy / len * dist, ny = -dx / len * dist;
    const s = mix(a, b, t0), e = mix(a, b, t1);
    return `<line x1="${(s.x + nx).toFixed(1)}" y1="${(s.y + ny).toFixed(1)}" x2="${(e.x + nx).toFixed(1)}" y2="${(e.y + ny).toFixed(1)}" class="f-muscle" stroke="${JOINTS[id].color}" stroke-width="${w}" opacity="${(0.1 + 0.8 * level[id] * k).toFixed(2)}"/>`;
  };

  // Inquadratura: segue il punto più alto, così in basso la figura si ingrandisce
  const fr = R.frame;
  const vx = fr ? 190 + fr.x0 * S : 60, vw = fr ? (fr.x1 - fr.x0) * S : 300;
  const highest = Math.min(q.bar.y - (R.noPlates ? 10 : 0.225 * S), ...Object.values(q).map(p => p.y));
  const top = Math.min(highest - 12, 462 - (fr ? vw * 0.6 : 250));
  let o = `<svg viewBox="${vx.toFixed(1)} ${top.toFixed(1)} ${vw.toFixed(1)} ${(462 - top).toFixed(1)}" role="img" aria-label="${E.aria}">`;
  o += line({ x: vx + 8, y: 440 }, { x: vx + vw - 8, y: 440 }, 'f-floor');
  for (const r of R.props || []) {
    const a = px({ x: r.x, y: r.y + r.h });
    o += `<rect x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" width="${(r.w * S).toFixed(1)}" height="${(r.h * S).toFixed(1)}" rx="3" class="f-prop"/>`;
  }

  // Linea di gravità del bilanciere, reazioni degli appoggi, punto di appoggio
  o += line(q.bar, { x: q.bar.x, y: R.loadUp ? top + 2 : 440 }, 'f-load');
  for (const f of R.forces || []) {
    const a = px(f), b = { x: a.x, y: Math.min(a.y - 0.3 * S, top + 40) };
    o += line(a, b, 'f-react');
    o += `<path d="M${a.x - 5} ${b.y + 9} L${a.x} ${b.y} L${a.x + 5} ${b.y + 9}" class="f-react" fill="none"/>`;
    o += `<text x="${a.x}" y="${b.y - 5}" text-anchor="middle" class="f-note">${f.label}</text>`;
  }
  if (R.cop !== null) {
    const cx = R.cop === undefined ? q.mid.x : 190 + R.cop * S;
    o += `<path d="M${cx - 6} 452 L${cx + 6} 452 L${cx} 442 Z" fill="var(--dim)"/>`;
    o += `<text x="${cx}" y="459" text-anchor="middle" class="f-note" style="font-size:8.5px">${E.copLabel}</text>`;
  }

  // Muscoli
  o += band(q.hip, q.knee, 0.12, 0.9, 11, 8, 'knee');              // quadricipite
  o += band(q.hip, q.knee, 0.15, 0.9, -11, 7, 'hip', E.hamK);      // ischiocrurali
  o += band(q.hip, q.knee, -0.04, 0.26, -14, 15, 'hip');           // grande gluteo
  o += band(q.knee, q.ankle, 0.06, 0.6, -10, 8, 'ankle');          // tricipite surale
  o += band(q.hip, q.shoulder, 0.14, 0.86, 10, 7, 'lumbar');       // erettori spinali
  o += band(q.hip, q.shoulder, 0.45, 0.9, -10, 7, 'shoulder');     // gran dorsale
  o += band(q.hip, q.shoulder, E.pull ? 0.4 : 0.62, 0.96, E.pull ? 18 : -11, 9, 'shoulderA'); // gran pettorale davanti, gran dorsale dietro
  if (q.elbow) o += band(q.shoulder, q.elbow, 0.1, 0.9, -8, 7, 'elbow'); // tricipite brachiale
  if (level.shoulderF !== undefined) {
    o += `<circle cx="${q.shoulder.x.toFixed(1)}" cy="${q.shoulder.y.toFixed(1)}" r="13" fill="${JOINTS.shoulderF.color}" opacity="${(0.1 + 0.6 * level.shoulderF).toFixed(2)}"/>`; // deltoide anteriore
  }

  if (!R.noPlates) o += `<circle cx="${q.bar.x.toFixed(1)}" cy="${q.bar.y.toFixed(1)}" r="${(0.225 * S).toFixed(1)}" class="f-plate"/>`;

  // Scheletro
  o += `<path d="M${q.heel.x} ${q.heel.y} L${q.toe.x} ${q.toe.y} L${q.ankle.x} ${q.ankle.y} Z" class="f-foot"/>`;
  o += line(q.ankle, q.knee, 'f-bone') + line(q.knee, q.hip, 'f-bone') + line(q.hip, q.shoulder, 'f-bone');
  o += line(q.shoulder, mix(q.shoulder, q.headTop, 0.42), 'f-bone', 'style="stroke-width:5"');
  const hc = mix(q.shoulder, q.headTop, 0.7);
  o += `<circle cx="${hc.x.toFixed(1)}" cy="${hc.y.toFixed(1)}" r="${(0.055 * H * S).toFixed(1)}" class="f-head"/>`;
  const solid = 'style="stroke-width:4.5;opacity:.8"';
  if (q.elbow && P.armSolid) o += line(q.shoulder, q.elbow, 'f-bone', solid) + line(q.elbow, q.bar, 'f-bone', solid);
  else if (q.elbow) o += line(q.shoulder, q.elbow, 'f-arm') + line(q.elbow, q.bar, 'f-arm');
  else o += line(q.shoulder, q.bar, 'f-bone', solid);
  o += `<circle cx="${q.bar.x.toFixed(1)}" cy="${q.bar.y.toFixed(1)}" r="6" class="f-bar"/>`;

  // Bracci di leva: distanza orizzontale tra articolazione e linea della forza
  const sel = state.sel;
  for (const j of R.joints) {
    if (j.noLever) continue;
    if ((j.id === 'lumbar' || j.id === 'shoulder') && sel !== j.id) continue;
    if (j.id === 'hip' && sel === 'lumbar') continue;
    const a = px(j.p), c = JOINTS[j.id].color;
    const b = { x: j.leverX === undefined ? q.bar.x : 190 + j.leverX * S, y: a.y };
    o += line(a, b, 'f-lever' + (j.id === sel ? ' sel' : ''), `stroke="${c}"`);
    const txt = fmt(Math.abs(j.barArm) * 100) + ' cm';
    if (j.id === 'ankle') o += `<text x="${Math.max(a.x, b.x) + 8}" y="${a.y + 4}" fill="${c}" class="f-label">${txt}</text>`;
    else o += `<text x="${(a.x + b.x) / 2}" y="${j.id === 'hip' || j.id === 'elbow' ? a.y + 17 : a.y - 8}" text-anchor="middle" fill="${c}" class="f-label">${txt}</text>`;
  }

  // Articolazione selezionata: baricentro di tutto ciò che sostiene
  const sj = R.joints.find(j => j.id === sel);
  if (sj && sj.supported) {
    const s = px(sj.supported), a = px(sj.p), c = JOINTS[sj.id].color;
    o += line(s, { x: s.x, y: Math.max(a.y, s.y) }, 'f-cline', `stroke="${c}"`);
    o += `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="5" class="f-com" style="stroke:${c}"/>`;
    o += line({ x: s.x - 5, y: s.y }, { x: s.x + 5, y: s.y }, '', `stroke="${c}" stroke-width="1.5"`);
    o += line({ x: s.x, y: s.y - 5 }, { x: s.x, y: s.y + 5 }, '', `stroke="${c}" stroke-width="1.5"`);
    const right = s.x < 215;
    o += `<text x="${s.x + (right ? 9 : -9)}" y="${s.y - 6}" text-anchor="${right ? 'start' : 'end'}" class="f-note">baricentro del carico sostenuto</text>`;
  }

  for (const j of R.joints) {
    if (j.noPivot) continue;
    const p = px(j.p), small = j.id === 'lumbar' || j.id === 'shoulder';
    o += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${j.id === sel ? 7.5 : small ? 4 : 6}" fill="${JOINTS[j.id].color}" class="f-pivot"/>`;
  }
  return o + '</svg>';
}

// Vista frontale delle spinte: presa, apertura dei gomiti, braccio di leva laterale
function drawArmsFront(R) {
  const H = state.height / 100, S = scale(), F = R.front, P = R.P;
  const Y = y => 440 - y * S, X = z => 210 + z * S;
  const yb = Y(P.bar.y), yl = R.yLock === undefined ? yb : Y(R.yLock), shY = Y(P.S.y), elY = Y(P.elbow.y);
  const bench = F.mode === 'bench';
  const top = Math.min(Math.min(yl - (R.noPlates ? 0 : 0.225 * S), bench ? shY : Y(P.headTop.y)) - 14, 462 - 250);
  let o = `<svg viewBox="60 ${top.toFixed(1)} 300 ${(462 - top).toFixed(1)}" role="img" aria-label="Figura vista di fronte con larghezza della presa">`;
  o += line({ x: 62, y: 440 }, { x: 358, y: 440 }, 'f-floor');
  if (R.yLock !== undefined) {
    o += line({ x: 70, y: yl }, { x: 350, y: yl }, 'f-load');
    o += `<text x="350" y="${yl - 5}" text-anchor="end" class="f-note">arrivo · corsa ${fmt(R.rom * 100)} cm</text>`;
  }

  if (bench) {
    const by = Y(F.benchH);
    o += `<rect x="${X(-0.15).toFixed(1)}" y="${by.toFixed(1)}" width="${(0.3 * S).toFixed(1)}" height="${(0.07 * S).toFixed(1)}" rx="3" class="f-prop"/>`;
    o += `<rect x="${X(-0.025).toFixed(1)}" y="${(by + 0.07 * S).toFixed(1)}" width="${(0.05 * S).toFixed(1)}" height="${(440 - by - 0.07 * S).toFixed(1)}" class="f-prop"/>`;
    o += `<ellipse cx="210" cy="${(shY + 0.01 * S).toFixed(1)}" rx="${(F.shoulder * 1.25 * S).toFixed(1)}" ry="${(0.1 * S).toFixed(1)}" class="f-head"/>`;
    o += `<circle cx="210" cy="${(shY - 0.01 * S).toFixed(1)}" r="${(0.055 * H * S).toFixed(1)}" class="f-head" style="fill:var(--bg)"/>`;
  } else {
    const hipY = Y(P.hip.y), hc = Y(P.headTop.y - 0.3 * PROP.head * H);
    const footY = F.footY === undefined ? 440 : Y(F.footY);
    if (F.seat !== undefined) o += `<rect x="${X(-0.2).toFixed(1)}" y="${Y(F.seat + 0.06).toFixed(1)}" width="${(0.4 * S).toFixed(1)}" height="${(0.06 * S).toFixed(1)}" rx="3" class="f-prop"/>`;
    for (const s of [-1, 1]) o += line({ x: X(s * F.hip), y: hipY }, { x: X(s * F.hip * 1.4), y: footY }, 'f-bone');
    o += line({ x: X(-F.hip), y: hipY }, { x: X(F.hip), y: hipY }, 'f-bone');
    o += line({ x: 210, y: hipY }, { x: 210, y: shY }, 'f-bone');
    o += `<circle cx="210" cy="${hc.toFixed(1)}" r="${(0.055 * H * S).toFixed(1)}" class="f-head"/>`;
  }

  if (!R.noPlates) for (const s of [-1, 1]) {
    const x0 = X(s * 0.655), x1 = X(s * 0.715);
    o += `<rect x="${Math.min(x0, x1).toFixed(1)}" y="${(yb - 0.225 * S).toFixed(1)}" width="${Math.abs(x1 - x0).toFixed(1)}" height="${(0.45 * S).toFixed(1)}" rx="3" class="f-plate"/>`;
  }
  const half = R.noPlates ? 0.62 : 0.715;
  if (F.parallel) for (const s of [-1, 1]) {
    // Parallele viste di fronte: la sezione della sbarra e il montante
    o += `<rect x="${(X(s * F.grip) - 5).toFixed(1)}" y="${(yb - 2).toFixed(1)}" width="10" height="${(440 - yb + 2).toFixed(1)}" rx="3" class="f-prop"/>`;
    o += `<circle cx="${X(s * F.grip).toFixed(1)}" cy="${yb.toFixed(1)}" r="6" fill="var(--accent)"/>`;
  }
  else o += line({ x: X(-half), y: yb }, { x: X(half), y: yb }, '', 'stroke="var(--accent)" stroke-width="4" stroke-linecap="round"');
  o += line({ x: X(-F.shoulder), y: shY }, { x: X(F.shoulder), y: shY }, 'f-bone');
  const thin = 'style="stroke-width:4.5"';
  for (const s of [-1, 1]) {
    const sh = { x: X(s * F.shoulder), y: shY }, el = { x: X(s * F.elbow), y: elY }, hand = { x: X(s * F.grip), y: yb };
    o += line(sh, el, 'f-bone', thin) + line(el, hand, 'f-bone', thin);
    o += `<circle cx="${sh.x.toFixed(1)}" cy="${sh.y.toFixed(1)}" r="6" fill="${JOINTS.shoulderA.color}" class="f-pivot"/>`;
    o += `<circle cx="${el.x.toFixed(1)}" cy="${el.y.toFixed(1)}" r="5.5" fill="${JOINTS.elbow.color}" class="f-pivot"/>`;
  }
  // Braccio di leva laterale: dalla spalla alla verticale della mano
  const a = { x: X(F.shoulder), y: shY }, b = { x: X(F.grip), y: shY };
  o += line({ x: b.x, y: yb }, { x: b.x, y: Math.max(shY, yb) }, 'f-load');
  o += line(a, b, 'f-lever sel', `stroke="${JOINTS.shoulderA.color}"`);
  o += `<text x="${(a.x + b.x) / 2}" y="${shY + 18}" text-anchor="middle" fill="${JOINTS.shoulderA.color}" class="f-label">${fmt(Math.abs(F.grip - F.shoulder) * 100)} cm</text>`;
  o += `<text x="210" y="457" text-anchor="middle" class="f-note">presa ${fmt(F.grip * 200)} cm · spalle ${fmt(F.shoulder * 200)} cm</text>`;
  return o + '</svg>';
}

// Vista frontale: sola geometria (stance, abduzione delle cosce, corsa del bilanciere)
function drawFront(R) {
  const H = state.height / 100, S = scale(), F = R.front, P = R.P;
  const Y = y => 440 - y * S, X = z => 210 + z * S;
  const hc = mix(P.shoulder, P.headTop, 0.7);
  const top = Math.min(Math.min(Y(P.headTop.y), Y(P.bar.y) - 0.225 * S) - 12, 462 - 250);
  let o = `<svg viewBox="60 ${top.toFixed(1)} 300 ${(462 - top).toFixed(1)}" role="img" aria-label="Figura dello stacco vista di fronte">`;
  o += line({ x: 62, y: 440 }, { x: 358, y: 440 }, 'f-floor');

  // Altezza di arrivo e corsa
  const yl = Y(R.yLock), yb = Y(P.bar.y);
  o += line({ x: 70, y: yl }, { x: 350, y: yl }, 'f-load');
  o += `<text x="350" y="${yl - 5}" text-anchor="end" class="f-note">arrivo · corsa ${fmt(R.rom * 100)} cm</text>`;

  // Bilanciere e dischi
  for (const s of [-1, 1]) {
    const x0 = X(s * 0.655), x1 = X(s * 0.715);
    o += `<rect x="${Math.min(x0, x1).toFixed(1)}" y="${(yb - 0.225 * S).toFixed(1)}" width="${Math.abs(x1 - x0).toFixed(1)}" height="${(0.45 * S).toFixed(1)}" rx="3" class="f-plate"/>`;
  }
  o += line({ x: X(-0.715), y: yb }, { x: X(0.715), y: yb }, '', 'stroke="var(--accent)" stroke-width="4" stroke-linecap="round"');

  const hipY = Y(P.hip.y), shY = Y(P.shoulder.y);
  for (const s of [-1, 1]) {
    const an = { x: X(s * F.stance), y: Y(P.ankle.y) }, kn = { x: X(s * F.knee), y: Y(P.knee.y) };
    const hp = { x: X(s * F.hip), y: hipY }, sh = { x: X(s * F.shoulder), y: shY }, hand = { x: X(s * F.grip), y: yb };
    const f0 = X(s * (F.stance - 0.045)), f1 = X(s * (F.stance + 0.045 + 0.6 * F.footOut));
    o += `<path d="M${f0.toFixed(1)} 440 L${f1.toFixed(1)} 440 L${an.x.toFixed(1)} ${an.y.toFixed(1)} Z" class="f-foot"/>`;
    o += line(an, kn, 'f-bone') + line(kn, hp, 'f-bone');
    o += line(sh, hand, 'f-bone', 'style="stroke-width:4.5;opacity:.75"');
    for (const [p, id] of [[an, 'ankle'], [kn, 'knee'], [hp, 'hip'], [sh, 'shoulder']]) {
      o += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5.5" fill="${JOINTS[id].color}" class="f-pivot"/>`;
    }
  }
  o += line({ x: X(-F.hip), y: hipY }, { x: X(F.hip), y: hipY }, 'f-bone');
  o += line({ x: 210, y: hipY }, { x: 210, y: shY }, 'f-bone');
  o += line({ x: X(-F.shoulder), y: shY }, { x: X(F.shoulder), y: shY }, 'f-bone');
  o += `<circle cx="210" cy="${Y(hc.y).toFixed(1)}" r="${(0.055 * H * S).toFixed(1)}" class="f-head"/>`;
  o += `<text x="210" y="457" text-anchor="middle" class="f-note">stance ${fmt(F.stance * 200)} cm · di lato la coscia misura ${fmt(Math.hypot(P.hip.x - P.knee.x, P.hip.y - P.knee.y) * 100)} cm su ${fmt(state.thigh)}</text>`;
  return o + '</svg>';
}

// ---------- Pannelli ----------

function drawJoints(R) {
  const ref = (R.refKg ?? state.mass + state.load) * G * 0.2 * state.height / 100;
  $('joints').innerHTML = R.joints.map(j => {
    const J = JOINTS[j.id];
    let act = 'richiesta: ' + (j.moment > 0 ? (j.pos || J.pos) : (j.neg || J.neg));
    if (j.id === 'knee' && j.moment < 0 && R.angles.knee < 8) act = 'nessuna richiesta: ginocchio in blocco sulle strutture passive';
    if (j.id === 'elbow' && j.moment < 0 && R.angles.elbow < 12 && !ex().pull) act = 'nessuna richiesta: gomito in blocco';
    if (j.id === 'elbow' && ex().pull && R.angles.elbow < 12) act = 'braccio disteso: momento non significativo';
    if (Math.abs(j.moment) < 3) act = 'momento trascurabile';
    return `<button type="button" class="joint${j.id === state.sel ? ' on' : ''}" data-j="${j.id}" style="--c:${J.color}" aria-pressed="${j.id === state.sel}">
      <span class="head"><span class="name">${j.label || J.name}<span class="act">${act}</span></span>
      <span class="nm">${fmt(Math.abs(j.moment))} <small>N·m</small></span></span>
      <div class="meta">${j.armLabel || 'braccio bilanciere'} ${fmt(Math.abs(j.barArm) * 100, 1)} cm · braccio effettivo ${fmt(Math.abs(j.arm) * 100, 1)} cm · ${fmt(Math.abs(j.moment) / state.mass, 2)} N·m/kg</div>
      <div class="meter"><i style="width:${(clamp(Math.abs(j.moment) / ref, 0, 1) * 100).toFixed(0)}%"></i></div>
    </button>`;
  }).join('');
}

function drawReadouts(R) {
  $('angles').innerHTML = ex().readouts(R).map(([v, n, d]) => `<div><b>${v}</b>${n}<br>${d}</div>`).join('');
  const msg = ex().warn(R);
  $('warn').hidden = !msg;
  $('warn').textContent = msg;
}

function drawMuscles(R) {
  const by = Object.fromEntries(R.joints.map(j => [j.id, j]));
  const legs = by.hip && by.knee && by.ankle ? ['hip', 'knee', 'ankle'] : [];
  const tot = legs.reduce((s, id) => s + Math.max(0, by[id].moment), 0) || 1;
  const value = id => legs.includes(id) ? fmt(Math.max(0, by[id].moment) / tot * 100) + ' %' : fmt(Math.max(0, by[id].moment)) + ' N·m';
  $('muscles').innerHTML =
    `<p class="hint">${ex().muscleHint || 'Ripartizione del momento estensorio tra anca, ginocchio e caviglia nella posizione mostrata. È una richiesta meccanica calcolata dal modello, non un\'attivazione misurata.'}</p>` +
    ex().muscles.filter(([id]) => by[id] || (id === state.pvar && state.ex === 'press')).map(([id, t, txt]) => {
      const intro = !by[id];
      return `<div class="mgroup" style="--c:${intro ? 'var(--accent)' : JOINTS[id].color}"><div class="t"><span>${t}</span><span>${intro ? '' : value(id)}</span></div><p>${txt}</p></div>`;
    }).join('');
}

function drawSources() {
  const E = ex();
  const notes = [
    ...E.notes.slice(0, 2),
    'Masse e baricentri dei segmenti dalle tabelle di de Leva<sup>1</sup>; lunghezze iniziali dalle proporzioni di Drillis e Contini<sup>2</sup>.',
    'Momento su un\'articolazione = peso di tutto ciò che sta sopra × distanza orizzontale del suo baricentro (braccio effettivo). Il «braccio bilanciere» considera solo il bilanciere.',
    'Calcolo quasi-statico: niente accelerazioni, quindi i valori sottostimano i picchi di un\'esecuzione veloce.',
    ...E.notes.slice(2),
    'Le barre sono in scala rispetto a un momento di riferimento pari a peso totale × 20 % della statura.'
  ];
  $('sources').innerHTML = `
    <h3 style="margin-top:0">Cosa calcola il modello</h3>
    <ul>${notes.map(n => `<li>${n}</li>`).join('')}</ul>
    <h3>Fonti</h3>
    <ol>${[...COMMON_SOURCES, ...E.sources].map(s => `<li>${s}</li>`).join('')}</ol>`;
}

function render() {
  const R = ex().solve(state);
  if (!R.joints.some(j => j.id === state.sel)) state.sel = R.joints[0].id;
  $('view').hidden = !R.front;
  if (!R.front) state.view = 'side';
  $('figure').innerHTML = state.view === 'front' && R.front ? (R.front.mode ? drawArmsFront(R) : drawFront(R)) : drawSide(R);
  drawReadouts(R);
  drawJoints(R);
  drawMuscles(R);
  syncControls();
  store.set('leve.state', state);
}

// ---------- Eventi ----------

function init() {
  buildRows($('body'), BODY_ROWS);
  $('presets').innerHTML = PRESETS.map((p, i) => `<button type="button" data-p="${i}">${p.name}</button>`).join('');
  buildProfiles();
  buildExercise();

  $('exercises').addEventListener('click', e => {
    const id = e.target.dataset.ex;
    if (!id || !EX[id] || id === state.ex) return;
    stop();
    state.ex = id;
    state.phase = 1;
    if (EX[id].onEnter) EX[id].onEnter();
    buildExercise();
    render();
  });
  $('variant').addEventListener('click', e => {
    const v = e.target.dataset.v;
    if (!v) return;
    state[ex().vkey] = v;
    ex().onVariant(v);
    buildRows($('technique'), techRows());
    render();
  });
  $('view').addEventListener('click', e => { const v = e.target.dataset.v; if (v) { state.view = v; render(); } });
  $('sex').addEventListener('click', e => { const v = e.target.dataset.v; if (v) { state.sex = v; render(); } });
  $('joints').addEventListener('click', e => { const b = e.target.closest('[data-j]'); if (b) { state.sel = b.dataset.j; render(); } });
  $('phase').addEventListener('input', e => { stop(); state.phase = e.target.value / 100; render(); });
  $('presets').addEventListener('click', e => {
    const p = PRESETS[e.target.dataset.p];
    if (!p) return;
    for (const k of ['thigh', 'shank', 'trunk', 'arm']) state[k] = Math.round(p[k] * state.height * 10) / 10;
    render();
  });

  $('profileSave').addEventListener('click', () => {
    const name = (prompt('Nome del profilo') || '').trim();
    if (!name) return;
    const p = { name };
    for (const k of BODY_KEYS) p[k] = state[k];
    profiles = profiles.filter(x => x.name !== name).concat(p);
    store.set('leve.profiles', profiles);
    buildProfiles();
    $('profileList').value = profiles.length - 1;
  });
  $('profileLoad').addEventListener('click', () => {
    const p = profiles[$('profileList').value];
    if (!p) return;
    for (const k of BODY_KEYS) if (p[k] !== undefined) state[k] = p[k];
    render();
  });
  $('profileDel').addEventListener('click', () => {
    const i = $('profileList').value, p = profiles[i];
    if (!p || !confirm(`Eliminare il profilo «${p.name}»?`)) return;
    profiles.splice(i, 1);
    store.set('leve.profiles', profiles);
    buildProfiles();
  });

  $('play').addEventListener('click', () => (raf ? stop() : play()));
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

let raf = 0;
function play() {
  const t0 = performance.now(), dur = 4000;
  $('play').textContent = '■';
  const tick = t => {
    const k = (t - t0) / dur;
    state.phase = k >= 1 ? 1 : 0.5 + 0.5 * Math.cos(2 * Math.PI * k);
    render();
    if (k >= 1) stop(); else raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  $('play').textContent = '▶';
}

init();
