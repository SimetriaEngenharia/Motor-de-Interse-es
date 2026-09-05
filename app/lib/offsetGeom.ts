// Offset EXATO de alinhamento, elemento a elemento.
//
// O bordo do corredor hoje nasce de amostragem: percorre estacas, aplica o
// offset da seção, devolve nuvem de pontos — e a geometria do eixo se perde.
// Aqui o caminho é o inverso: para cada elemento do alinhamento horizontal
// existe solução analítica do offset,
//
//   RETA        → reta paralela (mesma direção, transladada d)
//   CURVA (R)   → arco CONCÊNTRICO, mesmo centro, raio R ∓ d
//   ESPIRAL     → o offset de clotoide NÃO é clotoide: sai como TRANSIÇÃO
//                 declarada (amostrada), nunca disfarçada de arco.
//
// Convenção: d > 0 desloca para a DIREITA do sentido de estaqueamento.

import { GeomSegment, Pt } from "./geomExtract";
import { AlignmentPoint } from "./alignment";

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const norm = (a: Pt): Pt => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
/** normal à DIREITA do sentido de caminhamento */
const right = (d: Pt): Pt => ({ x: d.y, y: -d.x });

export interface OffsetElement extends GeomSegment {
  /** elemento de origem no eixo */
  origem: "reta" | "curva" | "transicao";
  /** raio do eixo que gerou este elemento (curva) */
  raioEixo?: number;
  /** true quando o offset degenerou (d ≥ R do lado interno) */
  degenerado?: boolean;
}

export interface OffsetResult {
  elements: OffsetElement[];
  /** trechos que não puderam ser resolvidos analiticamente */
  transicoes: number;
  degenerados: number;
}

/** PIs do alinhamento: usa keyPoints quando houver, senão os pontos. */
export const extractPIs = (align: { keyPoints?: AlignmentPoint[]; points: AlignmentPoint[] }): AlignmentPoint[] => {
  const kp = align.keyPoints || [];
  const pis = kp.filter((p) => p.pi);
  if (pis.length === 0) {
    // sem PIs marcados: trata como polilinha de vértices
    return align.points.map((p) => ({ ...p }));
  }
  const first = align.points[0];
  const last = align.points[align.points.length - 1];
  const out: AlignmentPoint[] = [];
  if (first && len(sub(first, pis[0])) > 1e-6) out.push({ ...first });
  out.push(...pis);
  if (last && len(sub(last, pis[pis.length - 1])) > 1e-6) out.push({ ...last });
  return out;
};

/**
 * Constrói a cadeia exata do bordo a offset `d`.
 *
 * `sampler` é opcional e só é usado nas ESPIRAIS (e quando não há PIs):
 * recebe a estaca e devolve ponto + normal, para amostrar a transição.
 */
export const buildOffsetGeometry = (
  pis: AlignmentPoint[],
  d: number,
  sampler?: (sta: number) => { p: Pt; nRight: Pt } | null,
): OffsetResult => {
  const elements: OffsetElement[] = [];
  let transicoes = 0, degenerados = 0;
  if (pis.length < 2) return { elements, transicoes, degenerados };

  const mkLine = (p1: Pt, p2: Pt, origem: OffsetElement["origem"]): OffsetElement => ({
    type: "line", p1, p2, length: len(sub(p2, p1)), origem,
  });

  // ponta anterior sobre o offset (começa no offset do 1º vértice)
  const d0 = norm(sub(pis[1], pis[0]));
  let cursor: Pt = add(pis[0], mul(right(d0), d));

  for (let i = 1; i < pis.length - 1; i++) {
    const A = pis[i - 1], V = pis[i], B = pis[i + 1];
    const dIn = norm(sub(V, A));
    const dOut = norm(sub(B, V));
    const R = V.radius || 0;
    const temEspiral = (V.spiralIn || 0) > 0 || (V.spiralOut || 0) > 0;

    const c = cross(dIn, dOut);
    const defl = Math.acos(Math.max(-1, Math.min(1, dot(dIn, dOut))));

    // sem curva, ou deflexão nula: segue reto
    if (R <= 0 || defl < 1e-6) {
      const alvo = add(V, mul(right(dIn), d));
      elements.push(mkLine(cursor, alvo, "reta"));
      cursor = alvo;
      continue;
    }

    const T = R * Math.tan(defl / 2);
    const PC = add(V, mul(dIn, -T));
    const PT = add(V, mul(dOut, T));
    // centro: do lado para onde a curva vira
    const nCentro = c > 0 ? { x: -dIn.y, y: dIn.x } : { x: dIn.y, y: -dIn.x };
    const centro = add(PC, mul(nCentro, R));

    // tangente de entrada, no offset
    const PCoff = add(PC, mul(right(dIn), d));
    const PToff = add(PT, mul(right(dOut), d));
    elements.push(mkLine(cursor, PCoff, "reta"));

    if (temEspiral && sampler) {
      // Offset de clotoide não é clotoide: amostra e declara como transição.
      const pts: Pt[] = [PCoff];
      const staPC = (V.sta ?? 0) - T, staPT = (V.sta ?? 0) + T;
      const n = 24;
      for (let k = 1; k < n; k++) {
        const s = staPC + (staPT - staPC) * (k / n);
        const sm = sampler(s);
        if (sm) pts.push(add(sm.p, mul(sm.nRight, d)));
      }
      pts.push(PToff);
      elements.push({
        type: "poly", p1: PCoff, p2: PToff, pts,
        length: pts.reduce((a, p, k) => k ? a + len(sub(p, pts[k - 1])) : 0, 0),
        origem: "transicao", raioEixo: R,
      });
      transicoes++;
      cursor = PToff;
      continue;
    }

    // ARCO CONCÊNTRICO — mesmo centro, raio R ∓ d
    // d>0 é à direita; se o centro está à direita, o offset aproxima do centro.
    const centroADireita = dot(sub(centro, PC), right(dIn)) > 0;
    const Roff = R - d * (centroADireita ? 1 : -1);

    if (Roff <= 1e-6) {
      // offset maior que o raio pelo lado interno: o arco colapsa
      elements.push({ ...mkLine(PCoff, PToff, "curva"), degenerado: true, raioEixo: R });
      degenerados++;
      cursor = PToff;
      continue;
    }

    const ccw = c > 0;
    let sweep = defl * (ccw ? 1 : -1);
    elements.push({
      type: "arc", p1: PCoff, p2: PToff,
      center: centro, radius: Roff, ccw, sweep,
      length: Math.abs(sweep) * Roff,
      origem: "curva", raioEixo: R,
    });
    cursor = PToff;
  }

  // última tangente
  const dn = norm(sub(pis[pis.length - 1], pis[pis.length - 2]));
  const fim = add(pis[pis.length - 1], mul(right(dn), d));
  elements.push(mkLine(cursor, fim, "reta"));

  return { elements, transicoes, degenerados };
};

