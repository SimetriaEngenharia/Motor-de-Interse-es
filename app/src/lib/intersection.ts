import { fitLineArc } from "./geomExtract";

export const dist2 = (a: {x: number, y: number}, b: {x: number, y: number}) => (a.x - b.x)**2 + (a.y - b.y)**2;
export const add = (a: {x: number, y: number}, b: {x: number, y: number}) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: {x: number, y: number}, b: {x: number, y: number}) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: {x: number, y: number}, s: number) => ({ x: a.x * s, y: a.y * s });
export const getDir = (a: {x: number, y: number}, b: {x: number, y: number}) => {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx/len, y: dy/len };
};

export const closestPointOnSegment = (p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) => {
  const l2 = dist2(v, w);
  if (l2 === 0) return v;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
};

export const intersectLines = (p1: {x: number, y: number}, d1: {x: number, y: number}, p2: {x: number, y: number}, d2: {x: number, y: number}) => {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-6) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / cross;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
};

export const solveFillet = (V: {x: number, y: number}, d1: {x: number, y: number}, d2: {x: number, y: number}, R: number) => {
  const dotP = d1.x * d2.x + d1.y * d2.y;
  let alpha = Math.acos(Math.max(-1, Math.min(1, dotP)));
  if (alpha < 0.01 || alpha > Math.PI - 0.01) return null; 
  
  const d = R / Math.tan(alpha / 2);
  const T1 = { x: V.x + d1.x * d, y: V.y + d1.y * d };
  const T2 = { x: V.x + d2.x * d, y: V.y + d2.y * d };
  const crossP = d1.x * d2.y - d1.y * d2.x;
  const sweep = crossP > 0 ? 0 : 1;
  
  return { T1, T2, sweep, R };
};

/**
 * NARIZ TEÓRICO (NT)
 * Quando duas rodovias se cruzam, um bordo de cada uma se cruza e gera um
 * ponto de interseção: esse ponto é o NT. É o canto vivo, anterior à
 * concordância — o raio o arredonda, e por isso o NT nunca é pavimentado.
 * Um NT por par de bordos que se cruza (4 num cruzamento completo, 2 num T).
 */
export interface NarizTeorico {
  id: string;              // NT-01, NT-02…
  point: {x: number, y: number};
  armA: string;            // bordo direito deste braço
  armB: string;            // × bordo esquerdo deste braço
  raio: number;            // raio de concordância que arredonda este NT
  arredondado: boolean;    // false = canto vivo
}

/**
 * TESTE DE PAVIMENTO por hash espacial.
 * Recebe os quadriláteros das faixas do corredor e devolve uma função que diz
 * se um ponto está sobre pavimento.
 */
export const makePavementTest = (
  quads: { a: {x: number, y: number}; b: {x: number, y: number}; c: {x: number, y: number}; d: {x: number, y: number} }[],
  cell = 10,
) => {
  const grid = new Map<string, number[]>();
  const kk = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  quads.forEach((q, i) => {
    const xs = [q.a.x, q.b.x, q.c.x, q.d.x], ys = [q.a.y, q.b.y, q.c.y, q.d.y];
    const x0 = Math.floor(Math.min(...xs) / cell), x1 = Math.floor(Math.max(...xs) / cell);
    const y0 = Math.floor(Math.min(...ys) / cell), y1 = Math.floor(Math.max(...ys) / cell);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const k = `${gx},${gy}`;
      const arr = grid.get(k); if (arr) arr.push(i); else grid.set(k, [i]);
    }
  });

  const dentroPoly = (p: {x: number, y: number}, poly: {x: number, y: number}[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > p.y) !== (yj > p.y)) &&
          (p.x < (xj - xi) * (p.y - yi) / (yj - yi + 1e-18) + xi)) inside = !inside;
    }
    return inside;
  };

  return (p: {x: number, y: number}) => {
    const idx = grid.get(kk(p.x, p.y));
    if (!idx) return false;
    for (const i of idx) {
      const q = quads[i];
      if (dentroPoly(p, [q.a, q.b, q.d, q.c])) return true;
    }
    return false;
  };
};

/**
 * ABERTURA NÃO PAVIMENTADA em volta de um ponto, em graus.
 *
 * É o que separa nariz de amarração:
 *   NARIZ      — os dois bordos delimitam uma CUNHA não pavimentada (o gore).
 *                A abertura é limitada: começa e termina nos bordos.
 *   AMARRAÇÃO  — o ponto está num bordo reto; o lado de fora é um SEMIPLANO,
 *                abertura ≈ 180°. Não é cunha, não é nariz.
 */
export const aberturaCunha = (
  pav: (p: {x: number, y: number}) => boolean,
  p: {x: number, y: number},
  raios = [0.5, 1.2, 3],
  passos = 48,
): { graus: number; dir: {x: number, y: number} | null } => {
  const livre: boolean[] = [];
  for (let i = 0; i < passos; i++) {
    const a = (2 * Math.PI * i) / passos;
    let vazio = true;
    for (const r of raios) {
      if (pav({ x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) })) { vazio = false; break; }
    }
    livre.push(vazio);
  }
  let melhor = 0, atual = 0, fimMelhor = -1;
  for (let i = 0; i < passos * 2; i++) {
    if (livre[i % passos]) {
      atual++;
      if (atual > melhor) { melhor = atual; fimMelhor = i; }
    } else atual = 0;
  }
  const n = Math.min(passos, melhor);
  let dir: {x: number, y: number} | null = null;
  if (n > 0 && fimMelhor >= 0) {
    // bissetriz da cunha livre = meio do setor angular vazio
    const meio = (fimMelhor - (n - 1) / 2) % passos;
    const a = (2 * Math.PI * meio) / passos;
    dir = { x: Math.cos(a), y: Math.sin(a) };
  }
  return { graus: n * (360 / passos), dir };
};

export const aberturaNaoPavimentada = (
  pav: (p: {x: number, y: number}) => boolean,
  p: {x: number, y: number},
  raios = [0.5, 1.2, 3],
  passos = 48,
): number => aberturaCunha(pav, p, raios, passos).graus;

/** Ponto mais próximo de uma polilinha, com a distância e o índice do trecho. */
export const closestPointOnPolyline = (
  p: {x: number, y: number}, pts: {x: number, y: number}[],
): { point: {x: number, y: number}; dist: number; index: number } => {
  let best = { point: pts[0], dist: Infinity, index: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const c = closestPointOnSegment(p, pts[i], pts[i + 1]);
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < best.dist) best = { point: c, dist: d, index: i };
  }
  return best;
};

/* ─────────────────────────────────────────────────────────────────────────
 * NARIZ FÍSICO — CONSTRUÇÃO DER-SP (offset + giro)
 *
 * A receita, na ordem em que o projetista desenha:
 *   1. offset do bordo do RAMO para dentro da cunha (padrão 1,00 m);
 *   2. offset do bordo da PISTA para dentro da cunha, na LARGURA do nariz
 *      (2,00 entrada · 1,00 saída · 1,50 misto);
 *   3. onde os dois offsets se cruzam está o NARIZ FÍSICO (NF) — um "novo
 *      nariz teórico", agora entre linhas afastadas;
 *   4. quebra-se o offset do ramo em exatamente 25,00 m a partir do NF;
 *   5. gira-se esse trecho com base no NF até a ponta encostar no bordo
 *      verdadeiro do ramo. Dali em diante o bordo antigo é só sinalização.
 * ───────────────────────────────────────────────────────────────────────── */

export interface NarizFisicoGeom {
  nf: { x: number; y: number };
  /** largura do nariz: do bordo da pista até o NF */
  cap: [{ x: number; y: number }, { x: number; y: number }];
  /** novo bordo físico: offset girado, do NF até encostar no bordo verdadeiro */
  bordo: { x: number; y: number }[];
  /** segundo bordo físico para nariz de cunha/ilha (lado B) */
  bordoB?: { x: number; y: number }[];
  /** ponto onde o trecho girado encosta no bordo verdadeiro */
  q: { x: number; y: number };
  /** amarração: do MEIO do cap (largura do nariz) até o nariz teórico */
  amarra: [{ x: number; y: number }, { x: number; y: number }];
  /** bordo verdadeiro no trecho consumido pelo nariz — vira linha de
   *  sinalização (o pavimento agora vai até a linha preta) */
  sinal: { x: number; y: number }[];
  /** segunda perna da linha de sinalização — só a ponta de cunha tem duas */
  sinalB?: { x: number; y: number }[];
  giro: number;   // graus
  corda: number; larguraReal?: number;
  capOriginalLength?: number;
  /** nariz de ponta de cunha: construído por largura sobre as linhas pretas,
   *  sem pista e sem giro. O desenho é só o cap — as linhas pretas de base já
   *  são desenhadas pelos narizes vizinhos, aparadas por este. */
  gore?: boolean;
}

/** Offset de polilinha para o lado apontado por `ref`.
 *  O lado é resolvido UMA vez (na tangente do vértice de referência) e o
 *  sinal é propagado: decidir por vértice inverte o offset em curvas que
 *  giram mais de 90° e faz a linha se cruzar. */
export const polylineOffset = (
  pts: { x: number; y: number }[], dist: number, ref: { x: number; y: number }, refIdx = 0,
): { x: number; y: number }[] => {
  const tanEm = (i: number) => getDir(
    pts[Math.max(0, i - 1)], pts[Math.min(pts.length - 1, i + 1)],
  );
  const i0 = Math.min(Math.max(refIdx, 0), pts.length - 1);
  const t0 = tanEm(i0);
  const lado = (t0.x * ref.y - t0.y * ref.x) >= 0 ? 1 : -1;
  return pts.map((p, i) => {
    const t = tanEm(i);
    return { x: p.x - t.y * lado * dist, y: p.y + t.x * lado * dist };
  });
};

/** Anda `s` metros por uma polilinha a partir do índice i0, no sentido dir.
 *  Caminhada robusta e bidirecional a partir de qualquer índice. */
const andar = (pts: { x: number; y: number }[], i0: number, dir: 1 | -1, s: number): { x: number; y: number } => {
  let i = Math.min(Math.max(i0, 0), pts.length - 1);
  let acc = 0;
  while (true) {
    const j = i + dir;
    if (j < 0 || j >= pts.length) return pts[i];
    const a = pts[i], b = pts[j];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + len >= s) {
      const t = len > 1e-9 ? (s - acc) / len : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += len;
    i = j;
  }
};

/** Primeira interseção entre duas polilinhas, a mais próxima de `perto`. */
export const interPolilinhas = (
  A: { x: number; y: number }[], B: { x: number; y: number }[], perto: { x: number; y: number },
): { x: number; y: number } | null => {
  let best: { x: number; y: number } | null = null, bestD = Infinity;
  for (let i = 0; i < A.length - 1; i++) {
    const p1 = A[i], p2 = A[i + 1];
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    for (let j = 0; j < B.length - 1; j++) {
      const q1 = B[j], q2 = B[j + 1];
      const d2x = q2.x - q1.x, d2y = q2.y - q1.y;
      const den = d1x * d2y - d1y * d2x;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((q1.x - p1.x) * d2y - (q1.y - p1.y) * d2x) / den;
      const u = ((q1.x - p1.x) * d1y - (q1.y - p1.y) * d1x) / den;
      if (t < -1e-5 || t > 1 + 1e-5 || u < -1e-5 || u > 1 + 1e-5) continue;
      const X = { x: p1.x + t * d1x, y: p1.y + t * d1y };
      const d = (X.x - perto.x) ** 2 + (X.y - perto.y) ** 2;
      if (d < bestD) { bestD = d; best = X; }
    }
  }
  return best;
};

/** Corta `linha` no PRIMEIRO ponto em que ela cruza `obst` (mantém o começo). */
const cortarNoPrimeiro = (
  linha: { x: number; y: number }[], obst: { x: number; y: number }[],
): { x: number; y: number }[] => {
  if (linha.length < 2 || obst.length < 2) return linha;
  for (let i = 0; i < linha.length - 1; i++) {
    const p1 = linha[i], p2 = linha[i + 1];
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    let best: { x: number; y: number; t: number } | null = null;
    for (let j = 0; j < obst.length - 1; j++) {
      const q1 = obst[j], q2 = obst[j + 1];
      const d2x = q2.x - q1.x, d2y = q2.y - q1.y;
      const den = d1x * d2y - d1y * d2x;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((q1.x - p1.x) * d2y - (q1.y - p1.y) * d2x) / den;
      const u = ((q1.x - p1.x) * d1y - (q1.y - p1.y) * d1x) / den;
      if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) continue;
      if (!best || t < best.t) best = { x: p1.x + t * d1x, y: p1.y + t * d1y, t };
    }
    if (best) return [...linha.slice(0, i + 1), { x: best.x, y: best.y }];
  }
  return linha;
};

/* Motivo da última recusa geométrica — lido por narizFisicoCached logo após a
 * chamada, para que a UI possa dizer POR QUE em vez de mostrar nada. */
let __ultimaRecusa: string | null = null;
export const ultimaRecusaNariz = () => __ultimaRecusa;

/* ── NARIZ DE PONTA DE CUNHA (gore) — construção POR LARGURA ──────────────
 *
 * Offset+giro pressupõe uma PISTA de onde o ramo se afasta. Na ponta de uma
 * cunha entre dois ramos não existe pista: os dois braços são bordos de
 * quadrante que convergem num ápice. Ali a construção degenera — a normal da
 * cunha é indefinida, o sentido é escolhido por ruído e a ponta colapsa.
 *
 * A construção certa não precisa de pista nenhuma: as duas LINHAS PRETAS já
 * desenhadas são a base. Recua-se do ápice até a seção em que o vão entre elas
 * vale exatamente a largura nominal do nariz, planta-se o cap ali, e as duas
 * sobras que seguiriam até o ápice são cortadas. O nariz passa a ser *onde a
 * cunha atinge a largura mínima*, truncada.
 *
 * Vale para raio curto e longo igualmente: não há giro para degenerar. */

type Pt2 = { x: number; y: number };

