import React, { useRef, useEffect, useState, useLayoutEffect, useMemo } from "react";
import {
  useStore,
  flushTemporalHistory,
  evaluateAssemblyAtStation,
  evaluateAssembly,
  LARGURA_NARIZ_FISICO,
  OFFSET_BORDO_NARIZ,
  COMPR_NARIZ_FISICO,
  isVisibleInBases,
} from "../store";
import { ALIGNMENT_LENGTH, distancePointToSegment, lineIntersection } from "../lib/utils";
import { buildIntersectionPolygon, findBordoCrossings, makePavementTest, resolverNarizes, narizKey, rotuloNF, casarFilleteComBordos, escolherBordoRamo, mainEhT1DoEdge, hashNTs } from "../lib/intersection";
import { arestaDoQuadranteMorto, tokenQuadranteVivo } from "../lib/galho";

/* Última assinatura publicada do mapa de NTs. Comparar por JSON.stringify usa
 * precisão de float: o NT é recalculado a cada render e oscila em frações de
 * milímetro, então a comparação dava SEMPRE diferente e a planta republicava o
 * mapa a cada quadro — o motor a jusante (sincronização de narizes → alvos →
 * pavimento → fitas → NT) nunca fechava. É a segunda metade do piscar. */
let __ntMapSig: string | null = null;
import { classifyRibbon, featureLineStyle, laneSurface } from "../lib/planScene";
import { laneFlow as sentidoFaixa, outerLaneFlow, rampLabel, rampColor, sideOf, flowCtxFromComponents, flowGuessReason } from "../lib/flow";
import { movimentoDoQuadrante, fluxoDoRamo, fluxoParaSentido, maoDoRamo, cruzamentoDeEixos, direcaoParaLonge, noEixo as peNoEixo, papelDosQuadrantesDaInt } from "../lib/flowRules";
import { noseAlignmentId, tieAlignmentId, isNoseAlignmentId } from "../lib/noseAlignment";
import { buildOffsetGeometry, extractPIs, measureOffset, densifyOffset, classifyChain } from "../lib/offsetGeom";
import { fitLineArc, segmentsToPath } from "../lib/geomExtract";
import {
  rebuildFromPIs,
  Alignment3D,
  AlignmentPoint,
  ProfilePoint,
  joinAlignmentsWithFillet,
} from "../lib/alignment";
import { DraggableWindow } from "./DraggableWindow";
import { Map as MapIcon, Crosshair, ZoomIn, Trash2, Magnet, Ruler, ArrowRightLeft, ChevronDown, X, Wrench, MoveDiagonal, Layers } from "lucide-react";
import LayerManager from "./LayerManager";

// Generates a nice sweeping curve simulating a corridor alignment
function dist2ToPoly(p: { x: number; y: number }, poly: { x: number; y: number }[]) {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    let t = L2 > 1e-18 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (d < best) best = d;
  }
  return best;
}

function generatePathData(width: number, height: number) {
  return `M 20 ${height - 20} C ${width * 0.3} ${height}, ${width * 0.4} 20, ${width - 20} 50`;
}

// Calculates geometric circumradius for 3 non-collinear points on a curve
function getCircumradius(
  p1: { x: number; y: number },
  pm: { x: number; y: number },
  p2: { x: number; y: number }
): number | undefined {
  const a = Math.hypot(pm.x - p1.x, pm.y - p1.y);
  const b = Math.hypot(p2.x - pm.x, p2.y - pm.y);
  const c = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const doubleArea = Math.abs(
    p1.x * (pm.y - p2.y) + pm.x * (p2.y - p1.y) + p2.x * (p1.y - pm.y)
  );
  if (doubleArea < 1e-6) return undefined;
  const r = (a * b * c) / (2 * doubleArea);
  return isFinite(r) && r > 0.01 ? r : undefined;
}