/** Curvas do eixo, com faixa de estacas coberta por cada uma. */
export const axisCurves = (pis: AlignmentPoint[]) => {
  const out: { staPC: number; staPT: number; center: Pt; R: number; ccw: boolean }[] = [];
  for (let i = 1; i < pis.length - 1; i++) {
    const A = pis[i - 1], V = pis[i], B = pis[i + 1];
    const R = V.radius || 0;
    if (R <= 0 || V.sta === undefined) continue;
    const dIn = norm(sub(V, A)), dOut = norm(sub(B, V));
    const c = cross(dIn, dOut);
    const defl = Math.acos(Math.max(-1, Math.min(1, dot(dIn, dOut))));
    if (defl < 1e-6) continue;
    const T = R * Math.tan(defl / 2);
    const PC = add(V, mul(dIn, -T));
    const nCentro = c > 0 ? { x: -dIn.y, y: dIn.x } : { x: dIn.y, y: -dIn.x };
    out.push({
      staPC: V.sta - T, staPT: V.sta + T,
      center: add(PC, mul(nCentro, R)), R, ccw: c > 0,
    });
  }
  return out;
};

/**
 * Classifica a cadeia de um bordo de largura VARIÁVEL.
 *
 * Onde o offset é constante no trecho, o elemento é aceito como reta/arco — e
 * o arco tem raio e centro CORRIGIDOS para o valor concêntrico exato (R ∓ d),
 * em vez do ajuste por mínimos quadrados. Onde o offset varia (taper,
 * superlargura), o trecho é declarado TRANSIÇÃO: o offset de um círculo não é
 * círculo, e fingir arco ali seria erro de projeto.
 */