/** Distância de P à polilinha, com o pé da perpendicular. */
const peNaPolilinha = (P: Pt2, poly: Pt2[]): { pt: Pt2; dist: number; index: number } => {
  let melhor = { pt: poly[0], dist: Infinity, index: 0 };
  for (let k = 0; k < poly.length - 1; k++) {
    const A = poly[k], B = poly[k + 1];
    const vx = B.x - A.x, vy = B.y - A.y;
    const L2 = vx * vx + vy * vy;
    let t = L2 > 1e-18 ? ((P.x - A.x) * vx + (P.y - A.y) * vy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const q = { x: A.x + vx * t, y: A.y + vy * t };
    const d = Math.hypot(P.x - q.x, P.y - q.y);
    if (d < melhor.dist) melhor = { pt: q, dist: d, index: t > 0.5 ? k + 1 : k };
  }
  return melhor;
};

/** Apara `poly` no ponto `pt` (que está no índice `idx`), descartando o lado do
 *  ápice. `dirFora` = +1 se o ápice está no início da polilinha. */
const apararNoPonto = (poly: Pt2[], pt: Pt2, idx: number, dirFora: 1 | -1): Pt2[] => {
  if (dirFora === 1) {
    const tail = poly.slice(Math.min(idx + 1, poly.length));
    return [pt, ...tail.filter((p) => Math.hypot(p.x - pt.x, p.y - pt.y) > 1e-4)];
  } else {
    const head = poly.slice(0, Math.max(idx + 1, 1));
    return [pt, ...head.reverse().filter((p) => Math.hypot(p.x - pt.x, p.y - pt.y) > 1e-4)];
  }
};

/** Caminhada correta nos DOIS sentidos, inclusive a partir das pontas.
 *  Usada pela construção do gore, que depende disso para achar de que lado a
 *  cunha abre. Deliberadamente separada de `andar` — ver a nota lá. */
const andarSeguro = (pts: Pt2[], i0: number, dir: 1 | -1, s: number): Pt2 => {
  let i = Math.min(Math.max(i0, 0), pts.length - 1);
  let acc = 0;
  while (true) {
    const j = i + dir;
    if (j < 0 || j >= pts.length) return pts[i];
    const a = pts[i], b = pts[j];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + len >= s) {
      const t = len > 1e-9 ? (s - acc) / len : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += len;
    i = j;
  }
};

export const narizGorePorLargura = (
  V: Pt2,            // nariz teórico (junto ao ápice)
  A: Pt2[],          // primeira linha preta
  B: Pt2[],          // segunda linha preta
  largura: number,   // largura nominal do nariz [m]
  alcance = 80,      // até onde recuar procurando o vão [m]
  /** ponto do qual o lado de trabalho deve se AFASTAR (o nariz teórico).
   *  Quando as duas linhas se CRUZAM — e não apenas convergem num bico — o vão
   *  abre nos dois sentidos e "o lado que abre mais rápido" é critério
   *  arbitrário: cada nariz escolhe um e as linhas pretas saem cruzando o
   *  pavimento. Com esta referência o lado é o que sobe o ramo, afastando-se
   *  da interseção. */
  afastarDe?: Pt2 | null,
): {
  nf: Pt2; cap: [Pt2, Pt2]; aparadaA: Pt2[]; aparadaB: Pt2[];
  dirA: 1 | -1; dirB: 1 | -1; recuo: number;
} | null => {
  if (!A || A.length < 2 || !B || B.length < 2) {
    __ultimaRecusa = "linhas de base sem geometria";
    return null;
  }
  const iA = peNaPolilinha(V, A).index;

  /* Sentido em que a cunha ABRE. O ápice é onde o vão vai a zero, então o lado
   * de trabalho é o que se afasta dele. Testar a uma distância proporcional à
   * largura pedida: perto do ápice os dois lados são indistinguíveis. */
  const vao = (p: Pt2) => peNaPolilinha(p, B).dist;
  const sonda = Math.max(4, largura * 3);
  const pF = andarSeguro(A, iA, 1, sonda);
  const pB = andarSeguro(A, iA, -1, sonda);
  const dirA: 1 | -1 = vao(pF) >= vao(pB) ? 1 : -1;

  /* Recuo até o vão valer a largura pedida. Varredura grossa para achar o
   * segmento e bisseção para cair EXATO na largura: um passo fixo deixa o cap
   * alguns centímetros fora, e a largura do nariz é cota de projeto. */
  const PASSO = 0.10;
  let sLo = -1, sHi = -1, vaoMax = 0;
  let distPrev = vao(andarSeguro(A, iA, dirA, 0));
  let cruzou = false;

  for (let s = 0; s <= alcance; s += PASSO) {
    const d = vao(andarSeguro(A, iA, dirA, s));
    if (d > vaoMax) vaoMax = d;
    if (d > distPrev + 1e-4) cruzou = true;
    if (cruzou && d >= largura) { sHi = s; sLo = Math.max(0, s - PASSO); break; }
    distPrev = d;
  }
  
  if (sHi < 0) {
    __ultimaRecusa = `as linhas de base não abrem ${largura.toFixed(2)} m `
      + `em ${alcance} m (vão máximo ${vaoMax.toFixed(2)} m)`;
    return null;
  }
  // Remove the sHi < 1e-9 check because if it crossed and grew to `largura`, it's a valid cutoff.
  for (let it = 0; it < 40; it++) {
    const m = (sLo + sHi) / 2;
    if (vao(andarSeguro(A, iA, dirA, m)) >= largura) sHi = m; else sLo = m;
    if (sHi - sLo < 1e-5) break;
  }
  const recuo = sHi;
  const achou = andarSeguro(A, iA, dirA, recuo);

  const a = achou;
  const peB = peNaPolilinha(a, B);
  const b = peB.pt;

  /* Sentido de abertura na linha B, medido a partir do pé — a orientação de B
   * não tem relação com a de A. */
  const iB = peB.index;
  const vaoA = (p: Pt2) => peNaPolilinha(p, A).dist;
  const bF = vaoA(andarSeguro(B, iB, 1, sonda));
  const bB = vaoA(andarSeguro(B, iB, -1, sonda));
  const dirB: 1 | -1 = bF >= bB ? 1 : -1;

  const iAfinal = peNaPolilinha(a, A).index;
  return {
    nf: a,
    cap: [b, a],
    aparadaA: apararNoPonto(A, a, iAfinal, dirA),
    aparadaB: apararNoPonto(B, b, iB, dirB),
    dirA, dirB, recuo,
  };
};

/** Extrai o trecho da polilinha entre dois pontos pStart e pEnd projetados sobre ela */
export const trechoPolyline = (poly: Pt2[], pStart: Pt2, pEnd: Pt2): Pt2[] => {
  if (!poly || poly.length < 2) return [pStart, pEnd];
  const pe0 = peNaPolilinha(pStart, poly);
  const pe1 = peNaPolilinha(pEnd, poly);
  let res: Pt2[];
  if (pe0.index <= pe1.index) {
    res = [pStart, ...poly.slice(pe0.index + 1, pe1.index + 1), pEnd];
  } else {
    const sub = poly.slice(pe1.index + 1, pe0.index + 1).reverse();
    res = [pStart, ...sub, pEnd];
  }
  const clean: Pt2[] = [];
  for (const p of res) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const prev = clean[clean.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1e-4) continue;
    clean.push({ x: p.x, y: p.y });
  }
  return clean.length >= 2 ? clean : [pStart, pEnd];
};

/** Constrói o bordo físico (linha preta) ao longo de um ramo:
 *  - Afastamento de 1,00 m (ou offset configurado)
 *  - Extensão regulamentar de 25,00 m (ou comp configurado)
 *  - Transição suave (taper/giro) até encontrar o bordo verdadeiro aos 25m */
export const construirPernaFisica = (
  nf: Pt2,
  ptsRamo: Pt2[],
  offRamo: Pt2[],
  dirRamo: 1 | -1,
  comprimento: number,
  modoTransicao: 'continuo' | 'taper' | 'auto' | 'uniforme' = 'auto',
  ptsObstaculo?: Pt2[],
): { bordo: Pt2[]; q: Pt2; giro: number; corda: number } => {
  const passo = 0.5;
  const compEff = Math.max(comprimento, 2.0);
  const L = modoTransicao === 'continuo' ? 400 : compEff;
  const iNF = peNaPolilinha(nf, offRamo).index;
  const trecho: Pt2[] = [];
  for (let s = 0; s <= L + 1e-6; s += passo) {
    trecho.push(andarSeguro(offRamo, iNF, dirRamo, s));
  }
  if (trecho.length < 2) return { bordo: [nf], q: nf, giro: 0, corda: 0 };

  // Ancoragem milimétrica no ponto NF
  const dx0 = nf.x - trecho[0].x, dy0 = nf.y - trecho[0].y;
  for (const p of trecho) { p.x += dx0; p.y += dy0; }

  const E0 = trecho[trecho.length - 1];
  const corda = Math.hypot(E0.x - nf.x, E0.y - nf.y);

  let q: Pt2 | null = null;
  const iR = peNaPolilinha(nf, ptsRamo).index;
  if (modoTransicao !== 'continuo' && modoTransicao !== 'uniforme') {
    let prev = andarSeguro(ptsRamo, iR, dirRamo, 0);
    let prevD = Math.hypot(prev.x - nf.x, prev.y - nf.y);
    for (let s = passo; s <= L * 3 + 10; s += passo) {
      const p = andarSeguro(ptsRamo, iR, dirRamo, s);
      const d = Math.hypot(p.x - nf.x, p.y - nf.y);
      if (d >= corda && s > 1) {
        const t = (corda - prevD) / ((d - prevD) || 1);
        q = { x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t };
        break;
      }
      prev = p; prevD = d;
    }
  }

  if (!q) {
    const cortado = ptsObstaculo ? cortarNoPrimeiro(trecho, ptsObstaculo) : trecho;
    const fimC = cortado[cortado.length - 1];
    return { bordo: cortado, q: fimC, giro: 0, corda };
  }

  const ang = Math.atan2(q.y - nf.y, q.x - nf.x) - Math.atan2(E0.y - nf.y, E0.x - nf.x);
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const bordoGirado = trecho.map((p) => {
    const dx = p.x - nf.x, dy = p.y - nf.y;
    return { x: nf.x + dx * cos - dy * sin, y: nf.y + dx * sin + dy * cos };
  });

  const bordoCortado = ptsObstaculo ? cortarNoPrimeiro(bordoGirado, ptsObstaculo) : bordoGirado;
  if (modoTransicao === 'auto' && bordoCortado.length < bordoGirado.length) {
    const cortadoUniforme = ptsObstaculo ? cortarNoPrimeiro(trecho, ptsObstaculo) : trecho;
    const fimU = cortadoUniforme[cortadoUniforme.length - 1];
    return { bordo: cortadoUniforme, q: fimU, giro: 0, corda };
  }

  return {
    bordo: bordoCortado,
    q: bordoCortado.length === bordoGirado.length ? q : bordoCortado[bordoCortado.length - 1],
    giro: ang * 180 / Math.PI,
    corda,
  };
};