export function PlanView({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [draggedPI, setDraggedPI] = useState<{ alignmentId: string, index: number, id?: string, originalX: number, originalY: number, pointerStartX: number, pointerStartY: number, hasMoved?: boolean } | null>(null);
  const [draggedDimension, setDraggedDimension] = useState<{ id: string, startX: number, startY: number, originalPoints: {x:number, y:number}[] } | null>(null);
  const [draggedIntersection, setDraggedIntersection] = useState<{ id: string; startX: number; startY: number; hasMoved: boolean } | null>(null);

  const {
    station,
    setStation,
    assemblies,
    corridors,
    surface,
    surfaces,
    alignments,
    layers,
    activeAlignmentId,
    isLayerManagerOpen,
    setIsLayerManagerOpen,
    layerModalForAlignment,
    setLayerModalForAlignment,
    cadastre,
    showCadastre,
    showSurfaceTriangles,
    showSurfaceBoundary,
    setActiveTab,
    interactionMode,
    modifyState,
    setInteractionMode,
    laneDirections,
    toggleLaneDirection,
    setLaneDirection,
    tempPIs,
    addTempPI,
    commitTempAlignment,
    osnapEnabled,
    setOsnapEnabled,
    osnapConfig,
    setOsnapConfig,
    orthoModeEnabled,
    setOrthoModeEnabled,
    intersections,
    selectedIntersectionId,
    editingIntersectionId,
    selectedCorridorId,
    setSelectedCorridorId,
    selectedRegionId,
    setSelectedRegionId,
    selectedElementId,
    dynamicCursor,
    activeTab,
    bases,
    baselineVisibility,
    corridorVisibility,
    drawnGeometries,
    globalCorridorFrequency,
    intersectionNTs,
    ntBordos,
    ntParams,
    ntEscolhas,
    ntTipos,
  } = useStore();

  const [snapPoint, setSnapPoint] = useState<{ x: number; y: number; z?: number; type?: 'endpoint' | 'midpoint' | 'center' | 'intersection' | 'perpendicular' | 'nearest' } | null>(
    null,
  );

  const [selectedElement, setSelectedElement] = useState<{
    alignmentId: string;
    type: "Tangent" | "Curve" | "Spiral";
    startSta: number;
    endSta: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    radius?: number;
    spiralIn?: number;
    spiralOut?: number;
    pivIndex?: number;
    length: number;
  } | null>(null);

  const [extrapolateHoverInfo, setExtrapolateHoverInfo] = useState<{
    x: number;
    y: number;
    projX: number;
    projY: number;
  } | null>(null);
  const [addPointHoverZ, setAddPointHoverZ] = useState<number | null>(null);

  const [dimensions, setDimensions] = useState({ w: 400, h: 200 });
  const [crosshairPos, setCrosshairPos] = useState({ x: 0, y: 0 });
  const [pendingIntersection, setPendingIntersection] = useState<{
    x: number;
    y: number;
    mainId: string;
    branchId: string;
    mainSta: number;
    branchSta: number;
  } | null>(null);

  const [pendingCurve, setPendingCurve] = useState<{
    piIndex: number;
    currentRadius: number;
    error?: string;
  } | null>(null);

  const [pendingSpiral, setPendingSpiral] = useState<{
    piIndex: number;
    currentSpiralIn: number;
    currentSpiralOut: number;
    error?: string;
  } | null>(null);

  const [draggedRegionBound, setDraggedRegionBound] = useState<{
    alignmentId: string;
    boundsToUpdate: {
      corridorId: string;
      regionIdx: number;
      prop: "startStation" | "endStation";
    }[];
  } | null>(null);

  const [selectedGeomSeg, setSelectedGeomSeg] = useState<{ geomId: string; segIndex: number } | null>(null);

  const [ribbonPaths, setRibbonPaths] = useState<
    {
      path: string;
      linkId?: string;
      corridorId?: string;
      regionId?: string;
      p1Code?: string;
      p2Code?: string;
      linkType?: string;
      assemblyName?: string;
      centerline?: { x: number; y: number }[];
      p1World?: { x: number; y: number }[];
      p2World?: { x: number; y: number }[];
      centerlineWorld?: { x: number; y: number }[];
    }[]
  >([]);
  const [wireframeWorldPath, setWireframeWorldPath] = useState<string>("");
  const [wireframePaths, setWireframePaths] = useState<string[]>([]);
  const [featurePaths, setFeaturePaths] = useState<
    { path: string; id: string; corridorId?: string; points?: { x: number; y: number }[]; worldPoints?: { x: number; y: number; z?: number }[] }[]
  >([]);
  const [alignmentPaths, setAlignmentPaths] = useState<
    { id?: string; path: string; worldPoints?: { x: number; y: number }[] }[]
  >([]);
  const [alignmentSegments, setAlignmentSegments] = useState<
    {
      alignmentId: string;
      type: "Tangent" | "Curve" | "Spiral";
      startSta: number;
      endSta: number;
      length: number;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      radius?: number;
      spiralIn?: number;
      spiralOut?: number;
      pivIndex?: number;
      path: string;
      worldPoints?: { x: number; y: number }[];
    }[]
  >([]);

  // World to Screen Translation state
  const rawTransform = useStore((state) => state.planView2DTransform);
  const transform = useMemo(() => {
    if (
      isNaN(rawTransform.scale) ||
      isNaN(rawTransform.dx) ||
      isNaN(rawTransform.dy) ||
      rawTransform.scale === 0
    ) {
      return { scale: 1, dx: 0, dy: 0 };
    }
    return rawTransform;
  }, [rawTransform]);
  const setTransform = useStore((state) => state.setPlanView2DTransform);
  const hasAutoFitPlanView = useStore((state) => state.hasAutoFitPlanView);
  const setHasAutoFitPlanView = useStore((state) => state.setHasAutoFitPlanView);
  const [computedTransform, setComputedTransform] = useState({ scale: 1, dx: 0, dy: 0 });

  const [fitTrigger, setFitTrigger] = useState(0);
  const planFitTrigger = useStore((state) => state.planFitTrigger);
  const zoomJanelaAtivo = useStore((state) => state.zoomJanelaAtivo);
  const selecaoDesenho = useStore((state) => state.selecaoDesenho);
  const [janelaZoom, setJanelaZoom] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // O menu ZOOM da barra superior pede o enquadramento por este contador.
  useEffect(() => {
    if (planFitTrigger > 0) setFitTrigger((f) => f + 1);
  }, [planFitTrigger]);
  const [osnapMenuOpen, setOsnapMenuOpen] = useState(false);
  const [pendingLine3DStart, setPendingLine3DStart] = useState<{ x: number, y: number, z: number } | null>(null);
  const [pendingCircle3DCenter, setPendingCircle3DCenter] = useState<{ x: number, y: number, z: number } | null>(null);
  const [pendingDimensionPoints, setPendingDimensionPoints] = useState<{x: number, y: number}[]>([]);

  const [targetCorridorId, setTargetCorridorId] = useState<string | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);

  const selectedCorridor = corridors.find((c) => c.id === selectedCorridorId);
  const targetCorridor = targetCorridorId ? corridors.find((c) => c.id === targetCorridorId) : null;
  const targetAlignIds = new Set<string>();
  if (selectedCorridor) {
    selectedCorridor.regions.forEach((r) => {
      if (r.targets) {
        Object.values(r.targets).forEach((tidList) => {
          tidList.split(",").forEach((tid) => targetAlignIds.add(tid.trim()));
        });
      }
      if (r.islandTargetId) {
        r.islandTargetId.split(",").forEach((tid) => targetAlignIds.add(tid.trim()));
      }
    });
  }
  if (targetCorridor) {
    targetCorridor.regions.forEach((r) => {
      if (r.targets) {
        Object.values(r.targets).forEach((tidList) => {
          tidList.split(",").forEach((tid) => targetAlignIds.add(tid.trim()));
        });
      }
      if (r.islandTargetId) {
        r.islandTargetId.split(",").forEach((tid) => targetAlignIds.add(tid.trim()));
      }
    });
  }
  if (hoveredTargetId) {
    hoveredTargetId.split(",").forEach((tid) => targetAlignIds.add(tid.trim()));
  }

  // Map World coords down to responsive screen pixels
  const toScreenX = (wx: number) =>
    (isNaN(wx) ? 0 : wx) * transform.scale + transform.dx;
  const toScreenY = (wy: number) =>
    -(isNaN(wy) ? 0 : wy) * transform.scale + transform.dy;

  const worldPointsToSvgPath = (
    pts: { x: number; y: number }[] | undefined,
    close: boolean = false
  ): string => {
    if (!pts || pts.length === 0) return "";
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      path += ` L ${pts[i].x} ${pts[i].y}`;
    }
    if (close) path += " Z";
    return path;
  };

  const ribbonToWorldSvgPath = (
    p1?: { x: number; y: number }[],
    p2?: { x: number; y: number }[]
  ): string => {
    if (!p1 || !p2 || p1.length === 0 || p2.length === 0) return "";
    let path = `M ${p1[0].x} ${p1[0].y}`;
    for (let i = 1; i < p1.length; i++) {
      path += ` L ${p1[i].x} ${p1[i].y}`;
    }
    for (let i = p2.length - 1; i >= 0; i--) {
      path += ` L ${p2[i].x} ${p2[i].y}`;
    }
    return path + " Z";
  };

  /* FLUXO DAS FAIXAS — a seta é o fluxo de água da pista.
   * Nasce no MEIO da faixa (média ponto a ponto dos dois bordos da fita),
   * nunca sobre um bordo, e é posicionada em ESTACA: o passo é contado desde a
   * estaca inicial da região, então a corrente continua alinhada quando a
   * região é partida por um nariz. Faixas vizinhas levam meia defasagem para o
   * fluxo não virar pente perpendicular à pista. */
  const FLOW_SPACING = 16;
  /* CONTEXTO BASE — seção + mão declarada, SEM o sentido deduzido.
   * A dedução do movimento lê o fluxo da faixa da principal, então ela precisa
   * de um contexto que não dependa dela mesma. */
  const flowCtxBase = (corridorId?: string) => {
    const c = corridors.find((x) => x.id === corridorId);
    if (!c) return {};
    const comps = c.regions
      .map((r) => assemblies.find((a) => a.id === r.assemblyId)?.components)
      .find((cs) => cs && cs.length);
    return {
      ...flowCtxFromComponents(comps as any),
      mao: (c as any).mao ?? null,
      maoSentido: (c as any).maoSentido ?? null,
    };
  };

  /* QUE TIPO DE VIA É ESTE CORREDOR — a mão declarada manda; sem ela, lê a
   * seção para palpitar antes de qualquer clique do usuário. */
  const flowCtxDoCorredor = (corridorId?: string) => ({
    ...flowCtxBase(corridorId),
    /* Deduzido pela continuidade de fluxo — resolve a via de mão única, que a
       seção não sabe resolver. */
    sentidoDeduzido: fluxoDeduzido.sentidoPorCorredor.get(corridorId || "") ?? null,
  });

  /* Eixo do corredor em coordenadas de mundo — é ele que define o que é
   * "a favor do estaqueamento". */
  const eixoDoCorredor = (corridorId?: string) => {
    const c = corridors.find((x) => x.id === corridorId);
    const id = c?.alignmentId || undefined;
    if (!id) return null;
    const ap = alignmentPaths.find((a: any) => a.id === id);
    if (ap?.worldPoints && ap.worldPoints.length > 1) return ap.worldPoints;
    const al: any = alignments.find((a: any) => a.id === id);
    return al?.points && al.points.length > 1 ? al.points : null;
  };

  /* Comprimento acumulado do pé da perpendicular ao eixo — mede POSIÇÃO AO
   * LONGO do estaqueamento, para saber se a fita foi varrida a favor ou
   * contra ele. */
  const estacaAproximada = (eixo: { x: number; y: number }[], p: { x: number; y: number }) => {
    let melhor = { d: Infinity, s: 0 };
    let acc = 0;
    for (let i = 0; i < eixo.length - 1; i++) {
      const a = eixo[i];
      const b = eixo[i + 1];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const l2 = vx * vx + vy * vy;
      const len = Math.sqrt(l2) || 0;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2)) : 0;
      const d = Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
      if (d < melhor.d) melhor = { d, s: acc + t * len };
      acc += len;
    }
    return melhor.s;
  };

  /* LADO FÍSICO DA FAIXA — de que lado do eixo a fita está DE FATO.
   * O nome que a seção dá ao componente (Esq/Dir) é identidade, não posição:
   * o sinal do offset da seção não coincide com o lado geométrico em planta, e
   * era por isso que a pista saía com as duas mãos trocadas (mão inglesa). A
   * regra de manter a direita fala de lado geométrico — então é ele que se
   * mede aqui, com o produto vetorial contra a tangente do eixo. */
  const ladoFisicoDaFita = (
    p1World?: { x: number; y: number }[],
    p2World?: { x: number; y: number }[],
    eixo?: { x: number; y: number }[] | null,
  ): "Esq" | "Dir" | null => {
    if (!p1World || !p2World || !eixo || eixo.length < 2) return null;
    const n = Math.min(p1World.length, p2World.length);
    if (n < 1) return null;
    const i = Math.floor(n / 2);
    const m = { x: (p1World[i].x + p2World[i].x) / 2, y: (p1World[i].y + p2World[i].y) / 2 };
    const pe = peNoEixo(eixo, m);
    const fora = Math.hypot(m.x - pe.x, m.y - pe.y);
    if (fora < 0.05) return null;
    return sideOf({ x: pe.ux, y: pe.uy }, { x: m.x - pe.x, y: m.y - pe.y });
  };

  const buildLaneFlow = (
    p1World: { x: number; y: number }[] | undefined,
    p2World: { x: number; y: number }[] | undefined,
    direction: "forward" | "backward" | undefined,
    stationBase: number,
    phase: number,
    eixo?: { x: number; y: number }[] | null,
  ): { arrows: string; stream: string } => {
    const empty = { arrows: "", stream: "" };
    if (!p1World || !p2World || p1World.length < 2 || p2World.length < 2) return empty;

    const n = Math.min(p1World.length, p2World.length);
    const mid: { x: number; y: number }[] = [];
    const width: number[] = [];
    for (let i = 0; i < n; i++) {
      mid.push({ x: (p1World[i].x + p2World[i].x) / 2, y: (p1World[i].y + p2World[i].y) / 2 });
      width.push(Math.hypot(p2World[i].x - p1World[i].x, p2World[i].y - p1World[i].y));
    }
    if (mid.length < 2) return empty;

    /* A FITA PODE TER SIDO VARRIDA AO CONTRÁRIO. Regiões de cunha nascem com
     * estaca inicial maior que a final, e aí a polilinha corre contra o
     * estaqueamento — a seta saía invertida e a pista lia-se como mão
     * inglesa. "A favor" é sempre estaca crescente no EIXO, nunca a ordem dos
     * pontos da fita. */
    if (eixo && eixo.length > 1) {
      const sIni = estacaAproximada(eixo, mid[0]);
      const sFim = estacaAproximada(eixo, mid[mid.length - 1]);
      if (sFim < sIni) {
        mid.reverse();
        width.reverse();
      }
    }

    const cum = [0];
    for (let i = 0; i < mid.length - 1; i++) {
      cum.push(cum[i] + Math.hypot(mid[i + 1].x - mid[i].x, mid[i + 1].y - mid[i].y));
    }
    const total = cum[cum.length - 1];
    /* Fatia curta é cunha/nariz, não faixa de tráfego: fica sem seta. */
    if (total < 5) return empty;
    const margin = Math.min(4, Math.max(1.5, total * 0.08));

    const at = (d: number) => {
      let idx = 0;
      while (idx < cum.length - 2 && cum[idx + 1] < d) idx++;
      const segLen = cum[idx + 1] - cum[idx];
      const t = segLen > 1e-6 ? (d - cum[idx]) / segLen : 0;
      const a = mid[idx];
      const b = mid[idx + 1];
      const prev = mid[Math.max(0, idx - 1)];
      const next = mid[Math.min(mid.length - 1, idx + 2)];
      const tanLen = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        ux: (next.x - prev.x) / tanLen,
        uy: (next.y - prev.y) / tanLen,
        w: width[idx] + ((width[idx + 1] ?? width[idx]) - width[idx]) * t,
      };
    };

    const stations: number[] = [];
    const off = (((-(stationBase + phase)) % FLOW_SPACING) + FLOW_SPACING) % FLOW_SPACING;
    for (let d = off; d <= total - margin; d += FLOW_SPACING) if (d >= margin) stations.push(d);
    if (stations.length === 0) stations.push(total / 2);

    let arrows = "";
    for (const d of stations) {
      const s = at(d);
      /* Onde a faixa morreu (alargamento, cunha) não há fluxo a mostrar. */
      if (s.w < 1.4) continue;
      let ux = s.ux;
      let uy = s.uy;
      if (direction === "backward") { ux = -ux; uy = -uy; }
      const k = Math.min(1.15, Math.max(0.55, s.w / 3.6));
      const headLen = 1.9 * k;
      const headW = 0.74 * k;
      const stemW = 0.23 * k;
      const stemLen = 2.1 * k;
      const cx = s.x - ux * ((headLen - stemLen) / 2);
      const cy = s.y - uy * ((headLen - stemLen) / 2);
      const nx = -uy;
      const ny = ux;
      const P = (fwd: number, lat: number) =>
        `${(cx + ux * fwd + nx * lat).toFixed(3)} ${(cy + uy * fwd + ny * lat).toFixed(3)}`;
      arrows +=
        `M ${P(headLen, 0)} L ${P(0, headW)} L ${P(0, stemW)} L ${P(-stemLen, stemW)} ` +
        `L ${P(-stemLen + 0.3 * k, 0)} L ${P(-stemLen, -stemW)} L ${P(0, -stemW)} L ${P(0, -headW)} Z `;
    }
    if (!arrows) return empty;

    let stream = "";
    for (let i = 0; i < mid.length; i++) {
      stream += `${i === 0 ? "M" : "L"} ${mid[i].x.toFixed(3)} ${mid[i].y.toFixed(3)} `;
    }
    return { arrows, stream };
  };

  /* MOVIMENTO DO RAMO — seta deduzida, não editável.
   * A faixa tem sentido; o quadrante tem MOVIMENTO: por onde o tráfego passa
   * entre a principal e o ramo. Ele sai do fluxo das duas faixas envolvidas,
   * então não se clica nesta seta — corrige-se a faixa que a origina. */
  const buildMovementFlow = (
    pts: { x: number; y: number }[] | undefined,
    reverse: boolean,
  ): { arrows: string; stream: string; anchor: { x: number; y: number } } | null => {
    if (!pts || pts.length < 2) return null;
    const line = reverse ? [...pts].reverse() : pts;
    const cum = [0];
    for (let i = 0; i < line.length - 1; i++) {
      cum.push(cum[i] + Math.hypot(line[i + 1].x - line[i].x, line[i + 1].y - line[i].y));
    }
    const total = cum[cum.length - 1];
    if (total < 4) return null;

    const at = (d: number) => {
      let idx = 0;
      while (idx < cum.length - 2 && cum[idx + 1] < d) idx++;
      const segLen = cum[idx + 1] - cum[idx];
      const t = segLen > 1e-6 ? (d - cum[idx]) / segLen : 0;
      const a = line[idx];
      const b = line[idx + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        ux: (b.x - a.x) / len,
        uy: (b.y - a.y) / len,
      };
    };

    let arrows = "";
    for (const f of [0.42, 0.78]) {
      const s = at(total * f);
      const k = 1.15;
      const headLen = 2.0 * k;
      const headW = 0.8 * k;
      const stemW = 0.25 * k;
      const stemLen = 2.2 * k;
      const nx = -s.uy;
      const ny = s.ux;
      const cx = s.x - s.ux * ((headLen - stemLen) / 2);
      const cy = s.y - s.uy * ((headLen - stemLen) / 2);
      const P = (fwd: number, lat: number) =>
        `${(cx + s.ux * fwd + nx * lat).toFixed(3)} ${(cy + s.uy * fwd + ny * lat).toFixed(3)}`;
      arrows +=
        `M ${P(headLen, 0)} L ${P(0, headW)} L ${P(0, stemW)} L ${P(-stemLen, stemW)} ` +
        `L ${P(-stemLen + 0.35 * k, 0)} L ${P(-stemLen, -stemW)} L ${P(0, -stemW)} L ${P(0, -headW)} Z `;
    }

    let stream = "";
    for (let i = 0; i < line.length; i++) {
      stream += `${i === 0 ? "M" : "L"} ${line[i].x.toFixed(3)} ${line[i].y.toFixed(3)} `;
    }
    const a = at(total * 0.78);
    return { arrows, stream, anchor: { x: a.x, y: a.y } };
  };

  const pointsToSvgPath = (
    pts: { x: number; y: number }[] | undefined,
    close: boolean = false
  ): string => {
    if (!pts || pts.length === 0) return "";
    let path = `M ${toScreenX(pts[0].x)} ${toScreenY(pts[0].y)}`;
    for (let i = 1; i < pts.length; i++) {
      path += ` L ${toScreenX(pts[i].x)} ${toScreenY(pts[i].y)}`;
    }
    if (close) path += " Z";
    return path;
  };

  const ribbonToSvgPath = (
    ribbon: { p1World?: { x: number; y: number }[]; p2World?: { x: number; y: number }[]; path?: string }
  ): string => {
    if (!ribbon.p1World || !ribbon.p2World || ribbon.p1World.length === 0 || ribbon.p2World.length === 0) {
      return ribbon.path || "";
    }
    const p1 = ribbon.p1World;
    const p2 = ribbon.p2World;
    let path = `M ${toScreenX(p1[0].x)} ${toScreenY(p1[0].y)}`;
    for (let i = 1; i < p1.length; i++) {
      path += ` L ${toScreenX(p1[i].x)} ${toScreenY(p1[i].y)}`;
    }
    for (let i = p2.length - 1; i >= 0; i--) {
      path += ` L ${toScreenX(p2[i].x)} ${toScreenY(p2[i].y)}`;
    }
    return path + " Z";
  };

  const quadToSvgPath = (
    q: { a1: { x: number; y: number }; a2: { x: number; y: number }; b1: { x: number; y: number }; b2: { x: number; y: number } }
  ): string => {
    const a1x = toScreenX(q.a1.x), a1y = toScreenY(q.a1.y);
    const a2x = toScreenX(q.a2.x), a2y = toScreenY(q.a2.y);
    const b1x = toScreenX(q.b1.x), b1y = toScreenY(q.b1.y);
    const b2x = toScreenX(q.b2.x), b2y = toScreenY(q.b2.y);
    return `M ${a1x} ${a1y} L ${b1x} ${b1y} L ${a2x} ${a2y} Z M ${a2x} ${a2y} L ${b1x} ${b1y} L ${b2x} ${b2y} Z`;
  };

  // Pre-calculate inverse matrices for Frustum Culling
  const toWorldX = (sx: number) => (sx - transform.dx) / transform.scale;
  const toWorldY = (sy: number) => (transform.dy - sy) / transform.scale;

  const wLeft = toWorldX(0);
  const wRight = toWorldX(dimensions.w);
  const wBottom = toWorldY(dimensions.h);
  const wTop = toWorldY(0);

  const vMinX = Math.min(wLeft, wRight) - 50;
  const vMaxX = Math.max(wLeft, wRight) + 50;
  const vMinY = Math.min(wBottom, wTop) - 50;
  const vMaxY = Math.max(wBottom, wTop) + 50;

  const lastFitTrigger = useRef(0);
  const initializedRef = useRef(false);

  // Calculate Auto-Fit Camera Bounds exactly when data/resizing changes
  useEffect(() => {
    if (dimensions.w <= 0) return;

    let shouldFit = false;
    const hasData =
      surface || (cadastre && cadastre.length > 0) || alignments.length > 0;

    if (fitTrigger !== lastFitTrigger.current) {
      shouldFit = true;
      lastFitTrigger.current = fitTrigger;
    } else if (!hasAutoFitPlanView && hasData) {
      shouldFit = true;
    }

    if (!shouldFit) return;

    // Bounds tracking
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    if (surface) {
      minX = Math.min(minX, surface.minX);
      maxX = Math.max(maxX, surface.maxX);
      minY = Math.min(minY, surface.minY);
      maxY = Math.max(maxY, surface.maxY);
    }

    if (alignments.length > 0) {
      alignments.forEach((alignment) => {
        const startSta = alignment.points[0] ? alignment.points[0].sta : 0;
        const endSta = alignment.points[alignment.points.length - 1]
          ? alignment.points[alignment.points.length - 1].sta
          : alignment.length;
        for (let s = startSta; s <= endSta; s += 50) {
          const pt = alignment.getPointAtStation(s);
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
      });
    }

    if (cadastre && !surface && alignments.length === 0) {
      cadastre.forEach((layer) => {
        layer.entities.forEach((entity) => {
          if (entity.vertices) {
            entity.vertices.forEach((v: any) => {
              if (v.x < minX) minX = v.x;
              if (v.x > maxX) maxX = v.x;
              if (v.y < minY) minY = v.y;
              if (v.y > maxY) maxY = v.y;
            });
          }
        });
      });
      if (minX === Infinity) {
        minX = 0;
        maxX = 1000;
        minY = -500;
        maxY = 500;
      }
    }

    if (minX === Infinity || isNaN(minX)) {
      minX = 0;
      maxX = 1000;
      minY = -500;
      maxY = 500;
    }

    const worldW = Math.max(maxX - minX, 1);
    const worldH = Math.max(maxY - minY, 1);

    // Safety padding 10%
    const scale = Math.min(
      (dimensions.w / worldW) * 0.8,
      (dimensions.h / worldH) * 0.8,
    );

    const dx = dimensions.w / 2 - (minX + worldW / 2) * scale;
    const dy = dimensions.h / 2 + (minY + worldH / 2) * scale;

    // Only mark as initialized if we actually had some non-default bounds, or surface/cadastre data to fit.
    // However, since we want to avoid ANY unexpected zoom, just mark it immediately anyway.
    initializedRef.current = true;
    setHasAutoFitPlanView(true);
    const currentT = useStore.getState().planView2DTransform;
    if (currentT.scale !== scale || currentT.dx !== dx || currentT.dy !== dy) {
      setTransform({ scale, dx, dy });
    }
  }, [dimensions, surface, alignments, cadastre, fitTrigger, hasAutoFitPlanView]);

  // Fast TIN Canvas Renderer (runs instantly when surface loads/scales)
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    // Use live transform for real-time smooth canvas rendering
    const { dx, dy, scale } = transform;
    const localToScreenX = (x: number) => x * scale + dx;
    const localToScreenY = (y: number) => -y * scale + dy;
    const localToWorldX = (sx: number) => (sx - dx) / scale;
    const localToWorldY = (sy: number) => (dy - sy) / scale;

    const wLeft = localToWorldX(0);
    const wRight = localToWorldX(dimensions.w);
    const wBottom = localToWorldY(dimensions.h);
    const wTop = localToWorldY(0);

    const localVMinX = Math.min(wLeft, wRight) - 50;
    const localVMaxX = Math.max(wLeft, wRight) + 50;
    const localVMinY = Math.min(wBottom, wTop) - 50;
    const localVMaxY = Math.max(wBottom, wTop) + 50;

    ctx.clearRect(0, 0, dimensions.w, dimensions.h);

    // 1. Draw Surface
    if (surface) {
      const s = surfaces.find(layer => layer.isVisible && isVisibleInBases(bases, "surfaces", layer.id));
      if (s) {
        const surf = surface;
        
        if (s.showTriangles ?? true) {
          ctx.strokeStyle = s.trianglesColor || "rgba(255, 255, 255, 0.4)";
          ctx.lineWidth = 0.5;
          
          // Level of Detail (LOD) Optimization
          const loopStride = scale < 0.2 ? 3 : 1;
          
          ctx.beginPath();
          let draws = 0;
          const visibleTriangles = surf.getTrianglesInBoundingBox(
            localVMinX,
            localVMaxX,
            localVMinY,
            localVMaxY,
          );
          for (let j = 0; j < visibleTriangles.length; j += loopStride) {
            const i = visibleTriangles[j];
            const v1 = surf.indices[i] * 3,
              v2 = surf.indices[i + 1] * 3,
              v3 = surf.indices[i + 2] * 3;
              
            const p1x = localToScreenX(surf.vertices[v1]),
              p1y = localToScreenY(surf.vertices[v1 + 1]);
            const p2x = localToScreenX(surf.vertices[v2]),
              p2y = localToScreenY(surf.vertices[v2 + 1]);
            const p3x = localToScreenX(surf.vertices[v3]),
              p3y = localToScreenY(surf.vertices[v3 + 1]);
              
            ctx.moveTo(p1x, p1y);
            ctx.lineTo(p2x, p2y);
            ctx.lineTo(p3x, p3y);
            ctx.lineTo(p1x, p1y);
            draws++;
            
            if (draws > 1000) {
              ctx.stroke();
              ctx.beginPath();
              draws = 0;
            }
          }
          ctx.stroke();
        }
        
        if (s.showBoundary ?? true) {
          ctx.strokeStyle = s.boundaryColor || "rgba(234, 179, 8, 0.8)"; // amber-500
          ctx.lineWidth = 2;
          
          ctx.beginPath();
          for (let i = 0; i < surf.boundaryEdges.length; i += 2) {
            const v1 = surf.boundaryEdges[i] * 3;
            const v2 = surf.boundaryEdges[i + 1] * 3;
            const p1x = localToScreenX(surf.vertices[v1]),
              p1y = localToScreenY(surf.vertices[v1 + 1]);
            const p2x = localToScreenX(surf.vertices[v2]),
              p2y = localToScreenY(surf.vertices[v2 + 1]);
              
            ctx.moveTo(p1x, p1y);
            ctx.lineTo(p2x, p2y);
          }
          ctx.stroke();
          
          if (surf.boundaries && surf.boundaries.length > 0) {
             for (const poly of surf.boundaries) {
                 ctx.beginPath();
                 for (let i = 0; i < poly.length; i++) {
                     const px = localToScreenX(poly[i].x);
                     const py = localToScreenY(poly[i].y);
                     if (i === 0) ctx.moveTo(px, py);
                     else ctx.lineTo(px, py);
                 }
                 ctx.closePath();
                 ctx.stroke();
             }
          }
        }
        
        if (s.showPoints) {
          ctx.fillStyle = s.pointsColor || "rgba(255, 255, 255, 0.6)";
          ctx.strokeStyle = s.pointsColor || "rgba(255, 255, 255, 0.6)";
          const stride = scale < 0.1 ? 6 : scale < 0.3 ? 3 : 1;
          const ptSize = s.pointSize !== undefined ? s.pointSize : 1;
          const ptStyle = s.pointStyle || "circle";
          
          ctx.beginPath();
          const drawnPoints = [];
          for (let i = 0; i < surf.vertices.length; i += 3 * stride) {
            const vx = surf.vertices[i];
            const vy = surf.vertices[i + 1];
            const vz = surf.vertices[i + 2];
            if (vx < localVMinX || vx > localVMaxX || vy < localVMinY || vy > localVMaxY) continue;
            
            const px = localToScreenX(vx);
            const py = localToScreenY(vy);
            
            if (s.showPointElevations) {
              drawnPoints.push({x: px, y: py, z: vz});
            }
            
            if (ptStyle === "circle") {
              ctx.moveTo(px + ptSize, py);
              ctx.arc(px, py, ptSize, 0, Math.PI * 2);
            } else if (ptStyle === "cross") {
              ctx.moveTo(px - ptSize, py);
              ctx.lineTo(px + ptSize, py);
              ctx.moveTo(px, py - ptSize);
              ctx.lineTo(px, py + ptSize);
            } else if (ptStyle === "x") {
              ctx.moveTo(px - ptSize, py - ptSize);
              ctx.lineTo(px + ptSize, py + ptSize);
              ctx.moveTo(px - ptSize, py + ptSize);
              ctx.lineTo(px + ptSize, py - ptSize);
            } else if (ptStyle === "square") {
              ctx.rect(px - ptSize, py - ptSize, ptSize * 2, ptSize * 2);
            }
          }
          
          if (ptStyle === "circle" || ptStyle === "square") {
            ctx.fill();
          } else {
            ctx.stroke();
          }

          if (s.showPointElevations && drawnPoints.length > 0) {
            ctx.fillStyle = s.pointsColor || "rgba(255, 255, 255, 0.6)";
            ctx.font = "10px monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "bottom";
            for (const pt of drawnPoints) {
              ctx.fillText(pt.z.toFixed(2), pt.x + 4, pt.y - 4);
            }
          }
        }

      if (s.showMajorContours || s.showMinorContours) {
        const majorSegments: {x1: number, y1: number, x2: number, y2: number, z: number, wx: number, wy: number}[] = [];
        const minorSegments: {x1: number, y1: number, x2: number, y2: number, z: number, wx: number, wy: number}[] = [];
        
        const majorInterval = s.majorContourInterval || 5;
        const minorInterval = s.minorContourInterval || 1;
        
        const loopStride = scale < 0.2 ? 3 : 1;
        
        const visibleTriangles = surf.getTrianglesInBoundingBox(localVMinX, localVMaxX, localVMinY, localVMaxY);
        
        for (let j = 0; j < visibleTriangles.length; j += loopStride) {
          const i = visibleTriangles[j];
          const v1 = surf.indices[i] * 3;
          const v2 = surf.indices[i + 1] * 3;
          const v3 = surf.indices[i + 2] * 3;
          const x1 = surf.vertices[v1], y1 = surf.vertices[v1+1], z1 = surf.vertices[v1+2];
          const x2 = surf.vertices[v2], y2 = surf.vertices[v2+1], z2 = surf.vertices[v2+2];
          const x3 = surf.vertices[v3], y3 = surf.vertices[v3+1], z3 = surf.vertices[v3+2];
          
          if (Math.max(x1, x2, x3) < vMinX || Math.min(x1, x2, x3) > vMaxX || 
              Math.max(y1, y2, y3) < vMinY || Math.min(y1, y2, y3) > vMaxY) continue;

          const zMin = Math.min(z1, z2, z3);
          const zMax = Math.max(z1, z2, z3);

          let startZ = Math.ceil(zMin / minorInterval) * minorInterval;
          if (!s.showMinorContours) {
            startZ = Math.ceil(zMin / majorInterval) * majorInterval;
          }

          for (let z = startZ; z <= zMax; z += s.showMinorContours ? minorInterval : majorInterval) {
            const isMajor = Math.abs(z % majorInterval) < 0.001;
            if (!isMajor && !s.showMinorContours) continue;
            if (isMajor && !s.showMajorContours && s.showMinorContours) {
               // Render major as minor if major is hidden but minor is shown?
               // The request says toggles for each. Let's strictly follow what they asked.
               // Actually if they toggle major off, they might still want it drawn as minor.
               // Let's just draw it in the minor array if major is off but minor is on.
            }
            
            // Find intersections
            const pts: {x: number, y: number}[] = [];
            
            // Edge 1: v1 - v2
            if ((z1 <= z && z2 > z) || (z2 <= z && z1 > z)) {
               const t = (z - z1) / (z2 - z1);
               pts.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) });
            }
            // Edge 2: v2 - v3
            if ((z2 <= z && z3 > z) || (z3 <= z && z2 > z)) {
               const t = (z - z2) / (z3 - z2);
               pts.push({ x: x2 + t * (x3 - x2), y: y2 + t * (y3 - y2) });
            }
            // Edge 3: v3 - v1
            if ((z3 <= z && z1 > z) || (z1 <= z && z3 > z)) {
               const t = (z - z3) / (z1 - z3);
               pts.push({ x: x3 + t * (x1 - x3), y: y3 + t * (y1 - y3) });
            }
            
            if (pts.length === 2) {
               const p1x = toScreenX(pts[0].x), p1y = toScreenY(pts[0].y);
               const p2x = toScreenX(pts[1].x), p2y = toScreenY(pts[1].y);
               if (isMajor && s.showMajorContours) {
                 majorSegments.push({x1: p1x, y1: p1y, x2: p2x, y2: p2y, z, wx: pts[0].x, wy: pts[0].y});
               } else if (s.showMinorContours) {
                 minorSegments.push({x1: p1x, y1: p1y, x2: p2x, y2: p2y, z, wx: pts[0].x, wy: pts[0].y});
               }
            }
          }
        }
        
        if (s.showMinorContours && minorSegments.length > 0) {
           ctx.strokeStyle = s.minorContourColor || "rgba(100, 116, 139, 0.5)"; // slate-500
           ctx.lineWidth = 0.5;
           ctx.beginPath();
           const labelGrid: Set<string> = new Set();
           const labelsToDraw = [];
           for (const seg of minorSegments) {
              ctx.moveTo(seg.x1, seg.y1);
              ctx.lineTo(seg.x2, seg.y2);
              if (s.showMinorContourElevations) {
                 const gridX = Math.floor(seg.wx / 250);
                 const gridY = Math.floor(seg.wy / 250);
                 const key = `${gridX},${gridY},${seg.z.toFixed(0)}`;
                 if (!labelGrid.has(key)) {
                    labelGrid.add(key);
                    labelsToDraw.push({x: seg.x1, y: seg.y1, z: seg.z, color: s.minorContourColor || "rgba(100, 116, 139, 0.5)"});
                 }
              }
           }
           ctx.stroke();
           if (labelsToDraw.length > 0) {
              ctx.font = "10px monospace";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              for (const l of labelsToDraw) {
                 ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
                 const text = l.z.toFixed(0);
                 const w = ctx.measureText(text).width;
                 ctx.fillRect(l.x - w/2 - 2, l.y - 6, w + 4, 12);
                 ctx.fillStyle = l.color;
                 ctx.fillText(text, l.x, l.y);
              }
           }
        }
        
        if (s.showMajorContours && majorSegments.length > 0) {
           ctx.strokeStyle = s.majorContourColor || "rgba(248, 113, 113, 0.8)"; // red-400
           ctx.lineWidth = 1.5;
           ctx.beginPath();
           const labelGrid: Set<string> = new Set();
           const labelsToDraw = [];
           for (const seg of majorSegments) {
              ctx.moveTo(seg.x1, seg.y1);
              ctx.lineTo(seg.x2, seg.y2);
              if (s.showMajorContourElevations) {
                 const gridX = Math.floor(seg.wx / 250);
                 const gridY = Math.floor(seg.wy / 250);
                 const key = `${gridX},${gridY},${seg.z.toFixed(0)}`;
                 if (!labelGrid.has(key)) {
                    labelGrid.add(key);
                    labelsToDraw.push({x: seg.x1, y: seg.y1, z: seg.z, color: s.majorContourColor || "rgba(248, 113, 113, 0.8)"});
                 }
              }
           }
           ctx.stroke();
           if (labelsToDraw.length > 0) {
              ctx.font = "11px monospace";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              for (const l of labelsToDraw) {
                 ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
                 const text = l.z.toFixed(0);
                 const w = ctx.measureText(text).width;
                 ctx.fillRect(l.x - w/2 - 2, l.y - 7, w + 4, 14);
                 ctx.fillStyle = l.color;
                 ctx.fillText(text, l.x, l.y);
              }
           }
        }
      }
      }
    }

    // 2. Draw Cadastre
    if (cadastre && showCadastre && activeTab !== "drawing") {
      ctx.lineWidth = 1;
      cadastre.forEach((layer) => {
        // Map DXF colors roughly to hex or just use a nice bright color if background is dark
        ctx.strokeStyle =
          layer.color === 7
            ? "rgba(255, 255, 255, 0.6)"
            : `hsl(${layer.color * 15}, 70%, 60%)`;
        ctx.beginPath();

        let draws = 0;
        layer.entities.forEach((entity: any) => {
          if (entity.type === "LINE") {
            const sx = entity.vertices[0].x,
              sy = entity.vertices[0].y;
            const ex = entity.vertices[1].x,
              ey = entity.vertices[1].y;
            // Frustum cull
            if (
              Math.min(sx, ex) > vMaxX ||
              Math.max(sx, ex) < vMinX ||
              Math.min(sy, ey) > vMaxY ||
              Math.max(sy, ey) < vMinY
            )
              return;

            ctx.moveTo(toScreenX(sx), toScreenY(sy));
            ctx.lineTo(toScreenX(ex), toScreenY(ey));
            draws++;
          } else if (
            entity.type === "LWPOLYLINE" ||
            entity.type === "POLYLINE"
          ) {
            const verts = entity.vertices;
            if (!verts || verts.length < 2) return;

            // Bounding box cull
            let minx = Infinity,
              miny = Infinity,
              maxx = -Infinity,
              maxy = -Infinity;
            for (let j = 0; j < verts.length; j++) {
              if (verts[j].x < minx) minx = verts[j].x;
              if (verts[j].x > maxx) maxx = verts[j].x;
              if (verts[j].y < miny) miny = verts[j].y;
              if (verts[j].y > maxy) maxy = verts[j].y;
            }
            if (minx > vMaxX || maxx < vMinX || miny > vMaxY || maxy < vMinY)
              return;

            ctx.moveTo(toScreenX(verts[0].x), toScreenY(verts[0].y));
            for (let j = 1; j < verts.length; j++) {
              ctx.lineTo(toScreenX(verts[j].x), toScreenY(verts[j].y));
            }
            if (entity.shape) {
              ctx.lineTo(toScreenX(verts[0].x), toScreenY(verts[0].y));
            }
            draws += verts.length;
          }

          // Chunk strokes to keep browser happy
          if (draws > 500) {
            ctx.stroke();
            ctx.beginPath();
            draws = 0;
          }
        });
        ctx.stroke();
      });
    }
  }, [
    surface,
    surfaces,
    cadastre,
    showCadastre,
    transform,
    dimensions,
    showSurfaceTriangles,
    showSurfaceBoundary,
    activeTab,
    bases,
  ]);

  // Evaluate the Math Corridor
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions((prev) => {
          if (
            prev.w === entry.contentRect.width &&
            prev.h === entry.contentRect.height
          ) {
            return prev;
          }
          return {
            w: entry.contentRect.width,
            h: entry.contentRect.height,
          };
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const current = useStore.getState().planViewDimensions;
    if (current.w !== dimensions.w || current.h !== dimensions.h) {
      useStore.getState().setPlanViewDimensions(dimensions);
    }
  }, [dimensions]);

  // Update crosshair when station changes externally (or internally)
  useEffect(() => {
    if (!pathRef.current) return;
    const path = pathRef.current;
    const totalLength = path.getTotalLength();
    if (totalLength === 0) return;
  }, [station, dimensions]);

  // Update corridor and alignment world geometry when model data changes
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      const SAMPLE_STEP = 2.0; // Fixed 2m step for world sampling so geometry stays 100% stable during pan/zoom



    const newRibbons: {
      path: string;
      linkId?: string;
      corridorId?: string;
      regionId?: string;
      p1Code?: string;
      p2Code?: string;
      linkType?: string;
      assemblyName?: string;
      centerline?: { x: number; y: number }[];
      p1World?: { x: number; y: number }[];
      p2World?: { x: number; y: number }[];
      centerlineWorld?: { x: number; y: number }[];
    }[] = [];
    const newWireframeQuads: { a1: { x: number; y: number }; a2: { x: number; y: number }; b1: { x: number; y: number }; b2: { x: number; y: number } }[] = [];
    const newFeatures: { path: string; id: string; corridorId?: string; points?: { x: number; y: number }[]; worldPoints?: { x: number; y: number; z?: number }[] }[] = [];

    let wireframeWorldPathStr = "";

    // 1. Build Base Alignment world points
    const newAlignPaths: { id?: string; path: string; worldPoints?: { x: number; y: number }[] }[] = [];
    const newAlignSegments: typeof alignmentSegments = [];

    alignments.forEach((alignment) => {
      if (alignment.isHidden) return;
      let startSta = alignment.points.length > 0 ? alignment.points[0].sta : 0;
      let endSta =
        alignment.length ||
        (alignment.points.length > 0
          ? alignment.points[alignment.points.length - 1].sta
          : 1000);

      if (alignment.visualStartStation !== undefined) {
         startSta = Math.max(startSta, alignment.visualStartStation);
      }
      if (alignment.visualEndStation !== undefined) {
         endSta = Math.min(endSta, alignment.visualEndStation);
      }

      const importantStations = new Set<number>();
      alignment.keyPoints.forEach((kp) => {
        if (kp.sta >= startSta && kp.sta <= endSta) {
          importantStations.add(kp.sta);
        }
      });

      const worldPts = alignment.points.filter(
        (p) => p.sta >= startSta - 0.001 && p.sta <= endSta + 0.001
      );

      if (worldPts.length > 0) {
        newAlignPaths.push({ id: alignment.id, path: worldPointsToSvgPath(worldPts), worldPoints: worldPts });
      }

      // Build Segments purely from keyPoints for all tabs
      const rawKeyPoints = alignment.keyPoints.filter(
        (p) =>
          p.label &&
          ([
            "PP",
            "INICIO",
            "PC",
            "PT",
            "PF",
            "FIM",
            "POB",
            "POE",
            "TE",
            "EC",
            "CE",
            "ET",
            "TS",
            "SC",
            "CS",
            "ST",
            "PCC",
            "PRC",
            "PI"
          ].includes(p.label)),
      );
      rawKeyPoints.sort((a,b) => a.sta - b.sta);

      const validKeyPoints = rawKeyPoints.filter((p, i) => {
          if (p.label !== "PI") return true;
          if (p.radius) return false;
          const prev = rawKeyPoints[i - 1];
          const next = rawKeyPoints[i + 1];
          if (prev && next) {
             if (
               (prev.label === "TE" && next.label === "EC") ||
               (prev.label === "EC" && next.label === "CE") ||
               (prev.label === "CE" && (next.label === "ET" || next.label === "PF" || next.label === "FIM")) ||
               (prev.label === "TS" && next.label === "SC") ||
               (prev.label === "SC" && next.label === "CS") ||
               (prev.label === "CS" && (next.label === "ST" || next.label === "PF" || next.label === "FIM")) ||
               ((prev.label === "PP" || prev.label === "INICIO") && (next.label === "SC" || next.label === "EC")) ||
               (["PC", "PCC", "PRC"].includes(prev.label) && ["PT", "PCC", "PRC", "PF", "FIM"].includes(next.label)) ||
               (["PP", "INICIO"].includes(prev.label) && ["PT", "PCC", "PRC"].includes(next.label))
             ) {
                return false;
             }
          }
          return true;
      });

      const sortedKps = [...validKeyPoints];
      if (sortedKps.length === 0 || sortedKps[0].sta > startSta + 0.01) {
        const ptStart = alignment.getPointAtStation(startSta);
        sortedKps.unshift({ label: "INICIO", sta: startSta, x: ptStart.x, y: ptStart.y } as any);
      }
      if (sortedKps.length > 0 && sortedKps[sortedKps.length - 1].sta < endSta - 0.01) {
        const ptEnd = alignment.getPointAtStation(endSta);
        sortedKps.push({ label: "FIM", sta: endSta, x: ptEnd.x, y: ptEnd.y } as any);
      }

      for (let j = 0; j < sortedKps.length - 1; j++) {
        const p1 = sortedKps[j];
        const p2 = sortedKps[j + 1];
        let type: "Tangent" | "Curve" | "Spiral" = "Tangent";

        const isCurveStart =
          p1.label && ["PC", "PCC", "PRC", "EC", "SC"].includes(p1.label);
        const isCurveEnd =
          p2.label && ["PT", "PCC", "PRC", "PF", "FIM", "CE", "CS"].includes(p2.label);
          
        const p1IsStart = p1.label === "PP" || p1.label === "INICIO";
        const p2IsEnd = p2.label === "PF" || p2.label === "FIM";

        if (
          (isCurveStart && isCurveEnd) ||
          (p1IsStart && isCurveEnd) ||
          (isCurveStart && p2IsEnd)
        )
          type = "Curve";
        else if (
          (p1.label === "TE" && p2.label === "EC") ||
          (p1.label === "CE" && p2.label === "ET") ||
          (p1.label === "TS" && p2.label === "SC") ||
          (p1.label === "CS" && p2.label === "ST") ||
          (p1.label === "CE" && p2IsEnd) ||
          (p1.label === "CS" && p2IsEnd) ||
          (p1IsStart && p2.label === "SC") ||
          (p1IsStart && p2.label === "EC")
        )
          type = "Spiral";

        let radius: number | undefined;
        let pivIndex: number | undefined;
        let spiralIn: number | undefined;
        let spiralOut: number | undefined;

        if (type === "Curve" || type === "Spiral") {
           let minD = Infinity;
           let bestIndex = -1;
           const midSta = (p1.sta + p2.sta) / 2;
           for (let k = 0; k < alignment.keyPoints.length; k++) {
               const kp = alignment.keyPoints[k];
               if (kp.pi && kp.label === "PI" && (kp.radius !== undefined || kp.spiralIn !== undefined || kp.spiralOut !== undefined)) {
                  const d = Math.abs(kp.sta - midSta);
                  if (d < minD) {
                      minD = d;
                      bestIndex = k;
                  }
               }
           }
           if (bestIndex === -1) {
               // Fallback: look for ANY PI
               for (let k = 0; k < alignment.keyPoints.length; k++) {
                   const kp = alignment.keyPoints[k];
                   if (kp.pi && kp.label === "PI") {
                      const d = Math.abs(kp.sta - midSta);
                      if (d < minD) {
                          minD = d;
                          bestIndex = k;
                      }
                   }
               }
           }
           
           if (bestIndex !== -1) {
              pivIndex = bestIndex;
           }
           radius = (pivIndex !== undefined && alignment.keyPoints[pivIndex]?.radius) ? alignment.keyPoints[pivIndex].radius : (p1.radius || p2.radius);

           if (!radius || radius === 0) {
             radius = p1.radius || p2.radius || (p1 as any).r || (p2 as any).r;
           }
           if (!radius || radius === 0) {
             for (let m = 0; m < alignment.keyPoints.length; m++) {
               const kp = alignment.keyPoints[m];
               if (kp.radius && kp.radius > 0 && Math.abs(kp.sta - midSta) <= (p2.sta - p1.sta) + 10) {
                 radius = kp.radius;
                 break;
               }
             }
           }
           if (!radius || radius === 0) {
             // Look near this segment in all points
             for (let m = 0; m < alignment.points.length; m++) {
               const pt = alignment.points[m];
               if (pt.sta >= p1.sta - 0.1 && pt.sta <= p2.sta + 0.1 && (pt.radius || (pt as any).r)) {
                 radius = pt.radius || (pt as any).r;
                 break;
               }
             }
           }

           spiralIn = (pivIndex !== undefined && alignment.keyPoints[pivIndex]?.spiralIn) ? alignment.keyPoints[pivIndex].spiralIn : (p1.spiralIn || p2.spiralIn);
           spiralOut = (pivIndex !== undefined && alignment.keyPoints[pivIndex]?.spiralOut) ? alignment.keyPoints[pivIndex].spiralOut : (p1.spiralOut || p2.spiralOut);

           if (!spiralIn) {
             spiralIn = (p1 as any).ls || p1.spiralIn || p2.spiralIn;
           }
           if (!spiralOut) {
             spiralOut = (p2 as any).ls || p2.spiralOut || p1.spiralOut;
           }
        }

        let segStart = Math.max(startSta, p1.sta);
        let segEnd = Math.min(endSta, p2.sta);
        if (segEnd > segStart) {
          let segWorldPts = alignment.points.filter(
            (p) => p.sta >= segStart - 0.001 && p.sta <= segEnd + 0.001
          );

          if (segWorldPts.length === 0) {
            const pStart = alignment.getPointAtStation(segStart);
            const pEnd = alignment.getPointAtStation(segEnd);
            segWorldPts = [
              { ...pStart, sta: segStart },
              { ...pEnd, sta: segEnd }
            ];
          }

          if ((!radius || radius === 0) && type === "Curve" && segWorldPts && segWorldPts.length >= 3) {
            const pStart = segWorldPts[0];
            const pMid = segWorldPts[Math.floor(segWorldPts.length / 2)];
            const pEnd = segWorldPts[segWorldPts.length - 1];
            const calcR = getCircumradius(pStart, pMid, pEnd);
            if (calcR && calcR > 0.01) {
              radius = calcR;
            }
          }

          if (radius && radius > 0) {
            if (pivIndex !== undefined && alignment.keyPoints[pivIndex] && (!alignment.keyPoints[pivIndex].radius || alignment.keyPoints[pivIndex].radius === 0)) {
              alignment.keyPoints[pivIndex].radius = radius;
            }
          }

          newAlignSegments.push({
            alignmentId: alignment.id,
            type,
            startSta: p1.sta,
            endSta: p2.sta,
            length: p2.sta - p1.sta,
            startX: p1.x,
            startY: p1.y,
            endX: p2.x,
            endY: p2.y,
            radius,
            spiralIn,
            spiralOut,
            pivIndex,
            path: worldPointsToSvgPath(segWorldPts),
            worldPoints: segWorldPts,
          });
        }
      }
    });

    setAlignmentPaths(newAlignPaths);
    setAlignmentSegments(newAlignSegments);

    // 2. Build Corridor Sections
    if (
      !(useStore.getState().activeTab === "horizontal" && useStore.getState().showAlignmentEditor)
    ) {
      corridors.forEach((corridor) => {
        const alignment =
          alignments.find((a) => a.id === corridor.alignmentId) || null;
        if (!alignment) return;
        const alignTotalLen = alignment.length;

        corridor.regions.forEach((region) => {
          const activeAssembly = assemblies.find(
            (a) => a.id === region.assemblyId,
          );
          if (!activeAssembly) return;

          const linksData = new Map<
            string,
            {
              segments: { p1World: { x: number; y: number }[]; p2World: { x: number; y: number }[] }[];
              lastIndex: number;
              codeP1?: string;
              codeP2?: string; type?: string;
            }
          >();
          const featuresData = new Map<string, { segments: { world: { x: number; y: number, z?: number }[] }[], lastIndex: number }>();

          const isDynamic = useStore.getState().isDynamicInteraction || isDragging;
          let step = corridor.frequency || useStore.getState().globalCorridorFrequency || 2.0;
          if (isDynamic) {
            step = Math.max(10.0, step * 5);
          }

          const sampleSet = new Set<number>();
          for (
            let s = region.startStation;
            s < region.endStation;
            s += step
          ) {
            sampleSet.add(s);
          }

          if (alignment) {
            alignment.keyPoints.forEach((kp) => {
              if (
                kp.sta >= region.startStation &&
                kp.sta <= region.endStation
              ) {
                sampleSet.add(kp.sta);
              }
            });
            
          }
          sampleSet.add(region.endStation);

          const sampleStations = Array.from(sampleSet).sort((a, b) => a - b);
          for (let sampleIdx = 0; sampleIdx < sampleStations.length; sampleIdx++) {
            const s = sampleStations[sampleIdx];
            if (s > alignTotalLen + 0.001) break;

            const worldPt = alignment
              ? alignment.getPointAtStation(s)
              : { x: s, y: 0 };

            const result = evaluateAssemblyAtStation(
              s,
              assemblies,
              corridors,
              surface,
              alignments,
              alignment.id,
              region.id,
            );
            if (!result) continue;
            const orientation = alignment
              ? alignment.getOrientationAtStation(s)
              : { nx: 0, ny: 1, tx: 1, ty: 0 };

            const sectionWorldPts: Record<string, { x: number; y: number }> = {};

            Object.entries(result.points).forEach(([id, pointOffset]) => {
              const wx = worldPt.x + orientation.nx * pointOffset.x;
              const wy = worldPt.y + orientation.ny * pointOffset.x;
              sectionWorldPts[id] = { x: wx, y: wy };

              if (!featuresData.has(id)) featuresData.set(id, { segments: [], lastIndex: -2 });
              const fd = featuresData.get(id)!;
              if (fd.lastIndex !== sampleIdx - 1) {
                fd.segments.push({ world: [] });
              }
              const currentSeg = fd.segments[fd.segments.length - 1];
              currentSeg.world.push({ x: wx, y: wy, z: pointOffset.y });
              fd.lastIndex = sampleIdx;
            });

            result.links.forEach((link) => {
              const p1 = sectionWorldPts[link.p1];
              const p2 = sectionWorldPts[link.p2];
              if (p1 && p2) {
                if (!linksData.has(link.id))
                  linksData.set(link.id, {
                    segments: [],
                    lastIndex: -2,
                    codeP1: link.p1,
                    codeP2: link.p2, type: link.type,
                  });
                const ld = linksData.get(link.id)!;
                if (ld.lastIndex !== sampleIdx - 1) {
                  ld.segments.push({ p1World: [], p2World: [] });
                }
                const currentSeg = ld.segments[ld.segments.length - 1];
                currentSeg.p1World.push(p1);
                currentSeg.p2World.push(p2);
                ld.lastIndex = sampleIdx;
              }
            });
          }

          // Build filled ribbons for each link
          for (const [linkId, data] of linksData.entries()) {
            for (const seg of data.segments) {
              if (seg.p1World.length > 1) {
                const centerlineWorld: {x: number, y: number}[] = [];
                for (let i = 0; i < seg.p1World.length; i++) {
                  centerlineWorld.push({
                    x: (seg.p1World[i].x + seg.p2World[i].x) / 2,
                    y: (seg.p1World[i].y + seg.p2World[i].y) / 2,
                  });
                }
                const wPath = ribbonToWorldSvgPath(seg.p1World, seg.p2World);
                newRibbons.push({
                  path: wPath,
                  linkId,
                  corridorId: corridor.id,
                  regionId: region.id,
                  p1Code: data.codeP1,
                  p2Code: data.codeP2, linkType: data.type,
                  assemblyName: activeAssembly.name,
                  p1World: seg.p1World,
                  p2World: seg.p2World,
                  centerlineWorld,
                });

                if (corridor.id === selectedCorridorId) {
                  for (let i = 0; i < seg.p1World.length - 1; i++) {
                    const a1 = seg.p1World[i];
                    const a2 = seg.p1World[i + 1];
                    const b1 = seg.p2World[i];
                    const b2 = seg.p2World[i + 1];
                    wireframeWorldPathStr += `M ${a1.x} ${a1.y} L ${b1.x} ${b1.y} L ${a2.x} ${a2.y} Z M ${a2.x} ${a2.y} L ${b1.x} ${b1.y} L ${b2.x} ${b2.y} Z `;
                  }
                }
              }
            }
          }

          // Build continuous feature lines
          for (const [id, data] of featuresData.entries()) {
            for (const seg of data.segments) {
              const worldPoints = seg.world;
              if (worldPoints.length > 1) {
                newFeatures.push({ path: worldPointsToSvgPath(worldPoints), id, corridorId: corridor.id, worldPoints });
              }
            }
          }
        });
      });
    }

    const sortedRibbons = newRibbons.sort((a, b) => {
      const aIsInt = a.corridorId?.startsWith("corr-int-") ? 1 : 0;
      const bIsInt = b.corridorId?.startsWith("corr-int-") ? 1 : 0;
      return aIsInt - bIsInt;
    });

    setRibbonPaths(sortedRibbons);
    setWireframeWorldPath(wireframeWorldPathStr);
    /* ------------------------------------------------------------------
     * RETIFICAÇÃO DAS FEATURE LINES
     * As linhas do corredor nascem de amostragem por estaca — nuvem de
     * pontos, sem a geometria do eixo. Aqui, onde a largura é CONSTANTE,
     * a linha é reconstruída pelo offset exato do eixo (reta paralela +
     * arco concêntrico), passando a seguir a geometria de onde saiu.
     * Trecho de largura variável (taper, superlargura) não é tocado: ali o
     * offset de um círculo não é círculo, e continua como transição.
     * ---------------------------------------------------------------- */
    try {
      const stA = useStore.getState() as any;
      const quadro: any[] = [];
      const alignOf = new Map<string, any>();
      stA.corridors.forEach((c: any) => {
        const a = stA.alignments.find((x: any) => x.id === c.alignmentId);
        if (a) alignOf.set(c.id, a);
      });

      for (const f of newFeatures) {
        const pts = f.worldPoints as { x: number; y: number; z?: number }[] | undefined;
        const al = f.corridorId ? alignOf.get(f.corridorId) : null;
        if (!al || !pts || pts.length < 3) continue;

        const m = measureOffset(al, pts);
        if (!m) continue;

        // --- largura VARIÁVEL: classifica trecho a trecho. Constante vira
        //     reta/arco exato (raio concêntrico R ∓ d); variável é declarado
        //     TRANSIÇÃO, em vez de virar arco fingido.
        if (!m.constante) {
          const cls = classifyChain(al, fitLineArc(pts, 0.05));
          if (cls.elements.length && cls.exatos > 0) {
            f.path = segmentsToPath(cls.elements as any);
            (f as any).exactSegs = cls.elements;
            (f as any).transicoes = cls.transicoes;
          }
          continue;
        }        if (Math.abs(m.medio) < 0.01) continue;

        const r = buildOffsetGeometry(extractPIs(al), m.medio, (s: number) => {
          const p = al.getPointAtStation(s);
          const o = al.getOrientationAtStation(s);
          return { p, nRight: { x: o.nx, y: o.ny } };
        });
        if (!r.elements.length) continue;

        const novo = densifyOffset(r.elements, 0.02);
        if (novo.length < 2) continue;

        // trava de segurança: retifica, nunca desloca. Se a cadeia exata
        // se afasta da amostrada, a amostrada é que vale.
        const dMax = Math.max(
          dist2ToPoly(pts[0], novo),
          dist2ToPoly(pts[pts.length - 1], novo),
          dist2ToPoly(pts[pts.length >> 1], novo),
        );
        if (dMax > 0.30 * 0.30) continue;

        // devolve a cota interpolando do ponto amostrado mais próximo
        const comZ = novo.map((p) => {
          let best = pts[0], bd = Infinity;
          for (const q of pts) {
            const dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
            if (dd < bd) { bd = dd; best = q; }
          }
          return { x: p.x, y: p.y, z: best.z };
        });

        f.worldPoints = comZ as any;
        f.path = segmentsToPath(r.elements as any);
        (f as any).exactSegs = r.elements;
      }

      for (const f of newFeatures) {
        const segs = (f as any).exactSegs;
        if (!segs || !segs.length) continue;
        const al = f.corridorId ? alignOf.get(f.corridorId) : null;
        quadro.push({
          feature: f.id,
          eixo: al?.name || "—",
          elementos: segs.map((s: any) => ({
            tipo: s.origem || s.type,
            raio: s.radius,
            raioEixo: s.raioEixo,
            comprimento: s.length,
          })),
        });
      }
      stA.setBordoQuadro?.(quadro);
    } catch (e) { /* retificação é melhoria: nunca derruba o corredor */ }

    setFeaturePaths(newFeatures);

    /* PUBLICAÇÃO DA CENA (coordenadas de mundo).
     * A planta é o único desenhista: classifica aqui e publica. O menu
     * PRODUÇÃO mostra esta mesma cena dentro da moldura da folha. */
    try {
      const stPub = useStore.getState() as any;
      const nomeCorr = new Map<string, string>();
      (stPub.corridors || []).forEach((c: any) => nomeCorr.set(c.id, c.name));
      const cenaRibbons = sortedRibbons
        .map((r: any) => {
          const cls = classifyRibbon(r, stPub.layers || [], nomeCorr.get(r.corridorId || ""));
          if (!cls.fill) return null;
          return { d: r.path, fill: cls.fill, corridorId: r.corridorId, regionId: r.regionId };
        })
        .filter(Boolean);
      const cenaFeatures = newFeatures.map((f: any) => ({
        d: f.path,
        id: f.id,
        corridorId: f.corridorId,
        ...featureLineStyle(f.id),
      }));
      stPub.setPlanScene({ ribbons: cenaRibbons, features: cenaFeatures, stamp: Date.now() });
    } catch (e) { /* a cena é para exibição: nunca derruba o corredor */ }

    // ---- NARIZES TEÓRICOS
    //      Fonte: ALINHAMENTOS FILHOS (offsets reais dos eixos de bordo), não
    //      linhas de corredor. O filho carrega PI e raio próprios, então a
    //      cadeia reta/arco é EXATA — nada de amostragem nem de reconhecimento
    //      a posteriori. O NT é onde o filho cruza o bordo da via principal.
    try {
      const st = useStore.getState() as any;
      const porId = new Map<string, any>();
      (st.alignments || []).forEach((a: any) => porId.set(a.id, a));

      /* Rodovia de origem = ancestral RAIZ. Um offset de bordo do ramo e o
       * próprio bordo do ramo têm a mesma raiz, e portanto não fazem nariz
       * entre si — nariz é encontro de rodovias DIFERENTES. */
      const raizDe = (a: any) => {
        let cur = a, guard = 0;
        while (cur?.parentId && guard++ < 12) {
          const p = porId.get(cur.parentId);
          if (!p) break;
          cur = p;
        }
        return cur?.id || a.id;
      };

      const filhos = (st.alignments || []).filter(
        (a: any) => a.parentId && Array.isArray(a.points) && a.points.length > 1,
      );

      const bordos = filhos.map((a: any) => {
        // cadeia EXATA do próprio alinhamento: offset zero sobre os PIs dele
        let exato: any[] | undefined;
        try {
          const r = buildOffsetGeometry(extractPIs(a), 0);
          if (r.elements.length) exato = r.elements;
        } catch (e) { /* sem PIs: cai na polilinha */ }
        return {
          id: a.name || a.id,
          srcId: a.id,
          alignmentId: raizDe(a),
          worldPoints: a.points.map((p: any) => ({ x: p.x, y: p.y })),
          exato,
        };
      });

      /* BORDO DO REFÚGIO — tirado direto das fitas do corredor, não de feature
       * line. O refúgio nasce da montagem da garganta; esperar que o usuário
       * extraia a linha à mão deixaria o nariz preso ao bordo da pista sem
       * nenhum aviso (foi o que aconteceu). As fitas carregam o código do ponto
       * da montagem, então o bordo externo do refúgio já está ali. */
      {
        const porCodigo = new Map<string, { x: number; y: number }[][]>();
        for (const rb of newRibbons as any[]) {
          for (const [code, pts] of [[rb.p1Code, rb.p1World], [rb.p2Code, rb.p2World]] as any[]) {
            if (!code || !/Bordo_Ref[úu]gio/i.test(String(code))) continue;
            if (!Array.isArray(pts) || pts.length < 2) continue;
            if (!porCodigo.has(code)) porCodigo.set(code, []);
            porCodigo.get(code)!.push(pts);
          }
        }
        for (const [code, segs] of porCodigo.entries()) {
          // as fitas vêm em trechos; costura na ordem, sem repetir vértice
          const unido: { x: number; y: number }[] = [];
          segs
            .sort((a, b) => a[0].x - b[0].x || a[0].y - b[0].y)
            .forEach((s) => s.forEach((p) => {
              const u = unido[unido.length - 1];
              if (u && Math.hypot(u.x - p.x, u.y - p.y) < 1e-4) return;
              unido.push({ x: p.x, y: p.y });
            }));
          if (unido.length > 1) {
            bordos.push({
              id: `Bordo do Refúgio (${code})`,
              srcId: `refugio-${code}`,
              alignmentId: undefined as any,
              worldPoints: unido,
              exato: undefined,
            } as any);
          }
        }
      }
      /* PAVIMENTO: quadriláteros das faixas já montadas. Serve para separar
       * nariz (cunha não pavimentada) de amarração (bordo reto de pavimento). */
      const quads: any[] = [];
      for (const rb of newRibbons as any[]) {
        const p1 = rb.p1World, p2 = rb.p2World;
        if (!p1 || !p2 || p1.length < 2 || p1.length !== p2.length) continue;
        for (let i = 0; i < p1.length - 1; i++) {
          quads.push({ a: p1[i], b: p2[i], c: p1[i + 1], d: p2[i + 1] });
        }
      }
      const pav = quads.length ? makePavementTest(quads) : undefined;

      /* O bordo do REFÚGIO não é elegível para detecção de NT — só para
       * construção. O nariz é cruzamento de pista × ramo, ponto; se o bordo do
       * refúgio entrasse aqui ele cruzaria com os bordos do ramo e geraria NTs
       * novos, e como o próprio refúgio nasce entre os narizes, a conta viraria
       * circular. Vai para `ntBordos` (construção) e fica fora de
       * `findBordoCrossings` (detecção). */
      const ehRefugio = (id: string) => /Bordo_Ref[úu]gio/i.test(id);
      const cruz = findBordoCrossings(
        bordos.filter((b: any) => !ehRefugio(b.id)), 1.2, 0.25, pav,
      );
      (st as any).setNtDebug?.({
        fonte: "alinhamentos filhos (offsets)",
        features: filhos.length,
        bordos: bordos.length,
        codigos: bordos.map((b: any) => b.id).slice(0, 40),
        rodovias: Array.from(new Set(bordos.map((b: any) => porId.get(b.alignmentId)?.name || b.alignmentId))),
        quadsPavimento: quads.length,
        descartes: (findBordoCrossings as any).rej,
        exatos: bordos.filter((b: any) => b.exato).length,
        achados: cruz.length,
      });
      const map: Record<string, any[]> = {};
      const ints = st.intersections || [];
      st.setNtBordos?.(Object.fromEntries(bordos.map((b: any) => [b.id, b.worldPoints])));
      cruz.forEach((c) => {
        let bestId = ints.length ? ints[0].id : "sem-interseccao";
        let bestD = Infinity;
        ints.forEach((it: any) => {
          const al = st.alignments.find((a: any) => a.id === it.mainAlignmentId);
          if (!al) return;
          const p = al.getPointAtStation(it.mainStation);
          const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
          if (d < bestD) { bestD = d; bestId = it.id; }
        });
        (map[bestId] = map[bestId] || []).push(c);
      });
      Object.keys(map).forEach((k) => {
        map[k] = map[k]
          .sort((p, q) => p.x - q.x || p.y - q.y)
          .map((c, i) => {
            const edgeA = bordos.find((b: any) => b.id === c.a);
            const edgeB = bordos.find((b: any) => b.id === c.b);
            return {
              id: `NT-${String(i + 1).padStart(2, "0")}`, x: c.x, y: c.y,
              armA: c.a, armB: c.b, tipo: c.tipo,
              /* identidade topológica: o par de bordos que se cruzam. Sobrevive a
                 mudança de raio/largura/superelevação, que só movem o ponto. */
              bordoA: (c as any).bordoA, bordoB: (c as any).bordoB, ordem: (c as any).ordem,
              ponta: (c as any).ponta, angulo: (c as any).angulo, via: (c as any).via,
              abertura: (c as any).abertura, dirLivre: (c as any).dirLivre,
              raizA: (edgeA || {}).alignmentId,
              raizB: (edgeB || {}).alignmentId,
              sugerido: (c as any).sugerido, motivos: (c as any).motivos,
              corr: `${porId.get((edgeA || {}).alignmentId)?.name || "?"} × ${porId.get((edgeB || {}).alignmentId)?.name || "?"}`,
            };
          });
      });
      /* Assinatura = chaves + hash quantizado (1 cm) dos NTs de cada
       * interseção. Só publica quando algo muda de verdade. */
      const sigMapa = Object.keys(map).sort()
        .map((k) => `${k}:${(map as any)[k].length}:${hashNTs((map as any)[k])}`)
        .join("|");
      /* Publica também quando o estado está vazio e o mapa não: reabrir o mesmo
       * projeto reproduz a mesma assinatura, e sem isto a primeira publicação
       * era saltada. */
      const estadoVazio = Object.keys(st.intersectionNTs || {}).length === 0;
      if (sigMapa !== __ntMapSig || (estadoVazio && sigMapa !== "")) {
        __ntMapSig = sigMapa;
        st.setIntersectionNTs(map);
      }
    } catch (e) {
      /* NT é anotação: nunca derruba o desenho. Mas engolir sem deixar rastro
       * esconde falha de geometria — o mapa fica vazio e nada explica. */
      console.warn("[NT] cálculo dos narizes teóricos falhou:", e);
      (window as any).__ntErro = String((e as any)?.stack || e);
    }
    // Publica as feature lines resultantes para extração de geometria 2D (aba DRAWING)
    useStore.getState().setCorridorFeatures(
      newFeatures
        .filter((f) => f.corridorId && f.worldPoints && f.worldPoints.length > 1)
        .map((f) => ({ corridorId: f.corridorId as string, id: f.id, worldPoints: f.worldPoints as { x: number; y: number; z?: number }[] })),
    );
    });
    return () => cancelAnimationFrame(handle);
  }, [
    assemblies,
    corridors,
    surface,
    alignments,
    activeAlignmentId,
    selectedCorridorId,
    globalCorridorFrequency,
  ]);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "alignment" | "corridor" | "feature_line" | "feature_lines_multiple" | "dimension" | "osnap";
    id: string; // alignmentId, corridorId, or featureId
    corridorId?: string; // used for feature_line
    name?: string;
    features?: { id: string; corridorId: string; name: string }[];
  } | null>(null);

  const [laneDirectionMenu, setLaneDirectionMenu] = useState<{
    x: number;
    y: number;
    laneKey: string;
  } | null>(null);

  useEffect(() => {
    if (activeTab !== "horizontal") {
      setSelectedElement(null);
    }
  }, [activeTab]);

  useEffect(() => {
    const handleCloseMenu = (e: MouseEvent) => {
      setContextMenu(null);
      setLaneDirectionMenu(null);
    };
    document.addEventListener("click", handleCloseMenu);
    return () => document.removeEventListener("click", handleCloseMenu);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const mode = useStore.getState().mdtEditMode;
        if (mode === "boundary" || mode === "cut") {
          const currentPIs = useStore.getState().tempPIs;
          if (currentPIs.length >= 3) {
            if (useStore.getState().surface) {
              useStore.getState().addMDTEdit({
                type: mode === "boundary" ? "boundary" : "cut",
                data: currentPIs.map(p => ({...p}))
              });
            }
          }
          useStore.getState().clearTempPIs();
          useStore.getState().setMdtEditMode("none");
          return;
        }

        // Commit temp alignment when pressing Enter
        if (useStore.getState().interactionMode === "draw_alignment_pi" || useStore.getState().interactionMode === "extend_alignment") {
           useStore.getState().commitTempAlignment();
           useStore.getState().setInteractionMode("none");
           return;
        }
      }

      if (e.key === "Escape") {
        if (useStore.getState().pendingPointAdd) {
          useStore.getState().setPendingPointAdd(null);
        }
        if (useStore.getState().pendingExtendOffset) {
          useStore.getState().setPendingExtendOffset(false);
        }
        if (useStore.getState().pendingCleanBoundary) {
          useStore.getState().setPendingCleanBoundary(false);
        }
        if (useStore.getState().mdtEditMode !== "none") {
          useStore.getState().clearTempPIs();
          useStore.getState().setMdtEditMode("none");
        }
        setPendingLine3DStart(null);
        setPendingCircle3DCenter(null);
        setPendingDimensionPoints([]);
        if (useStore.getState().interactionMode !== "none") {
          useStore.getState().commitTempAlignment(); // Committing with < 2 stops it
        }
        useStore.getState().setInteractionMode("none");
        useStore.getState().setActiveAlignmentId(null);
        useStore.getState().setSelectedElementId(null);
        useStore.getState().setSelectedIntersectionId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    setIsZooming(true);
    if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    zoomTimeoutRef.current = setTimeout(() => setIsZooming(false), 150);
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    setTransform((prev) => {
      const newScale = prev.scale * zoomFactor;
      const newDx = mx - (mx - prev.dx) * zoomFactor;
      const newDy = my - (my - prev.dy) * zoomFactor;
      return { scale: newScale, dx: newDx, dy: newDy };
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      if (useStore.getState().mdtEditMode === "extrapolate") {
        e.preventDefault();
        const currentPIs = useStore.getState().tempPIs;
        if (currentPIs.length >= 2) {
          const ptsToAdd: { x: number; y: number; z: number }[] = [];

          for (let i = 0; i < currentPIs.length - 1; i++) {
            const p1 = currentPIs[i];
            const p2 = currentPIs[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
              const step = 2.5; // Sample every 2.5m
              for (let d = 0; d <= len; d += step) {
                const tx = p1.x + (dx / len) * d;
                const ty = p1.y + (dy / len) * d;
                const info = surface?.extrapolateInfo(tx, ty);
                if (info) {
                  ptsToAdd.push({ x: tx, y: ty, z: info.z });
                }
              }
              // Ensure last point of segment is added
              const infoDist2 = surface?.extrapolateInfo(p2.x, p2.y);
              if (infoDist2) {
                ptsToAdd.push({ x: p2.x, y: p2.y, z: infoDist2.z });
              }
            }
          }

          if (ptsToAdd.length >= 2 && surface) {
            useStore.getState().addMDTEdit({ type: "extrapolate", data: ptsToAdd });
          }
        }
        useStore.getState().clearTempPIs();
        useStore.getState().setMdtEditMode("none");
        return;
      }

      if (
        useStore.getState().mdtEditMode === "remove_line" ||
        useStore.getState().mdtEditMode === "add_line" ||
        useStore.getState().mdtEditMode === "flip_triangle" ||
        useStore.getState().mdtEditMode === "fill_holes"
      ) {
        e.preventDefault();
        useStore.getState().clearTempPIs();
        useStore.getState().setMdtEditMode("none");
        return;
      }

      // Right click during cut or boundary mode applies polygon
      const mode = useStore.getState().mdtEditMode;
      if (mode === "cut" || mode === "boundary") {
        e.preventDefault();
        const currentPIs = useStore.getState().tempPIs;
        if (currentPIs.length >= 3) {
          if (surface) {
            useStore.getState().addMDTEdit({
              type: mode === "boundary" ? "boundary" : "cut",
              data: currentPIs.map(p => ({...p}))
            });
          }
        }
        useStore.getState().clearTempPIs();
        useStore.getState().setMdtEditMode("none");
        return;
      }

      // Right click during draw commits it
      if (interactionMode !== "none") {
        e.preventDefault();
        commitTempAlignment();
        return;
      }
      
      // Do not fall through to panning on right click
      return;
    }

    if (
      e.button === 0 &&
      (interactionMode === "draw_alignment_pi" ||
        interactionMode === "extend_alignment")
    ) {
      // Left click
      const svgRect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - svgRect.left;
      const my = e.clientY - svgRect.top;
      let worldX = toWorldX(mx);
      let worldY = toWorldY(my);

      if (useStore.getState().orthoModeEnabled && useStore.getState().tempPIs.length > 0) {
        const refPt = useStore.getState().tempPIs[useStore.getState().tempPIs.length - 1];
        if (Math.abs(worldX - refPt.x) > Math.abs(worldY - refPt.y)) {
          worldY = refPt.y;
        } else {
          worldX = refPt.x;
        }
      }

      if (interactionMode === "extend_alignment" && tempPIs.length >= 2) {
        const last1 = tempPIs[tempPIs.length - 1];
        const last2 = tempPIs[tempPIs.length - 2];
        const dx = last1.x - last2.x;
        const dy = last1.y - last2.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          const nx = dx / len;
          const ny = dy / len;
          const vx = worldX - last1.x;
          const vy = worldY - last1.y;
          let dot = vx * nx + vy * ny;
          if (dot < 0) dot = 0;
          worldX = last1.x + nx * dot;
          worldY = last1.y + ny * dot;
        }
      }

      const pt = snapPoint || { x: worldX, y: worldY };
      addTempPI(pt);

      // If we are extending, we update the alignment immediately and keep extending
      if (interactionMode === "extend_alignment") {
        commitTempAlignment();
        // and restart extension
        const align = useStore
          .getState()
          .alignments.find(
            (a) => a.id === useStore.getState().activeAlignmentId,
          );
        if (align && align.keyPoints.length > 0) {
          const structPIs = align.keyPoints
            .filter((p) => p.pi)
            .map((p) => ({ x: p.x, y: p.y, radius: p.radius }));
          useStore.getState().setTempPIs(structPIs);
          useStore.getState().setInteractionMode("extend_alignment");
        }
      }
      return;
    }

    if (e.button === 0 && interactionMode.startsWith("create_dimension_")) {
      const svgRect = e.currentTarget.getBoundingClientRect();
      const worldX = toWorldX(e.clientX - svgRect.left);
      const worldY = toWorldY(e.clientY - svgRect.top);
      const pt = snapPoint ? { x: snapPoint.x, y: snapPoint.y } : { x: worldX, y: worldY };

      const newPts = [...pendingDimensionPoints, pt];
      
      let maxPts = 3;
      if (interactionMode === "create_dimension_angular") maxPts = 3;
      if (interactionMode === "create_dimension_radius") maxPts = 2;

      if (newPts.length >= maxPts) {
        let value = 0;
        let dimType: "linear" | "aligned" | "angular" | "radius" = "aligned";

        if (interactionMode === "create_dimension_linear") {
          dimType = "linear";
          const dx = Math.abs(newPts[1].x - newPts[0].x);
          const dy = Math.abs(newPts[1].y - newPts[0].y);
          value = dx > dy ? dx : dy; // Simplification: pick largest delta
        } else if (interactionMode === "create_dimension_aligned") {
          dimType = "aligned";
          value = Math.hypot(newPts[1].x - newPts[0].x, newPts[1].y - newPts[0].y);
        } else if (interactionMode === "create_dimension_angular") {
          dimType = "angular";
          const v = newPts[0]; // vertex
          const p1 = newPts[1];
          const p2 = newPts[2];
          const a1 = Math.atan2(p1.y - v.y, p1.x - v.x);
          const a2 = Math.atan2(p2.y - v.y, p2.x - v.x);
          let diff = (a2 - a1) * (180 / Math.PI);
          if (diff < 0) diff += 360;
          if (diff > 180) diff = 360 - diff; // inner angle
          value = diff;
        } else if (interactionMode === "create_dimension_radius") {
          dimType = "radius";
          value = Math.hypot(newPts[1].x - newPts[0].x, newPts[1].y - newPts[0].y);
        }

        useStore.getState().addDimension({
          type: dimType,
          points: newPts,
          value
        });
        setPendingDimensionPoints([]);
        useStore.getState().setInteractionMode("none");
      } else {
        setPendingDimensionPoints(newPts);
      }
      return;
    }

    if (e.button === 0 && interactionMode === "move_dimension") {
      const svgRect = e.currentTarget.getBoundingClientRect();
      const worldX = toWorldX(e.clientX - svgRect.left);
      const worldY = toWorldY(e.clientY - svgRect.top);
      const clickPt = snapPoint ? { x: snapPoint.x, y: snapPoint.y } : { x: worldX, y: worldY };

      const selectedId = useStore.getState().selectedElementId;
      if (selectedId) {
        const dim = useStore.getState().dimensions.find(d => d.id === selectedId);
        if (dim) {
          setDraggedDimension({
            id: dim.id,
            startX: clickPt.x,
            startY: clickPt.y,
            originalPoints: JSON.parse(JSON.stringify(dim.points))
          });
        }
      }
      useStore.getState().setInteractionMode("none");
      return;
    }

    if (e.button === 0 && interactionMode.startsWith("modify_")) {
      const svgRect = e.currentTarget.getBoundingClientRect();
      const worldX = toWorldX(e.clientX - svgRect.left);
      const worldY = toWorldY(e.clientY - svgRect.top);
      const clickPt = snapPoint ? { x: snapPoint.x, y: snapPoint.y } : { x: worldX, y: worldY };

      const state = useStore.getState();
      const lines = state.lines3D;
      let closestLine: typeof lines[0] | null = null;
      let minDst = 10 / transform.scale;
      for (const line of lines) {
        const dst = distancePointToSegment(worldX, worldY, line.p1.x, line.p1.y, line.p2.x, line.p2.y);
        if (dst < minDst) {
          minDst = dst;
          closestLine = line;
        }
      }

      if ((interactionMode === "modify_trim" || interactionMode === "modify_extend") && closestLine) {
        const ms = state.modifyState;
        if (!ms || ms.step === 'select1' || !ms.step) {
           state.setModifyState({ step: 'select2', firstId: closestLine.id });
        } else if (ms.step === 'select2' && ms.firstId !== closestLine.id) {
           const cuttingLine = lines.find(l => l.id === ms.firstId);
           if (cuttingLine) {
               if (interactionMode === "modify_trim") {
                  const hit = lineIntersection(closestLine.p1.x, closestLine.p1.y, closestLine.p2.x, closestLine.p2.y, cuttingLine.p1.x, cuttingLine.p1.y, cuttingLine.p2.x, cuttingLine.p2.y);
                  const validUb = hit && hit.ub >= -1000 && hit.ub <= 1000;
                  if (hit && hit.ua >= 0 && hit.ua <= 1 && validUb) {
                      const clickUa = ((worldX - closestLine.p1.x) * (closestLine.p2.x - closestLine.p1.x) + (worldY - closestLine.p1.y) * (closestLine.p2.y - closestLine.p1.y)) / ((closestLine.p2.x - closestLine.p1.x)**2 + (closestLine.p2.y - closestLine.p1.y)**2);
                      const keepStart = clickUa > hit.ua;
                      
                      state.removeLine3D(closestLine.id);
                      if (keepStart) {
                          state.addLine3D({
                              p1: closestLine.p1,
                              p2: { x: hit.x, y: hit.y, z: closestLine.p1.z },
                              color: closestLine.color
                          });
                      } else {
                          state.addLine3D({
                              p1: { x: hit.x, y: hit.y, z: closestLine.p1.z },
                              p2: closestLine.p2,
                              color: closestLine.color
                          });
                      }
                  }
               } else if (interactionMode === "modify_extend") {
                  const hit = lineIntersection(closestLine.p1.x, closestLine.p1.y, closestLine.p2.x, closestLine.p2.y, cuttingLine.p1.x, cuttingLine.p1.y, cuttingLine.p2.x, cuttingLine.p2.y);
                  const validUb = hit && hit.ub >= -1000 && hit.ub <= 1000;
                  if (hit && validUb) {
                      const clickUa = ((worldX - closestLine.p1.x) * (closestLine.p2.x - closestLine.p1.x) + (worldY - closestLine.p1.y) * (closestLine.p2.y - closestLine.p1.y)) / ((closestLine.p2.x - closestLine.p1.x)**2 + (closestLine.p2.y - closestLine.p1.y)**2);
                      const extendP1 = clickUa < 0.5;
                      
                      if ((extendP1 && hit.ua < 0) || (!extendP1 && hit.ua > 1)) {
                          if (extendP1) {
                             state.updateLine3D(closestLine.id, { p1: { x: hit.x, y: hit.y, z: closestLine.p1.z } });
                          } else {
                             state.updateLine3D(closestLine.id, { p2: { x: hit.x, y: hit.y, z: closestLine.p2.z } });
                          }
                      }
                  }
               }
           }
           state.setInteractionMode("none");
           state.setModifyState(null);
        }
        return;
      }

      if (interactionMode === "modify_copy") {
         const mState = state.modifyState || { step: 'select' };
         if (mState.step === 'select' && closestLine) {
            state.setModifyState({ step: 'base', lineId: closestLine.id });
         } else if (mState.step === 'base') {
            state.setModifyState({ step: 'dest', lineId: mState.lineId, basePt: clickPt });
         } else if (mState.step === 'dest') {
            const line = lines.find(l => l.id === mState.lineId);
            if (line && mState.basePt) {
               const dx = clickPt.x - mState.basePt.x;
               const dy = clickPt.y - mState.basePt.y;
               state.addLine3D({
                 p1: { x: line.p1.x + dx, y: line.p1.y + dy, z: line.p1.z },
                 p2: { x: line.p2.x + dx, y: line.p2.y + dy, z: line.p2.z },
                 color: line.color
               });
               // keep step as 'dest' to allow multiple copies
            }
         }
         return;
      }

      if (interactionMode === "modify_mirror") {
         const mState = state.modifyState || { step: 'select' };
         if (mState.step === 'select' && closestLine) {
            state.setModifyState({ step: 'axis1', lineId: closestLine.id });
         } else if (mState.step === 'axis1') {
            state.setModifyState({ step: 'axis2', lineId: mState.lineId, p1: clickPt });
         } else if (mState.step === 'axis2') {
            const line = lines.find(l => l.id === mState.lineId);
            if (line && mState.p1) {
               state.setModifyState({ step: 'confirm', line, p1: mState.p1, p2: clickPt });
            }
         }
         return;
      }

      if (interactionMode === "modify_fillet") {
         const mState = state.modifyState || { step: 'select1', radius: 0 };
         if (mState.step === 'select1' && closestLine) {
            state.setModifyState({ ...mState, step: 'select2', line1Id: closestLine.id });
         } else if (mState.step === 'select2' && closestLine) {
            if (closestLine.id !== mState.line1Id) {
               const l1 = lines.find(l => l.id === mState.line1Id);
               const l2 = closestLine;
               if (l1 && l2) {
                  const hit = lineIntersection(l1.p1.x, l1.p1.y, l1.p2.x, l1.p2.y, l2.p1.x, l2.p1.y, l2.p2.x, l2.p2.y);
                  if (hit) {
                     const r = parseFloat(mState.radius || "0");
                     if (r === 0) {
                        // extend or trim both lines to hit point
                        const l1P1 = Math.hypot(l1.p1.x - hit.x, l1.p1.y - hit.y) < Math.hypot(l1.p2.x - hit.x, l1.p2.y - hit.y) ? { x: hit.x, y: hit.y, z: l1.p1.z } : l1.p1;
                        const l1P2 = Math.hypot(l1.p1.x - hit.x, l1.p1.y - hit.y) > Math.hypot(l1.p2.x - hit.x, l1.p2.y - hit.y) ? { x: hit.x, y: hit.y, z: l1.p2.z } : l1.p2;
                        const l2P1 = Math.hypot(l2.p1.x - hit.x, l2.p1.y - hit.y) < Math.hypot(l2.p2.x - hit.x, l2.p2.y - hit.y) ? { x: hit.x, y: hit.y, z: l2.p1.z } : l2.p1;
                        const l2P2 = Math.hypot(l2.p1.x - hit.x, l2.p1.y - hit.y) > Math.hypot(l2.p2.x - hit.x, l2.p2.y - hit.y) ? { x: hit.x, y: hit.y, z: l2.p2.z } : l2.p2;
                        state.updateLine3D(l1.id, { p1: l1P1, p2: l1P2 });
                        state.updateLine3D(l2.id, { p1: l2P1, p2: l2P2 });
                     } else {
                        // actual fillet arc is harder. We can add a circle/arc to the project or split lines
                        // For now, if radius > 0, we can mock it by cutting lines back by r, but to draw an arc we would need arc primitives. 
                        // Our system has circles3D but they don't do partial arcs nicely in plan view yet unless we add it. 
                        // The user description states: "Se você definir o raio (Radius) como 0, ao selecionar duas linhas, o comando estenderá ou cortará ambas até que formem um canto vivo perfeito."
                        // If r > 0, we could just alert for now or implement a quick arc using segments.
                     }
                  }
               }
            }
            state.setModifyState({ step: 'select1', radius: mState.radius });
         }
         return;
      }
    }

    if (e.button === 0 && useStore.getState().mdtEditMode !== "none") {
      const mode = useStore.getState().mdtEditMode;
      if (mode === "create_line_3d") {
        const svgRect = e.currentTarget.getBoundingClientRect();
        let worldX = toWorldX(e.clientX - svgRect.left);
        let worldY = toWorldY(e.clientY - svgRect.top);

        if (useStore.getState().orthoModeEnabled && pendingLine3DStart) {
          const refPt = pendingLine3DStart;
          if (Math.abs(worldX - refPt.x) > Math.abs(worldY - refPt.y)) {
            worldY = refPt.y;
          } else {
            worldX = refPt.x;
          }
        }

        let z = 0;
        if (snapPoint) {
          worldX = snapPoint.x;
          worldY = snapPoint.y;
          z = snapPoint.z ?? (surface?.getInterpolatedElevation(worldX, worldY) ?? 0);
        } else {
          z = surface?.getInterpolatedElevation(worldX, worldY) ?? 0;
        }
        if (pendingLine3DStart) {
          useStore.getState().addLine3D({
            p1: pendingLine3DStart,
            p2: { x: worldX, y: worldY, z }
          });
          setPendingLine3DStart(null);
        } else {
          setPendingLine3DStart({ x: worldX, y: worldY, z });
        }
        return;
      } else if (mode === "create_circle_3d") {
        const svgRect = e.currentTarget.getBoundingClientRect();
        let worldX = toWorldX(e.clientX - svgRect.left);
        let worldY = toWorldY(e.clientY - svgRect.top);

        let z = 0;
        if (snapPoint) {
          worldX = snapPoint.x;
          worldY = snapPoint.y;
          z = snapPoint.z ?? (surface?.getInterpolatedElevation(worldX, worldY) ?? 0);
        } else {
          z = surface?.getInterpolatedElevation(worldX, worldY) ?? 0;
        }

        if (pendingCircle3DCenter) {
          const dx = worldX - pendingCircle3DCenter.x;
          const dy = worldY - pendingCircle3DCenter.y;
          const radius = Math.sqrt(dx * dx + dy * dy);
          useStore.getState().addCircle3D({
            center: pendingCircle3DCenter,
            radius
          });
          setPendingCircle3DCenter(null);
          useStore.getState().setMdtEditMode("none");
        } else {
          setPendingCircle3DCenter({ x: worldX, y: worldY, z });
        }
        return;
      } else if (mode === "create_point_3d") {
        const svgRect = e.currentTarget.getBoundingClientRect();
        let worldX = toWorldX(e.clientX - svgRect.left);
        let worldY = toWorldY(e.clientY - svgRect.top);
        let z = 0;
        if (snapPoint) {
          worldX = snapPoint.x;
          worldY = snapPoint.y;
          z = snapPoint.z ?? (surface?.getInterpolatedElevation(worldX, worldY) ?? 0);
        } else {
          z = surface?.getInterpolatedElevation(worldX, worldY) ?? 0;
        }
        useStore.getState().addPoint3D({ x: worldX, y: worldY, z });
        return;
      } else if (mode === "add_point") {
        const svgRect = e.currentTarget.getBoundingClientRect();
        let worldX = toWorldX(e.clientX - svgRect.left);
        let worldY = toWorldY(e.clientY - svgRect.top);
        if (snapPoint) {
          worldX = snapPoint.x;
          worldY = snapPoint.y;
        }
        const z = surface?.getInterpolatedElevation(worldX, worldY) ?? 0;
        useStore.getState().setPendingPointAdd({
          x: worldX,
          y: worldY,
          defaultZ: z,
          screenX: toScreenX(worldX),
          screenY: toScreenY(worldY),
        });
        return;
      } else if (mode === "remove_point") {
        const svgRect = e.currentTarget.getBoundingClientRect();
        const worldX = toWorldX(e.clientX - svgRect.left);
        const worldY = toWorldY(e.clientY - svgRect.top);
        if (surface) {
          useStore.getState().addMDTEdit({ type: "remove_point", data: { x: worldX, y: worldY } });
        }
        return;
      } else if (mode === "flip_triangle") {
        const svgRect = e.currentTarget.getBoundingClientRect();
        const worldX = toWorldX(e.clientX - svgRect.left);
        const worldY = toWorldY(e.clientY - svgRect.top);
        if (surface) {
          useStore.getState().addMDTEdit({ type: "flip_triangle", data: { x: worldX, y: worldY } });
        }
        return;
      } else if (mode === "fill_holes") {
        const svgRect = e.currentTarget.getBoundingClientRect();
        const worldX = toWorldX(e.clientX - svgRect.left);
        const worldY = toWorldY(e.clientY - svgRect.top);
        if (surface) {
          useStore.getState().addMDTEdit({ type: "fill_holes", data: { x: worldX, y: worldY } });
        }
        return;
      } else if (mode === "add_line") {
        const svgRect = e.currentTarget.getBoundingClientRect();
        let worldX = toWorldX(e.clientX - svgRect.left);
        let worldY = toWorldY(e.clientY - svgRect.top);
        const currentPIs = useStore.getState().tempPIs;

        if (useStore.getState().orthoModeEnabled && currentPIs.length > 0) {
          const refPt = currentPIs[currentPIs.length - 1];
          if (Math.abs(worldX - refPt.x) > Math.abs(worldY - refPt.y)) {
            worldY = refPt.y;
          } else {
            worldX = refPt.x;
          }
        }
        
        const pt = snapPoint || { x: worldX, y: worldY };

        if (currentPIs.length === 0) {
          addTempPI(pt);
        } else if (currentPIs.length === 1) {
          const startPt = currentPIs[0];
          if (surface) {
            useStore.getState().addMDTEdit({ type: "add_line", data: { p1: { x: startPt.x, y: startPt.y }, p2: { x: pt.x, y: pt.y } } });
          }
          useStore.getState().clearTempPIs();
        }
        return;
      } else if (mode === "remove_line") {
        const svgRect = e.currentTarget.getBoundingClientRect();
        let worldX = toWorldX(e.clientX - svgRect.left);
        let worldY = toWorldY(e.clientY - svgRect.top);
        const currentPIs = useStore.getState().tempPIs;

        if (useStore.getState().orthoModeEnabled && currentPIs.length > 0) {
          const refPt = currentPIs[currentPIs.length - 1];
          if (Math.abs(worldX - refPt.x) > Math.abs(worldY - refPt.y)) {
            worldY = refPt.y;
          } else {
            worldX = refPt.x;
          }
        }
        
        const pt = snapPoint || { x: worldX, y: worldY };

        if (currentPIs.length === 0) {
          addTempPI(pt);
        } else if (currentPIs.length === 1) {
          const startPt = currentPIs[0];
          if (surface) {
            useStore.getState().addMDTEdit({ type: "remove_line", data: { p1: { x: startPt.x, y: startPt.y }, p2: { x: pt.x, y: pt.y } } });
          }
          useStore.getState().clearTempPIs();
        }
        return;
      } else if (mode === "extrapolate") {
        const svgRect = e.currentTarget.getBoundingClientRect();
        let worldX = toWorldX(e.clientX - svgRect.left);
        let worldY = toWorldY(e.clientY - svgRect.top);
        const currentPIs = useStore.getState().tempPIs;

        if (useStore.getState().orthoModeEnabled && currentPIs.length > 0) {
          const refPt = currentPIs[currentPIs.length - 1];
          if (Math.abs(worldX - refPt.x) > Math.abs(worldY - refPt.y)) {
            worldY = refPt.y;
          } else {
            worldX = refPt.x;
          }
        }

        const pt = snapPoint
          ? { x: snapPoint.x, y: snapPoint.y }
          : { x: worldX, y: worldY };
        addTempPI(pt);
        return;
      } else if (mode === "cut" || mode === "boundary") {
        const svgRect = e.currentTarget.getBoundingClientRect();
        let worldX = toWorldX(e.clientX - svgRect.left);
        let worldY = toWorldY(e.clientY - svgRect.top);
        const currentPIs = useStore.getState().tempPIs;

        if (useStore.getState().orthoModeEnabled && currentPIs.length > 0) {
          const refPt = currentPIs[currentPIs.length - 1];
          if (Math.abs(worldX - refPt.x) > Math.abs(worldY - refPt.y)) {
            worldY = refPt.y;
          } else {
            worldX = refPt.x;
          }
        }

        const pt = snapPoint
          ? { x: snapPoint.x, y: snapPoint.y }
          : { x: worldX, y: worldY };
        addTempPI(pt);
        return;
      }
    }

    if (e.button === 0 && useStore.getState().interactionMode === "insert_pi") {
      const svgRect = e.currentTarget.getBoundingClientRect();
      const worldX = toWorldX(e.clientX - svgRect.left);
      const worldY = toWorldY(e.clientY - svgRect.top);

      const alignId = useStore.getState().activeAlignmentId;
      if (alignId) {
        const align = alignments.find((a) => a.id === alignId);
        if (align) {
          const structPIs = align.keyPoints
            .filter((p) => p.pi)
            .map((p) => ({ x: p.x, y: p.y, radius: p.radius || 0 }));

          let bestInsertIndex = -1;
          let minD = Infinity;

          for (let i = 0; i < structPIs.length - 1; i++) {
            const p1 = structPIs[i];
            const p2 = structPIs[i + 1];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len2 = dx * dx + dy * dy;

            let t = ((worldX - p1.x) * dx + (worldY - p1.y) * dy) / len2;
            t = Math.max(0, Math.min(1, t));

            const px = p1.x + t * dx;
            const py = p1.y + t * dy;

            const d = Math.sqrt((worldX - px) ** 2 + (worldY - py) ** 2);
            if (d < minD) {
              minD = d;
              bestInsertIndex = i + 1;
            }
          }

          if (bestInsertIndex !== -1) {
            structPIs.splice(bestInsertIndex, 0, {
              x: worldX,
              y: worldY,
              radius: 100,
            });

            const geom = rebuildFromPIs(structPIs);
            const newAlign = new Alignment3D(
              align.name,
              geom.length,
              geom.points,
              align.profile,
              geom.keyPoints,
              align.keyProfilePoints,
            );
            newAlign.id = align.id;

            const newAlignments = useStore
              .getState()
              .alignments.map((a) => (a.id === align.id ? newAlign : a));
            useStore.getState().setAlignments(newAlignments);
            useStore.getState().setInteractionMode("none");
          }
        }
      }
    }

    if (
      e.button === 0 &&
      useStore.getState().mdtEditMode === "none"
    ) {
      const mode = useStore.getState().interactionMode;
      const validModes = ["none", "join_alignments", "select_intersection_target_main", "select_intersection_target_branch"];
      if (validModes.includes(mode)) {
        const svgRect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - svgRect.left;
        const my = e.clientY - svgRect.top;
        const worldX = toWorldX(mx);
        const worldY = toWorldY(my);

        if (alignments.length > 0) {
          let minGlobalDist = Infinity;
          let closestAlignId = alignments[0].id;

          for (const al of alignments) {
            if (al.isHidden) continue;
            const res = al.getNearestStationAndDistance(worldX, worldY);
            if (res.dist < minGlobalDist) {
              minGlobalDist = res.dist;
              closestAlignId = al.id;
            }
          }

          if (minGlobalDist * transform.scale < 20) {
            const targetIntId = editingIntersectionId || selectedIntersectionId;
            if (mode === "join_alignments") {
                const ms = useStore.getState().modifyState;
                if (!ms || ms.step === 'select1' || !ms.step) {
                   useStore.getState().setModifyState({ step: 'select2', firstId: closestAlignId, radius: ms?.radius || 0 });
                } else if (ms.step === 'select2' && ms.firstId !== closestAlignId) {
                   useStore.getState().setModifyState({ step: 'input_radius', firstId: ms.firstId, secondId: closestAlignId, radius: ms?.radius || 0 });
                }
            } else if (mode === "select_intersection_target_main" && targetIntId) {
                useStore.getState().updateIntersection(targetIntId, { mainTargetId: closestAlignId });
                useStore.getState().setInteractionMode("none");
            } else if (mode === "select_intersection_target_branch" && targetIntId) {
                useStore.getState().updateIntersection(targetIntId, { branchTargetId: closestAlignId });
                useStore.getState().setInteractionMode("none");
            } else if (mode === "none") {
              useStore.getState().setActiveAlignmentId(closestAlignId);
            }
          }
        }
      }
    }

    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (interactionMode.startsWith("create_dimension_")) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: "osnap",
        id: "osnap",
      });
      return;
    }
    if (pendingLine3DStart) {
      setPendingLine3DStart(null);
    }
    if (pendingCircle3DCenter) {
      setPendingCircle3DCenter(null);
    }
  };

  const handleMouseUp = (e?: React.MouseEvent) => {
    if (draggedIntersection !== null) {
      if (draggedIntersection.hasMoved) {
        useStore.getState().rebuildIntersectionCorridors(draggedIntersection.id);
      } else {
        useStore.getState().setSelectedIntersectionId(draggedIntersection.id);
        useStore.getState().setEditingIntersectionId(draggedIntersection.id);
        useStore.getState().setInteractionMode("select_lane_direction");
        setActiveTab("intersections");
      }
    }
    if (draggedPI !== null) {
      if (draggedPI.hasMoved) {
        const align = useStore
          .getState()
          .alignments.find((a) => a.id === draggedPI.alignmentId);
        if (align) {
          let currentIndex = draggedPI.index;
          if (draggedPI.id) {
            const newIdx = align.keyPoints.findIndex((p) => p.id === draggedPI.id);
            if (newIdx !== -1) currentIndex = newIdx;
          }
          
          const pi = align.keyPoints[currentIndex];
          if (pi) {
            useStore
              .getState()
              .checkAndCreateIntersection(
                draggedPI.alignmentId,
                currentIndex,
                pi.x,
                pi.y,
              );
            // We also need to check if the dragged PI belongs to an existing intersection and rebuild it.
            // Or if the alignment being dragged is the main alignment for an intersection.
            const relatedInts = useStore.getState().intersections.filter(
              (i) => i.branchAlignmentId === align.id || i.mainAlignmentId === align.id
            );
            relatedInts.forEach((int) => {
               useStore.getState().rebuildIntersectionCorridors(int.id);
            });
          }
        }
      }
    }
    setIsDragging(false);
    useStore.getState().setIsDynamicInteraction(false);
    setDraggedPI(null);
    setDraggedIntersection(null);
    setDraggedRegionBound(null);
    setDraggedDimension(null);
    setSnapPoint(null);
    flushTemporalHistory();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    let mx = e.clientX - svgRect.left;
    let my = e.clientY - svgRect.top;

    // Osnap Logic (find nearest endpoint in cadastre)
    let worldX = toWorldX(mx);
    let worldY = toWorldY(my);

    if (useStore.getState().orthoModeEnabled) {
      let refPt = null;
      if (useStore.getState().tempPIs.length > 0) {
        refPt = useStore.getState().tempPIs[useStore.getState().tempPIs.length - 1];
      } else if (draggedPI !== null) {
        refPt = { x: draggedPI.originalX, y: draggedPI.originalY };
      } else if (pendingLine3DStart) {
        refPt = pendingLine3DStart;
      } else if (pendingDimensionPoints && pendingDimensionPoints.length > 0) {
        refPt = pendingDimensionPoints[pendingDimensionPoints.length - 1];
      } else if (pendingCircle3DCenter) {
        refPt = pendingCircle3DCenter;
      }

      if (refPt) {
        if (Math.abs(worldX - refPt.x) > Math.abs(worldY - refPt.y)) {
          worldY = refPt.y;
        } else {
          worldX = refPt.x;
        }
        mx = toScreenX(worldX);
        my = toScreenY(worldY);
      }
    }

    const mdtMode = useStore.getState().mdtEditMode;
    const isIntersectionEditing = Boolean(editingIntersectionId || interactionMode === "select_lane_direction");
    let bestSnapPt: { x: number, y: number, z?: number, type?: 'endpoint' | 'midpoint' | 'center' | 'intersection' | 'perpendicular' | 'nearest' } | null = null;

    if (
      (interactionMode !== "none" || mdtMode !== "none") &&
      !isIntersectionEditing &&
      osnapEnabled
    ) {
      let bestDist = 20 / transform.scale;
      
      const checkSnap = (px: number, py: number, pz?: number, type: 'endpoint' | 'midpoint' | 'center' | 'intersection' | 'perpendicular' | 'nearest' = 'endpoint') => {
        const dist = Math.sqrt((px - worldX) ** 2 + (py - worldY) ** 2);
        if (dist < bestDist) {
          bestDist = dist;
          bestSnapPt = pz !== undefined ? { x: px, y: py, z: pz, type } : { x: px, y: py, type };
        }
      };

      let refPt = null;
      if (useStore.getState().tempPIs.length > 0) {
        refPt = useStore.getState().tempPIs[useStore.getState().tempPIs.length - 1];
      } else if (draggedPI !== null) {
        refPt = { x: draggedPI.originalX, y: draggedPI.originalY };
      } else if (pendingLine3DStart) {
        refPt = pendingLine3DStart;
      } else if (pendingDimensionPoints && pendingDimensionPoints.length > 0) {
        refPt = pendingDimensionPoints[pendingDimensionPoints.length - 1];
      } else if (pendingCircle3DCenter) {
        refPt = pendingCircle3DCenter;
      }

      const closeSegments: {x1: number, y1: number, x2: number, y2: number}[] = [];

      const processSegment = (x1: number, y1: number, x2: number, y2: number, z1?: number, z2?: number) => {
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        if (l2 === 0) {
          if (osnapConfig.endpoint) checkSnap(x1, y1, z1, 'endpoint');
          return;
        }

        if (osnapConfig.endpoint) {
          checkSnap(x1, y1, z1, 'endpoint');
          checkSnap(x2, y2, z2, 'endpoint');
        }

        if (osnapConfig.midpoint) {
          checkSnap((x1 + x2) / 2, (y1 + y2) / 2, z1 !== undefined && z2 !== undefined ? (z1 + z2) / 2 : undefined, 'midpoint');
        }

        // Nearest / Projection math
        let t = ((worldX - x1) * (x2 - x1) + (worldY - y1) * (y2 - y1)) / l2;
        let tClamped = Math.max(0, Math.min(1, t));
        const px = x1 + tClamped * (x2 - x1);
        const py = y1 + tClamped * (y2 - y1);
        const pz = z1 !== undefined && z2 !== undefined ? z1 + tClamped * (z2 - z1) : undefined;
        
        const distToSegment = Math.sqrt((px - worldX) ** 2 + (py - worldY) ** 2);

        if (distToSegment < 20 / transform.scale) {
          closeSegments.push({ x1, y1, x2, y2 });
        }

        if (osnapConfig.nearest) {
          checkSnap(px, py, pz, 'nearest');
        }

        if (osnapConfig.perpendicular && refPt) {
          let tPerp = ((refPt.x - x1) * (x2 - x1) + (refPt.y - y1) * (y2 - y1)) / l2;
          if (tPerp >= 0 && tPerp <= 1) {
            const perpX = x1 + tPerp * (x2 - x1);
            const perpY = y1 + tPerp * (y2 - y1);
            const perpZ = z1 !== undefined && z2 !== undefined ? z1 + tPerp * (z2 - z1) : undefined;
            // Check if perpendicular point is close to cursor
            if (Math.sqrt((perpX - worldX) ** 2 + (perpY - worldY) ** 2) < 20 / transform.scale) {
              checkSnap(perpX, perpY, perpZ, 'perpendicular');
            }
          }
        }
      };

            const alignments = useStore.getState().alignments;
      alignments.forEach((alignment) => {
        if (alignment.isHidden) return;
        if (alignment.points.length > 1) {
          for (let i = 0; i < alignment.points.length - 1; i++) {
            const p1 = alignment.points[i];
            const p2 = alignment.points[i+1];
            processSegment(p1.x, p1.y, p2.x, p2.y);
          }
        }
      });

      featurePaths.forEach((feature) => {
        if (feature.worldPoints && feature.worldPoints.length > 1) {
          for (let i = 0; i < feature.worldPoints.length - 1; i++) {
            const p1 = feature.worldPoints[i];
            const p2 = feature.worldPoints[i+1];
            processSegment(p1.x, p1.y, p2.x, p2.y, p1.z, p2.z);
          }
        }
      });

      const points3D = useStore.getState().points3D;
      points3D.forEach((pt) => {
        if (osnapConfig.endpoint || osnapConfig.nearest) { // Treat points as endpoints
          checkSnap(pt.x, pt.y, pt.z, 'endpoint');
        }
      });

      const lines3D = useStore.getState().lines3D;
      lines3D.forEach((line) => {
        processSegment(line.p1.x, line.p1.y, line.p2.x, line.p2.y, line.p1.z, line.p2.z);
      });

      const circles3D = useStore.getState().circles3D;
      circles3D.forEach((circle) => {
        if (osnapConfig.center) {
          checkSnap(circle.center.x, circle.center.y, circle.center.z, 'center');
        }
        if (osnapConfig.nearest) {
          const dx = worldX - circle.center.x;
          const dy = worldY - circle.center.y;
          const distToCenter = Math.hypot(dx, dy);
          if (distToCenter > 0) {
            const nx = dx / distToCenter;
            const ny = dy / distToCenter;
            const px = circle.center.x + nx * circle.radius;
            const py = circle.center.y + ny * circle.radius;
            checkSnap(px, py, circle.center.z, 'nearest');
          }
        }
      });

      if (cadastre) {
        cadastre.forEach((layer) => {
          layer.entities.forEach((entity) => {
            if (entity.type === "LINE") {
              const v = entity.vertices;
              if (v && v.length >= 2) processSegment(v[0].x, v[0].y, v[1].x, v[1].y);
            } else if (entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") {
              const v = entity.vertices;
              if (v && v.length >= 2) {
                for (let i = 0; i < v.length - 1; i++) {
                  processSegment(v[i].x, v[i].y, v[i+1].x, v[i+1].y);
                }
                if (entity.shape || entity.closed) {
                  processSegment(v[v.length - 1].x, v[v.length - 1].y, v[0].x, v[0].y);
                }
              }
            } else if (entity.type === "ARC" || entity.type === "CIRCLE") {
              if (osnapConfig.center) {
                checkSnap(entity.x, entity.y, undefined, 'center');
              }
              // TODO: Snap to nearest on arc/circle if needed
            } else if (entity.vertices) {
               // Fallback for other entities with vertices
               entity.vertices.forEach((v: { x: number; y: number }) => {
                 if (osnapConfig.endpoint) checkSnap(v.x, v.y, undefined, 'endpoint');
               });
            }
          });
        });
      }

      if (osnapConfig.intersection && closeSegments.length >= 2) {
        // Check intersections among segments that are close to the cursor
        for (let i = 0; i < closeSegments.length; i++) {
          for (let j = i + 1; j < closeSegments.length; j++) {
            const s1 = closeSegments[i];
            const s2 = closeSegments[j];
            
            const denom = (s1.x1 - s1.x2) * (s2.y1 - s2.y2) - (s1.y1 - s1.y2) * (s2.x1 - s2.x2);
            if (denom !== 0) {
              const t = ((s1.x1 - s2.x1) * (s2.y1 - s2.y2) - (s1.y1 - s2.y1) * (s2.x1 - s2.x2)) / denom;
              const u = ((s1.x1 - s2.x1) * (s1.y1 - s1.y2) - (s1.y1 - s2.y1) * (s1.x1 - s1.x2)) / denom;
              
              if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
                const ix = s1.x1 + t * (s1.x2 - s1.x1);
                const iy = s1.y1 + t * (s1.y2 - s1.y1);
                checkSnap(ix, iy, undefined, 'intersection');
              }
            }
          }
        }
      }

      if (bestSnapPt) {
        worldX = bestSnapPt.x;
        worldY = bestSnapPt.y;
        mx = toScreenX(worldX);
        my = toScreenY(worldY);
      }
      setSnapPoint(bestSnapPt);
    } else {
      setSnapPoint(null);
    }

    if (interactionMode === "extend_alignment" && tempPIs.length >= 2) {
      const last1 = tempPIs[tempPIs.length - 1];
      const last2 = tempPIs[tempPIs.length - 2];
      const dx = last1.x - last2.x;
      const dy = last1.y - last2.y;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        const nx = dx / len;
        const ny = dy / len;
        const vx = worldX - last1.x;
        const vy = worldY - last1.y;

        let dot = vx * nx + vy * ny;
        if (dot < 0) dot = 0; // Prevent extending backwards

        worldX = last1.x + nx * dot;
        worldY = last1.y + ny * dot;
        mx = toScreenX(worldX);
        my = toScreenY(worldY);
      }
    }

    if (draggedIntersection !== null) {
      const dx = e.clientX - draggedIntersection.startX;
      const dy = e.clientY - draggedIntersection.startY;
      if (!draggedIntersection.hasMoved && Math.hypot(dx, dy) < 4) {
        return;
      }
      draggedIntersection.hasMoved = true;

      const int = intersections.find((i) => i.id === draggedIntersection.id);
      if (int) {
        const mainAlign = alignments.find((a) => a.id === int.mainAlignmentId);
        const branchAlign = alignments.find(
          (a) => a.id === int.branchAlignmentId,
        );
        if (mainAlign && branchAlign) {
          // Snap strictly to the main alignment
          const resMain = mainAlign.getNearestStationAndDistance(
            worldX,
            worldY,
          );
          const mainPt = mainAlign.getPointAtStation(resMain.sta);

          // Find if branch starts or ends at the intersection
          const isStart = int.branchStation === 0 || int.branchStation < branchAlign.length / 2;
          const piIndex = isStart ? 0 : branchAlign.keyPoints.length - 1;

          const state = useStore.getState();

          const bNorm = branchAlign.getOrientationAtStation(int.branchStation);
          const branchUnitDir = isStart
            ? { x: bNorm.tx, y: bNorm.ty }
            : { x: -bNorm.tx, y: -bNorm.ty };

          const norm = mainAlign.getOrientationAtStation(resMain.sta);
          const dotRight = branchUnitDir.x * norm.nx + branchUnitDir.y * norm.ny;
          
          let currentIsRightSide = int.isRightSide;
          if (currentIsRightSide === undefined) {
             currentIsRightSide = dotRight >= 0;
          }

          let M_common = { x: mainPt.x, y: mainPt.y };

          useStore.getState().updateAlignmentPI(branchAlign.id, piIndex, M_common.x, M_common.y);

          const updatedBranch = useStore
            .getState()
            .alignments.find((a) => a.id === branchAlign.id);
          const newBranchSta = isStart ? 0 : updatedBranch?.length || 0;

          useStore.getState().updateIntersection(int.id, {
            mainStation: resMain.sta,
            branchStation: newBranchSta,
            isRightSide: currentIsRightSide,
          });
        }
      }
      return;
    }

    if (draggedPI !== null) {
      const dx = e.clientX - draggedPI.pointerStartX;
      const dy = e.clientY - draggedPI.pointerStartY;
      if (!draggedPI.hasMoved && Math.hypot(dx, dy) < 5) {
        return;
      }
      draggedPI.hasMoved = true;

      const state = useStore.getState();
      const align = state.alignments.find((a) => a.id === draggedPI.alignmentId);
      
      let finalX = worldX;
      let finalY = worldY;
      
      let draggedInt: any = null;
      let currentIndex = draggedPI.index;

      if (align && draggedPI.id) {
        const newIdx = align.keyPoints.findIndex((p) => p.id === draggedPI.id);
        if (newIdx !== -1) {
          currentIndex = newIdx;
          draggedPI.index = newIdx; // mutate local copy for subsequent checks
        }
      }

      if (align) {
        // Check if this PI is part of an intersection
        const piSta = align.keyPoints[currentIndex]?.sta;
        if (piSta !== undefined) {
          draggedInt = state.intersections.find(
            (i) => i.branchAlignmentId === align.id && Math.abs(i.branchStation - piSta) < 20
          );
        }
      }

      useStore
        .getState()
        .updateAlignmentPI(draggedPI.alignmentId, currentIndex, finalX, finalY);
        
      // If we snapped and updated, we need to rebuild corridors
      if (align) {
        const updatedAlign = useStore.getState().alignments.find((a) => a.id === draggedPI.alignmentId);
        const piSta = updatedAlign?.keyPoints[currentIndex]?.sta;
        if (piSta !== undefined) {
          if (draggedInt) {
             const updatedBranch = updatedAlign;
             const isStart = draggedInt.branchStation === 0 || draggedInt.branchStation < (align.length / 2);
             const newBranchSta = isStart ? 0 : updatedBranch?.length || 0;
             
             // Check if we need to update mainStation as well (if snapped)
             const mainAlign = useStore.getState().alignments.find((a) => a.id === draggedInt.mainAlignmentId);
             let newMainSta = draggedInt.mainStation;
             if (mainAlign) {
                const resMain = mainAlign.getNearestStationAndDistance(finalX, finalY);
                newMainSta = resMain.sta;
             }

             useStore.getState().updateIntersection(draggedInt.id, {
                branchStation: newBranchSta,
                mainStation: newMainSta
             });
          } else {
             // If no intersection was found to update, we still need to trigger the alignment's rebuild process 
             // Rebuild handled by updateAlignmentPI now
          }
        }
      }

      return;
    }

    if (draggedDimension !== null) {
      const dx = worldX - draggedDimension.startX;
      const dy = worldY - draggedDimension.startY;
      const newPoints = draggedDimension.originalPoints.map(p => ({
        x: p.x + dx,
        y: p.y + dy
      }));
      useStore.getState().updateDimension(draggedDimension.id, { points: newPoints });
      return;
    }

    if (draggedRegionBound !== null) {
      const align = alignments.find(
        (a) => a.id === draggedRegionBound.alignmentId,
      );
      if (align) {
        useStore.setState({ planMode: true });
        const { sta } = align.getNearestStationAndDistance(worldX, worldY);
        let updatedSta = Math.round(sta * 10) / 10;

        // Snapping logic
        const snapThreshold = 50 / transform.scale; // 50 pixels threshold for stronger magnet
        const snapStations = new Set<number>();

        // 1. Intersections
        intersections.forEach((int) => {
          if (
            int.mainAlignmentId === align.id &&
            int.mainStation !== undefined
          ) {
            snapStations.add(int.mainStation);
            // Also snap to the intersection gap edges
            let branchLaneW = 3.6;
            const bCorridor = corridors.find(
              (c) => c.alignmentId === int.branchAlignmentId,
            );
            if (bCorridor && bCorridor.regions.length > 0) {
              const r = bCorridor.regions[0];
              const res = evaluateAssemblyAtStation(
                r.startStation + 0.01,
                assemblies,
                corridors,
                surface,
                alignments,
                int.branchAlignmentId,
              );
              branchLaneW = Math.abs(
                res?.points["Bordo_Faixa_Dir_1"]?.x || res?.points["Bordo_Faixa_Esq_1"]?.x || res?.points["P2"]?.x || res?.points["P3"]?.x || 3.6,
              );
            }
            snapStations.add(int.mainStation - branchLaneW);
            snapStations.add(int.mainStation + branchLaneW);
          }
          if (
            int.branchAlignmentId === align.id &&
            int.branchStation !== undefined
          ) {
            snapStations.add(int.branchStation);
            let mainLaneW = 3.6;
            const mCorridor = corridors.find(
              (c) => c.alignmentId === int.mainAlignmentId,
            );
            if (mCorridor && mCorridor.regions.length > 0) {
              const r = mCorridor.regions[0];
              const res = evaluateAssemblyAtStation(
                r.startStation + 0.01,
                assemblies,
                corridors,
                surface,
                alignments,
                int.mainAlignmentId,
              );
              mainLaneW = Math.abs(
                res?.points["Bordo_Faixa_Dir_1"]?.x || res?.points["Bordo_Faixa_Esq_1"]?.x || res?.points["P2"]?.x || res?.points["P3"]?.x || 3.6,
              );
            }
            snapStations.add(int.branchStation - mainLaneW);
            snapStations.add(int.branchStation + mainLaneW);
          }
        });

        // 2. Region boundaries (same and other alignments)
        corridors.forEach((c) => {
          const cAlign = alignments.find((a) => a.id === c.alignmentId);
          if (!cAlign) return;

          c.regions.forEach((r, rIdx) => {
            const startIsDragged = draggedRegionBound.boundsToUpdate.some(
              (b) =>
                b.corridorId === c.id &&
                b.regionIdx === rIdx &&
                b.prop === "startStation",
            );
            if (!startIsDragged) {
              if (c.alignmentId === align.id) {
                snapStations.add(r.startStation);
              } else {
                const pt = cAlign.getPointAtStation(r.startStation);
                const { sta } = align.getNearestStationAndDistance(pt.x, pt.y);
                snapStations.add(sta);
              }
            }

            const endIsDragged = draggedRegionBound.boundsToUpdate.some(
              (b) =>
                b.corridorId === c.id &&
                b.regionIdx === rIdx &&
                b.prop === "endStation",
            );
            if (!endIsDragged) {
              if (c.alignmentId === align.id) {
                snapStations.add(r.endStation);
              } else {
                const pt = cAlign.getPointAtStation(r.endStation);
                const { sta } = align.getNearestStationAndDistance(pt.x, pt.y);
                snapStations.add(sta);
              }
            }
          });
        });

        // 3. Key Points (Pontos Notáveis) de todos os alinhamentos
        alignments.forEach((a) => {
          a.keyPoints.forEach((kp) => {
            if (
              kp.label &&
              (kp.label === "PI" ||
                kp.label === "PC" ||
                kp.label === "PT" ||
                kp.label === "PCC" ||
                kp.label === "PRC" ||
                kp.label === "PP" ||
                kp.label === "PF" ||
                kp.label === "PI")
            ) {
              if (a.id === align.id) {
                snapStations.add(kp.sta);
              } else {
                const pt = a.getPointAtStation(kp.sta);
                const { sta } = align.getNearestStationAndDistance(pt.x, pt.y);
                snapStations.add(sta);
              }
            }
          });
        });

        let minDist = Infinity;
        let snapSta: number | null = null;
        snapStations.forEach((s) => {
          const pt1 = align.getPointAtStation(s);
          const pt2 = align.getPointAtStation(updatedSta);
          const dist = Math.hypot(pt1.x - pt2.x, pt1.y - pt2.y);
          // Alternatively, since station is length, dist is roughly |s - updatedSta| * scale = pixel dist.
          // But 15 / transform.scale is in world units. So |s - updatedSta| < snapThreshold directly.
          const staDist = Math.abs(s - updatedSta);

          if (staDist < snapThreshold && staDist < minDist) {
            minDist = staDist;
            snapSta = s;
          }
        });

        if (snapSta !== null) {
          updatedSta = snapSta;
          const pt = align.getPointAtStation(updatedSta);
          setSnapPoint({ x: pt.x, y: pt.y });
        } else {
          setSnapPoint(null);
        }

        let modified = false;
        const freshCorridors = useStore.getState().corridors;
        const newCorridors = freshCorridors.map((c) => {
          let cMod = false;
          const newRegions = c.regions.map((r, rIdx) => {
            const boundMatch = draggedRegionBound.boundsToUpdate.filter(
              (b) => b.corridorId === c.id && b.regionIdx === rIdx,
            );
            if (boundMatch.length > 0) {
              const nr = { ...r };
              boundMatch.forEach((b) => {
                nr[b.prop] = updatedSta;
              });
              if (nr.startStation > nr.endStation) {
                const t = nr.startStation;
                nr.startStation = nr.endStation;
                nr.endStation = t;
              }
              cMod = true;
              return nr;
            }
            return r;
          });
          if (cMod) {
            modified = true;
            return { ...c, regions: newRegions };
          }
          return c;
        });

        if (modified) {
          useStore.setState({ corridors: newCorridors });
          useStore.getState().recomputeGeometry();
        }
      }
      return;
    }

    if (isDragging) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setTransform((prev) => ({ ...prev, dx: prev.dx + dx, dy: prev.dy + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
    }

    if (alignments.length > 0) {
      let minGlobalDist = Infinity;
      let closestAlignId = alignments[0].id;
      let closestSta = 0;

      for (const al of alignments) {
        const res = al.getNearestStationAndDistance(worldX, worldY);
        if (res.dist < minGlobalDist) {
          minGlobalDist = res.dist;
          closestAlignId = al.id;
          closestSta = res.sta;
        }
      }

      const currentActiveId = useStore.getState().activeAlignmentId;

      // Always project using the latest active alignment
      const freshActiveId = useStore.getState().activeAlignmentId;
      const targetAlign =
        alignments.find((a) => a.id === freshActiveId) ||
        alignments.find((a) => a.id === closestAlignId);

      if (useStore.getState().dynamicCursor) {
        if (targetAlign) {
          const res = targetAlign.getNearestStationAndDistance(worldX, worldY);
          // ONLY update if we are within a reasonable distance limit
          // Prevents the section line from updating when the mouse is far away on the black screen
          if (res.dist * transform.scale < 20) {
            useStore.getState().setStation(res.sta);
          }
        }
      }
    }

    setCrosshairPos({ x: mx, y: my });

    if (mdtMode === "extrapolate" && surface) {
      const info = surface.extrapolateInfo(worldX, worldY);
      if (info) {
        setExtrapolateHoverInfo({
          x: worldX,
          y: worldY,
          projX: info.projX,
          projY: info.projY,
        });
      } else {
        setExtrapolateHoverInfo(null);
      }
    } else {
      setExtrapolateHoverInfo(null);
    }

    if (mdtMode === "add_point" && surface) {
      setAddPointHoverZ(surface.getInterpolatedElevation(worldX, worldY));
    } else {
      setAddPointHoverZ(null);
    }
  };

  const formattedStation = `0+${Math.floor(station).toString().padStart(3, "0")}.${((station % 1) * 100).toFixed(0).padStart(2, "0")}`;

  const scaleRatio = transform.scale / computedTransform.scale;
  const panDeltaX = transform.dx - computedTransform.dx * scaleRatio;
  const panDeltaY = transform.dy - computedTransform.dy * scaleRatio;
  
  // Transform string to apply visual panning to stale arrays during drag
  // We apply the offset from the original screen center (toScreenX(0) etc.) if scaling, 
  // but if scale is same, it's just a translation.
  // Actually, since all coordinates are already translated by computedTransform, 
  // we just need to translate by delta. If scale changed, simple translate is slightly off, 
  // but it's acceptable for the instant visual feedback before re-render.
  const panTransformStr = (panDeltaX !== 0 || panDeltaY !== 0 || scaleRatio !== 1) 
    ? `translate(${panDeltaX}, ${panDeltaY}) scale(${scaleRatio})` 
    : undefined;
    
  const panTransformCss = (panDeltaX !== 0 || panDeltaY !== 0 || scaleRatio !== 1) 
    ? `translate(${panDeltaX}px, ${panDeltaY}px) scale(${scaleRatio})` 
    : undefined;

  /* Geometria dos narizes — uma única conta, compartilhada com o corredor
   * (store.rebuildIntersectionCorridors usa o mesmo resolverNarizes). */
  const processedNTGeoms = useMemo(
    () => resolverNarizes(
      Object.values((intersectionNTs || {}) as Record<string, any[]>).flat(),
      { ntEscolhas, ntTipos, ntParams, ntBordos, intersections },
    ),
    [intersectionNTs, ntEscolhas, ntTipos, ntParams, ntBordos, intersections],
  );

  /* CORTAR CURTO — as estacas onde o refúgio deve morrer.
   *
   * O refúgio nasce cobrindo a garganta inteira (construir longo). Aqui, com os
   * narizes já resolvidos SOBRE esse refúgio longo, projeta-se o pé de cada cap
   * no eixo da principal: são as duas estacas que aparam a região. Ordem única,
   * sem circularidade — refúgio longo → nariz → refúgio aparado. */
  useEffect(() => {
    const porInt: Record<string, { sta0: number; sta1: number }> = {};
    const porNariz: Record<string, Record<string, number>> = {};
    Object.entries((intersectionNTs || {}) as Record<string, any[]>).forEach(([intId, lista]) => {
      const int = intersections.find((i: any) => i.id === intId);
      if (!int) return;
      const eixo = alignments.find((a) => a.id === int.mainAlignmentId);
      if (!eixo) return;
      /* PROJEÇÃO EXATA sobre o eixo, não o vértice mais próximo: a estaca do NF
       * é limite de região do corredor, e encaixar na malha de pontos punha o
       * corte até meio metro fora da ponta de pavimento. Interpola `sta` dentro
       * do segmento. */
      const staDe = (p: { x: number; y: number }) => {
        const pts = ((eixo as any).points || []) as { x: number; y: number; sta: number }[];
        let melhor = NaN, melhorD2 = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const vx = b.x - a.x, vy = b.y - a.y;
          const l2 = vx * vx + vy * vy;
          const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2)) : 0;
          const qx = a.x + t * vx, qy = a.y + t * vy;
          const d2 = (p.x - qx) ** 2 + (p.y - qy) ** 2;
          if (d2 < melhorD2) { melhorD2 = d2; melhor = a.sta + t * (b.sta - a.sta); }
        }
        return melhor;
      };
      const stas: number[] = [];
      (lista || []).forEach((nt: any) => {
        const key = narizKey(nt);
        const r: any = (processedNTGeoms as any)[key];
        if (!r?.geom?.cap) return;
        /* SÓ NARIZ DE GARGANTA CORTA A PRINCIPAL. O nariz de ponta de cunha não
           encosta na pista — projetar o cap dele no eixo dava uma estaca no meio
           da garganta e um corte de região a mais. */
        const tocaPrincipal =
          nt.raizA === int.mainAlignmentId || nt.raizB === int.mainAlignmentId;
        if (r.geom.gore || !tocaPrincipal) return;
        const s = staDe(r.geom.cap[0]);   // pé do cap: a ponta de pavimento
        if (!Number.isFinite(s)) return;
        stas.push(s);
        (porNariz[intId] ||= {})[key] = s;
      });
      if (int.hasRefugio && stas.length >= 2) {
        porInt[intId] = { sta0: Math.min(...stas), sta1: Math.max(...stas) };
      }
    });
    const store = useStore.getState();
    if (JSON.stringify(store.refugioCortes || {}) !== JSON.stringify(porInt)) {
      store.setRefugioCortes(porInt);
    }
    if (JSON.stringify((store as any).narizCortes || {}) !== JSON.stringify(porNariz)) {
      (store as any).setNarizCortes(porNariz);
    }
  }, [processedNTGeoms, intersectionNTs, intersections, alignments]);

  /* DEDUCAO DOS FLUXOS - CONTINUIDADE (lib/flowRules).
   * O quadrante e a sequencia do fluxo das duas faixas que liga: le-se o
   * sentido da faixa vizinha da principal e ve-se se ele entra ou sai do
   * quadrante. O ramo herda dai. Nada depende da posicao do no.
   * e o unico possivel e define a mao unica. */
  const fluxoDeduzido = useMemo(() => {
    const movimentos: any[] = [];
    const votos = new Map<string, Set<string>>();
    const votar = (cid: string | undefined, dir: string) => {
      if (!cid) return;
      if (!votos.has(cid)) votos.set(cid, new Set());
      votos.get(cid)!.add(dir);
    };

    const eixoDe = (id?: string | null) => {
      if (!id) return null;
      const ap = alignmentPaths.find((a: any) => a.id === id);
      if (ap?.worldPoints && ap.worldPoints.length > 1) return ap.worldPoints as any[];
      const al: any = alignments.find((a: any) => a.id === id);
      return al?.points && al.points.length > 1 ? (al.points as any[]) : null;
    };

    /* Fita mais longa de cada corredor de quadrante = linha do movimento. */
    const porCorredor = new Map<string, { pts: any[]; len: number }>();
    for (const rb of ribbonPaths as any[]) {
      const cid = rb.corridorId || "";
      if (!cid || !laneSurface(rb)) continue;
      const corr = corridors.find((c) => c.id === cid);
      if (!corr || !/Corredor Quadrante/i.test(corr.name || "")) continue;
      const pts = rb.centerlineWorld;
      if (!pts || pts.length < 2) continue;
      let len = 0;
      for (let i = 0; i < pts.length - 1; i++) len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      const atual = porCorredor.get(cid);
      if (!atual || len > atual.len) porCorredor.set(cid, { pts, len });
    }

    porCorredor.forEach(({ pts }, cid) => {
      const int: any = intersections.find((it: any) => cid.startsWith("corr-" + it.id + "-"));
      if (!int) return;
      const eixoMain = eixoDe(int.mainAlignmentId);
      const eixoRamo = eixoDe(int.branchAlignmentId);
      if (!eixoMain || !eixoRamo) return;

      const J = cruzamentoDeEixos(eixoMain, eixoRamo);
      const noMain = peNoEixo(eixoMain, J);
      const M = { x: noMain.ux, y: noMain.uy };
      const B = direcaoParaLonge(eixoRamo, eixoMain, J);
      if (!B) return;

      const pA = pts[0];
      const pB = pts[pts.length - 1];
      const aM = peNoEixo(eixoMain, pA);
      const aR = peNoEixo(eixoRamo, pA);
      const bM = peNoEixo(eixoMain, pB);
      const bR = peNoEixo(eixoRamo, pB);
      const aEhMain = aM.d - aR.d < bM.d - bR.d;

      /* CONTINUIDADE DE FLUXO — o quadrante é a sequência das faixas que liga.
       * Compara-se o FLUXO DA FAIXA vizinha da principal com a tangente do
       * quadrante na ponta que encosta nela: se o fluxo entra no quadrante, o
       * tráfego continua para o ramo (ENTRADA); se sai, vem do ramo (SAÍDA).
       * Tudo medido no próprio quadrante — nenhuma referência à posição do nó,
       * que era o que fazia o sentido mudar quando a interseção era movida. */
      const pontaMain = aEhMain ? pA : pB;
      const vizinhoMain = aEhMain ? pts[1] : pts[pts.length - 2];
      const paraDentro = { x: vizinhoMain.x - pontaMain.x, y: vizinhoMain.y - pontaMain.y };
      const peMain = peNoEixo(eixoMain, pontaMain);

      const mainCorr = corridors.find((c) => c.alignmentId === int.mainAlignmentId);
      const ramoCorr = corridors.find((c) => c.alignmentId === int.branchAlignmentId);
      const ladoMain = sideOf(
        { x: peMain.ux, y: peMain.uy },
        { x: pontaMain.x - peMain.x, y: pontaMain.y - peMain.y },
      );
      const dirFaixaMain = outerLaneFlow(
        laneDirections as any,
        mainCorr?.id,
        ladoMain,
        flowCtxBase(mainCorr?.id),
      );
      const fluxoMain =
        dirFaixaMain === "forward"
          ? { x: peMain.ux, y: peMain.uy }
          : { x: -peMain.ux, y: -peMain.uy };
      const alimentaPelaPrincipal = fluxoMain.x * paraDentro.x + fluxoMain.y * paraDentro.y > 0;

      const noRamo = peNoEixo(eixoRamo, J);
      const tanRamo = { x: noRamo.ux, y: noRamo.uy };
      const maoDecl =
        (ramoCorr as any)?.mao === "unica"
          ? maoDoRamo((ramoCorr as any).maoSentido || "forward", tanRamo, B)
          : null;

      const mov = movimentoDoQuadrante({ alimentaPelaPrincipal, maoRamo: maoDecl });
      /* O ramo herda o fluxo do movimento — é a mesma continuidade, lida do
         outro lado do quadrante. */
      const dirRamo = fluxoParaSentido(fluxoDoRamo(B, mov.tipo), tanRamo);
      votar(ramoCorr?.id, dirRamo);

      movimentos.push({
        cid,
        tipo: mov.tipo,
        pts,
        inverter: (mov.tipo === "Desaceleração") !== aEhMain,
        porque: mov.porque + " · faixa da principal " + ladoMain + "/" + dirFaixaMain,
      });
    });

    const sentidoPorCorredor = new Map<string, "forward" | "backward">();
    votos.forEach((set, cid) => {
      if (set.size === 1) sentidoPorCorredor.set(cid, Array.from(set)[0] as any);
    });
    return { movimentos, sentidoPorCorredor };
  }, [ribbonPaths, intersections, corridors, alignmentPaths, alignments, laneDirections, assemblies]);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-transparent overflow-hidden ${className || ""}`}
      onWheel={handleWheel}
      onPointerDown={handleMouseDown}
      onPointerUp={handleMouseUp}
      onPointerLeave={handleMouseUp}
      onPointerMove={handleMouseMove}
      onContextMenu={handleContextMenu}
      onClick={(e) => {
        // Only clear if not clicking on any child elements that stop propagation (like ribbons)
        setSelectedCorridorId(null);
        setSelectedRegionId(null);
        useStore.getState().setSelectedIntersectionId(null);
      }}
    >
      <div className="absolute top-0 left-0 right-0 p-2 flex items-center justify-between border-b border-slate-200 bg-slate-100/50 backdrop-blur-sm z-10 pointer-events-none">
        <div className="flex items-center gap-2 text-slate-500 font-medium text-xs">
          <MapIcon size={14} />{" "}
          {surface ? "PLAN VIEW (GEOGRAPHIC)" : "PLAN VIEW (SCHEMATIC)"}
        </div>
        <div className="flex gap-4 items-center">
          {surface && (
            <span className="text-emerald-600/80 font-mono text-[10px] bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-900/50">
              MDT Carregado
            </span>
          )}
          <div className="text-blue-600 font-mono text-xs font-bold tracking-wider">
            STA {formattedStation}
          </div>

          <div 
            className="flex bg-slate-50 rounded mx-2 pointer-events-auto shadow-xl border border-slate-300"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTransform((t) => ({ ...t, scale: t.scale * 1.2 }));
              }}
              className="px-2 py-1 hover:bg-slate-100 text-slate-700 font-mono text-sm border-r border-slate-300"
            >
              +
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTransform((t) => ({ ...t, scale: t.scale / 1.2 }));
              }}
              className="px-2 py-1 hover:bg-slate-100 text-slate-700 font-mono text-sm border-r border-slate-300"
            >
              -
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFitTrigger((f) => f + 1);
              }}
              className="px-2 py-1 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
            >
              RECEN
            </button>
          </div>
        </div>
      </div>

      {zoomJanelaAtivo && (
        <div
          className="absolute inset-0 z-[350] cursor-crosshair"
          onPointerDown={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            setJanelaZoom({ x1: x, y1: y, x2: x, y2: y });
          }}
          onPointerMove={(e) => {
            if (!janelaZoom) return;
            const r = e.currentTarget.getBoundingClientRect();
            setJanelaZoom({ ...janelaZoom, x2: e.clientX - r.left, y2: e.clientY - r.top });
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            const s = useStore.getState();
            if (janelaZoom) {
              const larg = Math.abs(janelaZoom.x2 - janelaZoom.x1);
              const alt = Math.abs(janelaZoom.y2 - janelaZoom.y1);
              // Abaixo de 8 px é clique, não janela — sai do modo sem mexer no zoom.
              if (larg > 8 && alt > 8) {
                const r = e.currentTarget.getBoundingClientRect();
                const t = s.planView2DTransform;
                const escala = Math.min(r.width / larg, r.height / alt) * t.scale;
                const cxTela = (janelaZoom.x1 + janelaZoom.x2) / 2;
                const cyTela = (janelaZoom.y1 + janelaZoom.y2) / 2;
                const mundoX = (cxTela - t.dx) / t.scale;
                const mundoY = (cyTela - t.dy) / t.scale;
                s.empilharZoom();
                s.setPlanView2DTransform({
                  scale: escala,
                  dx: r.width / 2 - mundoX * escala,
                  dy: r.height / 2 - mundoY * escala,
                });
              }
            }
            setJanelaZoom(null);
            s.setZoomJanelaAtivo(false);
          }}
        >
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[11px] px-3 py-1.5 rounded-md shadow-lg pointer-events-none">
            Zoom Janela — arraste para enquadrar
          </div>
          {janelaZoom && (
            <div
              className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none"
              style={{
                left: Math.min(janelaZoom.x1, janelaZoom.x2),
                top: Math.min(janelaZoom.y1, janelaZoom.y2),
                width: Math.abs(janelaZoom.x2 - janelaZoom.x1),
                height: Math.abs(janelaZoom.y2 - janelaZoom.y1),
              }}
            />
          )}
        </div>
      )}

      {/* Visualization Tools Toolbar */}
      <div 
        className="absolute top-1/2 right-4 -translate-y-1/2 flex flex-col gap-2 p-1.5 bg-white border border-slate-300/50 rounded-lg shadow-xl z-[300]"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative group/osnap">
          <div className="flex bg-white rounded border border-transparent hover:border-slate-300 transition-colors">
            <button
              className={`p-2 rounded-l transition-colors relative ${osnapEnabled ? 'bg-sky-600/20 text-sky-400' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
              onClick={(e) => { e.stopPropagation(); setOsnapEnabled(!osnapEnabled); }}
              title={`OSNAP ${osnapEnabled ? "(Ativo)" : "(Inativo)"}`}
            >
              <Magnet size={18} />
            </button>
            <button
              className={`p-1 rounded-r transition-colors flex items-center justify-center ${osnapEnabled ? 'bg-sky-600/20 text-sky-400' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'} border-l border-slate-200/50`}
              onClick={(e) => { e.stopPropagation(); setOsnapMenuOpen(!osnapMenuOpen); }}
            >
              <ChevronDown size={12} />
            </button>
          </div>
          
          {osnapMenuOpen && (
            <div className="absolute right-full top-0 mr-2 w-40 bg-white border border-slate-300 rounded-lg shadow-xl py-1 z-[300]">
              <div className="px-3 py-1.5 border-b border-slate-200 text-[10px] font-semibold tracking-wider text-slate-500">
                SNAP OPTIONS
              </div>
              {[
                { key: 'endpoint', label: 'Endpoint' },
                { key: 'midpoint', label: 'Midpoint' },
                { key: 'center', label: 'Center' },
                { key: 'intersection', label: 'Intersection' },
                { key: 'perpendicular', label: 'Perpendicular' },
                { key: 'nearest', label: 'Nearest' }
              ].map(opt => (
                <label key={opt.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={osnapConfig[opt.key as keyof typeof osnapConfig]}
                    onChange={(e) => setOsnapConfig({ [opt.key]: e.target.checked })}
                    className="rounded border-slate-300 bg-slate-50 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-xs text-slate-700 select-none">{opt.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          className={`p-2 rounded transition-colors group relative ${orthoModeEnabled ? 'bg-sky-600/20 text-sky-400' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
          onClick={(e) => { e.stopPropagation(); setOrthoModeEnabled(!orthoModeEnabled); }}
        >
          <Ruler size={18} />
          <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-50 text-xs text-slate-800 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-lg">
            ORTHO {orthoModeEnabled ? "(Ativo)" : "(Inativo)"}
          </div>
        </button>
        <button
          className={`p-2 rounded transition-colors group relative ${interactionMode === 'select_lane_direction' ? 'bg-sky-600/20 text-sky-400' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
          onClick={(e) => { e.stopPropagation(); setInteractionMode(interactionMode === 'select_lane_direction' ? 'none' : 'select_lane_direction'); }}
        >
          <ArrowRightLeft size={18} />
          <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-50 text-xs text-slate-800 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-lg">
            Definir Sentido das Faixas
          </div>
        </button>
      </div>

      {/* TIN Background Canvas - High Performance */}
      <canvas
        ref={canvasRef}
        width={dimensions.w}
        height={dimensions.h}
        className="absolute inset-0 pointer-events-none origin-top-left"
      />

      <svg
        className={`relative flex-1 w-full h-full z-[5] ${isDragging ? "cursor-grabbing" : interactionMode.startsWith("select_intersection") ? "cursor-copy" : useStore.getState().mdtEditMode === "add_point" ? "cursor-crosshair" : useStore.getState().mdtEditMode === "remove_point" ? "cursor-crosshair" : useStore.getState().mdtEditMode === "cut" ? "cursor-crosshair" : "cursor-crosshair"}`}
      >
        <defs>
          <pattern
            id="grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(255,255,255,0.01)"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        {/* Render Base Alignments Core line securely in math system */}
        <g transform={`translate(${transform.dx}, ${transform.dy}) scale(${transform.scale}, ${-transform.scale})`}>
        {alignmentPaths.map((ap, i) => {
          if (!isVisibleInBases(bases, "alignments", ap.id)) return null;
          const alignObj = alignments.find(a => a.id === ap.id);
          /* Alinhamento de nariz: quem o desenha é o próprio nariz (cap laranja
           * + bordo preto), lá embaixo. Desenhar aqui dobraria o traço. */
          if ((alignObj as any)?.isNoseAlignment) return null;
          const layer = layers.find(l => l.id === (alignObj?.layerId || "layer-eixo"));
          if (layer && !layer.isVisible) return null;
          return (
          <g key={ap.id || i}>
            {/* Background transparent hit area moved to the end of corridors to prioritize clicks */}
            {/* Visible line per segment */}
            {alignmentSegments.filter(seg => seg.alignmentId === ap.id).length > 0 ? (
              alignmentSegments.filter(seg => seg.alignmentId === ap.id).map((seg, segIdx) => {
                const a = alignments.find(al => al.id === ap.id);
                if (!a) return null;
                
                const baseLayer = layers.find(l => l.id === (a.layerId || "layer-eixo"));
                const baseColor = a.color || baseLayer?.color || "#cbd5e1";
                
                const styles = a.styles || {};
                let style;
                if (seg.type === "Curve") style = styles.curves;
                else if (seg.type === "Spiral") style = styles.spirals;
                else style = styles.tangents;
                
                if (style?.visible === false) return null;

                const layer = style?.layerId ? layers.find(l => l.id === style.layerId) : baseLayer;
                const color = style?.color || layer?.color || baseColor;
                const lineType = style?.lineType || "solid";

                let strokeWidthStr = "1.5";
                if (ap.id === activeAlignmentId) strokeWidthStr = "4";
                else if (hoveredTargetId?.includes(ap.id || "")) strokeWidthStr = "5";
                else if (targetAlignIds.has(ap.id || "")) strokeWidthStr = "3";
                else if (interactionMode === "join_alignments" && (modifyState?.firstId === ap.id || modifyState?.secondId === ap.id)) strokeWidthStr = "4";
                else if ((interactionMode === "modify_trim" || interactionMode === "modify_extend") && modifyState?.firstId === ap.id) strokeWidthStr = "4";

                const w = parseFloat(strokeWidthStr);
                let dashArray = "";
                if (lineType === "dashed") dashArray = `${w * 4} ${w * 4}`;
                else if (lineType === "dotted") dashArray = `${w} ${w * 2}`;
                else if (lineType === "dashdot") dashArray = `${w * 4} ${w * 2} ${w} ${w * 2}`;

                let finalStroke = color;
                if (ap.id === activeAlignmentId && !style?.color) finalStroke = "#3b82f6"; // highlight color if no specific style
                if (hoveredTargetId?.includes(ap.id || "")) finalStroke = "#ef4444";
                if (targetAlignIds.has(ap.id || "")) finalStroke = "#f59e0b";
                if (interactionMode === "join_alignments" && modifyState?.firstId === ap.id) finalStroke = "#a855f7";
                if (interactionMode === "join_alignments" && modifyState?.secondId === ap.id) finalStroke = "#ec4899";
                if ((interactionMode === "modify_trim" || interactionMode === "modify_extend") && modifyState?.firstId === ap.id) finalStroke = "#a855f7";

                return (
                  <path
                    key={`seg-${ap.id}-${segIdx}`}
                    d={seg.path}
                    fill="none"
                    stroke={finalStroke}
                    strokeWidth={strokeWidthStr}
                    strokeDasharray={dashArray}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })
            ) : (
              <path
                key={`fallback-${ap.id}`}
                d={ap.path}
                fill="none"
                stroke={ap.id === activeAlignmentId ? "#3b82f6" : (alignObj?.color || "#cbd5e1")}
                strokeWidth={ap.id === activeAlignmentId ? "4" : "1.5"}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* Active Highlight Glow */}
            {(ap.id === activeAlignmentId ||
              targetAlignIds.has(ap.id || "") ||
              hoveredTargetId?.includes(ap.id || "") ||
              ((interactionMode === "select_intersection_target_main" ||
                interactionMode === "select_intersection_target_branch") &&
                (ap.id ===
                  useStore
                    .getState()
                    .intersections.find(
                      (i) =>
                        i.id ===
                        (editingIntersectionId || selectedIntersectionId),
                    )?.mainTargetId ||
                  ap.id ===
                    useStore
                      .getState()
                      .intersections.find(
                        (i) =>
                          i.id ===
                          (editingIntersectionId || selectedIntersectionId),
                      )?.branchTargetId ||
                  ap.id ===
                    useStore
                      .getState()
                      .intersections.find(
                        (i) =>
                          i.id ===
                          (editingIntersectionId || selectedIntersectionId),
                      )?.mainAlignmentId ||
                  ap.id ===
                    useStore
                      .getState()
                      .intersections.find(
                        (i) =>
                          i.id ===
                          (editingIntersectionId || selectedIntersectionId),
                      )?.branchAlignmentId))) && (
              <path
                d={ap.path}
                fill="none"
                stroke={hoveredTargetId?.includes(ap.id || "") ? "#ef4444" : ap.id === activeAlignmentId ? "#3b82f6" : "#f59e0b"}
                strokeWidth="10"
                opacity="0.4"
                vectorEffect="non-scaling-stroke"
                className="pointer-events-none"
              />
            )}
            {/* Direction Arrows */}
            <path
              d={ap.path}
              fill="none"
              stroke="#64748b"
              strokeWidth="10"
              strokeDasharray="2 40"
              opacity="0.3"
              vectorEffect="non-scaling-stroke"
            />
            {/* Arrow caps overlay */}
            <path
              d={ap.path}
              fill="none"
              stroke={ap.id === activeAlignmentId ? "#93c5fd" : "#cbd5e1"}
              strokeWidth="2"
              strokeDasharray="1 41"
              opacity="0.8"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );})}


        {/* Render filled corridors representing links */}
        {useMemo(() => {
          if (activeTab === "horizontal") {
            return null;
          }
          return (
            <>
              {ribbonPaths.map((ribbon, i) => {
                const ribBaseline = corridors.find((c) => c.id === ribbon.corridorId)?.alignmentId;
                if (ribBaseline && baselineVisibility?.[ribBaseline] === false) return null;
                if (ribbon.corridorId && corridorVisibility?.[ribbon.corridorId] === false) return null;
                if (ribbon.corridorId && !isVisibleInBases(bases, "corridors", ribbon.corridorId)) return null;
                const corridorName = corridors.find(
                  (c) => c.id === ribbon.corridorId,
                )?.name;
                const isSelectedRegion =
                  ribbon.regionId && ribbon.regionId === selectedRegionId;
                const isSelectedCorridor =
                  ribbon.corridorId === selectedCorridorId && !selectedRegionId; // highlight corridor if no region selected

                const cls = classifyRibbon(ribbon, layers, corridorName);
                if (!cls.fill) return null;
                const baseFill = cls.fill;
                const isLane = cls.isLane;
                /* Faixa de tráfego de verdade: superfície do componente PISTA.
                 * As faces verticais do revestimento também são do tipo Pista,
                 * mas em planta têm largura zero sobre o bordo — é de onde
                 * vinham as setas encostadas no bordo. */
                const lane = isLane ? laneSurface(ribbon) : null;

                let fillClass = "";
                let currentFill = baseFill;
                let currentOpacity = 0.5;

                if (isSelectedRegion) {
                  fillClass =
                    "stroke-purple-500 stroke-[1.5px] z-10 relative";
                  currentFill = baseFill;
                  currentOpacity = 0.8;
                } else if (isSelectedCorridor) {
                  fillClass = "stroke-blue-500 stroke-[1.5px] z-10 relative";
                  currentFill = baseFill;
                  currentOpacity = 0.8;
                }

                /* O sentido pertence à FAIXA (corredor::lado::nº), não à
                 * região: definir uma vez vale para a faixa toda e sobrevive à
                 * partição da garganta pelos narizes. */
                const legacyLaneKey = `${ribbon.corridorId}_${ribbon.regionId}_${ribbon.linkId}`;
                const laneKey = lane ? `${ribbon.corridorId}::${lane.side}::${lane.index}` : legacyLaneKey;
                /* A regra de circulação usa o lado FÍSICO; a chave guarda o nome
                   da seção, para o clique do usuário sobreviver. */
                const eixoCorr = lane ? eixoDoCorredor(ribbon.corridorId) : null;
                const ladoFisico = lane
                  ? ladoFisicoDaFita(ribbon.p1World, ribbon.p2World, eixoCorr) || lane.side
                  : null;
                const direction = lane
                  ? laneDirections[legacyLaneKey] && !laneDirections[laneKey]
                    ? laneDirections[legacyLaneKey]
                    : sentidoFaixa(laneDirections as any, ribbon.corridorId, ladoFisico || lane.side, lane.index, flowCtxDoCorredor(ribbon.corridorId))
                  : laneDirections[laneKey] ?? laneDirections[legacyLaneKey];
                const flowColor = direction === "backward" ? "#f43f5e" : "#10b981";
                const laneFlow =
                  lane && interactionMode === "select_lane_direction"
                    ? buildLaneFlow(
                        ribbon.p1World,
                        ribbon.p2World,
                        direction,
                        corridors
                          .find((c) => c.id === ribbon.corridorId)
                          ?.regions.find((r) => r.id === ribbon.regionId)?.startStation ?? 0,
                        (lane.index - 1) * (FLOW_SPACING / 2) + (lane.side === "Esq" ? FLOW_SPACING / 4 : 0),
                        eixoCorr,
                      )
                    : null;

                // If in lane direction mode, highlight lanes differently
                if (interactionMode === "select_lane_direction" && lane) {
                  currentOpacity = 0.8;
                }

                return (
                  <g key={`ribbon-group-${i}`}>
                    <path
                      d={ribbon.path}
                      fill={currentFill}
                      fillOpacity={currentOpacity}
                      stroke={baseFill}
                      strokeWidth="0.5"
                      vectorEffect="non-scaling-stroke"
                      className={`cursor-pointer transition-all ${(interactionMode.startsWith("select_intersection") || interactionMode.startsWith("create_dimension_") || interactionMode === "extend_alignment" || (interactionMode === "select_lane_direction" && !lane)) ? "pointer-events-none" : "pointer-events-auto"} ${fillClass}`}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.button !== 0) return; // Only process left-clicks here
                        if (activeTab === "drawing") return;
                        if (interactionMode === "select_lane_direction") {
                          if (lane) {
                            setLaneDirectionMenu({ x: e.clientX, y: e.clientY, laneKey });
                          }
                          return; // Block other interactions
                        }
                        setSelectedCorridorId(ribbon.corridorId || null);
                        if (ribbon.regionId) setSelectedRegionId(ribbon.regionId);
                        const corr = corridors.find(
                          (c) => c.id === ribbon.corridorId,
                        );
                        if (corr) {
                          useStore.getState().setActiveAlignmentId(corr.alignmentId);
                        }
                        setActiveTab("regions");
                      }}
                      onContextMenu={(e) => {
                      if (interactionMode.startsWith("create_dimension_")) return;
                      e.preventDefault();
                      e.stopPropagation();
                        if (ribbon.corridorId) {
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            type: "corridor",
                            id: ribbon.corridorId,
                            name: corridorName,
                          });
                        }
                      }}
                    />
                    
                    {/* FLUXO: linha de corrente + setas no meio da faixa */}
                    {laneFlow && laneFlow.arrows && (
                      <g className="pointer-events-none">
                        <path
                          d={laneFlow.stream}
                          fill="none"
                          stroke={flowColor}
                          strokeWidth="1"
                          strokeDasharray="7 7"
                          strokeOpacity="0.3"
                          vectorEffect="non-scaling-stroke"
                        />
                        <path d={laneFlow.arrows} fill="rgba(15, 23, 42, 0.35)" transform="translate(0.12, -0.12)" />
                        <path
                          d={laneFlow.arrows}
                          fill={flowColor}
                          stroke="#ffffff"
                          strokeWidth="0.8"
                          vectorEffect="non-scaling-stroke"
                        />
                      </g>
                    )}
                  </g>
                );
              })}

            {/* MOVIMENTO NOS QUADRANTES — desenho do que lib/flowRules deduziu:
                entrada (âmbar) ou saída (azul) do ramo. Não é clicável: corrige-se
                a faixa, ou a mão do corredor, que o origina. */}
            {interactionMode === "select_lane_direction" &&
              fluxoDeduzido.movimentos.map((m: any) => {
                const flow = buildMovementFlow(m.pts, m.inverter);
                if (!flow) return null;
                const cor = rampColor(m.tipo);
                return (
                  <g key={`mov-${m.cid}`} className="pointer-events-none">
                    <title>{`${rampLabel(m.tipo)} DO RAMO — ${m.porque}`}</title>
                    <path
                      d={flow.stream}
                      fill="none"
                      stroke={cor}
                      strokeWidth="1.2"
                      strokeDasharray="4 6"
                      strokeOpacity="0.5"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path d={flow.arrows} fill="rgba(15, 23, 42, 0.35)" transform="translate(0.14, -0.14)" />
                    <path d={flow.arrows} fill={cor} stroke="#ffffff" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
                    <g transform={`translate(${flow.anchor.x} ${flow.anchor.y}) scale(1 -1)`}>
                      <text
                        x={2.2}
                        y={-1.6}
                        fontSize={2.2}
                        fontWeight="bold"
                        className="font-mono"
                        fill={cor}
                        stroke="#ffffff"
                        strokeWidth={0.55}
                        paintOrder="stroke"
                      >
                        {rampLabel(m.tipo)}
                      </text>
                    </g>
                  </g>
                );
              })}

            {/* Selected Corridor Triangulation Wireframes */}
            {wireframeWorldPath && (
              <path
                d={wireframeWorldPath}
                fill="none"
                stroke="#60a5fa"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
                className="pointer-events-none"
                opacity="0.5"
              />
            )}

            {/* Feature Lines (Colored Standard Styling) */}
            {featurePaths.map((feat, i) => {
              const featBaseline = corridors.find((c) => c.id === feat.corridorId)?.alignmentId;
              if (featBaseline && baselineVisibility?.[featBaseline] === false) return null;
              if (feat.corridorId && corridorVisibility?.[feat.corridorId] === false) return null;
              /* Uma linha do corredor pode estar numa base pelo corredor todo ou
               * individualmente; basta uma das duas vias estar ligada. */
              if (
                !isVisibleInBases(bases, "corridorLines", `${feat.corridorId}|${feat.id}`) &&
                !(feat.corridorId && bases?.some((b: any) => (b.members?.corridors || []).includes(feat.corridorId) && b.active !== false))
              ) return null;
              const fs = featureLineStyle(feat.id);
              const strokeColor = fs.stroke;
              const strokeWidth = String(fs.width);
              const dashArray = fs.dash;

              const featD = feat.path;

              return (
                <g key={`feat-g-${i}`}>
                  <path
                    d={featD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="20"
                    vectorEffect="non-scaling-stroke"
                    data-feature-id={feat.id}
                    data-corridor-id={feat.corridorId}
                    className={`${(interactionMode.startsWith("select_intersection") || interactionMode.startsWith("create_dimension_") || interactionMode === "extend_alignment" || interactionMode === "select_lane_direction") ? "pointer-events-none" : "pointer-events-auto"} cursor-context-menu`}
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onContextMenu={(e) => {
                      if (interactionMode.startsWith("create_dimension_")) return;
                      e.preventDefault();
                      e.stopPropagation();

                      const elements = document.elementsFromPoint(
                        e.clientX,
                        e.clientY,
                      );
                      const overlapping: {
                        id: string;
                        corridorId: string;
                        name: string;
                      }[] = [];
                      const seen = new Set<string>();

                      elements.forEach((el) => {
                        const fId = el.getAttribute("data-feature-id");
                        const cId = el.getAttribute("data-corridor-id");
                        if (fId && cId) {
                          const key = `${cId}-${fId}`;
                          if (!seen.has(key)) {
                            seen.add(key);
                            overlapping.push({
                              id: fId,
                              corridorId: cId,
                              name: fId.includes('_') ? fId.replace(/_/g, ' ') : `Feature ${fId}`,
                            });
                          }
                        }
                      });

                      if (overlapping.length > 1) {
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          type: "feature_lines_multiple",
                          id: "",
                          features: overlapping,
                        });
                      } else if (feat.corridorId) {
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          type: "feature_line",
                          id: feat.id,
                          corridorId: feat.corridorId,
                          name: feat.id.includes('_') ? feat.id.replace(/_/g, ' ') : `Feature ${feat.id}`,
                        });
                      }
                    }}
                  />
                  <path
                    key={`feat-${i}`}
                    d={featD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dashArray}
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-none opacity-90"
                  />
                </g>
              );
            })}
            </>
          );
        }, [
          activeTab,
          bases,
          baselineVisibility,
          corridorVisibility,
          ribbonPaths,
          wireframeWorldPath,
          featurePaths,
          corridors,
          selectedRegionId,
          selectedCorridorId,
          layers,
          interactionMode,
          laneDirections,
        ])}

        {/* Top-level hit area for Alignments to intercept clicks over corridors */}
        {alignmentPaths.map((ap, i) => {
  if (!isVisibleInBases(bases, "alignments", ap.id)) return null;
  const alignObj = alignments.find(a => a.id === ap.id);
  const layer = layers.find(l => l.id === (alignObj?.layerId || "layer-eixo"));
  if (layer && !layer.isVisible) return null;
  return (
          <path
            key={`align-hit-${ap.id || i}`}
            d={ap.path}
            fill="none"
            stroke="transparent"
            strokeWidth="12"
            vectorEffect="non-scaling-stroke"
            className={((activeTab === "horizontal" && interactionMode === "none") || interactionMode.startsWith("create_dimension_") || interactionMode === "extend_alignment") ? "pointer-events-none" : "pointer-events-auto cursor-pointer"}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              if (e.button === 1) return; // Let middle click bubble for panning
              e.stopPropagation();
              if (e.button !== 0) return;
              if (activeTab === "drawing") return;
              const targetIntId =
                editingIntersectionId || selectedIntersectionId;
                
              if (interactionMode === "join_alignments") {
                const ms = useStore.getState().modifyState;
                if (!ms || ms.step === 'select1' || !ms.step) {
                   useStore.getState().setModifyState({ step: 'select2', firstId: ap.id, radius: ms?.radius || 0 });
                } else if (ms.step === 'select2' && ms.firstId !== ap.id) {
                   useStore.getState().setModifyState({ step: 'input_radius', firstId: ms.firstId, secondId: ap.id, radius: ms?.radius || 0 });
                }
              } else if (interactionMode === "modify_trim" || interactionMode === "modify_extend") {
                const ms = useStore.getState().modifyState;
                if (!ms || ms.step === 'select1' || !ms.step) {
                   useStore.getState().setModifyState({ step: 'select2', firstId: ap.id });
                } else if (ms.step === 'select2' && ms.firstId !== ap.id) {
                   const align1 = alignments.find(a => a.id === ms.firstId);
                   const align2 = alignments.find(a => a.id === ap.id);
                   
                   if (align1 && align2) {
                     const svg = (e.currentTarget as Element).closest('svg')!;
                     const svgRect = svg.getBoundingClientRect();
                     const worldX = toWorldX(e.clientX - svgRect.left);
                     const worldY = toWorldY(e.clientY - svgRect.top);
                     
                     let bestIntersection: { x: number, y: number, sta2: number, extendEnd?: boolean, extendStart?: boolean, cutDirX?: number, cutDirY?: number } | null = null;
                     let bestDist = Infinity;
                     
                     if (interactionMode === "modify_trim") {
                       for (let i = 0; i < align1.points.length - 1; i++) {
                          for (let j = 0; j < align2.points.length - 1; j++) {
                              const hit = lineIntersection(
                                  align1.points[i].x, align1.points[i].y, align1.points[i+1].x, align1.points[i+1].y,
                                  align2.points[j].x, align2.points[j].y, align2.points[j+1].x, align2.points[j+1].y
                              );
                              const validUa = hit && ((hit.ua >= 0 && hit.ua <= 1) || (i === 0 && hit.ua < 0 && hit.ua > -1000) || (i === align1.points.length - 2 && hit.ua > 1 && hit.ua < 1000));
                              if (hit && validUa && hit.ub >= 0 && hit.ub <= 1) {
                                  const distToClick = Math.hypot(hit.x - worldX, hit.y - worldY);
                                  if (distToClick < bestDist) {
                                      bestDist = distToClick;
                                      const cdx = align1.points[i+1].x - align1.points[i].x;
                                      const cdy = align1.points[i+1].y - align1.points[i].y;
                                      const clen = Math.hypot(cdx, cdy);
                                      bestIntersection = {
                                           x: hit.x,
                                           y: hit.y,
                                           sta2: align2.points[j].sta + hit.ub * (align2.points[j+1].sta - align2.points[j].sta),
                                           cutDirX: clen > 0 ? cdx / clen : 0,
                                           cutDirY: clen > 0 ? cdy / clen : 0
                                       };
                                  }
                              }
                          }
                       }
                     } else if (interactionMode === "modify_extend") {
                       // For extend, we intersect the start tangent and end tangent of align2 with align1
                       const structPIs = align2.keyPoints.filter(p => p.pi).map(p => ({ x: p.x, y: p.y, radius: p.radius || 0 }));
                       if (structPIs.length >= 2) {
                         const startP1 = structPIs[1];
                         const startP0 = structPIs[0];
                         const endPn1 = structPIs[structPIs.length - 2];
                         const endPn = structPIs[structPIs.length - 1];
                         
                         // Determine if we clicked nearer to start or end
                         const distToStart = Math.hypot(startP0.x - worldX, startP0.y - worldY);
                         const distToEnd = Math.hypot(endPn.x - worldX, endPn.y - worldY);
                         const checkStart = distToStart < distToEnd;
                         
                         for (let i = 0; i < align1.points.length - 1; i++) {
                           const validUaCheck = (h: any) => h && ((h.ua >= 0 && h.ua <= 1) || (i === 0 && h.ua < 0 && h.ua > -1000) || (i === align1.points.length - 2 && h.ua > 1 && h.ua < 1000));
                           if (checkStart) {
                             const hitStart = lineIntersection(
                               align1.points[i].x, align1.points[i].y, align1.points[i+1].x, align1.points[i+1].y,
                               startP1.x, startP1.y, startP0.x, startP0.y
                             );
                             if (hitStart && validUaCheck(hitStart) && hitStart.ub >= 1) { // ub >= 1 means extending past P0
                               bestIntersection = { x: hitStart.x, y: hitStart.y, sta2: 0, extendStart: true };
                               break;
                             }
                           } else {
                             const hitEnd = lineIntersection(
                               align1.points[i].x, align1.points[i].y, align1.points[i+1].x, align1.points[i+1].y,
                               endPn1.x, endPn1.y, endPn.x, endPn.y
                             );
                             if (hitEnd && validUaCheck(hitEnd) && hitEnd.ub >= 1) { // ub >= 1 means extending past Pn
                               bestIntersection = { x: hitEnd.x, y: hitEnd.y, sta2: align2.length, extendEnd: true };
                               break;
                             }
                           }
                         }
                       }
                     }
                     
                     if (bestIntersection) {
                       const structPIs = align2.keyPoints.filter(p => p.pi).map(p => ({ x: p.x, y: p.y, radius: p.radius || 0, sta: p.sta }));
                       let newPIs = [];
                                      if (interactionMode === "modify_trim") {
                         let minD = Infinity;
                         let clickSta = 0;
                         for (const pt of align2.points) {
                            const d = Math.hypot(pt.x - worldX, pt.y - worldY);
                            if (d < minD) { minD = d; clickSta = pt.sta; }
                         }
                         
                         const keepStart = clickSta > bestIntersection.sta2; // we clicked on the side to REMOVE
                         
                         let curvePI = null;
                         let activePC = null;
                         let activePT = null;
                         for (const kp of align2.keyPoints) {
                             if (kp.label === "PT" || kp.label === "PCC" || kp.label === "PRC" || (kp.pi && (kp.label === "PF" || kp.label === "FIM"))) {
                                 if (activePC && activePC.sta <= bestIntersection.sta2 + 0.1 && kp.sta >= bestIntersection.sta2 - 0.1) {
                                     curvePI = align2.keyPoints.find(p => p.pi && p.sta >= activePC!.sta && p.sta <= kp.sta + 0.1 && p.radius > 0);
                                     activePT = kp;
                                     break;
                                 }
                             }
                             if (kp.label === "PC" || kp.label === "PCC" || kp.label === "PRC") {
                                 activePC = kp;
                             }
                         }
                         if (curvePI && activePC && activePT) {
                            const piIdx = structPIs.findIndex(p => Math.abs(p.x - curvePI!.x) < 0.1 && Math.abs(p.y - curvePI!.y) < 0.1);
                            if (piIdx !== -1) {
                                const Pcurr = structPIs[piIdx];
                                const R = curvePI.radius;
                                
                                const dx_in = Pcurr.x - activePC.x;
                                const dy_in = Pcurr.y - activePC.y;
                                const len_in = Math.hypot(dx_in, dy_in);
                                
                                const dx_out = activePT.x - Pcurr.x;
                                const dy_out = activePT.y - Pcurr.y;
                                const len_out = Math.hypot(dx_out, dy_out);
                                
                                if (len_in > 0.001 && len_out > 0.001) {
                                    const ux_in = dx_in / len_in;
                                    const uy_in = dy_in / len_in;
                                    const ux_out = dx_out / len_out;
                                    const uy_out = dy_out / len_out;
                                    
                                    const cross = ux_in * uy_out - uy_in * ux_out;
                                    const rotDir = cross > 0 ? 1 : -1;
                                    
                                    const Cx = activePC.x - rotDir * R * uy_in;
                                    const Cy = activePC.y + rotDir * R * ux_in;
                                    
                                    const dx_c = bestIntersection.x - Cx;
                                    const dy_c = bestIntersection.y - Cy;
                                    const dist_c = Math.hypot(dx_c, dy_c);
                                    
                                    if (dist_c > 0.001) {
                                        let rx = dx_c / dist_c;
                                        let ry = dy_c / dist_c;
                                        let T_exact = { x: Cx + R * rx, y: Cy + R * ry };
                                        
                                        if (bestIntersection.cutDirX !== undefined && bestIntersection.cutDirY !== undefined) {
                                            const V = { x: bestIntersection.x - Cx, y: bestIntersection.y - Cy };
                                            const dir = { x: bestIntersection.cutDirX, y: bestIntersection.cutDirY };
                                            const b = 2 * (V.x * dir.x + V.y * dir.y);
                                            const c_val = (V.x * V.x + V.y * V.y) - R * R;
                                            const disc = b * b - 4 * c_val;
                                            if (disc >= 0) {
                                                const t = (-b + Math.sqrt(disc)) / 2;
                                                const t2 = (-b - Math.sqrt(disc)) / 2;
                                                const t_best = Math.abs(t) < Math.abs(t2) ? t : t2;
                                                T_exact = { x: bestIntersection.x + t_best * dir.x, y: bestIntersection.y + t_best * dir.y };
                                                const new_dx = T_exact.x - Cx;
                                                const new_dy = T_exact.y - Cy;
                                                const new_dist = Math.hypot(new_dx, new_dy);
                                                if (new_dist > 0.001) {
                                                    rx = new_dx / new_dist;
                                                    ry = new_dy / new_dist;
                                                }
                                            }
                                        }

                                        if (keepStart && piIdx > 0) {
                                            const denom = rx * ux_in + ry * uy_in;
                                            if (Math.abs(denom) > 0.00001) {
                                                const num = rx * (T_exact.x - activePC.x) + ry * (T_exact.y - activePC.y);
                                                const s = num / denom;
                                                const newPI = { x: activePC.x + s * ux_in, y: activePC.y + s * uy_in };
                                                
                                                newPIs = structPIs.slice(0, piIdx);
                                                newPIs.push({ x: newPI.x, y: newPI.y, radius: R, sta: 0 });
                                                newPIs.push({ x: T_exact.x, y: T_exact.y, radius: 0, sta: 0 });
                                            }
                                        } else if (!keepStart && piIdx < structPIs.length - 1) {
                                            const denom = rx * ux_out + ry * uy_out;
                                            if (Math.abs(denom) > 0.00001) {
                                                const num = rx * (T_exact.x - activePT.x) + ry * (T_exact.y - activePT.y);
                                                const s = num / denom;
                                                const newPI = { x: activePT.x + s * ux_out, y: activePT.y + s * uy_out };
                                                
                                                newPIs = [{ x: T_exact.x, y: T_exact.y, radius: 0, sta: 0 }];
                                                newPIs.push({ x: newPI.x, y: newPI.y, radius: R, sta: 0 });
                                                newPIs.push(...structPIs.slice(piIdx + 1));
                                            }
                                        }
                                    }
                                }
                            }
                         }
                         
                         if (newPIs.length === 0) {
                             if (keepStart) {
                                 newPIs = structPIs.filter(p => p.sta < bestIntersection!.sta2);
                                 newPIs.push({ x: bestIntersection.x, y: bestIntersection.y, radius: 0, sta: bestIntersection.sta2 });
                             } else {
                                 newPIs = [{ x: bestIntersection.x, y: bestIntersection.y, radius: 0, sta: bestIntersection.sta2 }];
                                 newPIs.push(...structPIs.filter(p => p.sta > bestIntersection!.sta2));
                             }
                         }
                       } else if (interactionMode === "modify_extend") {
                         newPIs = [...structPIs];
                         if (bestIntersection.extendStart) {
                           newPIs[0] = { x: bestIntersection.x, y: bestIntersection.y, radius: 0, sta: 0 };
                         } else if (bestIntersection.extendEnd) {
                           newPIs[newPIs.length - 1] = { x: bestIntersection.x, y: bestIntersection.y, radius: 0, sta: bestIntersection.sta2 };
                         }
                       }
                       
                       const finalPIs = newPIs.map(p => ({ x: p.x, y: p.y, radius: p.radius }));
                       if (finalPIs.length >= 2) {
                           const geom = rebuildFromPIs(finalPIs);
                           const newAlign = new Alignment3D(
                               align2.name,
                               geom.length,
                               geom.points,
                               align2.profile,
                               geom.keyPoints,
                               align2.keyProfilePoints
                           );
                           newAlign.id = align2.id;
                           newAlign.layerId = align2.layerId;
                           newAlign.parentId = align2.parentId;
                           newAlign.offsetValue = align2.offsetValue;
                           newAlign.isHidden = align2.isHidden;
                           newAlign.isLocked = align2.isLocked;
                           newAlign.color = align2.color;
                           newAlign.isManuallyEdited = true;
                           newAlign.isProfileHidden = align2.isProfileHidden;
                           newAlign.profileColor = align2.profileColor;
                           newAlign.profileName = align2.profileName;
                           newAlign.superelevationData = align2.superelevationData;
                           
                           const newAlignments = useStore.getState().alignments.map(a => a.id === align2.id ? newAlign : a);
                           useStore.getState().setAlignments(newAlignments);
                       }
                     }
                     useStore.getState().setInteractionMode("none");
                     useStore.getState().setModifyState(null);
                   }
                }
              } else if (
                interactionMode === "select_intersection_target_main" &&
                targetIntId
              ) {
                useStore
                  .getState()
                  .updateIntersection(targetIntId, { mainTargetId: ap.id });
                useStore.getState().setInteractionMode("none");
              } else if (
                interactionMode === "select_intersection_target_branch" &&
                targetIntId
              ) {
                useStore
                  .getState()
                  .updateIntersection(targetIntId, { branchTargetId: ap.id });
                useStore.getState().setInteractionMode("none");
              } else {
                useStore.getState().setActiveAlignmentId(ap.id!);
                if (activeTab !== "horizontal") {
                  setActiveTab("horizontal");
                }
              }
            }}
            onContextMenu={(e) => {
                      if (interactionMode.startsWith("create_dimension_")) return;
                      e.preventDefault();
                      e.stopPropagation();
              if (activeTab === "drawing") return;
              useStore.getState().setActiveAlignmentId(ap.id!);
              const alignName = useStore
                .getState()
                .alignments.find((a) => a.id === ap.id)?.name;
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                type: "alignment",
                id: ap.id!,
                name: alignName,
              });
            }}
          />
        );})}

        {/* Highlight clicked specific element if in alignment menu */}
        {activeTab === "horizontal" &&
          alignmentSegments.map((seg, i) => {
            const isSelected =
              selectedElement &&
              selectedElement.alignmentId === seg.alignmentId &&
              selectedElement.startSta === seg.startSta;

            const segD = seg.path;

            return (
              <g key={`seg-${i}`}>
                {isSelected && (
                  <path
                    d={segD}
                    fill="none"
                    stroke="#f59e0b" // amber-500 highlighting
                    strokeWidth="8"
                    strokeOpacity="0.8"
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-none transition-all duration-300"
                  />
                )}
                {/* Invisible hit area specifically for the segment */}
                <path
                  d={segD}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="24"
                  vectorEffect="non-scaling-stroke"
                  className={interactionMode === "none" ? "pointer-events-auto cursor-pointer" : "pointer-events-none"}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    if (e.button === 1) return;
                    e.stopPropagation();
                    if (e.button !== 0) return;
                    useStore.getState().setActiveAlignmentId(seg.alignmentId);
                    setSelectedElement(seg);
                  }}
                  onContextMenu={(e) => {
                      if (interactionMode.startsWith("create_dimension_")) return;
                      e.preventDefault();
                      e.stopPropagation();
                    useStore.getState().setActiveAlignmentId(seg.alignmentId);
                    const alignName = useStore
                      .getState()
                      .alignments.find((a) => a.id === seg.alignmentId)?.name;
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      type: "alignment",
                      id: seg.alignmentId,
                      name: alignName,
                    });
                  }}
                />
              </g>
            );
          })}

          {/* Geometria 2D extraída (linhas / arcos exatos sobre o bordo resultante) */}
          {drawnGeometries.map((g) => {
            if (g.isVisible === false) return null;
            if (!isVisibleInBases(bases, "geometries", g.id)) return null;
            const gl = layers.find((l) => l.id === g.layerId);
            if (gl && !gl.isVisible) return null;
            const stroke = g.color || gl?.color || "#e11d48";
            return (
              <g key={g.id}>
                {g.segments.map((s, si) => {
                  const dSeg = segmentsToPath([s]);
                  const isSel =
                    selectedGeomSeg?.geomId === g.id && selectedGeomSeg?.segIndex === si;
                  return (
                    <g key={`${g.id}-s-${si}`}>
                      <path
                        d={dSeg}
                        fill="none"
                        stroke={isSel ? "#f59e0b" : stroke}
                        strokeWidth={isSel ? "4" : "2"}
                        vectorEffect="non-scaling-stroke"
                        className="pointer-events-none"
                      />
                      <path
                        d={dSeg}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="14"
                        vectorEffect="non-scaling-stroke"
                        className="pointer-events-auto cursor-pointer"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedGeomSeg({ geomId: g.id, segIndex: si });
                        }}
                      />
                      {s.type === "arc" && (
                        <circle
                          cx={s.p1.x}
                          cy={s.p1.y}
                          r={0.35}
                          fill={stroke}
                          className="pointer-events-none"
                          opacity="0.9"
                        />
                      )}
                      {isSel && s.type === "arc" && s.center && (
                        <g className="pointer-events-none">
                          <path
                            d={`M ${s.center.x} ${s.center.y} L ${s.p1.x} ${s.p1.y} M ${s.center.x} ${s.center.y} L ${s.p2.x} ${s.p2.y}`}
                            stroke="#f59e0b"
                            strokeWidth="1"
                            strokeDasharray="6 4"
                            fill="none"
                            vectorEffect="non-scaling-stroke"
                            opacity="0.8"
                          />
                          <circle cx={s.center.x} cy={s.center.y} r={0.5} fill="#f59e0b" />
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

        </g>
        {alignments.map((alignment) => {
          if (alignment.isHidden) return null;
          if (!isVisibleInBases(bases, "alignments", alignment.id)) return null;
          const layer = layers.find(l => l.id === (alignment.layerId || "layer-eixo"));
          if (layer && !layer.isVisible) return null;
          const isSelected = alignment.id === activeAlignmentId;
          const isChildOrOffset = !!(alignment.parentId || alignment.offsetValue !== undefined || (alignment as any).isNoseAlignment);
          const piPoints = isChildOrOffset ? [] : alignment.keyPoints.filter(p => p.pi === true);
          let piPath = "";
          if (piPoints.length > 1) {
            piPath = "M " + piPoints.map(p => `${toScreenX(p.x)},${toScreenY(p.y)}`).join(" L ");
          }

          return (
            <g key={`kp-${alignment.id}`}>
              {(() => {
                if (!isSelected || isChildOrOffset) return null;
                
                const extStyle = alignment.styles?.extensions || {};
                if (extStyle.visible === false) return null;
                
                if (!piPath) return null;
                
                // Force red color for extension lines by default as requested
                const color = extStyle.color || "red";
                const lineType = extStyle.lineType || "dashed";
                
                const w = 1.5;
                let dashArray = "8 4"; // default
                if (lineType === "solid") dashArray = "";
                else if (lineType === "dashed") dashArray = `${w * 4} ${w * 4}`;
                else if (lineType === "dotted") dashArray = `${w} ${w * 2}`;
                else if (lineType === "dashdot") dashArray = `${w * 4} ${w * 2} ${w} ${w * 2}`;

                return (
                  <path
                    d={piPath}
                    fill="none"
                    stroke={color}
                    strokeWidth={isSelected ? "2" : "1.5"}
                    strokeDasharray={dashArray}
                    pointerEvents="none"
                  />
                );
              })()}
              {alignment.keyPoints.map((pt, i) => {
                if (alignment.visualStartStation !== undefined && pt.sta < alignment.visualStartStation - 0.01) return null;
                if (alignment.visualEndStation !== undefined && pt.sta > alignment.visualEndStation + 0.01) return null;
                
                /* Alinhamento de nariz: não mostra ponto notável nenhum. A geometria
                   dele é a do nariz e edita-se na Modelagem de Narizes — PP/PT/PCL
                   aqui só sujavam a ilha e davam alça a operações que não se aplicam. */
                if ((alignment as any).isNoseAlignment) return null;
                if (pt.label === "PI" && !isSelected) return null;
                if (pt.label === "PIV") return null;

                const px = toScreenX(pt.x);
                const py = toScreenY(pt.y);
                // Only render points roughly in visible view
                if (
                  px < -50 ||
                  px > dimensions.w + 50 ||
                  py < -50 ||
                  py > dimensions.h + 50
                )
                  return null;

                const isStructural =
                  pt.pi === true ||
                  pt.label === "PP" ||
                  pt.label === "PC" ||
                  pt.label === "PT" ||
                  pt.label === "PCC" ||
                  pt.label === "PRC" ||
                  pt.label === "EC" ||
                  pt.label === "CE" ||
                  pt.label === "PF" ||
                  pt.label === "PI" ||
                  pt.label === "POB" ||
                  pt.label === "POE" ||
                  (pt.label && pt.label.startsWith("PI-"));

                const isDraggable = isStructural && !alignment.isSectionLine;

                return (
                  <g
                    key={`pi-${i}`}
                    transform={`translate(${px}, ${py})`}
                    className={`${(interactionMode === "modify_trim" || interactionMode === "modify_extend" || interactionMode === "join_alignments" || interactionMode.startsWith("create_dimension_")) ? "pointer-events-none" : "pointer-events-auto"} ${isDraggable ? ((interactionMode === "create_curve" || interactionMode === "create_spiral") ? "cursor-crosshair" : interactionMode === "delete_curve" ? "cursor-alias" : interactionMode === "delete_pi" ? "cursor-not-allowed" : "cursor-move") : "cursor-default"}`}
                    onClick={(e) => {
                      if (isStructural) e.stopPropagation();
                    }}
                    onPointerDown={(e) => {
                      if (!isDraggable) return;
                      e.stopPropagation();
                      if (interactionMode === "join_alignments") {
                        const ms = useStore.getState().modifyState;
                        if (!ms || ms.step === 'select1' || !ms.step) {
                           useStore.getState().setModifyState({ step: 'select2', firstId: alignment.id, radius: ms?.radius || 0 });
                        } else if (ms.step === 'select2' && ms.firstId !== alignment.id) {
                           useStore.getState().setModifyState({ step: 'input_radius', firstId: ms.firstId, secondId: alignment.id, radius: ms?.radius || 0 });
                        }
                        return;
                      }
                      
                      const targetIntId = editingIntersectionId || selectedIntersectionId;
                      if (interactionMode === "select_intersection_target_main" && targetIntId) {
                         useStore.getState().updateIntersection(targetIntId, { mainTargetId: alignment.id });
                         useStore.getState().setInteractionMode("none");
                         return;
                      } else if (interactionMode === "select_intersection_target_branch" && targetIntId) {
                         useStore.getState().updateIntersection(targetIntId, { branchTargetId: alignment.id });
                         useStore.getState().setInteractionMode("none");
                         return;
                      }

                      useStore.getState().setActiveAlignmentId(alignment.id);

                      if (interactionMode === "create_curve") {
                        let actualPiIndex = i;
                        if (!pt.pi) {
                           let minD = Infinity;
                           let bestIndex = -1;
                           for (let k = 0; k < alignment.keyPoints.length; k++) {
                               if (alignment.keyPoints[k].pi) {
                                  const d = Math.abs(alignment.keyPoints[k].sta - pt.sta);
                                  if (d < minD) {
                                      minD = d;
                                      bestIndex = k;
                                  }
                               }
                           }
                           if (bestIndex !== -1) actualPiIndex = bestIndex;
                        }
                        setPendingCurve({
                          piIndex: actualPiIndex !== -1 ? actualPiIndex : i,
                          currentRadius: alignment.keyPoints[actualPiIndex !== -1 ? actualPiIndex : i]?.radius || pt.radius || 100,
                        });
                        useStore.getState().setInteractionMode("none");
                        return;
                      } else if (interactionMode === "create_spiral") {
                        let actualPiIndex = i;
                        if (!pt.pi) {
                           let minD = Infinity;
                           let bestIndex = -1;
                           for (let k = 0; k < alignment.keyPoints.length; k++) {
                               if (alignment.keyPoints[k].pi) {
                                  const d = Math.abs(alignment.keyPoints[k].sta - pt.sta);
                                  if (d < minD) {
                                      minD = d;
                                      bestIndex = k;
                                  }
                               }
                           }
                           if (bestIndex !== -1) actualPiIndex = bestIndex;
                        }
                        setPendingSpiral({
                          piIndex: actualPiIndex !== -1 ? actualPiIndex : i,
                          currentSpiralIn: alignment.keyPoints[actualPiIndex !== -1 ? actualPiIndex : i]?.spiralIn || pt.spiralIn || 0,
                          currentSpiralOut: alignment.keyPoints[actualPiIndex !== -1 ? actualPiIndex : i]?.spiralOut || pt.spiralOut || 0,
                        });
                        useStore.getState().setInteractionMode("none");
                        return;
                      } else if (interactionMode === "delete_curve") {
                        let actualPiIndex = i;
                        if (!pt.pi) {
                           let minD = Infinity;
                           let bestIndex = -1;
                           for (let k = 0; k < alignment.keyPoints.length; k++) {
                               if (alignment.keyPoints[k].pi) {
                                  const d = Math.abs(alignment.keyPoints[k].sta - pt.sta);
                                  if (d < minD) {
                                      minD = d;
                                      bestIndex = k;
                                  }
                               }
                           }
                           if (bestIndex !== -1) actualPiIndex = bestIndex;
                        }
                        useStore.getState().updateActiveAlignmentPIRadius(actualPiIndex !== -1 ? actualPiIndex : i, undefined);
                        useStore.getState().setInteractionMode("none");
                        return;
                      } else if (interactionMode === "delete_pi") {
                        useStore.getState().removeActiveAlignmentPI(i);
                        useStore.getState().setInteractionMode("none");
                        return;
                      }

                      setDraggedPI({ alignmentId: alignment.id, index: i, id: pt.id, originalX: pt.x, originalY: pt.y, pointerStartX: e.clientX, pointerStartY: e.clientY, hasMoved: false });
                    }}
                  >
                    {/* Invisible larger hit area for dragging */}
                    <circle r="12" fill="transparent" />

                    <circle
                      r={isStructural ? "5" : "3"}
                      fill={pt.label === "PI" ? "transparent" : (isStructural ? "#3b82f6" : "#64748b")}
                      stroke={pt.label === "PI" ? "red" : "#64748b"}
                      strokeWidth={isStructural ? "2" : "1"}
                      className="shadow-sm"
                    />
                    <text
                      x="10"
                      y="4"
                      fill={pt.label === "PI" ? "red" : "#93c5fd"}
                      fontSize="14"
                      className="font-mono drop-shadow-md font-bold"
                      style={{ textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}
                    >
                      {(() => {
                        let l = pt.label || "PI";
                        if (i === 0 && l !== "PP" && !l.startsWith("INÍCIO")) return `INÍCIO - ${l}`;
                        if (i === alignment.keyPoints.length - 1 && l !== "PF" && !l.startsWith("FINAL")) return `FINAL - ${l}`;
                        return l;
                      })()}
                    </text>
                    <text
                      x="10"
                      y="18"
                      fill="#cbd5e1"
                      fontSize="12"
                      className="font-mono drop-shadow-md"
                      style={{ textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}
                    >
                      {pt.sta.toFixed(2)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Render Potential Intersections (Snapped but not created) */}
        {(() => {
          const potentialInts: {
            x: number;
            y: number;
            mainId: string;
            branchId: string;
            branchPtIdx: number;
            mainSta: number;
            branchSta: number;
          }[] = [];
          for (const bAlign of alignments) {
            if (
              bAlign.id.startsWith("align-int-") ||
              bAlign.id.startsWith("feat-") ||
              isNoseAlignmentId(bAlign.id) ||
              (bAlign as any).isNoseAlignment
            )
              continue;
            for (let ptIdx = 0; ptIdx < bAlign.keyPoints.length; ptIdx++) {
              const pt = bAlign.keyPoints[ptIdx];
              if (ptIdx !== 0 && ptIdx !== bAlign.keyPoints.length - 1)
                continue; // Usually intersections happen at ends

              for (const mAlign of alignments) {
                if (bAlign.id === mAlign.id) continue;
                if (
                  mAlign.id.startsWith("align-int-") ||
                  mAlign.id.startsWith("feat-") ||
                  isNoseAlignmentId(mAlign.id) ||
                  (mAlign as any).isNoseAlignment
                )
                  continue;

                // Check if pt is exactly on mAlign
                const res = mAlign.getNearestStationAndDistance(pt.x, pt.y);
                if (res.dist < 0.1) {
                  // Check if already created
                  const existing = intersections.find(
                    (i) =>
                      (i.branchAlignmentId === bAlign.id &&
                        i.mainAlignmentId === mAlign.id) ||
                      (i.branchAlignmentId === mAlign.id &&
                        i.mainAlignmentId === bAlign.id),
                  );
                  if (!existing) {
                    potentialInts.push({
                      x: pt.x,
                      y: pt.y,
                      mainId: mAlign.id,
                      branchId: bAlign.id,
                      branchPtIdx: ptIdx,
                      mainSta: res.sta,
                      branchSta: pt.sta,
                    });
                  }
                }
              }
            }
          }

          return potentialInts.map((pi, i) => (
            <g
              key={`pot-int-${i}`}
              className="cursor-pointer pointer-events-auto"
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                setPendingIntersection({
                  x: pi.x,
                  y: pi.y,
                  mainId: pi.mainId,
                  branchId: pi.branchId,
                  mainSta: pi.mainSta,
                  branchSta: pi.branchSta,
                });
              }}
            >
              <circle
                cx={toScreenX(pi.x)}
                cy={toScreenY(pi.y)}
                r={10}
                fill="#64748b"
                opacity={0.6}
              />
              <circle
                cx={toScreenX(pi.x)}
                cy={toScreenY(pi.y)}
                r={12}
                fill="none"
                stroke="#94a3b8"
                strokeDasharray="3 3"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="12"
                  to="0"
                  dur="1s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          ));
        })()}

        {/* Render Points 3D */}
        {useStore.getState().points3D.filter((pt) => isVisibleInBases(bases, "points3D", pt.id)).map((pt) => {
          const px = toScreenX(pt.x);
          const py = toScreenY(pt.y);
          const ptColor = pt.color || "#10b981";
          const selecionado = selecaoDesenho.some((x) => x.tipo === "ponto" && x.id === pt.id);
          return (
            <g
              key={pt.id}
              transform={`translate(${px},${py})`}
              className="pointer-events-auto cursor-pointer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                useStore.getState().alternarSelecaoDesenho({ tipo: "ponto", id: pt.id }, e.ctrlKey || e.metaKey || e.shiftKey);
              }}
            >
              {selecionado && <circle r="11" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="3 2" />}
              <circle r="4" fill={ptColor} />
              <circle r="8" fill="transparent" stroke={ptColor} strokeWidth="1" opacity="0.5" />
              <text x="6" y="-6" fill={ptColor} fontSize="10" className="font-mono">
                {pt.description || pt.id.substring(0, 8)}
              </text>
            </g>
          );
        })}

        {/* Render Lines 3D */}
        {useStore.getState().lines3D.filter((l) => isVisibleInBases(bases, "lines3D", l.id)).map((line) => {
          const x1 = toScreenX(line.p1.x);
          const y1 = toScreenY(line.p1.y);
          const x2 = toScreenX(line.p2.x);
          const y2 = toScreenY(line.p2.y);
          const isSelectedCuttingLine = (interactionMode === "modify_trim" || interactionMode === "modify_extend") && modifyState?.firstId === line.id;
          const lineColor = isSelectedCuttingLine ? "#a855f7" : (line.color || "#eab308");
          const lineWidth = isSelectedCuttingLine ? 4 : 2;
          const selecionada = selecaoDesenho.some((x) => x.tipo === "linha" && x.id === line.id);
          return (
            <g
              key={line.id}
              className="pointer-events-auto cursor-pointer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                useStore.getState().alternarSelecaoDesenho({ tipo: "linha", id: line.id }, e.ctrlKey || e.metaKey || e.shiftKey);
              }}
            >
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} />
              {selecionada && (
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3b82f6" strokeWidth={lineWidth + 5} strokeOpacity={0.35} />
              )}
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={lineColor} strokeWidth={lineWidth} />
              <circle cx={x1} cy={y1} r={3} fill={lineColor} />
              <circle cx={x2} cy={y2} r={3} fill={lineColor} />
            </g>
          );
        })}

        {/* Render pending Line 3D */}
        {pendingLine3DStart && crosshairPos && (
          <line
            x1={toScreenX(pendingLine3DStart.x)}
            y1={toScreenY(pendingLine3DStart.y)}
            x2={crosshairPos.x}
            y2={crosshairPos.y}
            stroke="#eab308"
            strokeWidth={2}
            strokeDasharray="4 4"
            opacity={0.7}
          />
        )}

        {/* Render Circles 3D */}
        {useStore.getState().circles3D.filter((c) => isVisibleInBases(bases, "circles3D", c.id)).map((circle) => {
          const cx = toScreenX(circle.center.x);
          const cy = toScreenY(circle.center.y);
          const r = circle.radius * transform.scale;
          const circleColor = circle.color || "#ec4899";
          const selecionado = selecaoDesenho.some((x) => x.tipo === "circulo" && x.id === circle.id);
          return (
            <g
              key={circle.id}
              className="pointer-events-auto cursor-pointer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                useStore.getState().alternarSelecaoDesenho({ tipo: "circulo", id: circle.id }, e.ctrlKey || e.metaKey || e.shiftKey);
              }}
            >
              <circle cx={cx} cy={cy} r={r} stroke="transparent" strokeWidth={12} fill="none" />
              {selecionado && (
                <circle cx={cx} cy={cy} r={r} stroke="#3b82f6" strokeWidth={7} strokeOpacity={0.35} fill="none" />
              )}
              <circle cx={cx} cy={cy} r={r} stroke={circleColor} strokeWidth={2} fill="none" />
              <circle cx={cx} cy={cy} r={3} fill={circleColor} />
            </g>
          );
        })}

        {/* Render Dimensions */}
        {useStore.getState().dimensions && useStore.getState().dimensions.map((dim) => {
          const dimColor = dim.color || "#0ea5e9";
          if (dim.type === "linear" || dim.type === "aligned") {
            const p1 = dim.points[0];
            const p2 = dim.points[1];
            
            let p3 = dim.points[2] || p1;
            let dimP1 = { ...p1 };
            let dimP2 = { ...p2 };
            
            if (dim.type === "aligned") {
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const len = Math.hypot(dx, dy);
              if (len > 0.001) {
                const nx = -dy / len;
                const ny = dx / len;
                const offset = (p3.x - p1.x) * nx + (p3.y - p1.y) * ny;
                dimP1.x += nx * offset; dimP1.y += ny * offset;
                dimP2.x += nx * offset; dimP2.y += ny * offset;
              }
            } else if (dim.type === "linear") {
               const dx = Math.abs(p2.x - p1.x);
               const dy = Math.abs(p2.y - p1.y);
               if (dx > dy) {
                 dimP1.y = p3.y; dimP2.y = p3.y;
               } else {
                 dimP1.x = p3.x; dimP2.x = p3.x;
               }
            }

            let drawP1 = { x: toScreenX(dimP1.x), y: toScreenY(dimP1.y) };
            let drawP2 = { x: toScreenX(dimP2.x), y: toScreenY(dimP2.y) };
            
            const midX = (drawP1.x + drawP2.x) / 2;
            const midY = (drawP1.y + drawP2.y) / 2;
            
            return (
              <g
                key={dim.id}
                className={`cursor-context-menu ${(interactionMode.startsWith("create_dimension_") || interactionMode === "extend_alignment") ? "pointer-events-none" : "pointer-events-auto"} ${selectedElementId === dim.id ? "opacity-50" : ""}`}
                onPointerDown={(e) => { e.stopPropagation(); }}
                onContextMenu={(e) => {
                      if (interactionMode.startsWith("create_dimension_")) return;
                      e.preventDefault();
                      e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    type: "dimension",
                    id: dim.id,
                  });
                }}
              >
                <line x1={drawP1.x} y1={drawP1.y} x2={drawP2.x} y2={drawP2.y} stroke={dimColor} strokeWidth={selectedElementId === dim.id ? 3 : 1} />
                <line x1={toScreenX(p1.x)} y1={toScreenY(p1.y)} x2={drawP1.x} y2={drawP1.y} stroke={dimColor} strokeWidth={1} strokeOpacity={0.5} />
                <line x1={toScreenX(p2.x)} y1={toScreenY(p2.y)} x2={drawP2.x} y2={drawP2.y} stroke={dimColor} strokeWidth={1} strokeOpacity={0.5} />
                <circle cx={drawP1.x} cy={drawP1.y} r={3} fill={dimColor} />
                <circle cx={drawP2.x} cy={drawP2.y} r={3} fill={dimColor} />
                <rect x={midX - 25} y={midY - 10} width={50} height={20} fill="#ffffff" rx={4} stroke={dimColor} strokeWidth={1} />
                <text x={midX} y={midY + 4} fill={dimColor} fontSize={10} textAnchor="middle" className="font-mono">{dim.value.toFixed(2)}</text>
              </g>
            );
          } else if (dim.type === "angular") {
            const v = dim.points[0];
            const p1 = dim.points[1];
            const p2 = dim.points[2];
            
            const vx = toScreenX(v.x);
            const vy = toScreenY(v.y);
            const p1x = toScreenX(p1.x);
            const p1y = toScreenY(p1.y);
            const p2x = toScreenX(p2.x);
            const p2y = toScreenY(p2.y);
            
            // Draw lines
            return (
              <g
                key={dim.id}
                className={`cursor-context-menu ${(interactionMode.startsWith("create_dimension_") || interactionMode === "extend_alignment") ? "pointer-events-none" : "pointer-events-auto"} ${selectedElementId === dim.id ? "opacity-50" : ""}`}
                onPointerDown={(e) => { e.stopPropagation(); }}
                onContextMenu={(e) => {
                      if (interactionMode.startsWith("create_dimension_")) return;
                      e.preventDefault();
                      e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    type: "dimension",
                    id: dim.id,
                  });
                }}
              >
                <line x1={vx} y1={vy} x2={p1x} y2={p1y} stroke={dimColor} strokeWidth={selectedElementId === dim.id ? 3 : 1} strokeDasharray="4 4" />
                <line x1={vx} y1={vy} x2={p2x} y2={p2y} stroke={dimColor} strokeWidth={selectedElementId === dim.id ? 3 : 1} strokeDasharray="4 4" />
                <circle cx={vx} cy={vy} r={3} fill={dimColor} />
                <rect x={vx - 25} y={vy - 25} width={50} height={20} fill="#ffffff" rx={4} stroke={dimColor} strokeWidth={1} />
                <text x={vx} y={vy - 11} fill={dimColor} fontSize={10} textAnchor="middle" className="font-mono">{dim.value.toFixed(1)}°</text>
              </g>
            );
          } else if (dim.type === "radius") {
            const center = dim.points[0];
            const edge = dim.points[1];
            
            const cx = toScreenX(center.x);
            const cy = toScreenY(center.y);
            const ex = toScreenX(edge.x);
            const ey = toScreenY(edge.y);
            
            const midX = (cx + ex) / 2;
            const midY = (cy + ey) / 2;
            
            return (
              <g
                key={dim.id}
                className={`cursor-context-menu ${(interactionMode.startsWith("create_dimension_") || interactionMode === "extend_alignment") ? "pointer-events-none" : "pointer-events-auto"} ${selectedElementId === dim.id ? "opacity-50" : ""}`}
                onPointerDown={(e) => { e.stopPropagation(); }}
                onContextMenu={(e) => {
                      if (interactionMode.startsWith("create_dimension_")) return;
                      e.preventDefault();
                      e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    type: "dimension",
                    id: dim.id,
                  });
                }}
              >
                <line x1={cx} y1={cy} x2={ex} y2={ey} stroke={dimColor} strokeWidth={selectedElementId === dim.id ? 3 : 1} />
                <circle cx={cx} cy={cy} r={3} fill={dimColor} />
                <rect x={midX - 25} y={midY - 10} width={50} height={20} fill="#ffffff" rx={4} stroke={dimColor} strokeWidth={1} />
                <text x={midX} y={midY + 4} fill={dimColor} fontSize={10} textAnchor="middle" className="font-mono">R {dim.value.toFixed(2)}</text>
              </g>
            );
          }
          return null;
        })}

        {/* Render pending Dimension */}
        {interactionMode.startsWith("create_dimension_") && pendingDimensionPoints.map((pt, i) => (
           <circle key={`pend-dim-${i}`} cx={toScreenX(pt.x)} cy={toScreenY(pt.y)} r={4} fill="#0ea5e9" className="animate-pulse" />
        ))}
        {interactionMode.startsWith("create_dimension_") && pendingDimensionPoints.length > 0 && crosshairPos && (() => {
          const pt3 = snapPoint ? { x: snapPoint.x, y: snapPoint.y } : { x: toWorldX(crosshairPos.x), y: toWorldY(crosshairPos.y) };
          if (pendingDimensionPoints.length === 1) {
            return (
              <line
                x1={toScreenX(pendingDimensionPoints[0].x)}
                y1={toScreenY(pendingDimensionPoints[0].y)}
                x2={toScreenX(pt3.x)}
                y2={toScreenY(pt3.y)}
                stroke="#0ea5e9"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            );
          } else if (pendingDimensionPoints.length === 2 && (interactionMode === "create_dimension_linear" || interactionMode === "create_dimension_aligned")) {
            const p1 = pendingDimensionPoints[0];
            const p2 = pendingDimensionPoints[1];
            let dimP1 = { ...p1 };
            let dimP2 = { ...p2 };
            if (interactionMode === "create_dimension_aligned") {
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const len = Math.hypot(dx, dy);
              if (len > 0.001) {
                const nx = -dy / len;
                const ny = dx / len;
                const offset = (pt3.x - p1.x) * nx + (pt3.y - p1.y) * ny;
                dimP1.x += nx * offset; dimP1.y += ny * offset;
                dimP2.x += nx * offset; dimP2.y += ny * offset;
              }
            } else {
               const dx = Math.abs(p2.x - p1.x);
               const dy = Math.abs(p2.y - p1.y);
               if (dx > dy) {
                 dimP1.y = pt3.y; dimP2.y = pt3.y;
               } else {
                 dimP1.x = pt3.x; dimP2.x = pt3.x;
               }
            }
            return (
              <g stroke="#0ea5e9" strokeWidth={1} strokeDasharray="4 4">
                <line x1={toScreenX(p1.x)} y1={toScreenY(p1.y)} x2={toScreenX(dimP1.x)} y2={toScreenY(dimP1.y)} />
                <line x1={toScreenX(p2.x)} y1={toScreenY(p2.y)} x2={toScreenX(dimP2.x)} y2={toScreenY(dimP2.y)} />
                <line x1={toScreenX(dimP1.x)} y1={toScreenY(dimP1.y)} x2={toScreenX(dimP2.x)} y2={toScreenY(dimP2.y)} />
              </g>
            );
          }
          return null;
        })()}

        {/* Render pending Circle 3D */}
        {pendingCircle3DCenter && crosshairPos && (
          <circle
            cx={toScreenX(pendingCircle3DCenter.x)}
            cy={toScreenY(pendingCircle3DCenter.y)}
            r={Math.hypot(crosshairPos.x - toScreenX(pendingCircle3DCenter.x), crosshairPos.y - toScreenY(pendingCircle3DCenter.y))}
            stroke="#ec4899"
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
            opacity={0.7}
          />
        )}

        {/* Render Intersections */}
        {activeTab !== "drawing" && intersections.filter((it) => isVisibleInBases(bases, "intersections", it.id)).map((int, i) => {
          const mainAlign = alignments.find(
            (a) => a.id === int.mainAlignmentId,
          );
          const branchAlign = alignments.find(
            (a) => a.id === int.branchAlignmentId,
          );
          if (!mainAlign || !branchAlign) return null;

          const M = mainAlign.getPointAtStation(int.mainStation);
          const isSelected = int.id === selectedIntersectionId;

          const mainFwdStats = Math.min(
            int.mainStation + 100,
            mainAlign.length,
          );
          const mainBackStats = Math.max(int.mainStation - 100, 0);

          const mainFwdWorld = mainAlign.getPointAtStation(mainFwdStats);
          const mainBackWorld = mainAlign.getPointAtStation(mainBackStats);

          const isStart = int.branchStation < branchAlign.length / 2;
          const branchArmStats = isStart
            ? Math.min(int.branchStation + 100, branchAlign.length)
            : Math.max(int.branchStation - 100, 0);

          const branchArmWorld = branchAlign.getPointAtStation(branchArmStats);

          // Get dynamic parameters
          const mainRes = evaluateAssemblyAtStation(
            int.mainStation,
            assemblies,
            corridors,
            surface,
            alignments,
            int.mainAlignmentId,
          );
          const branchRes = evaluateAssemblyAtStation(
            int.branchStation,
            assemblies,
            corridors,
            surface,
            alignments,
            int.branchAlignmentId,
          );

          // Fetch pavement width (ETW logic)
          const getLaneW = (res: any) => {
            if (!res) return 3.6;
            let w = null;
            if (res.assembly?.etwPointIds?.length > 0) {
              for (const ptId of res.assembly.etwPointIds) {
                if (res.points[ptId]) {
                  const ptW = Math.abs(res.points[ptId].x);
                  if (w === null || ptW > w) w = ptW;
                }
              }
            }
            if (w !== null) return w;
            return Math.abs(res.points["Bordo_Faixa_Dir_1"]?.x || res.points["Bordo_Faixa_Esq_1"]?.x || res.points["P2"]?.x || res.points["P3"]?.x || 3.6);
          };

          const getLaneWFallback = (alignId: string): number | null => {
            for (const c of corridors) {
              if (c.alignmentId === alignId && c.regions.length > 0) {
                const r = c.regions[0];
                const res = evaluateAssemblyAtStation(
                  r.startStation + 0.01,
                  assemblies,
                  corridors,
                  surface,
                  alignments,
                  alignId,
                );
                if (res) return getLaneW(res);
              }
            }
            return null;
          };

          const mainFwdWorldOrig = mainAlign.getPointAtStation(
            int.mainStation + 10,
          );
          const mainBackWorldOrig = mainAlign.getPointAtStation(
            int.mainStation - 10,
          );
          const mDir = {
            x: mainFwdWorldOrig.x - M.x,
            y: mainFwdWorldOrig.y - M.y,
          };
          const mLen = Math.hypot(mDir.x, mDir.y);
          const mainUnitDir = {
            x: mDir.x / (mLen || 1),
            y: mDir.y / (mLen || 1),
          };

          const bNorm = branchAlign.getOrientationAtStation(int.branchStation);
          const branchUnitDir = isStart
            ? { x: bNorm.tx, y: bNorm.ty }
            : { x: -bNorm.tx, y: -bNorm.ty };

          const mainLaneWWorld = mainRes
            ? getLaneW(mainRes)
            : getLaneWFallback(int.mainAlignmentId) || 3.6;
          // Always connect edge-to-edge
          let M_common = { x: M.x, y: M.y };
          const norm = mainAlign.getOrientationAtStation(int.mainStation);
          const dotRight =
            branchUnitDir.x * norm.nx + branchUnitDir.y * norm.ny;
          const isRightSide = int.isRightSide !== undefined ? int.isRightSide : (dotRight >= 0);
          let branchLaneWWorldForOffset = branchRes
            ? getLaneW(branchRes)
            : getLaneWFallback(int.branchAlignmentId) || 3.6;

          let W = isRightSide ? mainLaneWWorld : -mainLaneWWorld;
          if (int.hasAccelDecel) {
            const extraW = Math.max(
              int.accelWidth ?? (int.leftBranchWidth || branchLaneWWorldForOffset),
              int.decelWidth ?? int.accelWidth ?? (int.rightBranchWidth || branchLaneWWorldForOffset)
            );
            W += isRightSide ? extraW : -extraW;
          }

          if (Math.abs(dotRight) > 0.0001) {
            const t = W / dotRight;
            M_common.x = M.x + t * branchUnitDir.x;
            M_common.y = M.y + t * branchUnitDir.y;
          } else {
            M_common.x += norm.nx * W;
            M_common.y += norm.ny * W;
          }
          let mainArmWidthWorld = 0.01;

          const I_screen = {
            x: toScreenX(M_common.x),
            y: toScreenY(M_common.y),
          };

          const mainLaneW = mainArmWidthWorld * transform.scale;
          let branchLaneWWorld = branchRes
            ? getLaneW(branchRes)
            : getLaneWFallback(int.branchAlignmentId) || 3.6;

          const branchLaneW = branchLaneWWorld * transform.scale;
          
          const leftBranchWWorld = branchLaneWWorld;
          const rightBranchWWorld = branchLaneWWorld;
          
          const leftBranchW = leftBranchWWorld * transform.scale;
          const rightBranchW = rightBranchWWorld * transform.scale;

          // In screen coordinates:
          const laneArms = [
            {
              id: "M-Fwd",
              p: {
                x: toScreenX(M_common.x + mainUnitDir.x * 100),
                y: toScreenY(M_common.y + mainUnitDir.y * 100),
              },
              width: mainLaneW,
            },
            {
              id: "M-Back",
              p: {
                x: toScreenX(M_common.x - mainUnitDir.x * 100),
                y: toScreenY(M_common.y - mainUnitDir.y * 100),
              },
              width: mainLaneW,
            },
            {
              id: "B-Arm",
              p: {
                x: toScreenX(M_common.x + branchUnitDir.x * 100),
                y: toScreenY(M_common.y + branchUnitDir.y * 100),
              },
              width: branchLaneW,
              leftWidth: isRightSide ? rightBranchW : leftBranchW,
              rightWidth: isRightSide ? leftBranchW : rightBranchW,
            },
          ];

          const radiusConfig = {
            "M-Back-B-Arm": (int.leftRadius || 20) * transform.scale,
            "B-Arm-M-Back": (int.leftRadius || 20) * transform.scale,
            "M-Fwd-B-Arm": (int.rightRadius || 20) * transform.scale,
            "B-Arm-M-Fwd": (int.rightRadius || 20) * transform.scale,
          };

          
          const laneArmsBase = [
            {
              id: "M-Fwd",
              p: {
                x: toScreenX(M_common.x + mainUnitDir.x * 100),
                y: toScreenY(M_common.y + mainUnitDir.y * 100),
              },
              width: mainLaneW,
            },
            {
              id: "M-Back",
              p: {
                x: toScreenX(M_common.x - mainUnitDir.x * 100),
                y: toScreenY(M_common.y - mainUnitDir.y * 100),
              },
              width: mainLaneW,
            },
            {
              id: "B-Arm",
              p: {
                x: toScreenX(M_common.x + branchUnitDir.x * 100),
                y: toScreenY(M_common.y + branchUnitDir.y * 100),
              },
              width: branchLaneW,
            },
          ];

          const radiusConfigBase = {
            "M-Back-B-Arm": (int.leftRadius || 20) * transform.scale,
            "B-Arm-M-Back": (int.leftRadius || 20) * transform.scale,
            "M-Fwd-B-Arm": (int.rightRadius || 20) * transform.scale,
            "B-Arm-M-Fwd": (int.rightRadius || 20) * transform.scale,
          };
          let intEdgesBase: any[] = [];

          let intPath = "";
          let islandPathScreen = "";
          let intEdges: { id: string; path: string; arcInfo?: any }[] = [];
          let ntPoints: {x: number, y: number}[] = [];
          let narizesNT: { id: string; point: {x: number, y: number}; armA: string; armB: string; raio: number; arredondado: boolean }[] = [];
          let o1: any = null;
          let o2: any = null;
          try {
            const res = buildIntersectionPolygon(
              I_screen,
              laneArms,
              radiusConfig,
            );
            intPath = res.path;
            intEdges = res.edges;
            narizesNT = res.narizesTeoricos || [];
            const resBase = buildIntersectionPolygon(
              I_screen,
              laneArmsBase,
              radiusConfigBase,
            );
            intEdgesBase = resBase.edges;

            /* ALÇA: o quadrante descartado não existe. Mesmo filtro do store — a
             * planta constrói o polígono uma segunda vez, em coordenadas de tela,
             * e sem isto a linha preta do gore reaparecia só no desenho. Os NTs
             * daquele lado também saem: o nariz é encontro de dois braços, e um
             * deles deixou de existir. */
            if (int.galho?.topologia === "alca") {
              const morta = (e: any) =>
                arestaDoQuadranteMorto(String(e.id), int.galho?.sentido);
              intEdges = intEdges.filter((e) => !morta(e));
              intEdgesBase = intEdgesBase.filter((e) => !morta(e));
              const vivo = tokenQuadranteVivo(int.galho?.sentido);
              narizesNT = narizesNT.filter(
                (n) =>
                  !(
                    (n.armA === "B-Arm" || n.armB === "B-Arm") &&
                    n.armA !== vivo &&
                    n.armB !== vivo
                  ),
              );
            }

            /* BORDO-COM-BORDO NA PLANTA.
             *
             * Este polígono é uma segunda cópia, em coordenadas de TELA: os
             * braços continuam a ser retas tangentes ao bordo na estaca do
             * cruzamento. Sem esta correção o DESENHO discorda do alinhamento
             * de quadrante que a store já casou — em curva, visivelmente.
             *
             * Os bordos de apoio (main-edge / branch-left / branch-right) e o
             * bordo-alvo extraído do corredor são alinhamentos do projeto:
             * bastou trazê-los para a tela e aplicar a mesma rotina. */
            try {
              const ptsDoAlinhamento = (id?: string | null) => {
                if (!id) return null;
                const a: any = useStore.getState().alignments.find((x: any) => x.id === id);
                const p = a?.points;
                if (!p || p.length < 2) return null;
                return p.map((q: any) => ({ x: toScreenX(q.x), y: toScreenY(q.y) }));
              };
              const bordoMainTela =
                ptsDoAlinhamento(int.mainTargetId) ||
                ptsDoAlinhamento(`align-${int.id}-main-edge`);
              const ramoCandsTela = [
                ptsDoAlinhamento(`align-${int.id}-branch-left`),
                ptsDoAlinhamento(`align-${int.id}-branch-right`),
              ];
              if (bordoMainTela) {
                const casar = (edge: any) => {
                  const mainEhT1 = mainEhT1DoEdge(String(edge?.id || ""));
                  if (mainEhT1 === null || !edge?.arcInfo) return;
                  const Tramo = mainEhT1 ? edge.arcInfo.T2 : edge.arcInfo.T1;
                  const ramoTela = escolherBordoRamo(ramoCandsTela as any, Tramo);
                  if (!ramoTela) return;
                  /* Tolerâncias em PIXELS: a tela está escalada. */
                  casarFilleteComBordos(edge, bordoMainTela as any, ramoTela as any, mainEhT1, {
                    tolTang: 0.25 * transform.scale,
                    maxMigra: 6,
                  });
                };
                intEdges.forEach(casar);
                intEdgesBase.forEach(casar);
              }
            } catch (e) {}

            if (int.hasIsland) {
              const edgeFwd = intEdgesBase.find(e => e.id.includes("M-Fwd") && e.id.includes("B-Arm"));
              const edgeBack = intEdgesBase.find(e => e.id.includes("M-Back") && e.id.includes("B-Arm"));
              
              if (edgeFwd?.arcInfo && edgeBack?.arcInfo) {
                 const getOffsetPoints = (edge: { id: string; arcInfo: any }) => {
                    const arc = edge.arcInfo;
                    const islandLaneW = branchLaneW; // Tangent to branch axis
                    const R_new = arc.R + islandLaneW; 
                    
                    const isBFirst = edge.id.startsWith("B-Arm");
                    const T_main = isBFirst ? arc.T2 : arc.T1;
                    const T_branch = isBFirst ? arc.T1 : arc.T2;
                    
                    const safeR = Math.max(arc.R, 0.001);
                    const d = Math.sqrt(Math.max(0, R_new * R_new - safeR * safeR));
                    
                    const sweep_to_branch = isBFirst ? (arc.sweep === 1 ? 0 : 1) : arc.sweep;
                    
                    const dx_main = T_main.x - arc.center.x;
                    const dy_main = T_main.y - arc.center.y;
                    const t_main_x = sweep_to_branch === 1 ? dy_main : -dy_main;
                    const t_main_y = sweep_to_branch === 1 ? -dx_main : dx_main;
                    const t_main_len = Math.hypot(t_main_x, t_main_y) || 1;
                    const mNorm = { x: t_main_x / t_main_len, y: t_main_y / t_main_len };
                    
                    const P_base = {
                      x: T_main.x - mNorm.x * d,
                      y: T_main.y - mNorm.y * d
                    };

                    const dx_branch = T_branch.x - arc.center.x;
                    const dy_branch = T_branch.y - arc.center.y;
                    const dist_branch = Math.hypot(dx_branch, dy_branch) || 1;
                    const P_branch = {
                      x: arc.center.x + (dx_branch / dist_branch) * R_new,
                      y: arc.center.y + (dy_branch / dist_branch) * R_new
                    };
                    
                    return {
                       R_new,
                       sweep_to_branch: isBFirst ? (arc.sweep === 1 ? 0 : 1) : arc.sweep,
                       P_base,
                       P_branch,
                    };
                 };
                 
                 o1 = getOffsetPoints(edgeFwd as { id: string; arcInfo: any });
                 o2 = getOffsetPoints(edgeBack as { id: string; arcInfo: any });
                 
                 const branchDir_screen = { x: branchUnitDir.x, y: -branchUnitDir.y };
                 const I_to_p = (p: {x: number, y: number}) => (p.x - I_screen.x) * branchDir_screen.x + (p.y - I_screen.y) * branchDir_screen.y;
                 
                 const p1 = I_to_p(o1.P_branch);
                 const p2 = I_to_p(o2.P_branch);
                 // Adiciona um trecho reto na ponta para suavizar o "bico" e garantir que raios diferentes fechem corretamente em esquadro
                 const pMax = Math.max(p1, p2); 
                 
                 const N1 = { x: o1.P_branch.x + branchDir_screen.x * (pMax - p1), y: o1.P_branch.y + branchDir_screen.y * (pMax - p1) };
                 const N2 = { x: o2.P_branch.x + branchDir_screen.x * (pMax - p2), y: o2.P_branch.y + branchDir_screen.y * (pMax - p2) };
                 
                 let intersectionPoint = null;
                 const c1 = (edgeFwd as any).arcInfo.center;
                 const r1 = o1.R_new;
                 const c2 = (edgeBack as any).arcInfo.center;
                 const r2 = o2.R_new;
                 
                 const dx = c2.x - c1.x;
                 const dy = c2.y - c1.y;
                 const d = Math.hypot(dx, dy);
                 
                 if (d > 0 && d <= r1 + r2 && d >= Math.abs(r1 - r2)) {
                   const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
                   const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
                   const cx2 = c1.x + (dx * a) / d;
                   const cy2 = c1.y + (dy * a) / d;
                   
                   const ip1 = { x: cx2 + (h * dy) / d, y: cy2 - (h * dx) / d };
                   const ip2 = { x: cx2 - (h * dy) / d, y: cy2 + (h * dx) / d };
                   
                   const d1 = I_to_p(ip1);
                   const d2 = I_to_p(ip2);
                   intersectionPoint = d1 < d2 ? ip1 : ip2;
                 }
                 
                 const d_b1 = p1;
                 const d_b2 = p2;

                 if (intersectionPoint) {
                    const d_int = I_to_p(intersectionPoint);
                    if (d_int > d_b1 || d_int > d_b2) {
                       ntPoints = [N1, o1.P_base, o2.P_base];
                       islandPathScreen = `M ${o1.P_base.x} ${o1.P_base.y} A ${o1.R_new} ${o1.R_new} 0 0 ${o1.sweep_to_branch} ${o1.P_branch.x} ${o1.P_branch.y} L ${N1.x} ${N1.y} L ${N2.x} ${N2.y} L ${o2.P_branch.x} ${o2.P_branch.y} A ${o2.R_new} ${o2.R_new} 0 0 ${o2.sweep_to_branch === 1 ? 0 : 1} ${o2.P_base.x} ${o2.P_base.y} Z`;
                    } else {
                       ntPoints = [intersectionPoint, o1.P_base, o2.P_base];
                       islandPathScreen = `M ${o1.P_base.x} ${o1.P_base.y} A ${o1.R_new} ${o1.R_new} 0 0 ${o1.sweep_to_branch} ${intersectionPoint.x} ${intersectionPoint.y} A ${o2.R_new} ${o2.R_new} 0 0 ${o2.sweep_to_branch === 1 ? 0 : 1} ${o2.P_base.x} ${o2.P_base.y} Z`;
                    }
                 } else {
                    ntPoints = [N1, o1.P_base, o2.P_base];
                    islandPathScreen = `M ${o1.P_base.x} ${o1.P_base.y} A ${o1.R_new} ${o1.R_new} 0 0 ${o1.sweep_to_branch} ${o1.P_branch.x} ${o1.P_branch.y} L ${N1.x} ${N1.y} L ${N2.x} ${N2.y} L ${o2.P_branch.x} ${o2.P_branch.y} A ${o2.R_new} ${o2.R_new} 0 0 ${o2.sweep_to_branch === 1 ? 0 : 1} ${o2.P_base.x} ${o2.P_base.y} Z`;
                 }
              }
            }
          } catch (e) {}

          return (
            <g key={`int-${i}`}>
              {islandPathScreen && (
                <>
                  <path
                    d={islandPathScreen}
                    fill="none"
                    stroke={(hoveredTargetId?.includes(`align-${int.id}-island-left`) || hoveredTargetId?.includes(`align-${int.id}-island-right`)) ? "#ef4444" : (targetAlignIds.has(`align-${int.id}-island-left`) || targetAlignIds.has(`align-${int.id}-island-right`)) ? "#f59e0b" : "#38bdf8"}
                    strokeWidth={(hoveredTargetId?.includes(`align-${int.id}-island-left`) || hoveredTargetId?.includes(`align-${int.id}-island-right`)) ? "3" : (targetAlignIds.has(`align-${int.id}-island-left`) || targetAlignIds.has(`align-${int.id}-island-right`)) ? "2" : "1.5"}
                    className="pointer-events-none"
                  />
                  <text
                    x={(o1.P_base.x + o1.P_branch.x) / 2}
                    y={(o1.P_base.y + o1.P_branch.y) / 2}
                    fill="#38bdf8"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                    className="pointer-events-none font-mono"
                  >
                    Bordo da Ilha
                  </text>
                  <text
                    x={(o2.P_base.x + o2.P_branch.x) / 2}
                    y={(o2.P_base.y + o2.P_branch.y) / 2}
                    fill="#38bdf8"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                    className="pointer-events-none font-mono"
                  >
                    Bordo da Ilha
                  </text>
                </>
              )}

              {/* Render border lines so they cascade and act as alignments */}
              {intEdges.map((edge) => null)}

              {/* Draw some engineering cross slope ticks along the fillets */}
              {intEdges.map((edge) => {
                return null;
              })}

              <circle
                id={`intersection-circle-${int.id}`}
                cx={I_screen?.x || 0}
                cy={I_screen?.y || 0}
                r={Math.max(5, Math.min(10, 7 * (transform?.scale || 1)))}
                fill={isSelected ? "#22d3ee" : "#cbd5e1"}
                stroke="#0284c7"
                strokeWidth="2.5"
                className={`cursor-grab active:cursor-grabbing hover:fill-sky-400 hover:stroke-sky-600 transition-colors ${(interactionMode.startsWith("create_dimension_") || interactionMode === "extend_alignment") ? "pointer-events-none" : "pointer-events-auto"}`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDraggedIntersection({
                    id: int.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    hasMoved: false,
                  });
                }}
              >
                <title>Arrastar para reposicionar na pista principal ou clicar para abrir Assistente</title>
              </circle>
              {isSelected && (
                <text
                  x={(I_screen?.x || 0) + 10}
                  y={(I_screen?.y || 0) - 10}
                  fill="#f87171"
                  fontSize="10"
                  className="pointer-events-none font-mono"
                >
                  Bordo
                </text>
              )}
              {ntPoints.map((pt, ptIdx) => (
                <g key={`nt-${ptIdx}`} className="group">
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={4}
                    fill="#f43f5e"
                    className="cursor-pointer hover:stroke-white hover:stroke-2 hover:r-5 transition-all"
                  />
                  <text
                    x={pt.x}
                    y={pt.y - 8}
                    fill="#f43f5e"
                    fontSize="12"
                    textAnchor="middle"
                    className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity font-mono font-bold"
                  >
                    NT
                  </text>
                </g>
              ))}
              {/* NT desenhados a partir dos cruzamentos reais (bloco global) */}
            </g>
          );
        })}

        {/* NARIZES TEÓRICOS — cruzamentos reais de bordos de rodovias diferentes */}
        {Object.entries((intersectionNTs || {}) as Record<string, any[]>)
          .flatMap(([intId, lista]) => (lista || []).map((nt: any) => ({ nt, intId })))
          .map(({ nt, intId }: { nt: any; intId: string }, i: number) => {
          const key = narizKey(nt);
          const processado = processedNTGeoms[key];
          if (!processado) return null;
          
          const { par, larguraEfetiva, geom } = processado;
          const ativo = true; // It's already filtered in the useMemo
          
          const sx = toScreenX(nt.x), sy = toScreenY(nt.y);
          const cor = "#dc2626"; // active color

          /* Este nariz TEM um alinhamento de verdade (vinculado, id estável).
           * A linha preta + laranja é o desenho dele — então clicar nela
           * seleciona o alinhamento, e seleção realce a linha. */
          const algNarizId = noseAlignmentId(key);
          const narizSel = activeAlignmentId === algNarizId;
          /* A amarração é outro alinhamento (a tracejada), com nome e parâmetros
             próprios — logo tem seleção própria. */
          const algAmarraId = tieAlignmentId(key);
          const amarraSel = activeAlignmentId === algAmarraId;
          const cadeiaNariz = geom
            ? [geom.cap[0], geom.cap[1], ...geom.bordo.slice(1)]
                .map((p: any) => `${toScreenX(p.x)},${toScreenY(p.y)}`)
                .join(" ")
            : "";

          return (
            <g key={`nt-real-${i}`} className="pointer-events-none" opacity={1}>
              {geom && (
                <>
                  {/* Cunha / Área de canalização (Gore Area) */}
                  {par.tratamento === "zebrado" && (
                    <polygon
                      points={`${toScreenX(nt.x)},${toScreenY(nt.y)} ${toScreenX(geom.cap[0].x)},${toScreenY(geom.cap[0].y)} ${toScreenX(geom.cap[1].x)},${toScreenY(geom.cap[1].y)} ${geom.bordo.map((p: any) => `${toScreenX(p.x)},${toScreenY(p.y)}`).join(" ")}`}
                      fill="#fef08a"
                      fillOpacity={0.25}
                      stroke="#eab308"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  )}
                  {par.tratamento === "canteiro" && (
                    <polygon
                      points={`${toScreenX(nt.x)},${toScreenY(nt.y)} ${toScreenX(geom.cap[0].x)},${toScreenY(geom.cap[0].y)} ${toScreenX(geom.cap[1].x)},${toScreenY(geom.cap[1].y)} ${geom.bordo.map((p: any) => `${toScreenX(p.x)},${toScreenY(p.y)}`).join(" ")}`}
                      fill="#86efac"
                      fillOpacity={0.25}
                      stroke="#22c55e"
                      strokeWidth={1.5}
                    />
                  )}
                  {narizSel && cadeiaNariz && (
                    <polyline
                      points={cadeiaNariz}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={8}
                      strokeOpacity={0.8}
                      strokeLinejoin="round"
                      className="pointer-events-none"
                    />
                  )}
                  {geom.bordo && geom.bordo.length > 1 && (
                    <polyline
                      points={geom.bordo.map((p: any) => `${toScreenX(p.x)},${toScreenY(p.y)}`).join(" ")}
                      fill="none" stroke="#0f172a" strokeWidth={3} strokeLinejoin="round"
                    />
                  )}
                  {/* Segundo bordo físico: nariz de cunha/ilha tem linha preta nos dois ramos. */}
                  {geom.bordoB && geom.bordoB.length > 1 && (
                    <polyline
                      points={geom.bordoB.map((p: any) => `${toScreenX(p.x)},${toScreenY(p.y)}`).join(" ")}
                      fill="none" stroke="#0f172a" strokeWidth={3} strokeLinejoin="round"
                    />
                  )}
                  {/* Bordo verdadeiro no trecho do nariz: o pavimento passou a ir
                      até a linha preta, então este bordo é a linha branca de
                      sinalização — fica visível como referência do corredor. */}
                  {geom.sinal && geom.sinal.length > 1 && (
                    <polyline
                      points={geom.sinal.map((p: any) => `${toScreenX(p.x)},${toScreenY(p.y)}`).join(" ")}
                      fill="none" stroke="#f8fafc" strokeWidth={1.6} strokeDasharray="7 4"
                      strokeLinejoin="round" opacity={0.95}
                    />
                  )}
                  {/* Segunda perna: a ponta de cunha tem bordo consumido nos dois ramos. */}
                  {geom.sinalB && geom.sinalB.length > 1 && (
                    <polyline
                      points={geom.sinalB.map((p: any) => `${toScreenX(p.x)},${toScreenY(p.y)}`).join(" ")}
                      fill="none" stroke="#f8fafc" strokeWidth={1.6} strokeDasharray="7 4"
                      strokeLinejoin="round" opacity={0.95}
                    />
                  )}
                  {/* AMARRAÇÃO — alinhamento próprio (tracejada fina, do meio do
                      cap ao nariz teórico). É dela que o corredor do ramo e o da
                      pista pegam alvo, então tem realce e área de clique como
                      qualquer alinhamento: sem isto não havia como abrir nome e
                      parâmetros dela. */}
                  {geom.amarra && (
                    <>
                      {amarraSel && (
                        <line
                          x1={toScreenX(geom.amarra[0].x)} y1={toScreenY(geom.amarra[0].y)}
                          x2={toScreenX(geom.amarra[1].x)} y2={toScreenY(geom.amarra[1].y)}
                          stroke="#f59e0b" strokeWidth={8} strokeOpacity={0.8}
                          strokeLinecap="round" className="pointer-events-none"
                        />
                      )}
                      <line
                        x1={toScreenX(geom.amarra[0].x)} y1={toScreenY(geom.amarra[0].y)}
                        x2={toScreenX(geom.amarra[1].x)} y2={toScreenY(geom.amarra[1].y)}
                        stroke={amarraSel ? "#3b82f6" : "#94a3b8"}
                        strokeWidth={amarraSel ? 2 : 1.2}
                        strokeDasharray="3 3" strokeLinecap="round"
                      />
                      <line
                        x1={toScreenX(geom.amarra[0].x)} y1={toScreenY(geom.amarra[0].y)}
                        x2={toScreenX(geom.amarra[1].x)} y2={toScreenY(geom.amarra[1].y)}
                        stroke="transparent" strokeWidth={12}
                        className={interactionMode === "none" ? "pointer-events-auto cursor-pointer" : "pointer-events-none"}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          useStore.getState().setActiveAlignmentId(algAmarraId);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          useStore.getState().setActiveAlignmentId(algAmarraId);
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            type: "alignment",
                            id: algAmarraId,
                            name: useStore.getState().alignments.find((a) => a.id === algAmarraId)?.name,
                          });
                        }}
                      />
                    </>
                  )}
                  {par.estiloPonta === "arredondado" ? (
                    <path
                      d={`M ${toScreenX(geom.cap[0].x)} ${toScreenY(geom.cap[0].y)} A ${Math.hypot(toScreenX(geom.cap[1].x) - toScreenX(geom.cap[0].x), toScreenY(geom.cap[1].y) - toScreenY(geom.cap[0].y)) / 2} ${Math.hypot(toScreenX(geom.cap[1].x) - toScreenX(geom.cap[0].x), toScreenY(geom.cap[1].y) - toScreenY(geom.cap[0].y)) / 2} 0 0 1 ${toScreenX(geom.cap[1].x)} ${toScreenY(geom.cap[1].y)}`}
                      fill="none"
                      stroke="#ea580c"
                      strokeWidth={3.5}
                      strokeLinecap="round"
                    />
                  ) : (
                    <line
                      x1={toScreenX(geom.cap[0].x)} y1={toScreenY(geom.cap[0].y)}
                      x2={toScreenX(geom.cap[1].x)} y2={toScreenY(geom.cap[1].y)}
                      stroke="#ea580c" strokeWidth={3.5} strokeLinecap="round"
                    />
                  )}
                  {/* Rótulo NF: mesmo atalho do pontinho do NT — clicar abre a
                      Modelagem de Narizes deste nariz. */}
                  {(() => {
                    const clicavel = interactionMode === "none";
                    /* Área de clique medida do texto (mono 10 px ≈ 6 px/caractere):
                       fixá-la deixava a cauda do rótulo fora do alvo. */
                    const textoNF = `${rotuloNF(nt.id)} · ${larguraEfetiva.toFixed(2)} m`;
                    const larguraNF = textoNF.length * 6 + 8;
                    return (
                      <g
                        className={clicavel ? "nt-chip pointer-events-auto cursor-pointer" : "pointer-events-none"}
                        onClick={clicavel ? (e: any) => {
                          e.stopPropagation();
                          useStore.getState().abrirNarizNaJanela(intId, key);
                        } : undefined}
                      >
                        <title>{`${rotuloNF(nt.id)} — abrir na Modelagem de Narizes`}</title>
                        <circle cx={toScreenX(geom.nf.x)} cy={toScreenY(geom.nf.y)} r={3.5} fill="#ea580c" />
                        <rect
                          x={toScreenX(geom.nf.x) + 6} y={toScreenY(geom.nf.y) + 3}
                          width={larguraNF} height={15} fill="transparent"
                        />
                        <text x={toScreenX(geom.nf.x) + 9} y={toScreenY(geom.nf.y) + 14} fill="#ea580c" fontSize="10"
                          fontWeight="bold" className="font-mono" stroke="#fff" strokeWidth="3" paintOrder="stroke">
                          {textoNF}
                        </text>
                      </g>
                    );
                  })()}
                  {/* Área de clique do ALINHAMENTO do nariz — a linha preta e a
                      laranja são o desenho dele, então é aqui que se seleciona. */}
                  {cadeiaNariz && (
                    <polyline
                      points={cadeiaNariz}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      strokeLinejoin="round"
                      className={interactionMode === "none" ? "pointer-events-auto cursor-pointer" : "pointer-events-none"}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        useStore.getState().setActiveAlignmentId(algNarizId);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        useStore.getState().setActiveAlignmentId(algNarizId);
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          type: "alignment",
                          id: algNarizId,
                          name: useStore.getState().alignments.find((a) => a.id === algNarizId)?.name,
                        });
                      }}
                    />
                  )}
                </>
              )}
              {/* MARCA DO NT — pontinho, não cruzeta com etiqueta: numa garganta
                  com três narizes as etiquetas tapavam a geometria que se está a
                  ver. O nome fica no tooltip; o clique continua a abrir a
                  Modelagem de Narizes. O alvo de rato é maior que o ponto. */}
              {(() => {
                const rotulo = ativo ? rotuloNF(nt.id) : `${rotuloNF(nt.id)}?`;
                const clicavel = interactionMode === "none";
                return (
                  <g className={clicavel ? "nt-chip pointer-events-auto cursor-pointer" : "pointer-events-none"}
                    onClick={clicavel ? (e: any) => {
                      e.stopPropagation();
                      useStore.getState().abrirNarizNaJanela(intId, key);
                    } : undefined}
                  >
                    <title>{`${rotulo} — abrir na Modelagem de Narizes`}</title>
                    <circle cx={sx} cy={sy} r={9} fill="transparent" />
                    <circle
                      cx={sx} cy={sy} r={ativo ? 3.2 : 2.6}
                      fill={ativo ? cor : "#fff"} stroke={cor} strokeWidth={1.2}
                    />
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* Labels for Acceleration / Deceleration Lanes */}
        {activeTab !== "drawing" && intersections.filter((it) => isVisibleInBases(bases, "intersections", it.id)).map((int, i) => {
          if (!int.hasAccelDecel) return null;
          
          const mainAlign = alignments.find(a => a.id === int.mainAlignmentId);
          const branchAlign = alignments.find(a => a.id === int.branchAlignmentId);
          if (!mainAlign || !branchAlign) return null;

          const M = mainAlign.getPointAtStation(int.mainStation);
          const norm = mainAlign.getOrientationAtStation(int.mainStation);
          const bNorm = branchAlign.getOrientationAtStation(int.branchStation);

          const isStart = int.branchStation < branchAlign.length / 2;
          const branchUnitDir = isStart
            ? { x: bNorm.tx, y: bNorm.ty }
            : { x: -bNorm.tx, y: -bNorm.ty };

          const dotRight = branchUnitDir.x * norm.nx + branchUnitDir.y * norm.ny;
          const isRightSide = int.isRightSide !== undefined ? int.isRightSide : (dotRight >= 0);

          /* MESMA conta do store (lib/flowRules): o rótulo tem de nomear a faixa
           * que foi realmente construída. A regra local que existia aqui lia só
           * a chave antiga de laneDirections, caía sempre em "forward" e escrevia
           * "Faixa de Aceleração" no lado onde o store tinha feito a de
           * desaceleração — daí a leitura de que a faixa não fora feita. */
          const papel = papelDosQuadrantesDaInt(
            { alignments, corridors, assemblies, laneDirections },
            int,
          );
          const fwdType = papel.fwd;
          const backType = papel.back;

          const mainFwdWorldOrig = mainAlign.getPointAtStation(int.mainStation + 10);
          const mDir = { x: mainFwdWorldOrig.x - M.x, y: mainFwdWorldOrig.y - M.y };
          const mLen = Math.hypot(mDir.x, mDir.y) || 1;
          const mainUnitDir = { x: mDir.x / mLen, y: mDir.y / mLen };

          // Positions for text labels
          const offsetDist = isRightSide ? 15 : -15;
          const fwdPosWorld = {
            x: M.x + mainUnitDir.x * 40 + norm.nx * offsetDist,
            y: M.y + mainUnitDir.y * 40 + norm.ny * offsetDist,
          };
          const backPosWorld = {
            x: M.x - mainUnitDir.x * 40 + norm.nx * offsetDist,
            y: M.y - mainUnitDir.y * 40 + norm.ny * offsetDist,
          };

          const fwdScreen = { x: toScreenX(fwdPosWorld.x), y: toScreenY(fwdPosWorld.y) };
          const backScreen = { x: toScreenX(backPosWorld.x), y: toScreenY(backPosWorld.y) };

          const fwdText = `Faixa de ${fwdType} / Ramo de ${fwdType === "Desaceleração" ? "Saída" : "Entrada"}`;
          const backText = `Faixa de ${backType} / Ramo de ${backType === "Desaceleração" ? "Saída" : "Entrada"}`;

          // Calculate rotation angle to align with the main road
          const deg = (Math.atan2(-mainUnitDir.y, mainUnitDir.x) * 180) / Math.PI;

          return (
            <g key={`int-labels-${i}`} className="pointer-events-none opacity-80">
              <text
                x={fwdScreen.x}
                y={fwdScreen.y}
                fill="#ec4899"
                fontSize="10"
                fontWeight="bold"
                transform={`rotate(${deg}, ${fwdScreen.x}, ${fwdScreen.y})`}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {fwdText}
              </text>
              <text
                x={backScreen.x}
                y={backScreen.y}
                fill="#ec4899"
                fontSize="10"
                fontWeight="bold"
                transform={`rotate(${deg}, ${backScreen.x}, ${backScreen.y})`}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {backText}
              </text>
            </g>
          );
        })}

        {/* Dynamic Crosshair & Sample Line */}
        {(() => {
          if (!dynamicCursor) return null;

          const activeAlign = alignments.find(
            (a) => a.id === activeAlignmentId,
          );
          if (!activeAlign) return null;

          const ptWorld = activeAlign.getPointAtStation(station);
          const or = activeAlign.getOrientationAtStation(station);

          // Sample line 50m to each side
          const width = 50;
          const slLeftX = ptWorld.x - or.nx * width;
          const slLeftY = ptWorld.y - or.ny * width;
          const slRightX = ptWorld.x + or.nx * width;
          const slRightY = ptWorld.y + or.ny * width;

          const slScreenLeftX = toScreenX(slLeftX);
          const slScreenLeftY = toScreenY(slLeftY);
          const slScreenRightX = toScreenX(slRightX);
          const slScreenRightY = toScreenY(slRightY);

          const cX = toScreenX(ptWorld.x);
          const cY = toScreenY(ptWorld.y);

          const deg =
            (Math.atan2(
              slScreenRightY - slScreenLeftY,
              slScreenRightX - slScreenLeftX,
            ) *
              180) /
            Math.PI;

          return (
            <g className="pointer-events-none transition-transform duration-75">
              <line
                x1={slScreenLeftX}
                y1={slScreenLeftY}
                x2={slScreenRightX}
                y2={slScreenRightY}
                stroke="#ef4444"
                strokeWidth="2.5"
              />
              <text
                x={slScreenRightX + 10}
                y={slScreenRightY}
                fill="#ef4444"
                fontSize="12"
                fontWeight="bold"
                transform={`rotate(${deg}, ${slScreenRightX}, ${slScreenRightY})`}
                dominantBaseline="middle"
              >
                Estaca {station.toFixed(2).replace(".", ",")}
              </text>
              <g transform={`translate(${cX || -100}, ${cY || -100})`}>
                <circle r="4" fill="#ef4444" />
                <circle
                  r="12"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  className="opacity-50"
                />
              </g>
            </g>
          );
        })()}

        {/* Superelevation & Geometry Labels */}
        {transform.scale > 0.5 &&
          alignments.map((align) => {
            if (align.isHidden) return null;
            const layer = layers.find(l => l.id === (align.layerId || "layer-eixo"));
            if (layer && !layer.isVisible) return null;
            if (!align.superelevationData) return null;

            // Geometry point labels (Curves)
            const geometryLabels = align.superelevationData.geometries.map(
              (geom) => {
                // Only skip very short tangents
                if (
                  geom.type === "Tangent" &&
                  Math.abs(geom.endStation - geom.startStation) < 10
                )
                  return null;

                const midSta = (geom.startStation + geom.endStation) / 2;
                const worldPt = align.getPointAtStation(midSta);
                if (
                  worldPt.x < vMinX ||
                  worldPt.x > vMaxX ||
                  worldPt.y < vMinY ||
                  worldPt.y > vMaxY
                )
                  return null;

                const orient = align.getOrientationAtStation(midSta);
                const sx = toScreenX(worldPt.x);
                const sy = toScreenY(worldPt.y);

                // text parallel to alignment
                const tAngle =
                  (Math.atan2(-orient.ty, orient.tx) * 180) / Math.PI;
                let rot = tAngle;
                if (rot > 90 || rot < -90) rot += 180; // keep reading left-to-right

                const color =
                  geom.type === "Tangent"
                    ? "#22c55e"
                    : geom.type === "Curve"
                      ? "#ef4444"
                      : "#eab308";

                return (
                  <g
                    key={`geom-${align.id}-${geom.id}`}
                    transform={`translate(${sx},${sy})`}
                  >
                    <text
                      transform={`rotate(${rot}) translate(0, -10)`}
                      fill={color}
                      fontSize={11}
                      fontWeight="bold"
                      textAnchor="middle"
                      className="pointer-events-none drop-shadow-md"
                    >
                      {geom.name}
                    </text>
                  </g>
                );
              },
            );

            // Group points by station so we can draw the station label on the centerline
            const stations = Array.from(
              new Set(
                align.superelevationData.superPoints.map((sp) => sp.station),
              ),
            ).sort((a, b) => a - b);

            return (
              <g key={`super-group-${align.id}`}>
                {geometryLabels}
                {stations.map((sta) => {
                  if (align.visualStartStation !== undefined && sta < align.visualStartStation - 0.01) return null;
                  if (align.visualEndStation !== undefined && sta > align.visualEndStation + 0.01) return null;
                  
                  const worldPt = align.getPointAtStation(sta);
                  if (
                    worldPt.x < vMinX ||
                    worldPt.x > vMaxX ||
                    worldPt.y < vMinY ||
                    worldPt.y > vMaxY
                  )
                    return null;

                  const orient = align.getOrientationAtStation(sta);
                  const sx = toScreenX(worldPt.x);
                  const sy = toScreenY(worldPt.y);

                  const tAngle =
                    (Math.atan2(-orient.ty, orient.tx) * 180) / Math.PI;
                  const spsAtSta = align.superelevationData!.superPoints.filter(
                    (sp) => sp.station === sta,
                  );

                  return (
                    <g
                      key={`super-${align.id}-${sta}`}
                      transform={`translate(${sx},${sy})`}
                    >
                      <circle r={3} fill="#ef4444" />
                      <text
                        transform={`rotate(${tAngle}) translate(0, 15)`}
                        fill="#94a3b8"
                        fontSize={10}
                        textAnchor="middle"
                        className="pointer-events-none drop-shadow-md"
                      >
                        {Math.floor(sta / 20)}+{(sta % 20).toFixed(2)}m
                      </text>

                      {spsAtSta.map((sp) => {
                        const isLeft = sp.lane.toLowerCase().includes("left");
                        const dirSign = isLeft ? 1 : -1;

                        // Direction of geometric normal (points left relative to forward tangent)
                        // Screen Y is flipped, so sx goes positively, sy goes negatively for normal.
                        const sOrientX = orient.nx;
                        const sOrientY = -orient.ny;

                        // For SVG rotate, we need the angle of the normal vector
                        const nAngle =
                          (Math.atan2(sOrientY * dirSign, sOrientX * dirSign) *
                            180) /
                          Math.PI;
                        const tRot = nAngle > 90 || nAngle < -90 ? 180 : 0;

                        return (
                          <g key={sp.id} transform={`rotate(${nAngle})`}>
                            {/* Arrow line starting slightly away from centerline */}
                            <path
                              d="M 20 0 L 50 0"
                              stroke="#64748b"
                              strokeWidth={2}
                            />
                            {/* Arrow head */}
                            <polygon points="50,0 40,-6 40,6" fill="#ffffff" />
                            {/* Text */}
                            <text
                              transform={`translate(60, 0) rotate(${tRot})`}
                              fill="#ffffff"
                              fontSize={14}
                              fontWeight="bold"
                              dominantBaseline="middle"
                              textAnchor={tRot === 180 ? "end" : "start"}
                              className="pointer-events-none drop-shadow-lg"
                              style={{
                                textShadow: "1px 1px 3px rgba(0,0,0,0.8)",
                              }}
                            >
                              {sp.slope > 0 ? "+" : ""}
                              {sp.slope}%
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </g>
            );
          })}

        {/* Region boundaries drag handles */}
        {!(
          activeTab === "horizontal" && useStore.getState().showAlignmentEditor
        ) &&
          (activeTab === "regions" || activeTab === "horizontal") &&
          selectedCorridorId &&
          (() => {
            const handles: React.ReactNode[] = [];
            corridors.forEach((c) => {
              const align = alignments.find((a) => a.id === c.alignmentId);
              if (!align) return;

              c.regions.forEach((r, rIdx) => {
                const bounds = [
                  { sta: r.startStation, prop: "startStation" as const },
                  { sta: r.endStation, prop: "endStation" as const },
                ];

                bounds.forEach((bound) => {
                  const pt = align.getPointAtStation(bound.sta);
                  const orient = align.getOrientationAtStation(bound.sta);
                  const sx = toScreenX(pt.x);
                  const sy = toScreenY(pt.y);
                  if (isNaN(sx) || isNaN(sy)) return;

                  const width = 15; // 15m to each side, to cover typical corridor widths (30m total)

                  // Offset slightly based on start/end to make it easier to grab when overlapping
                  const offsetSign = bound.prop === "startStation" ? 1 : -1;
                  const offsetX =
                    (orient.tx * 2 * offsetSign) / transform.scale;
                  const offsetY =
                    (orient.ty * 2 * offsetSign) / transform.scale;

                  const p1x = toScreenX(pt.x + orient.nx * width);
                  const p1y = toScreenY(pt.y + orient.ny * width);
                  const p2x = toScreenX(pt.x - orient.nx * width);
                  const p2y = toScreenY(pt.y - orient.ny * width);

                  handles.push(
                    <g
                      key={`reg-bound-${c.id}-${rIdx}-${bound.prop}`}
                      style={{ cursor: "ew-resize" }}
                      transform={`translate(${offsetX}, ${offsetY})`}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDraggedRegionBound({
                          alignmentId: align.id,
                          boundsToUpdate: [
                            {
                              corridorId: c.id,
                              regionIdx: rIdx,
                              prop: bound.prop,
                            },
                          ],
                        });
                      }}
                    >
                      <title>
                        Arrastar limite de região ({bound.sta.toFixed(2)})
                      </title>
                      {/* Hit area - very thick to be easy to grab */}
                      <path
                        d={`M ${p1x} ${p1y} L ${p2x} ${p2y}`}
                        stroke="transparent"
                        strokeWidth={16}
                      />
                      {/* Visual Line - thick solid magenta/red line mimicking user sketch */}
                      <path
                        d={`M ${p1x} ${p1y} L ${p2x} ${p2y}`}
                        stroke="#ef4444"
                        strokeWidth={4}
                      />
                      {/* Center drag dot */}
                      <circle
                        cx={sx}
                        cy={sy}
                        r={5}
                        fill="#ef4444"
                        stroke="#fca5a5"
                        strokeWidth={2}
                      />
                    </g>,
                  );
                });
              });
            });

            return handles;
          })()}
        {tempPIs.length > 0 &&
          typeof crosshairPos.x === "number" &&
          (() => {
            let dStr = "";
            const mode = useStore.getState().mdtEditMode;
            dStr = `M ${tempPIs.map((p) => `${toScreenX(p.x)},${toScreenY(p.y)}`).join(" L ")} L ${snapPoint ? toScreenX(snapPoint.x) : crosshairPos.x},${snapPoint ? toScreenY(snapPoint.y) : crosshairPos.y}${(mode === "cut" || mode === "boundary") ? " Z" : ""}`;

            return (
              <path
                d={dStr}
                fill={mode === "cut" ? "rgba(245, 158, 11, 0.2)" : mode === "boundary" ? "rgba(99, 102, 241, 0.2)" : "none"}
                stroke={
                  mode === "extrapolate"
                    ? "#d97706"
                    : mode === "cut"
                      ? "#f59e0b"
                      : mode === "boundary"
                        ? "#6366f1"
                        : mode === "remove_line"
                          ? "#ef4444"
                          : "#34d399"
                }
                strokeWidth="3"
                strokeDasharray="6 6"
              />
            );
          })()}
        {tempPIs.map((pi, i) => (
          <circle
            key={`tpi-${i}`}
            cx={toScreenX(pi.x) || 0}
            cy={toScreenY(pi.y) || 0}
            r="4"
            fill={
              useStore.getState().mdtEditMode === "extrapolate"
                ? "#d97706"
                : useStore.getState().mdtEditMode === "cut"
                  ? "#f59e0b"
                  : useStore.getState().mdtEditMode === "boundary"
                    ? "#6366f1"
                    : useStore.getState().mdtEditMode === "remove_line"
                      ? "#ef4444"
                      : useStore.getState().mdtEditMode === "add_line"
                        ? "#6366f1"
                        : "#34d399"
            }
          />
        ))}

        {(useStore.getState().mdtEditMode === "cut" ||
          useStore.getState().mdtEditMode === "boundary" ||
          useStore.getState().mdtEditMode === "extrapolate" ||
          useStore.getState().mdtEditMode === "remove_line" ||
          useStore.getState().mdtEditMode === "add_line" ||
          useStore.getState().mdtEditMode === "fill_holes" ||
          useStore.getState().mdtEditMode === "flip_triangle") &&
          typeof crosshairPos.x === "number" && (
            <>
              <path
                d={`M ${crosshairPos.x - 5} ${crosshairPos.y} L ${crosshairPos.x + 5} ${crosshairPos.y} M ${crosshairPos.x} ${crosshairPos.y - 5} L ${crosshairPos.x} ${crosshairPos.y + 5}`}
                stroke={
                  useStore.getState().mdtEditMode === "extrapolate"
                    ? "#d97706"
                    : useStore.getState().mdtEditMode === "boundary"
                      ? "#6366f1"
                      : useStore.getState().mdtEditMode === "remove_line"
                        ? "#ef4444"
                        : useStore.getState().mdtEditMode === "add_line"
                          ? "#6366f1"
                          : useStore.getState().mdtEditMode === "flip_triangle"
                            ? "#14b8a6"
                            : useStore.getState().mdtEditMode === "fill_holes"
                              ? "#6366f1"
                              : "#f59e0b"
                }
                strokeWidth="2"
                className="pointer-events-none"
              />
            </>
          )}

        {useStore.getState().mdtEditMode === "add_point" &&
          typeof crosshairPos.x === "number" && (
            <>
              <circle
                cx={crosshairPos.x}
                cy={crosshairPos.y}
                r={10}
                fill="rgba(16, 185, 129, 0.2)"
                stroke="#10b981"
                strokeWidth="1"
                className="pointer-events-none"
              />
              <path
                d={`M ${crosshairPos.x - 5} ${crosshairPos.y} L ${crosshairPos.x + 5} ${crosshairPos.y} M ${crosshairPos.x} ${crosshairPos.y - 5} L ${crosshairPos.x} ${crosshairPos.y + 5}`}
                stroke="#10b981"
                strokeWidth="2"
                className="pointer-events-none"
              />
              {addPointHoverZ !== null && (
                <g className="pointer-events-none">
                  <rect
                    x={crosshairPos.x + 15}
                    y={crosshairPos.y - 20}
                    width="65"
                    height="24"
                    rx="4"
                    fill="rgba(15,23,42,0.8)"
                    stroke="#10b981"
                    strokeWidth="1"
                  />
                  <text
                    x={crosshairPos.x + 19}
                    y={crosshairPos.y - 4}
                    fill="#a7f3d0"
                    fontSize="11"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    Z: {addPointHoverZ.toFixed(2)}
                  </text>
                </g>
              )}
            </>
          )}

        {useStore.getState().mdtEditMode === "remove_point" &&
          typeof crosshairPos.x === "number" && (
            <>
              <circle
                cx={crosshairPos.x}
                cy={crosshairPos.y}
                r={10}
                fill="rgba(239, 68, 68, 0.2)"
                stroke="#ef4444"
                strokeWidth="1"
                className="pointer-events-none"
              />
              <path
                d={`M ${crosshairPos.x - 5} ${crosshairPos.y} L ${crosshairPos.x + 5} ${crosshairPos.y}`}
                stroke="#ef4444"
                strokeWidth="2"
                className="pointer-events-none"
              />
            </>
          )}

        {/* Extrapolate Hover Info */}
        {useStore.getState().mdtEditMode === "extrapolate" &&
          extrapolateHoverInfo && (
            <path
              d={`M ${toScreenX(extrapolateHoverInfo.x)} ${toScreenY(extrapolateHoverInfo.y)} L ${toScreenX(extrapolateHoverInfo.projX)} ${toScreenY(extrapolateHoverInfo.projY)}`}
              stroke="#fbbf24" // amber-400
              strokeWidth="2"
              strokeDasharray="4 4"
              className="pointer-events-none"
            />
          )}


        {snapPoint && (() => {
          const sx = toScreenX(snapPoint.x);
          const sy = toScreenY(snapPoint.y);
          const size = 6;

          switch (snapPoint.type) {
            case 'midpoint':
              return (
                <polygon
                  points={`${sx},${sy - size} ${sx - size},${sy + size} ${sx + size},${sy + size}`}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                />
              );
            case 'center':
              return (
                <circle
                  cx={sx}
                  cy={sy}
                  r={size}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                />
              );
            case 'intersection':
              return (
                <g stroke="#fbbf24" strokeWidth="2">
                  <line x1={sx - size} y1={sy - size} x2={sx + size} y2={sy + size} />
                  <line x1={sx - size} y1={sy + size} x2={sx + size} y2={sy - size} />
                </g>
              );
            case 'perpendicular':
              return (
                <g stroke="#fbbf24" strokeWidth="2">
                  <line x1={sx - size} y1={sy + size} x2={sx + size} y2={sy + size} />
                  <line x1={sx} y1={sy - size} x2={sx} y2={sy + size} />
                </g>
              );
            case 'nearest':
              return (
                <polygon
                  points={`${sx - size},${sy - size} ${sx + size},${sy - size} ${sx - size},${sy + size} ${sx + size},${sy + size}`}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                />
              );
            case 'endpoint':
            default:
              return (
                <rect
                  x={sx - size}
                  y={sy - size}
                  width={size * 2}
                  height={size * 2}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                />
              );
          }
        })()}
      </svg>

      {/* Context Menu Overlay */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-slate-50 border border-slate-300/50 rounded-md shadow-xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-1 flex flex-col border-b border-slate-300 mb-1">
            <span className="text-[10px] uppercase text-slate-500 font-bold">
              {contextMenu.type === "alignment"
                ? "Alinhamento"
                : contextMenu.type === "corridor"
                  ? "Corredor"
                  : contextMenu.type === "feature_lines_multiple"
                    ? "Múltiplos Alinhamentos de Componentes"
                    : contextMenu.type === "osnap"
                      ? "Snap Options"
                      : "Alinhamento de Componente"}
            </span>
            {contextMenu.type !== "feature_lines_multiple" && contextMenu.type !== "osnap" && (
              <span
                className="text-xs text-slate-700 font-medium truncate max-w-[150px]"
                title={contextMenu.name}
              >
                {contextMenu.name || "Sem nome"}
              </span>
            )}
          </div>

                    {contextMenu.type === "feature_lines_multiple" &&
          contextMenu.features ? (
            <div className="flex flex-col max-h-60 overflow-y-auto custom-scrollbar">
              {(() => {
                const grouped = contextMenu.features.reduce((acc: Record<string, any[]>, f) => {
                  const parts = f.id.split("_");
                  let groupName = "Geral";
                  let featName = f.name;
                  if (parts.length >= 4) {
                    groupName = parts.slice(-3).join(" ");
                    featName = parts.slice(0, -3).join(" ");
                  } else if (f.id === "Origin") {
                    groupName = "Eixo";
                    featName = "Origem";
                  }
                  
                  if (!acc[groupName]) acc[groupName] = [];
                  acc[groupName].push({ ...f, shortName: featName });
                  return acc;
                }, {} as Record<string, any[]>);

                return Object.entries(grouped).map(([groupName, features]) => (
                  <details key={groupName} className="group" open>
                    <summary className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-xs font-semibold flex items-center justify-between cursor-pointer text-slate-500 bg-slate-50/50 uppercase tracking-wider sticky top-0 backdrop-blur-sm z-10 border-y border-slate-100 select-none">
                      {groupName}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-180"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </summary>
                    <div className="flex flex-col">
                      {features.map((f) => (
                        <button
                          key={`${f.corridorId}-${f.id}`}
                          className="w-full text-left pl-6 pr-4 py-2 hover:bg-indigo-50 text-sm flex items-center justify-between gap-2 transition-colors text-slate-700 hover:text-indigo-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            useStore.getState().extractFeatureLine(f.corridorId, f.id);
                            setContextMenu(null);
                          }}
                        >
                          <span className="truncate max-w-[120px] font-medium">{f.shortName}</span>
                          <Crosshair size={14} className="shrink-0 opacity-50" />
                        </button>
                      ))}
                    </div>
                  </details>
                ));
              })()}
            </div>
          ) : contextMenu.type === "feature_line" && contextMenu.corridorId ? (
            <button
              className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm flex items-center gap-2 transition-colors text-slate-800"
              onClick={(e) => {
                e.stopPropagation();
                useStore
                  .getState()
                  .extractFeatureLine(
                    contextMenu.corridorId as string,
                    contextMenu.id,
                  );
                setContextMenu(null);
              }}
            >
              <Crosshair size={14} />
              Extrair Alinhamento de Componente
            </button>
          ) : contextMenu.type === "osnap" ? (
            <div className="flex flex-col py-1">
              {[
                { key: 'endpoint', label: 'Endpoint' },
                { key: 'midpoint', label: 'Midpoint' },
                { key: 'center', label: 'Center' },
                { key: 'intersection', label: 'Intersection' },
                { key: 'perpendicular', label: 'Perpendicular' },
                { key: 'nearest', label: 'Nearest' }
              ].map(opt => (
                <label key={opt.key} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={osnapConfig[opt.key as keyof typeof osnapConfig]}
                    onChange={(e) => setOsnapConfig({ [opt.key]: e.target.checked })}
                    className="rounded border-slate-300 bg-slate-50 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-xs text-slate-700 select-none">{opt.label}</span>
                </label>
              ))}
            </div>
          ) : contextMenu.type === "dimension" ? (
            <>
              <button
                className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm flex items-center gap-2 transition-colors text-slate-800"
                onClick={(e) => {
                  e.stopPropagation();
                  const dim = useStore.getState().dimensions.find(d => d.id === contextMenu.id);
                  if (dim) {
                    const newValue = window.prompt("Digite o novo valor para a dimensão:", dim.value.toString());
                    if (newValue !== null) {
                      const num = parseFloat(newValue);
                      if (!isNaN(num)) {
                        useStore.getState().updateDimension(contextMenu.id, { value: num });
                      }
                    }
                  }
                  setContextMenu(null);
                }}
              >
                <Wrench size={14} />
                Editar
              </button>
              <button
                className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm flex items-center gap-2 transition-colors text-slate-800"
                onClick={(e) => {
                  e.stopPropagation();
                  useStore.getState().setInteractionMode("move_dimension");
                  useStore.getState().setSelectedElementId(contextMenu.id);
                  setContextMenu(null);
                }}
              >
                <MoveDiagonal size={14} />
                Mover
              </button>
              <button
                className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm flex items-center gap-2 transition-colors text-rose-600 hover:text-rose-300"
                onClick={(e) => {
                  e.stopPropagation();
                  useStore.getState().removeDimension(contextMenu.id);
                  setContextMenu(null);
                }}
              >
                <Trash2 size={14} />
                Excluir
              </button>
            </>
          ) : (
            <>
              {contextMenu.type === "corridor" && (
                <button
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm flex items-center gap-2 transition-colors text-slate-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTargetCorridorId(contextMenu.id);
                    setContextMenu(null);
                  }}
                >
                  <Crosshair size={14} />
                  Ver Targets
                </button>
              )}
              {contextMenu.type === "corridor" && interactionMode === "select_lane_direction" && (() => {
                /* MÃO DA VIA — só no modo de sentido: fora dele a opção não tem
                   contexto e só confundiria quem está a mexer em targets ou
                   regiões. Automática = deduzida da seção e da concordância
                   dirigível. */
                const c: any = corridors.find((x) => x.id === contextMenu.id);
                const mao = c?.mao || "auto";
                const sent = c?.maoSentido || "forward";
                const set = (updates: any) => {
                  useStore.getState().updateCorridor(contextMenu.id, updates);
                  setContextMenu(null);
                };
                const item = (label: string, ativo: boolean, onClick: () => void) => (
                  <button
                    key={label}
                    className={`w-full text-left px-4 py-1.5 hover:bg-slate-100 text-[13px] flex items-center gap-2 transition-colors ${ativo ? "text-purple-700 font-semibold" : "text-slate-700"}`}
                    onClick={(e) => { e.stopPropagation(); onClick(); }}
                  >
                    <span className="w-3 text-center">{ativo ? "•" : ""}</span>
                    {label}
                  </button>
                );
                return (
                  <>
                    <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-400 border-t border-slate-200 mt-1">
                      Mão da via
                    </div>
                    {item("Automática (pela geometria)", mao === "auto", () => set({ mao: undefined, maoSentido: undefined }))}
                    {item("Mão dupla", mao === "dupla", () => set({ mao: "dupla", maoSentido: undefined }))}
                    {item("Mão única — a favor do estaqueamento", mao === "unica" && sent === "forward", () => set({ mao: "unica", maoSentido: "forward" }))}
                    {item("Mão única — contra o estaqueamento", mao === "unica" && sent === "backward", () => set({ mao: "unica", maoSentido: "backward" }))}
                    <div className="border-b border-slate-200 my-1" />
                  </>
                );
              })()}
              {contextMenu.type === "alignment" && (
                <button
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm flex items-center gap-2 transition-colors text-slate-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    const align = useStore.getState().alignments.find(a => a.id === contextMenu.id);
                    if (align) {
                      useStore.getState().updateAlignment(contextMenu.id, { isSectionLine: !align.isSectionLine });
                    }
                    setContextMenu(null);
                  }}
                >
                  <Crosshair size={14} />
                  {useStore.getState().alignments.find(a => a.id === contextMenu.id)?.isSectionLine ? "Remover Linha de Corte" : "Transformar em Linha de Corte"}
                </button>
              )}
              {contextMenu.type === "alignment" && (
                <button
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm flex items-center gap-2 transition-colors text-slate-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLayerModalForAlignment(contextMenu.id);
                    setContextMenu(null);
                  }}
                >
                  <Layers size={14} />
                  Alterar Layer
                </button>
              )}
              <button
                className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm flex items-center gap-2 transition-colors text-rose-600 hover:text-rose-300"
                onClick={(e) => {
                  e.stopPropagation();
                  if (contextMenu.type === "alignment") {
                    useStore.getState().removeAlignment(contextMenu.id);
                  } else if (contextMenu.type === "corridor") {
                    useStore.getState().removeCorridor(contextMenu.id);
                  }
                  setContextMenu(null);
                }}
              >
                <Trash2 size={14} />
                Excluir
              </button>
            </>
          )}
        </div>
      )}

      
      {targetCorridorId && (
        <DraggableWindow 
          title={`Targets do Corredor`}
          onClose={() => setTargetCorridorId(null)}
          initialWidth={400}
          initialHeight={300}
          initialX={window.innerWidth / 2 - 200}
          initialY={window.innerHeight / 2 - 150}
        >
          <div className="p-4 flex flex-col gap-4 text-slate-800 text-sm overflow-y-auto h-full pb-10">
            {targetCorridor?.regions.map((region, rIdx) => (
              <div key={region.id} className="border border-slate-200 rounded-md p-3">
                <h4 className="font-semibold mb-2">Região {rIdx + 1} ({region.startStation.toFixed(2)} a {region.endStation.toFixed(2)})</h4>
                {(() => {
                  /* Contagem de alvos órfãos da região — para não ser preciso
                     abrir cada alvo para descobrir que um deles morreu. */
                  const ids: string[] = [];
                  Object.values(region.targets || {}).forEach((v: any) =>
                    String(v).split(",").forEach((t) => ids.push(t.trim())));
                  if (region.islandTargetId) {
                    String(region.islandTargetId).split(",").forEach((t) => ids.push(t.trim()));
                  }
                  const orfaos = ids.filter(
                    (id) => id && !alignments.some((a) => a.id === id),
                  );
                  if (!orfaos.length) return null;
                  return (
                    <div className="mb-2 rounded border border-rose-300 bg-rose-50 px-2 py-1.5">
                      <span className="text-[11px] font-semibold text-rose-700">
                        {orfaos.length} alvo{orfaos.length > 1 ? "s" : ""} órfão{orfaos.length > 1 ? "s" : ""}
                      </span>
                      <span className="block text-[10px] text-rose-600 leading-snug">
                        Apontam para alinhamentos que não existem mais. O corredor os ignora
                        e usa a largura nominal.
                      </span>
                    </div>
                  );
                })()}
                <div className="flex flex-col gap-2">
                  {Object.entries(region.targets || {}).map(([targetName, targetVal]) => (
                    <div 
                      key={targetName} 
                      className="flex flex-col gap-1 border-b border-slate-100 pb-2 cursor-pointer hover:bg-amber-50/50 p-1 rounded"
                      onMouseEnter={() => setHoveredTargetId(targetVal as string)}
                      onMouseLeave={() => setHoveredTargetId(null)}
                    >
                      <span className="text-xs font-medium text-slate-500">{targetName}</span>
                      <div className="flex flex-col mt-1">
                         <div className="flex flex-col gap-1 mb-2">
                           {(targetVal as string).split(',').map((id, idx) => {
                             const cleanId = id.trim();
                             const align = alignments.find(a => a.id === cleanId);
                             /* ALVO ÓRFÃO — aponta para um id que não existe mais.
                                O corredor não encontra o alvo e volta calado à
                                largura nominal; aqui ele para de ficar calado.
                                Linha de feição (feat-…) também é alinhamento de
                                verdade: se não está na lista, morreu igual. */
                             const orfao = !align;
                             let displayName = cleanId;
                             if (align) displayName = align.name || `Alinhamento (${cleanId.substring(0, 6)}...)`;
                             else if (cleanId.startsWith('feat-')) {
                               const parts = cleanId.split('-');
                               if (parts.length >= 3) {
                                 displayName = `Linha de Feição: ${parts.slice(2).join('-')}`;
                               } else {
                                 displayName = `Linha de Feição (${cleanId.substring(0, 8)}...)`;
                               }
                             }
                             
                             return (
                               <div key={idx} className={`flex flex-col rounded px-2 py-1 shadow-sm border ${orfao ? "bg-rose-50 border-rose-300" : "bg-white border-slate-200"}`}>
                                 <span className="text-xs truncate" title={cleanId}>
                                   <span className={`font-bold mr-2 ${orfao ? "text-rose-500" : "text-slate-400"}`}>{idx + 1}.</span>
                                   <span className={orfao ? "text-rose-700" : undefined}>{displayName}</span>
                                 </span>
                                 {orfao && (
                                   <span className="text-[10px] text-rose-600 leading-snug">
                                     ALVO ÓRFÃO — id inexistente. O corredor está ignorando este alvo.
                                   </span>
                                 )}
                               </div>
                             );
                           })}
                         </div>
                         <div className="flex justify-end">
                           <button 
                             className="text-blue-500 text-xs px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 shrink-0"
                             onClick={(e) => {
                               e.stopPropagation();
                               const newVal = window.prompt(`Novo valor para ${targetName} (IDs separados por vírgula):`, targetVal as string);
                               if (newVal !== null) {
                                 const newTargets = { ...region.targets, [targetName]: newVal };
                                 useStore.getState().updateCorridorRegion(targetCorridorId, rIdx, { targets: newTargets });
                               }
                             }}
                           >
                             Editar
                           </button>
                         </div>
                      </div>
                    </div>
                  ))}
                  {region.islandTargetId && (
                    <div 
                      className="flex flex-col gap-1 border-b border-slate-100 pb-2 cursor-pointer hover:bg-amber-50/50 p-1 rounded"
                      onMouseEnter={() => setHoveredTargetId(region.islandTargetId as string)}
                      onMouseLeave={() => setHoveredTargetId(null)}
                    >
                      <span className="text-xs font-medium text-slate-500">Alvo da Ilha / Eixo</span>
                      <div className="flex flex-col mt-1">
                         <div className="flex flex-col gap-1 mb-2">
                           {(region.islandTargetId as string).split(',').map((id, idx) => {
                             const cleanId = id.trim();
                             const align = alignments.find(a => a.id === cleanId);
                             const orfao = !align;
                             let displayName = cleanId;
                             if (align) displayName = align.name || `Alinhamento (${cleanId.substring(0, 6)}...)`;
                             else if (cleanId.startsWith('feat-')) {
                               const parts = cleanId.split('-');
                               if (parts.length >= 3) {
                                 displayName = `Linha de Feição: ${parts.slice(2).join('-')}`;
                               } else {
                                 displayName = `Linha de Feição (${cleanId.substring(0, 8)}...)`;
                               }
                             }
                             
                             return (
                               <div key={idx} className={`flex flex-col rounded px-2 py-1 shadow-sm border ${orfao ? "bg-rose-50 border-rose-300" : "bg-white border-slate-200"}`}>
                                 <span className="text-xs truncate" title={cleanId}>
                                   <span className={`font-bold mr-2 ${orfao ? "text-rose-500" : "text-slate-400"}`}>{idx + 1}.</span>
                                   <span className={orfao ? "text-rose-700" : undefined}>{displayName}</span>
                                 </span>
                                 {orfao && (
                                   <span className="text-[10px] text-rose-600 leading-snug">
                                     ALVO ÓRFÃO — id inexistente. O corredor está ignorando este alvo.
                                   </span>
                                 )}
                               </div>
                             );
                           })}
                         </div>
                         <div className="flex justify-end">
                           <button 
                             className="text-blue-500 text-xs px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 shrink-0"
                             onClick={(e) => {
                               e.stopPropagation();
                               const newVal = window.prompt(`Novo valor para Alvo da Ilha / Eixo (IDs separados por vírgula):`, region.islandTargetId as string);
                               if (newVal !== null) {
                                 useStore.getState().updateCorridorRegion(targetCorridorId, rIdx, { islandTargetId: newVal || undefined });
                               }
                             }}
                           >
                             Editar
                           </button>
                         </div>
                      </div>
                    </div>
                  )}
                  {(!region.targets || Object.keys(region.targets).length === 0) && !region.islandTargetId && (
                    <span className="text-slate-400 text-xs italic">Nenhum target configurado</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DraggableWindow>
      )}

      {interactionMode === "select_lane_direction" && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white backdrop-blur-md border border-slate-700/80 px-4 py-2 rounded-full shadow-2xl z-[150] flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Clique numa faixa para trocar o sentido</span>
          </div>
          <button
            onClick={() => setInteractionMode("none")}
            className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors ml-2"
            title="Sair do modo de sentido de faixas"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {laneDirectionMenu && (
        <div
          className="fixed z-[100] bg-slate-900/95 text-white backdrop-blur-md border border-slate-700/80 rounded-lg shadow-2xl p-2 min-w-[160px]"
          style={{ top: laneDirectionMenu.y, left: laneDirectionMenu.x }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-2 flex items-center justify-between">
            <span>Sentido da Faixa</span>
            <button
              onClick={() => setLaneDirectionMenu(null)}
              className="text-slate-400 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              className="w-full text-left px-2.5 py-1.5 hover:bg-emerald-500/20 rounded text-xs flex items-center gap-2 transition-colors text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/60 font-medium"
              title="Avanço (Estaca Crescente)"
              onClick={(e) => {
                e.stopPropagation();
                setLaneDirection(laneDirectionMenu.laneKey, "forward");
                setLaneDirectionMenu(null);
              }}
            >
              <span className="text-base font-bold">↑</span>
              <span>Avanço (Crescente)</span>
            </button>
            <button
              className="w-full text-left px-2.5 py-1.5 hover:bg-rose-500/20 rounded text-xs flex items-center gap-2 transition-colors text-rose-400 border border-rose-500/30 hover:border-rose-500/60 font-medium"
              title="Reverso (Estaca Decrescente)"
              onClick={(e) => {
                e.stopPropagation();
                setLaneDirection(laneDirectionMenu.laneKey, "backward");
                setLaneDirectionMenu(null);
              }}
            >
              <span className="text-base font-bold">↓</span>
              <span>Reverso (Decrescente)</span>
            </button>
          </div>
        </div>
      )}

      {(interactionMode.startsWith("modify_") || interactionMode === "join_alignments") && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white border border-slate-300/50 p-3 rounded-lg shadow-2xl z-[150] flex flex-col gap-2 pointer-events-auto">
          <div className="text-slate-800 font-medium text-sm flex justify-between items-center gap-4">
            <span>
              {interactionMode === "join_alignments" && (
                modifyState?.step === 'select2' ? "UNIR ALINH.: Selecione o 2º alinhamento (a ser removido)" :
                modifyState?.step === 'input_radius' ? "UNIR ALINH.: Informe o raio (0 = apenas PI)" :
                "UNIR ALINH.: Selecione o 1º alinhamento (o que será mantido)"
              )}
              {interactionMode === "modify_trim" && (
                modifyState?.step === 'select2' ? "TRIM: Selecione a linha para aparar" :
                "TRIM: Selecione a linha de corte"
              )}
              {interactionMode === "modify_extend" && (
                modifyState?.step === 'select2' ? "EXTEND: Selecione a linha para estender" :
                "EXTEND: Selecione a linha limite"
              )}
              {interactionMode === "modify_copy" && (
                modifyState?.step === 'base' ? "COPY: Selecione o ponto base" :
                modifyState?.step === 'dest' ? "COPY: Selecione o ponto de destino" :
                "COPY: Selecione o objeto"
              )}
              {interactionMode === "modify_mirror" && (
                modifyState?.step === 'axis1' ? "MIRROR: Selecione o 1º ponto do eixo" :
                modifyState?.step === 'axis2' ? "MIRROR: Selecione o 2º ponto do eixo" :
                modifyState?.step === 'confirm' ? "MIRROR: Confirmar" :
                "MIRROR: Selecione o objeto"
              )}
              {interactionMode === "modify_fillet" && (
                modifyState?.step === 'select2' ? "FILLET: Selecione a 2ª linha" :
                "FILLET: Selecione a 1ª linha"
              )}
            </span>
            <button onClick={() => { useStore.getState().setInteractionMode("none"); useStore.getState().setModifyState(null); }} className="text-slate-500 hover:text-slate-800">
              <X size={16} />
            </button>
          </div>
          
          {interactionMode === "modify_fillet" && (!modifyState?.step || modifyState?.step === 'select1') && (
             <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-slate-500">Raio:</span>
                <input 
                  type="number" 
                  value={modifyState?.radius || 0} 
                  onChange={e => useStore.getState().setModifyState({ ...modifyState, radius: parseFloat(e.target.value) || 0 })}
                  className="bg-slate-100 border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 w-20"
                  autoFocus
                  onKeyDown={e => {
                     if (e.key === 'Enter') {
                        // The existing behavior expects the user to click the next line instead of pressing enter.
                        // I'll just leave it or blur it.
                        e.currentTarget.blur();
                     }
                  }}
                />
             </div>
          )}

          {interactionMode === "join_alignments" && modifyState?.step === 'input_radius' && (
             <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-slate-500">Raio:</span>
                <input 
                  type="number" 
                  value={modifyState?.radius || 0} 
                  onChange={e => useStore.getState().setModifyState({ ...modifyState, radius: parseFloat(e.target.value) || 0 })}
                  className="bg-slate-100 border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 w-20"
                  autoFocus
                  onKeyDown={e => {
                     if (e.key === 'Enter') {
                        const ms = useStore.getState().modifyState;
                        const alignmentsList = useStore.getState().alignments;
                        const firstAlign = alignmentsList.find(a => a.id === ms.firstId);
                        const secondAlign = alignmentsList.find(a => a.id === ms.secondId);
                        if (firstAlign && secondAlign) {
                           const newAlign = joinAlignmentsWithFillet(firstAlign, secondAlign, ms.radius || 0, firstAlign.name);
                           if (newAlign) {
                              newAlign.id = firstAlign.id; // Keep original ID
                              newAlign.color = firstAlign.color; // Keep color
                              const newAlignments = alignmentsList.filter(a => a.id !== ms.secondId).map(a => a.id === firstAlign.id ? newAlign : a);
                              useStore.getState().setAlignments(newAlignments);
                              useStore.getState().setActiveAlignmentId(newAlign.id);
                           }
                           useStore.getState().setInteractionMode('none');
                           useStore.getState().setModifyState(null);
                        }
                     }
                  }}
                />
                <button
                  onClick={() => {
                     const ms = useStore.getState().modifyState;
                     const alignmentsList = useStore.getState().alignments;
                     const firstAlign = alignmentsList.find(a => a.id === ms.firstId);
                     const secondAlign = alignmentsList.find(a => a.id === ms.secondId);
                     if (firstAlign && secondAlign) {
                        const newAlign = joinAlignmentsWithFillet(firstAlign, secondAlign, ms.radius || 0, firstAlign.name);
                        if (newAlign) {
                           newAlign.id = firstAlign.id; // Keep original ID
                           newAlign.color = firstAlign.color; // Keep color
                           const newAlignments = alignmentsList.filter(a => a.id !== ms.secondId).map(a => a.id === firstAlign.id ? newAlign : a);
                           useStore.getState().setAlignments(newAlignments);
                           useStore.getState().setActiveAlignmentId(newAlign.id);
                        }
                        useStore.getState().setInteractionMode('none');
                        useStore.getState().setModifyState(null);
                     }
                  }}
                  className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-medium"
                >
                  Confirmar
                </button>
             </div>
          )}

          {interactionMode === "modify_mirror" && modifyState?.step === 'confirm' && (
             <div className="flex flex-col gap-2 mt-2">
                <span className="text-xs text-slate-700">Apagar objetos de origem?</span>
                <div className="flex gap-2">
                   <button 
                     className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium"
                     onClick={() => {
                       const state = useStore.getState();
                       const mState = state.modifyState;
                       if (mState && mState.line && mState.p1 && mState.p2) {
                          // Mirror math
                          const { p1: lP1, p2: lP2 } = mState.line;
                          const { p1: aP1, p2: aP2 } = mState;
                          const dx = aP2.x - aP1.x;
                          const dy = aP2.y - aP1.y;
                          const mag2 = dx*dx + dy*dy;
                          
                          const mirrorPt = (pt: {x:number, y:number, z:number}) => {
                             if (mag2 === 0) return pt;
                             const c = ((pt.x - aP1.x)*dx + (pt.y - aP1.y)*dy) / mag2;
                             const px = aP1.x + c * dx;
                             const py = aP1.y + c * dy;
                             return { x: 2*px - pt.x, y: 2*py - pt.y, z: pt.z };
                          };
                          
                          state.addLine3D({ p1: mirrorPt(lP1), p2: mirrorPt(lP2), color: mState.line.color });
                          // YES = delete original
                          state.removeLine3D(mState.line.id);
                          state.setInteractionMode("none");
                          state.setModifyState(null);
                       }
                     }}
                   >
                     Sim
                   </button>
                   <button 
                     className="px-3 py-1 bg-slate-100 hover:bg-slate-600 text-white rounded text-xs font-medium"
                     onClick={() => {
                       const state = useStore.getState();
                       const mState = state.modifyState;
                       if (mState && mState.line && mState.p1 && mState.p2) {
                          // Mirror math
                          const { p1: lP1, p2: lP2 } = mState.line;
                          const { p1: aP1, p2: aP2 } = mState;
                          const dx = aP2.x - aP1.x;
                          const dy = aP2.y - aP1.y;
                          const mag2 = dx*dx + dy*dy;
                          
                          const mirrorPt = (pt: {x:number, y:number, z:number}) => {
                             if (mag2 === 0) return pt;
                             const c = ((pt.x - aP1.x)*dx + (pt.y - aP1.y)*dy) / mag2;
                             const px = aP1.x + c * dx;
                             const py = aP1.y + c * dy;
                             return { x: 2*px - pt.x, y: 2*py - pt.y, z: pt.z };
                          };
                          
                          state.addLine3D({ p1: mirrorPt(lP1), p2: mirrorPt(lP2), color: mState.line.color });
                          // NO = keep original
                          state.setInteractionMode("none");
                          state.setModifyState(null);
                       }
                     }}
                   >
                     Não
                   </button>
                </div>
             </div>
          )}
        </div>
      )}

      {/* Point Addition Modal */}
      {useStore.getState().pendingPointAdd && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-slate-100/70 z-[200]"
          onWheel={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
        >
          <div
            className="bg-white border border-slate-300 p-6 rounded-md shadow-xl flex flex-col gap-4 text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-medium text-lg text-emerald-600">
              Adicionar Ponto ao MDT
            </h3>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-500">
                Cota original interpolada:{" "}
                {useStore.getState().pendingPointAdd!.defaultZ.toFixed(3)}
              </label>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">
                  Nova Cota (Z)
                </label>
                <input
                  type="number"
                  step="any"
                  autoFocus
                  defaultValue={useStore
                    .getState()
                    .pendingPointAdd!.defaultZ.toFixed(3)}
                  className="bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-600"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = parseFloat(e.currentTarget.value);
                      if (!isNaN(val)) {
                        const pt = useStore.getState().pendingPointAdd!;
                        if (surface) {
                          useStore.getState().addMDTEdit({ type: "add_point", data: { x: pt.x, y: pt.y, z: val } });
                        }
                        useStore.getState().setPendingPointAdd(null);
                      }
                    }
                  }}
                  id="mdt-add-point-input"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => useStore.getState().setPendingPointAdd(null)}
                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded text-sm transition-colors border border-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const input = document.getElementById(
                    "mdt-add-point-input",
                  ) as HTMLInputElement;
                  const val = parseFloat(input.value);
                  if (!isNaN(val)) {
                    const pt = useStore.getState().pendingPointAdd!;
                    if (surface) {
                      useStore.getState().addMDTEdit({ type: "add_point", data: { x: pt.x, y: pt.y, z: val } });
                    }
                    useStore.getState().setPendingPointAdd(null);
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Boundary Modal */}
      {useStore.getState().pendingCleanBoundary && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-slate-100/70 z-[200]"
          onWheel={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
        >
          <div
            className="bg-white border border-slate-300 p-6 rounded-md shadow-xl flex flex-col gap-4 text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-medium text-lg text-amber-500">
              Limpar Triângulos Longos da Borda
            </h3>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate-500">
                Entre com o comprimento máximo da aresta (m). Triângulos na
                borda com arestas maiores que isso serão removidos.
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">
                  Comprimento Máximo (m)
                </label>
                <input
                  type="number"
                  step="any"
                  autoFocus
                  defaultValue="50.00"
                  className="bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-600"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = parseFloat(e.currentTarget.value);
                      if (!isNaN(val) && val > 0 && surface) {
                        useStore.getState().addMDTEdit({ type: "clean_boundary", data: { maxLength: val } });
                        useStore.getState().setPendingCleanBoundary(false);
                      }
                    }
                  }}
                  id="mdt-clean-boundary-input"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  useStore.getState().setPendingCleanBoundary(false);
                }}
                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded text-sm transition-colors border border-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const input = document.getElementById(
                    "mdt-clean-boundary-input",
                  ) as HTMLInputElement;
                  const val = parseFloat(input.value);
                  if (!isNaN(val) && val > 0 && surface) {
                    useStore.getState().addMDTEdit({ type: "clean_boundary", data: { maxLength: val } });
                    useStore.getState().setPendingCleanBoundary(false);
                  }
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Intersection Creation Modal */}
      {pendingIntersection && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/70 z-[200]">
          <div
            className="bg-slate-50 border border-slate-300 p-6 rounded-md shadow-xl max-w-sm flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-slate-800 font-medium text-lg">
              Criar Interseção?
            </h3>
            <p className="text-slate-500 text-sm">
              Quer transformar numa interseção de corredores?
            </p>

            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setPendingIntersection(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-600 text-slate-800 rounded text-sm transition-colors"
              >
                Não
              </button>
              <button
                onClick={() => {
                  const newId = `int-${Date.now()}`;
                  const intersectionCount =
                    useStore.getState().intersections.length + 1;

                  const alignments = useStore.getState().alignments;
                  const mainA = alignments.find(a => a.id === pendingIntersection.mainId);
                  const branchA = alignments.find(a => a.id === pendingIntersection.branchId);
                  let isRightSide = true;
                  if (mainA && branchA) {
                    const norm = mainA.getOrientationAtStation(pendingIntersection.mainSta);
                    const bNorm = branchA.getOrientationAtStation(pendingIntersection.branchSta);
                    const isStart = pendingIntersection.branchSta === 0 || pendingIntersection.branchSta < branchA.length / 2;
                    const bDir = isStart ? { x: bNorm.tx, y: bNorm.ty } : { x: -bNorm.tx, y: -bNorm.ty };
                    const dot = bDir.x * norm.nx + bDir.y * norm.ny;
                    isRightSide = dot >= 0;
                  }

                  let mainTargetId = undefined;
                  const mainCorridor = useStore.getState().corridors.find(c => c.alignmentId === pendingIntersection.mainId);
                  if (mainCorridor) {
                    // Try to extract the edge feature based on the side.
                    // First try our new semantic standard (Bordo_Faixa), then fallback to legacy P2/P3.
                    const newSemantic = isRightSide ? "Bordo_Faixa_Dir_1" : "Bordo_Faixa_Esq_1";
                    mainTargetId = useStore.getState().extractFeatureLine(mainCorridor.id, newSemantic);
                    
                    if (!mainTargetId) {
                       const preferredFeature = isRightSide ? "P2" : "P3";
                       mainTargetId = useStore.getState().extractFeatureLine(mainCorridor.id, preferredFeature);
                       if (!mainTargetId && !isRightSide) {
                         // Fallback if P3 doesn't exist (e.g. Pista Simples)
                         mainTargetId = useStore.getState().extractFeatureLine(mainCorridor.id, "P2");
                       }
                       if (!mainTargetId && isRightSide) {
                         mainTargetId = useStore.getState().extractFeatureLine(mainCorridor.id, "P3");
                       }
                    }
                  }

                  useStore.getState().addIntersection({
                    id: newId,
                    name: `Interseção ${intersectionCount.toString().padStart(2, "0")}`,
                    mainAlignmentId: pendingIntersection.mainId,
                    branchAlignmentId: pendingIntersection.branchId,
                    mainStation: pendingIntersection.mainSta,
                    branchStation: pendingIntersection.branchSta,
                    isRightSide,
                    mainTargetId,
                    leftRadius: 15,
                    rightRadius: 15,
                    hasIsland: false,
                    islandWidth: 2,
                    islandBranchWidth: 4.5,
                    hasSpiral: false,
                    spiralLength: 20,
                    /* Refúgio na garganta vem de fábrica: é o caso comum, e o
                       nariz físico já é construído contra o bordo dele. */
                    hasRefugio: true,
                    refugioWidth: 1.5,
                    mainCrossSlope: -2,
                    branchCrossSlope: -2,
                  });
                  
                  useStore.setState((state) => ({
                    editingIntersectionId: newId,
                    activeTab: "intersections",
                  }));

                  setPendingIntersection(null);
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm transition-colors cursor-pointer"
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Curve Creation Modal */}
      {pendingCurve && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/70 z-[200]">
          <div
            className="bg-slate-50 border border-slate-300 p-6 rounded-md shadow-xl max-w-sm flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-slate-800 font-medium text-lg">
              Raio da Curva (m)
            </h3>
            <input
              type="number"
              defaultValue={pendingCurve.currentRadius}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-800 outline-none focus:border-emerald-600 transition-colors"
              autoFocus
              id="curve-radius-input"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = parseFloat(e.currentTarget.value);
                  if (!isNaN(val) && val > 0) {
                    try {
                      useStore
                        .getState()
                        .updateActiveAlignmentPIRadius(
                          pendingCurve.piIndex,
                          val,
                        );
                      setPendingCurve(null);
                    } catch (err: any) {
                      setPendingCurve({
                        ...pendingCurve,
                        currentRadius: val,
                        error: err.message,
                      });
                    }
                  } else {
                    setPendingCurve(null);
                  }
                } else if (e.key === "Escape") {
                  setPendingCurve(null);
                }
              }}
            />
            {pendingCurve.error && (
              <div className="text-red-400 text-sm mt-1 mb-2 bg-red-950/50 p-2 rounded border border-red-900/50">
                {pendingCurve.error}
              </div>
            )}
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setPendingCurve(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-600 text-slate-800 rounded text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const input = document.getElementById(
                    "curve-radius-input",
                  ) as HTMLInputElement;
                  if (input) {
                    const val = parseFloat(input.value);
                    if (!isNaN(val) && val > 0) {
                      try {
                        useStore
                          .getState()
                          .updateActiveAlignmentPIRadius(
                            pendingCurve.piIndex,
                            val,
                          );
                        setPendingCurve(null);
                      } catch (err: any) {
                        setPendingCurve({
                          ...pendingCurve,
                          currentRadius: val,
                          error: err.message,
                        });
                      }
                    } else {
                      setPendingCurve(null);
                    }
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm transition-colors cursor-pointer"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spiral Creation Modal */}
      {pendingSpiral && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/70 z-[200]">
          <div
            className="bg-slate-50 border border-slate-300 p-6 rounded-md shadow-xl max-w-sm flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-slate-800 font-medium text-lg">
              Comprimentos de Espiral (m)
            </h3>
            
            <div>
              <label className="block text-slate-500 text-xs mb-1">Espiral de Entrada (Le)</label>
              <input
                type="number"
                defaultValue={pendingSpiral.currentSpiralIn}
                className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-800 outline-none focus:border-orange-600 transition-colors mb-3"
                autoFocus
                id="spiral-in-input"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setPendingSpiral(null);
                }}
              />
            </div>
            
            <div>
              <label className="block text-slate-500 text-xs mb-1">Espiral de Saída (Ls)</label>
              <input
                type="number"
                defaultValue={pendingSpiral.currentSpiralOut}
                className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-800 outline-none focus:border-orange-600 transition-colors"
                id="spiral-out-input"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const btn = document.getElementById("apply-spiral-btn");
                    if (btn) btn.click();
                  } else if (e.key === "Escape") {
                    setPendingSpiral(null);
                  }
                }}
              />
            </div>

            {pendingSpiral.error && (
              <div className="text-red-400 text-sm mt-1 mb-2 bg-red-950/50 p-2 rounded border border-red-900/50">
                {pendingSpiral.error}
              </div>
            )}
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setPendingSpiral(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-sm transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id="apply-spiral-btn"
                onClick={() => {
                  const inputIn = document.getElementById("spiral-in-input") as HTMLInputElement;
                  const inputOut = document.getElementById("spiral-out-input") as HTMLInputElement;
                  if (inputIn && inputOut) {
                    const valIn = parseFloat(inputIn.value) || 0;
                    const valOut = parseFloat(inputOut.value) || 0;
                    if (!isNaN(valIn) && !isNaN(valOut) && (valIn >= 0 || valOut >= 0)) {
                      try {
                        useStore
                          .getState()
                          .updateActiveAlignmentPISpiral(
                            pendingSpiral.piIndex,
                            valIn,
                            valOut
                          );
                        setPendingSpiral(null);
                      } catch (err: any) {
                        setPendingSpiral({
                          ...pendingSpiral,
                          currentSpiralIn: valIn,
                          currentSpiralOut: valOut,
                          error: err.message,
                        });
                      }
                    } else {
                      setPendingSpiral(null);
                    }
                  }
                }}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm transition-colors cursor-pointer"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Element Info Window */}
      {(() => {
        if (!selectedGeomSeg) return null;
        const g = drawnGeometries.find((x) => x.id === selectedGeomSeg.geomId);
        const s = g?.segments[selectedGeomSeg.segIndex];
        if (!g || !s) return null;
        const azim = (a: { x: number; y: number }, b: { x: number; y: number }) => {
          let ang = (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
          if (ang < 0) ang += 360;
          return ang;
        };
        const label =
          s.type === "line" ? "LINHA" : s.type === "arc" ? "ARCO" : "POLILINHA";
        return (
          <div className="absolute top-16 right-4 w-72 bg-white border border-slate-300/50 rounded shadow-2xl p-4 z-[140] cursor-default">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-slate-800 font-medium text-sm">Geometria Extraída</h3>
              <button
                className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1"
                onClick={() => setSelectedGeomSeg(null)}
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-2 text-xs text-slate-700">
              <div className="flex justify-between border-b border-slate-200 pb-1">
                <span className="text-slate-500">Objeto:</span>
                <span className="font-semibold truncate ml-2" title={g.name}>{g.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1">
                <span className="text-slate-500">Tipo:</span>
                <span className="font-semibold">{label}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1">
                <span className="text-slate-500">Extensão:</span>
                <span className="font-mono">{s.length.toFixed(3)} m</span>
              </div>
              {s.type === "arc" && (
                <>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500">Raio:</span>
                    <span className="font-mono font-semibold text-rose-600">
                      {(s.radius || 0).toFixed(3)} m
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500">Ângulo central:</span>
                    <span className="font-mono">
                      {(Math.abs((s.sweep || 0) * 180) / Math.PI).toFixed(4)}°
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500">Sentido:</span>
                    <span className="font-mono">{s.ccw ? "Anti-horário" : "Horário"}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500">Centro (E, N):</span>
                    <span className="font-mono text-[10px]">
                      {(s.center?.x || 0).toFixed(3)} / {(s.center?.y || 0).toFixed(3)}
                    </span>
                  </div>
                </>
              )}
              {s.type === "line" && (
                <div className="flex justify-between border-b border-slate-200 pb-1">
                  <span className="text-slate-500">Azimute:</span>
                  <span className="font-mono">{azim(s.p1, s.p2).toFixed(4)}°</span>
                </div>
              )}
              {s.type === "poly" && (
                <div className="flex justify-between border-b border-slate-200 pb-1">
                  <span className="text-slate-500">Vértices:</span>
                  <span className="font-mono">{s.pts?.length || 0}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-slate-200 pb-1">
                <span className="text-slate-500">Início (E, N):</span>
                <span className="font-mono text-[10px]">
                  {s.p1.x.toFixed(3)} / {s.p1.y.toFixed(3)}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1">
                <span className="text-slate-500">Fim (E, N):</span>
                <span className="font-mono text-[10px]">
                  {s.p2.x.toFixed(3)} / {s.p2.y.toFixed(3)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400 text-[10px] pt-1">
                <span>
                  Elemento {selectedGeomSeg.segIndex + 1} de {g.segments.length}
                </span>
                <span>tol. {g.tolerance} m · {g.linked ? "vinculada" : "congelada"}</span>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  className="flex-1 px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  disabled={selectedGeomSeg.segIndex === 0}
                  onClick={() =>
                    setSelectedGeomSeg({ geomId: g.id, segIndex: selectedGeomSeg.segIndex - 1 })
                  }
                >
                  ← anterior
                </button>
                <button
                  className="flex-1 px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  disabled={selectedGeomSeg.segIndex >= g.segments.length - 1}
                  onClick={() =>
                    setSelectedGeomSeg({ geomId: g.id, segIndex: selectedGeomSeg.segIndex + 1 })
                  }
                >
                  próximo →
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {selectedElement && activeTab === "horizontal" && (
        <div className="absolute top-16 right-4 w-72 bg-white border border-slate-300/50 rounded shadow-2xl p-4 z-[100] cursor-default">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-slate-800 font-medium text-sm">
              Informações do Elemento
            </h3>
            <button
              onClick={() => setSelectedElement(null)}
              className="text-slate-500 hover:text-slate-800"
            >
              ×
            </button>
          </div>
          <div className="flex flex-col gap-2 text-xs text-slate-700">
            {(() => {
              /* Alinhamento de nariz: mostra de onde ele vem. É derivado —
                 quem manda na geometria são os parâmetros do nariz. */
              const al: any = alignments.find((a) => a.id === selectedElement.alignmentId);
              if (!al?.isNoseAlignment) return null;
              const src = al.noseSource || {};
              return (
                <div className="flex flex-col gap-0.5 rounded bg-slate-100 px-2 py-1.5 mb-1">
                  <span className="font-semibold text-slate-800">{al.name}</span>
                  <span className="text-[10px] text-slate-500 leading-snug">
                    Nariz físico {src.tipo ? `· ${src.tipo}` : ""}
                    {src.pista ? ` · pista ${src.pista}` : ""}
                  </span>
                  <span className="text-[10px] text-amber-700 leading-snug">
                    Vinculado ao nariz — geometria vem do NT, não é editável aqui.
                  </span>
                </div>
              );
            })()}
            <div className="flex justify-between border-b border-slate-200 pb-1">
              <span className="text-slate-500">Tipo:</span>
              <span className="font-semibold">
                {selectedElement.type === "Tangent"
                  ? "Tangente"
                  : selectedElement.type === "Curve"
                    ? "Curva Circular"
                    : "Curva de Transição"}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-1">
              <span className="text-slate-500">Estaca Inicial:</span>
              <span>
                STA {Math.floor(selectedElement.startSta / 20).toFixed(0)} +{" "}
                {(selectedElement.startSta % 20).toFixed(3).padStart(6, '0')}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-1">
              <span className="text-slate-500">Estaca Final:</span>
              <span>
                STA {Math.floor(selectedElement.endSta / 20).toFixed(0)} +{" "}
                {(selectedElement.endSta % 20).toFixed(3).padStart(6, '0')}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-1">
              <span className="text-slate-500">Extensão:</span>
              <span>{Math.abs(selectedElement.length).toFixed(3)} m</span>
            </div>
            {(selectedElement.type === "Curve" || selectedElement.type === "Spiral") && (
                <>
                  <div className="flex justify-between border-b border-slate-200 pb-1 items-center">
                    <span className="text-slate-500">Raio:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        className="bg-slate-50 text-emerald-600 text-right text-xs p-1 rounded outline-none w-[80px] font-mono border border-slate-300 focus:border-emerald-600"
                        key={`radius-${selectedElement.pivIndex}-${selectedElement.radius}-${alignments.find((a) => a.id === selectedElement.alignmentId)?.keyPoints[selectedElement.pivIndex!]?.radius}`}
                        defaultValue={(
                          (selectedElement.pivIndex !== undefined &&
                            alignments.find((a) => a.id === selectedElement.alignmentId)?.keyPoints[selectedElement.pivIndex!]?.radius) ||
                          selectedElement.radius || 0
                        )?.toFixed(3)}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            let pIdx = selectedElement.pivIndex;
                            if (pIdx === undefined) {
                              const targetAlg = alignments.find((a) => a.id === selectedElement.alignmentId);
                              if (targetAlg) {
                                const midSta = (selectedElement.startSta + selectedElement.endSta) / 2;
                                let minD = Infinity;
                                targetAlg.keyPoints.forEach((kp, idx) => {
                                  if (kp.pi) {
                                    const d = Math.abs(kp.sta - midSta);
                                    if (d < minD) { minD = d; pIdx = idx; }
                                  }
                                });
                              }
                            }
                            if (pIdx !== undefined) {
                              useStore.getState().updateActiveAlignmentPIRadius(pIdx, val);
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                      />
                      <span className="text-slate-500">m</span>
                    </div>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1 items-center">
                    <span className="text-slate-500">Espiral Entrada:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        className="bg-slate-50 text-amber-600 text-right text-xs p-1 rounded outline-none w-[80px] font-mono border border-slate-300 focus:border-amber-600"
                        key={`spiralIn-${selectedElement.pivIndex}-${selectedElement.spiralIn}-${alignments.find((a) => a.id === selectedElement.alignmentId)?.keyPoints[selectedElement.pivIndex!]?.spiralIn}`}
                        defaultValue={(
                          (selectedElement.pivIndex !== undefined &&
                            alignments.find((a) => a.id === selectedElement.alignmentId)?.keyPoints[selectedElement.pivIndex!]?.spiralIn) ||
                          selectedElement.spiralIn || 0
                        )?.toFixed(3)}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            let pIdx = selectedElement.pivIndex;
                            const targetAlg = alignments.find((a) => a.id === selectedElement.alignmentId);
                            if (pIdx === undefined && targetAlg) {
                              const midSta = (selectedElement.startSta + selectedElement.endSta) / 2;
                              let minD = Infinity;
                              targetAlg.keyPoints.forEach((kp, idx) => {
                                if (kp.pi) {
                                  const d = Math.abs(kp.sta - midSta);
                                  if (d < minD) { minD = d; pIdx = idx; }
                                }
                              });
                            }
                            if (pIdx !== undefined && targetAlg) {
                              const curPI = targetAlg.keyPoints[pIdx];
                              useStore.getState().updateActiveAlignmentPISpiral(pIdx, val, curPI?.spiralOut);
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                      />
                      <span className="text-slate-500">m</span>
                    </div>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1 items-center">
                    <span className="text-slate-500">Espiral Saída:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        className="bg-slate-50 text-amber-600 text-right text-xs p-1 rounded outline-none w-[80px] font-mono border border-slate-300 focus:border-amber-600"
                        key={`spiralOut-${selectedElement.pivIndex}-${selectedElement.spiralOut}-${alignments.find((a) => a.id === selectedElement.alignmentId)?.keyPoints[selectedElement.pivIndex!]?.spiralOut}`}
                        defaultValue={(
                          (selectedElement.pivIndex !== undefined &&
                            alignments.find((a) => a.id === selectedElement.alignmentId)?.keyPoints[selectedElement.pivIndex!]?.spiralOut) ||
                          selectedElement.spiralOut || 0
                        )?.toFixed(3)}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            let pIdx = selectedElement.pivIndex;
                            const targetAlg = alignments.find((a) => a.id === selectedElement.alignmentId);
                            if (pIdx === undefined && targetAlg) {
                              const midSta = (selectedElement.startSta + selectedElement.endSta) / 2;
                              let minD = Infinity;
                              targetAlg.keyPoints.forEach((kp, idx) => {
                                if (kp.pi) {
                                  const d = Math.abs(kp.sta - midSta);
                                  if (d < minD) { minD = d; pIdx = idx; }
                                }
                              });
                            }
                            if (pIdx !== undefined && targetAlg) {
                              const curPI = targetAlg.keyPoints[pIdx];
                              useStore.getState().updateActiveAlignmentPISpiral(pIdx, curPI?.spiralIn, val);
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                      />
                      <span className="text-slate-500">m</span>
                    </div>
                  </div>
                </>
              )}
            <div className="flex flex-col gap-1 mt-2">
              <span className="text-slate-500">Coordenada Inicial:</span>
              <span className="text-[10px] font-mono select-all">
                E: {selectedElement.startX.toFixed(4)} N:{" "}
                {selectedElement.startY.toFixed(4)}
              </span>
            </div>
            <div className="flex flex-col gap-1 mt-1">
              <span className="text-slate-500">Coordenada Final:</span>
              <span className="text-[10px] font-mono select-all">
                E: {selectedElement.endX.toFixed(4)} N:{" "}
                {selectedElement.endY.toFixed(4)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
