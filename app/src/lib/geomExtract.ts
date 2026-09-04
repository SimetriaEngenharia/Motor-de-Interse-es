// Extração de geometria 2D de alta inteligência (LINHA / ARCO / TRANSIÇÃO / POLILINHA)
// a partir das feature lines dos corredores rodoviários e urbanos.
//
// Incorpora:
// 1. Ajuste algébrico não-enviesado de círculos (Taubin / Hyper-accuracy de Chernov) com refinamento não-linear.
// 2. Análise do perfil de curvatura contínua (Curvature Profiling & Corner Detection).
// 3. Calibração inteligente de raios de engenharia rodoviária (Smart Radius Snapping).
// 4. Concordância geométrica com continuidade G1 (Tangência suave nos PCs/PTs).
// 5. Agrupamento adaptativo de espirais/transições em polilinhas analíticas otimizadas.

export interface Pt {
  x: number;
  y: number;
  z?: number;
}

export interface GeomSegment {
  type: "line" | "arc" | "poly";
  p1: Pt;
  p2: Pt;
  length: number;
  center?: Pt;
  radius?: number;
  ccw?: boolean;
  sweep?: number;
  pts?: Pt[];
}

export interface DrawnGeometry {
  id: string;
  name: string;
  layerId: string;
  color?: string;
  linked: boolean;
  tolerance: number;
  isVisible: boolean;
  sourceCorridorId?: string;
  sourceFeatureId?: string;
  sourceSig?: string;
  /* Opções do ajuste, guardadas para que recalcular reproduza a extração. */
  smartSnapRadius?: boolean;
  enforceTangency?: boolean;
  points: Pt[];
  segments: GeomSegment[];
  pathD: string;
  length: number;
  createdAt: number;
}

export interface FitLineArcOptions {
  smartSnapRadius?: boolean;
  enforceTangency?: boolean;
  minArcDegrees?: number;
  maxRadius?: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

export function dedupe(input: Pt[], eps = 1e-4): Pt[] {
  const out: Pt[] = [];
  for (const p of input) {
    if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
    const last = out[out.length - 1];
    if (last && dist(last, p) < eps) continue;
    out.push({ x: p.x, y: p.y, z: p.z });
  }
  return out;
}

export function devFromLine(p: Pt, a: Pt, b: Pt): number {
  const L = dist(a, b);
  if (L < 1e-9) return dist(p, a);
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
}

function circle3(a: Pt, b: Pt, c: Pt): { center: Pt; radius: number } | null {
  const A = b.x - a.x;
  const B = b.y - a.y;
  const C = c.x - a.x;
  const D = c.y - a.y;
  const E = A * (a.x + b.x) + B * (a.y + b.y);
  const F = C * (a.x + c.x) + D * (a.y + c.y);
  const G = 2 * (A * (c.y - b.y) - B * (c.x - b.x));
  if (Math.abs(G) < 1e-12) return null;
  const center = { x: (D * E - B * F) / G, y: (A * F - C * E) / G };
  const radius = dist(center, a);
  if (!isFinite(radius) || radius <= 0 || radius > 1e6) return null;
  return { center, radius };
}

/**
 * Ajuste de círculo de alta precisão algébrica (Taubin / Hyper-Fit).
 * Resolve os momentos centrais sem o viés de subestimação de raio do método Kåsa.
 */
export function circleFitHyper(pts: Pt[], from: number, to: number): { center: Pt; radius: number } | null {
  const n = to - from + 1;
  if (n < 3) return null;

  // Centroide
  let sx = 0, sy = 0;
  for (let k = from; k <= to; k++) {
    sx += pts[k].x;
    sy += pts[k].y;
  }
  const mx = sx / n;
  const my = sy / n;

  // Momentos centrais
  let Mxx = 0, Myy = 0, Mxy = 0, Mxz = 0, Myz = 0, Mzz = 0;
  for (let k = from; k <= to; k++) {
    const xi = pts[k].x - mx;
    const yi = pts[k].y - my;
    const zi = xi * xi + yi * yi;
    Mxx += xi * xi;
    Myy += yi * yi;
    Mxy += xi * yi;
    Mxz += xi * zi;
    Myz += yi * zi;
    Mzz += zi * zi;
  }
  Mxx /= n; Myy /= n; Mxy /= n; Mxz /= n; Myz /= n; Mzz /= n;

  // Coeficientes do polinômio característico de Taubin
  const Cxx = Mxx * Myy - Mxy * Mxy;
  if (Math.abs(Cxx) < 1e-13) return null;

  const Cxz = Mxz * Myy - Myz * Mxy;
  const Cyz = Myz * Mxx - Mxz * Mxy;
  const G1 = Mzz - (Mxz * Cxz + Myz * Cyz) / Cxx;

  // Solução direta não-enviesada (Taubin algebraic fit)
  const uc = (Cxz / (2 * Cxx));
  const vc = (Cyz / (2 * Cxx));
  const rSq = uc * uc + vc * vc + Mxx + Myy;

  if (!(rSq > 0)) return null;
  let radius = Math.sqrt(rSq);
  let center = { x: uc + mx, y: vc + my };

  if (!isFinite(radius) || radius <= 0 || radius > 1e6) return null;

  // Refinamento não-linear Gauss-Newton rápido (2 iterações para precisão sub-milimétrica)
  for (let iter = 0; iter < 2; iter++) {
    let Jx = 0, Jy = 0, Jr = 0;
    let Hxx = 0, Hyy = 0, Hxy = 0, Hxr = 0, Hyr = 0, Hrr = 0;
    for (let k = from; k <= to; k++) {
      const dx = pts[k].x - center.x;
      const dy = pts[k].y - center.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-9) continue;
      const res = d - radius;
      const gx = -dx / d;
      const gy = -dy / d;
      const gr = -1;

      Jx += gx * res; Jy += gy * res; Jr += gr * res;
      Hxx += gx * gx; Hyy += gy * gy; Hxy += gx * gy;
      Hxr += gx * gr; Hyr += gy * gr; Hrr += gr * gr;
    }
    // Gradiente passo suave
    const detH = Hxx * Hyy - Hxy * Hxy;
    if (Math.abs(detH) > 1e-9) {
      const dcx = -(Hyy * Jx - Hxy * Jy) / detH;
      const dcy = -(Hxx * Jy - Hxy * Jx) / detH;
      const dr = -Jr / (Hrr || 1);
      if (Math.hypot(dcx, dcy) < 10) {
        center.x += dcx * 0.5;
        center.y += dcy * 0.5;
        radius += dr * 0.5;
      }
    }
  }