export const narizFisicoOffsetGiro = (
  V: { x: number; y: number },                 // nariz teórico
  ptsRamo: { x: number; y: number }[],         // bordo do ramo (verdadeiro)
  ptsPista: { x: number; y: number }[],        // bordo da pista principal
  dirLivre: { x: number; y: number } | null,   // bissetriz da cunha (fallback do lado)
  largura: number,                             // largura do nariz [m]
  offsetRamo = 1.0,                            // afastamento do bordo do ramo [m]
  comprimento = 25.0,                          // trecho quebrado no offset [m]
  modoTransicao: 'continuo' | 'taper' | 'auto' | 'uniforme' = 'auto',
  originalNT?: { x: number; y: number },
): NarizFisicoGeom | null => {
  if (!ptsRamo || ptsRamo.length < 2 || !ptsPista || ptsPista.length < 2) {
    __ultimaRecusa = "bordo de origem sem geometria";
    return null;
  }
  __ultimaRecusa = null;
  const wEff = Math.max(largura, 0.2);
  const offEff = Math.max(offsetRamo, 0.05);
  const compEff = Math.max(comprimento, 2.0);
  const passo = 0.5;

  /* 1. Lado da cunha: sentido do bordo do ramo que se AFASTA da pista */
  const iR = peNaPolilinha(V, ptsRamo).index;
  const sonda = Math.max(4, wEff * 3);
  const pFwd = andarSeguro(ptsRamo, iR, 1, sonda);
  const pBwd = andarSeguro(ptsRamo, iR, -1, sonda);
  const vao = (p: Pt2) => peNaPolilinha(p, ptsPista).dist;
  const dF = vao(pFwd);
  const dB = vao(pBwd);
  const dirRamo: 1 | -1 = dF >= dB ? 1 : -1;

  /* 2. Direção que aponta do bordo do ramo para dentro da cunha / canteiro */
  const pRef = andarSeguro(ptsRamo, iR, dirRamo, Math.min(8, Math.max(2, wEff * 2)));
  const peRef = peNaPolilinha(pRef, ptsPista);
  let vEntra = { x: peRef.pt.x - pRef.x, y: peRef.pt.y - pRef.y };
  const dEntra = Math.hypot(vEntra.x, vEntra.y);
  if (dEntra > 1e-5) {
    vEntra = { x: vEntra.x / dEntra, y: vEntra.y / dEntra };
  } else if (dirLivre && Math.hypot(dirLivre.x, dirLivre.y) > 1e-6) {
    vEntra = { x: dirLivre.x, y: dirLivre.y };
  }

  /* 3. Gera a polilinha com offset de 1,00 m (o refúgio do canteiro/ilha) */
  const offRamo = polylineOffset(ptsRamo, offEff, vEntra, iR);
  if (!offRamo || offRamo.length < 2) {
    __ultimaRecusa = "falha ao calcular offset do ramo";
    return null;
  }

  /* 4. Encontra sobre o offset de 1,00m a posição onde o vão até a pista é EXATAMENTE wEff (2,00 m) */
  const iOff = peNaPolilinha(V, offRamo).index;
  const alcance = 150;
  const PASSO_VARREDURA = 0.10;
  let sLo = -1, sHi = -1, vaoMax = 0;
  for (let s = 0; s <= alcance; s += PASSO_VARREDURA) {
    const ptTeste = andarSeguro(offRamo, iOff, dirRamo, s);
    const d = vao(ptTeste);
    if (d > vaoMax) vaoMax = d;
    if (d >= wEff) { sHi = s; sLo = Math.max(0, s - PASSO_VARREDURA); break; }
  }

  if (sHi < 0) {
    __ultimaRecusa = `o offset do ramo não abre ${wEff.toFixed(2)} m em ${alcance} m (vão máximo ${vaoMax.toFixed(2)} m)`;
    return null;
  }

  for (let it = 0; it < 40; it++) {
    const m = (sLo + sHi) / 2;
    if (vao(andarSeguro(offRamo, iOff, dirRamo, m)) >= wEff) sHi = m; else sLo = m;
    if (sHi - sLo < 1e-5) break;
  }

  const sNF = sHi;
  const nf = andarSeguro(offRamo, iOff, dirRamo, sNF);
  const pePista = peNaPolilinha(nf, ptsPista);
  const capPista = pePista.pt;

  const cap: [{ x: number; y: number }, { x: number; y: number }] = [capPista, nf];
  const larguraReal = Math.hypot(capPista.x - nf.x, capPista.y - nf.y);

  /* 5. Linha preta (bordo físico do refúgio): com afastamento e transição regulamentar de 25m */
  const perna = construirPernaFisica(nf, ptsRamo, offRamo, dirRamo, compEff, modoTransicao, ptsPista);

  /* Trecho do bordo VERDADEIRO consumido pelo nariz: vira linha de sinalização */
  const compBordo = (() => {
    const b = perna.bordo;
    let t = 0;
    for (let i = 1; i < b.length; i++) t += Math.hypot(b[i].x - b[i - 1].x, b[i].y - b[i - 1].y);
    return t;
  })();
  const trechoBordoAte = (P: { x: number; y: number }) => {
    let bestD = Infinity, bestS = 0;
    /* ALCANCE — a branca tem de cobrir o MESMO trecho que a preta.
     * O limite saía de compEff (25 m), mas em transição contínua a preta corre
     * o bordo inteiro; a varredura desistia antes de chegar ao fim dela e a
     * branca morria a meio da curva. Parecia linha tapada pelo pavimento;
     * era só a busca a não alcançar. Agora o alcance vem do comprimento da
     * própria preta. */
    const L = Math.max(compEff, compBordo) * 1.5 + 20;
    for (let s = 0; s <= L; s += passo) {
      const p = andarSeguro(ptsRamo, iR, dirRamo, s);
      const d = Math.hypot(p.x - P.x, p.y - P.y);
      if (d < bestD) { bestD = d; bestS = s; }
    }
    const out: { x: number; y: number }[] = [{ x: V.x, y: V.y }];
    for (let s = passo; s <= bestS + 1e-6; s += passo) out.push(andarSeguro(ptsRamo, iR, dirRamo, s));
    return out;
  };

  const meioCap = { x: (capPista.x + nf.x) / 2, y: (capPista.y + nf.y) / 2 };
  const amarra: [{ x: number; y: number }, { x: number; y: number }] = [meioCap, originalNT ? { x: originalNT.x, y: originalNT.y } : { x: V.x, y: V.y }];

  return {
    nf, cap, bordo: perna.bordo, amarra,
    sinal: trechoBordoAte(perna.bordo[perna.bordo.length - 1]),
    q: perna.q,
    giro: perna.giro,
    corda: perna.corda,
    larguraReal,
  };
};

/* Mesma construção, com JANELA local e CACHE — é o caminho que a planta e a
 * tabela de produção usam, para não divergirem e para não varrer bordos
 * inteiros (interseção de polilinhas é O(n·m)) a cada render. */
const __narizCache = new Map<string, NarizFisicoGeom | null>();
/** Motivo da recusa por assinatura de cache — senão um acerto de cache devolve
 *  null sem dizer por quê, e a UI volta a não ter explicação. */
const __narizRecusaCache = new Map<string, string | null>();
export const narizFisicoCached = (
  nt: { x: number; y: number; armA: string; armB: string; dirLivre?: { x: number; y: number } | null },
  bordos: Record<string, { x: number; y: number }[]>,
  pistaId: string | null,
  largura: number,
  offsetRamo: number,
  comprimento: number,
  modoTransicao: 'continuo' | 'taper' | 'auto' | 'uniforme' = 'auto',
  /** bordo a usar COMO pista na construção (bordo do refúgio), sem mexer em
   *  quem é ramo — o ramo continua sendo o outro braço do NT. */
  bordoPistaOverride?: string | null,
): NarizFisicoGeom | null => {
  const idPista = pistaId || nt.armB;
  const idRamo = idPista === nt.armA ? nt.armB : nt.armA;
  const idPistaGeom = bordoPistaOverride || idPista;
  const ramo = bordos[idRamo], pista = bordos[idPistaGeom];
  if (!ramo || !pista) {
    __ultimaRecusa = "bordo de origem não encontrado";
    return null;
  }
  
  let V = { x: nt.x, y: nt.y };
const prolongarLinha = (pts: {x: number, y: number}[], L: number) => {
    if (pts.length < 2) return pts;
    const dir = (a: {x: number, y: number}, b: {x: number, y: number}) => {
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
    };
    const t0 = dir(pts[1], pts[0]);
    const t1 = dir(pts[pts.length - 2], pts[pts.length - 1]);
    return [
      { x: pts[0].x + t0.x * L, y: pts[0].y + t0.y * L },
      ...pts,
      { x: pts[pts.length - 1].x + t1.x * L, y: pts[pts.length - 1].y + t1.y * L },
    ];
  };

  let ramoUsado = ramo;

  if (bordoPistaOverride) {
    ramoUsado = prolongarLinha(ramo, 30);
    const pistaProlongada = prolongarLinha(pista, 30);
    const cross = interPolilinhas(ramoUsado, pistaProlongada, V);
    if (cross) V = cross;
  }
  /* A assinatura tem de mudar quando o bordo MOVE, não só quando ganha/perde
   * pontos: com só a contagem, mexer na largura da faixa devolvia geometria em
   * cache do lugar antigo — a linha preta desenhada e o alinhamento auxiliar
   * ficavam paralelos, deslocados um do outro. */
  const assinaturaBordos = Object.keys(bordos).sort()
    .map((id) => {
      const p = bordos[id];
      const amostra = [p[0], p[p.length >> 1], p[p.length - 1]]
        .map((q) => (q ? `${q.x.toFixed(2)},${q.y.toFixed(2)}` : "-")).join("/");
      return `${id}:${p.length}:${amostra}`;
    }).join(';');
  const k = `${nt.x.toFixed(2)},${nt.y.toFixed(2)}|${idRamo}|${idPistaGeom}`
    + `|${largura}|${offsetRamo}|${comprimento}|${modoTransicao}|${assinaturaBordos}`;
  if (__narizCache.has(k)) {
    __ultimaRecusa = __narizRecusaCache.get(k) ?? null;
    return __narizCache.get(k) as NarizFisicoGeom | null;
  }
  const janela = (pts: { x: number; y: number }[]) => {
    const i = closestPointOnPolyline(V, pts).index;
    return pts.slice(Math.max(0, i - 400), Math.min(pts.length, i + 400));
  };
  let g: NarizFisicoGeom | null = null;
  try {
    g = narizFisicoOffsetGiro(
      V, janela(ramoUsado), janela(pista), nt.dirLivre || null,
      largura, offsetRamo, comprimento, modoTransicao,
      { x: nt.x, y: nt.y }
    );
  } catch (e) { g = null; }
  /* A linha preta só vale DENTRO da cunha: o primeiro bordo que ela encontrar
   * a encerra — inclusive um bordo de terceiro (a pista principal sob um
   * nariz entre dois ramos, por exemplo), que não é nenhum dos dois do par. */
  if (g && g.bordo.length > 1) {
    let linha = g.bordo;
    for (const id of Object.keys(bordos)) {
      if (id === idRamo || id === idPista || id === idPistaGeom) continue;
      const obst = janela(bordos[id]);
      if (obst.length > 1) linha = cortarNoPrimeiro(linha, obst);
    }
    if (linha.length !== g.bordo.length) {
      /* o sinal (bordo verdadeiro sob o pavimento) sombreia a linha preta:
       * encurtando uma, encurta a outra, senão a tracejada passa da ponta. */
      const fim = linha[linha.length - 1];
      let sinal = g.sinal;
      if (sinal && sinal.length > 1) {
        /* CORTE EXATO, não no vértice mais próximo.
         * Encaixar na malha da polilinha fazia o sinal colapsar num único ponto
         * quando a linha preta era cortada curta — e um ponto não se desenha,
         * então a linha branca simplesmente desaparecia. Agora corta na projeção
         * de `fim`, e o resultado nunca fica com menos de dois pontos. */
        const proj = closestPointOnPolyline(fim, sinal);
        const cabeca = sinal.slice(0, proj.index + 1);
        const ultimo = cabeca[cabeca.length - 1];
        if (!ultimo || Math.hypot(ultimo.x - proj.point.x, ultimo.y - proj.point.y) > 1e-6) {
          cabeca.push({ x: proj.point.x, y: proj.point.y });
        }
        if (cabeca.length > 1) sinal = cabeca;
      }
      g = { ...g, bordo: linha, sinal, q: fim };
    }
  }
  if (__narizCache.size > 400) { __narizCache.clear(); __narizRecusaCache.clear(); }
  __narizCache.set(k, g);
  __narizRecusaCache.set(k, g ? null : __ultimaRecusa);
  return g;
};

/**
 * NARIZ TEÓRICO — busca EXATA.
 *
 * O bordo do corredor é polilinha densificada; caçar interseção corda-a-corda
 * com tolerância perde encontros quase-tangentes — o erro da discretização
 * engole o ponto. Então cada bordo é primeiro ajustado a RETA/ARCO exatos
 * (fitLineArc) e as interseções são resolvidas analiticamente:
 *   reta × reta, reta × arco, arco × arco — tangência inclusa.
 */