export const classifyChain = (
  align: { getNearestStationAndDistance: (x: number, y: number) => { sta: number; dist: number };
           getPointAtStation: (s: number) => Pt;
           getOrientationAtStation: (s: number) => { nx: number; ny: number };
           keyPoints?: AlignmentPoint[]; points: AlignmentPoint[] },
  segs: GeomSegment[],
  tolLargura = 0.05,
): { elements: OffsetElement[]; transicoes: number; exatos: number } => {
  const curvas = axisCurves(extractPIs(align));
  const offsetEm = (p: Pt) => {
    const { sta } = align.getNearestStationAndDistance(p.x, p.y);
    const c = align.getPointAtStation(sta);
    const o = align.getOrientationAtStation(sta);
    return { sta, off: (p.x - c.x) * o.nx + (p.y - c.y) * o.ny };
  };

  const elements: OffsetElement[] = [];
  let transicoes = 0, exatos = 0;

  for (const s of segs) {
    const amostras = [s.p1, s.p2, { x: (s.p1.x + s.p2.x) / 2, y: (s.p1.y + s.p2.y) / 2 }]
      .map(offsetEm).filter((a) => isFinite(a.off));
    if (amostras.length < 2) { elements.push({ ...s, origem: "transicao" }); transicoes++; continue; }

    const offs = amostras.map((a) => a.off);
    const dMin = Math.min(...offs), dMax = Math.max(...offs);
    const dMed = offs.reduce((a, b) => a + b, 0) / offs.length;
    const staMed = amostras.reduce((a, b) => a + b.sta, 0) / amostras.length;

    if (dMax - dMin > tolLargura) {
      // largura variável: transição declarada
      elements.push({ ...s, origem: "transicao" });
      transicoes++;
      continue;
    }

    if (s.type === "arc" && s.center && s.radius) {
      const cv = curvas.find((c) => staMed >= c.staPC - 0.5 && staMed <= c.staPT + 0.5);
      if (cv) {
        // raio concêntrico EXATO no lugar do ajuste
        const nR = { x: s.p1.x - cv.center.x, y: s.p1.y - cv.center.y };
        const dir = align.getOrientationAtStation(staMed);
        const centroADireita = dot({ x: cv.center.x - s.p1.x, y: cv.center.y - s.p1.y },
                                   { x: dir.nx, y: dir.ny }) > 0;
        const Roff = cv.R - dMed * (centroADireita ? 1 : -1);
        if (Roff > 1e-6) {
          const proj = (p: Pt) => {
            const v = norm(sub(p, cv.center));
            return add(cv.center, mul(v, Roff));
          };
          const p1 = proj(s.p1), p2 = proj(s.p2);
          const a0 = Math.atan2(p1.y - cv.center.y, p1.x - cv.center.x);
          const a1 = Math.atan2(p2.y - cv.center.y, p2.x - cv.center.x);
          let sw = a1 - a0;
          while (sw > Math.PI) sw -= 2 * Math.PI;
          while (sw < -Math.PI) sw += 2 * Math.PI;
          elements.push({
            type: "arc", p1, p2, center: cv.center, radius: Roff,
            ccw: sw > 0, sweep: sw, length: Math.abs(sw) * Roff,
            origem: "curva", raioEixo: cv.R,
          });
          exatos++;
          void nR;
          continue;
        }
      }
      elements.push({ ...s, origem: "curva" });
      continue;
    }

    elements.push({ ...s, origem: s.type === "line" ? "reta" : "transicao" });
    if (s.type === "line") exatos++; else transicoes++;
  }

  return { elements, transicoes, exatos };
};
/** Densifica a cadeia de offset em polilinha, mantendo arco fiel. */
export const densifyOffset = (elements: OffsetElement[], sagita = 0.02): Pt[] => {
  const out: Pt[] = [];
  const push = (p: Pt) => {
    const last = out[out.length - 1];
    if (!last || len(sub(p, last)) > 1e-7) out.push(p);
  };
  for (const e of elements) {
    if (e.type === "arc" && e.center && e.radius) {
      const a0 = Math.atan2(e.p1.y - e.center.y, e.p1.x - e.center.x);
      const sw = e.sweep || 0;
      // passo pela sagita: dθ = 2·acos(1 − s/R)
      const dth = e.radius > sagita
        ? 2 * Math.acos(Math.max(-1, Math.min(1, 1 - sagita / e.radius)))
        : Math.PI / 12;
      const n = Math.max(2, Math.ceil(Math.abs(sw) / dth));
      for (let k = 0; k <= n; k++) {
        const a = a0 + sw * (k / n);
        push({ x: e.center.x + e.radius * Math.cos(a), y: e.center.y + e.radius * Math.sin(a) });
      }
    } else if (e.type === "poly" && e.pts) {
      e.pts.forEach(push);
    } else {
      push(e.p1); push(e.p2);
    }
  }
  return out;
};

/**
 * Mede o offset de uma polilinha de bordo em relação ao seu eixo.
 * Serve para decidir se o bordo pode ser reconstruído por offset exato
 * (largura constante) ou se é trecho de largura variável (taper/superlargura),
 * que precisa continuar como transição declarada.
 */
export const measureOffset = (
  align: { getNearestStationAndDistance: (x: number, y: number) => { sta: number; dist: number };
           getPointAtStation: (s: number) => Pt;
           getOrientationAtStation: (s: number) => { nx: number; ny: number } },
  pts: Pt[],
): { medio: number; min: number; max: number; constante: boolean } | null => {
  if (!align || pts.length < 2) return null;
  let min = Infinity, max = -Infinity, soma = 0, n = 0;
  const passo = Math.max(1, Math.floor(pts.length / 40));
  for (let i = 0; i < pts.length; i += passo) {
    const p = pts[i];
    const { sta } = align.getNearestStationAndDistance(p.x, p.y);
    const c = align.getPointAtStation(sta);
    const o = align.getOrientationAtStation(sta);
    const off = (p.x - c.x) * o.nx + (p.y - c.y) * o.ny;
    if (!isFinite(off)) continue;
    min = Math.min(min, off); max = Math.max(max, off);
    soma += off; n++;
  }
  if (!n) return null;
  return { medio: soma / n, min, max, constante: max - min < 0.05 };
};