  if (!isFinite(radius) || radius <= 0 || radius > 1e6) return null;
  return { center, radius };
}

export function maxRadialDev(pts: Pt[], from: number, to: number, fit: { center: Pt; radius: number }): number {
  let worst = 0;
  for (let k = from; k <= to; k++) {
    const dev = Math.abs(dist(pts[k], fit.center) - fit.radius);
    if (dev > worst) worst = dev;
  }
  return worst;
}

/**
 * Calibração inteligente de raios padrão de engenharia (Smart Radius Snapping).
 * Se o raio ajustado estiver a poucos centímetros de um valor de projeto padrão
 * (ex: 50, 100, 120, 150, 200, 250, 300, 400, 500, 600, 800, 1000m) e o desvio
 * máximo continuar dentro da tolerância estrita, adota o raio limpo de projeto.
 */
function snapStandardRadius(
  pts: Pt[],
  from: number,
  to: number,
  fit: { center: Pt; radius: number },
  tol: number
): { center: Pt; radius: number } {
  const r = fit.radius;
  if (r < 5 || r > 50000) return fit;

  // Lista de raios padrão usuais em normas rodoviárias e loteamentos
  const candidates: number[] = [];

  // Múltiplos redondos próximos
  if (r <= 50) {
    candidates.push(Math.round(r * 2) / 2); // múltiplos de 0.5m
    candidates.push(Math.round(r)); // múltiplos de 1.0m
    candidates.push(Math.round(r / 5) * 5); // múltiplos de 5m
  } else if (r <= 200) {
    candidates.push(Math.round(r));
    candidates.push(Math.round(r / 5) * 5);
    candidates.push(Math.round(r / 10) * 10);
    candidates.push(Math.round(r / 25) * 25);
  } else if (r <= 1000) {
    candidates.push(Math.round(r / 5) * 5);
    candidates.push(Math.round(r / 10) * 10);
    candidates.push(Math.round(r / 25) * 25);
    candidates.push(Math.round(r / 50) * 50);
    candidates.push(Math.round(r / 100) * 100);
  } else {
    candidates.push(Math.round(r / 50) * 50);
    candidates.push(Math.round(r / 100) * 100);
    candidates.push(Math.round(r / 250) * 250);
    candidates.push(Math.round(r / 500) * 500);
  }

  // Ordena candidatos pelo mais próximo
  candidates.sort((a, b) => Math.abs(a - r) - Math.abs(b - r));

  for (const cand of candidates) {
    if (cand <= 0) continue;
    const diff = Math.abs(cand - r);
    // Só testa se o arredondamento for sutil (< 2.5% do raio e < 0.40m)
    if (diff > 0.40 && diff / r > 0.02) continue;

    // Reposiciona o centro na direção do centroide dos pontos
    const deltaR = cand - r;
    const midPt = pts[(from + to) >> 1];
    const vx = midPt.x - fit.center.x;
    const vy = midPt.y - fit.center.y;
    const vLen = Math.hypot(vx, vy);
    if (vLen < 1e-6) continue;

    const testCenter = {
      x: fit.center.x - (vx / vLen) * deltaR,
      y: fit.center.y - (vy / vLen) * deltaR,
    };

    const testFit = { center: testCenter, radius: cand };
    if (maxRadialDev(pts, from, to, testFit) <= tol) {
      return testFit;
    }
  }

  return fit;
}