export const findBordoCrossings = (
  lines: { id: string; srcId?: string; corridorId?: string; alignmentId?: string; worldPoints: {x: number, y: number}[]; exato?: any[]; aux?: boolean }[],
  tol = 1.2,
  tangTol = 0.25,
  pav?: (p: {x: number, y: number}) => boolean,
  aberturaMax = 150,
): { x: number, y: number, a: string, b: string, bordoA?: string, bordoB?: string, ordem?: number, tipo: "cruzamento" | "tangencia", ponta?: boolean, angulo?: number, abertura?: number, dirLivre?: {x: number, y: number} | null, via?: string, sugerido?: boolean, motivos?: string[] }[] => {
  const out: { x: number, y: number, a: string, b: string, bordoA?: string, bordoB?: string, ordem?: number, tipo: "cruzamento" | "tangencia", ponta?: boolean, angulo?: number, abertura?: number, dirLivre?: {x: number, y: number} | null, via?: string, sugerido?: boolean, motivos?: string[] }[] = [];
  // contadores de descarte — dizem QUAL filtro comeu um nariz que deveria existir
  const rej = { fora: 0, emenda: 0, sobreposto: 0, abertura: 0, dup: 0 };
  (findBordoCrossings as any).rej = rej;
  const key = (l: typeof lines[0]) => l.alignmentId || l.corridorId || l.id;
  const near = (X: {x: number, y: number}) =>
    out.some((o) => (o.x - X.x) ** 2 + (o.y - X.y) ** 2 < tol * tol);

  /* CUNHA ou SEMIPLANO — o critério que faltava.
   * Nariz delimita área não pavimentada em CUNHA (o gore). Se a abertura livre
   * em volta do ponto se aproxima de um semiplano, o ponto está apenas sobre um
   * bordo reto de pavimento: amarração, não nariz. */
  const abertura = (X: {x: number, y: number}) =>
    pav ? aberturaCunha(pav, X) : { graus: -1, dir: null as {x: number, y: number} | null };

  // Cada bordo vira entidades exatas. Trechos que não são reta nem arco
  // (tapers, transições) saem como POLY — não podem ser descartados: viram
  // cadeia de retas, que já é exata para o teste de interseção.
  const explode = (segs: any[]): any[] => {
    const out: any[] = [];
    for (const s of segs) {
      if (s.type === "poly" && s.pts && s.pts.length > 1) {
        for (let k = 0; k < s.pts.length - 1; k++) {
          out.push({ type: "line", p1: s.pts[k], p2: s.pts[k + 1] });
        }
      } else if (s.type === "arc" || s.type === "line") {
        out.push(s);
      }
    }
    return out;
  };

  // Fonte da geometria, em ordem de precisão:
  //   1) cadeia de offset EXATA do eixo (quando a largura é constante)
  //   2) ajuste reta/arco sobre a polilinha (reconhecimento a posteriori)
  const exatos = lines.map((l) => ({
    id: l.id, k: key(l), pts: l.worldPoints, aux: !!l.aux,
    segs: explode(l.exato && l.exato.length ? l.exato : fitLineArc(l.worldPoints, 0.05)),
  }));

  /* A cadeia exata cobre TODO o eixo, inclusive onde não existe pavimento —
   * ela é geometria, não extensão do corredor. Então todo ponto encontrado
   * tem de estar sobre as DUAS linhas realmente desenhadas; senão é fantasma
   * de prolongamento. */
  const sobreLinha = (X: {x: number, y: number}, pts: {x: number, y: number}[], lim = 2.5) => {
    if (!pts || pts.length < 2) return false;
    for (let i = 0; i < pts.length - 1; i++) {
      const c = closestPointOnSegment(X, pts[i], pts[i + 1]);
      if ((c.x - X.x) ** 2 + (c.y - X.y) ** 2 <= lim * lim) return true;
    }
    const dStart = (pts[0].x - X.x) ** 2 + (pts[0].y - X.y) ** 2;
    const dEnd = (pts[pts.length - 1].x - X.x) ** 2 + (pts[pts.length - 1].y - X.y) ** 2;
    if (dStart <= 5.0 * 5.0 || dEnd <= 5.0 * 5.0) return true;
    return false;
  };

  /** Distância de um ponto a uma polilinha. */
  const distPoly = (X: {x: number, y: number}, pts: {x: number, y: number}[]) => {
    let m = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const c = closestPointOnSegment(X, pts[i], pts[i + 1]);
      const d = (c.x - X.x) ** 2 + (c.y - X.y) ** 2;
      if (d < m) m = d;
    }
    return Math.sqrt(m);
  };

  /**
   * SOBREPOSIÇÃO — não é nariz.
   * Nariz é onde dois bordos se ENCONTRAM e se SEPARAM. Se, andando para os
   * DOIS lados do ponto, as duas linhas continuam juntas, elas não se
   * encontraram: estão sobrepostas.
   *
   * O raio precisa ser GENEROSO. Com ramo largo o gore vira uma fresta: a 3 m
   * do vértice ele ainda tem poucos centímetros e o teste confundia gore
   * estreito com sobreposição. A 8 m o gore já abriu, enquanto dois bordos
   * realmente coincidentes seguem juntos.
   */
  const sobrepostos = (
    X: {x: number, y: number}, t: {x: number, y: number},
    ptsA: {x: number, y: number}[], ptsB: {x: number, y: number}[],
    r = 8, lim = 0.35,
  ) => {
    const p1 = { x: X.x + t.x * r, y: X.y + t.y * r };
    const p2 = { x: X.x - t.x * r, y: X.y - t.y * r };
    return Math.max(distPoly(p1, ptsA), distPoly(p1, ptsB)) < lim
        && Math.max(distPoly(p2, ptsA), distPoly(p2, ptsB)) < lim;
  };

  for (let i = 0; i < exatos.length; i++) {
    for (let j = i + 1; j < exatos.length; j++) {
      const A = exatos[i], B = exatos[j];
      if (A.k === B.k) continue;                 // mesma rodovia: não conta
      for (const sa of A.segs) {
        for (const sb of B.segs) {
          for (const hit of interSeg(sa, sb, tangTol)) {
            if (near(hit.p)) continue;
            if (!sobreLinha(hit.p, A.pts) || !sobreLinha(hit.p, B.pts)) { rej.fora++; continue; }
            /* AMARRAÇÃO DE PONTA — não é nariz.
             * O bordo do quadrante é construído para TERMINAR amarrado no bordo
             * da pista: uma linha morre sobre a outra, que segue inteira.
             * Critério = quantas linhas terminam no ponto:
             *   1 termina  → amarração (a outra passa reto)  → NÃO é nariz
             *   2 terminam → dois bordos convergindo (gore)   → é nariz
             *   0 terminam → cruzamento no interior das duas  → é nariz */
            const terminaEm = (pts: {x: number, y: number}[], tol = 1.0) => {
              const a0 = pts[0], b0 = pts[pts.length - 1];
              return (a0.x - hit.p.x) ** 2 + (a0.y - hit.p.y) ** 2 < tol * tol
                  || (b0.x - hit.p.x) ** 2 + (b0.y - hit.p.y) ** 2 < tol * tol;
            };
            const pontas = (terminaEm(A.pts) ? 1 : 0) + (terminaEm(B.pts) ? 1 : 0);
            const ta = tangenteEm(sa, hit.p), tb = tangenteEm(sb, hit.p);
            const ang = Math.asin(Math.min(1, Math.abs(ta.x * tb.y - ta.y * tb.x))) * 180 / Math.PI;
            const ab = abertura(hit.p);
            /* CANDIDATO + EVIDÊNCIA.
             * Nada mais é descartado em silêncio: cada indício contra vira um
             * MOTIVO legível e o nariz apenas deixa de vir pré-selecionado.
             * Quem decide é o projetista — o limiar passa a ordenar sugestão,
             * não a apagar geometria. */
            const motivos: string[] = [];
            /* PONTA DE CUNHA (gore): com os DOIS bordos a terminarem no ponto, o quase-
             * colinear não é emenda — é a cunha a fechar, e o nariz físico existe mesmo
             * que os teóricos não se cruzem à risca. Vem pré-selecionado. */
            const gore = pontas === 2;
            if (ang < 0.5 && pontas === 1) motivos.push("emenda colinear na ponta");
            if (ang < 0.5 && ab.graus === 0 && !gore) motivos.push("bordos coincidentes");
            if (sobrepostos(hit.p, ta, A.pts, B.pts)) motivos.push("linhas sobrepostas");
            if (ab.graus >= 0 && ab.graus >= aberturaMax) motivos.push("bordo reto de pavimento");
            if (motivos.length) rej.sobreposto++;

            out.push({
              x: hit.p.x, y: hit.p.y, a: A.id, b: B.id, tipo: hit.tipo,
              ponta: pontas > 0, angulo: ang, abertura: ab.graus, dirLivre: ab.dir, via: "exato",
              sugerido: motivos.length === 0, motivos,
            });
          }
        }
      }
    }
  }

  // FALLBACK: se o ajuste exato não achou nada, testa corda a corda sobre a
  // polilinha crua. Menos preciso — mas tem de aplicar OS MESMOS critérios,
  // senão os filtros do caminho exato simplesmente não valem aqui.
  // O caminho exato e o fallback se COMPLEMENTAM: rodam os dois e a fusão de
  // pontos coincidentes evita duplicata. Gatilhar o fallback só quando o exato
  // não achou nada fazia um único ponto espúrio apagar todos os narizes reais.
  {
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const L1 = lines[i], L2 = lines[j];
        if (key(L1) === key(L2)) continue;
        const P = L1.worldPoints, Q = L2.worldPoints;
        const terminaEm = (pts: {x: number, y: number}[], X: {x: number, y: number}, tol = 1.0) => {
          const a0 = pts[0], b0 = pts[pts.length - 1];
          return (a0.x - X.x) ** 2 + (a0.y - X.y) ** 2 < tol * tol
              || (b0.x - X.x) ** 2 + (b0.y - X.y) ** 2 < tol * tol;
        };
        const aceita = (X: {x: number, y: number}, tipo: "cruzamento" | "tangencia", ang: number, t?: {x: number, y: number}) => {
          const pontas = (terminaEm(P, X) ? 1 : 0) + (terminaEm(Q, X) ? 1 : 0);
          if (near(X)) { rej.dup++; return; }
          const ab = abertura(X);
          /* CANDIDATO + EVIDÊNCIA — mesmo critério do caminho exato. */
          const motivos: string[] = [];
          /* PONTA DE CUNHA (gore): com os DOIS bordos a terminarem no ponto, o quase-
           * colinear não é emenda — é a cunha a fechar, e o nariz físico existe mesmo
           * que os teóricos não se cruzem à risca. Vem pré-selecionado. */
          const gore = pontas === 2;
          if (ang < 0.5 && pontas === 1) motivos.push("emenda colinear na ponta");
          if (ang < 0.5 && ab.graus === 0 && !gore) motivos.push("bordos coincidentes");
          if (t && sobrepostos(X, t, P, Q)) motivos.push("linhas sobrepostas");
          if (ab.graus >= 0 && ab.graus >= aberturaMax) motivos.push("bordo reto de pavimento");
          if (motivos.length) rej.sobreposto++;
          out.push({
            x: X.x, y: X.y, a: L1.id, b: L2.id, tipo,
            ponta: pontas > 0, angulo: ang, abertura: ab.graus, dirLivre: ab.dir, via: "fallback",
            sugerido: motivos.length === 0, motivos,
          });
        };
        let bestD = Infinity, bestPt: {x: number, y: number} | null = null, bestAng = 0;
        let bestT: {x: number, y: number} | undefined;
        for (let a = 0; a < P.length - 1; a++) {
          const p1 = P[a], p2 = P[a + 1];
          const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
          const l1 = Math.hypot(d1x, d1y) || 1;
          for (let b = 0; b < Q.length - 1; b++) {
            const q1 = Q[b], q2 = Q[b + 1];
            const d2x = q2.x - q1.x, d2y = q2.y - q1.y;
            const l2 = Math.hypot(d2x, d2y) || 1;
            const den = d1x * d2y - d1y * d2x;
            const ang = Math.asin(Math.min(1, Math.abs(den) / (l1 * l2))) * 180 / Math.PI;
            if (Math.abs(den) > 1e-12) {
              const t = ((q1.x - p1.x) * d2y - (q1.y - p1.y) * d2x) / den;
              const u = ((q1.x - p1.x) * d1y - (q1.y - p1.y) * d1x) / den;
              if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
                aceita({ x: p1.x + t * d1x, y: p1.y + t * d1y }, "cruzamento", ang,
                       { x: d1x / l1, y: d1y / l1 });
                bestD = 0;
                continue;
              }
            }
            const cx = closestPointOnSegment(p1, q1, q2);
            const dd = Math.hypot(p1.x - cx.x, p1.y - cx.y);
            if (dd < bestD) { bestD = dd; bestPt = { x: (p1.x + cx.x) / 2, y: (p1.y + cx.y) / 2 }; bestAng = ang; bestT = { x: d1x / l1, y: d1y / l1 }; }
          }
        }
        if (bestD > 0 && bestD < 0.45 && bestPt) aceita(bestPt, "tangencia", bestAng, bestT);
      }
    }
  }

  /* IDENTIDADE TOPOLÓGICA do nariz: o PAR DE BORDOS que se cruzam.
   * `a`/`b` acima são rótulos legíveis (o nome do bordo, que muda se a
   * interseção for renomeada). Aqui carrega-se o id verdadeiro do
   * alinhamento-filho, que é derivado do papel ("M-Fwd", "B-Arm") e portanto
   * não se move quando raio, largura ou superelevação mudam.
   * `ordem` desempata o caso de dois bordos se cruzarem duas vezes (laço). */
  {
    const srcPorRotulo = new Map<string, string>();
    lines.forEach((l) => srcPorRotulo.set(l.id, l.srcId || l.id));
    const contagem = new Map<string, number>();
    for (const o of out) {
      const sa = srcPorRotulo.get(o.a) || o.a;
      const sb = srcPorRotulo.get(o.b) || o.b;
      o.bordoA = sa;
      o.bordoB = sb;
      const par = sa <= sb ? `${sa}|${sb}` : `${sb}|${sa}`;
      const n = (contagem.get(par) || 0) + 1;
      contagem.set(par, n);
      o.ordem = n;
    }
    /* Par que só cruza uma vez não precisa de sufixo — mantém a chave curta e
     * estável mesmo que um dia apareça um segundo cruzamento. */
    for (const o of out) {
      const sa = o.bordoA!, sb = o.bordoB!;
      const par = sa <= sb ? `${sa}|${sb}` : `${sb}|${sa}`;
      if ((contagem.get(par) || 0) <= 1) o.ordem = undefined;
    }
  }

  return out;
};

/* Tangente de uma entidade exata no ponto (reta: direção; arco: ⊥ ao raio) */
const tangenteEm = (s: any, p: {x: number, y: number}) => {
  if (s.type === "arc" && s.center) {
    const r = { x: p.x - s.center.x, y: p.y - s.center.y };
    const l = Math.hypot(r.x, r.y) || 1;
    return { x: -r.y / l, y: r.x / l };
  }
  const d = { x: s.p2.x - s.p1.x, y: s.p2.y - s.p1.y };
  const l = Math.hypot(d.x, d.y) || 1;
  return { x: d.x / l, y: d.y / l };
};

/**
 * EMENDA COLINEAR — fim/início de alargamento.
 * O bordo da faixa adicional termina encostado no bordo da pista e vem na
 * MESMA direção dele: a faixa só se emenda, largura zero. Não é nariz.
 * Exige as duas condições juntas — estar na PONTA de uma das linhas E ser
 * colinear — para não derrubar tangência legítima no meio da linha.
 */
const emendaColinear = (
  p: {x: number, y: number}, sa: any, sb: any,
  ptsA: {x: number, y: number}[], ptsB: {x: number, y: number}[],
  pontaTol = 0.8, angTolDeg = 2,
): boolean => {
  const naPonta = (pts: {x: number, y: number}[]) => {
    const a = pts[0], b = pts[pts.length - 1];
    return (a.x - p.x) ** 2 + (a.y - p.y) ** 2 < pontaTol * pontaTol
        || (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < pontaTol * pontaTol;
  };
  if (!naPonta(ptsA) && !naPonta(ptsB)) return false;
  const ta = tangenteEm(sa, p), tb = tangenteEm(sb, p);
  const sin = Math.abs(ta.x * tb.y - ta.y * tb.x);
  return sin < Math.sin(angTolDeg * Math.PI / 180);
};

/* ---- interseção analítica entre duas entidades exatas ---- */

type Hit = { p: {x: number, y: number}, tipo: "cruzamento" | "tangencia" };

const normPi = (v: number) => {
  while (v > Math.PI) v -= 2 * Math.PI;
  while (v < -Math.PI) v += 2 * Math.PI;
  return v;
};

const onArc = (s: any, p: {x: number, y: number}, slack = 1e-4) => {
  const a1 = Math.atan2(s.p1.y - s.center.y, s.p1.x - s.center.x);
  let d = normPi(Math.atan2(p.y - s.center.y, p.x - s.center.x) - a1);
  const sw = s.sweep || 0;
  if (sw >= 0) { if (d < -slack) d += 2 * Math.PI; return d <= sw + slack && d >= -slack; }
  if (d > slack) d -= 2 * Math.PI;
  return d >= sw - slack && d <= slack;
};

const onLine = (s: any, p: {x: number, y: number}, slack = 1e-4) => {
  const dx = s.p2.x - s.p1.x, dy = s.p2.y - s.p1.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-18) return false;
  const t = ((p.x - s.p1.x) * dx + (p.y - s.p1.y) * dy) / L2;
  return t >= -slack && t <= 1 + slack;
};

