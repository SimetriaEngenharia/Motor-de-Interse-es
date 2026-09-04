/* DESENHISTA ÚNICO DA PLANTA
 * ---------------------------------------------------------------------------
 * Este módulo concentra a CLASSIFICAÇÃO e o ESTILO do desenho em planta
 * (fitas dos corredores e feature lines). A planta do projeto (PlanView) usa-o
 * para desenhar de forma interativa e publica o resultado — já em coordenadas
 * de mundo — no estado `planScene`. O menu PRODUÇÃO limita-se a mostrar esse
 * mesmo desenho dentro da moldura da folha: a Produção nunca recalcula nem
 * reclassifica nada.
 */

export interface RibbonLike {
  path: string;
  linkId?: string;
  linkType?: string;
  corridorId?: string;
  regionId?: string;
  p1Code?: string;
  p2Code?: string;
  assemblyName?: string;
}

export interface LayerLike { id: string; color?: string }

export interface RibbonStyle {
  /** null = não se desenha (camadas estruturais enterradas). */
  fill: string | null;
  isLane: boolean;
}

const layerColor = (layers: LayerLike[], id: string, fallback: string) =>
  layers.find((l) => l.id === id)?.color || fallback;

/** Classifica uma fita de corredor e devolve a cor da camada correspondente. */
export function classifyRibbon(
  ribbon: RibbonLike,
  layers: LayerLike[],
  corridorName?: string,
): RibbonStyle {
  const pistaLayer = layerColor(layers, "layer-pista", "#1f1f22");
  const acostamentoLayer = layerColor(layers, "layer-acostamento", "#27272a");
  const taludeLayer = layerColor(layers, "layer-talude", "#22c55e");
  const aterroLayer = layerColor(layers, "layer-aterro", "#54A53B");
  const corteLayer = layerColor(layers, "layer-corte", "#DF3F6A");
  const banquetaLayer = layerColor(layers, "layer-banqueta", "#E59E42");
  const meiofioLayer = layerColor(layers, "layer-meiofio", "#d4d4d8");

  const isQuadrantOrFillet =
    ribbon.assemblyName?.includes("Quadrante") ||
    ribbon.assemblyName?.includes("Bordo") ||
    corridorName?.includes("Quadrante") ||
    corridorName?.includes("Bordo") ||
    corridorName?.includes("Ilha") ||
    ribbon.linkId?.toLowerCase().includes("quadrante");

  const code1 = (ribbon.p1Code || "").toLowerCase();
  const code2 = (ribbon.p2Code || "").toLowerCase();
  const lType = (ribbon.linkType || "").toLowerCase();
  const lId = (ribbon.linkId || "").toLowerCase();

  let isPista = false;
  let isAcostamento = false;
  let isMeioFio = false;
  let isTalude = false;
  let isBase = false;

  // 1. Base / sub-base / datum (camadas estruturais enterradas)
  if (
    lType === "base" || lType.includes("sub") || lType === "foundation" ||
    code1.includes("datum") || code2.includes("datum") ||
    code1 === "p4" || code2 === "p4" ||
    Number(ribbon.p1Code?.slice(1) || 0) > 6
  ) {
    isBase = true;
  }
  // 2. Acostamento (antes da pista: liga ao Bordo_Faixa)
  else if (
    lType === "acostamento" ||
    code1.includes("acost") || code2.includes("acost") ||
    lId.includes("shoulder") ||
    ((ribbon.p1Code === "P2" && ribbon.p2Code === "P3") || (ribbon.p1Code === "P3" && ribbon.p2Code === "P2")) ||
    ((ribbon.p1Code === "P2" && ribbon.p2Code === "P5") || (ribbon.p1Code === "P5" && ribbon.p2Code === "P2"))
  ) {
    isAcostamento = true;
  }
  // 3. Meio-fio / guia / sarjeta / passeio / new jersey
  else if (
    lType.includes("guia") || lType.includes("sarjeta") || lType.includes("meio fio") || lType.includes("meiofio") || lType.includes("passeio") || lType.includes("new jersey") ||
    code1.includes("sarj") || code2.includes("sarj") || code1.includes("guia") || code2.includes("guia") || code1.includes("meiofio") || code2.includes("meiofio") || code1.includes("passeio") || code2.includes("passeio") ||
    lId.includes("curb") || lId.includes("sidewalk")
  ) {
    isMeioFio = true;
  }
  // 4. Talude / daylight / corte / aterro / banqueta
  else if (
    lType.includes("talude") || lType.includes("corte") || lType.includes("aterro") || lType.includes("banqueta") ||
    lId.includes("daylight") || code1.includes("talude") || code2.includes("talude") ||
    code1 === "p5" || code2 === "p5" || code1 === "p6" || code2 === "p6"
  ) {
    isTalude = true;
  }
  // 5. Pista
  else if (
    lType === "pista" ||
    ((ribbon.p1Code === "Origin" && code2.includes("bordo_faixa")) || (code1.includes("bordo_faixa") && ribbon.p2Code === "Origin")) ||
    ((ribbon.p1Code === "P1" && ribbon.p2Code === "P2") || (ribbon.p1Code === "P2" && ribbon.p2Code === "P1")) ||
    (lType === "" && (code1.includes("pista") || code2.includes("pista") || code1.includes("faixa") || code2.includes("faixa")))
  ) {
    isPista = true;
  }

  if (isBase) return { fill: null, isLane: false };
  if (isAcostamento) return { fill: acostamentoLayer, isLane: false };
  if (isMeioFio) return { fill: meiofioLayer, isLane: false };
  if (isTalude) {
    const fill = lType === "corte" ? corteLayer
      : lType === "aterro" ? aterroLayer
      : lType === "banqueta" ? banquetaLayer
      : taludeLayer;
    return { fill, isLane: false };
  }
  if (isPista) return { fill: pistaLayer, isLane: !isQuadrantOrFillet };
  return { fill: pistaLayer, isLane: false };
}