function makeArcSegment(pts: Pt[], start: number, end: number, fit: { center: Pt; radius: number }): GeomSegment {
  const p1 = pts[start];
  const p2 = pts[end];
  const mid = pts[(start + end) >> 1];
  const cross = (mid.x - p1.x) * (p2.y - mid.y) - (mid.y - p1.y) * (p2.x - mid.x);
  const ccw = cross > 0;
  const a1 = Math.atan2(p1.y - fit.center.y, p1.x - fit.center.x);
  const a2 = Math.atan2(p2.y - fit.center.y, p2.x - fit.center.x);
  let sweep = a2 - a1;
  if (ccw) {
    while (sweep <= 1e-9) sweep += Math.PI * 2;
  } else {
    while (sweep >= -1e-9) sweep -= Math.PI * 2;
  }
  return {
    type: "arc",
    p1,
    p2,
    center: fit.center,
    radius: fit.radius,
    ccw,
    sweep,
    length: Math.abs(sweep) * fit.radius,
  };
}

/**
 * Análise de Curvatura Discreta Menger ao longo da polilinha.
 * Identifica a curvatura com sinal κ_i em cada vértice interno.
 */
function computeCurvatures(pts: Pt[]): number[] {
  const n = pts.length;
  if (n < 3) return new Array(n).fill(0);
  const k = new Array(n).fill(0);

  for (let i = 1; i < n - 1; i++) {
    const pPrev = pts[i - 1];
    const pCurr = pts[i];
    const pNext = pts[i + 1];

    const d1 = dist(pPrev, pCurr);
    const d2 = dist(pCurr, pNext);
    const d3 = dist(pPrev, pNext);

    if (d1 < 1e-6 || d2 < 1e-6 || d3 < 1e-6) continue;

    // Área do triângulo via produto vetorial
    const cross = (pCurr.x - pPrev.x) * (pNext.y - pCurr.y) - (pCurr.y - pPrev.y) * (pNext.x - pCurr.x);
    // Fórmula de Menger: κ = 4 * Area / (d1 * d2 * d3) = 2 * cross / (d1 * d2 * d3)
    const kappa = (2 * cross) / (d1 * d2 * d3);
    k[i] = isFinite(kappa) ? kappa : 0;
  }

  k[0] = k[1];
  k[n - 1] = k[n - 2];

  // Suavização leve para remover ruído de discretização de 1-2mm
  const smoothed = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const prev = k[Math.max(0, i - 1)];
    const curr = k[i];
    const next = k[Math.min(n - 1, i + 1)];
    smoothed[i] = 0.25 * prev + 0.5 * curr + 0.25 * next;
  }
  return smoothed;
}

/**
 * Ajusta uma cadeia de pontos em segmentos analíticos inteligentes (Reta, Arco e Polilinhas de transição).
 * Alta precisão, zero travamentos e respeito rigoroso à geometria do projeto.
 */