const interSeg = (sa: any, sb: any, tangTol: number): Hit[] => {
  const res: Hit[] = [];
  const push = (p: {x: number, y: number}, tipo: Hit["tipo"]) => {
    const okA = sa.type === "arc" ? onArc(sa, p) : onLine(sa, p);
    const okB = sb.type === "arc" ? onArc(sb, p) : onLine(sb, p);
    if (okA && okB) res.push({ p, tipo });
  };

  if (sa.type === "line" && sb.type === "line") {
    const d1x = sa.p2.x - sa.p1.x, d1y = sa.p2.y - sa.p1.y;
    const d2x = sb.p2.x - sb.p1.x, d2y = sb.p2.y - sb.p1.y;
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-12) return res;
    const t = ((sb.p1.x - sa.p1.x) * d2y - (sb.p1.y - sa.p1.y) * d2x) / den;
    push({ x: sa.p1.x + t * d1x, y: sa.p1.y + t * d1y }, "cruzamento");
    return res;
  }

  if (sa.type === "arc" && sb.type === "arc") {
    const c1 = sa.center, r1 = sa.radius, c2 = sb.center, r2 = sb.radius;
    const dx = c2.x - c1.x, dy = c2.y - c1.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) return res;
    if (Math.abs(d - (r1 + r2)) < tangTol) {
      push({ x: c1.x + dx / d * r1, y: c1.y + dy / d * r1 }, "tangencia");
      return res;
    }
    if (Math.abs(d - Math.abs(r1 - r2)) < tangTol) {
      const sg = r1 > r2 ? 1 : -1;
      push({ x: c1.x + dx / d * r1 * sg, y: c1.y + dy / d * r1 * sg }, "tangencia");
      return res;
    }
    if (d > r1 + r2 || d < Math.abs(r1 - r2)) return res;
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h2 = r1 * r1 - a * a;
    if (h2 < 0) return res;
    const h = Math.sqrt(h2);
    const mx = c1.x + a * dx / d, my = c1.y + a * dy / d;
    push({ x: mx + h * dy / d, y: my - h * dx / d }, "cruzamento");
    push({ x: mx - h * dy / d, y: my + h * dx / d }, "cruzamento");
    return res;
  }

  const ln = sa.type === "line" ? sa : sb;
  const ar = sa.type === "arc" ? sa : sb;
  const dx = ln.p2.x - ln.p1.x, dy = ln.p2.y - ln.p1.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return res;
  const ux = dx / L, uy = dy / L;
  const fx = ln.p1.x - ar.center.x, fy = ln.p1.y - ar.center.y;
  const b = fx * ux + fy * uy;
  const c = fx * fx + fy * fy - ar.radius * ar.radius;
  const disc = b * b - c;
  // disc está em m²; a separação entre as duas raízes é 2·√disc. Tangência é
  // quando as raízes praticamente coincidem — comparar disc direto com uma
  // tolerância em metros classificaria cruzamento franco como tangência.
  const discTang = (tangTol / 2) * (tangTol / 2);
  if (disc < -discTang) return res;
  if (disc <= discTang) {
    push({ x: ln.p1.x + ux * -b, y: ln.p1.y + uy * -b }, "tangencia");
    return res;
  }
  const sq = Math.sqrt(disc);
  push({ x: ln.p1.x + ux * (-b + sq), y: ln.p1.y + uy * (-b + sq) }, "cruzamento");
  push({ x: ln.p1.x + ux * (-b - sq), y: ln.p1.y + uy * (-b - sq) }, "cruzamento");
  return res;
};

export const buildIntersectionPolygon = (I: {x: number, y: number}, arms: {id: string, p: {x: number, y: number}, width: number, leftWidth?: number, rightWidth?: number, d?: {x: number, y: number}}[], radiusConfig: Record<string, number>): { path: string, edges: { id: string, path: string, arcInfo?: any }[], polygonPoints: {x: number, y: number}[], narizesTeoricos: NarizTeorico[] } => {
  const sortedArms = arms.map(arm => {
    const d = arm.d || getDir(I, arm.p); 
    return { ...arm, d, angle: Math.atan2(d.y, d.x) };
  }).sort((a, b) => a.angle - b.angle);
  
  const N = sortedArms.length;
  let path = "";
  const edges: { id: string, path: string, arcInfo?: any }[] = [];
  const polygonPoints: {x: number, y: number}[] = [];
  const narizesTeoricos: NarizTeorico[] = [];
  
  for (let i = 0; i < N; i++) {
    const A = sortedArms[i];
    const B = sortedArms[(i + 1) % N];
    
    const wALeft = A.leftWidth ?? A.width;
    const wARight = A.rightWidth ?? A.width;
    const wBLeft = B.leftWidth ?? B.width;
    const wBRight = B.rightWidth ?? B.width;

    // inward directed arms away from I
    const rnA = { x: -A.d.y, y: A.d.x }; 
    const lnA = { x: A.d.y, y: -A.d.x }; 
    const rnB = { x: -B.d.y, y: B.d.x }; 
    const lnB = { x: B.d.y, y: -B.d.x }; 
    
    const farLeftA = add(A.p, mul(lnA, wALeft));
    const farRightA = add(A.p, mul(rnA, wARight));
    
    const lineARight_p = add(I, mul(rnA, wARight));
    const lineBLeft_p = add(I, mul(lnB, wBLeft));

    
    let V = intersectLines(lineARight_p, A.d, lineBLeft_p, B.d);

    // >>> NARIZ TEÓRICO: V é o cruzamento do bordo direito de A com o bordo
    //     esquerdo de B. Batizado aqui.
    const ntPoint = V ? { x: V.x, y: V.y } : null;
    
    const dotAB = A.d.x * B.d.x + A.d.y * B.d.y;
    let isStraight = dotAB < -0.99;
    if (isStraight || !V) V = lineARight_p; 
    
    let R = 0;
    if (!isStraight) {
      R = radiusConfig[`${A.id}-${B.id}`] || radiusConfig[`${B.id}-${A.id}`] || 40;
    }
    
    if (R > 0 && V) {
        const distA = Math.hypot(A.p.x - V.x, A.p.y - V.y);
        const distB = Math.hypot(B.p.x - V.x, B.p.y - V.y);
        const maxDist = Math.min(distA, distB) * 0.95;
        const alpha = Math.acos(Math.max(-1, Math.min(1, dotAB)));
        
        const internalAngle = Math.PI - alpha;
        const tHalf = Math.tan(internalAngle / 2);
        
        if (tHalf > 0.01 && R / tHalf > maxDist) {
           R = maxDist * tHalf;
        }
    }

    const fillet = (isStraight || R <= 0) ? null : solveFillet(V!, A.d, B.d, R);

    if (ntPoint && !isStraight) {
      narizesTeoricos.push({
        id: `NT-${String(narizesTeoricos.length + 1).padStart(2, "0")}`,
        point: ntPoint, armA: A.id, armB: B.id,
        raio: R, arredondado: !!fillet,
      });
    }
    
    if (i === 0) {
      path += `M ${farLeftA.x} ${farLeftA.y} L ${farRightA.x} ${farRightA.y} `;
      polygonPoints.push(farLeftA, farRightA);
    } else {
      path += `L ${farLeftA.x} ${farLeftA.y} L ${farRightA.x} ${farRightA.y} `;
      polygonPoints.push(farLeftA, farRightA);
    }
    
    if (fillet) {
      path += `L ${fillet.T1.x} ${fillet.T1.y} `;
      path += `A ${fillet.R} ${fillet.R} 0 0 ${fillet.sweep} ${fillet.T2.x} ${fillet.T2.y} `;
      
      polygonPoints.push(fillet.T1);
      
      const c1X = fillet.T1.x - A.d.y * fillet.R * (fillet.sweep === 1 ? -1 : 1);
      const c1Y = fillet.T1.y + A.d.x * fillet.R * (fillet.sweep === 1 ? -1 : 1);
      
      const startAng = Math.atan2(fillet.T1.y - c1Y, fillet.T1.x - c1X);
      const endAng = Math.atan2(fillet.T2.y - c1Y, fillet.T2.x - c1X);
      let sweepAng = endAng - startAng;
      if (fillet.sweep === 1 && sweepAng < 0) sweepAng += 2*Math.PI;
      if (fillet.sweep === 0 && sweepAng > 0) sweepAng -= 2*Math.PI;
      
      const arcLength = Math.abs(sweepAng * fillet.R);
      const steps = Math.max(15, Math.floor(arcLength / 0.25));
      for (let s = 1; s <= steps; s++) {
        const ang = startAng + sweepAng * (s / steps);
        polygonPoints.push({
          x: c1X + fillet.R * Math.cos(ang),
          y: c1Y + fillet.R * Math.sin(ang)
        });
      }
      
      edges.push({ id: `${A.id}-${B.id}`, path: `M ${fillet.T1.x} ${fillet.T1.y} A ${fillet.R} ${fillet.R} 0 0 ${fillet.sweep} ${fillet.T2.x} ${fillet.T2.y}`, arcInfo: { T1: fillet.T1, T2: fillet.T2, R: fillet.R, sweep: fillet.sweep, center: {x: c1X, y: c1Y}, NT: ntPoint } });
    } else {
      path += `L ${V!.x} ${V!.y} `;
      polygonPoints.push(V!);
      edges.push({ id: `${A.id}-${B.id}`, path: `M ${farRightA.x} ${farRightA.y} L ${V!.x} ${V!.y}` });
    }
  }
  path += "Z";
  return { path, edges, polygonPoints, narizesTeoricos };
};


/* IDENTIDADE DO NARIZ — topológica, não geométrica.
 *
 * O nariz é o encontro de DOIS bordos. QUAIS dois não muda quando se ajusta
 * raio de concordância, largura de faixa ou superelevação — só a posição
 * muda. Então a identidade é o par de bordos (ordenado, para dar sempre a
 * mesma string) mais a ordem do cruzamento, que desempata laço.
 *
 * A chave antiga era a coordenada arredondada em 0,1 m: qualquer ajuste a
 * montante movia o nariz e ele perdia tipo, parâmetros e alvo, calado. Segue
 * aceita como fallback — projetos salvos antes da migração, e narizes cujo
 * par de bordos não foi identificado. */
export const narizKeyCoord = (nt: { x: number; y: number }) =>
  `${nt.x.toFixed(1)},${nt.y.toFixed(1)}`;

export const narizKey = (nt: any): string => {
  const a = nt?.bordoA, b = nt?.bordoB;
  if (a && b) {
    const par = a <= b ? `${a}|${b}` : `${b}|${a}`;
    return `nf|${par}${nt.ordem ? `#${nt.ordem}` : ""}`;
  }
  return narizKeyCoord(nt);
};

/** Uma chave é do formato antigo (coordenada)? */
export const isChaveCoord = (k: string) => !k.startsWith("nf|");

/* Hash numérico rápido de polilinhas — aritmética pura, sem alocar string.
 * Serve para responder "a geometria mudou de fato?" a custo desprezível, no
 * lugar de um JSON.stringify de milhares de pontos por render.
 *
 * QUANTIZAÇÃO = 2 cm, e isto é a válvula que fecha o ciclo.
 *
 * Estes bordos entram num laço real: alvo do quadrante → pavimento → fitas →
 * bordo do refúgio → ntBordos → nariz → alvo do quadrante. Cada volta move a
 * geometria por FRAÇÕES de milímetro (é a mesma solução, recalculada), então
 * com arredondamento em milímetro o hash mudava sempre: o sistema
 * re-sincronizava indefinidamente — demorava uma eternidade a "ativar" os
 * targets e depois piscava, porque nunca convergia.
 *
 * 2 cm está uma ordem de grandeza abaixo de qualquer tolerância de projeto
 * (a própria tangência do fillete usa 15–25 cm), portanto não perde nada real
 * e faz o laço convergir na segunda volta. */