export interface FeatureStyle { stroke: string; width: number; dash: string }

/** Estilo padrão das feature lines (eixo, bordos, pé de talude). */
export function featureLineStyle(featureId: string): FeatureStyle {
  if (featureId === "Origin") return { stroke: "#eab308", width: 1, dash: "10 5" };
  if (featureId.startsWith("Pe_Talude")) return { stroke: "#22c55e", width: 1, dash: "none" };
  if (featureId.startsWith("Bordo")) return { stroke: "#14b8a6", width: 2, dash: "none" };
  return { stroke: "#94a3b8", width: 1, dash: "none" };
}

/* Cena publicada pela planta (coordenadas de MUNDO, em metros). */
export interface PlanSceneRibbon { d: string; fill: string; corridorId?: string; regionId?: string }
export interface PlanSceneFeature { d: string; id: string; corridorId?: string; stroke: string; width: number; dash: string }
export interface PlanScene { ribbons: PlanSceneRibbon[]; features: PlanSceneFeature[]; stamp: number }

export const emptyPlanScene = (): PlanScene => ({ ribbons: [], features: [], stamp: 0 });

/* FLUXO — quem é faixa de tráfego.
 * O componente Pista emite vários links do tipo "Pista": a superfície da faixa
 * (eixo ou bordo anterior → Bordo_Faixa) e, do revestimento, a face inferior e
 * as duas faces verticais dos bordos. Em planta as verticais têm largura zero e
 * caem exatamente sobre o bordo. Só a superfície carrega fluxo.
 * Devolve lado e número da faixa (1 = a que encosta no eixo). */
export function laneSurface(
  ribbon: RibbonLike,
): { side: "Esq" | "Dir"; index: number } | null {
  if ((ribbon.linkType || "").toLowerCase() !== "pista") return null;
  const c1 = ribbon.p1Code || "";
  const c2 = ribbon.p2Code || "";
  const structural = (c: string) => /base_|datum/i.test(c);
  if (structural(c1) || structural(c2)) return null;
  const re = /Bordo_Faixa_(Esq|Dir)_(\d+)/i;
  const m = re.exec(c1) || re.exec(c2);
  if (!m) return null;
  return { side: m[1].toLowerCase() === "esq" ? "Esq" : "Dir", index: Number(m[2]) || 1 };
}