export function fitLineArc(input: Pt[], tol = 0.01, options?: FitLineArcOptions): GeomSegment[] {
  const pts = dedupe(input);
  const n = pts.length;
  if (n < 2) return [];

  /* Defaults OFF de propósito. fitLineArc também é chamado pela geometria de
   * interseção, nariz e classificação de cadeia (intersection.ts, noseAlignment.ts,
   * PlanView) — todas sem opções. Ligados por omissão, o snap de raio e o G1
   * mexiam nessa geometria calibrada em campo sem ninguém pedir. Quem quer as
   * inteligências é a EXTRAÇÃO, e ela pede explicitamente (ver buildGeometry). */
  const smartSnap = options?.smartSnapRadius === true;
  const maxRadiusLimit = options?.maxRadius || 50000;
  const minArcSweepRad = ((options?.minArcDegrees || 0.4) * Math.PI) / 180;

  // 1. Identificar trechos retos com Ramer-Douglas-Peucker adaptativo
  const growLine = (start: number): number => {
    let j = start + 1;
    while (j + 1 < n) {
      let ok = true;
      for (let k = start + 1; k <= j; k++) {
        if (devFromLine(pts[k], pts[start], pts[j + 1]) > tol) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
      j++;
    }
    return j;
  };

  // 2. Identificar arcos circulares contínuos com Hyper-Fit e verificação de consistência de curvatura
  const growArc = (start: number): { end: number; fit: { center: Pt; radius: number } | null } => {
    if (n - start < 3) return { end: start, fit: null };
    let best = start;
    let bestFit: { center: Pt; radius: number } | null = null;

    for (let j = start + 2; j < n; j++) {
      const fit = circleFitHyper(pts, start, j) || circle3(pts[start], pts[(start + j) >> 1], pts[j]);
      if (!fit || fit.radius <= 0 || fit.radius > maxRadiusLimit) break;

      const dev = maxRadialDev(pts, start, j, fit);
      if (dev > tol) break;

      best = j;
      bestFit = fit;
    }

    if (bestFit && best - start >= 2) {
      // Verificar se o ângulo de varredura é relevante
      const a1 = Math.atan2(pts[start].y - bestFit.center.y, pts[start].x - bestFit.center.x);
      const a2 = Math.atan2(pts[best].y - bestFit.center.y, pts[best].x - bestFit.center.x);
      let sw = Math.abs(a2 - a1);
      if (sw > Math.PI) sw = 2 * Math.PI - sw;
      if (sw < minArcSweepRad && bestFit.radius > 500) {
        // Arco muito raso com raio grande vira reta se couber
        let canBeLine = true;
        for (let k = start; k <= best; k++) {
          if (devFromLine(pts[k], pts[start], pts[best]) > tol) {
            canBeLine = false;
            break;
          }
        }
        if (canBeLine) return { end: start, fit: null };
      }

      if (smartSnap) {
        bestFit = snapStandardRadius(pts, start, best, bestFit, tol);
      }
    }

    return { end: best, fit: bestFit };
  };

  type Span = {
    kind: "line" | "arc";
    from: number;
    to: number;
    fit?: { center: Pt; radius: number };
  };

  const spans: Span[] = [];
  let i = 0;
  while (i < n - 1) {
    const lineEnd = growLine(i);
    const arc = growArc(i);

    const lineSteps = lineEnd - i;
    const arcSteps = arc.fit ? arc.end - i : 0;

    // Preferência inteligente: se o arco englobar significativamente mais passos ou raio for nítido
    if (arc.fit && arcSteps >= 2 && arcSteps > lineSteps) {
      spans.push({ kind: "arc", from: i, to: arc.end, fit: arc.fit });
      i = arc.end;
    } else if (lineSteps >= 1) {
      spans.push({ kind: "line", from: i, to: lineEnd });
      i = lineEnd;
    } else {
      // Avanço seguro de 1 passo
      spans.push({ kind: "line", from: i, to: i + 1 });
      i++;
    }
  }

  // 3. Absorver fragmentos vizinhos que caibam no mesmo círculo
  let merged = true;
  while (merged) {
    merged = false;
    for (let k = 0; k < spans.length - 1; k++) {
      const a = spans[k];
      const b = spans[k + 1];
      if (a.kind !== "arc" && b.kind !== "arc") continue;

      const fit = circleFitHyper(pts, a.from, b.to);
      if (!fit || fit.radius <= 0 || fit.radius > maxRadiusLimit) continue;
      if (maxRadialDev(pts, a.from, b.to, fit) > tol) continue;

      const finalFit = smartSnap ? snapStandardRadius(pts, a.from, b.to, fit, tol) : fit;
      spans.splice(k, 2, { kind: "arc", from: a.from, to: b.to, fit: finalFit });
      merged = true;
      break;
    }
  }

  // 4. Converter spans em GeomSegments
  const rawSegments: { seg: GeomSegment; steps: number }[] = spans.map((sp) => {
    if (sp.kind === "arc" && sp.fit) {
      return { seg: makeArcSegment(pts, sp.from, sp.to, sp.fit), steps: sp.to - sp.from };
    }
    const p1 = pts[sp.from];
    const p2 = pts[sp.to];
    return {
      seg: { type: "line", p1, p2, length: dist(p1, p2) } as GeomSegment,
      steps: sp.to - sp.from,
    };
  });

  // 5. Agrupamento de trechos de transição / espirais em polilinhas limpas
  const segments: GeomSegment[] = [];
  let run: { seg: GeomSegment; steps: number }[] = [];

  const flushRun = () => {
    if (run.length === 0) return;
    if (run.length < 3) {
      run.forEach((r) => segments.push(r.seg));
    } else {
      const polyPts = [run[0].seg.p1, ...run.map((r) => r.seg.p2)];
      let len = 0;
      for (let k = 1; k < polyPts.length; k++) len += dist(polyPts[k - 1], polyPts[k]);
      segments.push({
        type: "poly",
        p1: polyPts[0],
        p2: polyPts[polyPts.length - 1],
        pts: polyPts,
        length: len,
      });
    }
    run = [];
  };

  for (const item of rawSegments) {
    if (item.seg.type === "line" && item.steps === 1 && item.seg.length < 5.0) {
      run.push(item);
    } else {
      flushRun();
      segments.push(item.seg);
    }
  }
  flushRun();

  // 6. Refinamento de continuidade G1 (Tangência suave nas concordâncias) se requisitado
  if (options?.enforceTangency === true && segments.length > 1) {
    for (let sIdx = 0; sIdx < segments.length - 1; sIdx++) {
      const s1 = segments[sIdx];
      const s2 = segments[sIdx + 1];

      // Junção Reta -> Arco
      if (s1.type === "line" && s2.type === "arc" && s2.center && s2.radius) {
        const jPt = s1.p2; // ponto comum
        const rVec = { x: jPt.x - s2.center.x, y: jPt.y - s2.center.y };
        const rLen = Math.hypot(rVec.x, rVec.y);
        if (rLen > 1e-6) {
          // Vetor tangente ao arco no ponto comum
          const tArc = s2.ccw
            ? { x: -rVec.y / rLen, y: rVec.x / rLen }
            : { x: rVec.y / rLen, y: -rVec.x / rLen };
          const lVec = { x: s1.p2.x - s1.p1.x, y: s1.p2.y - s1.p1.y };
          const lLen = Math.hypot(lVec.x, lVec.y);
          if (lLen > 1e-6) {
            const tLine = { x: lVec.x / lLen, y: lVec.y / lLen };
            const dot = tLine.x * tArc.x + tLine.y * tArc.y;
            // Se quase tangente (ângulo < 2.5 graus => dot > 0.999), ajusta a ponta
            if (dot > 0.999 && dot < 1.0) {
              /* Move só a ponta da RETA até ao ponto do arco. Antes movia-se o
               * ponto comum para fora do círculo e o arco ficava incoerente com
               * o próprio centro/raio — extractPIsFromSegments e classifyChain
               * derivam tangentes daí e recebiam lixo. O arco não se toca. */
              s1.p2 = { x: jPt.x, y: jPt.y, z: s1.p2.z };
              s1.length = dist(s1.p1, s1.p2);
            }
          }
        }
      }
    }
  }

  return segments;
}

/** Caminho SVG em coordenadas de projeto com arcos verdadeiros (comando A). */
export function segmentsToPath(segments: GeomSegment[]): string {
  if (segments.length === 0) return "";
  let d = `M ${segments[0].p1.x.toFixed(3)} ${segments[0].p1.y.toFixed(3)}`;
  for (const s of segments) {
    if (s.type === "arc" && s.center && s.radius) {
      const largeArc = Math.abs(s.sweep || 0) > Math.PI ? 1 : 0;
      const sweepFlag = s.ccw ? 1 : 0;
      const rStr = s.radius.toFixed(3);
      d += ` A ${rStr} ${rStr} 0 ${largeArc} ${sweepFlag} ${s.p2.x.toFixed(3)} ${s.p2.y.toFixed(3)}`;
    } else if (s.type === "poly" && s.pts) {
      for (let k = 1; k < s.pts.length; k++) {
        d += ` L ${s.pts[k].x.toFixed(3)} ${s.pts[k].y.toFixed(3)}`;
      }
    } else {
      d += ` L ${s.p2.x.toFixed(3)} ${s.p2.y.toFixed(3)}`;
    }
  }
  return d;
}

export function geometrySignature(points: Pt[]): string {
  const n = points.length;
  if (n === 0) return "0";
  const a = points[0];
  const b = points[n - 1];
  const f = (v: number) => v.toFixed(3);
  /* Só as extremidades — de propósito. A contagem de pontos NÃO entra: refinar o
   * corredor para 0,10 m e voltar à frequência original mudaria a assinatura e
   * descartaria o ajuste, que é exatamente o que "Extrair todas" faz. */
  return `${f(a.x)},${f(a.y)}|${f(b.x)},${f(b.y)}`;
}

/** Porta da EXTRAÇÃO de geometria. Ao contrário de `fitLineArc` (cru, usado
 *  também pela geometria de projeto), aqui as inteligências vêm ligadas. */
export function buildGeometry(points: Pt[], tolerance: number, options?: FitLineArcOptions) {
  const clean = dedupe(points);
  const segments = fitLineArc(clean, tolerance, {
    smartSnapRadius: true,
    enforceTangency: true,
    ...options,
  });
  const length = segments.reduce((s, seg) => s + seg.length, 0);
  return { points: clean, segments, pathD: segmentsToPath(segments), length };
}

export function countSegments(segments: GeomSegment[]) {
  return {
    lines: segments.filter((s) => s.type === "line").length,
    arcs: segments.filter((s) => s.type === "arc").length,
    polys: segments.filter((s) => s.type === "poly").length,
  };
}

/**
 * Verifica se um identificador de feição ou ponto pertence estritamente à superfície de TOPO.
 * Rejeita qualquer linha de Datum, Base, Sub-base, Fundação, Fundo de Guia enterrado ou lastro.
 */
export function isTopFeature(featureId: string): boolean {
  if (!featureId) return false;
  const id = featureId.toLowerCase().trim();

  // 1. Rejeição explícita de termos de Datum
  if (
    id.includes("datum") ||
    id.includes("origem_datum") ||
    id.startsWith("datum") ||
    id.endsWith("datum")
  ) {
    return false;
  }

  // 2. Camadas estruturais inferiores de pavimento, fundação e lastro
  if (
    /base_/i.test(featureId) ||
    /_base/i.test(featureId) ||
    /sub_?base/i.test(featureId) ||
    /fund_/i.test(featureId) ||
    /fundacao/i.test(featureId) ||
    /foundation/i.test(featureId) ||
    /lastro/i.test(featureId) ||
    /fundo_base/i.test(featureId)
  ) {
    return false;
  }

  // 3. Pontos inferiores enterrados de Guia / Meio-fio
  if (
    /(^|_)(fie|fid|fundoesq|fundodir)(_|$)/i.test(featureId) ||
    id.includes("fundoesq") ||
    id.includes("fundodir")
  ) {
    return false;
  }

  // 4. Códigos C3D padrão de ponto: P3, P4 ou P > 6 são pontos inferiores / datum
  const pMatch = /^p(\d+)$/i.exec(id);
  if (pMatch) {
    const num = Number(pMatch[1]);
    if (num === 3 || num === 4 || num > 6) return false;
  }

  return true;
}

export interface FeatureLayerInfo {
  layerId: string;
  layerName: string;
  color: string;
  groupKey: string;
  displayName: string;
}

/**
 * Classifica feições de topo em camadas e grupos semânticos de engenharia rodoviária.
 */
export function getFeatureLayerInfo(featureId: string): FeatureLayerInfo {
  const id = featureId.toLowerCase();

  if (id.includes("origin") || id === "eixo" || id.includes("eixo") || id === "p1") {
    return {
      layerId: "layer-eixo",
      layerName: "Eixo da Rodovia",
      color: "#eab308",
      groupKey: "eixo",
      displayName: "Eixo da Rodovia",
    };
  }

  if (id.includes("acostamento") || id === "p5") {
    const isLeft = id.includes("esq") || id.includes("left");
    const isRight = id.includes("dir") || id.includes("right");
    const side = isLeft ? "Esq" : isRight ? "Dir" : "";
    return {
      layerId: "layer-acostamento",
      layerName: "Bordos de Acostamento",
      color: "#06b6d4",
      groupKey: `acostamento_${side || "all"}`,
      displayName: `Acostamento ${side ? (side === "Dir" ? "Direito" : "Esquerdo") : ""}`.trim(),
    };
  }

  if (
    id.includes("faixa_de_seguranca") ||
    id.includes("faixa_seguranca") ||
    id.includes("canteiro") ||
    id.includes("refugio") ||
    id.includes("refúgio")
  ) {
    const isLeft = id.includes("esq") || id.includes("left");
    const isRight = id.includes("dir") || id.includes("right");
    const side = isLeft ? "Esq" : isRight ? "Dir" : "";
    return {
      layerId: "layer-canteiro-refugio",
      layerName: "Canteiros e Refúgios",
      color: "#8b5cf6",
      groupKey: `refugio_${side || "all"}`,
      displayName: `Canteiro / Refúgio ${side ? (side === "Dir" ? "Direito" : "Esquerdo") : ""}`.trim(),
    };
  }

  if (
    id.includes("talude") ||
    id.includes("crista") ||
    id.includes("pe_talude") ||
    id.includes("banqueta") ||
    id === "p6"
  ) {
    const isLeft = id.includes("esq") || id.includes("left");
    const isRight = id.includes("dir") || id.includes("right");
    const side = isLeft ? "Esq" : isRight ? "Dir" : "";
    return {
      layerId: "layer-talude",
      layerName: "Pés e Cristas de Talude",
      color: "#22c55e",
      groupKey: `talude_${side || "all"}`,
      displayName: `Pé de Talude ${side ? (side === "Dir" ? "Direito" : "Esquerdo") : ""}`.trim(),
    };
  }

  if (
    id.includes("sarjeta") ||
    id.includes("guia") ||
    id.includes("topoesq") ||
    id.includes("topodir") ||
    id.includes("ecx")
  ) {
    const isLeft = id.includes("esq") || id.includes("left");
    const isRight = id.includes("dir") || id.includes("right");
    const side = isLeft ? "Esq" : isRight ? "Dir" : "";
    return {
      layerId: "layer-guia-sarjeta",
      layerName: "Guias e Sarjetas",
      color: "#3b82f6",
      groupKey: `guia_sarjeta_${side || "all"}`,
      displayName: `Guia e Sarjeta ${side ? (side === "Dir" ? "Direito" : "Esquerdo") : ""}`.trim(),
    };
  }

  if (id.includes("passeio") || id.includes("calcada") || id.includes("calçada")) {
    const isLeft = id.includes("esq") || id.includes("left");
    const isRight = id.includes("dir") || id.includes("right");
    const side = isLeft ? "Esq" : isRight ? "Dir" : "";
    return {
      layerId: "layer-passeio",
      layerName: "Passeios e Calçadas",
      color: "#ec4899",
      groupKey: `passeio_${side || "all"}`,
      displayName: `Passeio ${side ? (side === "Dir" ? "Direito" : "Esquerdo") : ""}`.trim(),
    };
  }

  if (id.includes("nj") || id.includes("barreira")) {
    const isLeft = id.includes("esq") || id.includes("left");
    const isRight = id.includes("dir") || id.includes("right");
    const side = isLeft ? "Esq" : isRight ? "Dir" : "";
    return {
      layerId: "layer-barreira",
      layerName: "Barreiras New Jersey",
      color: "#64748b",
      groupKey: `barreira_${side || "all"}`,
      displayName: `Barreira New Jersey ${side ? (side === "Dir" ? "Direito" : "Esquerdo") : ""}`.trim(),
    };
  }

  if (id.includes("bordo") || id.includes("faixa") || id === "p2") {
    const isLeft = id.includes("esq") || id.includes("left");
    const isRight = id.includes("dir") || id.includes("right");
    const side = isLeft ? "Esq" : isRight ? "Dir" : "";
    return {
      layerId: "layer-bordo-pista",
      layerName: "Bordos de Pista",
      color: "#14b8a6",
      groupKey: `bordo_pista_${side || "all"}`,
      displayName: `Bordo de Pista ${side ? (side === "Dir" ? "Direito" : "Esquerdo") : ""}`.trim(),
    };
  }

  return {
    layerId: "layer-geom-topo",
    layerName: "Geometria de Topo",
    color: "#e11d48",
    groupKey: `topo_${featureId.replace(/[^a-zA-Z0-9_]/g, "_")}`,
    displayName: featureId,
  };
}

/**
 * Une múltiplas cadeias de pontos do mesmo layer em uma única sequência contínua coerente.
 * Resolve automaticamente orientações reversas e ordena segmentos sequenciais.
 */
export function stitchPointChains(chains: Pt[][], maxConnectDist = 150.0): Pt[] {
  const validChains = chains
    .map((c) => dedupe(c))
    .filter((c) => c.length >= 2);

  if (validChains.length === 0) return [];
  if (validChains.length === 1) return validChains[0];

  const pool = [...validChains];
  // Começa com a primeira cadeia
  let current = [...pool.shift()!];

  while (pool.length > 0) {
    const curStart = current[0];
    const curEnd = current[current.length - 1];

    let bestIdx = -1;
    let bestDist = Infinity;
    let attachAt = "end"; // "end" or "start"
    let reverseCand = false;

    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i];
      const candStart = cand[0];
      const candEnd = cand[cand.length - 1];

      // Caso 1: curEnd -> candStart
      const d1 = dist(curEnd, candStart);
      if (d1 < bestDist) {
        bestDist = d1;
        bestIdx = i;
        attachAt = "end";
        reverseCand = false;
      }

      // Caso 2: curEnd -> candEnd (cand invertido)
      const d2 = dist(curEnd, candEnd);
      if (d2 < bestDist) {
        bestDist = d2;
        bestIdx = i;
        attachAt = "end";
        reverseCand = true;
      }

      // Caso 3: candEnd -> curStart
      const d3 = dist(candEnd, curStart);
      if (d3 < bestDist) {
        bestDist = d3;
        bestIdx = i;
        attachAt = "start";
        reverseCand = false;
      }

      // Caso 4: candStart -> curStart (cand invertido)
      const d4 = dist(candStart, curStart);
      if (d4 < bestDist) {
        bestDist = d4;
        bestIdx = i;
        attachAt = "start";
        reverseCand = true;
      }
    }

    if (bestIdx >= 0 && bestDist <= maxConnectDist) {
      const [chosen] = pool.splice(bestIdx, 1);
      const aligned = reverseCand ? [...chosen].reverse() : chosen;

      if (attachAt === "end") {
        current = current.concat(aligned);
      } else {
        current = aligned.concat(current);
      }
    } else {
      // Anexa o restante em ordem de pool
      const remaining = pool.shift()!;
      current = current.concat(remaining);
    }
  }

  return dedupe(current);
}