export const hashPolylines = (m: Record<string, { x: number; y: number }[]>) => {
  let h = 2166136261 >>> 0;
  const mix = (v: number) => {
    h = (h ^ (v | 0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  };
  for (const id of Object.keys(m).sort()) {
    for (let i = 0; i < id.length; i++) mix(id.charCodeAt(i));
    const pts = m[id] || [];
    mix(pts.length);
    for (let i = 0; i < pts.length; i++) {
      mix(Math.round(pts[i].x * 50));
      mix(Math.round(pts[i].y * 50));
    }
  }
  return h;
};

/** O bordo do refúgio é CONSEQUÊNCIA, não entrada.
 *
 * Ele é lido das fitas do corredor, e as fitas dependem dos alvos do
 * quadrante, que dependem do nariz. Enquanto o refúgio conta como entrada da
 * construção do nariz, existe um laço FECHADO de duas voltas:
 *
 *   sem alvo de nariz → pavimento curto → refúgio forma X → nariz em P1
 *   com alvo de nariz → pavimento fecha  → refúgio forma Y → nariz em P2 ≠ P1
 *
 * As duas voltas são estáveis entre si, então o sistema alterna eternamente —
 * é um piscar de AMPLITUDE GRANDE, que nenhuma quantização resolve (essa só
 * mata o ruído sub-milimétrico).
 *
 * A saída é assimétrica: o refúgio continua disponível para CONSTRUIR o nariz,
 * mas deixa de contar como GATILHO. Assim o nariz não persegue a própria
 * consequência, e a geometria estabiliza na primeira solução — que é a
 * correta, porque o alvo do nariz é o que fecha o pavimento. */
export const ehBordoRefugio = (id: string) => /Bordo_Ref[úu]gio/i.test(id);

/** hashPolylines sobre as entradas ESTÁVEIS (sem o bordo do refúgio). */
export const hashPolylinesEstavel = (m: Record<string, { x: number; y: number }[]>) => {
  const estavel: Record<string, { x: number; y: number }[]> = {};
  for (const k of Object.keys(m)) if (!ehBordoRefugio(k)) estavel[k] = m[k];
  return hashPolylines(estavel);
};

/** Impressão compacta dos narizes teoricos — posição e identidade.
 *  Quantizado em 1 cm pela mesma razão do hashPolylines: o NT é recalculado a
 *  cada volta do laço e oscila em frações de milímetro. */
export const hashNTs = (nts: any[]) => {
  let h = 5381 >>> 0;
  const mix = (v: number) => { h = (Math.imul(h, 33) ^ (v | 0)) >>> 0; };
  for (const nt of nts) {
    mix(Math.round(nt.x * 100));
    mix(Math.round(nt.y * 100));
    const k = narizKey(nt);
    for (let i = 0; i < k.length; i++) mix(k.charCodeAt(i));
    mix(nt.sugerido === false ? 1 : 2);
  }
  return h;
};

/** Assinatura completa das entradas de resolverNarizes. */
export const assinaturaNarizes = (nts: any[], ctx: any) =>
  [
    hashNTs(nts),
    hashPolylinesEstavel(ctx?.ntBordos || {}),
    JSON.stringify(ctx?.ntEscolhas || {}),
    JSON.stringify(ctx?.ntTipos || {}),
    JSON.stringify(ctx?.ntParams || {}),
    (ctx?.intersections || []).map((i: any) => `${i.id}:${i.mainAlignmentId}`).join(","),
  ].join("~");

/** NOMENCLATURA DE APRESENTAÇÃO — o id interno é NT-xx (o nariz teórico nasce
 *  do cruzamento dos bordos e ancora a identidade), mas o que se lê em planta,
 *  painel e relatório é o NARIZ FÍSICO: NF-xx. Só a etiqueta muda; chave,
 *  alvos e projetos guardados continuam em NT. */
export const rotuloNF = (id?: string) =>
  String(id || "").replace(/^NT[-\s]?/i, "NF-");

/** Larguras nominais da ponta do nariz físico [m] (DER-SP). */
export const LARGURA_NARIZ_FISICO = { entrada: 2.0, saida: 1.0, misto: 1.5 } as const;
export type TipoNariz = keyof typeof LARGURA_NARIZ_FISICO;
/** Afastamento padrão do bordo do ramo usado na construção do nariz [m]. */
export const OFFSET_BORDO_NARIZ = 1.0;
/** Trecho quebrado no offset, girado com base no NF [m]. */
export const COMPR_NARIZ_FISICO = 25.0;

export interface NarizResolvido {
  nt: any;
  key: string;
  par: any;
  larguraEfetiva: number;
  modo: 'continuo' | 'taper' | 'auto' | 'uniforme';
  geom: NarizFisicoGeom;
  origBordo?: Pt2[];
  origQ?: Pt2;
}

/* RECUSAS — por que um nariz não foi construído, chaveado por chave de nariz.
 *
 * Há diferença entre "discordo da sua heurística" e "esta figura é
 * degenerada". A primeira é opinião e o `sim` do usuário deve vencer; a
 * segunda não é negociável — construir sobre bordos quase paralelos produz
 * ponta colapsada e linha correndo para o lado errado, em vez de nada.
 * A UI lê este mapa para EXPLICAR, em vez de desenhar lixo. */
export const recusasNariz: Record<string, string> = {};

/** Cunha degenerada pela evidência do próprio NT (ângulo e abertura). */
const motivoDegenerado = (nt: any): string | null => {
  const ang = typeof nt?.angulo === "number" ? nt.angulo : null;
  const ab = typeof nt?.abertura === "number" ? nt.abertura : null;
  if (ang !== null && ang < 2)
    return `bordos quase paralelos (${ang.toFixed(2)}°): é emenda de linhas, não nariz`;
  if (ab !== null && ab >= 0 && ab < 10)
    return `sem cunha para pavimentar (abertura ${ab.toFixed(1)}°)`;
  return null;
};

/* RESOLVEDOR DE NARIZES — fonte única da geometria dos narizes.
 *
 * Faz, na ordem: constrói cada nariz (offset + giro), decide o modo 'auto'
 * pelo encavalamento das linhas pretas (quem bate na linha de outro nariz
 * nunca vai concordar com o bordo real, então vira afastamento uniforme, sem
 * giro) e apara as linhas onde se cruzam. A planta desenha isto e o corredor
 * alveja isto — não pode haver duas contas. */
/* Memo de UMA entrada. A planta e o store resolvem os mesmos narizes na mesma
 * rodada; sem isto a conta roda duas vezes por mudança, e roda de novo em todo
 * render de corredor mesmo quando nada mudou. Saída tratada como imutável —
 * os dois consumidores apenas leem. */
let __resolveMemo: { sig: string; out: Record<string, NarizResolvido> } | null = null;

export const resolverNarizes = (
  nts: any[],
  ctx: {
    ntEscolhas?: Record<string, string>;
    ntTipos?: Record<string, string>;
    ntParams?: Record<string, any>;
    ntBordos?: Record<string, { x: number; y: number }[]>;
    intersections?: any[];
  },
): Record<string, NarizResolvido> => {
  const sig = assinaturaNarizes(nts, ctx);
  if (__resolveMemo && __resolveMemo.sig === sig) return __resolveMemo.out;
  const out = resolverNarizesRaw(nts, ctx);
  __resolveMemo = { sig, out };
  return out;
};

const resolverNarizesRaw = (
  nts: any[],
  ctx: {
    ntEscolhas?: Record<string, string>;
    ntTipos?: Record<string, string>;
    ntParams?: Record<string, any>;
    ntBordos?: Record<string, { x: number; y: number }[]>;
    intersections?: any[];
  },
): Record<string, NarizResolvido> => {
  const { ntEscolhas, ntTipos, ntParams, ntBordos, intersections } = ctx;

  // Interseção de segmentos — base do casamento topológico das linhas
  const segmentIntersection = (p1: any, p2: any, p3: any, p4: any) => {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(denom) < 1e-6) return null; // colineares ou paralelos
    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;
    // tolerância abrangente: inclui encontros exatamente na ponta de um cap
    if (ua >= -1e-5 && ua <= 1 + 1e-5 && ub >= -1e-5 && ub <= 1 + 1e-5) {
      return { x: p1.x + ua * (p2.x - p1.x), y: p1.y + ua * (p2.y - p1.y), ua };
    }
    return null;
  };

  /* Narizes que offset+giro não conseguiu construir. Reunidos aqui para a
   * FASE 4 tentar a construção por largura antes de virar recusa. */
  let pendentes: {
    nt: any; key: string; par: any; larguraEfetiva: number;
    modo: 'continuo' | 'taper' | 'auto' | 'uniforme'; motivo: string;
  }[] = [];

  const buildRaw = (overrides: Record<string, 'continuo' | 'taper' | 'auto' | 'uniforme'>) => {
    pendentes = [];
    const raw: NarizResolvido[] = [];
    nts.forEach((nt: any) => {
      const key = narizKey(nt);
      const escolha = ntEscolhas?.[key];
      const ativo = escolha === "sim" || (escolha !== "nao" && nt.sugerido !== false);
      if (escolha === "nao" || !ativo) return;

      const tipoNariz = (ntTipos?.[key] || "entrada") as TipoNariz;
      const par = ntParams?.[key] || {};

      let pistaId: string | null = null;
      if (intersections && intersections.length > 0) {
        const raizPista = new Set(intersections.map((it: any) => it.mainAlignmentId));
        const isMainA = !!(nt.raizA && raizPista.has(nt.raizA));
        const isMainB = !!(nt.raizB && raizPista.has(nt.raizB));
        if (isMainA && !isMainB) pistaId = nt.armA;
        else if (isMainB && !isMainA) pistaId = nt.armB;
      }

      const larguraEfetiva = (par.larguraCustom && par.larguraCustom > 0)
        ? par.larguraCustom
        : LARGURA_NARIZ_FISICO[tipoNariz];
      const finalPistaId = par.inverterLado
        ? (pistaId === nt.armA ? nt.armB : nt.armA)
        : pistaId;

      let refugioBordo = null;
      if (finalPistaId && ntBordos) {
        let melhorD = 20;
        for (const id of Object.keys(ntBordos)) {
          if (!/Bordo_Ref[úu]gio/i.test(id)) continue;
          const poly = ntBordos[id];
          if (!poly || poly.length < 2) continue;
          const d = closestPointOnPolyline({ x: nt.x, y: nt.y }, poly).dist;
          if (d < melhorD) { melhorD = d; refugioBordo = id; }
        }
      }

      let bordosCalc = ntBordos || {};
      let refugioCalcId = undefined;
      if (refugioBordo && bordosCalc[refugioBordo]) {
        const base = bordosCalc[refugioBordo];
        const prolongar = (pts: any[], L: number) => {
          if (pts.length < 2) return pts;
          const dir = (a: any, b: any) => {
            const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
          };
          const t0 = dir(pts[1], pts[0]);
          const t1 = dir(pts[pts.length - 2], pts[pts.length - 1]);
          return [
            { x: pts[0].x + t0.x * L, y: pts[0].y + t0.y * L },
            ...pts,
            { x: pts[pts.length - 1].x + t1.x * L, y: pts[pts.length - 1].y + t1.y * L },
          ];
        };
        refugioCalcId = `${refugioBordo} [prolongado]`;
        bordosCalc = { ...bordosCalc, [refugioCalcId]: prolongar(base, 300) };
      }

      const modo = overrides[key] ?? par.modoTransicao ?? 'auto';

      /* Se o nariz não tem uma pista principal clara (ex: vértice superior de ilha canalizada entre 2 ramos),
       * ou se foi marcado como gore, ou a cunha é degenerada, vai direto para FASE 4 sobre as linhas pretas (offset de 1m) */
      const deg = motivoDegenerado(nt);
      /* NARIZ DE GARGANTA — um braço é bordo da pista principal, o outro é bordo
       * de ramo. Esse é SEMPRE offset + giro contra o bordo da pista (ou do
       * refúgio): é a premissa do nariz físico. A saída por degenerescência é
       * para cunha entre dois ramos, onde não há pista contra a qual medir; num
       * nariz de garganta ela punha a construção de cunha a trabalhar, e o cap
       * saía torto e longe do NT, com uma perna a correr pela principal.
       * Marcação explícita de gore continua a mandar. */
      const ehGarganta = !!pistaId;
      const goreExplicito = par.modoConstrucao === 'gore' || par.tipo === 'gore';
      if (!finalPistaId || goreExplicito || (deg && !ehGarganta)) {
        pendentes.push({
          nt, key, par, larguraEfetiva, modo,
          motivo: deg || "nariz de ponta de cunha (gore)",
        });
        return;
      }

      const geom = narizFisicoCached(
        nt, bordosCalc, finalPistaId,
        larguraEfetiva,
        par.offset ?? OFFSET_BORDO_NARIZ,
        par.comprimento ?? COMPR_NARIZ_FISICO,
        modo,
        refugioCalcId
      );
      if (!geom) {
        pendentes.push({
          nt, key, par, larguraEfetiva, modo,
          motivo: ultimaRecusaNariz() || "construção do nariz falhou",
        });
        return;
      }
      raw.push({
        nt, key, par, larguraEfetiva, modo,
        geom: { ...geom, bordo: [...geom.bordo], cap: [geom.cap[0], geom.cap[1]], capOriginalLength: Math.hypot(geom.cap[0].x - geom.cap[1].x, geom.cap[0].y - geom.cap[1].y) },
        origBordo: [...geom.bordo],
        origQ: geom.q,
      });
    });
    return raw;
  };

  // FASE 1: descobre os cortes cruzados sobre as geometrias brutas intactas
  const detectCuts = (raw: NarizResolvido[]) => {
    const cuts = raw.map(() => ({ bordoCut: null as any, capCut: null as any }));
    const outros = (skip: number) => {
      const segs: { p3: any; p4: any }[] = [];
      for (let j = 0; j < raw.length; j++) {
        if (j === skip) continue;
        const g = raw[j].geom;
        segs.push({ p3: g.cap[1], p4: g.cap[0] });          // cap: NF → bordo da pista
        for (let l = 0; l < g.bordo.length - 1; l++) segs.push({ p3: g.bordo[l], p4: g.bordo[l + 1] });
      }
      return segs;
    };
    for (let i = 0; i < raw.length; i++) {
      const g1 = raw[i].geom;
      const others = outros(i);
      for (let k = 0; k < g1.bordo.length - 1; k++) {
        const p1 = g1.bordo[k], p2 = g1.bordo[k + 1];
        let best: any = null;
        for (const { p3, p4 } of others) {
          const inter = segmentIntersection(p1, p2, p3, p4);
          if (inter && (!best || inter.ua < best.ua)) best = inter;
        }
        if (best) { cuts[i].bordoCut = { k, point: best }; break; } // morre no 1º obstáculo
      }
    }
    return cuts;
  };

  let raw = buildRaw({});
  let cuts = detectCuts(raw);

  /* 'auto' decide pelo encavalamento: linha que bate na de outro nariz ou obstáculo
   * nunca vai concordar com o bordo real — esse nariz é refeito com afastamento
   * uniforme (offset paralelo, sem giro, mantendo 1,00m constante sem afunilar). */
  const uniformes: Record<string, 'uniforme'> = {};
  raw.forEach((r, i) => { if (cuts[i].bordoCut && r.modo === 'auto') uniformes[r.key] = 'uniforme'; });
  if (Object.keys(uniformes).length) {
    raw = buildRaw(uniformes);
    cuts = detectCuts(raw);
  }

  // FASE 2: aplica os cortes simultaneamente
  for (let i = 0; i < raw.length; i++) {
    if (cuts[i].bordoCut) {
      raw[i].geom.bordo = [...raw[i].geom.bordo.slice(0, cuts[i].bordoCut.k + 1), cuts[i].bordoCut.point];
    }
    const cp = raw[i].geom.cap;
    raw[i].geom.amarra = [
      { x: (cp[0].x + cp[1].x) / 2, y: (cp[0].y + cp[1].y) / 2 },
      raw[i].geom.amarra[1],
    ];
  }

  /* FASE 3: bordos QUASE PARALELOS entre dois narizes vizinhos.
   * Quando dois narizes se encaram (ex.: NT-01 e NT-02 nos dois lados da
   * mesma cunha), os bordos correm sobrepostos com um afastamento de poucos
   * centímetros — nunca se cruzam, então a FASE 2 não corta nada e o desenho
   * mostra DUAS linhas pretas paralelas. Aqui os dois são aparados no meio do
   * trecho sobreposto e soldados num ponto comum: uma linha só, contínua. */
  {
    const TOL = 0.6;                                   // m: afastamento que conta como sobreposto
    const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
    /** distância de P à polilinha */
    const distToPoly = (P: any, poly: any[]) => {
      let m = Infinity;
      for (let k = 0; k < poly.length - 1; k++) {
        const A = poly[k], B = poly[k + 1];
        const vx = B.x - A.x, vy = B.y - A.y;
        const L2 = vx * vx + vy * vy;
        let t = L2 > 0 ? ((P.x - A.x) * vx + (P.y - A.y) * vy) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        m = Math.min(m, Math.hypot(P.x - (A.x + vx * t), P.y - (A.y + vy * t)));
      }
      return m;
    };
    const cumLen = (poly: any[]) => {
      const s = [0];
      for (let k = 1; k < poly.length; k++) s.push(s[k - 1] + dist(poly[k - 1], poly[k]));
      return s;
    };
    /** ponto a `s` metros do início + polilinha aparada nesse ponto */
    const cutAt = (poly: any[], s: number) => {
      const c = cumLen(poly);
      if (s <= 0) return { pt: poly[0], head: [poly[0]] };
      const total = c[c.length - 1];
      if (s >= total) return { pt: poly[poly.length - 1], head: [...poly] };
      let k = 1;
      while (k < c.length && c[k] < s) k++;
      const f = (s - c[k - 1]) / Math.max(1e-9, c[k] - c[k - 1]);
      const pt = { x: poly[k - 1].x + (poly[k].x - poly[k - 1].x) * f, y: poly[k - 1].y + (poly[k].y - poly[k - 1].y) * f };
      return { pt, head: [...poly.slice(0, k), pt] };
    };
    /** arco onde a CAUDA de `A` passa a acompanhar `B` (∞ se não acompanha) */
    const inicioSobreposicao = (A: any[], B: any[]) => {
      if (A.length < 2 || B.length < 2) return Infinity;
      if (distToPoly(A[A.length - 1], B) > TOL) return Infinity;   // cauda longe: não é o caso
      const c = cumLen(A);
      let idx = A.length - 1;
      while (idx > 0 && distToPoly(A[idx - 1], B) <= TOL) idx--;
      return c[idx];
    };

    for (let i = 0; i < raw.length; i++) {
      for (let j = i + 1; j < raw.length; j++) {
        const A = raw[i].geom.bordo, B = raw[j].geom.bordo;
        const sA = inicioSobreposicao(A, B);
        const sB = inicioSobreposicao(B, A);
        if (!isFinite(sA) || !isFinite(sB)) continue;
        const LA = cumLen(A)[A.length - 1], LB = cumLen(B)[B.length - 1];
        const cA = cutAt(A, sA + (LA - sA) / 2);
        const cB = cutAt(B, sB + (LB - sB) / 2);
        const solda = { x: (cA.pt.x + cB.pt.x) / 2, y: (cA.pt.y + cB.pt.y) / 2 };
        raw[i].geom.bordo = [...cA.head.slice(0, -1), solda];
        raw[j].geom.bordo = [...cB.head.slice(0, -1), solda];
        raw[i].geom.q = solda;
        raw[j].geom.q = solda;
      }
    }
  }

  /* FASE 4: NARIZ DE PONTA DE CUNHA (GORE NOSE) — construção por largura sobre as linhas pretas (offset 1,00m).
   *
   * Roda por último: usa os bordos dos ramos (offA e offB) com afastamento regulamentar de 1,00m para
   * posicionar o cap no ponto onde a distância entre eles é exatamente a largura nominal (ex.: 2,00m).
   * Conecta as linhas pretas dos narizes vizinhos (ex.: NT-01 e NT-03) sem invadir a pista nem ultrapassar os caps. */
  const raizPistaSet = new Set((intersections || []).map((it: any) => it.mainAlignmentId));
  const todosCandidatos = [
    ...pendentes,
    ...raw.filter((r) => {
      if (r.geom.gore) return false;
      const isMainA = !!(r.nt.raizA && raizPistaSet.has(r.nt.raizA));
      const isMainB = !!(r.nt.raizB && raizPistaSet.has(r.nt.raizB));
      const isThroatNose = (isMainA && !isMainB) || (isMainB && !isMainA);
      const explicitGore = r.par?.tipo === 'gore' || r.par?.modoConstrucao === 'gore';
      if (isThroatNose && !explicitGore) return false;
      return true;
    }),
  ];

  for (const p of todosCandidatos) {
    const V = { x: p.nt.x, y: p.nt.y };
    const w = Math.max(p.larguraEfetiva || 2.0, 0.2);
    /* UM AFASTAMENTO POR BRAÇO. Na cunha os dois braços são bordos de ramos
     * DIFERENTES — cada um tem o seu afastamento regulamentar. `offset` é o
     * lado A; `offsetB` o lado B, e cai no de A quando não foi definido (é o
     * caso de todo projeto anterior a isto). */
    const offVal = p.par?.offset ?? OFFSET_BORDO_NARIZ ?? 1.0;
    const offValB = p.par?.offsetB ?? offVal;
    const compVal = p.par?.comprimento ?? COMPR_NARIZ_FISICO ?? 25.0;

    const bA = ntBordos?.[p.nt.armA];
    const bB = ntBordos?.[p.nt.armB];

    /* NÃO SE FAZ LINHA PRETA NO CORREDOR PRINCIPAL.
     * A construção de cunha faz uma perna por braço. Quando um dos braços é
     * bordo da pista principal, essa perna correria ao longo da pista — e o
     * nariz não afasta bordo de pista, afasta bordo de ramo. A perna desse lado
     * é suprimida (e a sinalização dela também: o bordo da pista continua a ser
     * bordo de pista, não passa a ficar sob pavimento). */
    const armAEhPista = !!(p.nt.raizA && raizPistaSet.has(p.nt.raizA));
    const armBEhPista = !!(p.nt.raizB && raizPistaSet.has(p.nt.raizB));

    if (!bA || bA.length < 2 || !bB || bB.length < 2) {
      if (pendentes.some((item) => item.key === p.key)) {
        recusasNariz[p.key] = "bordos dos ramos de origem não encontrados";
      }
      continue;
    }

    const iA = peNaPolilinha(V, bA).index;
    const iB = peNaPolilinha(V, bB).index;

    // Sentido de abertura da cunha ao longo de cada bordo (afastando-se do ápice V)
    const pFwdA = andarSeguro(bA, iA, 1, Math.min(8, Math.max(2, w * 2)));
    const pBwdA = andarSeguro(bA, iA, -1, Math.min(8, Math.max(2, w * 2)));
    const dirA: 1 | -1 = peNaPolilinha(pFwdA, bB).dist >= peNaPolilinha(pBwdA, bB).dist ? 1 : -1;

    const pRefA = andarSeguro(bA, iA, dirA, Math.min(8, Math.max(2, w * 2)));
    const peRefA = peNaPolilinha(pRefA, bB);
    let vEntraA = { x: peRefA.pt.x - pRefA.x, y: peRefA.pt.y - pRefA.y };
    const dEA = Math.hypot(vEntraA.x, vEntraA.y);
    if (dEA > 1e-5) vEntraA = { x: vEntraA.x / dEA, y: vEntraA.y / dEA };

    const pFwdB = andarSeguro(bB, iB, 1, Math.min(8, Math.max(2, w * 2)));
    const pBwdB = andarSeguro(bB, iB, -1, Math.min(8, Math.max(2, w * 2)));
    const dirB: 1 | -1 = peNaPolilinha(pFwdB, bA).dist >= peNaPolilinha(pBwdB, bA).dist ? 1 : -1;

    const pRefB = andarSeguro(bB, iB, dirB, Math.min(8, Math.max(2, w * 2)));
    const peRefB = peNaPolilinha(pRefB, bA);
    let vEntraB = { x: peRefB.pt.x - pRefB.x, y: peRefB.pt.y - pRefB.y };
    const dEB = Math.hypot(vEntraB.x, vEntraB.y);
    if (dEB > 1e-5) vEntraB = { x: vEntraB.x / dEB, y: vEntraB.y / dEB };

    // Gera os offsets paralelos fieis (1,00m para dentro da ilha)
    const offA = polylineOffset(bA, offVal, vEntraA, iA);
    const offB = polylineOffset(bB, offValB, vEntraB, iB);

    if (!offA || offA.length < 2 || !offB || offB.length < 2) {
      if (pendentes.some((item) => item.key === p.key)) {
        recusasNariz[p.key] = "falha ao calcular offset dos bordos do nariz de cunha";
      }
      continue;
    }

    const iOffA = peNaPolilinha(V, offA).index;
    const vaoB = (pt: Pt2) => peNaPolilinha(pt, offB).dist;

    const PASSO = 0.05;
    let sLo = -1, sHi = -1, vaoMax = 0;
    const alcance = 150;
    for (let s = 0; s <= alcance; s += PASSO) {
      const ptTest = andarSeguro(offA, iOffA, dirA, s);
      const d = vaoB(ptTest);
      if (d > vaoMax) vaoMax = d;
      if (d >= w) {
        sHi = s;
        sLo = Math.max(0, s - PASSO);
        break;
      }
    }

    if (sHi < 0) {
      if (pendentes.some((item) => item.key === p.key)) {
        recusasNariz[p.key] = `as linhas de offset não abrem ${w.toFixed(2)} m (vão máximo ${vaoMax.toFixed(2)} m)`;
      }
      continue;
    }

    delete recusasNariz[p.key];

    // Bisseção para achar a posição milimétrica onde o vão entre offA e offB é exatamente w
    for (let it = 0; it < 30; it++) {
      const m = (sLo + sHi) / 2;
      if (vaoB(andarSeguro(offA, iOffA, dirA, m)) >= w) sHi = m; else sLo = m;
    }
    const capA = andarSeguro(offA, iOffA, dirA, sHi);
    const peCapB = peNaPolilinha(capA, offB);
    const capB = peCapB.pt;

    // Pega o ponto do cap do vizinho que está no braço (o ponto NF/PC com afastamento de 1m, não o bordo da pista)
    const getCapPointOnArm = (geom: NarizFisicoGeom, armPoly: Pt2[]): Pt2 => {
      const d0 = peNaPolilinha(geom.cap[0], armPoly).dist;
      const d1 = peNaPolilinha(geom.cap[1], armPoly).dist;
      return d1 <= d0 ? geom.cap[1] : geom.cap[0];
    };

    // Identifica vizinhos compartilhando o mesmo braço
    const neighborA = raw.find((r) => r.key !== p.key && (r.nt.armA === p.nt.armA || r.nt.armB === p.nt.armA));
    const neighborB = raw.find((r) => r.key !== p.key && (r.nt.armA === p.nt.armB || r.nt.armB === p.nt.armB));

    const compPoly = (pts: Pt2[]) => {
      let d = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        d += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      }
      return d;
    };

    /* A BRANCA ACOMPANHA A PRETA.
     * Quando os narizes se encavalam, a perna preta do vizinho é ESTICADA até o
     * cap da cunha e a cunha não constrói perna própria. A linha de sinalização
     * dele tem de ser esticada igual — senão a preta chega à ponta da ilha e a
     * branca morre a meio da curva. */
    const trechoBordoEntre = (bordo: Pt2[], origem: Pt2, destino: Pt2): Pt2[] => {
      if (!bordo || bordo.length < 2) return [];
      const i0 = peNaPolilinha(origem, bordo).index;
      const passoS = 0.5;
      const alcanceS = Math.hypot(destino.x - origem.x, destino.y - origem.y) * 3 + 40;
      let melhor = { d: Infinity, s: 0, dir: 1 as 1 | -1 };
      for (const dir of [1, -1] as (1 | -1)[]) {
        for (let s = 0; s <= alcanceS; s += passoS) {
          const q = andarSeguro(bordo, i0, dir, s);
          const d = Math.hypot(q.x - destino.x, q.y - destino.y);
          if (d < melhor.d) melhor = { d, s, dir };
        }
      }
      if (melhor.s < passoS) return [];
      const out: Pt2[] = [{ x: origem.x, y: origem.y }];
      for (let s = passoS; s <= melhor.s + 1e-6; s += passoS) {
        out.push(andarSeguro(bordo, i0, melhor.dir, s));
      }
      return out.length > 1 ? out : [];
    };

    let legA: Pt2[] = [capA];
    let legB: Pt2[] = [capB];

    if (neighborA && offA && offA.length > 1) {
      const capNeighborA = getCapPointOnArm(neighborA.geom, offA);
      const linhaA = trechoPolyline(offA, capNeighborA, capA);
      const distA = compPoly(linhaA);
      const compNeighA = neighborA.par?.comprimento ?? COMPR_NARIZ_FISICO ?? 25.0;
      const limiteEncavalarA = compVal + compNeighA;

      if (distA <= limiteEncavalarA) {
        // Se encavalam (distância total <= 50m ou compA + compB): uma linha contínua uniforme com offset 1,00m
        neighborA.geom.bordo = linhaA;
        neighborA.geom.q = capA;
        neighborA.modo = 'uniforme';
        /* Destino é o NT da cunha, não o cap: o cap é o recuo do nariz FÍSICO,
           mas o bordo verdadeiro segue até o cruzamento teórico. */
        const sinalA = trechoBordoEntre(bA, neighborA.nt, V);
        if (sinalA.length > 1) neighborA.geom.sinal = sinalA;
      } else {
        // Deixam de se encavalar (> 25m + 25m): ambos rodam aos 25m de volta ao bordo verdadeiro
        const pA = construirPernaFisica(capA, bA, offA, dirA, compVal, p.modo, bB);
        legA = pA.bordo;

        if ((neighborA as any).origBordo && (neighborA as any).origBordo.length > 1) {
          neighborA.geom.bordo = [...(neighborA as any).origBordo];
          neighborA.geom.q = (neighborA as any).origQ || neighborA.geom.bordo[neighborA.geom.bordo.length - 1];
          neighborA.modo = neighborA.par?.modoTransicao || 'auto';
        }
      }
    } else {
      const pA = construirPernaFisica(capA, bA, offA, dirA, compVal, p.modo, bB);
      legA = pA.bordo;
    }

    if (neighborB && offB && offB.length > 1) {
      const capNeighborB = getCapPointOnArm(neighborB.geom, offB);
      const linhaB = trechoPolyline(offB, capNeighborB, capB);
      const distB = compPoly(linhaB);
      const compNeighB = neighborB.par?.comprimento ?? COMPR_NARIZ_FISICO ?? 25.0;
      const limiteEncavalarB = compVal + compNeighB;

      if (distB <= limiteEncavalarB) {
        // Se encavalam: uma linha contínua uniforme com offset 1,00m
        neighborB.geom.bordo = linhaB;
        neighborB.geom.q = capB;
        neighborB.modo = 'uniforme';
        const sinalB2 = trechoBordoEntre(bB, neighborB.nt, V);
        if (sinalB2.length > 1) neighborB.geom.sinal = sinalB2;
      } else {
        // Deixam de se encavalar: ambos rodam aos 25m de volta ao bordo verdadeiro
        const pB = construirPernaFisica(capB, bB, offB, dirB, compVal, p.modo, bA);
        legB = pB.bordo;

        if ((neighborB as any).origBordo && (neighborB as any).origBordo.length > 1) {
          neighborB.geom.bordo = [...(neighborB as any).origBordo];
          neighborB.geom.q = (neighborB as any).origQ || neighborB.geom.bordo[neighborB.geom.bordo.length - 1];
          neighborB.modo = neighborB.par?.modoTransicao || 'auto';
        }
      }
    } else {
      const pB = construirPernaFisica(capB, bB, offB, dirB, compVal, p.modo, bA);
      legB = pB.bordo;
    }

    /* LINHA BRANCA DA CUNHA — o bordo verdadeiro que passou a ficar sob o
     * pavimento, uma perna por ramo. A construção de cunha nunca a calculava
     * (devolvia `sinal: []`), então o nariz de ponta de cunha era o único sem
     * sinalização. Alcance vindo do comprimento da própria perna preta, para a
     * branca cobrir exactamente o mesmo trecho. */
    const trechoSinal = (bordo: Pt2[], i0: number, dir: 1 | -1, perna: Pt2[]): Pt2[] => {
      if (!bordo || bordo.length < 2 || !perna || perna.length < 2) return [];
      const P = perna[perna.length - 1];
      const alcanceSinal = compPoly(perna) * 1.5 + 20;
      const passoSinal = 0.5;
      let bestD = Infinity, bestS = 0;
      for (let s = 0; s <= alcanceSinal; s += passoSinal) {
        const q = andarSeguro(bordo, i0, dir, s);
        const d = Math.hypot(q.x - P.x, q.y - P.y);
        if (d < bestD) { bestD = d; bestS = s; }
      }
      if (bestS < passoSinal) return [];
      const out: Pt2[] = [{ x: V.x, y: V.y }];
      for (let s = passoSinal; s <= bestS + 1e-6; s += passoSinal) {
        out.push(andarSeguro(bordo, i0, dir, s));
      }
      return out.length > 1 ? out : [];
    };

    const meio = { x: (capB.x + capA.x) / 2, y: (capB.y + capA.y) / 2 };
    const goreGeom: NarizResolvido = {
      nt: p.nt, key: p.key, par: p.par, larguraEfetiva: w, modo: p.modo,
      geom: {
        nf: capA,
        cap: [capB, capA],
        bordo: armAEhPista ? [] : legA,
        bordoB: armBEhPista ? [] : legB,
        q: legA[legA.length - 1] || capA,
        amarra: [meio, V],
        sinal: armAEhPista ? [] : trechoSinal(bA, iA, dirA, legA),
        sinalB: armBEhPista ? [] : trechoSinal(bB, iB, dirB, legB),
        giro: 0,
        corda: w,
        larguraReal: w,
        gore: true,
      },
    };

    const idxExistente = raw.findIndex((r) => r.key === p.key);
    if (idxExistente >= 0) {
      raw[idxExistente] = goreGeom;
    } else {
      raw.push(goreGeom);
    }
  }

  const dict: Record<string, NarizResolvido> = {};
  raw.forEach((r) => { dict[r.key] = r; });
  return dict;
};