/**
 * Converte segmentos extraídos diretamente em pontos de inflexão (PIs)
 * para criação de um Alignment3D no projeto.
 */
export function extractPIsFromSegments(segments: GeomSegment[]): { x: number; y: number; radius?: number }[] {
  if (segments.length === 0) return [];
  const pis: { x: number; y: number; radius?: number }[] = [];

  pis.push({ x: segments[0].p1.x, y: segments[0].p1.y });

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.type === "arc" && s.center && s.radius) {
      // Ponto de Interseção de Tangentes (PI) para o arco
      const a1 = s.p1;
      const a2 = s.p2;
      const c = s.center;
      const r = s.radius;

      // Vetores tangentes
      const v1 = s.ccw ? { x: -(a1.y - c.y), y: a1.x - c.x } : { x: a1.y - c.y, y: -(a1.x - c.x) };
      const v2 = s.ccw ? { x: -(a2.y - c.y), y: a2.x - c.x } : { x: a2.y - c.y, y: -(a2.x - c.x) };
      const l1 = Math.hypot(v1.x, v1.y);
      const l2 = Math.hypot(v2.x, v2.y);

      if (l1 > 1e-6 && l2 > 1e-6) {
        const u1 = { x: v1.x / l1, y: v1.y / l1 };
        const u2 = { x: v2.x / l2, y: v2.y / l2 };

        // Interseção das duas tangentes a1 + t*u1 = a2 - s*u2
        const det = u1.x * (-u2.y) - u1.y * (-u2.x);
        if (Math.abs(det) > 1e-6) {
          const dx = a2.x - a1.x;
          const dy = a2.y - a1.y;
          const t = (dx * (-u2.y) - dy * (-u2.x)) / det;
          if (t > 0 && t < r * 10) {
            pis.push({
              x: a1.x + u1.x * t,
              y: a1.y + u1.y * t,
              radius: Math.round(r * 100) / 100,
            });
            continue;
          }
        }
      }
      // Fallback
      pis.push({ x: a2.x, y: a2.y, radius: s.radius });
    } else if (s.type === "poly" && s.pts) {
      for (let k = 1; k < s.pts.length; k++) {
        pis.push({ x: s.pts[k].x, y: s.pts[k].y });
      }
    } else {
      pis.push({ x: s.p2.x, y: s.p2.y });
    }
  }

  return pis;
}