/* ═══════════════════════════════════════════════════════════════════════
 * CASAR O FILLETE COM OS BORDOS REAIS — filosofia BORDO-COM-BORDO
 *
 * buildIntersectionPolygon resolve reta×reta: os braços que a alimentam são a
 * tangente ao bordo na estaca do cruzamento, prolongada. Em TANGENTE isso
 * coincide com o bordo; em CURVA a reta descola poucas dezenas de metros
 * adiante e o arco fecha na RETA — erra o BORDO, e o quadrante não gruda.
 *
 * Aqui o arco é refeito contra as POLILINHAS dos dois bordos verdadeiros,
 * mantendo o raio de projeto: o centro de uma concordância de raio R equidista
 * R das duas bordas, logo está na interseção do offset R de um com o offset R
 * do outro. Vale reta×reta, reta×curva e curva×curva.
 *
 * Marca `arc.__bordoOk = true` quando consegue — quem chama sabe que a
 * geometria já está casada e não deve aplicar nenhum método por cima.
 * ═══════════════════════════════════════════════════════════════════════ */

const projPoliFB = (pts: Pt2[], q: Pt2) => {
  let m = { d: Infinity, i: 0, t: 0, x: q.x, y: q.y };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const l2 = vx * vx + vy * vy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy) / l2)) : 0;
    const x = a.x + t * vx;
    const y = a.y + t * vy;
    const d = Math.hypot(q.x - x, q.y - y);
    if (d < m.d) m = { d, i, t, x, y };
  }
  return m;
};

/** Pé da perpendicular numa polilinha, com a tangente unitária no pé. */
const peNaPoliFB = (pts: Pt2[], q: Pt2) => {
  const p = projPoliFB(pts, q);
  const a = pts[p.i];
  const b = pts[p.i + 1];
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { ...p, ux: (b.x - a.x) / l, uy: (b.y - a.y) / l };
};

const cruzaSegSegFB = (A: Pt2, B: Pt2, C: Pt2, D: Pt2): Pt2 | null => {
  const r = { x: B.x - A.x, y: B.y - A.y };
  const s = { x: D.x - C.x, y: D.y - C.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((C.x - A.x) * s.y - (C.y - A.y) * s.x) / den;
  const u = ((C.x - A.x) * r.y - (C.y - A.y) * r.x) / den;
  if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) return null;
  return { x: A.x + t * r.x, y: A.y + t * r.y };
};

/** Segmentos do offset R de uma polilinha, do lado pedido. */
const offSegsFB = (pts: Pt2[], sinal: number, R: number) => {
  const segs: { A: Pt2; B: Pt2 }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len = Math.hypot(vx, vy);
    if (len < 1e-6) continue;
    const nx = (-vy / len) * sinal * R;
    const ny = (vx / len) * sinal * R;
    segs.push({ A: { x: a.x + nx, y: a.y + ny }, B: { x: b.x + nx, y: b.y + ny } });
  }
  return segs;
};

export interface CasarFilleteOpts {
  /** Tolerância de tangência exigida nos dois bordos (m). */
  tolTang?: number;
  /** Quanto o centro pode migrar, em múltiplos de R. */
  maxMigra?: number;
}

/**
 * Refaz `edge.arcInfo` (center, T1, T2) tangente aos DOIS bordos reais.
 * `bordoMain` e `bordoRamo` são polilinhas no MESMO referencial de arcInfo.
 * `mainEhT1` diz qual das tangências pertence à principal.
 * Devolve true quando casou — e só nesse caso mexe no arco.
 */
export const casarFilleteComBordos = (
  edge: any,
  bordoMain: Pt2[],
  bordoRamo: Pt2[],
  mainEhT1: boolean,
  opts: CasarFilleteOpts = {},
): boolean => {
  const arc = edge?.arcInfo;
  if (!arc || !(arc.R > 0)) return false;
  if (!bordoMain || bordoMain.length < 3) return false;
  if (!bordoRamo || bordoRamo.length < 2) return false;

  const tolTang = opts.tolTang ?? 0.25;
  const maxMigra = opts.maxMigra ?? 6;
  const R = arc.R;
  const peM = (q: Pt2) => peNaPoliFB(bordoMain, q);
  const peB = (q: Pt2) => peNaPoliFB(bordoRamo, q);

  /* Lado do centro em relação a cada bordo — o offset tem de ir para o lado
   * onde o centro já está, senão o fillete salta para o quadrante oposto. */
  const pe0 = peM(arc.center);
  const sM = (arc.center.x - pe0.x) * -pe0.uy + (arc.center.y - pe0.y) * pe0.ux >= 0 ? 1 : -1;
  const pr0 = peB(arc.center);
  const sB = (arc.center.x - pr0.x) * -pr0.uy + (arc.center.y - pr0.y) * pr0.ux >= 0 ? 1 : -1;

  const segsM = offSegsFB(bordoMain, sM, R);
  const segsB = offSegsFB(bordoRamo, sB, R);
  let melhor: Pt2 | null = null;
  let melhorD = Infinity;
  for (const s1 of segsM) {
    for (const s2 of segsB) {
      const hit = cruzaSegSegFB(s1.A, s1.B, s2.A, s2.B);
      if (!hit) continue;
      const d = Math.hypot(hit.x - arc.center.x, hit.y - arc.center.y);
      if (d < melhorD) {
        melhorD = d;
        melhor = hit;
      }
    }
  }

  /* NEWTON GEOMÉTRICO — os offsets podem não se cruzar dentro do trecho
   * recortado (bordo curto, quina, offset auto-interceptado). Aí caminha sobre
   * o offset do ramo até a distância ao bordo da principal valer R. */
  const refina = (partida: Pt2, iters: number) => {
    let c = { x: partida.x, y: partida.y };
    for (let k = 0; k < iters; k++) {
      const pr = peB(c);
      c = { x: pr.x + -pr.uy * sB * R, y: pr.y + pr.ux * sB * R };
      const pm = peM(c);
      const err = pm.d - R;
      if (Math.abs(err) < 0.002) break;
      const dirErr =
        ((c.x - pm.x) / Math.max(pm.d, 1e-6)) * pr.ux +
        ((c.y - pm.y) / Math.max(pm.d, 1e-6)) * pr.uy;
      const passo = Math.max(-R, Math.min(R, -err / Math.max(0.15, Math.abs(dirErr))));
      c = { x: c.x + pr.ux * passo, y: c.y + pr.uy * passo };
    }
    return c;
  };

  if (!melhor) {
    const c = refina(arc.center, 40);
    if (Math.abs(peM(c).d - R) < 0.08) {
      melhor = c;
      melhorD = Math.hypot(c.x - arc.center.x, c.y - arc.center.y);
    }
  }
  if (!melhor || melhorD > maxMigra * R) return false;

  /* Segundo passo de Newton: o cruzamento de offsets é exato em reta×reta, mas
   * em curva×curva a discretização da polilinha deixa centímetros na mesa. */
  let peT = peM(melhor);
  let prT = peB(melhor);
  if (Math.abs(peT.d - R) > 0.02 || Math.abs(prT.d - R) > 0.02) {
    const c2 = refina(melhor, 25);
    const e2 = Math.max(Math.abs(peM(c2).d - R), Math.abs(peB(c2).d - R));
    const e1 = Math.max(Math.abs(peT.d - R), Math.abs(prT.d - R));
    if (e2 < e1 && Math.hypot(c2.x - arc.center.x, c2.y - arc.center.y) <= maxMigra * R) {
      melhor = c2;
      peT = peM(melhor);
      prT = peB(melhor);
    }
  }

  /* Tangência exigida nos DOIS bordos — um centro tangente só à principal
   * deslocaria o arco para fora do ramo. */
  if (Math.abs(peT.d - R) > tolTang || Math.abs(prT.d - R) > tolTang) return false;

  const Tmain = { x: peT.x, y: peT.y };
  const Tramo = { x: prT.x, y: prT.y };
  arc.center = melhor;
  if (mainEhT1) {
    arc.T1 = Tmain;
    arc.T2 = Tramo;
  } else {
    arc.T2 = Tmain;
    arc.T1 = Tramo;
  }
  arc.__bordoOk = true;
  arc.__erroTang = Math.max(Math.abs(peT.d - R), Math.abs(prT.d - R));
  return true;
};

/** Qual bordo de ramo este quadrante encosta: o mais próximo da tangência. */
export const escolherBordoRamo = (
  cands: (Pt2[] | undefined | null)[],
  perto: Pt2,
): Pt2[] | null => {
  const bons = cands.filter((p) => p && p.length >= 2) as Pt2[][];
  if (bons.length === 0) return null;
  let melhor = bons[0];
  let d = projPoliFB(melhor, perto).d;
  for (let i = 1; i < bons.length; i++) {
    const di = projPoliFB(bons[i], perto).d;
    if (di < d) {
      d = di;
      melhor = bons[i];
    }
  }
  return melhor;
};

/** Qual braço da aresta é a principal (`M-…`) — T1 quando o id começa por ele. */
export const mainEhT1DoEdge = (edgeId: string): boolean | null => {
  const armIds = ["M-Fwd", "M-Back", "B-Arm"];
  const rA = armIds.find((a) => edgeId.startsWith(a)) || "";
  const rB = armIds.find((a) => edgeId.endsWith(a)) || "";
  if (!rA || !rB) return null;
  const aEhMain = rA.startsWith("M-");
  if (aEhMain === rB.startsWith("M-")) return null; // precisa de um braço de cada
  return aEhMain;
};
