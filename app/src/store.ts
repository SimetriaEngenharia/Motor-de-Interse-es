
import {
  DrawnGeometry, buildGeometry, geometrySignature,
  isTopFeature, getFeatureLayerInfo, stitchPointChains,
} from "./lib/geomExtract";
import { outerLaneFlow, sideOf, flowCtxFromComponents } from "./lib/flow";
import { movimentoDoQuadrante, maoDoRamo, papelDosQuadrantes } from "./lib/flowRules";

export const DEFAULT_CARIMBO_ELEMENTS: Record<string, boolean> = {
  simbolo_1: true,
  simbolo_2: true,
  simbolo_3: true,
  texto_1: true,
  texto_2: true,
  texto_3: true,
  texto_4: true,
  texto_5: true,
  texto_6: true,
  texto_7: true,
  texto_8: true,
  texto_9: true,
  texto_10: true,
};

export const DEFAULT_CARIMBO_TEXT_VALUES: Record<string, string> = {
  texto_1: "SV-SP258/00-0287.90-DUP-A1-GE/DE.E-200.R0a",
  texto_2: "DE-SP0000258-287.339-620-F03",
  texto_3: "PROJETO EXECUTIVO — PERFIL",
  texto_4: "SP-258— RODOVIA FRANCISCO ALVES NEGRÃO",
  texto_5: "15/05/2023",
  texto_6: "km 287+900 AO KM 338+110",
  texto_7: "1000+0,000 AO 3552+0,000",
  texto_8: "PERFIL 1:100(V) — 1:1000(H)",
  texto_9: "200",
  texto_10: "2217-SP-8-R0-G00-00-C-30-DE-0200",
};

export const DEFAULT_CARIMBO_DIMENSIONS: Record<string, number> = {
  row1: 25.00,
  row2: 32.50,
  row3: 7.50,
  row4: 7.50,
  row5: 7.50,
  row6: 7.50,
  row7: 7.50,
  row8: 7.50,
  col1: 101.00,
  col2: 44.00,
  col3: 30.00,
};

export const DEFAULT_CARIMBO_TEXT_STYLE = {
  fontFamily: "Arial",
  textHeightMM: 2.5,
  labelColor: "#f59e0b",
  valueColor: "#10b981",
  fontWeight: "bold" as "normal" | "bold",
  fontStyle: "normal" as "normal" | "italic",
  textDecoration: "none" as "none" | "underline",
};
import { create } from "zustand";

const rebuildTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};

import { temporal } from "zundo";
import * as d3 from "d3";
import {
  Parameter,
  Assembly,
  CorridorRegion,
  C3DPoint,
  C3DLink,
  Corridor,
  Layer,
  SubassemblyComponent,
} from "./types";
import { evaluateExpression, ALIGNMENT_LENGTH } from "./lib/utils";
import { compileSubassemblies } from "./lib/subassemblies";
import { SurfaceDTM } from "./lib/dtm";
import {
  Alignment3D,
  AlignmentPoint,
  ProfilePoint,
  rebuildFromPIs,
  rebuildProfileFromPIVs,
  createOffsetAlignment,
} from "./lib/alignment";
import {
  ParametrosGalho, TopologiaGalho, construirAlinhamentoGalho, validarGalho,
} from "./lib/galho";
import {
  casarFilleteComBordos,
  escolherBordoRamo,
  mainEhT1DoEdge,
  buildIntersectionPolygon,
  resolverNarizes,
  narizKey,
  narizKeyCoord,
  isChaveCoord,
  hashPolylines,
  hashPolylinesEstavel,
  assinaturaNarizes,
  LARGURA_NARIZ_FISICO,
  OFFSET_BORDO_NARIZ,
  COMPR_NARIZ_FISICO,
} from "./lib/intersection";
import {
  buildNoseAlignment,
  buildTieAlignment,
  noseAlignmentId,
  tieAlignmentId,
  isNoseAlignmentId,
  NOSE_LAYER_ID,
  type NoseAlignInfo,
} from "./lib/noseAlignment";


export interface CadastreLayer {
  name: string;
  color: number;
  entities: any[];
}

export interface Point3D {
  id: string;
  x: number;
  y: number;
  z: number;
  description?: string;
  color?: string;
}

export interface Line3D {
  id: string;
  p1: { x: number; y: number; z: number };
  p2: { x: number; y: number; z: number };
  description?: string;
  color?: string;
}

export interface ProfileLine {
  id: string;
  alignmentId: string;
  p1: { sta: number; elev: number };
  p2: { sta: number; elev: number };
  description?: string;
  color?: string;
}

export interface Circle3D {
  id: string;
  center: { x: number; y: number; z: number };
  radius: number;
  description?: string;
  color?: string;
}

export type DimensionType = "linear" | "aligned" | "angular" | "radius";

export interface Dimension {
  id: string;
  type: DimensionType;
  points: { x: number; y: number }[];
  value: number;
  textPos?: { x: number; y: number };
  color?: string;
}

/** NARIZ TEÓRICO — cruzamento de um bordo de cada rodovia. Só o ponto. */
export interface NarizTeoricoRec {
  id: string;
  x: number;
  y: number;
  armA: string;
  armB: string;
  /** abertura da cunha não pavimentada [graus] — ângulo do nariz */
  abertura?: number;
  /** bissetriz da cunha (para posicionar o nariz físico) */
  dirLivre?: { x: number; y: number } | null;
  /** ids das rodovias (alinhamentos raiz) que formam o nariz */
  raizA?: string;
  raizB?: string;
}

/**
 * FATOR DE CONVERSÃO das faixas de mudança de velocidade (DNIT).
 * Corrige o comprimento tabelado para a rampa média do trecho. Rampas de
 * módulo inferior a 3% não têm correção — a tabela do DNIT começa em 3%.
 */
export const fatorConversaoDNIT = (
  tipo: "Aceleração" | "Desaceleração",
  rampaPct: number | null | undefined,
  vRodovia = 80,
): number | null => {
  if (rampaPct === null || rampaPct === undefined) return null;
  const i = Math.abs(rampaPct);
  if (i < 3) return null;
  const forte = i >= 5;
  const subida = rampaPct > 0;
  if (tipo === "Desaceleração") {
    if (subida) return forte ? 0.80 : 0.90;
    return forte ? 1.35 : 1.20;
  }
  // Aceleração: a correção cresce com a velocidade da rodovia
  if (subida) {
    if (vRodovia >= 90) return forte ? 1.90 : 1.50;
    if (vRodovia >= 70) return forte ? 1.70 : 1.40;
    return forte ? 1.50 : 1.30;
  }
  return forte ? 0.60 : 0.70;
};

/* Constantes e construção do nariz vivem em lib/intersection (fonte única);
 * re-exportadas aqui porque a UI as consome via store. */
export { LARGURA_NARIZ_FISICO, OFFSET_BORDO_NARIZ, COMPR_NARIZ_FISICO } from "./lib/intersection";
export type TipoNariz = keyof typeof LARGURA_NARIZ_FISICO;

export interface IntersectionData {
  id: string;
  name: string;
  mainAlignmentId: string;
  branchAlignmentId: string;
  mainStation: number;
  branchStation: number;
  leftRadius: number;
  rightRadius: number;
  hasIsland?: boolean;
  islandWidth?: number;
  islandBranchWidth?: number;
  /* REFÚGIO NA GARGANTA — alargamento pavimentado da seção da principal para
   * dentro da ilha, entre os narizes. Opcional, largura escolhida. O bordo da
   * pista NÃO se afasta: o refúgio é elemento novo na montagem simplificada.
   * O nariz físico passa a ser construído contra o bordo DELE. */
  hasRefugio?: boolean;
  refugioWidth?: number;
  hasSpiral?: boolean;
  spiralLength?: number;
  leftSpiralIn?: number;
  leftSpiralOut?: number;
  rightSpiralIn?: number;
  rightSpiralOut?: number;
  mainCrossSlope?: number;
  branchCrossSlope?: number;
  connectBordos?: boolean;
  assemblyId?: string;
  quadrantTargetId?: string; // Keep for backward compatibility if needed, or remove. Let's remove if we can.
  mainTargetId?: string;
  branchTargetId?: string;
  commonPointFeature?: "Center" | "P2" | "P3";
  isRightSide?: boolean;

  // ARTESP properties
  mainSpeed?: number;
  branchSpeed?: number;
  leftBranchWidth?: number;
  rightBranchWidth?: number;
  accessType?: "standard" | "comercial" | "nao_comercial_polo" | "residencial";

  /* GALHO DA ÁRVORE — presente só quando a interseção foi GERADA a partir da
   * principal, em vez de deduzida do cruzamento de dois eixos já desenhados.
   * O eixo do ramo é regenerado no ponto de divergência quando a principal
   * muda; do segundo PI em diante o traçado é do projetista (lib/galho). */
  galho?: {
    topologia: TopologiaGalho;
    angulo: number;
    comprimento: number;
    maoUnica: boolean;
    sentido?: "entrada" | "saida";
    raio?: number;
    largura?: number;
  };

  // Accel/Decel configuration
  hasAccelDecel?: boolean;
  accelL?: number;
  accelT?: number;
  decelL?: number;
  decelT?: number;
  accelWidth?: number;
  decelWidth?: number;
}

/**
 * ESTADO VOLÁTIL — reconstruído a cada sessão (seleções, janelas abertas,
 * geometria derivada). Tudo o que NÃO estiver aqui é salvo no projeto, então
 * qualquer estado novo de qualquer menu passa a ser gravado sem manutenção.
 */
/* ────────────────────────────── BASES ──────────────────────────────
 * Uma BASE é um conjunto nomeado de REFERÊNCIAS (ids) a elementos que já
 * existem no projeto. Não duplica nem modifica nada: serve só para o
 * utilizador ligar/desligar conjuntos de elementos ao mesmo tempo.
 * Regra de visibilidade (união): um elemento fica oculto apenas se pertencer
 * a pelo menos uma base E todas as bases que o contêm estiverem desligadas.
 * Elemento que não pertence a base nenhuma está sempre visível.
 * Nota: nada do menu PRODUÇÃO entra numa base — a Produção é apenas saída e
 * depende dos outros menus, nunca o contrário. */
export interface BaseMembers {
  surfaces: string[];
  alignments: string[];
  corridors: string[];
  /** Linhas do corredor (feature lines), chave `corridorId|featureId`. */
  corridorLines: string[];
  geometries: string[];
  points3D: string[];
  lines3D: string[];
  circles3D: string[];
  intersections: string[];
}

export type BaseMemberKind = keyof BaseMembers;

export interface ProjectBase {
  id: string;
  name: string;
  color: string;
  active: boolean;
  members: BaseMembers;
}

export const emptyBaseMembers = (): BaseMembers => ({
  surfaces: [], alignments: [], corridors: [], corridorLines: [], geometries: [],
  points3D: [], lines3D: [], circles3D: [], intersections: [],
});

/** Visibilidade de um elemento em função das bases (regra de união). */
export function isVisibleInBases(
  bases: ProjectBase[] | undefined,
  kind: BaseMemberKind,
  id: string,
): boolean {
  if (!bases || bases.length === 0) return true;
  let pertence = false;
  for (const b of bases) {
    const ids = b.members?.[kind];
    if (ids && ids.indexOf(id) !== -1) {
      pertence = true;
      if (b.active !== false) return true;
    }
  }
  return !pertence;
}

export const TRANSIENT_STATE_KEYS = new Set([
  "planScene",
  "surface", "corridorFeatures", "computedPoints", "activeLinks", "bordoQuadro",
  "ntDebug", "intersectionNTs",
  "activeAlignmentId", "activeSectionLineId", "activeTab",
  "selectedAssemblyId", "selectedIntersectionId", "selectedElementId",
  "selectedCorridorId", "selectedRegionId", "editingIntersectionId",
  "layerModalForAlignment", "productionSelectedViewport", "ntWindowIntersectionId",
  "ntWindowFocusKey",
  "interactionMode", "modifyState", "tempPIs", "tempProfilePIVs",
  "isLayerManagerOpen", "isFloatingViewerOpen", "isDynamicInteraction",
  "showAlignmentEditor", "floatingViewerMode",
  "ambiente", "planFitTrigger", "zoomJanelaAtivo", "historicoZoom",
  "selecaoDesenho", "areaTransferencia",
]);

/** Os 4 ambientes de trabalho autônomos do app. */
export type Ambiente = "projeto" | "perfis" | "secoes" | "producao";

export const AMBIENTES: { id: Ambiente; rotulo: string }[] = [
  { id: "projeto", rotulo: "Projeto" },
  { id: "perfis", rotulo: "Perfis longitudinais" },
  { id: "secoes", rotulo: "Seções tipo" },
  { id: "producao", rotulo: "Produção" },
];

/** Quais contextos (activeTab) pertencem a cada ambiente. */
export const TABS_POR_AMBIENTE = {
  projeto: ["surface", "horizontal", "regions", "intersections", "drawing"],
  perfis: ["vertical"],
  secoes: ["assemblies"],
  producao: ["production"],
} as const;

export type SelecaoDesenho = { tipo: "ponto" | "linha" | "circulo"; id: string };

/** Deslocamento aplicado ao colar, em metros. */
const DESLOCAMENTO_COLAGEM = 5;

const coletarItensDesenho = (s: any, selecao: SelecaoDesenho[]) =>
  selecao
    .map((sel) => {
      const fonte =
        sel.tipo === "ponto" ? s.points3D : sel.tipo === "linha" ? s.lines3D : s.circles3D;
      const dado = (fonte || []).find((x: any) => x.id === sel.id);
      return dado ? { tipo: sel.tipo, dado: JSON.parse(JSON.stringify(dado)) } : null;
    })
    .filter(Boolean);

/** Snapshot completo do projeto: todo o estado persistente, sem lista branca. */
export const serializeProject = (state: any) => {
  const out: any = { version: "1.1", type: "Civil3DWebProject" };
  Object.keys(state).forEach((k) => {
    const v = state[k];
    if (typeof v === "function") return;
    if (TRANSIENT_STATE_KEYS.has(k)) return;
    out[k] = v;
  });
  return out;
};

/** Largura padrão das faixas de aceleração/desaceleração [m].
 *  Não herda mais a largura do ramo — o usuário troca no assistente. */
export const FAIXA_ADICIONAL_W = 3.6;



export type InteractionMode =
  | "none"
  | "draw_alignment_pi"
  | "extend_alignment"
  | "draw_alignment_curve"
  | "create_curve"
  | "create_spiral"
  | "delete_curve"
  | "delete_pi"
  | "insert_pi"
  | "join_alignments"
  | "draw_profile_pvi"
  | "extend_profile"
  | "create_profile_curve"
  | "delete_profile_curve"
  | "insert_pvi"
  | "delete_pvi"
  | "edit_pvi"
  | "draw_profile_line"
  | "select_intersection_target_main"
  | "select_intersection_target_branch"
  | "select_lane_direction"
  | "create_dimension_linear"
  | "create_dimension_aligned"
  | "create_dimension_angular"
  | "create_dimension_radius"
  | "modify_trim"
  | "modify_extend"
  | "modify_copy"
  | "modify_mirror"
  | "modify_fillet"
  | "move_dimension";

export interface MDTEdit {
  id: string;
  type: "cut" | "boundary" | "add_point" | "remove_point" | "extrapolate" | "add_line" | "remove_line" | "flip_triangle" | "clean_boundary" | "fill_holes";
  data: any;
  enabled: boolean;
}

export interface SurfaceLayer {
  id: string;
  name: string;
  surface: SurfaceDTM;
  isVisible: boolean;
  showTriangles: boolean;
  showBoundary: boolean;
  showPoints?: boolean;
  showPointElevations?: boolean;
  showMajorContours?: boolean;
  showMajorContourElevations?: boolean;
  showMinorContours?: boolean;
  showMinorContourElevations?: boolean;
  isLocked?: boolean;
  majorContourInterval?: number;
  minorContourInterval?: number;
  majorContourColor?: string;
  minorContourColor?: string;
  pointsColor?: string;
  pointSize?: number;
  pointStyle?: "circle" | "cross" | "x" | "square";
  trianglesColor?: string;
  boundaryColor?: string;
  profileColor?: string;
  profileLineStyle?: string;
  showInProfile?: boolean;
  crs?: string;
}

export interface ProductionTableItem {
  id: string;
  title: string;
  type: "alignment" | "accel" | "decel" | "nf" | "custom" | string;
  x: number;
  y: number;
  w: number;
  h: number;
  alignmentId?: string;
  customHeader?: string;
  customContent?: string;
  customTitle?: string;
  customLines?: string;
  // Font sizes in centimeters (cm) and pixels
  fontSizeCm?: number;
  headerFontSizeCm?: number;
  titleFontSizeCm?: number;
  fontSize?: number;
  headerFontSize?: number;
  titleFontSize?: number;
  // Font family and colors
  fontFamily?: string;
  textColor?: string;
  titleColor?: string;
  titleBgColor?: string;
  headerColor?: string;
  headerBgColor?: string;
  borderColor?: string;
  // Row and Column Dimensions in centimeters (cm)
  rowHeightCm?: number;
  headerRowHeightCm?: number;
  defaultColWidthCm?: number;
  columnWidthsCm?: number[];
  rowHeightsCm?: number[];
}

export interface GridStyleCfg {
  /** "NE" mostra N=/E=; "XY" mostra X=/Y= */
  labelMode: "NE" | "XY";
  textColor: string;
  fontFamily: string;
  /** altura do texto em mm de prancha (fixa no PDF, qualquer escala/folha) */
  textSizeMm: number;
  /** espaçamento da malha em metros; 0 = automático pela escala */
  spacingM: number;
  lineColor: string;
  /** espessura do traço em mm de prancha */
  lineWidthMm: number;
  layerId: string;
}

export const defaultGridStyle = (): GridStyleCfg => ({
  labelMode: "NE",
  textColor: "#0f172a",
  fontFamily: "Arial, Helvetica, sans-serif",
  textSizeMm: 2,
  spacingM: 0,
  lineColor: "#0f172a",
  lineWidthMm: 0.15,
  layerId: "",
});

export interface ComposerState {
  corridorFeatures: { corridorId: string; id: string; worldPoints: { x: number; y: number; z?: number }[] }[];
  setCorridorFeatures: (
    features: { corridorId: string; id: string; worldPoints: { x: number; y: number; z?: number }[] }[],
  ) => void;
  drawnGeometries: DrawnGeometry[];
  cadeiaDeOrigem: (
    features: { corridorId: string; id: string; worldPoints: any[] }[],
    g: { sourceCorridorId?: string; sourceFeatureId?: string },
  ) => { x: number; y: number; z?: number }[] | null;
  extractGeometryFromFeature: (
    corridorId: string,
    featureId: string,
    opts?: {
      tolerance?: number;
      linked?: boolean;
      layerId?: string;
      name?: string;
      smartSnapRadius?: boolean;
      enforceTangency?: boolean;
    },
  ) => string | null;
  /** Une as feições da mesma camada num traçado contínuo e extrai uma linha por camada. */
  extractUnifiedGeometriesByLayer: (opts?: {
    tolerance?: number;
    linked?: boolean;
    corridorId?: string;
    smartSnapRadius?: boolean;
    enforceTangency?: boolean;
  }) => string[];
  updateDrawnGeometry: (id: string, updates: Partial<DrawnGeometry>) => void;
  removeDrawnGeometry: (id: string) => void;
  refreshDrawnGeometry: (id: string) => void;
  refreshLinkedGeometries: () => void;
  drawingShowCorridors: boolean;
  setDrawingShowCorridors: (show: boolean) => void;
  drawingShowSurfaces: boolean;
  setDrawingShowSurfaces: (show: boolean) => void;
  drawingShowAlignments: boolean;
  setDrawingShowAlignments: (show: boolean) => void;

  /* BASES — pacotes de elementos do projeto (menu DRAWING). Uma base só liga
   * ou desliga a visibilidade dos elementos que lista; nunca os altera. Um
   * elemento pode pertencer a várias bases em simultâneo. */
  /* Cena da planta publicada pela PlanView (coordenadas de mundo). A Produção
   * mostra exatamente isto; nunca recalcula o desenho. Transitória. */
  planScene: any;
  setPlanScene: (scene: any) => void;

  /* Liga/desliga cada BASELINE (alinhamento) na planta 2D e na vista 3D:
   * desligar uma baseline esconde os corredores que assentam nela. Ausência =
   * ligada. Selecionar um corredor apenas o realça. */
  baselineVisibility: Record<string, boolean>;
  setBaselineVisible: (alignmentId: string, visible: boolean) => void;
  showAllBaselines: () => void;
  isolateBaseline: (alignmentId: string) => void;
  /* Visibilidade individual de cada corredor, independente da baseline. */
  corridorVisibility: Record<string, boolean>;
  setCorridorVisible: (id: string, visible: boolean) => void;
  showAllCorridors: () => void;

  bases: ProjectBase[];
  addBase: (base: Omit<ProjectBase, "id">) => void;
  updateBase: (id: string, updates: Partial<ProjectBase>) => void;
  removeBase: (id: string) => void;
  duplicateBase: (id: string) => void;
  toggleBase: (id: string) => void;
  globalCorridorFrequency: number;
  setGlobalCorridorFrequency: (freq: number) => void;
  mdtEdits: MDTEdit[];
  addMDTEdit: (edit: Omit<MDTEdit, "id" | "enabled">) => void;
  toggleMDTEdit: (id: string) => void;
  removeMDTEdit: (id: string) => void;

  surface: SurfaceDTM | null;
  surfaces: SurfaceLayer[];
  clearSurfaces: () => void;
  setSurface: (surface: SurfaceDTM | null) => void;
  addSurface: (surface: SurfaceDTM, name: string) => void;
  updateSurfaceLayer: (id: string, updates: Partial<SurfaceLayer>) => void;
  toggleSurfaceLock: (id: string) => void;
  removeSurfaceLayer: (id: string) => void;

  isLayerManagerOpen: boolean;
  setIsLayerManagerOpen: (open: boolean) => void;
  isFloatingViewerOpen: boolean;
  setIsFloatingViewerOpen: (open: boolean) => void;
  floatingViewerMode: 'plan2d' | 'plan3d' | 'profile' | 'section' | 'superelevation' | 'section_line';
  setFloatingViewerMode: (mode: 'plan2d' | 'plan3d' | 'profile' | 'section' | 'superelevation' | 'section_line') => void;
  activeSectionLineId: string | null;
  setActiveSectionLineId: (id: string | null) => void;
  layerModalForAlignment: string | null;
  setLayerModalForAlignment: (id: string | null) => void;
  layers: Layer[];
  addLayer: (layer: Layer) => void;
  updateAlignment: (alignId: string, updates: Partial<Alignment3D>) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  setAlignmentLayer: (alignId: string, layerId: string) => void;
  alignments: Alignment3D[];
  setAlignments: (alignments: Alignment3D[]) => void;
  activeAlignmentId: string | null;
  setActiveAlignmentId: (id: string | null) => void;
  removeAlignment: (id: string) => void;
  importAlignment: (alignment: Alignment3D) => void;
  toggleAlignmentLock: (id: string) => void;
  updateAlignmentPI: (alignId: string, piIndex: number, x: number, y: number, options?: { noRebuild?: boolean }) => void;
  updateActiveAlignmentPI: (piIndex: number, x: number, y: number) => void;
  removeActiveAlignmentPI: (piIndex: number) => void;
  updateActiveProfilePIV: (piIndex: number, sta: number, elev: number, l?: number | null, k?: number | null, nextElev?: number) => void;
  removeActiveProfilePIV: (piIndex: number) => void;
  updateActiveAlignmentPIRadius: (
    piIndex: number,
    radius: number | undefined,
  ) => void;
  updateActiveAlignmentPISpiral: (
    piIndex: number,
    spiralIn?: number,
    spiralOut?: number,
  ) => void;

  intersections: IntersectionData[];
  selectedIntersectionId: string | null;
  setSelectedIntersectionId: (id: string | null) => void;
  addIntersection: (intersection: IntersectionData) => void;
  /** Cria eixo + corredor + interseção num ato, a partir da principal. */
  criarGalho: (p: ParametrosGalho) => string | null;
  /** Regenera o ponto de nascimento dos galhos contra o bordo atual. */
  reancorarGalhos: () => void;
  updateIntersection: (id: string, updates: Partial<IntersectionData>, options?: { noRebuild?: boolean }) => void;
  removeIntersection: (id: string) => void;
  checkAndCreateIntersection: (
    branchAlignId: string,
    ptIndex: number,
    x: number,
    y: number,
  ) => void;
  intersectionNTs: Record<string, NarizTeoricoRec[]>;
  setIntersectionNTs: (map: Record<string, NarizTeoricoRec[]>) => void;
  ntDebug: any;
  setNtDebug: (d: any) => void;
  ntIgnorados: string[];
  toggleNtIgnorado: (key: string) => void;
  ntEscolhas: Record<string, "sim" | "nao">;
  setNtEscolha: (key: string, v: "sim" | "nao" | null) => void;
  ntTipos: Record<string, TipoNariz>;
  setNtTipo: (key: string, tipo: TipoNariz) => void;
  /** parâmetros por nariz: afastamento do bordo, comprimento do trecho girado, largura custom, estilo da ponta e tratamento */
  ntParams: Record<string, {
    offset?: number;
    /** afastamento do braço B — só nariz de cunha (dois ramos), cai em `offset` */
    offsetB?: number;
    comprimento?: number;
    larguraCustom?: number;
    estiloPonta?: "chanfro" | "arredondado" | "inclinado";
    tratamento?: "zebrado" | "canteiro" | "pavimento";
    inverterLado?: boolean;
    nomeCustom?: string;
    /** nome do alinhamento da amarração (tracejada NT → cap) */
    nomeCustomAmarra?: string;
    modoTransicao?: "continuo" | "taper" | "auto" | "uniforme";
  }>;
  setNtParam: (key: string, patch: {
    offset?: number;
    offsetB?: number;
    comprimento?: number;
    larguraCustom?: number;
    estiloPonta?: "chanfro" | "arredondado" | "inclinado";
    tratamento?: "zebrado" | "canteiro" | "pavimento";
    inverterLado?: boolean;
    nomeCustom?: string;
    /** nome do alinhamento da amarração (tracejada NT → cap) */
    nomeCustomAmarra?: string;
    modoTransicao?: "continuo" | "taper" | "auto" | "uniforme";
  }) => void;
  /** polilinhas dos bordos que geraram os NTs, por id de bordo */
  ntBordos: Record<string, { x: number; y: number }[]>;
  setNtBordos: (m: Record<string, { x: number; y: number }[]>) => void;
  /** estacas onde o refúgio deve ser aparado, por interseção (pés dos caps) */
  refugioCortes: Record<string, { sta0: number; sta1: number }>;
  setRefugioCortes: (m: Record<string, { sta0: number; sta1: number }>) => void;
  /** estaca do NARIZ FÍSICO por nariz (interseção → chave do nariz → estaca do
   *  pé do cap no eixo). É AQUI que a região do corredor tem de ser cortada —
   *  no NF, não no NT: o NF é que é a ponta de pavimento. */
  narizCortes: Record<string, Record<string, number>>;
  setNarizCortes: (m: Record<string, Record<string, number>>) => void;
  /** Reconstrói os ALINHAMENTOS DE NARIZ (um por nariz confirmado, vinculados). */
  syncNoseAlignments: () => void;
  bordoQuadro: any[];
  setBordoQuadro: (q: any[]) => void;
  ntWindowIntersectionId: string | null;
  setNtWindowIntersectionId: (id: string | null) => void;
  /** nariz a destacar ao abrir a janela (chave do nariz), limpo depois de piscar */
  ntWindowFocusKey: string | null;
  setNtWindowFocusKey: (key: string | null) => void;
  abrirNarizNaJanela: (intId: string, key: string) => void;
  rebuildIntersectionCorridors: (intId: string) => void;

  isDynamicInteraction: boolean;
  setIsDynamicInteraction: (val: boolean) => void;

  laneDirections: Record<string, "forward" | "backward">;
  toggleLaneDirection: (key: string) => void;
  setLaneDirection: (key: string, direction: "forward" | "backward") => void;

  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;
  osnapEnabled: boolean;
  setOsnapEnabled: (enabled: boolean) => void;
  osnapConfig: {
    endpoint: boolean;
    midpoint: boolean;
    center: boolean;
    intersection: boolean;
    perpendicular: boolean;
    nearest: boolean;
  };
  setOsnapConfig: (config: Partial<{ endpoint: boolean; midpoint: boolean; center: boolean; intersection: boolean; perpendicular: boolean; nearest: boolean }>) => void;
  orthoModeEnabled: boolean;
  setOrthoModeEnabled: (enabled: boolean) => void;
  tempPIs: { x: number; y: number }[];
  addTempPI: (pi: { x: number; y: number }) => void;
  setTempPIs: (pis: { x: number; y: number; radius?: number }[]) => void;
  clearTempPIs: () => void;
  commitTempAlignment: () => void;
  
  tempProfilePIVs: { sta: number; elev: number; l?: number; k?: number }[];
  addTempProfilePIV: (piv: { sta: number; elev: number; l?: number; k?: number }) => void;
  setTempProfilePIVs: (pivs: { sta: number; elev: number; l?: number; k?: number }[]) => void;
  clearTempProfilePIVs: () => void;
  commitTempProfile: () => void;
  updateActiveProfilePivLength: (index: number, length: number | undefined) => void;

  cadastre: CadastreLayer[] | null;
  setCadastre: (cadastre: CadastreLayer[] | null) => void;

  resetProject: () => void;
  loadProject: (data: any) => void;

  showSurfaceTriangles: boolean;
  setShowSurfaceTriangles: (show: boolean) => void;
  showSurfaceBoundary: boolean;
  setShowSurfaceBoundary: (show: boolean) => void;
  showCadastre: boolean;
  setShowCadastre: (show: boolean) => void;

  station: number;
  setStation: (sta: number) => void;

  profileTransform: d3.ZoomTransform;
  setProfileTransform: (transform: d3.ZoomTransform) => void;

  assemblies: Assembly[];
  addAssembly: (newAssembly?: Partial<Assembly>) => void;
  updateAssembly: (id: string, updates: Partial<Assembly>) => void;
  removeAssembly: (id: string) => void;

  selectedAssemblyId: string | null;
  setSelectedAssemblyId: (id: string | null) => void;

  updateParameter: (assemblyId: string, paramId: string, value: number) => void;

  corridors: Corridor[];
  addCorridor: (alignmentId?: string) => void;
  updateCorridor: (id: string, updates: Partial<Corridor>) => void;
  updateCorridorRegion: (corridorId: string, regionIndex: number, updates: Partial<CorridorRegion>) => void;
  removeCorridor: (id: string) => void;

  addRegion: (corridorId: string) => void;
  removeRegion: (corridorId: string, regionId: string) => void;
  updateRegion: (
    corridorId: string,
    regionId: string,
    updates: Partial<CorridorRegion>,
  ) => void;
  splitRegion: (corridorId: string, regionId: string, station: number) => void;

  planViewDimensions: { w: number; h: number };
  setPlanViewDimensions: (dim: { w: number; h: number }) => void;

  modifySelection: string[];
  setModifySelection: (selection: string[]) => void;
  modifyState: any;
  setModifyState: (state: any) => void;

  points3D: Point3D[];
  addPoint3D: (pt: Omit<Point3D, 'id'>) => void;
  removePoint3D: (id: string) => void;
  clearPoints3D: () => void;
  updatePoint3D: (id: string, updates: Partial<Point3D>) => void;

  lines3D: Line3D[];
  addLine3D: (line: Omit<Line3D, 'id'>) => void;
  removeLine3D: (id: string) => void;
  clearLines3D: () => void;
  updateLine3D: (id: string, updates: Partial<Line3D>) => void;

  profileLines: ProfileLine[];
  addProfileLine: (line: Omit<ProfileLine, 'id'>) => void;
  removeProfileLine: (id: string) => void;
  updateProfileLine: (id: string, updates: Partial<ProfileLine>) => void;

  pendingProfileLineStart: {sta: number, elev: number} | null;
  setPendingProfileLineStart: (pt: {sta: number, elev: number} | null) => void;

  circles3D: Circle3D[];
  addCircle3D: (circle: Omit<Circle3D, 'id'>) => void;
  removeCircle3D: (id: string) => void;
  clearCircles3D: () => void;
  updateCircle3D: (id: string, updates: Partial<Circle3D>) => void;

  dimensions: Dimension[];
  addDimension: (dimension: Omit<Dimension, 'id'>) => void;
  removeDimension: (id: string) => void;
  updateDimension: (id: string, updates: Partial<Dimension>) => void;
  clearDimensions: () => void;

  planView2DTransform: { scale: number; dx: number; dy: number };
  hasAutoFitPlanView: boolean;
  setHasAutoFitPlanView: (hasFit: boolean) => void;
  setPlanView2DTransform: (
    transform:
      | { scale: number; dx: number; dy: number }
      | ((prev: { scale: number; dx: number; dy: number }) => {
          scale: number;
          dx: number;
          dy: number;
        }),
  ) => void;
  planView3DCamera: any;
  setPlanView3DCamera: (camera: any) => void;

  // Real-time calculated rendering lists based on current station and active assembly
  computedPoints: Record<string, { x: number; y: number; label?: string }>;
  activeLinks: C3DLink[];

  activeTab:
    | "assemblies"
    | "regions"
    | "surface"
    | "horizontal"
    | "vertical"
    | "intersections"
    | "production"
    | "drawing";
  setActiveTab: (
    tab:
      | "assemblies"
      | "regions"
      | "surface"
      | "horizontal"
      | "vertical"
      | "intersections"
      | "production"
      | "drawing",
  ) => void;

  /* Ambiente de trabalho: a divisão de primeiro nível do app. Fica ACIMA de
   * activeTab — que continua sendo o contexto fino dentro do ambiente Projeto e
   * segue governando o comportamento do PlanView. */
  ambiente: Ambiente;
  setAmbiente: (a: Ambiente) => void;

  nomeProjeto: string;
  setNomeProjeto: (nome: string) => void;

  /* Zoom da planta acionado de fora do PlanView (menu ZOOM da barra superior). */
  planFitTrigger: number;
  pedirEnquadramentoPlanta: () => void;
  zoomJanelaAtivo: boolean;
  setZoomJanelaAtivo: (ativo: boolean) => void;
  historicoZoom: { scale: number; dx: number; dy: number }[];
  empilharZoom: () => void;
  zoomAnterior: () => void;

  /* Seleção e área de transferência dos elementos de desenho (ambiente Projeto,
   * contexto Drawing). Só pontos, linhas e círculos 3D — não toca em geometria
   * de projeto, que tem regras próprias de edição. */
  selecaoDesenho: SelecaoDesenho[];
  alternarSelecaoDesenho: (item: SelecaoDesenho, acumular?: boolean) => void;
  limparSelecaoDesenho: () => void;
  areaTransferencia: { itens: any[]; corte: boolean } | null;
  copiarSelecaoDesenho: () => void;
  cortarSelecaoDesenho: () => void;
  colarAreaTransferencia: () => void;
  excluirSelecaoDesenho: () => void;

  editingIntersectionId: string | null;
  setEditingIntersectionId: (id: string | null) => void;

  selectedElementId: string | null;
  setSelectedElementId: (id: string | null) => void;

  selectedCorridorId: string | null;
  setSelectedCorridorId: (id: string | null) => void;

  extractFeatureLine: (corridorId: string, featureId: string) => string | undefined;

  selectedRegionId: string | null;
  setSelectedRegionId: (id: string | null) => void;

  pendingPointAdd: {
    x: number;
    y: number;
    defaultZ: number;
    screenX: number;
    screenY: number;
  } | null;
  setPendingPointAdd: (
    pt: {
      x: number;
      y: number;
      defaultZ: number;
      screenX: number;
      screenY: number;
    } | null,
  ) => void;

  pendingExtendOffset: boolean;
  setPendingExtendOffset: (show: boolean) => void;

  pendingCleanBoundary: boolean;
  setPendingCleanBoundary: (show: boolean) => void;

  mdtEditMode:
    | "none"
    | "cut"
    | "add_point"
    | "remove_point"
    | "extrapolate"
    | "remove_line"
    | "add_line"
    | "flip_triangle"
    | "fill_holes"
    | "clean_boundary"
    | "create_point_3d"
    | "create_line_3d"
    | "create_circle_3d"
    | "boundary";
  setMdtEditMode: (
    mode:
      | "none"
      | "cut"
      | "add_point"
      | "remove_point"
      | "extrapolate"
      | "remove_line"
      | "add_line"
      | "flip_triangle"
      | "create_point_3d"
      | "create_line_3d"
      | "create_circle_3d"
      | "fill_holes"
      | "clean_boundary"
      | "boundary",
  ) => void;

  triggerSurfaceUpdate: () => void;
  fillBoundaryHoles: () => void;

  planMode: boolean;
  setPlanMode: (mode: boolean) => void;
  
  plan3DMode: boolean;
  setPlan3DMode: (mode: boolean) => void;
  
  sectionMode: boolean;
  setSectionMode: (mode: boolean) => void;

  profileMode: boolean;
  setProfileMode: (mode: boolean) => void;
  productionActiveAlignment: string | null;
  setProductionActiveAlignment: (id: string | null) => void;
  productionConfigs: Record<string, any>;
  loadProductionConfig: (alignmentId: string, layout: string) => void;
  setProductionConfig: (alignmentId: string, layout: string, config: any) => void;

  productionMode: boolean;
  setProductionMode: (mode: boolean) => void;

  productionLayout: string;
  setProductionLayout: (layout: string) => void;
  /* CADERNOS — grupos de layouts. Cada layout guarda folha, orientação, escala
   * e a lista de janelas que o compõem; productionLayout passa a ser o id do
   * layout ativo (a configuração de cada layout é gravada em productionConfigs). */
  productionCadernos: any[];
  setProductionCadernos: (cadernos: any[]) => void;
  productionCadernoAtivo: string | null;
  setProductionCadernoAtivo: (id: string | null) => void;
  productionScale: string;
  setProductionScale: (scale: string) => void;
  productionNorth: string;
  setProductionNorth: (north: string) => void;
  productionGrid: string;
  setProductionGrid: (grid: string) => void;
  productionSheetSize: string;
  setProductionSheetSize: (size: string) => void;
  productionSheetOrientation: "Landscape" | "Portrait";
  setProductionSheetOrientation: (orientation: "Landscape" | "Portrait") => void;
  productionTable: boolean;
  setProductionTable: (table: boolean) => void;
  productionTables: ProductionTableItem[];
  addProductionTable: (table?: Partial<ProductionTableItem>) => void;
  removeProductionTable: (id: string) => void;
  updateProductionTable: (id: string, updates: Partial<ProductionTableItem>) => void;
  setProductionTables: (tables: ProductionTableItem[]) => void;
  productionBaseAlignment: string;
  setProductionBaseAlignment: (val: string) => void;
  productionBaseProfile: string;
  setProductionBaseProfile: (val: string) => void;
  productionTitleBlock: string;
  setProductionTitleBlock: (val: string) => void;
  productionSelectedViewport: number | string | null;
  setProductionSelectedViewport: (val: number | string | null) => void;
  productionViewportCategories: string[];
  setProductionViewportCategory: (index: number, val: string) => void;
  productionViewportScales: string[];
  setProductionViewportScale: (index: number, val: string) => void;
  productionViewportNorths: string[];
  setProductionViewportNorth: (index: number, val: string) => void;
  productionViewportGrids: string[];
  setProductionViewportGrid: (index: number, val: string) => void;
  /* BASES por viewport (a Produção lê as bases criadas no DRAWING e nunca
   * altera o projeto). Lista vazia = desenha tudo, como até aqui. */
  productionViewportBases: string[][];
  setProductionViewportBases: (index: number, baseIds: string[]) => void;
  productionGridStyles: GridStyleCfg[];
  setProductionGridStyle: (index: number, updates: Partial<GridStyleCfg>) => void;
  productionViewportBaseAlignments: string[];
  setProductionViewportBaseAlignment: (index: number, val: string) => void;
  /** Moldura de cada janela da folha: chave = índice do viewport, "carimbo" ou id da tabela. */
  productionFrames: Record<string, { widthMm: number; color: string; style: "solid" | "dashed" | "none" }>;
  setProductionFrame: (key: string, patch: Partial<{ widthMm: number; color: string; style: "solid" | "dashed" | "none" }>) => void;
  productionViewportBaseProfiles: string[];
  setProductionViewportBaseProfile: (index: number, val: string) => void;
  productionViewportProfileBands: any[][];
  setProductionViewportProfileBands: (index: number, val: any[]) => void;
  productionViewportAssemblies: string[];
  setProductionViewportAssembly: (index: number, val: string) => void;
  productionViewportCorridors: string[];
  setProductionViewportCorridor: (index: number, val: string) => void;
  productionViewportSizes: Record<string, {w: number, h: number}>;
  setProductionViewportSizes: (sizes: Record<string, {w: number, h: number}>) => void;
  productionViewportPositions: Record<string, {x: number, y: number}>;
  setProductionViewportPositions: (positions: Record<string, {x: number, y: number}>) => void;
  productionCrossSectionInterval: number;
  setProductionCrossSectionInterval: (val: number) => void;
  productionCrossSectionIncludeKeyPoints: boolean;
  setProductionCrossSectionIncludeKeyPoints: (val: boolean) => void;
  productionCrossSectionIncludeProfileKeyPoints: boolean;
  setProductionCrossSectionIncludeProfileKeyPoints: (val: boolean) => void;
  productionZoom: number;
  setProductionZoom: (val: number) => void;
  productionPan: { x: number, y: number };

  productionCarimboElements: Record<string, boolean>;
  setProductionCarimboElements: (updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  productionCarimboTextValues: Record<string, string>;
  setProductionCarimboTextValues: (updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  productionCarimboTheme: "cad" | "sheet";
  setProductionCarimboTheme: (theme: "cad" | "sheet") => void;
  productionShowCarimboDimensions: boolean;
  setProductionShowCarimboDimensions: (updater: boolean | ((prev: boolean) => boolean)) => void;
  productionCarimboCustomImages: Record<string, string>;
  setProductionCarimboCustomImages: (updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  productionCarimboDimensions: Record<string, number>;
  setProductionCarimboDimensions: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  productionCarimboTextStyle: typeof DEFAULT_CARIMBO_TEXT_STYLE;
  setProductionCarimboTextStyle: (updater: typeof DEFAULT_CARIMBO_TEXT_STYLE | ((prev: typeof DEFAULT_CARIMBO_TEXT_STYLE) => typeof DEFAULT_CARIMBO_TEXT_STYLE)) => void;

  setProductionPan: (val: { x: number, y: number }) => void;

  dynamicCursor: boolean;
  setDynamicCursor: (enabled: boolean) => void;

  showAlignmentEditor: boolean;
  setShowAlignmentEditor: (show: boolean) => void;
  recomputeGeometry: () => void;
}

const INITIAL_PARAMS: Parameter[] = [
  { id: "p_width", name: "LaneWidth", type: "Double", value: 3.6 },
  { id: "p_slope", name: "CrossSlope", type: "Double", value: -2.0 },
  { id: "p_depth", name: "PaveDepth", type: "Double", value: 0.5 },
  { id: "p_shoulder", name: "ShoulderWidth", type: "Double", value: 1.5 },
];

const INITIAL_POINTS: C3DPoint[] = [
  { id: "P1", referenceId: null, dx: "0", dy: "0" },
  {
    id: "P2",
    referenceId: "P1",
    dx: "LaneWidth",
    dy: "LaneWidth * ((typeof SE_Right !== 'undefined' ? SE_Right : CrossSlope) / 100)",
  },
  { id: "P3", referenceId: "P2", dx: "0", dy: "-PaveDepth" },
  { id: "P4", referenceId: "P1", dx: "0", dy: "-PaveDepth" },
  {
    id: "P5",
    referenceId: "P2",
    dx: "ShoulderWidth",
    dy: "ShoulderWidth * -0.05",
  },
  { id: "P6", referenceId: "P5", dx: "1", dy: "EG_Z - P5_Y" }, // Simulate daylight to EG
];

const INITIAL_LINKS: C3DLink[] = [
  { id: "L1", p1: "P1", p2: "P2", type: "Pista" },
  { id: "L2", p1: "P2", p2: "P3", type: "Base" },
  { id: "L3", p1: "P3", p2: "P4", type: "Base" },
  { id: "L4", p1: "P4", p2: "P1", type: "Base" },
  { id: "L5", p1: "P2", p2: "P5", type: "Acostamento" },
  { id: "L6", p1: "P5", p2: "P6", type: "Talude" },
];

const DEFAULT_ASSEMBLIES: Assembly[] = [
  {
    id: "a1",
    name: "Pista Simples + Acostamento",
    parameters: [],
    points: [],
    links: [],
    components: [
      {
        id: "c_faixa_esq",
        type: "Pista",
        side: "Left",
        params: { width: 3.6, slope: -2 },
        layers: {
          revestimento: [{ id: "rev-1", name: "Revestimento", thickness: 0.05 }],
          base: [{ id: "base-1", name: "Base", thickness: 0.15 }],
          subBase: [{ id: "sub-1", name: "Sub-base", thickness: 0.2 }],
          cftCorte: 0,
          cftAterro: 0,
          limpeza: 0
        }
      },
      {
        id: "c_acost_esq",
        type: "Acostamento",
        side: "Left",
        params: { width: 2.5, slope: -5 },
        layers: {
          revestimento: [{ id: "rev-1", name: "Revestimento", thickness: 0.05 }],
          base: [{ id: "base-1", name: "Base", thickness: 0.15 }],
          subBase: [{ id: "sub-1", name: "Sub-base", thickness: 0.2 }],
          cftCorte: 0,
          cftAterro: 0,
          limpeza: 0
        }
      },
      {
        id: "c_sarj_esq",
        type: "Sarjeta",
        side: "Left",
        params: { shape: "Triangular", width: 1.0, depth: 0.25, bottomWidth: 0.3, thickness: 0.1 }
      },
      {
        id: "c_talude_esq",
        type: "Talude",
        side: "Left",
        params: { cutSlope: 1.5, fillSlope: 1.5, maxDrop: 5, benchWidth: 2, benchSlope: -5 }
      },
      {
        id: "c_faixa_dir",
        type: "Pista",
        side: "Right",
        params: { width: 3.6, slope: -2 },
        layers: {
          revestimento: [{ id: "rev-1", name: "Revestimento", thickness: 0.05 }],
          base: [{ id: "base-1", name: "Base", thickness: 0.15 }],
          subBase: [{ id: "sub-1", name: "Sub-base", thickness: 0.2 }],
          cftCorte: 0,
          cftAterro: 0,
          limpeza: 0
        }
      },
      {
        id: "c_acost_dir",
        type: "Acostamento",
        side: "Right",
        params: { width: 2.5, slope: -5 },
        layers: {
          revestimento: [{ id: "rev-1", name: "Revestimento", thickness: 0.05 }],
          base: [{ id: "base-1", name: "Base", thickness: 0.15 }],
          subBase: [{ id: "sub-1", name: "Sub-base", thickness: 0.2 }],
          cftCorte: 0,
          cftAterro: 0,
          limpeza: 0
        }
      },
      {
        id: "c_sarj_dir",
        type: "Sarjeta",
        side: "Right",
        params: { shape: "Triangular", width: 1.0, depth: 0.25, bottomWidth: 0.3, thickness: 0.1 }
      },
      {
        id: "c_talude_dir",
        type: "Talude",
        side: "Right",
        params: { cutSlope: 1.5, fillSlope: 1.5, maxDrop: 5, benchWidth: 2, benchSlope: -5 }
      }
    ],
    etwPointIds: ["P2"],
  },
  {
    id: "a4",
    name: "Quadrante Interseção (Bordo)",
    parameters: [
      { id: "p_width", name: "PistaW", type: "Double", value: 1.11 },
      { id: "p_slope", name: "PistaSlope", type: "Double", value: -2.0 },
      { id: "p_cal", name: "CalcadaW", type: "Double", value: 2.0 },
      { id: "p_mf", name: "MeioFioH", type: "Double", value: 0.15 },
    ],
    points: [],
    links: [],
    components: [
      {
        id: "c_faixa_esq",
        type: "Pista",
        side: "Left",
        params: { width: 3.6, slope: -2 },
        layers: {
          revestimento: [{ id: "rev-1", name: "Revestimento", thickness: 0.05 }],
          base: [{ id: "base-1", name: "Base", thickness: 0.25 }],
          subBase: [{ id: "sub-1", name: "Sub-base", thickness: 0.2 }],
          cftCorte: 0,
          cftAterro: 0,
          limpeza: 0
        }
      },
      {
        id: "c_sarjeta_dir",
        type: "Sarjeta",
        side: "Right",
        params: { shape: "Triangular", width: 1.0, depth: 0.25, bottomWidth: 0.3, thickness: 0.1 }
      }
    ]
  },
];

const DEFAULT_CORRIDORS: Corridor[] = [];

export function evaluateAssembly(
  station: number,
  activeAssembly: Assembly,
  surface: SurfaceDTM | null,
  alignment: Alignment3D | null,
  parameterOverrides?: Record<string, number>,
): { points: Record<string, { x: number; y: number; label?: string }>; links: C3DLink[] } {
  const context: Record<string, number> = {};
  activeAssembly.parameters.forEach((p) => {
    context[p.name] =
      parameterOverrides && parameterOverrides[p.name] !== undefined
        ? parameterOverrides[p.name]
        : p.value;
  });
  if (parameterOverrides) {
    for (const key in parameterOverrides) {
      if (!(key in context)) {
        context[key] = parameterOverrides[key];
      }
    }
  }

  // Calculate actual position of corridor axis on Earth/DTM
  const worldPt = alignment
    ? alignment.getPointAtStation(station)
    : { x: station, y: 0 };
  const realEG = surface ? surface.getElevation(worldPt.x, worldPt.y) : null;

  // Real or Fallback logic for Profile Generation
  const egOffset = realEG !== null ? realEG : 0;
  const fg =
    alignment && alignment.profile.length > 0
      ? alignment.getElevationAtStation(station)
      : 0;

  context["STA"] = station;
  context["EG_Z"] =
    parameterOverrides && parameterOverrides["EG_Z"] !== undefined
      ? parameterOverrides["EG_Z"]
      : egOffset - fg;
  context["FG_Z"] = 0;

  const computed: Record<string, { x: number; y: number; label?: string }> = {
    Origin: { x: 0, y: 0 }
  };

  let finalLinks = (activeAssembly.components && activeAssembly.components.length > 0) ? [] : activeAssembly.links;

  if (activeAssembly.jsFunctionBody) {
    try {
      const bodyToRun = activeAssembly.jsFunctionBody
        .replace(/^```[a-z]*\n?/im, "")
        .replace(/```$/m, "");
      const varsToInject = Object.keys(context).filter((v) => {
        return !new RegExp(
          `(?:const|let|var)\\s+(?:{\\s*[^}]*\\b${v}\\b[^}]*\\s*}|\\b${v}\\b)`,
        ).test(bodyToRun);
      });
      const injectVars =
        varsToInject.length > 0
          ? `const { ${varsToInject.join(", ")} } = params;\n`
          : "";
      const dynamicFn = new Function("params", injectVars + bodyToRun);

      // Target and Surface integration
      context["TargetX"] = 0; // Or passed target
      context["targetX"] = 0;
      context["SurfaceY"] = context["EG_Z"];
      context["surfaceY"] = context["EG_Z"];

      const result = dynamicFn(context);
      if (result && result.points) {
        result.points.forEach((p: any) => {
          if (p.id) computed[p.id] = { x: p.x, y: p.y };
        });
      }
      if (result && result.links) {
        finalLinks = result.links.map((l: any) => ({
          id: l.id || `${l.p1 || l.start}-${l.p2 || l.end}`,
          p1: l.p1 || l.start,
          p2: l.p2 || l.end,
          type: l.type,
          offsetStyle: l.offsetStyle,
        }));
      }
    } catch (e) {
      console.error("Dynamic assembly execution failed:", e);
    }
  } else {
    if (!activeAssembly.components || activeAssembly.components.length === 0) {
      activeAssembly.points.forEach((pt) => {
        const ref = pt.referenceId ? computed[pt.referenceId] : { x: 0, y: 0 };
      const startX = ref?.x ?? 0;
      const startY = ref?.y ?? 0;

      const dx = evaluateExpression(pt.dx, context);
      const dy = evaluateExpression(pt.dy, context);

        computed[pt.id] = { x: startX + dx, y: startY + dy };
        context[`${pt.id}_X`] = computed[pt.id].x;
        context[`${pt.id}_Y`] = computed[pt.id].y;
      });
    }
  }

  if (activeAssembly.components && activeAssembly.components.length > 0) {
    const compiled = compileSubassemblies(activeAssembly.components);
    compiled.points.forEach((pt) => {
      if (pt.id === "Origin" && !pt.referenceId) return; // skip origin definition
      // If referenceId is not found, fallback to Origin if it exists, or 0,0
      let refNode = { x: 0, y: 0 };
      if (pt.referenceId && computed[pt.referenceId]) {
        refNode = computed[pt.referenceId];
      } else if (computed["Origin"]) {
        refNode = computed["Origin"];
      }

      let dxNum = evaluateExpression(pt.dx, context);
      let dyNum = evaluateExpression(pt.dy, context);
      
      let intermediatePoints: {id: string, x: number, y: number}[] = [];
      let intermediateLinks: {id: string, p1: string, p2: string, type: string}[] = [];

      if (pt.targetSurface && surface) {
        const orient = alignment
          ? alignment.getOrientationAtStation(station)
          : { nx: 0, ny: 1, tx: 1, ty: 0 };
          
        const sign = pt.side === 'Left' ? -1 : 1;
        const cut = pt.cutSlope ?? 1.5;
        const fill = pt.fillSlope ?? 1.5;
        const maxDrop = pt.maxDrop ?? 5;
        const benchWidth = pt.benchWidth ?? 2;
        const benchSlope = pt.benchSlope ?? -5;
        
        let isCut = false;
        const rX_init = worldPt.x + orient.nx * (refNode.x);
        const rY_init = worldPt.y + orient.ny * (refNode.x);
        const elev_init = surface.getElevation(rX_init, rY_init);
        if (elev_init !== null) {
            isCut = (elev_init - fg) > refNode.y;
        } else {
            isCut = true; 
        }
        
        const slope = isCut ? cut : fill;

        for (let d = 0; d < 100; d += 0.2) {
          const checkDx = sign * d;
          const rX = worldPt.x + orient.nx * (refNode.x + checkDx);
          const rY = worldPt.y + orient.ny * (refNode.x + checkDx);
          const elev = surface.getElevation(rX, rY);
          
          if (elev !== null) {
            const surfaceRelY = elev - fg;
            
            let rayY = 0;
            let tempD = 0;
            let tempY = 0;
            let tempIsBench = false;
            
            while (true) {
                let currentBenchSlope = isCut ? benchSlope : -benchSlope;
                let segmentDx = tempIsBench ? benchWidth : (maxDrop * slope);
                let segmentDy = tempIsBench ? (benchWidth * currentBenchSlope / 100) : (isCut ? maxDrop : -maxDrop);
                
                if (d <= tempD + segmentDx) {
                    let fraction = segmentDx > 0 ? (d - tempD) / segmentDx : 0;
                    rayY = tempY + segmentDy * fraction;
                    break;
                }
                tempD += segmentDx;
                tempY += segmentDy;
                tempIsBench = !tempIsBench;
            }
            
            rayY += refNode.y;
            
            if ((isCut && rayY >= surfaceRelY) || (!isCut && rayY <= surfaceRelY)) {
               dxNum = checkDx;
               dyNum = surfaceRelY - refNode.y;
               
               let finalD = d;
               tempD = 0;
               tempY = 0;
               tempIsBench = false;
               
               let pathPoints: {dx: number, dy: number, type: string}[] = [];
               while (true) {
                   let currentBenchSlope = isCut ? benchSlope : -benchSlope;
                   let segmentDx = tempIsBench ? benchWidth : (maxDrop * slope);
                   let segmentDy = tempIsBench ? (benchWidth * currentBenchSlope / 100) : (isCut ? maxDrop : -maxDrop);
                   
                   if (finalD <= tempD + segmentDx) {
                       break;
                    }
                   let currentType = tempIsBench ? 'Banqueta' : (isCut ? 'Corte' : 'Aterro');
                   tempD += segmentDx;
                   tempY += segmentDy;
                   pathPoints.push({dx: tempD * sign, dy: tempY, type: currentType});
                   tempIsBench = !tempIsBench;
               }
               
               let lastPtId = pt.referenceId || "Origin";
               pathPoints.forEach((pp, i) => {
                   let stateSuffix = isCut ? "_cut" : "_fill";
                   let newPtId = pt.id + stateSuffix + "_bench_" + i;
                   intermediatePoints.push({
                       id: newPtId,
                       x: refNode.x + pp.dx,
                       y: refNode.y + pp.dy
                   });
                   intermediateLinks.push({
                       id: pt.id + stateSuffix + "_link_" + i,
                       p1: lastPtId,
                       p2: newPtId,
                       type: pp.type
                   });
                   lastPtId = newPtId;
               });
               
                                  let stateSuffix = isCut ? "_cut" : "_fill";
                   intermediateLinks.push({
                   id: pt.id + stateSuffix + "_link_final_" + pathPoints.length,
                   p1: lastPtId,
                   p2: pt.id,
                   type: tempIsBench ? 'Banqueta' : (isCut ? 'Corte' : 'Aterro')
               });
               
               break;
            }
          }
        }
      }

      computed[pt.id] = { x: refNode.x + dxNum, y: refNode.y + dyNum, label: pt.label };
      context[`${pt.id}_X`] = computed[pt.id].x;
      context[`${pt.id}_Y`] = computed[pt.id].y;
      
      intermediatePoints.forEach(ip => {
          computed[ip.id] = { x: ip.x, y: ip.y };
          context[`${ip.id}_X`] = ip.x;
          context[`${ip.id}_Y`] = ip.y;
      });
      
      if (intermediateLinks.length > 0) {
          compiled.links = compiled.links.filter(l => !(l.p1 === pt.referenceId && l.p2 === pt.id));
          compiled.links = compiled.links.concat(intermediateLinks);
      }
    });
    finalLinks = finalLinks.concat(compiled.links);
  }

  return { points: computed, links: finalLinks };
}

export function evaluateAssemblyAtStation(
  station: number,
  assemblies: Assembly[],
  corridors: Corridor[],
  surface: SurfaceDTM | null,
  alignments: Alignment3D[],
  alignmentId?: string | null,
  regionId?: string | null,
): {
  points: Record<string, { x: number; y: number; label?: string }>;
  links: C3DLink[];
  assembly: Assembly;
} | null {
  for (const corridor of corridors) {
    if (alignmentId && corridor.alignmentId !== alignmentId) continue;

    let activeRegion = null;
    if (regionId) {
      activeRegion = corridor.regions.find((r) => r.id === regionId);
    } else {
      activeRegion = corridor.regions.find(
        (r) => station >= r.startStation && station <= r.endStation,
      );
    }
    if (!activeRegion) continue;

    const activeAssembly = assemblies.find(
      (a) => a.id === activeRegion.assemblyId,
    );
    if (!activeAssembly) continue;

    const alignment =
      alignments.find((a) => a.id === corridor.alignmentId) || null;

    let overrides: Record<string, number> = {};
    let islandOffsetTx: number | null = null;
    
    if (alignment) {
      const rayStart = alignment.getPointAtStation(station);
      const { nx, ny } = alignment.getOrientationAtStation(station);

      /* clamp=true: o alvo vale só onde a polilinha REALMENTE passa. Sem isso a
         primeira e a última corda são prolongadas ±1000 m, e um alvo curto (o
         nariz) passaria a valer em toda a interseção. */
      const findTargetIntersection = (targetAlignIdsStr: string, requiredSign?: number, clamp = false) => {
        const targetAlignIds = targetAlignIdsStr.split(",");
        let minAbsT = Infinity;
        let targetT = 0;
        for (const targetAlignId of targetAlignIds) {
          const targetAlign = alignments.find(
            (a) => a.id === targetAlignId.trim(),
          );
          if (targetAlign && targetAlign.points.length > 1) {
            let maxSearchDist = Math.min(300, minAbsT);
            for (let i = 0; i < targetAlign.points.length - 1; i++) {
              const p1 = targetAlign.points[i];
              const p2 = targetAlign.points[i + 1];

              // Fast bounding box rejection relative to rayStart
              const dx1 = p1.x - rayStart.x;
              const dx2 = p2.x - rayStart.x;
              if ((dx1 > maxSearchDist && dx2 > maxSearchDist) || (dx1 < -maxSearchDist && dx2 < -maxSearchDist)) continue;

              const dy1 = p1.y - rayStart.y;
              const dy2 = p2.y - rayStart.y;
              if ((dy1 > maxSearchDist && dy2 > maxSearchDist) || (dy1 < -maxSearchDist && dy2 < -maxSearchDist)) continue;

              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const det = nx * dy - ny * dx;
              if (Math.abs(det) > 0.0001) {
                const u = (nx * (rayStart.y - p1.y) - ny * (rayStart.x - p1.x)) / det;
                const minU = (!clamp && i === 0) ? -1000 : -1e-5;
                const maxU = (!clamp && i === targetAlign.points.length - 2) ? 1000 : 1 + 1e-5;
                if (u >= minU && u <= maxU) {
                  const tx = Math.abs(nx) > Math.abs(ny) ? (p1.x + u * dx - rayStart.x) / nx : (p1.y + u * dy - rayStart.y) / ny;
                  
                  let isValid = true;
                  if (activeRegion.inwardCenter) {
                    const vCenterX = activeRegion.inwardCenter.x - rayStart.x;
                    const vCenterY = activeRegion.inwardCenter.y - rayStart.y;
                    const dotCenter = nx * vCenterX + ny * vCenterY;
                    // The arc center is outward relative to the intersection center.
                    // We want to target the main road, which is inward (opposite to arc center).
                    // So tx and dotCenter MUST have opposite signs.
                    if (Math.abs(tx) > 0.01 && Math.sign(tx) === Math.sign(dotCenter)) isValid = false;
                  }

                  if (requiredSign === 1 && tx < 0.001) isValid = false;
                  if (requiredSign === -1 && tx > -0.001) isValid = false;

                  if (isValid && Math.abs(tx) >= 0 && Math.abs(tx) < minAbsT) {
                    minAbsT = Math.abs(tx);
                    targetT = tx;
                    maxSearchDist = minAbsT;
                  }
                }
              }
            }
          }
        }
        return minAbsT !== Infinity ? targetT : null;
      };


      if (activeRegion.targets || (activeRegion as any).targetsPrefer) {
        const prefer = ((activeRegion as any).targetsPrefer || {}) as Record<string, string>;
        const params = new Set([
          ...Object.keys(activeRegion.targets || {}),
          ...Object.keys(prefer),
        ]);
        for (const paramName of params) {
          /* O nariz manda enquanto a linha preta existir (clamp: sem
             prolongamento). Acabou a linha preta, o alvo volta a ser o
             alinhamento filho do bordo. */
          let targetT = prefer[paramName]
            ? findTargetIntersection(prefer[paramName], undefined, true)
            : null;
          if (targetT === null && activeRegion.targets?.[paramName]) {
            targetT = findTargetIntersection(activeRegion.targets[paramName]);
          }
          if (targetT !== null) {
            overrides[paramName] = targetT;
          }
        }
      }

      if (activeRegion.islandTargetId) {
        let reqSign = undefined;
        if (activeRegion.suppressSide === "left") reqSign = 1;
        if (activeRegion.suppressSide === "right") reqSign = -1;
        islandOffsetTx = findTargetIntersection(activeRegion.islandTargetId, reqSign);
      }
    }

    if (alignment) {
      overrides["SE_Left"] = alignment.getCrossSlope(station, "left");
      overrides["SE_Right"] = alignment.getCrossSlope(station, "right");
    }

    let result: {
      points: Record<string, { x: number; y: number; label?: string }>;
      links: C3DLink[];
      assembly?: Assembly;
    } | null = evaluateAssembly(
      station,
      activeAssembly,
      surface,
      alignment,
      overrides,
    );

    if (activeRegion.suppressSide) {
      const newPoints: Record<string, { x: number; y: number; label?: string }> = {};
      for (const pid in result!.points) {
        const p = result!.points[pid];
        if (activeRegion.suppressSide === "left" && p.x < -0.001) continue;
        if (activeRegion.suppressSide === "right" && p.x > 0.001) continue;
        newPoints[pid] = { ...p };
      }
      const newLinks = result!.links.filter(
        (l) => newPoints[l.p1] && newPoints[l.p2],
      );
      result = { points: newPoints, links: newLinks, assembly: activeAssembly };
    } else if (result !== null) {
      result = { ...result, assembly: activeAssembly };
    }

    if (result !== null && islandOffsetTx !== null && Math.abs(islandOffsetTx) > 0.001) {
      const side = islandOffsetTx > 0 ? "SE_Right" : "SE_Left";
      const slope = overrides[side] !== undefined ? overrides[side] : -2;
      const dy = Math.abs(islandOffsetTx) * (slope / 100);
      for (const pid in result.points) {
         result.points[pid].x += islandOffsetTx;
         result.points[pid].y += dy;
      }
    }

    return result as { points: Record<string, { x: number; y: number; label?: string }>; links: C3DLink[]; assembly: Assembly };
  }
  return null;
}


function mergeSurfaces(layers: SurfaceLayer[], mdtEdits: MDTEdit[] = []): SurfaceDTM | null {
  const visible = layers.filter(l => l.isVisible);
  if (visible.length === 0) return null;
  
  let merged: SurfaceDTM;
  if (visible.length === 1 && mdtEdits.length === 0) {
    return visible[0].surface; // Just return it directly to save memory!
  } else if (visible.length === 1) {
    const s = visible[0].surface;
    merged = new SurfaceDTM(new Map(), []);
    merged.vertices = new Float32Array(s.vertices);
    merged.indices = new Int32Array(s.indices);
    merged.minX = s.minX;
    merged.maxX = s.maxX;
    merged.minY = s.minY;
    merged.maxY = s.maxY;
    merged.minZ = s.minZ;
    merged.maxZ = s.maxZ;
    if (s.boundaries) {
      merged.boundaries = s.boundaries.map(poly => [...poly]);
    }
  } else {
    let totalVerts = 0;
    let totalIndices = 0;
    for (const l of visible) {
      totalVerts += l.surface.vertices.length;
      totalIndices += l.surface.indices.length;
    }
    
    const newVertices = new Float32Array(totalVerts);
    const newIndices = new Int32Array(totalIndices);
    
    let vOffset = 0;
    let iOffset = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    
    for (const l of visible) {
      const s = l.surface;
      newVertices.set(s.vertices, vOffset);
      
      const vertexCount = s.vertices.length / 3;
      const baseOffset = vOffset / 3;
      
      for (let i = 0; i < s.indices.length; i++) {
         newIndices[iOffset + i] = s.indices[i] + baseOffset;
      }
      
      vOffset += s.vertices.length;
      iOffset += s.indices.length;
      
      minX = Math.min(minX, s.minX);
      maxX = Math.max(maxX, s.maxX);
      minY = Math.min(minY, s.minY);
      maxY = Math.max(maxY, s.maxY);
      minZ = Math.min(minZ, s.minZ);
      maxZ = Math.max(maxZ, s.maxZ);
    }
    
    merged = new SurfaceDTM(new Map(), []);
    merged.vertices = newVertices;
    merged.indices = newIndices;
    merged.minX = minX;
    merged.maxX = maxX;
    merged.minY = minY;
    merged.maxY = maxY;
    merged.minZ = minZ;
    merged.maxZ = maxZ;

    for (const l of visible) {
      if (l.surface.boundaries) {
        l.surface.boundaries.forEach(poly => {
          merged.boundaries.push([...poly]);
        });
      }
    }
  }

  merged.recalculateBoundaryEdges();
  if (mdtEdits.length > 0) {
    (merged as any).buildSpatialIndex();
    for (const edit of mdtEdits) {
      if (!edit.enabled) continue;
      switch (edit.type) {
        case 'cut': merged.removeInsidePolygon(edit.data); break;
        case 'boundary': merged.cropToPolygon(edit.data); break;
        case 'add_point': merged.addPoint(edit.data.x, edit.data.y, edit.data.z); break;
        case 'remove_point': merged.removePoint(edit.data.x, edit.data.y); break;
        case 'extrapolate': merged.extrapolateLine(edit.data); break;
        case 'add_line': merged.forceAddLineXY(edit.data.p1.x, edit.data.p1.y, edit.data.p2.x, edit.data.p2.y); break;
        case 'remove_line': merged.removeTrianglesByLine(edit.data.p1.x, edit.data.p1.y, edit.data.p2.x, edit.data.p2.y); break;
        case 'flip_triangle': merged.flipEdge(edit.data.x, edit.data.y); break;
        case 'clean_boundary': merged.cleanBoundary(edit.data.maxLength); break;
        case 'fill_holes': merged.fillHoleAtPoint(edit.data.x, edit.data.y); break;
      }
    }
  } else {
    (merged as any).buildSpatialIndex();
  }
  
  return merged;
}

/* Confirmar um nariz (ou mexer nos seus parâmetros) reconstrói o corredor das
 * interseções que o contêm — o alvo do nariz é criado/atualizado ali. Coalesce
 * em 120 ms para não reconstruir a cada tecla nos campos numéricos. */
let __narizRebuildTimer: any = null;
const agendarRebuildNariz = (get: any, key: string) => {
  if (__narizRebuildTimer) clearTimeout(__narizRebuildTimer);
  __narizRebuildTimer = setTimeout(() => {
    __narizRebuildTimer = null;
    const s = get();
    const ids = Object.entries((s.intersectionNTs || {}) as Record<string, any[]>)
      .filter(([, nts]) => (nts || []).some(
        (nt: any) => narizKey(nt) === key,
      ))
      .map(([id]) => id);
    if (!ids.length) return;
    ids.forEach((id) => s.rebuildIntersectionCorridors(id));
    s.recomputeGeometry?.();
    s.syncNoseAlignments?.();
  }, 120);
};

/* Os alinhamentos de nariz são vinculados: qualquer coisa que mova a geometria
 * do nariz (bordos do corredor, confirmação, parâmetros) os reconstrói. Junta
 * as rajadas num só passe. */
let __narizAlignTimer: any = null;
/** último hash de ntBordos publicado — corta a repetição na origem */
let __ntBordosHash: number | null = null;
/** última assinatura sincronizada dos alinhamentos de nariz */
let __narizAlignSig: string | null = null;
/** quantos alinhamentos de nariz aquela assinatura produziu */
let __narizAlignN = -1;
const agendarSyncNarizAligns = (get: any) => {
  if (__narizAlignTimer) clearTimeout(__narizAlignTimer);
  __narizAlignTimer = setTimeout(() => {
    __narizAlignTimer = null;
    get().syncNoseAlignments?.();
  }, 180);
};

function rebuildDynamicOffsets(alignments: Alignment3D[]): Alignment3D[] {
  const newAlignments = [...alignments];
  for (let i = 0; i < newAlignments.length; i++) {
    const align = newAlignments[i];
    if (align.parentId && align.offsetValue !== undefined && !align.isManuallyEdited) {
       const parent = newAlignments.find(a => a.id === align.parentId);
       if (parent) {
          const rebuilt = createOffsetAlignment(parent, align.offsetValue, align.name);
          rebuilt.id = align.id;
          rebuilt.parentId = align.parentId;
          rebuilt.offsetValue = align.offsetValue;
          rebuilt.color = align.color;
          rebuilt.layerId = align.layerId;
          rebuilt.isHidden = align.isHidden;
          rebuilt.isLocked = align.isLocked;
          rebuilt.profileName = align.profileName;
          rebuilt.profileColor = align.profileColor;
          rebuilt.isProfileHidden = align.isProfileHidden;
          newAlignments[i] = rebuilt;
       }
    }
  }

  return newAlignments;
}

let pendingHistoryTimer: ReturnType<typeof setTimeout> | null = null;
let savedPastState: any = null;
let savedReplace: any = undefined;
let savedCurrentState: any = null;
let savedDeltaState: any = null;
let savedHandleSetFn: any = null;

export const useStore = create<ComposerState>()(
  temporal((set, get) => ({
  mdtEdits: [],
  addMDTEdit: (edit) => {
    set((state) => {
      const newEdits = [...state.mdtEdits, { ...edit, id: Date.now().toString() + Math.random().toString(), enabled: true }];
      return { 
        mdtEdits: newEdits,
        surface: mergeSurfaces(state.surfaces, newEdits)
      };
    });
    get().recomputeGeometry();
  },
  toggleMDTEdit: (id) => {
    set((state) => {
      const newEdits = state.mdtEdits.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e);
      return { 
        mdtEdits: newEdits,
        surface: mergeSurfaces(state.surfaces, newEdits)
      };
    });
    get().recomputeGeometry();
  },
  removeMDTEdit: (id) => {
    set((state) => {
      const newEdits = state.mdtEdits.filter(e => e.id !== id);
      return { 
        mdtEdits: newEdits,
        surface: mergeSurfaces(state.surfaces, newEdits)
      };
    });
    get().recomputeGeometry();
  },
  surfaces: [],
  surface: null,
  clearSurfaces: () => {
    set({ surfaces: [], surface: null });
    get().recomputeGeometry();
  },
  setSurface: (surface) => {
    set({ surface });
    get().recomputeGeometry();
  },
  addSurface: (surface, name: string) => {
    set((state) => {
      const newSurfaces = [
        ...state.surfaces,
        {
          id: `surface-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name,
          surface: surface,
          isVisible: true,
          showTriangles: true,
          showBoundary: true,
        },
      ];
      return { 
        surfaces: newSurfaces,
        surface: mergeSurfaces(newSurfaces, state.mdtEdits)
      };
    });
    get().recomputeGeometry();
  },
  updateSurfaceLayer: (id: string, updates: Partial<SurfaceLayer>) => {
    set((state) => {
      const newSurfaces = state.surfaces.map(s => 
        s.id === id ? { ...s, ...updates } : s
      );
      return {
        surfaces: newSurfaces,
        surface: mergeSurfaces(newSurfaces, state.mdtEdits)
      };
    });
    get().recomputeGeometry();
  },
  toggleSurfaceLock: (id: string) => {
    set((state) => {
      const newSurfaces = state.surfaces.map(s => 
        s.id === id ? { ...s, isLocked: !s.isLocked } : s
      );
      
      const isAnyLocked = newSurfaces.some(s => s.isLocked);
      return { 
        surfaces: newSurfaces,
        ...(isAnyLocked && state.mdtEditMode !== "none" ? { mdtEditMode: "none" } : {})
      };
    });
  },
  removeSurfaceLayer: (id: string) => {
    set((state) => {
      const surface = state.surfaces.find(s => s.id === id);
      if (surface?.isLocked) return state;

      const newSurfaces = state.surfaces.filter(s => s.id !== id);
      return {
         surfaces: newSurfaces,
         surface: mergeSurfaces(newSurfaces, state.mdtEdits)
      };
    });
    get().recomputeGeometry();
  },

  isLayerManagerOpen: false,
  setIsLayerManagerOpen: (open) => set({ isLayerManagerOpen: open }),
  isFloatingViewerOpen: false,
  setIsFloatingViewerOpen: (open) => set({ isFloatingViewerOpen: open }),
  floatingViewerMode: 'plan3d',
  setFloatingViewerMode: (mode) => set({ floatingViewerMode: mode }),
  activeSectionLineId: null,
  setActiveSectionLineId: (id) => set({ activeSectionLineId: id }),
  layerModalForAlignment: null,
  setLayerModalForAlignment: (id) => set({ layerModalForAlignment: id }),
  layers: [
    { id: "layer-eixo", name: "Eixo", color: "#3b82f6", isVisible: true, isLocked: false },
    { id: "layer-auxiliar", name: "Auxiliar", color: "#a8a29e", isVisible: false, isLocked: false },
    { id: "layer-pista", name: "Pista", color: "#3f3f46", isVisible: true, isLocked: false },
    { id: "layer-acostamento", name: "Acostamento", color: "#71717a", isVisible: true, isLocked: false },
    { id: "layer-talude", name: "Talude / Grama", color: "#22c55e", isVisible: true, isLocked: false },
    { id: "layer-aterro", name: "Aterro (92)", color: "#54A53B", isVisible: true, isLocked: false },
    { id: "layer-corte", name: "Corte (241)", color: "#DF3F6A", isVisible: true, isLocked: false },
    { id: "layer-banqueta", name: "Banqueta (33)", color: "#E59E42", isVisible: true, isLocked: false },
    { id: "layer-meiofio", name: "Meio Fio / Calçada", color: "#d4d4d8", isVisible: true, isLocked: false },
    { id: NOSE_LAYER_ID, name: "Narizes Físicos", color: "#0f172a", isVisible: true, isLocked: false }
  ],
  addLayer: (layer) => set((state) => ({ layers: [...state.layers, layer] })),
  updateAlignment: (alignId, updates) => set((state) => {
    const newAlignments = [...state.alignments];
    const index = newAlignments.findIndex(a => a.id === alignId);
    if (index !== -1) {
      newAlignments[index] = { ...newAlignments[index], ...updates } as Alignment3D;
      Object.setPrototypeOf(newAlignments[index], Alignment3D.prototype);
      return { alignments: rebuildDynamicOffsets(newAlignments) };
    }
    return state;
  }),
  updateLayer: (id, updates) => set((state) => ({ layers: state.layers.map(l => l.id === id ? { ...l, ...updates } : l) })),
  removeLayer: (id) => set((state) => ({ layers: state.layers.filter(l => l.id !== id) })),
  setAlignmentLayer: (alignId, layerId) => set((state) => {
    const newAlignments = [...state.alignments];
    const index = newAlignments.findIndex(a => a.id === alignId);
    if (index !== -1) {
      newAlignments[index].layerId = layerId;
    }
    return { alignments: newAlignments };
  }),
  alignments: [],
  setAlignments: (alignments) => {
    set({ alignments: rebuildDynamicOffsets(alignments) });
    const state = get();
    state.intersections.forEach(int => state.rebuildIntersectionCorridors(int.id));
    get().recomputeGeometry();
  },
  activeAlignmentId: null,
  setActiveAlignmentId: (id) => {
    set((state) => {
      if (id === null) return { activeAlignmentId: null };

      let newAlignments = [...state.alignments];
      const alignIndex = newAlignments.findIndex((a) => a.id === id);

      if (alignIndex !== -1) {
        const align = newAlignments[alignIndex];
        // Gerar perfil automaticamente se ele não tiver um
        if (align.profile.length === 0 && align.points.length > 0) {
          const startSta = align.points[0].sta;
          const endSta = align.points[align.points.length - 1].sta;

          const startPt = align.getPointAtStation(startSta);
          const endPt = align.getPointAtStation(endSta);

          let startElev = 0;
          let endElev = 0;

          if (state.surface) {
            const surfaceStart = state.surface.getElevation(
              startPt.x,
              startPt.y,
            );
            const surfaceEnd = state.surface.getElevation(endPt.x, endPt.y);
            if (surfaceStart !== null) startElev = surfaceStart;
            if (surfaceEnd !== null) endElev = surfaceEnd;
          }

          const pivs = [
            { sta: startSta, elev: startElev },
            { sta: endSta, elev: endElev },
          ];
          const { profilePoints, keyProfilePoints } = rebuildProfileFromPIVs(pivs);

          // Necessário clonar a classe mantendo os métodos
          const newAlign = Object.assign(
            Object.create(Object.getPrototypeOf(align)),
            align,
          );
          newAlign.keyProfilePoints = keyProfilePoints;
          newAlign.profile = profilePoints;
          newAlignments[alignIndex] = newAlign;
        }
      }

      return { activeAlignmentId: id, alignments: rebuildDynamicOffsets(newAlignments) };
    });
    get().recomputeGeometry();
  },
  removeAlignment: (id) => {
    set((state) => {
      const align = state.alignments.find((a) => a.id === id);
      if (align?.isLocked) return state;

      const newAlignments = state.alignments.filter((a) => a.id !== id);
      const newActiveId =
        state.activeAlignmentId === id
          ? newAlignments.length > 0
            ? newAlignments[0].id
            : null
          : state.activeAlignmentId;

      const newCorridors = state.corridors.filter((c) => c.alignmentId !== id);

      return {
        alignments: rebuildDynamicOffsets(newAlignments),
        activeAlignmentId: newActiveId,
        corridors: newCorridors,
      };
    });
    get().recomputeGeometry();
  },
  importAlignment: (alignment: Alignment3D) => {
    set((state) => {
      let newStation = state.station;
      if (alignment && alignment.length > 0) {
        newStation = alignment.points[0].sta + alignment.length / 2;
      }

      let finalAlignment = alignment;
      if (alignment.profile.length === 0 && alignment.points.length > 0) {
        let startElev = 0,
          endElev = 0;
        if (state.surface) {
          startElev =
            state.surface.getElevation(
              alignment.points[0].x,
              alignment.points[0].y,
            ) ?? 0;
          endElev =
            state.surface.getElevation(
              alignment.points[alignment.points.length - 1].x,
              alignment.points[alignment.points.length - 1].y,
            ) ?? 0;
        }

        const pivs = [
          { sta: alignment.points[0].sta, elev: startElev },
          { sta: alignment.points[alignment.points.length - 1].sta, elev: endElev },
        ];
        const { profilePoints, keyProfilePoints } = rebuildProfileFromPIVs(pivs);

        finalAlignment = Object.assign(
          Object.create(Object.getPrototypeOf(alignment)),
          alignment,
        );
        finalAlignment.keyProfilePoints = keyProfilePoints;
        finalAlignment.profile = profilePoints;
      }

      return {
        alignments: [...state.alignments, finalAlignment],
        activeAlignmentId: finalAlignment.id,
        station: newStation,
      };
    });
    get().recomputeGeometry();
  },
  toggleAlignmentLock: (id: string) => {
    set((state) => {
      const alignIndex = state.alignments.findIndex(a => a.id === id);
      if (alignIndex === -1) return state;
      const newAligns = [...state.alignments];
      const clone = Object.assign(Object.create(Object.getPrototypeOf(newAligns[alignIndex])), newAligns[alignIndex]);
      clone.isLocked = !clone.isLocked;
      newAligns[alignIndex] = clone;
      return { alignments: newAligns };
    });
  },
  updateAlignmentPI: (alignId, piIndex, x, y, options) => {
    set((state) => {
      const alignIndex = state.alignments.findIndex(
        (a) => a.id === alignId,
      );
      if (alignIndex === -1) return state;

      const align = state.alignments[alignIndex];
      if (align.isLocked) return state;
      const newKeyPoints = [...align.keyPoints];
      if (piIndex < 0 || piIndex >= newKeyPoints.length) return state;

      const isCurvePointDrag = ["PC", "PT", "EC", "CE", "PCC", "PRC"].includes(
        newKeyPoints[piIndex].label || "",
      );

      if (!isCurvePointDrag) {
        newKeyPoints[piIndex] = { ...newKeyPoints[piIndex], x, y };
      }

      // To preserve radii during a drag, extract only PI coordinates and radii from the current structure.
      // Since newKeyPoints may include generated curve points, we filter them to purely structural PIs.
      const structPIs = newKeyPoints.filter((p) => p.pi);

      if (isCurvePointDrag) {
        // Find the associated PIV for this curve point
        const pivIndex = newKeyPoints.findIndex((p, i) => i > piIndex && p.pi);
        if (pivIndex !== -1) {
          const piv = newKeyPoints[pivIndex];
          const structIndex = structPIs.findIndex(
            (p) => p.x === piv.x && p.y === piv.y,
          );
          if (structIndex > 0 && structIndex < structPIs.length - 1) {
            const T = Math.hypot(x - piv.x, y - piv.y);
            const p1 = structPIs[structIndex - 1];
            const p2 = structPIs[structIndex];
            const p3 = structPIs[structIndex + 1];

            const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
            const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
            const ang1 = Math.atan2(v1.y, v1.x);
            const ang2 = Math.atan2(v2.y, v2.x);
            let delta = ang2 - ang1;
            while (delta > Math.PI) delta -= 2 * Math.PI;
            while (delta <= -Math.PI) delta += 2 * Math.PI;

            const halfDelta = Math.abs(delta) / 2;
            if (halfDelta > 0.001) {
              let R = T / Math.tan(halfDelta);
              // Round to multiples of 5
              R = Math.round(R / 5) * 5;
              if (R < 5) R = 5;
              structPIs[structIndex].radius = R;
            }
          }
        }
      }

      const { points, keyPoints, length } = rebuildFromPIs(
        structPIs.map((p) => ({ x: p.x, y: p.y, radius: p.radius, spiralIn: p.spiralIn, spiralOut: p.spiralOut })),
        align.points[0]?.sta || 0
      );

      let pivs = align.keyProfilePoints
        .filter((p) => ["PP", "PIV", "PF"].includes(p.label || ""))
        .map((p) => ({ sta: p.sta, elev: p.elev, l: p.l, k: p.k }));

      if (pivs.length < 2) {
        let startElev = 0, endElev = 0;
        if (state.surface) {
          startElev = state.surface.getElevation(points[0].x, points[0].y) ?? 0;
          endElev = state.surface.getElevation(points[points.length - 1].x, points[points.length - 1].y) ?? 0;
        }
        pivs = [
          { sta: points[0].sta, elev: startElev, l: undefined, k: undefined },
          { sta: points[points.length - 1].sta, elev: endElev, l: undefined, k: undefined },
        ];
      } else {
        pivs[0].sta = points[0].sta;
        // Snap the last PIV to the new alignment length
        pivs[pivs.length - 1].sta = points[points.length - 1].sta;
      }

      const { profilePoints: newProfilePoints, keyProfilePoints: newKeyProfilePoints } = rebuildProfileFromPIVs(pivs);

      const updatedAlign = new Alignment3D(
        align.name,
        length,
        points,
        newProfilePoints,
        keyPoints,
        newKeyProfilePoints,
      );
      updatedAlign.id = align.id; // preserve ID
      updatedAlign.superelevationData = align.superelevationData; // preserve superelevation data
      updatedAlign.isManuallyEdited = true;

      const newAlignments = [...state.alignments];
      newAlignments[alignIndex] = updatedAlign;

      // Update corridor regions referencing this align
      const corridors = state.corridors.map((c) => {
        if (c.alignmentId !== align.id) return c;
        if (c.regions.length === 0) return c;
        const updatedRegions = [...c.regions];
        // Extent last region to new end station
        updatedRegions[updatedRegions.length - 1] = {
          ...updatedRegions[updatedRegions.length - 1],
          endStation: length,
        };
        // For safety, clamp all regions to the new length just in case
        for (let i = 0; i < updatedRegions.length; i++) {
          if (updatedRegions[i].startStation > length) {
            updatedRegions[i].startStation = length;
          }
          if (updatedRegions[i].endStation > length) {
            updatedRegions[i].endStation = length;
          }
        }
        return { ...c, regions: updatedRegions };
      });

      return { alignments: rebuildDynamicOffsets(newAlignments), corridors };
    });

    if (!options?.noRebuild) {
      const modifiedIntersections = get().intersections.filter(i => i.branchAlignmentId === alignId || i.mainAlignmentId === alignId);
      modifiedIntersections.forEach(int => get().rebuildIntersectionCorridors(int.id));
    }

    get().recomputeGeometry();
  },
  updateActiveAlignmentPI: (piIndex, x, y) => {
    const state = get();
    if (state.activeAlignmentId) {
       state.updateAlignmentPI(state.activeAlignmentId, piIndex, x, y);
    }
  },
  removeActiveAlignmentPI: (piIndex) => {
    set((state) => {
      if (!state.activeAlignmentId) return state;
      const alignIndex = state.alignments.findIndex(
        (a) => a.id === state.activeAlignmentId,
      );
      if (alignIndex === -1) return state;

      const align = state.alignments[alignIndex];
      if (align.isLocked) return state;
      const newKeyPoints = [...align.keyPoints];
      if (piIndex < 0 || piIndex >= newKeyPoints.length) return state;

      const structPIs = newKeyPoints.filter((p) => p.pi);
      const structIndex = structPIs.findIndex(
        (p) =>
          p.x === newKeyPoints[piIndex].x && p.y === newKeyPoints[piIndex].y,
      );

      if (structIndex === -1) return state; // Point not found or not a structural PI

      // Don't remove if there are only 2 PIs (start and end)
      if (structPIs.length <= 2) return state;
      // Don't remove the first or last PI
      if (structIndex === 0 || structIndex === structPIs.length - 1) return state;

      // Remove the targeted PI
      structPIs.splice(structIndex, 1);

      const { points, keyPoints, length } = rebuildFromPIs(
        structPIs.map((p) => ({ x: p.x, y: p.y, radius: p.radius, spiralIn: p.spiralIn, spiralOut: p.spiralOut })),
        align.points[0]?.sta || 0
      );

      // Snap the last PIV to the new alignment length
      const pivs = align.keyProfilePoints
        .filter((p) => ["PP", "PIV", "PF"].includes(p.label || ""))
        .map((p) => ({ sta: p.sta, elev: p.elev, l: p.l, k: p.k }));

      if (pivs.length >= 2) {
        if (pivs[pivs.length - 1].sta > length) {
          pivs[pivs.length - 1].sta = length;
        }
      }

      const { profilePoints: newProfilePoints, keyProfilePoints: newKeyProfilePoints } = rebuildProfileFromPIVs(pivs);

      const newAlignments = [...state.alignments];
      newAlignments[alignIndex] = {
        ...align,
        points: points,
        keyPoints: keyPoints,
        length: length,
        profile: newProfilePoints,
        keyProfilePoints: newKeyProfilePoints,
      } as Alignment3D;
      Object.setPrototypeOf(newAlignments[alignIndex], Alignment3D.prototype);

      // Adjust corridors? Need to rebuild them
      const newCorridors = state.corridors.map(c => {
         if (c.alignmentId === align.id) {
             return {
                 ...c,
                 regions: c.regions.map(r => ({ ...r, endStation: Math.min(r.endStation, length) }))
             }
         }
         return c;
      });

      return { alignments: rebuildDynamicOffsets(newAlignments), corridors: newCorridors };
    });
    
    // Rebuild related intersections
    const state = get();
    if (state.activeAlignmentId) {
       const relatedInts = state.intersections.filter(
         (i) => i.branchAlignmentId === state.activeAlignmentId || i.mainAlignmentId === state.activeAlignmentId
       );
       relatedInts.forEach((int) => {
          state.rebuildIntersectionCorridors(int.id);
       });
    }

    get().recomputeGeometry();
  },
  updateActiveProfilePIV: (piIndex, sta, elev, l, k, nextElev) => {
    set((state) => {
      if (!state.activeAlignmentId) return state;
      const alignIndex = state.alignments.findIndex(
        (a) => a.id === state.activeAlignmentId,
      );
      if (alignIndex === -1) return state;

      const alg = state.alignments[alignIndex];
      if (alg.isLocked) return state;
      const pivs = alg.keyProfilePoints
        .filter((p) => ["PP", "PIV", "PF"].includes(p.label || ""))
        .map((p) => ({ sta: p.sta, elev: p.elev, l: p.l, k: p.k }));

      if (piIndex >= 0 && piIndex < pivs.length) {
        // Find existing PIV by station order (if it hasn't been resorted)
        // Note: the piIndex was originally based on the sorted order.
        let targetPiv = pivs[piIndex];
        targetPiv.sta = sta;
        targetPiv.elev = elev;
        
        if (l !== undefined) {
          if (l === null) targetPiv.l = undefined;
          else targetPiv.l = l;
        }

        if (k !== undefined) {
          if (k === null) targetPiv.k = undefined;
          else targetPiv.k = k;
          
          if (k !== null && k > 0) targetPiv.l = undefined;
        }

        if (nextElev !== undefined && piIndex + 1 < pivs.length) {
          pivs[piIndex + 1].elev = nextElev;
        }
        
        // Optional boundary sorting depending on requirements but assuming user drags gracefully
        // Or re-sort
        pivs.sort((a,b) => a.sta - b.sta);
      } else {
        return state;
      }

      const { profilePoints, keyProfilePoints } = rebuildProfileFromPIVs(pivs);

      const newAlignments = [...state.alignments];
      newAlignments[alignIndex] = {
        ...alg,
        profile: profilePoints,
        keyProfilePoints,
      } as Alignment3D;
      Object.setPrototypeOf(newAlignments[alignIndex], Alignment3D.prototype);

      return { alignments: rebuildDynamicOffsets(newAlignments) };
    });
    
    // Rebuild related intersections
    const state = get();
    if (state.activeAlignmentId) {
       const relatedInts = state.intersections.filter(
         (i) => i.branchAlignmentId === state.activeAlignmentId || i.mainAlignmentId === state.activeAlignmentId
       );
       relatedInts.forEach((int) => {
          state.rebuildIntersectionCorridors(int.id);
       });
    }
  },
  removeActiveProfilePIV: (piIndex) => {
    set((state) => {
      if (!state.activeAlignmentId) return state;
      const alignIndex = state.alignments.findIndex(
        (a) => a.id === state.activeAlignmentId,
      );
      if (alignIndex === -1) return state;

      const alg = state.alignments[alignIndex];
      if (alg.isLocked) return state;
      const pivs = alg.keyProfilePoints
        .filter((p) => ["PP", "PIV", "PF"].includes(p.label || ""))
        .map((p) => ({ sta: p.sta, elev: p.elev, l: p.l, k: p.k }));

      if (piIndex >= 0 && piIndex < pivs.length && pivs.length > 2) {
        pivs.splice(piIndex, 1);
      } else {
        return state;
      }

      const { profilePoints, keyProfilePoints } = rebuildProfileFromPIVs(pivs);

      const newAlignments = [...state.alignments];
      newAlignments[alignIndex] = {
        ...alg,
        profile: profilePoints,
        keyProfilePoints,
      } as Alignment3D;
      Object.setPrototypeOf(newAlignments[alignIndex], Alignment3D.prototype);

      return { alignments: rebuildDynamicOffsets(newAlignments) };
    });
    
    // Rebuild related intersections
    const state = get();
    if (state.activeAlignmentId) {
       const relatedInts = state.intersections.filter(
         (i) => i.branchAlignmentId === state.activeAlignmentId || i.mainAlignmentId === state.activeAlignmentId
       );
       relatedInts.forEach((int) => {
          state.rebuildIntersectionCorridors(int.id);
       });
    }
  },
  updateActiveAlignmentPIRadius: (piIndex, radius) => {
    set((state) => {
      if (!state.activeAlignmentId) return state;
      const alignIndex = state.alignments.findIndex(
        (a) => a.id === state.activeAlignmentId,
      );
      if (alignIndex === -1) return state;

      const align = state.alignments[alignIndex];
      if (align.isLocked) return state;
      const newKeyPoints = [...align.keyPoints];
      if (piIndex < 0 || piIndex >= newKeyPoints.length) return state;

      const structPIs = newKeyPoints.filter((p) => p.pi);
      const structIndex = structPIs.findIndex(
        (p) =>
          p.x === newKeyPoints[piIndex].x && p.y === newKeyPoints[piIndex].y,
      );

      if (
        radius !== undefined &&
        structIndex > 0 &&
        structIndex < structPIs.length - 1
      ) {
        const pi = structPIs[structIndex];
        const prev = structPIs[structIndex - 1];
        const next = structPIs[structIndex + 1];

        const dx1 = prev.x - pi.x;
        const dy1 = prev.y - pi.y;
        const dx2 = next.x - pi.x;
        const dy2 = next.y - pi.y;

        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

        if (len1 > 0 && len2 > 0) {
          const nx1 = dx1 / len1;
          const ny1 = dy1 / len1;
          const nx2 = dx2 / len2;
          const ny2 = dy2 / len2;
          const dot = nx1 * nx2 + ny1 * ny2;
          const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

          // DO NOT limit radius by maxTan. rebuildFromPIs handles scaling gracefully.
        }
      }

      newKeyPoints[piIndex] = { ...newKeyPoints[piIndex], radius };

      // Rebuild the alignment
      const updatedStructPIs = newKeyPoints.filter((p) => p.pi);
      const { points, keyPoints, length } = rebuildFromPIs(
        updatedStructPIs.map((p) => ({ x: p.x, y: p.y, radius: p.radius, spiralIn: p.spiralIn, spiralOut: p.spiralOut })),
        align.points[0]?.sta || 0
      );

      let pivs = align.keyProfilePoints
        .filter((p) => ["PP", "PIV", "PF"].includes(p.label || ""))
        .map((p) => ({ sta: p.sta, elev: p.elev, l: p.l, k: p.k }));

      if (pivs.length < 2) {
        let startElev = 0, endElev = 0;
        if (state.surface) {
          startElev = state.surface.getElevation(points[0].x, points[0].y) ?? 0;
          endElev = state.surface.getElevation(points[points.length - 1].x, points[points.length - 1].y) ?? 0;
        }
        pivs = [
          { sta: points[0].sta, elev: startElev, l: undefined, k: undefined },
          { sta: points[points.length - 1].sta, elev: endElev, l: undefined, k: undefined },
        ];
      } else {
        pivs[0].sta = points[0].sta;
        // Snap the last PIV to the new alignment length
        pivs[pivs.length - 1].sta = points[points.length - 1].sta;
      }

      const { profilePoints: newProfilePoints, keyProfilePoints: newKeyProfilePoints } = rebuildProfileFromPIVs(pivs);

      const updatedAlign = new Alignment3D(
        align.name,
        length,
        points,
        newProfilePoints,
        keyPoints,
        newKeyProfilePoints,
      );
      updatedAlign.id = align.id; // preserve ID
      updatedAlign.superelevationData = align.superelevationData; // preserve superelevation data
      updatedAlign.isManuallyEdited = true;

      const newAlignments = [...state.alignments];
      newAlignments[alignIndex] = updatedAlign;

      const corridors = state.corridors.map((c) => {
        if (c.alignmentId !== align.id) return c;
        if (c.regions.length === 0) return c;
        const updatedRegions = [...c.regions];
        updatedRegions[updatedRegions.length - 1] = {
          ...updatedRegions[updatedRegions.length - 1],
          endStation: length,
        };
        for (let i = 0; i < updatedRegions.length; i++) {
          if (updatedRegions[i].startStation > length) {
            updatedRegions[i].startStation = length;
          }
          if (updatedRegions[i].endStation > length) {
            updatedRegions[i].endStation = length;
          }
        }
        return { ...c, regions: updatedRegions };
      });

      return { alignments: rebuildDynamicOffsets(newAlignments), corridors };
    });
    
    // Rebuild related intersections
    const state = get();
    if (state.activeAlignmentId) {
       const relatedInts = state.intersections.filter(
         (i) => i.branchAlignmentId === state.activeAlignmentId || i.mainAlignmentId === state.activeAlignmentId
       );
       relatedInts.forEach((int) => {
          state.rebuildIntersectionCorridors(int.id);
       });
    }

    get().recomputeGeometry();
  },

  updateActiveAlignmentPISpiral: (piIndex, spiralIn, spiralOut) => {
    let intersectionToRebuild = null;
    set((state) => {
      if (!state.activeAlignmentId) return state;
      const alignIndex = state.alignments.findIndex(
        (a) => a.id === state.activeAlignmentId,
      );
      if (alignIndex === -1) return state;
      const align = state.alignments[alignIndex];

      const match = align.id.match(/^align-(.+?)-(M-Back-B-Arm|B-Arm-M-Fwd)$/);
      if (match) {
        const intId = match[1];
        const edgeId = match[2];
        const intIndex = state.intersections.findIndex(i => i.id === intId);
        if (intIndex !== -1) {
           const newIntersections = [...state.intersections];
           const updatedInt = { ...newIntersections[intIndex] };
           if (edgeId === "M-Back-B-Arm") {
              updatedInt.leftSpiralIn = spiralIn;
              updatedInt.leftSpiralOut = spiralOut;
           } else {
              updatedInt.rightSpiralIn = spiralIn;
              updatedInt.rightSpiralOut = spiralOut;
           }
           newIntersections[intIndex] = updatedInt;
           intersectionToRebuild = intId;
           return { intersections: newIntersections };
        }
      }
      if (align.isLocked) return state;

      const newKeyPoints = [...align.keyPoints];
      if (piIndex < 0 || piIndex >= newKeyPoints.length) return state;

      const structPIs = newKeyPoints.filter((p) => p.pi);
      const structIndex = structPIs.findIndex(
        (p) => p.x === newKeyPoints[piIndex].x && p.y === newKeyPoints[piIndex].y,
      );

      if (structIndex > 0 && structIndex < structPIs.length - 1) {
        newKeyPoints[piIndex] = { ...newKeyPoints[piIndex], spiralIn, spiralOut };
      }

      const updatedStructPIs = newKeyPoints.filter((p) => p.pi);
      const { points, keyPoints, length } = rebuildFromPIs(
        updatedStructPIs.map((p) => ({ x: p.x, y: p.y, radius: p.radius, spiralIn: p.spiralIn, spiralOut: p.spiralOut })),
        align.points[0]?.sta || 0
      );

      let pivs = align.keyProfilePoints
        .filter((p) => ["PP", "PIV", "PF"].includes(p.label || ""))
        .map((p) => ({ sta: p.sta, elev: p.elev, l: p.l, k: p.k }));

      if (pivs.length < 2) {
        let startElev = 0, endElev = 0;
        if (state.surface) {
          startElev = state.surface.getElevation(points[0].x, points[0].y) ?? 0;
          endElev = state.surface.getElevation(points[points.length - 1].x, points[points.length - 1].y) ?? 0;
        }
        pivs = [
          { sta: points[0].sta, elev: startElev, l: undefined, k: undefined },
          { sta: points[points.length - 1].sta, elev: endElev, l: undefined, k: undefined },
        ];
      } else {
        pivs[0].sta = points[0].sta;
        pivs[pivs.length - 1].sta = points[points.length - 1].sta;
      }

      const { profilePoints: newProfilePoints, keyProfilePoints: newKeyProfilePoints } = rebuildProfileFromPIVs(pivs);
      
      const updatedAlign = new Alignment3D(
        align.name,
        length,
        points,
        newProfilePoints,
        keyPoints,
        newKeyProfilePoints,
      );
      updatedAlign.id = align.id;
      updatedAlign.superelevationData = align.superelevationData;
      updatedAlign.isManuallyEdited = true;

      const newAlignments = [...state.alignments];
      newAlignments[alignIndex] = updatedAlign;
      
      return { alignments: rebuildDynamicOffsets(newAlignments) };
    });
    
    const state = get();
    if (state.activeAlignmentId) {
       const relatedInts = state.intersections.filter(
         (i) => i.branchAlignmentId === state.activeAlignmentId || i.mainAlignmentId === state.activeAlignmentId
       );
       relatedInts.forEach((int) => {
          state.rebuildIntersectionCorridors(int.id);
       });
    }

    get().recomputeGeometry();
  },

  intersections: [],
  selectedIntersectionId: null,
  setSelectedIntersectionId: (id) => set({ selectedIntersectionId: id }),
  criarGalho: (p) => {
    const st = get();
    if (validarGalho(p).some((a) => a.nivel === "erro")) return null;

    const main = st.alignments.find((a) => a.id === p.mainAlignmentId);
    if (!main) return null;

    /* Meia-largura do lado onde o galho nasce, lida da seção que vigora na
     * estaca — o nascimento tem de cair no bordo real, não num valor fixo. */
    const corrMain = st.corridors.find((c) => c.alignmentId === p.mainAlignmentId);
    const regiao =
      corrMain?.regions.find(
        (r) => p.mainStation >= r.startStation && p.mainStation <= r.endStation,
      ) || corrMain?.regions[0];
    const marca = Date.now();
    const ehAlca = p.topologia === "alca";
    /* Id NORMAL de alinhamento: o eixo do galho é de primeira classe. Na alça
     * ele É o eixo do ramo (a própria via secundária, mão única); no
     * entroncamento é o eixo central da secundária. */
    const alignId = "align_" + marca + "galho";
    const nome = ehAlca
      ? "Ramo " + (st.intersections.length + 1)
      : "Galho " + (st.intersections.length + 1);

    /* A ALÇA É O ENTRONCAMENTO. Constrói-se o entroncamento inteiro — eixo no
     * eixo da principal, dois quadrantes, dois filletes — e só depois de
     * pronto se descarta o ramo do lado que não serve. Nenhum caminho
     * específico de alça até lá: mesmo eixo, mesmo corredor, mesma interseção. */
    const eixo = construirAlinhamentoGalho(alignId, nome, main, p, st.surface);
    if (!eixo) return null;

    set((state) => ({ alignments: [...state.alignments, eixo] }));

    /* Corredor pelo MESMO caminho do fluxo manual (addCorridor), renomeado e
     * com a seção herdada da principal. Na alça este corredor é provisório: o
     * eixo central é construção, e o corredor sai na aposentadoria, lá embaixo. */
    get().addCorridor(alignId);
    const corrGalho = get().corridors.find((c) => c.alignmentId === alignId);
    const assemblyId = regiao?.assemblyId;

    if (corrGalho) {
      set((state) => ({
        corridors: state.corridors.map((c) =>
          c.id === corrGalho.id
            ? {
                ...c,
                name: nome,
                regions: assemblyId
                  ? c.regions.map((r) => ({ ...r, assemblyId }))
                  : c.regions,
              }
            : c,
        ),
      }));
    }

    /* isRightSide pela MESMA conta do fluxo manual (tangente do ramo · normal da
     * principal) — válida nos dois tipos, porque o eixo sempre nasce no eixo da
     * principal com ângulo real. */
    const normM = main.getOrientationAtStation(p.mainStation);
    const bN = eixo.getOrientationAtStation(0);
    const isRightSide = bN.tx * normM.nx + bN.ty * normM.ny >= 0;

    /* Bordo extraído da principal — a âncora da concordância bordo-com-bordo.
     * Sem ele os fillets casam contra o fallback e ficam buracos. Mesma cascata
     * do fluxo manual: semântico novo, depois legado P2/P3. */
    let mainTargetId: string | undefined;
    if (corrMain) {
      mainTargetId = get().extractFeatureLine(
        corrMain.id,
        isRightSide ? "Bordo_Faixa_Dir_1" : "Bordo_Faixa_Esq_1",
      );
      if (!mainTargetId) {
        mainTargetId = get().extractFeatureLine(corrMain.id, isRightSide ? "P2" : "P3");
      }
      if (!mainTargetId) {
        mainTargetId = get().extractFeatureLine(corrMain.id, isRightSide ? "P3" : "P2");
      }
    }

    const intId = "int-" + marca;
    get().addIntersection({
      id: intId,
      name: nome,
      mainAlignmentId: p.mainAlignmentId,
      branchAlignmentId: alignId,
      mainStation: p.mainStation,
      branchStation: 0,
      isRightSide,
      mainTargetId,
      leftRadius: 15,
      rightRadius: 15,
      hasIsland: false,
      islandWidth: 2,
      islandBranchWidth: 4.5,
      hasSpiral: false,
      spiralLength: 20,
      hasRefugio: true,
      refugioWidth: 1.5,
      mainCrossSlope: -2,
      branchCrossSlope: -2,
      galho: {
        topologia: p.topologia,
        angulo: p.angulo,
        comprimento: p.comprimento,
        maoUnica: p.maoUnica,
        sentido: p.sentido,
        raio: p.raio,
        largura: p.largura,
      },
    } as IntersectionData);

    /* ===== ALÇA: DESCARTAR UM RAMO E APOSENTAR O EIXO CENTRAL =====
     *
     * Até aqui existe um entroncamento completo. A alça se faz por SUBTRAÇÃO,
     * que é a receita manual do projetista:
     *
     *   1. separar por ramos — mas só do lado que sobrevive;
     *   2. aposentar o eixo central.
     *
     * QUAL LADO SOBREVIVE. Os tokens de quadrante são absolutos, não dependem
     * do lado do galho. Um veículo que segue no sentido do estaqueamento e SAI
     * para o ramo contorna o canto entre o braço de trás da principal e o braço
     * do ramo — quadrante M-Back. Quem ENTRA vem do campo e funde no braço da
     * frente — quadrante M-Fwd. Vale para galho à direita e à esquerda: o
     * espelhamento troca o giro, não o par de braços.
     *
     * APOSENTAR, NÃO APAGAR. Os quadrantes e os filletes são derivados do eixo
     * central, e o rebuild o consome em cada passagem — apagar orfanaria a
     * interseção inteira. Ele fica oculto, na camada auxiliar, SEM corredor:
     * desaparece da planta e da barra de eixos, continua sendo o esqueleto.
     * `isHidden` só governa desenho e listagem; o rebuild acha o ramo por id. */
    if (ehAlca) {
      const tokenVivo = p.sentido === "entrada" ? "M-Fwd" : "M-Back";
      const ladoVivo = p.sentido === "entrada" ? "right" : "left";
      const W = p.largura ?? FAIXA_ADICIONAL_W;

      const quad = get().alignments.find(
        (a: any) =>
          a.id.startsWith(`align-${intId}-`) &&
          a.id.includes("B-Arm") &&
          a.id.includes(tokenVivo),
      );

      if (quad) {
        try {
          const ramo: any = createOffsetAlignment(quad as any, -W, `${nome} · Ramo`);
          ramo.id = `align-${intId}-offset-${ladoVivo}`;
          ramo.layerId = "layer-auxiliar";
          ramo.parentId = quad.id;
          ramo.offsetValue = -W;
          get().setAlignments([...get().alignments, ramo]);
          get().updateIntersection(
            intId,
            ladoVivo === "left" ? { leftBranchWidth: W } : { rightBranchWidth: W },
            { noRebuild: true },
          );
        } catch (err) {
          console.error("alça: falha ao separar o ramo sobrevivente", err);
        }
      } else {
        console.warn(`alça: quadrante ${tokenVivo} não encontrado — ficou entroncamento`);
      }

      /* Aposentadoria do eixo central. */
      const semCorredor = get().corridors.filter((c) => c.alignmentId !== alignId);
      const eixosOcultos = get().alignments.map((a: any) => {
        if (a.id !== alignId) return a;
        a.isHidden = true;
        a.layerId = "layer-auxiliar";
        return a;
      });
      set({ corridors: semCorredor, alignments: eixosOcultos });
      get().rebuildIntersectionCorridors(intId);
    }

    set({ activeAlignmentId: ehAlca ? null : alignId });
    return intId;
  },

  /* Reancora os galhos: só o PI de nascimento é regenerado, contra a estaca
   * atual da principal. Do segundo PI em diante o traçado é do projetista e
   * não se toca — é o que permite projetar o ramo sem lutar com a amarração. */
  reancorarGalhos: () => {
    const st = get();
    const comGalho = st.intersections.filter((i) => i.galho);
    if (comGalho.length === 0) return;

    let mudou = false;
    const alignments = st.alignments.map((a) => {
      const int = comGalho.find((i) => i.branchAlignmentId === a.id);
      if (!int?.galho) return a;
      const main = st.alignments.find((m) => m.id === int.mainAlignmentId);
      if (!main) return a;

      const lado: "Esq" | "Dir" = int.isRightSide ? "Dir" : "Esq";

      const novo = construirAlinhamentoGalho(
        a.id,
        a.name,
        main,
        {
          mainAlignmentId: int.mainAlignmentId,
          mainStation: int.mainStation,
          lado,
          angulo: int.galho.angulo,
          comprimento: int.galho.comprimento,
          topologia: int.galho.topologia,
          maoUnica: int.galho.maoUnica,
          sentido: int.galho.sentido,
          raio: int.galho.raio,
          largura: int.galho.largura,
        },
        st.surface,
        a.keyPoints
          .filter((k: any) => k.pi)
          .map((k: any) => ({ x: k.x, y: k.y, radius: k.radius })),
      );
      if (!novo) return a;
      const p0 = a.points[0];
      if (p0 && Math.hypot(novo.points[0].x - p0.x, novo.points[0].y - p0.y) < 0.01) return a;
      mudou = true;
      return novo;
    });

    if (mudou) set({ alignments });
  },

  addIntersection: (intersection) => {
    set((state) => ({
      intersections: [...state.intersections, intersection],
      selectedIntersectionId: intersection.id,
    }));
    get().rebuildIntersectionCorridors(intersection.id);
  },
  updateIntersection: (id, updates, options) => {
    set((state) => ({
      intersections: state.intersections.map((i) =>
        i.id === id ? { ...i, ...updates } : i,
      ),
    }));
    if (!options?.noRebuild) {
        get().rebuildIntersectionCorridors(id);
    }
  },
  removeIntersection: (id) => {
    set((state) => ({
      intersections: state.intersections.filter((i) => i.id !== id),
      /* O galho traz consigo o eixo e o corredor que gerou — some tudo junto. */
      alignments: state.alignments.filter(
        (a) => !a.id.startsWith(`align-${id}-`) && a.id !== `align-${id}-eixo`,
      ),
      corridors: state.corridors.filter(
        (c) =>
          !c.id.startsWith(`corr-${id}-`) &&
          c.id !== `c-galho-${id.replace("int-galho-", "")}`,
      ),
      selectedIntersectionId: state.selectedIntersectionId === id ? null : state.selectedIntersectionId,
      editingIntersectionId: state.editingIntersectionId === id ? null : state.editingIntersectionId,
    }));
    get().recomputeGeometry();
  },
  checkAndCreateIntersection: (branchAlignId, ptIndex, x, y) => {
    // Check if this point lies on another alignment
    const state = get();
    const branchAlign = state.alignments.find((a) => a.id === branchAlignId);
    if (!branchAlign) return;
    const branchPt = branchAlign.keyPoints[ptIndex];

    let snappedAlignId = null;
    let snappedStation = 0;

    for (const mainAlign of state.alignments) {
      if (mainAlign.id === branchAlignId) continue;
      if (mainAlign.isHidden) continue;
      for (let i = 0; i < mainAlign.points.length - 1; i++) {
        const p1 = mainAlign.points[i];
        const p2 = mainAlign.points[i + 1];
        // dist to segment
        const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
        if (l2 === 0) continue;
        let t = ((x - p1.x) * (p2.x - p1.x) + (y - p1.y) * (p2.y - p1.y)) / l2;
        let projX = x;
        let projY = y;
        let currentT = t;

        if (t < 0) {
          projX = p1.x;
          projY = p1.y;
          currentT = 0;
        } else if (t > 1) {
          projX = p2.x;
          projY = p2.y;
          currentT = 1;
        } else {
          projX = p1.x + t * (p2.x - p1.x);
          projY = p1.y + t * (p2.y - p1.y);
        }

        const dist = Math.sqrt((projX - x) ** 2 + (projY - y) ** 2);
        if (dist < 40) {
          // Using 40 world units as snap margin
          snappedAlignId = mainAlign.id;
          snappedStation = p1.sta + currentT * (p2.sta - p1.sta);
          break;
        }
      }
      if (snappedAlignId) break;
    }

    if (snappedAlignId) {
      // Automatic intersection creation removed per user request.
      // The user must click the intersection point on the canvas to open the Intersection Studio and build corridors.
      
      const state = get();
      const existingInt = state.intersections.find(
        (i) => i.branchAlignmentId === branchAlignId && Math.abs(i.branchStation - branchPt.sta) < 20
      );
      if (existingInt) {
         const updatedBranch = get().alignments.find((a) => a.id === branchAlignId);
         if (updatedBranch) {
            get().updateIntersection(existingInt.id, {
                mainAlignmentId: snappedAlignId,
                mainStation: snappedStation,
                branchStation: updatedBranch.keyPoints[ptIndex]?.sta || 0
            });
         }
      }
    } else {
      // Remove if pulled away
      set((state) => ({
        intersections: state.intersections.filter(
          (i) =>
            !(
              i.branchAlignmentId === branchAlignId &&
              Math.abs(i.branchStation - branchPt.sta) < 20
            ),
        ),
      }));
    }
  },
  rebuildIntersectionCorridors: (intId: string) => { console.time('rebuildIntersectionCorridors');
    const state = get();
    if (!state.layers.some(l => l.id === "layer-auxiliar")) {
       set((s) => ({ layers: [...s.layers, { id: "layer-auxiliar", name: "Auxiliar", color: "#a8a29e", isVisible: false, isLocked: false }] }));
    }
    const int = state.intersections.find((i) => i.id === intId);
    if (!int) return;

    // Clean up any previously created automatic corridors and alignments for these edges FIRST
    const manuallyEditedAligns = state.alignments.filter(
      (a) => a.id.startsWith(`align-${int.id}-`) && a.isManuallyEdited,
    );
    let newAlignments = state.alignments
      .filter(
        (a) => !a.id.startsWith(`align-${int.id}-`) || a.isManuallyEdited || a.parentId,
      )
      .map((a) => {
        // Always reset visual bounds of parent alignments so they are rebuilt from station 0 / full length
        if (a.id === int.branchAlignmentId || a.id === int.mainAlignmentId) {
          const resetA = Object.create(Object.getPrototypeOf(a));
          Object.assign(resetA, a);
          resetA.visualStartStation = undefined;
          resetA.visualEndStation = undefined;
          return resetA;
        }
        return a;
      });
    let newAssemblies = [...state.assemblies];
    let newCorridors = state.corridors
      .filter(
        (c) =>
          !c.id.startsWith(`corr-${int.id}-`) ||
          manuallyEditedAligns.some((m) => m.id === c.alignmentId),
      )
      .map((c) => {
        let newRegions = c.regions.filter(
          (r) => !r.id.startsWith(`r-auto-${int.id}-`),
        );

        const branchAlignTemp = state.alignments.find(
          (a) => a.id === int.branchAlignmentId,
        );
        if (c.alignmentId === int.mainAlignmentId) {
          newRegions = newRegions.map((r) => {
            let restored = { ...r };
            if (restored.originalEndStation !== undefined) {
              restored.endStation = restored.originalEndStation;
              restored.originalEndStation = undefined;
            }
            if (restored.originalStartStation !== undefined) {
              restored.startStation = restored.originalStartStation;
              restored.originalStartStation = undefined;
            }
            return restored;
          });
        }
        
        if (branchAlignTemp && c.alignmentId === int.branchAlignmentId) {
          const isStartForC = int.branchStation === 0 || int.branchStation < branchAlignTemp.length / 2;
          newRegions = newRegions.map((r) => {
            let restored = { ...r };
            if (isStartForC) {
              restored.startStation = restored.originalStartStation !== undefined ? restored.originalStartStation : 0;
              restored.originalStartStation = undefined;
            } else {
              restored.endStation = restored.originalEndStation !== undefined ? restored.originalEndStation : branchAlignTemp.length;
              restored.originalEndStation = undefined;
            }
            return restored;
          });
        }

        return {
          ...c,
          regions: newRegions,
        };
      });

    const mainAlign = newAlignments.find(
      (a) => a.id === int.mainAlignmentId,
    ) || state.alignments.find(
      (a) => a.id === int.mainAlignmentId,
    );
    const branchAlign = newAlignments.find(
      (a) => a.id === int.branchAlignmentId,
    ) || state.alignments.find(
      (a) => a.id === int.branchAlignmentId,
    );
    if (!mainAlign || !branchAlign) return;

    const M = mainAlign.getPointAtStation(int.mainStation);

    const mainFwdStats = Math.min(int.mainStation + 100, mainAlign.length);
    const mainBackStats = Math.max(int.mainStation - 100, 0);
    const mainFwdWorld = mainAlign.getPointAtStation(mainFwdStats);
    const mainBackWorld = mainAlign.getPointAtStation(mainBackStats);

    const isStart = int.branchStation === 0 || int.branchStation < branchAlign.length / 2;
    const branchArmStats = isStart
      ? Math.min(int.branchStation + 100, branchAlign.length)
      : Math.max(int.branchStation - 100, 0);
    const branchArmWorld = branchAlign.getPointAtStation(branchArmStats);

    const getLaneW = (res: any) => {
      let w = null;
      if (res?.assembly?.etwPointIds?.length > 0) {
        for (const ptId of res.assembly.etwPointIds) {
          if (res.points[ptId]) {
            const ptW = Math.abs(res.points[ptId].x);
            if (w === null || ptW > w) w = ptW;
          }
        }
      }
      if (w !== null) return w;
      return Math.abs(res?.points["Bordo_Faixa_Dir_1"]?.x || res?.points["Bordo_Faixa_Esq_1"]?.x || res?.points["P2"]?.x || res?.points["P3"]?.x || 3.6);
    };

    const getLaneWFallback = (alignId: string): number | null => {
      for (const c of state.corridors) {
        if (c.alignmentId === alignId && c.regions.length > 0) {
          const r = c.regions[0];
          const res = evaluateAssemblyAtStation(
            r.startStation + 0.01,
            state.assemblies,
            state.corridors,
            state.surface,
            state.alignments,
            alignId,
          );
          if (res) return getLaneW(res);
        }
      }
      return null;
    };

    // Default lane widths
    let mainLaneW = 3.6;
    let branchLaneW = 3.6;
    let branchAssembly: Assembly | null = null;

    // Use evaluateAssemblyAtStation (we only need the offsets, so a placeholder is fine)
    try {
      const mRes = evaluateAssemblyAtStation(
        int.mainStation,
        state.assemblies,
        state.corridors,
        state.surface,
        state.alignments,
        int.mainAlignmentId,
      );
      if (mRes) mainLaneW = getLaneW(mRes);
      else mainLaneW = getLaneWFallback(int.mainAlignmentId) || 3.6;

      const bRes = evaluateAssemblyAtStation(
        int.branchStation,
        state.assemblies,
        state.corridors,
        state.surface,
        state.alignments,
        int.branchAlignmentId,
      );
      if (bRes) {
        branchLaneW = getLaneW(bRes);
        if (bRes.assembly) branchAssembly = bRes.assembly;
      } else {
        branchLaneW = getLaneWFallback(int.branchAlignmentId) || 3.6;
      }
    } catch (e) {}

    if (!branchAssembly) {
      // Look up in branch corridor regions
      for (const c of state.corridors) {
        if (c.alignmentId === int.branchAlignmentId && c.regions.length > 0) {
          const matchedReg = c.regions.find(
            (r) => int.branchStation >= r.startStation && int.branchStation <= r.endStation
          ) || c.regions[0];
          if (matchedReg) {
            branchAssembly = state.assemblies.find((a) => a.id === matchedReg.assemblyId) || null;
            if (branchAssembly) break;
          }
        }
      }
    }

    // Generate intelligent dynamic quadrant assembly based on the secondary road
    const autoQuadAssemblyId = `assembly-quad-${int.id}`;
    let quadAssemblyId = int.assemblyId || autoQuadAssemblyId;

    if (!int.assemblyId || int.assemblyId === autoQuadAssemblyId || int.assemblyId === "a4") {
      const intName = int.name || "Interseção";
      const quadName = `${intName} - Quadrante Inteligente`;
      
      let quadComponents: SubassemblyComponent[] = [];
      let pistaLayers = {
        revestimento: [{ id: "rev-1", name: "Revestimento", thickness: 0.05 }],
        base: [{ id: "base-1", name: "Base", thickness: 0.25 }],
        subBase: [{ id: "sub-1", name: "Sub-base", thickness: 0.2 }],
        cftCorte: 0,
        cftAterro: 0,
        limpeza: 0,
      };

      if (branchAssembly?.components && branchAssembly.components.length > 0) {
        // Find right-side or left-side components of the secondary road
        const rightComps = branchAssembly.components.filter(c => c.side === "Right");
        const leftComps = branchAssembly.components.filter(c => c.side === "Left");
        const sourceComps = rightComps.length > 0 ? rightComps : leftComps;

        // Inherit pavement layers from the secondary road lane
        const branchPista = branchAssembly.components.find(c => c.type === "Pista");
        if (branchPista?.layers) {
          pistaLayers = JSON.parse(JSON.stringify(branchPista.layers));
        }

        // Build Quadrant Half-Section:
        // 1. Pista on Left (inward towards corridor center, dynamically stretches with PistaW target)
        quadComponents.push({
          id: `c_pista_quad_${int.id}`,
          type: "Pista",
          side: "Left",
          params: { width: branchLaneW || 3.6, slope: int.branchCrossSlope ?? -2 },
          layers: pistaLayers,
        });

        // 2. Curb, Gutter, Sidewalk, etc. on Right (outward from curb return)
        sourceComps.forEach((comp, idx) => {
          if (comp.type !== "Pista" && comp.type !== "Talude") {
            quadComponents.push({
              ...JSON.parse(JSON.stringify(comp)),
              id: `c_quad_${comp.type.toLowerCase()}_${int.id}_${idx}`,
              side: "Right",
            });
          }
        });

        // If no right-side curb/gutter exists in branch assembly, add default Sarjeta
        if (!quadComponents.some(c => c.side === "Right")) {
          quadComponents.push({
            id: `c_sarjeta_quad_${int.id}`,
            type: "Sarjeta",
            side: "Right",
            params: { shape: "Triangular", width: 1.0, depth: 0.25, bottomWidth: 0.3, thickness: 0.1 },
          });
        }
      } else {
        // Fallback robust half-section
        quadComponents = [
          {
            id: `c_pista_quad_${int.id}`,
            type: "Pista",
            side: "Left",
            params: { width: branchLaneW || 3.6, slope: int.branchCrossSlope ?? -2 },
            layers: pistaLayers,
          },
          {
            id: `c_sarjeta_quad_${int.id}`,
            type: "Sarjeta",
            side: "Right",
            params: { shape: "Triangular", width: 1.0, depth: 0.25, bottomWidth: 0.3, thickness: 0.1 },
          },
        ];
      }

      const dynamicQuadAssembly: Assembly = {
        id: autoQuadAssemblyId,
        name: quadName,
        parameters: [
          { id: "p_width", name: "PistaW", type: "Double", value: branchLaneW || 3.6 },
          { id: "p_slope", name: "PistaSlope", type: "Double", value: int.branchCrossSlope ?? -2.0 },
        ],
        points: [],
        links: [],
        components: quadComponents,
      };

      // Add or update the dynamic assembly in newAssemblies
      const existingIdx = newAssemblies.findIndex(a => a.id === autoQuadAssemblyId);
      if (existingIdx >= 0) {
        newAssemblies[existingIdx] = dynamicQuadAssembly;
      } else {
        newAssemblies.push(dynamicQuadAssembly);
      }

      quadAssemblyId = autoQuadAssemblyId;
    }

    const branchLaneWForOffset = branchLaneW;

    const mDir = {
      x: mainFwdWorld.x - mainBackWorld.x,
      y: mainFwdWorld.y - mainBackWorld.y,
    };
    const mLen = Math.hypot(mDir.x, mDir.y);
    const mainUnitDir = { x: mDir.x / (mLen || 1), y: mDir.y / (mLen || 1) };

    const bNorm = branchAlign.getOrientationAtStation(int.branchStation);
    const branchUnitDir = isStart
      ? { x: bNorm.tx, y: bNorm.ty }
      : { x: -bNorm.tx, y: -bNorm.ty };

    const mainDir = mainUnitDir;
    const branchDir = branchUnitDir;

    const getElevForPt = (Q: { x: number; y: number }, role: string) => {
      if (role.startsWith("M-")) {
        const distM = (Q.x - M.x) * mainDir.x + (Q.y - M.y) * mainDir.y;
        const mSta = int.mainStation + distM;
        const baseE =
          mainAlign.getElevationAtStation(mSta) ||
          state.surface?.getElevation(M.x, M.y) ||
          0;
        const distLat = (Q.x - M.x) * -mainDir.y + (Q.y - M.y) * mainDir.x;
        return baseE + (Math.abs(distLat) * (int.mainCrossSlope || -2)) / 100;
      } else {
        const distB = (Q.x - M.x) * branchDir.x + (Q.y - M.y) * branchDir.y;
        const bSta = int.branchStation + (isStart ? distB : -distB);
        const baseE =
          branchAlign.getElevationAtStation(bSta) ||
          state.surface?.getElevation(M.x, M.y) ||
          0;
        return baseE;
      }
    };

    // Always adjust M to tie into the edge (Bordo com Bordo)
    let M_common = { x: M.x, y: M.y };
    const norm = mainAlign.getOrientationAtStation(int.mainStation);
    const dotRight = branchUnitDir.x * norm.nx + branchUnitDir.y * norm.ny;
    const isRightSide = int.isRightSide !== undefined ? int.isRightSide : (dotRight >= 0);

    /* BORDO-ALVO DA PRINCIPAL — do lado onde o ramo está. Só troca de lado
     * quando o bordo daquele lado existe no projeto; senão mantém o alvo. */
    const bordoAlvoId = (() => {
      const alvo = int.mainTargetId;
      if (!alvo || !/Bordo_Faixa_(Esq|Dir)/i.test(alvo)) return alvo;
      const corrigido = alvo.replace(/Bordo_Faixa_(Esq|Dir)/i, `Bordo_Faixa_${isRightSide ? "Dir" : "Esq"}`);
      const existe = (id: string) =>
        newAlignments.some((a: any) => a.id === id) || state.alignments.some((a: any) => a.id === id);
      return existe(corrigido) ? corrigido : alvo;
    })();

    /* PAPEL DE CADA QUADRANTE — CONTINUIDADE DE FLUXO (lib/flowRules).
     * O quadrante é a continuação do fluxo das faixas que liga, e só isso
     * decide. A conta vive em lib/flowRules e é a MESMA que a planta e o
     * assistente usam: quando cada um tinha a sua, o L/T que o usuário
     * arrastava caía no campo do outro movimento e a faixa não mudava.
     *
     * Calculado AQUI, antes do bordo de apoio, porque é ele que diz qual L/T
     * vale de cada lado — e o bordo tem de seguir o alargamento real.
     *
     * Não entra posição do nó, nem giro de concordância: era isso que fazia
     * o papel do ramo mudar quando a interseção era arrastada. */
    const papel = papelDosQuadrantes({
      corridors: state.corridors,
      assemblies: state.assemblies,
      laneDirections: state.laneDirections as any,
      mainAlignmentId: int.mainAlignmentId,
      mainStation: int.mainStation,
      branchAlignmentId: int.branchAlignmentId,
      mainUnitDir,
      branchUnitDir,
      tangenteRamoNoNo: isStart
        ? branchUnitDir
        : { x: -branchUnitDir.x, y: -branchUnitDir.y },
    });

    /* GEOMETRIA DA FAIXA ADICIONAL, em estacas da principal. Uma descrição só,
     * consumida tanto pelo bordo de apoio como por buildAccelDecelLine. */
    const ladoAccel = (side: 1 | -1) => {
      const decel = (side === 1 ? papel.fwd : papel.back) === "Desaceleração";
      return {
        L: decel ? int.decelL || 50 : int.accelL || 50,
        T: decel ? int.decelT || 30 : int.accelT || 30,
        W: decel
          ? int.decelWidth ?? int.accelWidth ?? FAIXA_ADICIONAL_W
          : int.accelWidth ?? FAIXA_ADICIONAL_W,
        staTang:
          int.mainStation +
          side * (branchLaneW + ((side === 1 ? int.rightRadius : int.leftRadius) || 15)),
      };
    };

    /* PERFIL DO ALARGAMENTO ao longo da principal (m, ≥ 0): cheio do nó até ao
     * fim do L e depois fechando ao longo do taper. É o mesmo perfil que a
     * faixa desenha — o bordo de apoio TEM de o seguir, senão os quadrantes e
     * os alinhamentos de acesso que nascem dele ficam presos a um offset
     * constante e não se readaptam à faixa. */
    const alargamentoEm = (sta: number) => {
      if (!int.hasAccelDecel) return 0;
      const deLado = (side: 1 | -1) => {
        const { L, T, W, staTang } = ladoAccel(side);
        const d = (sta - staTang) * side; // para fora da interseção
        if (d <= L) return W; // inclui o miolo, entre as duas tangências
        if (d >= L + T) return 0;
        return W * (1 - (d - L) / T);
      };
      return Math.max(deLado(1), deLado(-1));
    };

    /* Estacas onde o perfil quebra. Sem um vértice em cada uma, um trecho em
     * tangente (dois PIs a centenas de metros) perderia o taper inteiro. */
    const estacasChaveAlargamento = int.hasAccelDecel
      ? ([1, -1] as const).flatMap((side) => {
          const { L, T, staTang } = ladoAccel(side);
          return [staTang, staTang + side * L, staTang + side * (L + T)];
        })
      : [];

    let totalW = isRightSide ? mainLaneW : -mainLaneW;
    if (int.hasAccelDecel) {
      const extraW = Math.max(
        int.accelWidth ?? FAIXA_ADICIONAL_W,
        int.decelWidth ?? int.accelWidth ?? FAIXA_ADICIONAL_W
      );
      totalW += isRightSide ? extraW : -extraW;
    }

    if (Math.abs(dotRight) > 0.0001) {
      const t = totalW / dotRight;
      M_common.x = M.x + t * branchUnitDir.x;
      M_common.y = M.y + t * branchUnitDir.y;
    } else {
      M_common.x += norm.nx * totalW;
      M_common.y += norm.ny * totalW;
    }
    const mainArmWidth = 0.01; // nearly zero so fillets attach directly to the edge feature

    /* O mesmo nó, SEM a faixa adicional. Serve de referência para reconhecer um
     * bordo extraído que ficou na posição estreita. */
    const totalSemFaixa = isRightSide ? mainLaneW : -mainLaneW;
    const M_semFaixa =
      Math.abs(dotRight) > 0.0001
        ? {
            x: M.x + (totalSemFaixa / dotRight) * branchUnitDir.x,
            y: M.y + (totalSemFaixa / dotRight) * branchUnitDir.y,
          }
        : { x: M.x + norm.nx * totalSemFaixa, y: M.y + norm.ny * totalSemFaixa };

    /* ===== BORDOS DE APOIO QUE ACOMPANHAM A CURVA =====
     *
     * Estes alinhamentos (main-edge, branch-left, branch-right) são o esqueleto
     * da interseção: além de alimentarem as concordâncias, são o alvo dos
     * corredores de quadrante. Eram RETAS de 1000 m — a tangente ao bordo na
     * estaca do cruzamento. Com a principal (ou o ramo) em curva, a reta
     * descola do bordo real e todo o quadrante caminha sobre ela: é o desenho
     * cinza saindo do pavimento nos cantos.
     *
     * Agora cada um é a POLILINHA do eixo correspondente, deslocada do offset
     * devido — reta quando o eixo está em reta, curva quando está em curva,
     * inclusive parcialmente (a transição reta→curva vem de graça, porque
     * herda a geometria do eixo).
     */
    const projNaPoli = (pts: any[], q: { x: number; y: number }) => {
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

    /* Polilinha paralela: recorta ±span em torno de `perto` e desloca `delta`
     * pela normal à esquerda (média nos vértices, para não abrir bico).
     *
     * `delta` pode ser uma função da estaca do eixo de origem — é assim que o
     * bordo de apoio acompanha o alargamento da faixa adicional em vez de
     * correr a offset constante. `estacasChave` força um vértice onde o perfil
     * quebra. */
    const poliParalela = (
      pts: any[],
      delta: number | ((sta: number) => number),
      perto: { x: number; y: number },
      span: number,
      refDir: { x: number; y: number },
      estacasChave: number[] = [],
    ): { x: number; y: number; sta: number }[] | null => {
      if (!pts || pts.length < 2) return null;
      const pr = projNaPoli(pts, perto);
      const staDe = (i: number) => pts[i]?.sta ?? 0;
      /* Percorre para trás e para frente acumulando comprimento. */
      const base: { x: number; y: number; s: number }[] = [
        { x: pr.x, y: pr.y, s: staDe(pr.i) + (staDe(pr.i + 1) - staDe(pr.i)) * pr.t },
      ];
      let acc = 0;
      for (let i = pr.i; i >= 0 && acc < span; i--) {
        const p = pts[i];
        /* Sem ponto duplicado no arranque: quando a projeção cai EM CIMA do
         * vértice, os dois primeiros pontos ficam idênticos, a tangente local é
         * nula e a normal sai (0,0) — o primeiro ponto sai SEM offset. Ficava
         * uma travessa da largura do offset entre ele e o segundo ponto. */
        if (Math.hypot(p.x - base[0].x, p.y - base[0].y) < 1e-6) continue;
        acc += Math.hypot(p.x - base[0].x, p.y - base[0].y);
        base.unshift({ x: p.x, y: p.y, s: staDe(i) });
      }
      acc = 0;
      for (let i = pr.i + 1; i < pts.length && acc < span; i++) {
        const p = pts[i];
        acc += Math.hypot(p.x - base[base.length - 1].x, p.y - base[base.length - 1].y);
        base.push({ x: p.x, y: p.y, s: staDe(i) });
      }
      if (base.length < 2) return null;
      /* Mesmo sentido do eixo, para as estações seguirem a convenção antiga. */
      const dTot = { x: base[base.length - 1].x - base[0].x, y: base[base.length - 1].y - base[0].y };
      if (dTot.x * refDir.x + dTot.y * refDir.y < 0) base.reverse();

      estacasChave.forEach((sk) => {
        for (let i = 0; i < base.length - 1; i++) {
          const a = base[i];
          const b = base[i + 1];
          if (sk <= Math.min(a.s, b.s) + 1e-6 || sk >= Math.max(a.s, b.s) - 1e-6) continue;
          const f = (sk - a.s) / (b.s - a.s);
          base.splice(i + 1, 0, {
            x: a.x + (b.x - a.x) * f,
            y: a.y + (b.y - a.y) * f,
            s: sk,
          });
          break;
        }
      });

      const norm: { x: number; y: number }[] = base.map((_, i) => {
        const a = base[Math.max(0, i - 1)];
        const b = base[Math.min(base.length - 1, i + 1)];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const l = Math.hypot(vx, vy) || 1;
        return { x: -vy / l, y: vx / l };
      });
      const out: { x: number; y: number; sta: number }[] = [];
      let sta = 0;
      for (let i = 0; i < base.length; i++) {
        const d = typeof delta === "function" ? delta(base[i].s) : delta;
        const x = base[i].x + norm[i].x * d;
        const y = base[i].y + norm[i].y * d;
        if (i > 0) sta += Math.hypot(x - out[i - 1].x, y - out[i - 1].y);
        out.push({ x, y, sta });
      }
      return out.length >= 2 ? out : null;
    };

    const eixoMainPtsApoio: any[] =
      (newAlignments.find((a: any) => a.id === int.mainAlignmentId) as any)?.points ||
      (state.alignments.find((a: any) => a.id === int.mainAlignmentId) as any)?.points ||
      [];
    const eixoBranchPtsApoio: any[] =
      (newAlignments.find((a: any) => a.id === int.branchAlignmentId) as any)?.points ||
      (state.alignments.find((a: any) => a.id === int.branchAlignmentId) as any)?.points ||
      [];

    const mainEdgeAlignId = `align-${int.id}-main-edge`;
    /* Offset assinado de M_common em relação ao eixo da principal: contém a
     * faixa, e mais o alargamento de acel/desacel quando existe. */
    const mainEdgePts = (() => {
      if (eixoMainPtsApoio.length < 3) return null;
      const pr = projNaPoli(eixoMainPtsApoio, M_common);
      const nEsq = { x: -mainUnitDir.y, y: mainUnitDir.x };
      const delta = (M_common.x - pr.x) * nEsq.x + (M_common.y - pr.y) * nEsq.y;
      /* M_common já traz o alargamento cheio; medido na normal ESQUERDA ele
       * entra negativo quando o ramo está à direita. Descontamos para achar o
       * bordo sem faixa adicional e voltamos a somar estaca a estaca. */
      const sinalEsq = isRightSide ? -1 : 1;
      const deltaBase = delta - sinalEsq * alargamentoEm(int.mainStation);
      return poliParalela(
        eixoMainPtsApoio,
        (sta) => deltaBase + sinalEsq * alargamentoEm(sta),
        M_common,
        500,
        mainUnitDir,
        estacasChaveAlargamento,
      );
    })();
    const mainEdgeLine = new Alignment3D(
      mainEdgeAlignId, // Name
      mainEdgePts ? mainEdgePts[mainEdgePts.length - 1].sta : 1000,
      mainEdgePts || [
        {
          x: M_common.x - mainUnitDir.x * 500,
          y: M_common.y - mainUnitDir.y * 500,
          sta: 0,
        },
        {
          x: M_common.x + mainUnitDir.x * 500,
          y: M_common.y + mainUnitDir.y * 500,
          sta: 1000,
        },
      ],
      [],
    );
    mainEdgeLine.id = mainEdgeAlignId;
    mainEdgeLine.isHidden = true;
    if (!manuallyEditedAligns.some((m) => m.id === mainEdgeLine.id))
      newAlignments.push(mainEdgeLine);

    const leftBranchW = branchLaneW;
    const rightBranchW = branchLaneW;

    const branchLeftW = isRightSide ? rightBranchW : leftBranchW;
    const branchRightW = isRightSide ? leftBranchW : rightBranchW;

    const branchEdgeLeftId = `align-${int.id}-branch-left`;
    /* Bordo esquerdo do ramo: o próprio eixo do ramo deslocado da meia-pista,
     * seguindo a curva dele quando houver. */
    const branchLeftPts = poliParalela(eixoBranchPtsApoio, branchLeftW, M_common, 500, branchUnitDir);
    const branchEdgeLeftLine = new Alignment3D(
      branchEdgeLeftId,
      branchLeftPts ? branchLeftPts[branchLeftPts.length - 1].sta : 1000,
      branchLeftPts || [
        {
          x: M_common.x - branchUnitDir.y * branchLeftW - branchUnitDir.x * 500,
          y: M_common.y + branchUnitDir.x * branchLeftW - branchUnitDir.y * 500,
          sta: 0,
        },
        {
          x: M_common.x - branchUnitDir.y * branchLeftW + branchUnitDir.x * 500,
          y: M_common.y + branchUnitDir.x * branchLeftW + branchUnitDir.y * 500,
          sta: 1000,
        },
      ],
      [],
    );
    branchEdgeLeftLine.id = branchEdgeLeftId;
    branchEdgeLeftLine.isHidden = true;
    if (!manuallyEditedAligns.some((m) => m.id === branchEdgeLeftLine.id))
      newAlignments.push(branchEdgeLeftLine);

    const branchEdgeRightId = `align-${int.id}-branch-right`;
    const branchRightPts = poliParalela(eixoBranchPtsApoio, -branchRightW, M_common, 500, branchUnitDir);
    const branchEdgeRightLine = new Alignment3D(
      branchEdgeRightId,
      branchRightPts ? branchRightPts[branchRightPts.length - 1].sta : 1000,
      branchRightPts || [
        {
          x: M_common.x + branchUnitDir.y * branchRightW - branchUnitDir.x * 500,
          y: M_common.y - branchUnitDir.x * branchRightW - branchUnitDir.y * 500,
          sta: 0,
        },
        {
          x: M_common.x + branchUnitDir.y * branchRightW + branchUnitDir.x * 500,
          y: M_common.y - branchUnitDir.x * branchRightW + branchUnitDir.y * 500,
          sta: 1000,
        },
      ],
      [],
    );
    branchEdgeRightLine.id = branchEdgeRightId;
    branchEdgeRightLine.isHidden = true;
    if (!manuallyEditedAligns.some((m) => m.id === branchEdgeRightLine.id))
      newAlignments.push(branchEdgeRightLine);

    const radiusConfigBase: Record<string, number> = {
      "M-Back-B-Arm": int.leftRadius || 15,
      "B-Arm-M-Fwd": int.rightRadius || 15,
    };
    
    const radiusConfig: Record<string, number> = {
      "M-Back-B-Arm": int.leftRadius || 15,
      "B-Arm-M-Fwd": int.rightRadius || 15,
    };

    const laneArmsBase = [
      {
        id: "M-Fwd",
        p: {
          x: M_common.x + mainUnitDir.x * 100,
          y: M_common.y + mainUnitDir.y * 100,
        },
        width: mainArmWidth,
      },
      {
        id: "M-Back",
        p: {
          x: M_common.x - mainUnitDir.x * 100,
          y: M_common.y - mainUnitDir.y * 100,
        },
        width: mainArmWidth,
      },
      {
        id: "B-Arm",
        p: { x: M_common.x + branchUnitDir.x * 100, y: M_common.y + branchUnitDir.y * 100 },
        width: branchLaneW,
      },
    ];

    const laneArms = [
      {
        id: "M-Fwd",
        p: {
          x: M_common.x + mainUnitDir.x * 100,
          y: M_common.y + mainUnitDir.y * 100,
        },
        width: mainArmWidth,
      },
      {
        id: "M-Back",
        p: {
          x: M_common.x - mainUnitDir.x * 100,
          y: M_common.y - mainUnitDir.y * 100,
        },
        width: mainArmWidth,
      },
      {
        id: "B-Arm",
        p: { x: M_common.x + branchUnitDir.x * 100, y: M_common.y + branchUnitDir.y * 100 },
        width: branchLaneW,
        leftWidth: isRightSide ? rightBranchW : leftBranchW,
        rightWidth: isRightSide ? leftBranchW : rightBranchW,
      },
    ];

    let intEdges: any[] = [];
    let intEdgesBase: any[] = [];
    try {
      // Flip Y to match the screen's handedness which PlanView uses to draw the polygon perfectly.
      const MYFlip = { x: M_common.x, y: -M_common.y };
      const laneArmsFlip = laneArms.map((a) => ({
        id: a.id,
        p: { x: a.p.x, y: -a.p.y },
        width: a.width,
        leftWidth: (a as any).leftWidth,
        rightWidth: (a as any).rightWidth,
      }));
      const laneArmsBaseFlip = laneArmsBase.map((a) => ({
        id: a.id,
        p: { x: a.p.x, y: -a.p.y },
        width: a.width,
      }));

      const res = buildIntersectionPolygon(MYFlip, laneArmsFlip, radiusConfig);
      const resBase = buildIntersectionPolygon(MYFlip, laneArmsBaseFlip, radiusConfigBase);

      const mapEdges = (edges: any[]) => edges.map((edge) => {
        if (edge.arcInfo) {
          return {
            ...edge,
            arcInfo: {
              ...edge.arcInfo,
              T1: { x: edge.arcInfo.T1.x, y: -edge.arcInfo.T1.y },
              T2: { x: edge.arcInfo.T2.x, y: -edge.arcInfo.T2.y },
              center: { x: edge.arcInfo.center.x, y: -edge.arcInfo.center.y },
              sweep: edge.arcInfo.sweep === 1 ? 0 : 1, // flip sweep direction!
            },
          };
        }
        return edge;
      });

      intEdges = mapEdges(res.edges);
      intEdgesBase = mapEdges(resBase.edges);

      /* CONCORDÂNCIA COM O BORDO REAL DA PRINCIPAL.
       *
       * Os braços que alimentam buildIntersectionPolygon são RETAS: a tangente
       * ao bordo na estaca do cruzamento, prolongada 500 m. Com a principal em
       * curva, essa reta descola do bordo poucas dezenas de metros adiante — no
       * caso relatado, −2,35 m na estaca 360 e +0,97 m na 430. O arco fecha
       * corretamente na RETA e, por isso, erra o BORDO: o quadrante não gruda.
       *
       * Aqui o arco é reconstruído contra a POLILINHA do bordo, mantendo o raio
       * de projeto: o centro de uma concordância de raio R equidista R das duas
       * bordas, logo está na interseção do offset R do bordo com o offset R da
       * reta do ramo. Construção exata, sem iteração.
       */
      /* O bordo de referência é o extraído do corredor quando existe. Quando não
       * existe (corredor sem extração, feature renomeada num rebuild), o
       * fallback é o main-edge — que agora acompanha a curva. Antes esse
       * caminho caía em polilinha vazia, a correção inteira era saltada e o
       * arco continuava amarrado ao braço RETO: o quadrante nascia longe do
       * bordo, sem tangência nenhuma.
       *
       * MAS o extraído é da passagem ANTERIOR. Na passagem em que a faixa de
       * aceleração nasce (ou muda de largura), ele ainda descreve o bordo
       * estreito: o fillete casava com o bordo velho e o quadrante ficava para
       * dentro do pavimento novo — e como o resultado estabiliza, nunca mais se
       * corrigia sozinho.
       *
       * O sinal de "velho" tem de ser RELATIVO. `bordoAlvoId` pode ser um alvo
       * escolhido à mão (o bordo do acostamento é o caso comum), que está
       * legitimamente longe do nó: medir só a distância a `M_common` reprovava
       * esse alvo para sempre e trocava-o em silêncio. Comparamos então as duas
       * hipóteses — o extraído está na posição ESTREITA ou na ALARGADA? — e só
       * o descartamos quando ele está claramente do lado estreito. Um alvo
       * afastado fica longe das duas e passa incólume. */
      const bordoExtraido: any[] =
        (newAlignments.find((a: any) => a.id === bordoAlvoId) as any)?.points ||
        (state.alignments.find((a: any) => a.id === bordoAlvoId) as any)?.points ||
        [];
      const alargNo = alargamentoEm(int.mainStation);
      const extraidoDesatualizado =
        int.hasAccelDecel &&
        alargNo > 0.05 &&
        bordoExtraido.length > 2 &&
        (mainEdgePts?.length || 0) > 2 &&
        projNaPoli(bordoExtraido, M_semFaixa).d + alargNo * 0.5 <
          projNaPoli(bordoExtraido, M_common).d;
      const bordoPts: any[] =
        (extraidoDesatualizado ? null : bordoExtraido.length > 2 ? bordoExtraido : null) ||
        mainEdgePts ||
        [];

      if (bordoPts.length > 2) {
        /* BORDO-COM-BORDO: uma única rotina, partilhada com a planta
         * (lib/intersection.ts → casarFilleteComBordos). Marca arc.__bordoOk
         * quando casa — e é esse marcador que impede o método antigo de
         * escrever por cima. */
        const corrigir = (edge: any) => {
          const mainEhT1 = mainEhT1DoEdge(String(edge?.id || ""));
          if (mainEhT1 === null) return;
          const arc = edge?.arcInfo;
          if (!arc) return;
          const Tramo = mainEhT1 ? arc.T2 : arc.T1;
          const ramoPts = escolherBordoRamo(
            [
              (newAlignments.find((a: any) => a.id === branchEdgeLeftId) as any)?.points,
              (newAlignments.find((a: any) => a.id === branchEdgeRightId) as any)?.points,
            ],
            Tramo,
          );
          if (!ramoPts) return;
          casarFilleteComBordos(edge, bordoPts as any, ramoPts as any, mainEhT1, {
            tolTang: 0.25,
            maxMigra: 6,
          });
        };

        intEdges.forEach(corrigir);
        /* VALIDAÇÃO — window.__SIMETRIA_FILLET_DEBUG = true no console.
         * Reporta, por quadrante: se casou bordo-com-bordo, o erro de tangência
         * (m) e o desvio angular entre a tangente do arco em T1 e a tangente do
         * bordo. Alvo: erro ≤ 0,02 m e desvio ≤ 0,2°. */
        if (typeof window !== "undefined" && (window as any).__SIMETRIA_FILLET_DEBUG) {
          const rel = intEdges.filter((e: any) => e.arcInfo).map((e: any) => {
            const arc = e.arcInfo;
            const mainEhT1 = mainEhT1DoEdge(String(e.id));
            const Tm = mainEhT1 ? arc.T1 : arc.T2;
            /* tangente do arco em Tm: ⊥ ao raio */
            const rx = Tm.x - arc.center.x, ry = Tm.y - arc.center.y;
            const rl = Math.hypot(rx, ry) || 1;
            const tArco = { x: -ry / rl, y: rx / rl };
            /* tangente do bordo no pé de Tm */
            let best = { d: Infinity, ux: 1, uy: 0 };
            for (let i = 0; i < bordoPts.length - 1; i++) {
              const a = bordoPts[i], b = bordoPts[i + 1];
              const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
              const l = Math.sqrt(l2) || 1;
              const t = l2 > 0 ? Math.max(0, Math.min(1, ((Tm.x - a.x) * vx + (Tm.y - a.y) * vy) / l2)) : 0;
              const d = Math.hypot(Tm.x - (a.x + t * vx), Tm.y - (a.y + t * vy));
              if (d < best.d) best = { d, ux: vx / l, uy: vy / l };
            }
            const sin = Math.abs(tArco.x * best.uy - tArco.y * best.ux);
            return {
              quadrante: e.id,
              casou: !!arc.__bordoOk,
              R: +arc.R.toFixed(3),
              distT_bordo_m: +best.d.toFixed(4),
              erroTang_m: arc.__erroTang !== undefined ? +arc.__erroTang.toFixed(4) : null,
              desvioAng_graus: +(Math.asin(Math.min(1, sin)) * 180 / Math.PI).toFixed(3),
            };
          });
          console.table(rel);
        }
        intEdgesBase.forEach(corrigir);
      }
    } catch (e) {}

    // Extract branch and main tangent stations from the computed intersection edges
    let branchTangents: { sta: number; side: "left" | "right"; pt?: {x: number, y: number} }[] = [];
    let mainTangents: { sta: number; side: "left" | "right"; pt?: {x: number, y: number}; arm?: string }[] = [];
    intEdges.forEach((edge) => {
      if (edge.arcInfo) {
        const armIds = ["M-Fwd", "M-Back", "B-Arm"];
        let rA = armIds.find((a) => edge.id.startsWith(a)) || "M-Fwd";
        let rB = armIds.find((a) => edge.id.endsWith(a)) || "B-Arm";

        const getTangents = (ptId: string) => {
          if (ptId === "M-Fwd")
            return { x: mainUnitDir.x, y: mainUnitDir.y };
          if (ptId === "M-Back")
            return { x: -mainUnitDir.x, y: -mainUnitDir.y };
          return { x: branchUnitDir.x, y: branchUnitDir.y }; // B-Arm
        };

        const dirA = getTangents(rA);
        const dirB = getTangents(rB);

        const arc = edge.arcInfo;

        /* MÉTODO ANTIGO (offset constante do EIXO, medido numa única estaca).
         * Só corre quando o bordo-com-bordo falhou: em curva ele mede a largura
         * com a normal da estaca do cruzamento (captura componente longitudinal)
         * e constrói uma paralela ao EIXO — ignora alargamento de acel/desacel,
         * superlargura e taper. Era ele que apagava a concordância correta. */
        if (!arc.__bordoOk && !int.hasSpiral) {
          const alignA = rA.startsWith("M-") ? mainAlign : branchAlign;
          const alignB = rB.startsWith("M-") ? mainAlign : branchAlign;
          const isMainA = rA.startsWith("M-");
          const isMainB = rB.startsWith("M-");
          
          const staA = isMainA ? int.mainStation : int.branchStation;
          const staB = isMainB ? int.mainStation : int.branchStation;
          
          const pCenterA = alignA.getPointAtStation(staA);
          const orCenterA = alignA.getOrientationAtStation(staA);
          const wA = (arc.T1.x - pCenterA.x)*orCenterA.nx + (arc.T1.y - pCenterA.y)*orCenterA.ny;
          
          const pCenterB = alignB.getPointAtStation(staB);
          const orCenterB = alignB.getOrientationAtStation(staB);
          const wB = (arc.T2.x - pCenterB.x)*orCenterB.nx + (arc.T2.y - pCenterB.y)*orCenterB.ny;
          
          const wCA = (arc.center.x - pCenterA.x)*orCenterA.nx + (arc.center.y - pCenterA.y)*orCenterA.ny;
          const targetWA = wA + Math.sign(wCA - wA) * arc.R;
          
          const wCB = (arc.center.x - pCenterB.x)*orCenterB.nx + (arc.center.y - pCenterB.y)*orCenterB.ny;
          const targetWB = wB + Math.sign(wCB - wB) * arc.R;
          
          const searchRange = 250;
          const polyA = [];
          for (let s = staA - searchRange; s <= staA + searchRange; s += 2) {
             const pc = alignA.getPointAtStation(s);
             const or = alignA.getOrientationAtStation(s);
             polyA.push({x: pc.x + or.nx * targetWA, y: pc.y + or.ny * targetWA, sta: s});
          }
          const polyB = [];
          for (let s = staB - searchRange; s <= staB + searchRange; s += 2) {
             const pc = alignB.getPointAtStation(s);
             const or = alignB.getOrientationAtStation(s);
             polyB.push({x: pc.x + or.nx * targetWB, y: pc.y + or.ny * targetWB, sta: s});
          }
          
          let bestC = null;
          let minDistC = Infinity;
          let bestStaA = 0, bestStaB = 0;
          for(let i=0; i<polyA.length-1; i++){
            for(let j=0; j<polyB.length-1; j++){
               const p1 = polyA[i], p2 = polyA[i+1];
               const p3 = polyB[j], p4 = polyB[j+1];
               const denom = (p4.y-p3.y)*(p2.x-p1.x) - (p4.x-p3.x)*(p2.y-p1.y);
               if (Math.abs(denom) > 1e-6) {
                 const ua = ((p4.x-p3.x)*(p1.y-p3.y) - (p4.y-p3.y)*(p1.x-p3.x))/denom;
                 const ub = ((p2.x-p1.x)*(p1.y-p3.y) - (p2.y-p1.y)*(p1.x-p3.x))/denom;
                 if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
                   const px = p1.x + ua*(p2.x-p1.x);
                   const py = p1.y + ua*(p2.y-p1.y);
                   const d = Math.hypot(px - arc.center.x, py - arc.center.y);
                   if (d < minDistC) {
                      minDistC = d;
                      bestC = {x: px, y: py};
                      bestStaA = p1.sta + ua*(p2.sta - p1.sta);
                      bestStaB = p3.sta + ub*(p4.sta - p3.sta);
                   }
                 }
               }
            }
          }
          
          if (bestC && minDistC < 150) {
             arc.center = bestC;
             const pCA_best = alignA.getPointAtStation(bestStaA);
             const orA_best = alignA.getOrientationAtStation(bestStaA);
             arc.T1 = {x: pCA_best.x + orA_best.nx * wA, y: pCA_best.y + orA_best.ny * wA};
             
             const pCB_best = alignB.getPointAtStation(bestStaB);
             const orB_best = alignB.getOrientationAtStation(bestStaB);
             arc.T2 = {x: pCB_best.x + orB_best.nx * wB, y: pCB_best.y + orB_best.ny * wB};
          }
        }

        const startAng = Math.atan2(arc.T1.y - arc.center.y, arc.T1.x - arc.center.x);
        const endAng = Math.atan2(arc.T2.y - arc.center.y, arc.T2.x - arc.center.x);
        let sweepAng = endAng - startAng;
        while (sweepAng > Math.PI) sweepAng -= 2 * Math.PI;
        while (sweepAng < -Math.PI) sweepAng += 2 * Math.PI;

        const originalPathLen = Math.abs(sweepAng) * arc.R;
        let Ls = int.spiralLength || 20;
        if (int.hasSpiral && Ls >= originalPathLen) {
          Ls = originalPathLen * 0.9;
        }
        let hasSpiral = int.hasSpiral && Ls > 0 && originalPathLen > Ls;

        let ptA = arc.T1;
        let ptB = arc.T2;

        if (hasSpiral) {
          let p = (Ls * Ls) / (24 * arc.R);
          let k = Ls / 2 - (Ls * Ls * Ls) / (240 * arc.R * arc.R);
          let trueSweepAng = Math.abs(sweepAng);
          let Ts = (arc.R + p) * Math.tan(trueSweepAng / 2) + k;
          
          let d1 = { x: -dirA.x, y: -dirA.y };
          let d2 = { x: -dirB.x, y: -dirB.y };
          const intersectLines = (p1: any, d1: any, p2: any, d2: any) => {
            const det = d1.x * d2.y - d1.y * d2.x;
            if (Math.abs(det) < 0.0001) return null;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const t = (dx * d2.y - dy * d2.x) / det;
            return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
          };
          let ptPI = intersectLines(arc.T1, d1, arc.T2, d2);
          if (ptPI) {
            ptA = { x: ptPI.x + dirA.x * Ts, y: ptPI.y + dirA.y * Ts };
            ptB = { x: ptPI.x + dirB.x * Ts, y: ptPI.y + dirB.y * Ts };
          }
        }

        const processTangent = (pt: { x: number; y: number }, alignType: "branch" | "main", arm?: string) => {
          const align = alignType === "branch" ? branchAlign : mainAlign;
          const res = align.getNearestStationAndDistance(pt.x, pt.y);
          const ptAlign = align.getPointAtStation(res.sta);
          const orient = align.getOrientationAtStation(res.sta);
          const localX =
            (pt.x - ptAlign.x) * orient.nx + (pt.y - ptAlign.y) * orient.ny;
          if (alignType === "branch") {
            branchTangents.push({
              sta: res.sta,
              side: localX > 0 ? "right" : "left",
              pt: pt
            });
          } else {
            mainTangents.push({
              sta: res.sta,
              side: localX > 0 ? "right" : "left",
              pt: pt,
              arm,
            });
          }
        };

        if (rA === "B-Arm") processTangent(ptA, "branch");
        else if (rA.startsWith("M-")) processTangent(ptA, "main", rA);
        
        if (rB === "B-Arm") processTangent(ptB, "branch");
        else if (rB.startsWith("M-")) processTangent(ptB, "main", rB);
      }
    });

    if (int.hasIsland) {
      const createIslandEdgeAlign = (edgeIdIncludes: string, alignId: string) => {
        const edge = intEdgesBase.find(e => e.id.includes(edgeIdIncludes) && e.id.includes("B-Arm"));
        if (!edge || !edge.arcInfo) return;
        const arc = edge.arcInfo;
        const isBFirst = edge.id.startsWith("B-Arm");
        const T_main = isBFirst ? arc.T2 : arc.T1;
        const T_branch = isBFirst ? arc.T1 : arc.T2;

        const W = branchLaneW; // Island is ALWAYS based on branchLaneW so it remains static
        const R_new = arc.R + W;

        // V1 and V2 are vectors from arc center to the original tangent points
        const v1 = { x: (T_main.x - arc.center.x) / arc.R, y: (T_main.y - arc.center.y) / arc.R };
        const v2 = { x: (T_branch.x - arc.center.x) / arc.R, y: (T_branch.y - arc.center.y) / arc.R };

        const vBisect = { x: v1.x + v2.x, y: v1.y + v2.y };
        const lenBisect = Math.hypot(vBisect.x, vBisect.y);
        const vBisectNorm = lenBisect > 0.001 ? { x: vBisect.x / lenBisect, y: vBisect.y / lenBisect } : { x: 0, y: 1 };
        const cosHalfTheta = lenBisect / 2;
        
        // PI of the new arc
        const distCtoPI = R_new / Math.max(cosHalfTheta, 0.001);
        const PI_new = { x: arc.center.x + vBisectNorm.x * distCtoPI, y: arc.center.y + vBisectNorm.y * distCtoPI };

        // New tangent points
        const T_main_new = { x: arc.center.x + v1.x * R_new, y: arc.center.y + v1.y * R_new };
        const T_branch_new = { x: arc.center.x + v2.x * R_new, y: arc.center.y + v2.y * R_new };

        // Start and end points of alignment trimmed exactly at the base and apex
        const safeR = Math.max(arc.R, 0.001);
        const d_base = Math.sqrt(Math.max(0, R_new * R_new - safeR * safeR));
        const sweep_to_branch = isBFirst ? (arc.sweep === 1 ? 0 : 1) : arc.sweep;
        const dx_main = T_main.x - arc.center.x;
        const dy_main = T_main.y - arc.center.y;
        const t_main_x = sweep_to_branch === 1 ? dy_main : -dy_main;
        const t_main_y = sweep_to_branch === 1 ? -dx_main : dx_main;
        const t_main_len = Math.hypot(t_main_x, t_main_y) || 1;
        const mNorm = { x: t_main_x / t_main_len, y: t_main_y / t_main_len };

        const P_base = {
          x: T_main.x - mNorm.x * d_base,
          y: T_main.y - mNorm.y * d_base
        };
        const P_start = P_base;
        const P_end = T_branch_new;

        const rawPIs = [
          { x: P_start.x, y: P_start.y, radius: 0 },
          { x: PI_new.x, y: PI_new.y, radius: R_new },
          { x: P_end.x, y: P_end.y, radius: 0 }
        ];
        const { points, keyPoints, length: algLen } = rebuildFromPIs(rawPIs);
        
        const islandAlign = new Alignment3D(alignId, algLen, points, [], keyPoints, []);
        islandAlign.id = alignId;
        islandAlign.isHidden = true;

        if (!manuallyEditedAligns.some((m) => m.id === islandAlign.id)) {
          newAlignments.push(islandAlign);
        }
      };

      createIslandEdgeAlign("M-Fwd", `align-${int.id}-island-left`);
      createIslandEdgeAlign("M-Back", `align-${int.id}-island-right`);

      const edgeFwd = intEdgesBase.find(e => e.id.includes("M-Fwd") && e.id.includes("B-Arm"));
      const edgeBack = intEdgesBase.find(e => e.id.includes("M-Back") && e.id.includes("B-Arm"));
      if (edgeFwd?.arcInfo && edgeBack?.arcInfo) {
         const c1 = edgeFwd.arcInfo.center;
         const r1 = edgeFwd.arcInfo.R + branchLaneW;
         const c2 = edgeBack.arcInfo.center;
         const r2 = edgeBack.arcInfo.R + branchLaneW;
         const dx = c2.x - c1.x;
         const dy = c2.y - c1.y;
         const d = Math.hypot(dx, dy);
         if (d > 0 && d <= r1 + r2 && d >= Math.abs(r1 - r2)) {
            // NT is intersection of inner edges
            // We intentionally DO NOT modify the branch alignment (via secundaria) here
            // to ensure its axis never changes when widening the ramps.
            // The polygon widening is handled by the B-Arm width.
         }
      }
    }

    if (branchTangents.length > 0 && mainTangents.length > 0) {
      let corteSta = int.branchStation;
      if (isStart) {
        corteSta = Math.max(...branchTangents.map((t) => t.sta));
      } else {
        corteSta = Math.min(...branchTangents.map((t) => t.sta));
      }

      /* O CORTE NÃO PODE ENGOLIR O RAMO. Uma tangente que caiu fora do ramo (ou
       * na sua ponta) fazia corteSta = fim do eixo, e a região do corredor do
       * ramo nascia com comprimento zero — alça sem pavimento nenhum. Aí vale
       * mais a âncora crua do que um corte que apaga tudo. */
      const Lramo = branchAlign.length;
      const limiteCorte = int.branchStation + Lramo * 0.5;
      if (isStart && corteSta > limiteCorte) corteSta = int.branchStation;
      if (!isStart && corteSta < int.branchStation - Lramo * 0.5) {
        corteSta = int.branchStation;
      }

      // 1. Point on branch alignment where the intersection throat begins
      const ptStart = branchAlign.getPointAtStation(corteSta);
      const orient = branchAlign.getOrientationAtStation(corteSta);

      // Tangent vector of branch pointing TOWARDS the main road
      const dirToMain = isStart
        ? { x: -orient.tx, y: -orient.ty }
        : { x: orient.tx, y: orient.ty };

      // 2. Intersection of ray (ptStart, dirToMain) with the line along main road (M_common, mainUnitDir)
      let ptEnd = { x: M_common.x, y: M_common.y };
      const denom = dirToMain.x * mainUnitDir.y - dirToMain.y * mainUnitDir.x;
      if (Math.abs(denom) > 1e-5) {
        const dx = M_common.x - ptStart.x;
        const dy = M_common.y - ptStart.y;
        const t = (dx * mainUnitDir.y - dy * mainUnitDir.x) / denom;
        if (t > 0) {
          ptEnd = {
            x: ptStart.x + t * dirToMain.x,
            y: ptStart.y + t * dirToMain.y,
          };
        }
      }

      const len = Math.max(0.1, Math.hypot(ptEnd.x - ptStart.x, ptEnd.y - ptStart.y));

      const elevStart = branchAlign.getElevationAtStation
        ? branchAlign.getElevationAtStation(corteSta)
        : 0;

      const endRes = mainAlign.getNearestStationAndDistance(ptEnd.x, ptEnd.y);
      const elevEnd = mainAlign.getElevationAtStation
        ? mainAlign.getElevationAtStation(endRes.sta)
        : 0;

      const numSteps = Math.max(10, Math.ceil(len / 1.0));
      const pts: { x: number; y: number; sta: number }[] = [];
      const profilePts: { sta: number; elev: number }[] = [];

      for (let i = 0; i <= numSteps; i++) {
        const t = i / numSteps;
        pts.push({
          x: ptStart.x + t * (ptEnd.x - ptStart.x),
          y: ptStart.y + t * (ptEnd.y - ptStart.y),
          sta: t * len,
        });
        profilePts.push({
          sta: t * len,
          elev: elevStart + t * (elevEnd - elevStart),
        });
      }

      const auxAlignId = `align-${int.id}-branch-aux`;
      const auxAlign = new Alignment3D(
        auxAlignId,
        len,
        pts,
        profilePts,
        [
          { sta: 0, x: pts[0].x, y: pts[0].y, label: "INÍCIO", pi: true },
          { sta: len, x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, label: "FIM", pi: true },
        ],
        [
          { sta: 0, elev: elevStart, label: "PIV 1" },
          { sta: len, elev: elevEnd, label: "PIV 2" },
        ]
      );
      auxAlign.id = auxAlignId;
      auxAlign.name = `${int.name || "Interseção"} Auxiliar Ramo`;
      auxAlign.layerId = "layer-auxiliar";
      if (!manuallyEditedAligns.some((m) => m.id === auxAlign.id)) {
        newAlignments.push(auxAlign);
      }
    }



    // Auto-adjust visual representation of branch alignment (Igualdade de estacas)
    const branchAIndex = newAlignments.findIndex(a => a.id === int.branchAlignmentId);
    if (branchAIndex !== -1) {
      const branchA = newAlignments[branchAIndex];
      let minSta = int.branchStation;
      let maxSta = int.branchStation;
      if (branchTangents.length > 0) {
        minSta = Math.min(...branchTangents.map((t) => t.sta));
        maxSta = Math.max(...branchTangents.map((t) => t.sta));
      }
      
      const updatedBranchA = Object.create(Object.getPrototypeOf(branchA));
      Object.assign(updatedBranchA, branchA);
      
      if (isStart) {
        updatedBranchA.visualStartStation = maxSta;
      } else {
        updatedBranchA.visualEndStation = minSta;
      }
      newAlignments[branchAIndex] = updatedBranchA;
    }

    const mainAIndex = newAlignments.findIndex(a => a.id === int.mainAlignmentId);
    if (mainAIndex !== -1) {
      const mainA = newAlignments[mainAIndex];
      let minSta = int.mainStation;
      let maxSta = int.mainStation;
      if (mainTangents.length > 0) {
        minSta = Math.min(...mainTangents.map((t) => t.sta));
        maxSta = Math.max(...mainTangents.map((t) => t.sta));
      }
      
      const updatedMainA = Object.create(Object.getPrototypeOf(mainA));
      Object.assign(updatedMainA, mainA);
      
      const isMainStart = int.mainStation < mainA.length * 0.2;
      const isMainEnd = int.mainStation > mainA.length * 0.8;
      
      if (isMainStart) {
        updatedMainA.visualStartStation = maxSta;
      } else if (isMainEnd) {
        updatedMainA.visualEndStation = minSta;
      }
      
      newAlignments[mainAIndex] = updatedMainA;
    }


    // Helper to create an Intelligent Transition / Acceleration Assembly
    // Inheriting and continuing outer components from the ramp / secondary branch assembly
    const createIntelligentAccelAssembly = (
      mainAssm: Assembly | null,
      branchAssm: Assembly | null,
      isRight: boolean,
      intData: IntersectionData,
      sideMultiplier: number,
      accelAlignId: string
    ): Assembly => {
      const targetSide = isRight ? "Right" : "Left";
      const oppositeSide = isRight ? "Left" : "Right";
      const sideKey = isRight ? "Dir" : "Esq";
      const oppSideKey = isRight ? "Esq" : "Dir";
      
      // 1. Keep opposite side components from main assembly with strict opposite-side paramName
      const oppositeComponents: SubassemblyComponent[] = (mainAssm?.components || [])
        .filter(c => c.side === oppositeSide)
        .map((c, idx) => ({
          ...c,
          id: `comp-opp-${c.type.toLowerCase().replace(/\s+/g, '_')}-${intData.id}-${sideMultiplier > 0 ? 'fwd' : 'back'}-${idx}`,
          params: {
            ...c.params,
            paramName: c.type === 'Pista' ? `PistaW_${oppSideKey}` : c.params?.paramName
          },
          layers: c.layers ? JSON.parse(JSON.stringify(c.layers)) : undefined
        }));

      // 2. Keep center components (e.g. Canteiro Central)
      const centerComponents: SubassemblyComponent[] = (mainAssm?.components || [])
        .filter(c => (c.side as string) === 'Center' || (c.side as string) === 'None' || c.type === 'Canteiro Central')
        .map((c, idx) => ({
          ...c,
          id: `comp-center-${c.type.toLowerCase().replace(/\s+/g, '_')}-${intData.id}-${sideMultiplier > 0 ? 'fwd' : 'back'}-${idx}`,
          layers: c.layers ? JSON.parse(JSON.stringify(c.layers)) : undefined
        }));
      
      // 3. On intersection side:
      // Find main lane component
      const mainPista = (mainAssm?.components || []).find(c => c.side === targetSide && c.type === "Pista");
      const mainLaneW = mainPista?.params?.width ?? 3.6;
      const mainSlope = mainPista?.params?.slope ?? (intData.mainCrossSlope || -2);
      
      // Extended main lane with width targeted ONLY to the acceleration lane alignment
      const laneComp: SubassemblyComponent = {
        id: `comp-accel-pista-${intData.id}-${sideMultiplier > 0 ? 'fwd' : 'back'}`,
        type: "Pista",
        side: targetSide as any,
        params: {
          width: mainLaneW,
          slope: mainSlope,
          depth: mainPista?.params?.depth ?? 0.2,
          paramName: `PistaW_${sideKey}`
        },
        layers: mainPista?.layers ? JSON.parse(JSON.stringify(mainPista.layers)) : {
          revestimento: [{ id: 'rev-1', name: 'Revestimento', thickness: 0.05 }],
          base: [{ id: 'base-1', name: 'Base', thickness: 0.15 }],
          subBase: [{ id: 'sub-1', name: 'Sub-base', thickness: 0.20 }]
        }
      };

      // 4. Extract and continue all outer components from the ramp/branch assembly
      const branchComponents = branchAssm?.components || [];
      const outerTypes = ['Acostamento', 'Sarjeta', 'Guia', 'Passeio', 'Ciclovia', 'Valeta', 'Faixa de Segurança', 'Barreira', 'Talude'];
      
      // Look for outer components on targetSide first; if not found, look at opposite side of branch, or main assembly fallback
      let rampOuterComponents = branchComponents.filter(c => c.side === targetSide && outerTypes.includes(c.type));
      if (rampOuterComponents.length === 0) {
        rampOuterComponents = branchComponents.filter(c => c.side === oppositeSide && outerTypes.includes(c.type));
      }
      if (rampOuterComponents.length === 0 && mainAssm?.components) {
        rampOuterComponents = mainAssm.components.filter(c => c.side === targetSide && outerTypes.includes(c.type));
      }

      // Deduplicate by component type so we don't duplicate shoulders, gutters, or taludes
      const seenTypes = new Set<string>();
      const uniqueOuterComponents = rampOuterComponents.filter(c => {
        if (seenTypes.has(c.type)) return false;
        seenTypes.add(c.type);
        return true;
      });

      // Clone ramp outer components and set side to targetSide
      const continuedComponents: SubassemblyComponent[] = uniqueOuterComponents.map((c, idx) => ({
        ...c,
        id: `comp-cont-${c.type.toLowerCase().replace(/\s+/g, '_')}-${intData.id}-${sideMultiplier > 0 ? 'fwd' : 'back'}-${idx}`,
        side: targetSide as any,
        params: { ...c.params },
        layers: c.layers ? JSON.parse(JSON.stringify(c.layers)) : undefined
      }));

      // Assemble full component list:
      // Opposite side components + Center components + extended Lane (targetSide) + continued outer components
      const allComponents = [
        ...oppositeComponents,
        ...centerComponents,
        laneComp,
        ...continuedComponents
      ];

      const assmName = `${mainAssm?.name || "Pista Principal"} + Aceleração (${branchAssm?.name || "Ramo"})`;
      const assmId = `assm-accel-${intData.id}-${sideMultiplier > 0 ? 'fwd' : 'back'}`;
      const compiled = compileSubassemblies(allComponents);

      return {
        id: assmId,
        name: assmName,
        parameters: compiled.parameters || [],
        points: compiled.points,
        links: compiled.links,
        components: allComponents
      };
    };

    let fwdAccelInfo: {
      staCurveFwd: number;
      staTaperStartFwd: number;
      staTaperEndFwd: number;
      algIdFwd: string;
      type: "Aceleração" | "Desaceleração";
      L: number;
      T: number;
    } | null = null;


    let backAccelInfo: {
      staCurveBack: number;
      staTaperStartBack: number;
      staTaperEndBack: number;
      algIdBack: string;
      type: "Aceleração" | "Desaceleração";
      L: number;
      T: number;
    } | null = null;

    if (int.hasAccelDecel) {
      const mainAlign = state.alignments.find(
        (a) => a.id === int.mainAlignmentId,
      );

      if (mainAlign) {
        const buildAccelDecelLine = (
          sideLabel: string,
          sideMultiplier: number, // -1 for back (lower stations), 1 for fwd (higher stations)
          type: "Aceleração" | "Desaceleração",
          L: number,
          T: number,
          R: number,
          trafegoAFavorDaEstaca: boolean,
        ) => {
          const W_out = type === "Desaceleração"
              ? (int.decelWidth ?? int.accelWidth ?? FAIXA_ADICIONAL_W)
              : (int.accelWidth ?? FAIXA_ADICIONAL_W);
          
          // Tangência da concordância (NAO é o nariz — é só onde o arco encosta)
          let staTang = int.mainStation + sideMultiplier * (branchLaneW + R);
          const edge = intEdges.find(e => e.id.includes(sideMultiplier === 1 ? "M-Fwd" : "M-Back") && e.id.includes("B-Arm"));
          if (edge && edge.arcInfo) {
              const arc = edge.arcInfo;
              const isBFirst = edge.id.startsWith("B-Arm");
              const T_main = isBFirst ? arc.T2 : arc.T1;

              // Project T_main to main alignment to get its exact station
              const distM = (T_main.x - M_common.x) * mainUnitDir.x + (T_main.y - M_common.y) * mainUnitDir.y;
              staTang = int.mainStation + distM;
          }

          if (mainTangents.length > 0) {
              // Ensure we use the exact tangent limits calculated by the arc fitting algorithm
              const tangSideFilter = mainTangents.filter(t => (sideMultiplier === 1 ? t.sta >= int.mainStation : t.sta <= int.mainStation));
              if (tangSideFilter.length > 0) {
                  staTang = sideMultiplier === 1 
                      ? Math.min(...tangSideFilter.map(t => t.sta))
                      : Math.max(...tangSideFilter.map(t => t.sta));
              }
          }

          const getOffsetPoint = (sta: number, extraOff: number) => {
            const pt = mainAlign.getPointAtStation(sta);
            const orientation = mainAlign.getOrientationAtStation(sta);
            // orientation.nx, orientation.ny points to the RIGHT of the main alignment
            const totalOff = isRightSide
              ? mainLaneW + extraOff
              : -mainLaneW - extraOff;
            return {
              x: pt.x + orientation.nx * totalOff,
              y: pt.y + orientation.ny * totalOff,
              sta: sta,
            };
          };


          const sta3 = staTang;
          const sta2 = staTang + sideMultiplier * L;
          const sta1 = staTang + sideMultiplier * (L + T);

          const algId = `align-${int.id}-accel-${sideMultiplier < 0 ? "back" : "fwd"}`;

          if (sideMultiplier > 0) {
            fwdAccelInfo = {
              staCurveFwd: sta3,
              staTaperStartFwd: sta2,
              staTaperEndFwd: sta1,
              algIdFwd: algId,
              type,
              L,
              T,
            };
          } else {
            backAccelInfo = {
              staCurveBack: sta3,
              staTaperStartBack: sta2,
              staTaperEndBack: sta1,
              algIdBack: algId,
              type,
              L,
              T,
            };
          }

          // Desaceleração: taper começa longe (0) e chega cheio (W_out) no nariz.
          // Aceleração: sai cheio do nariz (W_out) e fecha longe (0).
          const isDecel = type === "Desaceleração";

          /* Vértices-chave da faixa, cada um com a sua largura adicional.
           *
           * A polilinha corre NO SENTIDO DO TRÁFEGO da faixa em que a faixa
           * adicional se cola — não no do estaqueamento, que é endereço
           * arbitrário. É o que põe INÍCIO TAPER / INÍCIO L / FIM nos vértices
           * certos: lida com o tráfego, a desaceleração abre no taper e morre
           * no nariz; a aceleração nasce no nariz e fecha no taper. Ordenar por
           * estaca punha "INÍCIO TAPER" no nariz sempre que o ramo ficava do
           * lado cujo bordo corre contra o estaqueamento. */
          const chaves = [
            { sta: sta1, off: 0 },
            { sta: sta2, off: W_out },
            { sta: sta3, off: W_out },
          ].sort((a, b) => (trafegoAFavorDaEstaca ? a.sta - b.sta : b.sta - a.sta));

          /* A FAIXA ADICIONAL É UMA PARALELA À PRINCIPAL: em curva ela tem de
           * curvar junto. Com três vértices ligados por retas isso só funciona
           * em tangente — numa curva o trecho L vira corda e a faixa segue reta
           * enquanto a pista vira. Densificamos cada vão o quanto a curvatura
           * pedir e nem um ponto a mais: em tangente o vão continua com dois
           * pontos, como antes. */
          const TOL_FLECHA = 0.02; // 2 cm — mesma quantização do resto da geometria

          const divisoesDoVao = (staA: number, staB: number) => {
            const vao = Math.abs(staB - staA);
            if (vao < 1) return 1;
            // Giro do eixo ao longo do vão, medido em quatro passos.
            let giro = 0;
            let ant = mainAlign.getOrientationAtStation(staA);
            for (let k = 1; k <= 4; k++) {
              const o = mainAlign.getOrientationAtStation(staA + (staB - staA) * (k / 4));
              giro += Math.abs(
                Math.atan2(ant.tx * o.ty - ant.ty * o.tx, ant.tx * o.tx + ant.ty * o.ty),
              );
              ant = o;
            }
            if (giro < 1e-3) return 1; // tangente
            // Flecha ≈ vão·giro/(8n²) ≤ TOL_FLECHA.
            const n = Math.ceil(Math.sqrt((vao * giro) / (8 * TOL_FLECHA)));
            return Math.min(Math.max(n, 2), 120);
          };

          const pointsWorld: { x: number; y: number; sta: number }[] = [];
          const idxChave: number[] = [];
          chaves.forEach((chave, i) => {
            idxChave.push(pointsWorld.length);
            pointsWorld.push(getOffsetPoint(chave.sta, chave.off));
            const prox = chaves[i + 1];
            if (!prox) return;
            const n = divisoesDoVao(chave.sta, prox.sta);
            for (let k = 1; k < n; k++) {
              const f = k / n;
              pointsWorld.push(
                getOffsetPoint(
                  chave.sta + (prox.sta - chave.sta) * f,
                  chave.off + (prox.off - chave.off) * f,
                ),
              );
            }
          });

          let lenAccum = 0;
          const pts = [{ sta: 0, x: pointsWorld[0].x, y: pointsWorld[0].y }];
          for (let i = 1; i < pointsWorld.length; i++) {
            const prev = pointsWorld[i - 1];
            const curr = pointsWorld[i];
            lenAccum += Math.hypot(curr.x - prev.x, curr.y - prev.y);
            pts.push({ sta: lenAccum, x: curr.x, y: curr.y });
          }

          const totalLen = lenAccum;
          const role = sideMultiplier < 0 ? "M-Back" : "M-Fwd";
          // Perfil e rótulos vivem nos vértices-chave; o resto é só geometria.
          const ptsChave = idxChave.map((i) => pts[i]);
          const elevs = ptsChave.map((p) => getElevForPt({ x: p.x, y: p.y }, role));

          const profilePts = [
            { sta: 0, elev: elevs[0] },
            { sta: ptsChave[1].sta, elev: elevs[1] },
            { sta: totalLen, elev: elevs[2] },
          ];

          const labels = ptsChave.map((p, i) => {
            let lbl = "PI";
            if (isDecel) {
              if (i === 0) lbl = "INÍCIO TAPER";
              if (i === 1) lbl = "INÍCIO L";
              if (i === 2) lbl = "FIM";
            } else {
              if (i === 0) lbl = "INÍCIO L";
              if (i === 1) lbl = "INÍCIO TAPER";
              if (i === 2) lbl = "FIM";
            }
            return { sta: p.sta, x: p.x, y: p.y, label: lbl, pi: true };
          });

          const algName = `${int.name || "Interseção"} - ${type} (${sideLabel})`;

          const alg = new Alignment3D(
            algName,
            totalLen,
            pts,
            profilePts,
            labels,
            [
              { sta: 0, elev: elevs[0], label: "PIV 1" },
              { sta: totalLen, elev: elevs[2], label: "PIV 2" },
            ],
          );
          alg.id = algId;
          alg.layerId = "layer-eixo";
          if (!manuallyEditedAligns.some((m) => m.id === alg.id))
            newAlignments.push(alg);
        };

        const backType = papel.back;
        const fwdType = papel.fwd;

        const backLabel = backType === "Desaceleração" ? "Entrada Ramo" : "Saída Ramo";
        const backL = backType === "Desaceleração" ? int.decelL || 50 : int.accelL || 50;
        const backT = backType === "Desaceleração" ? int.decelT || 30 : int.accelT || 30;
        buildAccelDecelLine(
          backLabel,
          -1,
          backType,
          backL,
          backT,
          int.leftRadius || 15,
          papel.principalAFavor,
        );

        const fwdLabel = fwdType === "Desaceleração" ? "Entrada Ramo" : "Saída Ramo";
        const fwdL = fwdType === "Desaceleração" ? int.decelL || 50 : int.accelL || 50;
        const fwdT = fwdType === "Desaceleração" ? int.decelT || 30 : int.accelT || 30;
        buildAccelDecelLine(
          fwdLabel,
          1,
          fwdType,
          fwdL,
          fwdT,
          int.rightRadius || 15,
          papel.principalAFavor,
        );
      }
    }

    // Auto-adjust branch and main corridor regions to avoid overlapping the intersection
    newCorridors.forEach((c) => {
      if (c.alignmentId === int.branchAlignmentId && c.regions.length > 0) {
        if (isStart) {
          // Find the first region and set its start station to the edge of main road
          let firstReg = c.regions[0];
          for (const r of c.regions) {
            if (r.startStation < firstReg.startStation) firstReg = r;
          }
          if (firstReg.originalStartStation === undefined) {
            firstReg.originalStartStation = 0;
          }
          let minSta =
            int.branchStation +
            mainLaneW +
            Math.max(int.leftRadius || 15, int.rightRadius || 15);
          let maxSta = minSta;
          if (branchTangents.length > 0) {
            minSta = Math.min(...branchTangents.map((t) => t.sta));
            maxSta = Math.max(...branchTangents.map((t) => t.sta));
          }

          if (maxSta - minSta > 0.1) {
            firstReg.startStation = maxSta;
          } else {
            firstReg.startStation = maxSta;
          }

          /* A REGIÃO DO RAMO NÃO PODE FICAR COM COMPRIMENTO ZERO. Uma tangente
           * fora do ramo empurrava o início para o FIM do eixo e o corredor
           * nascia [85,18 → 85,18]: alça sem pavimento nenhum. Passando de
           * metade do ramo o corte perdeu sentido — vale a âncora crua. */
          const fimReg = firstReg.originalEndStation ?? firstReg.endStation;
          if (firstReg.startStation > int.branchStation + (fimReg - int.branchStation) * 0.5) {
            firstReg.startStation = Math.max(0, int.branchStation);
          }

          if (firstReg.endStation < firstReg.startStation)
            firstReg.endStation = firstReg.startStation + 0.1;
        } else {
          // Find the last region and set its end station to the edge of main road
          let lastReg = c.regions[0];
          for (const r of c.regions) {
            if (r.endStation > lastReg.endStation) lastReg = r;
          }
          if (lastReg.originalEndStation === undefined) {
            lastReg.originalEndStation = branchAlign.length;
          }
          let maxSta =
            int.branchStation -
            mainLaneW -
            Math.max(int.leftRadius || 15, int.rightRadius || 15);
          let minSta = maxSta;
          if (branchTangents.length > 0) {
            minSta = Math.min(...branchTangents.map((t) => t.sta));
            maxSta = Math.max(...branchTangents.map((t) => t.sta));
          }

          if (maxSta - minSta > 0.1) {
            lastReg.endStation = minSta;
          } else {
            lastReg.endStation = minSta;
          }

          /* Espelho do guarda acima: o corte pelo fim também não engole o ramo. */
          const iniReg = lastReg.originalStartStation ?? lastReg.startStation;
          if (lastReg.endStation < iniReg + (int.branchStation - iniReg) * 0.5) {
            lastReg.endStation = Math.min(branchAlign.length, int.branchStation);
          }

          if (lastReg.startStation > lastReg.endStation)
            lastReg.startStation = lastReg.endStation - 0.1;
        }

      }
      
      if (c.alignmentId === int.mainAlignmentId && c.regions.length > 0) {
        let staCurveBack = int.mainStation - (branchLaneW + Math.max(int.leftRadius || 15, int.rightRadius || 15));
        let staCurveFwd = int.mainStation + (branchLaneW + Math.max(int.leftRadius || 15, int.rightRadius || 15));
        
        if (mainTangents.length > 0) {
          /* POR BRAÇO, NÃO POR ESTACA. Filtrar por `sta <= mainStation` supõe que
           * as duas tangentes cercam a âncora — verdade num cruzamento, falso
           * numa alça, onde ambas ficam à FRENTE (o ramo nasce na âncora e
           * diverge). Aí a tangente de M-Back caa no balde da frente e, sendo a
           * menor, virava staCurveFwd: garganta de 18 cm. O braço de origem é
           * conhecido na extração e não depende de ordem nem de posição. */
          const porBraco = (nome: string) =>
            mainTangents.filter((t) => t.arm === nome).map((t) => t.sta);
          const back = porBraco("M-Back");
          const fwd = porBraco("M-Fwd");

          if (back.length > 0) staCurveBack = Math.min(...back);
          else {
            const atras = mainTangents.filter((t) => t.sta <= int.mainStation);
            staCurveBack = atras.length > 0
              ? Math.max(...atras.map((t) => t.sta))
              : int.mainStation;
          }

          if (fwd.length > 0) staCurveFwd = Math.max(...fwd);
          else {
            const frente = mainTangents.filter((t) => t.sta >= int.mainStation);
            staCurveFwd = frente.length > 0
              ? Math.min(...frente.map((t) => t.sta))
              : int.mainStation;
          }

          /* A garganta não pode inverter: sem braço de um lado ela encosta na
           * âncora, nunca atravessa para o outro. */
          if (staCurveBack > staCurveFwd) {
            const m = Math.min(staCurveBack, int.mainStation);
            staCurveBack = m;
            staCurveFwd = Math.max(staCurveFwd, m);
          }
        }

        if (fwdAccelInfo) {
          staCurveFwd = fwdAccelInfo.staCurveFwd;
        }
        if (backAccelInfo) {
          staCurveBack = backAccelInfo.staCurveBack;
        }

        // Find the region that covers the intersection
        let targetRegIdx = c.regions.findIndex(r => r.startStation <= int.mainStation && r.endStation >= int.mainStation);
        if (targetRegIdx === -1) {
            let closest = 0;
            let minDist = Infinity;
            c.regions.forEach((r, idx) => {
                const dist = Math.min(Math.abs(r.startStation - int.mainStation), Math.abs(r.endStation - int.mainStation));
                if (dist < minDist) {
                    minDist = dist;
                    closest = idx;
                }
            });
            targetRegIdx = closest;
        }
        
        const targetReg = c.regions[targetRegIdx];
        const currentAssm = newAssemblies.find(a => a.id === targetReg.assemblyId);
        
        if (currentAssm && currentAssm.components) {
          /* REFÚGIO: entra na montagem da garganta, do lado da ilha.
           * Montagem com id FIXO por interseção e atualizada no lugar — a
           * versão anterior punha a largura no nome, e arrastar o slider criava
           * uma montagem nova por valor (sete no catálogo em dez segundos). */
          /* Sem acoplamento pai/filho não há refúgio: ele mede-se contra o
             bordo do filho, e sem offsets não há garganta onde alargar. */
          const temAcoplamento = state.alignments.some(
            (a: any) =>
              a.id === `align-${int.id}-offset-left` ||
              a.id === `align-${int.id}-offset-right` ||
              a.parentId === `align-${int.id}-edge-left` ||
              a.parentId === `align-${int.id}-edge-right`,
          );
          const refW = int.hasRefugio && temAcoplamento ? (int.refugioWidth ?? 1.5) : 0;
          const simplifiedName = `${currentAssm.name} (Simplificada Interseção)`;
          const simpId = `assm-simp-${int.id}`;

          const typesToRemove = ['Acostamento', 'Sarjeta', 'Talude', 'Guia', 'Passeio', 'Valeta'];
          const newComponents = currentAssm.components.filter(comp => {
            if (typesToRemove.includes(comp.type)) {
              const isIntersectionSide = isRightSide ? comp.side === 'Right' : comp.side === 'Left';
              if (isIntersectionSide) {
                return false;
              }
            }
            return true;
          });
          if (refW > 0) {
            /* Pendurado na ponta do lado da ilha, depois das faixas. Só pista
             * pavimentada: sem guia, sem talude, com as camadas do catálogo. */
            newComponents.push({
              id: `sub-refugio-${int.id}`,
              type: 'Refúgio',
              side: isRightSide ? 'Right' : 'Left',
              params: { width: refW, slope: -5 },
            } as any);
          }
          const simpAssm: Assembly = {
             ...currentAssm,
             id: simpId,
             name: simplifiedName,
             components: newComponents
          };
          /* Descarta as montagens que a versão anterior espalhou pelo catálogo
           * (largura no nome) — sem isto ficam para sempre. */
          newAssemblies = newAssemblies.filter(
            (a) => a.id !== simpId
              && !/\(Simplificada Interseção · Refúgio [\d.,]+\)$/.test(a.name || ''),
          );
          newAssemblies.push(simpAssm);

          /* Garganta SEM refúgio — usada nos pedaços da garganta fora do trecho
           * entre os caps, quando o refúgio é aparado. */
          let simpSemRef: Assembly | null = null;
          if (refW > 0) {
            simpSemRef = {
              ...currentAssm,
              id: `${simpId}-sem-refugio`,
              name: `${currentAssm.name} (Simplificada Interseção · sem refúgio)`,
              components: newComponents.filter((c: any) => c.type !== 'Refúgio'),
            };
            const iSem = newAssemblies.findIndex(a => a.id === simpSemRef!.id);
            if (iSem !== -1) newAssemblies[iSem] = simpSemRef;
            else newAssemblies.push(simpSemRef);
          }

          // Build Intelligent Transition Assemblies for acceleration/deceleration zones
          let fwdAssm: Assembly | null = null;
          let backAssm: Assembly | null = null;
          const sideParamKey = isRightSide ? "PistaW_Dir" : "PistaW_Esq";

          if (fwdAccelInfo) {
            fwdAssm = createIntelligentAccelAssembly(
              currentAssm,
              branchAssembly,
              isRightSide,
              int,
              1,
              fwdAccelInfo.algIdFwd
            );
            const existingIdx = newAssemblies.findIndex(a => a.id === fwdAssm!.id);
            if (existingIdx !== -1) newAssemblies[existingIdx] = fwdAssm;
            else newAssemblies.push(fwdAssm);
          }

          if (backAccelInfo) {
            backAssm = createIntelligentAccelAssembly(
              currentAssm,
              branchAssembly,
              isRightSide,
              int,
              -1,
              backAccelInfo.algIdBack
            );
            const existingIdx = newAssemblies.findIndex(a => a.id === backAssm!.id);
            if (existingIdx !== -1) newAssemblies[existingIdx] = backAssm;
            else newAssemblies.push(backAssm);
          }
          
          let replacementRegions: CorridorRegion[] = [];
          
          const originalStart = targetReg.originalStartStation !== undefined ? targetReg.originalStartStation : targetReg.startStation;
          const originalEnd = targetReg.originalEndStation !== undefined ? targetReg.originalEndStation : targetReg.endStation;

          /* Refúgio: alarga a garganta para além dos cortes, de modo a que o bordo
           * do refúgio contra o qual os narizes são calculados seja longo o
           * suficiente — bordo curto desestabiliza a construção do nariz. */
          const corteRef = refW > 0 ? (state.refugioCortes || {})[int.id] : undefined;
          if (corteRef) {
            if (corteRef.sta0 < staCurveBack) staCurveBack = Math.max(0, corteRef.sta0 - 100);
            if (corteRef.sta1 > staCurveFwd) staCurveFwd = corteRef.sta1 + 100;
          } else if (refW > 0) {
            staCurveBack = Math.max(0, staCurveBack - 100);
            staCurveFwd = staCurveFwd + 100;
          }

          let minBoundMain = staCurveBack;
          let maxBoundMain = staCurveFwd;

          if (backAccelInfo) {
            minBoundMain = Math.min(backAccelInfo.staCurveBack, backAccelInfo.staTaperStartBack, backAccelInfo.staTaperEndBack);
          }
          if (fwdAccelInfo) {
            maxBoundMain = Math.max(fwdAccelInfo.staCurveFwd, fwdAccelInfo.staTaperStartFwd, fwdAccelInfo.staTaperEndFwd);
          }

          // 1. Pre-region (Standard Main Assembly)
          if (originalStart < minBoundMain) {
            replacementRegions.push({
               ...targetReg,
               originalEndStation: originalEnd,
               endStation: minBoundMain
            });
          }

          // 2. Back Acceleration / Deceleration Regions
          if (backAccelInfo && backAssm) {
            const staTaperEnd = Math.min(backAccelInfo.staTaperEndBack, backAccelInfo.staTaperStartBack);
            const staTaperStart = Math.max(backAccelInfo.staTaperEndBack, backAccelInfo.staTaperStartBack);
            const staCurve = Math.max(backAccelInfo.staCurveBack, staTaperStart);

            // Back Taper Region
            if (staTaperStart - staTaperEnd > 0.05) {
              replacementRegions.push({
                ...targetReg,
                id: `r-auto-${int.id}-main-back-taper`,
                name: `${targetReg.name} (Taper ${backAccelInfo.type})`,
                startStation: staTaperEnd,
                endStation: staTaperStart,
                assemblyId: backAssm.id,
                targets: {
                  [sideParamKey]: backAccelInfo.algIdBack,
                },
                originalStartStation: undefined,
                originalEndStation: undefined
              });
            }

            // Back Full-Width Region
            if (staCurve - staTaperStart > 0.05) {
              replacementRegions.push({
                ...targetReg,
                id: `r-auto-${int.id}-main-back-full`,
                name: `${targetReg.name} (Faixa ${backAccelInfo.type})`,
                startStation: staTaperStart,
                endStation: staCurve,
                assemblyId: backAssm.id,
                targets: {
                  [sideParamKey]: backAccelInfo.algIdBack,
                },
                originalStartStation: undefined,
                originalEndStation: undefined
              });
            }
          }
          
          // 3. Mid-region / Throat (Simplified Assembly connecting directly to intersection throat)
          if (staCurveFwd - staCurveBack > 0.05) {
            const base = {
              ...targetReg,
              name: `${targetReg.name.replace(' (Interseção)', '').replace(' (Pós-Interseção)', '')} (Interseção)`,
              originalStartStation: undefined,
              originalEndStation: undefined
            };
            /* CORTAR CURTO: o refúgio só vive entre os pés dos caps. Fora dali a
             * garganta segue sem refúgio. As estacas vêm da planta, que resolve
             * os narizes sobre o refúgio LONGO — construir longo, cortar curto.
             * Enquanto elas não existem (primeiro passe), o refúgio cobre a
             * garganta inteira, que é exatamente o "longo". */
            const corte = refW > 0 ? (state.refugioCortes || {})[int.id] : undefined;
            const c0 = corte ? Math.max(staCurveBack, Math.min(corte.sta0, corte.sta1)) : null;
            const c1 = corte ? Math.min(staCurveFwd, Math.max(corte.sta0, corte.sta1)) : null;

            /* SPLIT NA ESTACA DO NARIZ FÍSICO.
             *
             * O corte é EXATAMENTE sobre o NF — o pé do cap no eixo —, não sobre
             * o NT: o NF é que é a ponta de pavimento, e é contra ele que a
             * região fecha. Com refúgio, os pés dos caps são também os limites
             * do refúgio, portanto as duas listas coincidem e a garganta fica
             * com o número mínimo de regiões (a dedupe de 5 cm trata disso). */
            const cortesNF = (state.narizCortes || {})[int.id] || {};
            const staNarizes = ((state.intersectionNTs || {})[int.id] || [])
              .filter((nt: any) => {
                const k = narizKey(nt);
                const escolha = (state.ntEscolhas || {})[k];
                if (escolha === "nao") return false;
                if (escolha !== "sim" && nt.sugerido === false) return false;
                /* Só nariz de garganta corta: a ponta de cunha não encosta na
                   principal, e cortá-la ali criava região a mais. */
                return cortesNF[k] !== undefined;
              })
              .map((nt: any) => {
                const k = narizKey(nt);
                return {
                  rotulo: nt.id as string,
                  /* Enquanto a planta não publicou o NF (primeiro passe), cai no
                     NT — o corte ajusta-se sozinho no passe seguinte. */
                  sta: cortesNF[k] ?? mainAlign.getNearestStationAndDistance(nt.x, nt.y).sta,
                  /* AM antes de NF: junto ao NT é a tracejada que fecha a cunha,
                     adiante é o bordo preto. Nenhuma das duas é prolongada, então
                     a ordem sai da geometria. */
                  alvos: [tieAlignmentId(k), noseAlignmentId(k)],
                };
              })
              .filter((n) => n.sta > staCurveBack + 0.05 && n.sta < staCurveFwd - 0.05)
              .sort((a, b) => a.sta - b.sta);

            const usaRef = !!(simpSemRef && c0 !== null && c1 !== null && c1 - c0 > 0.05);
            const cortes: number[] = [staCurveBack, staCurveFwd];
            if (usaRef) cortes.push(c0 as number, c1 as number);
            staNarizes.forEach((n) => cortes.push(n.sta));
            const limites = cortes
              .sort((a, b) => a - b)
              .filter((v, i, arr) => i === 0 || v - arr[i - 1] > 0.05);

            /* A região leva o nome do nariz que ela encosta — é assim que o
               projetista a identifica na planta. "NT-03" é rótulo de desenho;
               na lista de regiões vale "Nariz 3". */
            const narizEm = (sta: number) =>
              staNarizes.find((n) => Math.abs(n.sta - sta) < 0.051);
            const rotuloEm = (sta: number) => narizEm(sta)?.rotulo;
            const nomeNariz = (rot?: string) =>
              rot ? `Nariz ${String(rot).replace(/^NT-?0*/i, "") || rot}` : undefined;

            for (let i = 0; i < limites.length - 1; i++) {
              const a = limites[i], b = limites[i + 1];
              const meio = (a + b) / 2;
              const comRef = usaRef && meio >= (c0 as number) && meio <= (c1 as number);
              const marca = [nomeNariz(rotuloEm(a)), nomeNariz(rotuloEm(b))]
                .filter(Boolean)
                .join(" → ");
              /* SÓ ESTAS FATIAS levam alvo, e só o do nariz da própria fronteira:
                 é aqui que falta asfalto entre o bordo da pista e o do nariz. O
                 resto do corredor não é tocado. */
              const meus = [narizEm(a), narizEm(b)].filter(Boolean) as { alvos: string[] }[];
              const alvoTrecho = Array.from(new Set(meus.flatMap((n) => n.alvos))).join(",");
              replacementRegions.push({
                ...base,
                id: limites.length === 2
                  ? `r-auto-${int.id}-main-throat`
                  : `r-auto-${int.id}-main-throat-${i}`,
                name: marca
                  ? `${marca}${comRef ? " · Refúgio" : ""}`
                  : `${base.name}${comRef ? " · Refúgio" : ""}`,
                startStation: a,
                endStation: b,
                assemblyId: comRef ? simpAssm.id : (simpSemRef ? simpSemRef.id : simpAssm.id),
                /* A região do REFÚGIO não leva alvo: a largura dela é a do
                   refúgio, e puxá-la para o nariz fazia a pista invadir a ilha. */
                ...(alvoTrecho && !comRef
                  ? { targetsPrefer: { [sideParamKey]: alvoTrecho } }
                  : {}),
              });
            }
          }

          // 4. Forward Acceleration / Deceleration Regions
          if (fwdAccelInfo && fwdAssm) {
            const staCurve = Math.min(fwdAccelInfo.staCurveFwd, fwdAccelInfo.staTaperStartFwd);
            const staTaperStart = Math.max(fwdAccelInfo.staCurveFwd, fwdAccelInfo.staTaperStartFwd);
            const staTaperEnd = Math.max(fwdAccelInfo.staTaperEndFwd, staTaperStart);

            // Forward Full-Width Acceleration Region (from curve tangent to start of taper)
            if (staTaperStart - staCurve > 0.05) {
              replacementRegions.push({
                ...targetReg,
                id: `r-auto-${int.id}-main-accel-full`,
                name: `${targetReg.name} (Faixa ${fwdAccelInfo.type})`,
                startStation: staCurve,
                endStation: staTaperStart,
                assemblyId: fwdAssm.id,
                targets: {
                  [sideParamKey]: fwdAccelInfo.algIdFwd,
                },
                originalStartStation: undefined,
                originalEndStation: undefined
              });
            }

            // Forward Taper Region (from start of taper to end of taper)
            if (staTaperEnd - staTaperStart > 0.05) {
              replacementRegions.push({
                ...targetReg,
                id: `r-auto-${int.id}-main-accel-taper`,
                name: `${targetReg.name} (Taper ${fwdAccelInfo.type})`,
                startStation: staTaperStart,
                endStation: staTaperEnd,
                assemblyId: fwdAssm.id,
                targets: {
                  [sideParamKey]: fwdAccelInfo.algIdFwd,
                },
                originalStartStation: undefined,
                originalEndStation: undefined
              });
            }
          }
          
          // 5. Post-region (Standard Main Assembly resumes)
          const targetEnd = targetReg.originalEndStation !== undefined ? targetReg.originalEndStation : targetReg.endStation;
          if (targetEnd > maxBoundMain) {
            replacementRegions.push({
              ...targetReg,
              id: `r-auto-${int.id}-main-post`,
              name: `${targetReg.name} (Pós-Interseção)`,
              startStation: maxBoundMain,
              endStation: targetEnd,
              originalStartStation: undefined,
              originalEndStation: undefined
            });
          }
          
          if (targetReg.startStation >= minBoundMain) {
             if (targetReg.originalStartStation === undefined) targetReg.originalStartStation = targetReg.startStation;
             if (targetReg.originalEndStation === undefined) targetReg.originalEndStation = targetReg.endStation;
             targetReg.startStation = minBoundMain;
             targetReg.endStation = minBoundMain - 0.001;
             replacementRegions.unshift(targetReg);
          }
          
          const newRegions = [...c.regions];
          newRegions.splice(targetRegIdx, 1, ...replacementRegions);
          c.regions = newRegions;
        }
      }

      /* REGIÕES ÓRFÃS — seções de interseções que não existem mais ficavam no
       * corredor, sobrepostas às atuais (no caso relatado, 355,8→471,5 da
       * interseção viva e 371,9→421,8 de uma excluída, mais uma cauda
       * duplicada). A estaca caindo em duas regiões ao mesmo tempo deixa a
       * seção ambígua na interseção. */
      const vivas = new Set(state.intersections.map((i: any) => i.id));
      const orfa = (r: any) => {
        const m = /-(int-\d+)/.exec(String(r.assemblyId || "")) || /-(int-\d+)/.exec(String(r.id || ""));
        return !!m && !vivas.has(m[1]);
      };
      const limpas = (c.regions || []).filter((r: any) => !orfa(r));
      /* Sobreposição remanescente: quem começa depois manda no trecho comum. */
      limpas.sort((a: any, b: any) => a.startStation - b.startStation);
      const semSobrepor: any[] = [];
      for (const r of limpas) {
        const ant = semSobrepor[semSobrepor.length - 1];
        if (ant && r.startStation < ant.endStation - 0.001) ant.endStation = r.startStation;
        if (r.endStation - r.startStation > 0.001) semSobrepor.push(r);
      }
      if (semSobrepor.length && semSobrepor.length !== (c.regions || []).length) {
        c.regions = semSobrepor;
      }
    });

    let maxBranchTangentDist = 0;
    branchTangents.forEach((t) => {
      const dist = Math.abs(t.sta - int.branchStation);
      if (dist > maxBranchTangentDist) maxBranchTangentDist = dist;
    });

    

    /* AUTO-REPARO DOS DOIS RAMOS.
     *
     * Projetos gravados antes da correção têm offset-left e offset-right com o
     * MESMO parentId — os selectores do assistente sobrepunham-se e os dois
     * ramos nasciam do mesmo bordo de quadrante. O resultado é uma linha só no
     * lugar de duas: um cruzamento único com o bordo da principal e, portanto,
     * só um nariz.
     *
     * Corre ANTES do laço dos quadrantes: a atribuição do nariz a cada
     * quadrante é feita por parentId dos offsets (`filhosQuad`), então com o
     * pai errado o quadrante direito ficava sem `narizesQuad` — e sem
     * `targetsPrefer`. Era exatamente esse o sintoma: os narizes apareciam,
     * mas o pavimento não fechava até a linha preta.
     *
     * Também corre antes de rebuildDynamicOffsets, que regenera a geometria a
     * partir de parentId + offsetValue. */
    {
      const pref = `align-${int.id}-`;
      const quadPorToken = (token: "M-Back" | "M-Fwd") =>
        newAlignments.find((a: any) => {
          const id = String(a?.id || "");
          if (!id.startsWith(pref)) return false;
          const resto = id.slice(pref.length);
          return resto === `${token}-B-Arm` || resto === `B-Arm-${token}`;
        });
      const qEsq = quadPorToken("M-Back");
      const qDir = quadPorToken("M-Fwd");
      const oEsq: any = newAlignments.find((a: any) => a.id === `${pref}offset-left`);
      const oDir: any = newAlignments.find((a: any) => a.id === `${pref}offset-right`);
      if (oEsq && qEsq && oEsq.parentId !== qEsq.id) oEsq.parentId = qEsq.id;
      if (oDir && qDir && oDir.parentId !== qDir.id) oDir.parentId = qDir.id;
      if (oEsq && oDir && oEsq.parentId === oDir.parentId && qEsq && qDir) {
        oEsq.parentId = qEsq.id;
        oDir.parentId = qDir.id;
      }
      /* Largura por ramo: cada offset guarda a sua, não a do outro. */
      if (oEsq && int.leftBranchWidth) oEsq.offsetValue = -Math.abs(int.leftBranchWidth);
      if (oDir && int.rightBranchWidth) oDir.offsetValue = -Math.abs(int.rightBranchWidth);
    }

    intEdges.forEach((edge) => {
      if (edge.arcInfo) {
        const arc = edge.arcInfo;
        const [roleA, roleB] = edge.id.split("-");
        // edge.id is like "M-Back-B-Arm" -> split gives ["M", "Back", "B", "Arm"] which is bad.
        // Oh, wait, in IntersectionStudio lane arms are ["M-Fwd", "M-Back", "B-Arm"].
        // radiusConfig uses `${A.id}-${B.id}` which implies "M-Back-B-Arm".
        // To accurately get the two roles, we can check the strings.
        const armIds = ["M-Fwd", "M-Back", "B-Arm"];
        let rA = armIds.find((a) => edge.id.startsWith(a)) || "M-Fwd";
        let rB = armIds.find((a) => edge.id.endsWith(a)) || "B-Arm";

        const getArmDir = (armId: string) => {
          if (armId === "M-Fwd") return mainDir;
          if (armId === "M-Back") return { x: -mainDir.x, y: -mainDir.y };
          if (armId === "B-Arm") return branchDir;
          return { x: 0, y: 0 };
        };

        const getSignSta = (role: string) => {
          if (role === "M-Fwd") return 1;
          if (role === "M-Back") return -1;
          if (role === "B-Arm") return isStart ? 1 : -1;
          return 1;
        };

        const dirA = getArmDir(rA);
        const dirB = getArmDir(rB);

        const EXT_LEN = 0;
        let extA = EXT_LEN;
        let extB = EXT_LEN;

        /* ALÇA: O EIXO DO RAMO É INTEIRO, NUM BORDO SÓ.
         *
         * No entroncamento a perna do fillete do lado do ramo só precisa chegar
         * ao ponto onde os dois quadrantes se encontram — `maxBranchTangentDist`.
         * Na alça não existe segundo quadrante: aquela perna É o bordo do ramo, e
         * tem de correr até o fim do ramo. Sem isto o eixo da alça (que é o filho
         * offset deste quadrante) morria no fim da concordância — uns 40 m — e o
         * resto do ramo ficava órfão na planta, uma reta solta a partir do PT.
         *
         * Emendar o filho não serve: o auto-reparo reancora-o ao quadrante e o
         * rebuild re-deriva o offset, apagando a emenda a cada passagem. Quem
         * tem de crescer é o quadrante — o filho segue de graça. */
        const alcaSpan =
          int.galho?.topologia === "alca"
            ? Math.max(0, (branchAlign.length || 0) - int.branchStation)
            : 0;

        if (rA === "B-Arm") {
          const res = branchAlign.getNearestStationAndDistance(arc.T1.x, arc.T1.y);
          const dist = Math.abs(res.sta - int.branchStation);
          extA = Math.max(EXT_LEN, maxBranchTangentDist - dist + EXT_LEN, alcaSpan - dist);
        }
        if (rB === "B-Arm") {
          const res = branchAlign.getNearestStationAndDistance(arc.T2.x, arc.T2.y);
          const dist = Math.abs(res.sta - int.branchStation);
          extB = Math.max(EXT_LEN, maxBranchTangentDist - dist + EXT_LEN, alcaSpan - dist);
        }

        const pts: { sta: number; x: number; y: number }[] = [];
        const profilePts: { sta: number; elev: number }[] = [];
        let runningSta = 0;

        const elevT1 = getElevForPt(arc.T1, rA);
        const elevT2 = getElevForPt(arc.T2, rB);

        const startAng = Math.atan2(
          arc.T1.y - arc.center.y,
          arc.T1.x - arc.center.x,
        );
        const endAng = Math.atan2(
          arc.T2.y - arc.center.y,
          arc.T2.x - arc.center.x,
        );

        let sweepAng = endAng - startAng;
        while (sweepAng > Math.PI) sweepAng -= 2 * Math.PI;
        while (sweepAng < -Math.PI) sweepAng += 2 * Math.PI;

        const intersectLines = (
          p1: { x: number; y: number },
          d1: { x: number; y: number },
          p2: { x: number; y: number },
          d2: { x: number; y: number },
        ) => {
          const det = d1.x * d2.y - d1.y * d2.x;
          if (Math.abs(det) < 0.0001)
            return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const t = (dx * d2.y - dy * d2.x) / det;
          return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
        };

        const originalPathLen = Math.abs(sweepAng) * arc.R;
        let Ls_global = int.spiralLength || 20;
        if (int.hasSpiral && Ls_global >= originalPathLen) {
          Ls_global = originalPathLen * 0.9;
        }

        const isLeftQuad = edge.id === "M-Back-B-Arm";
        let Le = isLeftQuad ? (int.leftSpiralIn !== undefined ? int.leftSpiralIn : (int.hasSpiral ? Ls_global : 0)) : (int.rightSpiralIn !== undefined ? int.rightSpiralIn : (int.hasSpiral ? Ls_global : 0));
        let Ls = isLeftQuad ? (int.leftSpiralOut !== undefined ? int.leftSpiralOut : (int.hasSpiral ? Ls_global : 0)) : (int.rightSpiralOut !== undefined ? int.rightSpiralOut : (int.hasSpiral ? Ls_global : 0));

        let hasSpiral = Le > 0 || Ls > 0;
        
        let pcSta = 0;
        let TS_pt = arc.T1;
        let ST_pt = arc.T2;
        let SC_pt = { x: 0, y: 0 };
        let CS_pt = { x: 0, y: 0 };
        let C_new = arc.center;

        let d1 = { x: -dirA.x, y: -dirA.y };
        let d2 = dirB;
        
        let ptPI = { x: (arc.T1.x + arc.T2.x) / 2, y: (arc.T1.y + arc.T2.y) / 2 };
        if (Math.abs(Math.cos(sweepAng / 2)) > 0.0001) {
            const trueMidAng = startAng + sweepAng / 2;
            ptPI = {
              x: arc.center.x + Math.cos(trueMidAng) * (arc.R / Math.cos(sweepAng / 2)),
              y: arc.center.y + Math.sin(trueMidAng) * (arc.R / Math.cos(sweepAng / 2))
            };
        }

        const crossP = dirA.x * dirB.y - dirA.y * dirB.x;
        const sign = crossP > 0 ? 1 : -1;
        
        let p1 = 0, k1 = 0, p2 = 0, k2 = 0;
        let Ts1 = 0, Ts2 = 0;

        if (hasSpiral && ptPI) {
          p1 = Le > 0 ? (Le * Le) / (24 * arc.R) : 0;
          k1 = Le > 0 ? Le / 2 - (Le * Le * Le) / (240 * arc.R * arc.R) : 0;
          
          p2 = Ls > 0 ? (Ls * Ls) / (24 * arc.R) : 0;
          k2 = Ls > 0 ? Ls / 2 - (Ls * Ls * Ls) / (240 * arc.R * arc.R) : 0;

          let perpA = { x: -dirA.y * sign, y: dirA.x * sign };
          let perpB = { x: dirB.y * sign, y: -dirB.x * sign };

          let pt1 = {
            x: ptPI.x + perpA.x * (arc.R + p1),
            y: ptPI.y + perpA.y * (arc.R + p1),
          };
          let pt2 = {
            x: ptPI.x + perpB.x * (arc.R + p2),
            y: ptPI.y + perpB.y * (arc.R + p2),
          };
          
          C_new = intersectLines(pt1, { x: -dirA.x, y: -dirA.y }, pt2, dirB);
          
          if (!C_new) C_new = arc.center; // Fallback

          // The projection of C_new onto the tangent is C_new - perpA * (R + p1)
          let C_tangent1 = { x: C_new.x - perpA.x * (arc.R + p1), y: C_new.y - perpA.y * (arc.R + p1) };
          // TS is at distance k1 from this projection, away from PI (direction dirA)
          TS_pt = { x: C_tangent1.x + dirA.x * k1, y: C_tangent1.y + dirA.y * k1 };
          
          let C_tangent2 = { x: C_new.x - perpB.x * (arc.R + p2), y: C_new.y - perpB.y * (arc.R + p2) };
          // ST is at distance k2 from this projection, away from PI (direction dirB)
          ST_pt = { x: C_tangent2.x + dirB.x * k2, y: C_tangent2.y + dirB.y * k2 };

          let X_sc1 = Le > 0 ? Le - Le ** 3 / (40 * arc.R ** 2) : 0;
          let Y_sc1 = Le > 0 ? Le ** 2 / (6 * arc.R) : 0;
          SC_pt = {
            x: TS_pt.x - dirA.x * X_sc1 + perpA.x * Y_sc1,
            y: TS_pt.y - dirA.y * X_sc1 + perpA.y * Y_sc1,
          };

          let X_sc2 = Ls > 0 ? Ls - Ls ** 3 / (40 * arc.R ** 2) : 0;
          let Y_sc2 = Ls > 0 ? Ls ** 2 / (6 * arc.R) : 0;
          CS_pt = {
            x: ST_pt.x - dirB.x * X_sc2 + perpB.x * Y_sc2,
            y: ST_pt.y - dirB.y * X_sc2 + perpB.y * Y_sc2,
          };
          
          Ts1 = Math.hypot(ptPI.x - TS_pt.x, ptPI.y - TS_pt.y);
          Ts2 = Math.hypot(ptPI.x - ST_pt.x, ptPI.y - ST_pt.y);
        }

        // Generate geometry pts
        // Incoming straight (only extend along branch if applicable, never along main road edge)
        if (rA === "B-Arm" && extA > 0.01) {
          if (true) {
            const alignToUse = branchAlign;
            const numSteps = Math.max(10, Math.ceil(extA / 0.2));
            const stepLen = extA / numSteps;
            const baseRes = alignToUse.getNearestStationAndDistance(TS_pt.x, TS_pt.y);
            const baseCenter = alignToUse.getPointAtStation(baseRes.sta);
            const baseOrient = alignToUse.getOrientationAtStation(baseRes.sta);
            const w = (TS_pt.x - baseCenter.x) * baseOrient.nx + (TS_pt.y - baseCenter.y) * baseOrient.ny;
            
            const signSta = getSignSta(rA);

            for (let i = numSteps; i > 0; i--) { 
               const distBack = i * stepLen;
               const staToSample = baseRes.sta + signSta * distBack;
               const pCenter = alignToUse.getPointAtStation(staToSample);
               const orient = alignToUse.getOrientationAtStation(staToSample);
               const ptCurve = {
                  x: pCenter.x + orient.nx * w,
                  y: pCenter.y + orient.ny * w
               };
               pts.push({ sta: runningSta, x: ptCurve.x, y: ptCurve.y });
               profilePts.push({ sta: runningSta, elev: getElevForPt(ptCurve, rA) });
               runningSta += stepLen;
            }
          } else {
            const ptStart = {
              x: TS_pt.x + dirA.x * extA,
              y: TS_pt.y + dirA.y * extA,
            };
            pts.push({ sta: runningSta, x: ptStart.x, y: ptStart.y });
            profilePts.push({ sta: runningSta, elev: getElevForPt(ptStart, rA) });
            runningSta += extA;
          }
        }

        let pc_sta_actual = runningSta;

        // Push TS or PC
        pts.push({ sta: runningSta, x: TS_pt.x, y: TS_pt.y });
        profilePts.push({ sta: runningSta, elev: getElevForPt(TS_pt, rA) });

        if (hasSpiral) {
          let stepsSp = 10;
          let perpA = { x: -dirA.y * sign, y: dirA.x * sign };
          if (Le > 0) {
            for (let i = 1; i <= stepsSp; i++) {
              let t = i / stepsSp;
              let L = t * Le;
              let X =
                L - Math.pow(L, 5) / (40 * Math.pow(arc.R, 2) * Math.pow(Le, 2));
              let Y = Math.pow(L, 3) / (6 * arc.R * Le);
              let x = TS_pt.x - dirA.x * X + perpA.x * Y;
              let y = TS_pt.y - dirA.y * X + perpA.y * Y;
              pts.push({ sta: runningSta + t * Le, x, y });
              profilePts.push({
                sta: runningSta + t * Le,
                elev: getElevForPt({ x, y }, rA),
              });
            }
            runningSta += Le;
          }

          // Circular arc SC to CS
          const elevT1 = getElevForPt(SC_pt, rA);
          const elevT2 = getElevForPt(CS_pt, rB);
          const sAng = Math.atan2(SC_pt.y - C_new.y, SC_pt.x - C_new.x);
          const eAng = Math.atan2(CS_pt.y - C_new.y, CS_pt.x - C_new.x);
          let swAng = eAng - sAng;
          while (swAng > Math.PI) swAng -= 2 * Math.PI;
          while (swAng < -Math.PI) swAng += 2 * Math.PI;

          const Lc = Math.abs(swAng) * arc.R;
          const stepsC = Math.max(20, Math.ceil(Lc / 0.2));
          if (Lc > 0.001) {
            for (let s = 1; s < stepsC; s++) {
              const t = s / stepsC;
              const ang = sAng + swAng * t;
              pts.push({
                sta: runningSta + t * Lc,
                x: C_new.x + arc.R * Math.cos(ang),
                y: C_new.y + arc.R * Math.sin(ang),
              });
              profilePts.push({
                sta: runningSta + t * Lc,
                elev: elevT1 + (elevT2 - elevT1) * t,
              });
            }
            pts.push({ sta: runningSta + Lc, x: CS_pt.x, y: CS_pt.y });
            profilePts.push({ sta: runningSta + Lc, elev: elevT2 });
            runningSta += Lc;
          } else if (Le > 0 || Ls > 0) {
            // Push CS pt if no curve length
            pts.push({ sta: runningSta, x: CS_pt.x, y: CS_pt.y });
            profilePts.push({ sta: runningSta, elev: elevT2 });
          }

          let perpB = { x: dirB.y * sign, y: -dirB.x * sign };
          if (Ls > 0) {
            for (let i = 1; i <= stepsSp; i++) {
              let t = 1 - i / stepsSp;
              let L = t * Ls;
              let X =
                L - Math.pow(L, 5) / (40 * Math.pow(arc.R, 2) * Math.pow(Ls, 2));
              let Y = Math.pow(L, 3) / (6 * arc.R * Ls);
              let x = ST_pt.x - dirB.x * X + perpB.x * Y;
              let y = ST_pt.y - dirB.y * X + perpB.y * Y;
              pts.push({ sta: runningSta + (i / stepsSp) * Ls, x, y });
              profilePts.push({
                sta: runningSta + (i / stepsSp) * Ls,
                elev: getElevForPt({ x, y }, rB),
              });
            }
            runningSta += Ls;
          }
        } else {
          const elevT1 = getElevForPt(arc.T1, rA);
          const elevT2 = getElevForPt(arc.T2, rB);
          const steps = Math.max(20, Math.ceil(originalPathLen / 0.2));
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const ang = startAng + sweepAng * t;
            pts.push({
              sta: runningSta + t * originalPathLen,
              x: arc.center.x + arc.R * Math.cos(ang),
              y: arc.center.y + arc.R * Math.sin(ang),
            });
            profilePts.push({
              sta: runningSta + t * originalPathLen,
              elev: elevT1 + (elevT2 - elevT1) * t,
            });
          }
          runningSta += originalPathLen;
        }

        // Outgoing straight (only extend along branch if applicable, never along main road edge)
        if (rB === "B-Arm" && extB > 0.01) {
          if (true) {
            const alignToUse = branchAlign;
            const numSteps = Math.max(10, Math.ceil(extB / 0.2));
            const stepLen = extB / numSteps;
            const baseRes = alignToUse.getNearestStationAndDistance(ST_pt.x, ST_pt.y);
            const baseCenter = alignToUse.getPointAtStation(baseRes.sta);
            const baseOrient = alignToUse.getOrientationAtStation(baseRes.sta);
            const w = (ST_pt.x - baseCenter.x) * baseOrient.nx + (ST_pt.y - baseCenter.y) * baseOrient.ny;
            
            const signSta = getSignSta(rB);

            for (let i = 1; i <= numSteps; i++) { 
               const distFwd = i * stepLen;
               const staToSample = baseRes.sta + signSta * distFwd;
               const pCenter = alignToUse.getPointAtStation(staToSample);
               const orient = alignToUse.getOrientationAtStation(staToSample);
               const ptCurve = {
                  x: pCenter.x + orient.nx * w,
                  y: pCenter.y + orient.ny * w
               };
               runningSta += stepLen;
               pts.push({ sta: runningSta, x: ptCurve.x, y: ptCurve.y });
               profilePts.push({ sta: runningSta, elev: getElevForPt(ptCurve, rB) });
            }
          } else {
            runningSta += extB;
            const ptEnd = {
              x: ST_pt.x + dirB.x * extB,
              y: ST_pt.y + dirB.y * extB,
            };
            pts.push({ sta: runningSta, x: ptEnd.x, y: ptEnd.y });
            profilePts.push({ sta: runningSta, elev: getElevForPt(ptEnd, rB) });
          }
        }

        const endSta = runningSta;

        let quadStart = 0;
        let quadEnd = runningSta;

        // Incoming part
        let startIsMain = (int.hasAccelDecel && rA.startsWith("M-")) || true;
        if (!startIsMain) {
          quadStart = EXT_LEN; // drop the incoming branch fake line
        }
        // Outgoing part
        let endIsMain = (int.hasAccelDecel && rB.startsWith("M-")) || true;
        if (!endIsMain) {
          quadEnd = runningSta - EXT_LEN; // drop the outgoing branch fake line
        }

        const keyPoints = [];

        const getAnalyticalRadius = (alignId: string, sta: number, w: number) => {
           const align = alignId.startsWith("align-" + int.id) ? null : state.alignments.find(a => a.id === alignId);
           if (!align) return null;
           for (const kp of align.keyPoints) {
              if (kp.label === "PC" || kp.label === "PRC" || kp.label === "PCC") {
                 const nextKp = align.keyPoints.find(p => p.sta > kp.sta && (p.label === "PT" || p.label === "PRC" || p.label === "PCC"));
                 if (nextKp && sta >= kp.sta - 0.01 && sta <= nextKp.sta + 0.01 && kp.radius) {
                     return Math.max(0.1, kp.rot === "cw" ? kp.radius + w : kp.radius - w);
                 }
              }
           }
           return null;
        };

        let pcIdx = pts.findIndex(p => Math.abs(p.sta - pc_sta_actual) < 0.001);
        let ptIdx = pts.findIndex(p => Math.abs(p.sta - (pc_sta_actual + originalPathLen)) < 0.001);

        const alignAUse = rA.startsWith("M-") ? mainAlign : branchAlign;
        const alignBUse = rB.startsWith("M-") ? mainAlign : branchAlign;
        const wA = rA.startsWith("M-") ? (rA === "M-Fwd" ? -mainLaneW : mainLaneW) : (rB === "M-Fwd" ? -mainLaneW : mainLaneW); // approximate, rely on baseRes
        
        // Find exact radii
        const getExactCirc = (align: Alignment3D, ptsArr: any[], idx: number, rId: string) => {
           if (idx < 0 || idx >= ptsArr.length) return null;
           const pt = ptsArr[idx];
           const res = align.getNearestStationAndDistance(pt.x, pt.y);
           
           const orient = align.getOrientationAtStation(res.sta);
           const proj = align.getPointAtStation(res.sta);
           const vx = pt.x - proj.x;
           const vy = pt.y - proj.y;
           const sign = (vx * orient.nx + vy * orient.ny) >= 0 ? 1 : -1;
           const signedW = res.dist * sign;
           
           const r = getAnalyticalRadius(align.id, res.sta, signedW);
           if (r && r < 20000) return { r };
           return null;
        };

        const mapSegmentKeys = (startIdx: number, endIdx: number, alignUse: Alignment3D, rId: string, isIncoming: boolean) => {
            if (startIdx >= endIdx) return;
            
            let currentCirc = getExactCirc(alignUse, pts, startIdx, rId);
            let lastPCIdx = currentCirc ? startIdx : -1;
            
            // If it starts as a curve, we MUST emit a PC at the start
            if (currentCirc) {
                keyPoints.push({ sta: pts[startIdx].sta, x: pts[startIdx].x, y: pts[startIdx].y, label: "PC", pi: true });
            }
            
            const getTangentForPt = (pt: any) => {
                const res = alignUse.getNearestStationAndDistance(pt.x, pt.y);
                return alignUse.getOrientationAtStation(res.sta);
            };

            const calculatePI = (idxStart: number, idxEnd: number, circ: any) => {
                let piPoint = { x: pts[Math.floor((idxStart + idxEnd) / 2)].x, y: pts[Math.floor((idxStart + idxEnd) / 2)].y };
                if (idxEnd - idxStart >= 2) {
                    const dx1 = pts[idxStart + 1].x - pts[idxStart].x;
                    const dy1 = pts[idxStart + 1].y - pts[idxStart].y;
                    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
                    const dStart = { x: dx1 / len1, y: dy1 / len1 };

                    const dx2 = pts[idxEnd].x - pts[idxEnd - 1].x;
                    const dy2 = pts[idxEnd].y - pts[idxEnd - 1].y;
                    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
                    const dEnd = { x: dx2 / len2, y: dy2 / len2 };

                    const intPt = intersectLines(pts[idxStart], dStart, pts[idxEnd], dEnd);
                    if (intPt) {
                        // Check if the intersection point is way too far (e.g. nearly parallel)
                        const distToStart = Math.sqrt(Math.pow(intPt.x - pts[idxStart].x, 2) + Math.pow(intPt.y - pts[idxStart].y, 2));
                        if (distToStart < 10000) {
                            piPoint = intPt;
                        }
                    }
                }
                const midIdx = Math.floor((idxStart + idxEnd) / 2);
                keyPoints.push({ sta: pts[midIdx].sta, x: piPoint.x, y: piPoint.y, label: "PI", radius: circ.r, pi: true });
            };
            
            if (isIncoming) {
                if (currentCirc) {
                    keyPoints.push({ sta: pts[startIdx].sta, x: pts[startIdx].x, y: pts[startIdx].y, label: "PC", pi: true });
                } else {
                    keyPoints.push({ sta: pts[startIdx].sta, x: pts[startIdx].x, y: pts[startIdx].y, label: "INICIO", pi: true });
                }
            }
            
            for (let i = startIdx + 1; i <= endIdx; i++) {
                let circ = getExactCirc(alignUse, pts, i, rId);
                
                if (isIncoming && i === endIdx) {
                   if (lastPCIdx !== -1 && lastPCIdx < endIdx) {
                        calculatePI(lastPCIdx, endIdx, currentCirc!);
                   }
                   break;
                }

                if (circ && !currentCirc) {
                    keyPoints.push({ sta: pts[i].sta, x: pts[i].x, y: pts[i].y, label: "PC", pi: true });
                    lastPCIdx = i;
                } else if (!circ && currentCirc) {
                    calculatePI(lastPCIdx, i, currentCirc);
                    keyPoints.push({ sta: pts[i].sta, x: pts[i].x, y: pts[i].y, label: "PT", pi: true });
                    lastPCIdx = -1;
                } else if (circ && currentCirc && Math.abs(circ.r - currentCirc.r) > 1) {
                    calculatePI(lastPCIdx, i, currentCirc);
                    keyPoints.push({ sta: pts[i].sta, x: pts[i].x, y: pts[i].y, label: "PCC", pi: true });
                    lastPCIdx = i;
                }
                currentCirc = circ;
            }
            
            if (!isIncoming) {
                if (lastPCIdx !== -1) {
                    calculatePI(lastPCIdx, endIdx, currentCirc!);
                    keyPoints.push({ sta: pts[endIdx].sta, x: pts[endIdx].x, y: pts[endIdx].y, label: "PT", pi: true });
                } else {
                    keyPoints.push({ sta: pts[endIdx].sta, x: pts[endIdx].x, y: pts[endIdx].y, label: "FIM", pi: true });
                }
            }
        };
mapSegmentKeys(0, pcIdx, alignAUse, rA, true);

        if (hasSpiral && ptPI) {
          keyPoints.push({
            sta: pc_sta_actual,
            x: TS_pt.x,
            y: TS_pt.y,
            label: "TS", pi: true,
          });
          keyPoints.push({
            sta: pc_sta_actual + Le,
            x: SC_pt.x,
            y: SC_pt.y,
            label: "SC",
            radius: arc.R,
          });
          keyPoints.push({
            sta: pc_sta_actual + Ts1,
            x: ptPI.x,
            y: ptPI.y,
            label: "PI",
            pi: true,
            spiralIn: Le,
            spiralOut: Ls,
          });

          const theta_s1 = Le / (2 * arc.R);
          const theta_s2 = Ls / (2 * arc.R);
          const remainingAng = Math.abs(sweepAng) - theta_s1 - theta_s2;
          let Lc = remainingAng * arc.R;
          if (Lc < 0) Lc = 0;
          
          const CS_sta_val = pc_sta_actual + Le + Lc;
          keyPoints.push({
            sta: CS_sta_val,
            x: CS_pt.x,
            y: CS_pt.y,
            label: "CS",
            radius: arc.R,
          });
          keyPoints.push({
            sta: CS_sta_val + Ls,
            x: ST_pt.x,
            y: ST_pt.y,
            label: "ST", pi: true,
          });
        } else if (ptPI) {
          keyPoints.push({
            sta: pc_sta_actual,
            x: arc.T1.x,
            y: arc.T1.y,
            label: "PC", pi: true,
          });
          const T_c = Math.abs(arc.R * Math.tan(sweepAng / 2));
          keyPoints.push({ sta: pc_sta_actual + T_c, x: ptPI.x, y: ptPI.y, label: "PI", radius: arc.R, pi: true, spiralIn: 0, spiralOut: 0 });
          
          keyPoints.push({
            sta: pc_sta_actual + originalPathLen,
            x: arc.T2.x,
            y: arc.T2.y,
            label: "PT", pi: true,
          });
        }

        mapSegmentKeys(ptIdx, pts.length - 1, alignBUse, rB, false);

        keyPoints.sort((a, b) => a.sta - b.sta);

        // Remove duplicate PIs to avoid zero-length segments
        const uniqueKeyPoints = [];
        for (const kp of keyPoints) {
            if (uniqueKeyPoints.length > 0 && kp.pi) {
                const prev = uniqueKeyPoints[uniqueKeyPoints.length - 1];
                if (prev.pi && Math.hypot(kp.x - prev.x, kp.y - prev.y) < 0.01) {
                    if (prev.label === "INICIO" || prev.label === "FIM") {
                        uniqueKeyPoints.pop();
                        uniqueKeyPoints.push(kp);
                    }
                    continue;
                }
            }
            uniqueKeyPoints.push(kp);
        }

        const intName = int.name || "Interseção";
        const alignId = `align-${int.id}-${edge.id}`;
        let nameRA = rA
          .replace("M-Fwd", "Dir")
          .replace("M-Back", "Esq")
          .replace("B-Arm", "Ramo");
        let nameRB = rB
          .replace("M-Fwd", "Dir")
          .replace("M-Back", "Esq")
          .replace("B-Arm", "Ramo");

        const alg = new Alignment3D(
          `${intName} - Bordo ${nameRA} > ${nameRB}`,
          runningSta,
          pts,
          profilePts,
          uniqueKeyPoints,
          [
            { sta: 0, elev: profilePts[0]?.elev || 0, label: "PIV 1" },
            {
              sta: runningSta,
              elev: profilePts[profilePts.length - 1]?.elev || 0,
              label: "PIV 2",
            },
          ],
        );
        alg.id = alignId;
        alg.layerId = "layer-eixo";
        if (!manuallyEditedAligns.some((m) => m.id === alg.id))
          newAlignments.push(alg);

        // Auto corridor for this quadrant
        const corrId = `corr-${int.id}-${edge.id}`;
        if (!newCorridors.some((c) => c.id === corrId)) {
          const filhosQuad = newAlignments.filter(a => a.parentId === alignId);
          const dynamicOffsets = filhosQuad.map(a => a.id).join(",");
          const auxAlignId = `align-${int.id}-branch-aux`;
          /* AUXILIAR COMO ALVO — só se for TRAÇADO DE VERDADE.
           *
           * `targets` (ao contrário de `targetsPrefer`) é resolvido SEM clamp:
           * a primeira e a última corda do alvo são prolongadas ±1000 m. Um
           * auxiliar degenerado — os 2 pontos da corda de emergência — vira
           * então uma RETA DE 2 km atravessando a interseção inteira. E como o
           * alvo escolhido é o MAIS PRÓXIMO da normal da seção, essa reta
           * fantasma ganha do bordo e do nariz em quase toda a extensão do
           * quadrante: o pavimento passa a seguir uma linha que não existe, e o
           * efeito é exatamente "não fez os targets".
           *
           * Com 3+ pontos o auxiliar é a curva equidistante real e pode entrar.
           * Com 2, fica de fora — melhor o quadrante fechar no bordo do que
           * perseguir um fantasma. */
          const auxPts = ((newAlignments.find(a => a.id === auxAlignId) as any)?.points
            || (state.alignments.find((a: any) => a.id === auxAlignId) as any)?.points
            || []) as any[];
          const hasAuxAlign = auxPts.length >= 3;
          let baseTargets = `${bordoAlvoId || int.mainTargetId || `align-${int.id}-main-edge`}`;
          if (int.hasIsland) baseTargets += `,align-${int.id}-island-left,align-${int.id}-island-right`;
          if (hasAuxAlign) baseTargets += `,${auxAlignId}`;
          const pistaWTargets = dynamicOffsets ? `${dynamicOffsets},${baseTargets}` : baseTargets;

          /* ALVO DO NARIZ — o nariz é deste quadrante quando o NT cai sobre um
           * dos filhos dele: é do cruzamento desse filho com o bordo da pista
           * que ele nasce. Assim o nariz de outro quadrante não entra aqui.
           * A cadeia do nariz já é cap laranja + bordo(s) preto(s). */
          const distPoli = (p: { x: number; y: number }, pts: any[]) => {
            let d = Infinity;
            for (let i = 0; i < pts.length - 1; i++) {
              const a = pts[i], b = pts[i + 1];
              const vx = b.x - a.x, vy = b.y - a.y;
              const l2 = vx * vx + vy * vy;
              const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2)) : 0;
              d = Math.min(d, Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy)));
            }
            return d;
          };
          const narizesQuad = ((state.intersectionNTs || {})[int.id] || [])
            .filter((nt: any) => {
              const k = narizKey(nt);
              const escolha = (state.ntEscolhas || {})[k];
              if (escolha === "nao") return false;
              if (escolha !== "sim" && nt.sugerido === false) return false;
              /* Filho recém-criado ainda não passou por rebuildDynamicOffsets:
                 se não tem pontos, usa a geometria que está em estado. */
              /* IDENTIDADE, NÃO PROXIMIDADE.
               *
               * O nariz carrega o PAR DE BORDOS que o gerou (bordoA/bordoB, os
               * ids dos alinhamentos-fonte). Atribuir por distância à geometria
               * dos filhos era frágil: dentro deste laço os filhos ainda têm os
               * pontos da passagem anterior (rebuildDynamicOffsets só corre
               * depois), então logo após reparar o pai de um offset a geometria
               * está obsoleta e a atribuição falha — o quadrante fica sem
               * targetsPrefer e o pavimento não fecha na linha preta. */
              const idsQuad = new Set<string>([alignId, ...filhosQuad.map((f: any) => String(f.id))]);
              const bA = nt.bordoA ? String(nt.bordoA) : "";
              const bB = nt.bordoB ? String(nt.bordoB) : "";
              if (bA || bB) return idsQuad.has(bA) || idsQuad.has(bB);
              /* Projeto antigo, sem o par de bordos: cai na proximidade. */
              return filhosQuad.some((f: any) => {
                let pts = f.points;
                if ((pts?.length || 0) < 2) {
                  pts = state.alignments.find((a: any) => a.id === f.id)?.points;
                }
                return (pts?.length || 0) > 1 && distPoli(nt, pts) < 1.0;
              });
            })
            /* Bordo preto E amarração DESTE ramo — a tracejada fecha a cunha
               entre o NT e o cap, e o filtro acima já garante que só entram os
               narizes deste quadrante. */
            .flatMap((nt: any) => {
              const k = narizKey(nt);
              return [tieAlignmentId(k), noseAlignmentId(k)];
            });
          
          newCorridors.push({
            id: corrId,
            name: `${intName} - Corredor Quadrante ${nameRA} > ${nameRB}`,
            alignmentId: alignId,
            regions: [
              {
                id: "r1",
                name: "Quadrante",
                startStation: quadStart,
                endStation: quadEnd,
                assemblyId: quadAssemblyId,
                targets: {
                  PistaW: pistaWTargets,
                },
                ...(narizesQuad.length
                  ? { targetsPrefer: { PistaW: narizesQuad.join(",") } }
                  : {}),
                inwardCenter: arc.center,
              },
            ],
          });
        }
      }
    });



    /* EIXO AUXILIAR DO RAMO — geometria de interseção, não raio contra o eixo.
     *
     * Era construído atirando um raio a partir de uma estaca do ramo, na
     * tangente daquela estaca, até encontrar a RETA do eixo principal. Num ramo
     * curvo essa tangente fica quase paralela à principal: o encontro dispara
     * centenas de metros pista abaixo (562 m no caso relatado) e qualquer
     * deslocamento da interseção faz a ponta varrer meio quilômetro — a
     * impressão é de que o auxiliar "ficou pra trás".
     *
     * Agora ele é definido pelos dois pontos que a engenharia manda:
     *
     *   COM RAMOS (bordos filhos ativos): começa no MEIO DO NF da garganta do
     *   ramo — o nariz entre os dois bordos filhos. É ali que o pavimento
     *   realmente termina; o cruzamento teórico dos bordos fica metros à
     *   frente, dentro do que já é nariz.
     *
     *   SEM RAMOS: começa na garganta teórica do próprio ramo, como antes.
     *
     * e morre no BORDO da principal (nunca no eixo, nunca além do nó). A
     * direção sai dos dois pontos reais — não há mais tangente mal condicionada
     * no meio do caminho. */
    const finalAlignments = rebuildDynamicOffsets(newAlignments);
    const auxRamoId = `align-${int.id}-branch-aux`;
    const auxRamoIdx = finalAlignments.findIndex((a: any) => a.id === auxRamoId);
    if (auxRamoIdx !== -1) {
      const aux: any = finalAlignments[auxRamoIdx];
      const pontos = aux.points || [];
      if (pontos.length > 1) {
        const cruzaSegs = (
          A: { x: number; y: number }[],
          B: { x: number; y: number }[],
          perto: { x: number; y: number },
        ) => {
          let melhor: { x: number; y: number } | null = null;
          let best = Infinity;
          for (let i = 0; i < A.length - 1; i++) {
            for (let j = 0; j < B.length - 1; j++) {
              const x1 = A[i].x, y1 = A[i].y, x2 = A[i + 1].x, y2 = A[i + 1].y;
              const x3 = B[j].x, y3 = B[j].y, x4 = B[j + 1].x, y4 = B[j + 1].y;
              const den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
              if (Math.abs(den) < 1e-9) continue;
              const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den;
              const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / den;
              if (t < 0 || t > 1 || u < 0 || u > 1) continue;
              const px = x1 + t * (x2 - x1);
              const py = y1 + t * (y2 - y1);
              const d = Math.hypot(px - perto.x, py - perto.y);
              if (d < best) { best = d; melhor = { x: px, y: py }; }
            }
          }
          return melhor;
        };

        const eixoMainPts: any[] = (mainAlign as any).points || [];
        const eixoRamoPts: any[] = (branchAlign as any).points || [];
        const peEm = (poly: any[], q: any) => {
          let melhor: any = { d: Infinity, x: q.x, y: q.y, ux: 0, uy: 0 };
          for (let i = 0; i < poly.length - 1; i++) {
            const a = poly[i], b = poly[i + 1];
            const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
            const len = Math.sqrt(l2) || 1;
            const t = l2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy) / l2)) : 0;
            const x = a.x + t * vx, y = a.y + t * vy;
            const d = Math.hypot(q.x - x, q.y - y);
            if (d < melhor.d) melhor = { d, x, y, ux: vx / len, uy: vy / len };
          }
          return melhor;
        };
        /* NÓ — ponto do eixo do ramo mais próximo do eixo da principal. */
        let noJ: any = null;
        let dJ = Infinity;
        for (const q of eixoRamoPts) {
          const r = peEm(eixoMainPts, q);
          if (r.d < dJ) { dJ = r.d; noJ = { x: q.x, y: q.y }; }
        }

        /* PONTO DE PARTIDA — meio do NF da garganta quando há ramos. */
        const bordosFilhos = [
          finalAlignments.find((a: any) => a.id === `align-${int.id}-offset-left`),
          finalAlignments.find((a: any) => a.id === `align-${int.id}-offset-right`),
        ].filter((a: any) => a && Array.isArray(a.points) && a.points.length > 1) as any[];

        let pIni: any = { x: pontos[0].x, y: pontos[0].y };
        let comRamos = false;
        if (bordosFilhos.length >= 2) {
          comRamos = true;

          /* ÂNCORA = o NARIZ EM ESTADO, não o alinhamento de nariz.
           *
           * Os alinhamentos `align-nariz-…` são construídos por outra passagem
           * (sobre o estado já gravado). Numa interseção recém-criada eles
           * ainda não existem quando isto corre, e o auxiliar ficava com o
           * `pontos[0]` da passagem anterior — o "MEIO NF" no topo do ramo.
           *
           * Os NTs, sim, já estão em estado assim que a planta detetou, e cada
           * um carrega o par de bordos que o gerou. O nariz entre os dois ramos
           * é o NT cujo par são exatamente os dois offsets. */
          const idsFilhosSet = new Set(bordosFilhos.map((f: any) => String(f.id)));

          /* MEIO DO NARIZ = ponto 0 da AMARRAÇÃO.
           *
           * A amarração do nariz é, por construção, [meio do cap → nariz
           * teórico]: o seu primeiro ponto É o meio do nariz físico, o mesmo
           * que o projetista vê rotulado NF-01. Reproduzir a regra aqui
           * ("recuar até o vão entre as duas bordas valer 2,00 m") dá um ponto
           * PARECIDO mas não igual — o nariz físico é construído entre os
           * offsets de 1,00 m das bordas, não entre as bordas — e o auxiliar
           * arrancava uma dezena de metros acima do NF. */
          const amarraEntreRamos = finalAlignments.find((a: any) => {
            const id = String(a?.id || "");
            if (!id.startsWith("align-amarra-")) return false;
            let dentro = 0;
            idsFilhosSet.forEach((f) => { if (id.includes(f)) dentro++; });
            return dentro === idsFilhosSet.size;
          }) as any;
          const meioNariz: any = (amarraEntreRamos?.points || [])[0] || null;
          if (meioNariz) pIni = { x: meioNariz.x, y: meioNariz.y };
          const ntEntreRamos = ((state.intersectionNTs || {})[int.id] || []).find((nt: any) => {
            const bA = nt?.bordoA ? String(nt.bordoA) : "";
            const bB = nt?.bordoB ? String(nt.bordoB) : "";
            if (!bA || !bB || bA === bB) return false;
            if (!idsFilhosSet.has(bA) || !idsFilhosSet.has(bB)) return false;
            const k = narizKey(nt);
            const escolha = (state.ntEscolhas || {})[k];
            if (escolha === "nao") return false;
            return escolha === "sim" || nt.sugerido !== false;
          }) as any;

          const A: any[] = bordosFilhos[0].points;
          const B: any[] = bordosFilhos[1].points;
          /* Com o ramo dividido as duas bordas internas NÃO se cruzam: nascem
           * juntas no eixo do secundário e abrem para a principal. Por isso o
           * ponto de partida é o NT; `cruzaSegs` fica só para o caso clássico. */
          const V = meioNariz
            ? null
            : ntEntreRamos
              ? { x: ntEntreRamos.x, y: ntEntreRamos.y }
              : cruzaSegs(A, B, pIni);
          const larguraNF = LARGURA_NARIZ_FISICO.entrada;
          if (V) {
            const dist = (p: any, poly: any[]) => peEm(poly, p).d;
            /* Anda ao longo de A, a partir do cruzamento, para o lado que ABRE. */
            const cum = [0];
            for (let i = 0; i < A.length - 1; i++) cum.push(cum[i] + Math.hypot(A[i + 1].x - A[i].x, A[i + 1].y - A[i].y));
            const sV = (() => {
              let melhor = { d: Infinity, s: 0 };
              for (let i = 0; i < A.length - 1; i++) {
                const a = A[i], b = A[i + 1];
                const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
                const t = l2 > 0 ? Math.max(0, Math.min(1, ((V.x - a.x) * vx + (V.y - a.y) * vy) / l2)) : 0;
                const d = Math.hypot(V.x - (a.x + t * vx), V.y - (a.y + t * vy));
                if (d < melhor.d) melhor = { d, s: cum[i] + t * Math.sqrt(l2) };
              }
              return melhor.s;
            })();
            const emS = (s: number) => {
              const alvo = Math.max(0, Math.min(cum[cum.length - 1], s));
              let i = 0;
              while (i < cum.length - 2 && cum[i + 1] < alvo) i++;
              const seg = cum[i + 1] - cum[i] || 1;
              const t = (alvo - cum[i]) / seg;
              return { x: A[i].x + (A[i + 1].x - A[i].x) * t, y: A[i].y + (A[i + 1].y - A[i].y) * t };
            };
            const sonda = Math.max(4, larguraNF * 3);
            const sentido = dist(emS(sV + sonda), B) >= dist(emS(sV - sonda), B) ? 1 : -1;
            let recuo = 0;
            for (let s = 0; s <= 80; s += 0.1) {
              if (dist(emS(sV + sentido * s), B) >= larguraNF) { recuo = s; break; }
            }
            if (recuo > 0) {
              const pA = emS(sV + sentido * recuo);
              const pB = peEm(B, pA);
              pIni = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
            } else {
              pIni = V;
            }
          }
        }

        const bordoMain =
          (finalAlignments.find((a: any) => a.id === bordoAlvoId) as any)?.points ||
          (finalAlignments.find((a: any) => a.id === int.mainTargetId) as any)?.points ||
          (finalAlignments.find((a: any) => a.id === `align-${int.id}-main-edge`) as any)?.points ||
          eixoMainPts;

        /* EIXO DA GARGANTA — o meio do pavimento, não uma corda.
         *
         * Sem separação por ramos não existe nariz, e a garganta é um vão único
         * entre os dois bordos de quadrante. Ligar a garganta ao bordo da
         * principal por uma RETA corta o pavimento na diagonal: a reta sai do
         * meio no topo e chega encostada num dos lados embaixo, porque os dois
         * quadrantes têm raios diferentes e abrem de forma assimétrica.
         *
         * O objeto correto é o eixo da garganta: a linha equidistante dos dois
         * bordos, que nasce tangente ao eixo secundário (onde os dois bordos são
         * simétricos em relação a ele) e vai curvando conforme o vão abre —
         * exatamente a continuação do ramo pelo meio do pavimento.
         *
         * Traçado por marcha: anda um passo na direção corrente, corta
         * perpendicularmente os dois bordos, corrige para o meio dos dois pés e
         * atualiza a direção com amortecimento. Morre no bordo da principal. */
        /* QUADRANTE POR TOKENS, não por id literal.
         *
         * A ordem do id vem da ordenação angular dos braços em
         * buildIntersectionPolygon e depende do lado e da geometria: o mesmo
         * quadrante nasce "M-Back-B-Arm" num caso e "B-Arm-M-Back" noutro.
         * Procurar pelo id literal fazia a garganta devolver null em metade dos
         * projetos — e o auxiliar caía na corda reta sem ninguém notar. */
        const quadPorTokens = (tokenMain: string): any[] => {
          const alvo = `align-${int.id}-`;
          const cand = finalAlignments.find((a: any) => {
            const id = String(a?.id || "");
            if (!id.startsWith(alvo)) return false;
            const resto = id.slice(alvo.length);
            return resto.includes("B-Arm") && resto.includes(tokenMain)
              && (resto === `${tokenMain}-B-Arm` || resto === `B-Arm-${tokenMain}`);
          });
          return (cand as any)?.points || [];
        };

        /* Traça o eixo equidistante de dois bordos, de P0 até o bordo da
         * principal: entrada tangente ao eixo do ramo, um raio só (mínimos
         * quadrados). `bordosPar` permite usar os bordos de QUADRANTE (sem
         * ramos) ou os filhos offset-left/right (com ramos). */
        const tracarEixoEquidistante = (
          bordosPar?: [any[], any[]] | null,
          P0forcado?: { x: number; y: number } | null,
        ): { x: number; y: number }[] | null => {
          const A0: any[] = bordosPar ? bordosPar[0] : quadPorTokens("M-Back");
          const B0: any[] = bordosPar ? bordosPar[1] : quadPorTokens("M-Fwd");
          if (A0.length < 2 || B0.length < 2) return null;

          /* Orienta os dois bordos do topo da garganta para a principal. */
          const orienta = (poly: any[]) =>
            peEm(bordoMain, poly[poly.length - 1]).d > peEm(bordoMain, poly[0]).d ? [...poly].reverse() : poly;
          const A = orienta(A0);
          const B = orienta(B0);

          const P0 = P0forcado
            ? { x: P0forcado.x, y: P0forcado.y }
            : { x: (A[0].x + B[0].x) / 2, y: (A[0].y + B[0].y) / 2 };
          /* Vão inicial. Com P0 forçado (meio do nariz) os dois bordos estão a
           * ~1 m cada, mas o que interessa como escala do problema é a LARGURA
           * DO NARIZ: usar a soma dos pés fazia 0,20 m em ramos que nascem
           * juntos e o traçado abortava no guarda de 0,5 m. */
          const larguraGarganta = P0forcado
            ? Math.max(LARGURA_NARIZ_FISICO.entrada, peEm(A, P0).d + peEm(B, P0).d)
            : Math.hypot(A[0].x - B[0].x, A[0].y - B[0].y);
          const peMain = peEm(bordoMain, P0);
          if (peMain.d < 1) return null;
          if (!P0forcado && larguraGarganta < 0.5) return null;

          /* Tangente de entrada: o eixo do ramo no topo da garganta, virada
             para a principal. Começar por aqui é o que dá SEQUÊNCIA ao ramo —
             o auxiliar sai tangente ao secundário, sem quebra. */
          const peRamo = peEm(eixoRamoPts, P0);
          let t0 = { x: peRamo.ux ?? 0, y: peRamo.uy ?? 0 };
          if (t0.x * (peMain.x - P0.x) + t0.y * (peMain.y - P0.y) < 0) t0 = { x: -t0.x, y: -t0.y };
          const tn = Math.hypot(t0.x, t0.y);
          if (tn < 1e-6) return null;
          t0 = { x: t0.x / tn, y: t0.y / tn };
          const n0 = { x: -t0.y, y: t0.x };

          /* AMOSTRAGEM DO MEIO DA GARGANTA.
           * Os cortes são perpendiculares à TANGENTE DE ENTRADA, não à direção
           * corrente de uma marcha: marcha realimenta o próprio erro e entra em
           * dente-de-serra (foi o traçado quebrado). Aqui cada corte é
           * independente dos outros.
           *
           * E só conta enquanto a garganta ainda é ESTRADA. Passado umas três
           * vezes e meia a largura inicial, o vão deixou de ser pavimento de
           * pista e virou funil de interseção: o "meio" dele varre dezenas de
           * metros para o lado e não representa eixo nenhum. */
          /* Com ramos o arranque é o meio do NF: o vão nasce na largura do
           * nariz (≈2 m) e abre depressa, então um limite de 12 m truncava a
           * amostragem em poucos metros e devolvia null — de volta à corda. */
          const LIM_W = P0forcado
            ? Math.max(24, larguraGarganta * 8)
            : Math.max(12, larguraGarganta * 3.5);
          const amostras: { s: number; lat: number }[] = [];
          /* PASSO ADAPTATIVO — garganta curta precisa de passo fino.
           *
           * Com o NF a 7 m do bordo da principal, o passo fixo de 1 m dava dez
           * cortes e quase todos caíam nos filtros (pés do mesmo lado, vão
           * acima do limite): a amostragem não chegava ao mínimo e o traçado
           * abortava. O auxiliar virava corda de 2 pontos — e como ele é um dos
           * targets.PistaW do quadrante, o alvo degenerado impedia o pavimento
           * de fechar na linha preta. Agora são sempre ~40 cortes, curta ou
           * longa. */
          const alcance = peMain.d * 1.4;
          const passoAm = Math.max(0.2, Math.min(1, alcance / 40));
          for (let s = passoAm; s <= alcance; s += passoAm) {
            const c0 = { x: P0.x + t0.x * s, y: P0.y + t0.y * s };
            const corte = [
              { x: c0.x - n0.x * 400, y: c0.y - n0.y * 400 },
              { x: c0.x + n0.x * 400, y: c0.y + n0.y * 400 },
            ];
            const hA = cruzaSegs(corte, A, c0);
            const hB = cruzaSegs(corte, B, c0);
            if (!hA || !hB) continue;
            const sA = (hA.x - c0.x) * n0.x + (hA.y - c0.y) * n0.y;
            const sB = (hB.x - c0.x) * n0.x + (hB.y - c0.y) * n0.y;
            if (sA * sB >= 0) continue;                     // pés do mesmo lado: corte inválido
            if (Math.hypot(hA.x - hB.x, hA.y - hB.y) > LIM_W) break;
            amostras.push({ s, lat: (sA + sB) / 2 });
          }
          /* Mínimo em número de cortes, agora que o passo é adaptativo. */
          if (amostras.length < (P0forcado ? 3 : 5)) return null;

          /* RAIO ÚNICO POR MÍNIMOS QUADRADOS, com tangência imposta em P0.
           * Um arco tangente à entrada afasta-se dela por lat ≈ s²/2R, então a
           * curvatura sai de um ajuste linear em s²/2 — uma incógnita só. Isso
           * garante geometria de projeto: entrada tangente, um raio, sem
           * quebras, e o desvio em relação ao meio medido em centímetros. */
          let num = 0;
          let den = 0;
          for (const a of amostras) {
            const x = (a.s * a.s) / 2;
            num += x * a.lat;
            den += x * x;
          }
          const invR = den > 0 ? num / den : 0;

          const pts: { x: number; y: number }[] = [{ x: P0.x, y: P0.y }];
          const PASSO = 0.5;
          const MAX = 600;

          if (Math.abs(invR) < 1 / 5000) {
            /* Garganta simétrica: o eixo é reta. */
            for (let s = PASSO; s <= MAX; s += PASSO) {
              const q = { x: P0.x + t0.x * s, y: P0.y + t0.y * s };
              const corta = cruzaSegs([pts[pts.length - 1], q], bordoMain, q);
              if (corta) { pts.push(corta); return pts.length >= 2 ? pts : null; }
              pts.push(q);
            }
            return null;
          }

          const sgn = invR > 0 ? 1 : -1;
          const R = 1 / Math.abs(invR);
          const O = { x: P0.x + n0.x * R * sgn, y: P0.y + n0.y * R * sgn };
          const th0 = Math.atan2(P0.y - O.y, P0.x - O.x);
          for (let s = PASSO; s <= MAX; s += PASSO) {
            const th = th0 + sgn * (s / R);
            const q = { x: O.x + R * Math.cos(th), y: O.y + R * Math.sin(th) };
            const corta = cruzaSegs([pts[pts.length - 1], q], bordoMain, q);
            if (corta) { pts.push(corta); break; }
            pts.push(q);
            if (Math.abs(s / R) > Math.PI / 2) break;        // nunca dobra mais de 90°
          }
          return pts.length >= 3 ? pts : null;
        };

        /* Com ramos o auxiliar é a linha do meio do NF até o bordo; sem ramos é
           o eixo da garganta. */
        /* AUXILIAR DO RAMO — sempre a curva equidistante.
         *
         * Com "separar por ramos" o arranque é o MEIO DO NF e os dois bordos
         * são os filhos offset-left/right; sem ramos o arranque é o meio do vão
         * e os bordos são os de quadrante. Em ambos os casos a geometria é a
         * mesma: entrada tangente ao eixo do ramo, um raio por mínimos
         * quadrados, morre no bordo da principal.
         *
         * Antes, com ramos, isto era saltado e o auxiliar virava uma CORDA RETA
         * de 2 pontos — a filosofia da tangente que já tínhamos abandonado.
         * Com os bordos de quadrante agora casados ao bordo real (curvo), a
         * corda ficava sozinha fora do lugar: largura do quadrante distorcida e
         * o nariz de um dos lados deixava de ser detetado. */
        let traco: { x: number; y: number }[] | null = comRamos
          ? tracarEixoEquidistante(
              [bordosFilhos[0]?.points || [], bordosFilhos[1]?.points || []],
              pIni,
            )
          : tracarEixoEquidistante();

        /* Sem ramos, se os bordos de quadrante não servirem, tenta pelos filhos. */
        if (!traco && !comRamos && bordosFilhos.length >= 2) {
          traco = tracarEixoEquidistante([bordosFilhos[0].points, bordosFilhos[1].points], null);
        }
        let motivoFallback: string | null = traco ? null : "equidistante-falhou";
        if (!traco && noJ) {
          const dirX = noJ.x - pIni.x;
          const dirY = noJ.y - pIni.y;
          const dirL = Math.hypot(dirX, dirY);
          if (dirL > 0.5) {
            const ux = dirX / dirL;
            const uy = dirY / dirL;
            const raio = [pIni, { x: pIni.x + ux * (dirL * 1.6), y: pIni.y + uy * (dirL * 1.6) }];
            const pFim = cruzaSegs(raio, bordoMain, pIni) || noJ;
            if (Math.hypot(pFim.x - pIni.x, pFim.y - pIni.y) > 0.5) traco = [pIni, pFim];
          }
        }

        if (traco && traco.length >= 2) {
          const cum = [0];
          for (let i = 1; i < traco.length; i++) {
            cum.push(cum[i - 1] + Math.hypot(traco[i].x - traco[i - 1].x, traco[i].y - traco[i - 1].y));
          }
          const L = cum[cum.length - 1];
          if (L > 0.5) {
            const e0 = aux.profile?.[0]?.elev ?? 0;
            const eN = aux.profile?.[aux.profile.length - 1]?.elev ?? e0;
            const pts = traco.map((p, i) => ({ x: p.x, y: p.y, sta: cum[i] }));
            const prof = traco.map((_, i) => ({ sta: cum[i], elev: e0 + (eN - e0) * (cum[i] / L) }));
            const refeito = new Alignment3D(
              aux.name,
              L,
              pts,
              prof,
              [
                { sta: 0, x: pts[0].x, y: pts[0].y, label: comRamos ? "MEIO NF" : "GARGANTA", pi: true },
                { sta: L, x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, label: "BORDO", pi: true },
              ],
              [
                { sta: 0, elev: prof[0].elev, label: "PIV 1" },
                { sta: L, elev: prof[prof.length - 1].elev, label: "PIV 2" },
              ],
            );
            refeito.id = auxRamoId;
            refeito.layerId = aux.layerId;
            /* Não falhar em silêncio: quem inspeciona o alinhamento vê por que
             * caiu na corda reta (2 pontos) em vez do arco. */
            (refeito as any).__motivoFallback = motivoFallback;
            (refeito as any).__comRamos = comRamos;
            if (typeof window !== "undefined" && (window as any).__SIMETRIA_AUX_DEBUG) {
              console.log("[auxiliar ramo]", {
                comRamos,
                pontos: pts.length,
                motivoFallback,
                comprimento: +L.toFixed(2),
              });
            }
            finalAlignments[auxRamoIdx] = refeito;
          }
        }
      }
    }


    set({ alignments: finalAlignments, corridors: newCorridors, assemblies: newAssemblies });
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        get().recomputeGeometry();
      });
    } else {
      get().recomputeGeometry();
    }
  },

  isDynamicInteraction: false,
  setIsDynamicInteraction: (val: boolean) => set({ isDynamicInteraction: val }),

  cadastre: null,
  setCadastre: (cadastre) => set({ cadastre }),

  planViewDimensions: { w: 0, h: 0 },
  setPlanViewDimensions: (dim) => set({ planViewDimensions: dim }),

  modifySelection: [],
  setModifySelection: (selection) => set({ modifySelection: selection }),
  modifyState: null,
  setModifyState: (state) => set({ modifyState: state }),

  /* Cadeia de origem de uma geometria extraída. `sourceFeatureId` com vírgulas
   * é uma linha unificada: várias feições costuradas. Sem isto o refresh
   * procurava uma feição chamada "P1,P2,P3", não achava, e a linha unificada
   * ficava congelada para sempre embora marcada como Vinculada. */
  cadeiaDeOrigem: (
    features: { corridorId: string; id: string; worldPoints: any[] }[],
    g: { sourceCorridorId?: string; sourceFeatureId?: string },
  ) => {
    const ids = (g.sourceFeatureId || "").split(",").filter(Boolean);
    if (ids.length === 0) return null;
    if (ids.length === 1) {
      const f = features.find((x) => x.corridorId === g.sourceCorridorId && x.id === ids[0]);
      return f && f.worldPoints.length >= 2 ? f.worldPoints : null;
    }
    const cadeias = ids
      .map((id) => features.find((x) => x.corridorId === g.sourceCorridorId && x.id === id))
      .filter((f): f is NonNullable<typeof f> => !!f && f.worldPoints.length >= 2)
      .map((f) => f.worldPoints);
    if (cadeias.length === 0) return null;
    return stitchPointChains(cadeias);
  },

  corridorFeatures: [],
  setCorridorFeatures: (features) => {
    set({ corridorFeatures: features });
    /* O bordo acabou de ser recalculado: é aqui que o nascimento dos galhos
     * volta a assentar nele. Converge porque `reancorarGalhos` só escreve
     * quando o ponto se move mais de 1 cm. */
    get().reancorarGalhos();
    const st = get();
    if (!st.drawnGeometries.some((g) => g.linked)) return;
    let changed = false;
    const next = st.drawnGeometries.map((g) => {
      if (!g.linked) return g;
      const pts = st.cadeiaDeOrigem(features, g);
      if (!pts) return g;
      const sig = geometrySignature(pts);
      if (sig === g.sourceSig) return g;
      changed = true;
      const op = { smartSnapRadius: g.smartSnapRadius ?? true, enforceTangency: g.enforceTangency ?? true };
      return { ...g, ...buildGeometry(pts, g.tolerance, op), sourceSig: sig };
    });
    if (changed) set({ drawnGeometries: next });
  },

  drawnGeometries: [],
  extractGeometryFromFeature: (corridorId, featureId, opts) => {
    const st = get();
    /* Filtro de topo: linha de datum, base, sub-base ou fundo de guia não é
     * geometria de projeto — extraí-las enchia a planta de traçados enterrados. */
    if (!isTopFeature(featureId)) return null;

    const src = st.corridorFeatures.find(
      (f) => f.corridorId === corridorId && f.id === featureId,
    );
    if (!src || src.worldPoints.length < 2) return null;
    const tolerance = opts?.tolerance ?? 0.01;
    const info = getFeatureLayerInfo(featureId);
    const layerId = opts?.layerId || info.layerId;
    if (!st.layers.some((l) => l.id === layerId)) {
      set((s) => ({
        layers: [
          ...s.layers,
          { id: layerId, name: info.layerName, color: info.color, isVisible: true, isLocked: false },
        ],
      }));
    }
    const corridorName = st.corridors.find((c) => c.id === corridorId)?.name || corridorId;
    const smartSnapRadius = opts?.smartSnapRadius ?? true;
    const enforceTangency = opts?.enforceTangency ?? true;
    const geom: DrawnGeometry = {
      id: `geom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: opts?.name || `${info.displayName} · ${corridorName}`,
      layerId,
      color: info.color,
      linked: opts?.linked ?? true,
      tolerance,
      isVisible: true,
      sourceCorridorId: corridorId,
      sourceFeatureId: featureId,
      sourceSig: geometrySignature(src.worldPoints),
      smartSnapRadius,
      enforceTangency,
      createdAt: Date.now(),
      ...buildGeometry(src.worldPoints, tolerance, { smartSnapRadius, enforceTangency }),
    };
    set((s) => ({ drawnGeometries: [...s.drawnGeometries, geom] }));
    return geom.id;
  },

  extractUnifiedGeometriesByLayer: (opts) => {
    const st = get();
    const tolerance = opts?.tolerance ?? 0.01;
    const linked = opts?.linked ?? true;
    const smartSnapRadius = opts?.smartSnapRadius ?? true;
    const enforceTangency = opts?.enforceTangency ?? true;

    const validas = (st.corridorFeatures || []).filter(
      (f) =>
        (!opts?.corridorId || f.corridorId === opts.corridorId) &&
        f.worldPoints &&
        f.worldPoints.length >= 2 &&
        isTopFeature(f.id),
    );
    if (validas.length === 0) return [];

    /* Um corredor entrega a mesma linha partida em vários trechos (uma por região).
     * Agrupamos por corredor + grupo semântico e costuramos: sai UMA linha por
     * camada, em vez de dezenas de fragmentos. */
    const grupos: Record<string, {
      info: ReturnType<typeof getFeatureLayerInfo>;
      corridorId: string;
      corridorName: string;
      cadeias: { x: number; y: number; z?: number }[][];
      featureIds: string[];
    }> = {};

    for (const f of validas) {
      const info = getFeatureLayerInfo(f.id);
      const cName = st.corridors.find((c) => c.id === f.corridorId)?.name || f.corridorId;
      const chave = `${f.corridorId}__${info.groupKey}`;
      if (!grupos[chave]) {
        grupos[chave] = { info, corridorId: f.corridorId, corridorName: cName, cadeias: [], featureIds: [] };
      }
      grupos[chave].cadeias.push(f.worldPoints);
      grupos[chave].featureIds.push(f.id);
    }

    const criados: string[] = [];
    const novas: DrawnGeometry[] = [];
    const camadas = new Map<string, { id: string; name: string; color: string }>();

    for (const g of Object.values(grupos)) {
      const costurada = stitchPointChains(g.cadeias);
      if (costurada.length < 2) continue;
      camadas.set(g.info.layerId, { id: g.info.layerId, name: g.info.layerName, color: g.info.color });

      const id = `geom-unif-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      novas.push({
        id,
        name: `${g.info.displayName} (Unificada) · ${g.corridorName}`,
        layerId: g.info.layerId,
        color: g.info.color,
        linked,
        tolerance,
        isVisible: true,
        sourceCorridorId: g.corridorId,
        sourceFeatureId: g.featureIds.join(","),
        sourceSig: geometrySignature(costurada),
        smartSnapRadius,
        enforceTangency,
        createdAt: Date.now(),
        ...buildGeometry(costurada, tolerance, { smartSnapRadius, enforceTangency }),
      });
      criados.push(id);
    }

    if (novas.length > 0) {
      const existentes = new Set(st.layers.map((l) => l.id));
      const aCriar = Array.from(camadas.values())
        .filter((l) => !existentes.has(l.id))
        .map((l) => ({ ...l, isVisible: true, isLocked: false }));
      set((s) => ({
        layers: aCriar.length ? [...s.layers, ...aCriar] : s.layers,
        drawnGeometries: [...s.drawnGeometries, ...novas],
      }));
    }
    return criados;
  },
  updateDrawnGeometry: (id, updates) =>
    set((s) => ({
      drawnGeometries: s.drawnGeometries.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    })),
  removeDrawnGeometry: (id) =>
    set((s) => ({ drawnGeometries: s.drawnGeometries.filter((g) => g.id !== id) })),
  refreshDrawnGeometry: (id) => {
    const st = get();
    const g = st.drawnGeometries.find((x) => x.id === id);
    if (!g) return;
    const pts = st.cadeiaDeOrigem(st.corridorFeatures, g);
    if (!pts) return;
    set((s) => ({
      drawnGeometries: s.drawnGeometries.map((x) =>
        x.id === id
          ? {
              ...x,
              ...buildGeometry(pts, x.tolerance, {
                smartSnapRadius: x.smartSnapRadius ?? true,
                enforceTangency: x.enforceTangency ?? true,
              }),
              sourceSig: geometrySignature(pts),
            }
          : x,
      ),
    }));
  },
  refreshLinkedGeometries: () => {
    const st = get();
    set({
      drawnGeometries: st.drawnGeometries.map((g) => {
        const pts = st.cadeiaDeOrigem(st.corridorFeatures, g);
        if (!pts) return g;
        const op = { smartSnapRadius: g.smartSnapRadius ?? true, enforceTangency: g.enforceTangency ?? true };
        return {
          ...g,
          ...buildGeometry(pts, g.tolerance, op),
          sourceSig: geometrySignature(pts),
        };
      }),
    });
  },

  points3D: [],
  addPoint3D: (pt) => set((state) => ({ 
    points3D: [...state.points3D, { ...pt, id: `pt-${Date.now()}-${Math.floor(Math.random() * 1000)}` }] 
  })),
  removePoint3D: (id) => set((state) => ({ points3D: state.points3D.filter(p => p.id !== id) })),
  clearPoints3D: () => set({ points3D: [] }),
  updatePoint3D: (id, updates) => set((state) => ({
    points3D: state.points3D.map(p => p.id === id ? { ...p, ...updates } : p)
  })),

  lines3D: [],
  addLine3D: (line) => set((state) => ({
    lines3D: [...state.lines3D, { ...line, id: `line-${Date.now()}-${Math.floor(Math.random() * 1000)}` }]
  })),
  removeLine3D: (id) => set((state) => ({ lines3D: state.lines3D.filter(l => l.id !== id) })),
  clearLines3D: () => set({ lines3D: [] }),
  updateLine3D: (id, updates) => set((state) => ({
    lines3D: state.lines3D.map(l => l.id === id ? { ...l, ...updates } : l)
  })),

  profileLines: [],
  addProfileLine: (line) => set((state) => ({
    profileLines: [...state.profileLines, { ...line, id: `pl-${Date.now()}-${Math.floor(Math.random() * 1000)}` }]
  })),
  removeProfileLine: (id) => set((state) => ({ profileLines: state.profileLines.filter(l => l.id !== id) })),
  updateProfileLine: (id, updates) => set((state) => ({
    profileLines: state.profileLines.map(l => l.id === id ? { ...l, ...updates } : l)
  })),

  pendingProfileLineStart: null,
  setPendingProfileLineStart: (pt) => set({ pendingProfileLineStart: pt }),

  circles3D: [],
  addCircle3D: (circle) => set((state) => ({
    circles3D: [...(state.circles3D || []), { ...circle, id: `circle-${Date.now()}-${Math.floor(Math.random() * 1000)}` }]
  })),
  removeCircle3D: (id) => set((state) => ({ circles3D: (state.circles3D || []).filter(c => c.id !== id) })),
  clearCircles3D: () => set({ circles3D: [] }),
  updateCircle3D: (id, updates) => set((state) => ({
    circles3D: (state.circles3D || []).map(c => c.id === id ? { ...c, ...updates } : c)
  })),

  dimensions: [],
  addDimension: (dim) => set((state) => ({
    dimensions: [...(state.dimensions || []), { ...dim, id: `dim-${Date.now()}-${Math.floor(Math.random() * 1000)}` }]
  })),
  removeDimension: (id) => set((state) => ({ dimensions: (state.dimensions || []).filter(d => d.id !== id) })),
  updateDimension: (id, updates) => set((state) => ({
    dimensions: (state.dimensions || []).map(d => d.id === id ? { ...d, ...updates } : d)
  })),
  clearDimensions: () => set({ dimensions: [] }),

  planView2DTransform: { scale: 1, dx: 0, dy: 0 },
  hasAutoFitPlanView: false,
  setHasAutoFitPlanView: (hasFit) => set({ hasAutoFitPlanView: hasFit }),
  setPlanView2DTransform: (transform) =>
    set((state) => ({
      planView2DTransform:
        typeof transform === "function"
          ? transform(state.planView2DTransform)
          : transform,
    })),
  planView3DCamera: null,
  setPlanView3DCamera: (camera) => set({ planView3DCamera: camera }),

  extractFeatureLine: (corridorId: string, featureId: string) => {
    const state = get();
    const corridor = state.corridors.find((c) => c.id === corridorId);
    if (!corridor) return;
    const parentAlign = state.alignments.find(
      (a) => a.id === corridor.alignmentId,
    );
    if (!parentAlign) return;

    let minSta = Infinity;
    let maxSta = -Infinity;

    // Find the range of the regions
    for (const r of corridor.regions) {
      if (r.startStation < minSta) minSta = r.startStation;
      if (r.endStation > maxSta) maxSta = r.endStation;
    }

    if (minSta === Infinity || maxSta === -Infinity) return;

    const SAMPLE_STEP = corridor.frequency || state.globalCorridorFrequency || 1; // 1m resolution for smoothness
    
    // First, evaluate at minSta to find matching feature keys
    const firstRes = evaluateAssemblyAtStation(
        minSta,
        state.assemblies,
        state.corridors,
        state.surface,
        state.alignments,
        corridor.alignmentId,
        null
    );
    
    if (!firstRes || !firstRes.points) return;
    
    // Find all keys that match the featureId exactly or as a substring
    let matchingKeys = [featureId];
    if (!firstRes.points[featureId]) {
        matchingKeys = Object.keys(firstRes.points).filter(k => k.includes(featureId));
        if (matchingKeys.length === 0) return; // No matches found
    }
    
    let lastAlignId = undefined;
    const newAlignments = [];
    
    for (const targetKey of matchingKeys) {
        const pts = [];
        const keyPts = [];
        const profPts = [];
        
        const processStation = (s) => {
          const result = evaluateAssemblyAtStation(
            s,
            state.assemblies,
            state.corridors,
            state.surface,
            state.alignments,
            corridor.alignmentId,
            null
          );
          if (result && result.points[targetKey]) {
            const ptLocal = result.points[targetKey];
            const ptW = parentAlign.getPointAtStation(s);
            const orientation = parentAlign.getOrientationAtStation(s);
            const fg = parentAlign.getElevationAtStation(s) || 0;

            const wx = ptW.x + orientation.nx * ptLocal.x;
            const wy = ptW.y + orientation.ny * ptLocal.x;
            const wElev = fg + ptLocal.y;

            const currLen =
              pts.length > 0
                ? pts[pts.length - 1].sta +
                  Math.hypot(wx - pts[pts.length - 1].x, wy - pts[pts.length - 1].y)
                : 0;

            pts.push({ sta: currLen, x: wx, y: wy });
            profPts.push({ sta: currLen, elev: wElev });

            if (pts.length === 1) {
              keyPts.push({ sta: currLen, x: wx, y: wy, label: "INICIO" });
            }
          }
        };

        // Sample along the corridor regions
        for (let s = minSta; s <= maxSta; s += SAMPLE_STEP) {
            processStation(s);
        }

        if (maxSta > minSta && (maxSta - minSta) % SAMPLE_STEP !== 0) {
            processStation(maxSta);
        }

        if (pts.length < 2) continue;

        keyPts.push({
          sta: pts[pts.length - 1].sta,
          x: pts[pts.length - 1].x,
          y: pts[pts.length - 1].y,
          label: "FIM",
        });

        /* ID ESTÁVEL: corredor + componente já identificam a linha de feição de
         * forma única. O timestamp que havia aqui fazia cada re-extração nascer
         * com id novo, órfãnando qualquer alvo de corredor que apontasse para a
         * linha anterior — calado. Sem ele, re-extrair ATUALIZA a mesma linha. */
        const newAlignId = `feat-${corridorId}-${targetKey}`;
        const newAlignName = `Feature do Alinhamento ${parentAlign.name || ""} (${targetKey})`;

        const simplifiedProfPts = [];
        if (profPts.length > 0) {
          let lastElev = profPts[0].elev;
          simplifiedProfPts.push({ sta: 0, elev: lastElev, label: "PIV 1" });
          for (let i = 1; i < profPts.length - 1; i++) {
            const slope1 =
              (profPts[i].elev - profPts[i - 1].elev) /
              (profPts[i].sta - profPts[i - 1].sta);
            const slope2 =
              (profPts[i + 1].elev - profPts[i].elev) /
              (profPts[i + 1].sta - profPts[i].sta);
            if (Math.abs(slope1 - slope2) > 0.01) {
              simplifiedProfPts.push({
                sta: profPts[i].sta,
                elev: profPts[i].elev,
              });
            }
          }
          simplifiedProfPts.push({
            sta: profPts[profPts.length - 1].sta,
            elev: profPts[profPts.length - 1].elev,
            label: "PIV " + (simplifiedProfPts.length + 1),
          });
        }

        const newAlign = new Alignment3D(
          newAlignName,
          pts[pts.length - 1].sta,
          pts,
          profPts,
          keyPts,
          simplifiedProfPts,
        );
        newAlign.id = newAlignId;
        newAlign.parentId = parentAlign.id;
        // Nasce VISÍVEL: extrair um alinhamento de componente e não ver nada na
        // planta faz o botão parecer quebrado.
        newAlign.isHidden = false;
        newAlign.layerId = parentAlign.layerId;
        
        newAlignments.push(newAlign);
        lastAlignId = newAlignId;
    }
    
    if (newAlignments.length > 0) {
        /* Re-extração substitui a linha antiga no lugar, conservando o id — e
         * portanto os alvos que apontam para ela. Camada, cor e visibilidade
         * são do usuário: sobrevivem. */
        const novosPorId = new Map(newAlignments.map((a) => [a.id, a]));
        newAlignments.forEach((n: any) => {
          const v: any = state.alignments.find((a) => a.id === n.id);
          if (!v) return;
          n.layerId = v.layerId ?? n.layerId;
          n.color = v.color ?? n.color;
          n.isHidden = v.isHidden ?? n.isHidden;
          n.isLocked = v.isLocked ?? n.isLocked;
          n.styles = v.styles ?? n.styles;
          n.profileName = v.profileName ?? n.profileName;
          n.profileColor = v.profileColor ?? n.profileColor;
          n.isProfileHidden = v.isProfileHidden ?? n.isProfileHidden;
        });
        const mantidos = state.alignments.map((a) => novosPorId.get(a.id) || a);
        const inéditos = newAlignments.filter(
          (n) => !state.alignments.some((a) => a.id === n.id),
        );
        set({
          alignments: [...mantidos, ...inéditos],
          activeAlignmentId: lastAlignId,
        });
        get().recomputeGeometry();
    }
    
    return lastAlignId;
  },
resetProject: () => {
    /* Caches de "já sincronizado" são de módulo: sem zerar, o projeto novo pode
     * herdar o hash do anterior e pular a primeira publicação. */
    __ntBordosHash = null;
    __narizAlignSig = null;
    __narizAlignN = -1;
    set({
      surface: null,
      surfaces: [],
      alignments: [],
      activeAlignmentId: null,
      cadastre: null,
      corridors: [],
      assemblies: [],
      selectedAssemblyId: null,
      intersections: [],
      editingIntersectionId: null,
      selectedIntersectionId: null,
      laneDirections: {},
      interactionMode: "none",
      tempPIs: [],
      computedPoints: {},
      activeLinks: [],
      drawnGeometries: [],
      corridorFeatures: [],
      station: 0,
    });
    get().recomputeGeometry();
  },

  loadProject: (data: any) => {
    __ntBordosHash = null;
    __narizAlignSig = null;
    __narizAlignN = -1;
    const restoredAlignments = (data.alignments || []).map((a: any) => {
      const alg = new Alignment3D(a.name, a.length, a.points, a.profile, a.keyPoints, a.keyProfilePoints);
      alg.id = a.id;
      alg.isHidden = a.isHidden;
      alg.superelevationData = a.superelevationData;
      alg.isManuallyEdited = a.isManuallyEdited;
      alg.parentId = a.parentId;
      alg.offsetValue = a.offsetValue;
      alg.layerId = a.layerId;
      alg.isProfileHidden = a.isProfileHidden;
      alg.profileColor = a.profileColor;
      alg.profileName = a.profileName;
      alg.color = a.color;
      alg.isLocked = a.isLocked;
      // alinhamento de nariz: sem estes campos o vínculo se perde no load e a
      // reconstrução duplicaria o alinhamento
      alg.isNoseAlignment = a.isNoseAlignment;
      alg.noseKey = a.noseKey;
      alg.noseSource = a.noseSource;
      alg.noseSegments = a.noseSegments;
      return alg;
    });

    /* MIGRAÇÃO — linhas de feição com id datado.
     * Ids antigos eram `feat-<corredor>-<componente>-<Date.now()>`: cada
     * re-extração gerava um id novo e órfãnava os alvos. Aqui o sufixo de 13
     * dígitos cai e os alvos que apontavam para o id datado são reescritos.
     * Se duas linhas colapsarem no mesmo id, fica a primeira — as outras eram
     * gerações velhas da MESMA linha. */
    const deParaFeat: Record<string, string> = {};
    let alinhamentosMigrados = restoredAlignments;
    {
      const vistos = new Set<string>();
      const out: any[] = [];
      for (const alg of restoredAlignments as any[]) {
        const m = /^(feat-.*)-\d{13}$/.exec(alg.id || "");
        if (m) {
          deParaFeat[alg.id] = m[1];
          alg.id = m[1];
        }
        if (vistos.has(alg.id)) continue;
        vistos.add(alg.id);
        out.push(alg);
      }
      alinhamentosMigrados = out as any;
    }

    const trocaAlvo = (v?: string) => v
      ? v.split(",").map((t) => deParaFeat[t.trim()] || t.trim()).join(",")
      : v;
    const corridorsMigrados = (data.corridors || []).map((c: any) => ({
      ...c,
      regions: (c.regions || []).map((r: any) => {
        const nova: any = { ...r };
        if (r.islandTargetId) nova.islandTargetId = trocaAlvo(r.islandTargetId);
        if (r.targets) {
          const ts: Record<string, string> = {};
          for (const k of Object.keys(r.targets)) ts[k] = trocaAlvo(r.targets[k]) as string;
          nova.targets = ts;
        }
        if ((r as any).targetsPrefer) {
          const tp: Record<string, string> = {};
          for (const k of Object.keys((r as any).targetsPrefer)) {
            tp[k] = trocaAlvo((r as any).targetsPrefer[k]) as string;
          }
          nova.targetsPrefer = tp;
        }
        return nova;
      }),
    }));

    if (data.surface) {
      Object.setPrototypeOf(data.surface, SurfaceDTM.prototype);
    }
    
    let restoredSurfaces = data.surfaces || [];
    if (restoredSurfaces.length > 0) {
      restoredSurfaces = restoredSurfaces.map((sLayer: any) => {
        if (sLayer.surface) {
          Object.setPrototypeOf(sLayer.surface, SurfaceDTM.prototype);
          if (sLayer.surface.vertices && !(sLayer.surface.vertices instanceof Float32Array)) {
            sLayer.surface.vertices = new Float32Array(Object.values(sLayer.surface.vertices));
          }
          if (sLayer.surface.indices && !(sLayer.surface.indices instanceof Int32Array)) {
            sLayer.surface.indices = new Int32Array(Object.values(sLayer.surface.indices));
          }
          if (sLayer.surface.boundaryEdges && !(sLayer.surface.boundaryEdges instanceof Int32Array)) {
            sLayer.surface.boundaryEdges = new Int32Array(Object.values(sLayer.surface.boundaryEdges));
          }
          if (!sLayer.surface.grid || !sLayer.surface.grid.length) {
            try {
               (sLayer.surface as any).buildSpatialIndex();
            } catch (e) {}
          }
        }
        return sLayer;
      });
    } else if (data.surface) {
      // Backwards compatibility for older project saves
      const legacySurface = data.surface;
      Object.setPrototypeOf(legacySurface, SurfaceDTM.prototype);
      if (legacySurface.vertices && !(legacySurface.vertices instanceof Float32Array)) {
        legacySurface.vertices = new Float32Array(Object.values(legacySurface.vertices));
      }
      if (legacySurface.indices && !(legacySurface.indices instanceof Int32Array)) {
        legacySurface.indices = new Int32Array(Object.values(legacySurface.indices));
      }
      if (legacySurface.boundaryEdges && !(legacySurface.boundaryEdges instanceof Int32Array)) {
        legacySurface.boundaryEdges = new Int32Array(Object.values(legacySurface.boundaryEdges));
      }
      if (!legacySurface.grid || !legacySurface.grid.length) {
        try {
           (legacySurface as any).buildSpatialIndex();
        } catch (e) {}
      }
      
      restoredSurfaces = [{
         id: `surface-legacy`,
         name: "Superfície Importada",
         surface: legacySurface,
         isVisible: true
      }];
    }

    let loadedAssemblies = data.assemblies && data.assemblies.length > 0 ? data.assemblies : DEFAULT_ASSEMBLIES;
    loadedAssemblies = loadedAssemblies.filter((a: any) => a.id !== 'a2' && a.id !== 'a3');
    
    // Deduplicate assembly IDs to fix old saves with duplicate "a6"
    const seenAssemblyIds = new Set<string>();
    loadedAssemblies = loadedAssemblies.map((a: any) => {
      let finalId = a.id;
      while (seenAssemblyIds.has(finalId)) {
        const num = parseInt(finalId.replace('a', ''));
        finalId = `a${(isNaN(num) ? Math.floor(Math.random()*1000) : num) + Math.floor(Math.random()*100) + 1}`;
      }
      seenAssemblyIds.add(finalId);
      return { ...a, id: finalId };
    });

    let loadedLayers = data.layers || [];
    // Atualizar cores legadas que eram muito parecidas para cores mais distintas
    loadedLayers = loadedLayers.map((l: any) => {
      if (l.id === 'layer-pista' && (l.color === '#1f1f22' || l.color === '#3f3f46')) return { ...l, color: '#334155' };
      if (l.id === 'layer-acostamento' && (l.color === '#27272a' || l.color === '#71717a')) return { ...l, color: '#94a3b8' };
      return l;
    });

    const requiredLayers = [
      { id: "layer-eixo", name: "Eixo", color: "#3b82f6", isVisible: true, isLocked: false },
      { id: NOSE_LAYER_ID, name: "Narizes Físicos", color: "#0f172a", isVisible: true, isLocked: false },
      { id: "layer-auxiliar", name: "Auxiliar", color: "#a8a29e", isVisible: false, isLocked: false },
      { id: "layer-pista", name: "Pista", color: "#334155", isVisible: true, isLocked: false },
      { id: "layer-acostamento", name: "Acostamento", color: "#94a3b8", isVisible: true, isLocked: false },
      { id: "layer-talude", name: "Talude / Grama", color: "#22c55e", isVisible: true, isLocked: false },
      { id: "layer-aterro", name: "Aterro (92)", color: "#54A53B", isVisible: true, isLocked: false },
      { id: "layer-corte", name: "Corte (241)", color: "#DF3F6A", isVisible: true, isLocked: false },
      { id: "layer-banqueta", name: "Banqueta (33)", color: "#E59E42", isVisible: true, isLocked: false },
      { id: "layer-meiofio", name: "Meio Fio / Calçada", color: "#d4d4d8", isVisible: true, isLocked: false }
    ];
    for (const rl of requiredLayers) {
      if (!loadedLayers.find((l: any) => l.id === rl.id)) {
        loadedLayers.push(rl);
      }
    }

    /* RESTAURO GENÉRICO — repõe todo estado gravado que não seja volátil nem
     * tratado especialmente abaixo. Garante que nenhum menu fique de fora. */
    {
      const cur: any = get();
      const tratados = new Set([
        "version", "type", "surface", "surfaces", "alignments", "layers",
        "assemblies", "corridors", "cadastre",
      ]);
      const generico: any = {};
      Object.keys(data || {}).forEach((k) => {
        if (tratados.has(k) || TRANSIENT_STATE_KEYS.has(k)) return;
        if (!(k in cur) || typeof cur[k] === "function") return;
        generico[k] = data[k];
      });
      if (Object.keys(generico).length) set(generico);
    }

    set({
      surfaces: restoredSurfaces,
      surface: mergeSurfaces(restoredSurfaces.filter((s: any) => s.isVisible)),
      layers: loadedLayers,
      alignments: alinhamentosMigrados,
      cadastre: data.cadastre || null,
      corridors: corridorsMigrados,
      assemblies: loadedAssemblies,
      intersections: data.intersections || [],
      laneDirections: data.laneDirections || {},
      points3D: data.points3D || [],
      drawnGeometries: data.drawnGeometries || [],
      lines3D: data.lines3D || [],
      profileLines: data.profileLines || [],
      circles3D: data.circles3D || [],
      dimensions: data.dimensions || [],
      activeAlignmentId: null,
      selectedAssemblyId: null,
      selectedIntersectionId: null,
      interactionMode: "none",
      tempPIs: [],
      productionLayout: data.productionLayout || "",
      productionCadernos: data.productionCadernos || [{ id: "cad-1", nome: "Caderno de Layouts", layouts: [] }],
      productionCadernoAtivo: data.productionCadernoAtivo || "cad-1",
      productionScale: data.productionScale || "1:2000",
      productionNorth: data.productionNorth || "Sem símbolo",
      productionGrid: data.productionGrid || "Ligar",
      productionSheetSize: data.productionSheetSize || "A1",
      productionSheetOrientation: data.productionSheetOrientation || "Landscape",
      productionTable: data.productionTable !== undefined ? data.productionTable : true,
      productionActiveAlignment: data.productionActiveAlignment || data.productionBaseAlignment || (restoredAlignments[0]?.id || null),
      productionBaseAlignment: data.productionBaseAlignment || data.productionActiveAlignment || (restoredAlignments[0]?.id || ""),
      productionBaseProfile: data.productionBaseProfile || "",
      productionTitleBlock: data.productionTitleBlock || "predefined",
      productionSelectedViewport: null,
      productionViewportCategories: data.productionViewportCategories || ["viewport planta", "viewport perfil", "viewport seção tipo", "viewport seção acabada"],      productionViewportScales: data.productionViewportScales || ["1:2000", "1:2000", "1:2000", "1:2000"],
      productionViewportNorths: data.productionViewportNorths || ["Sem símbolo", "Sem símbolo", "Sem símbolo", "Sem símbolo"],
      productionViewportGrids: data.productionViewportGrids || ["Ligar", "Ligar", "Ligar", "Ligar"],
      productionGridStyles: (data.productionGridStyles && data.productionGridStyles.length === 4)
        ? data.productionGridStyles.map((g: any) => ({ ...defaultGridStyle(), ...g }))
        : [defaultGridStyle(), defaultGridStyle(), defaultGridStyle(), defaultGridStyle()],
      productionViewportBaseAlignments: data.productionViewportBaseAlignments || ["", "", "", ""],
      productionViewportBases: data.productionViewportBases || [[], [], [], []],
      productionViewportBaseProfiles: data.productionViewportBaseProfiles || ["", "", "", ""],
      productionViewportAssemblies: data.productionViewportAssemblies || ["", "", "", ""],
      productionViewportCorridors: data.productionViewportCorridors || ["", "", "", ""],
      productionViewportSizes: data.productionViewportSizes || {},
      productionViewportPositions: data.productionViewportPositions || {},
      productionCrossSectionInterval: data.productionCrossSectionInterval !== undefined ? data.productionCrossSectionInterval : 20,
      productionCrossSectionIncludeKeyPoints: data.productionCrossSectionIncludeKeyPoints !== undefined ? data.productionCrossSectionIncludeKeyPoints : true,
      productionCrossSectionIncludeProfileKeyPoints: data.productionCrossSectionIncludeProfileKeyPoints !== undefined ? data.productionCrossSectionIncludeProfileKeyPoints : true,
      productionConfigs: data.productionConfigs || {},
      productionZoom: data.productionZoom || 1.0,
      productionPan: data.productionPan || { x: 0, y: 0 },

      productionCarimboElements: data.productionCarimboElements || DEFAULT_CARIMBO_ELEMENTS,
      productionCarimboTextValues: data.productionCarimboTextValues || DEFAULT_CARIMBO_TEXT_VALUES,
      productionCarimboTheme: data.productionCarimboTheme || "cad",
      productionShowCarimboDimensions: data.productionShowCarimboDimensions !== undefined ? data.productionShowCarimboDimensions : true,
      productionCarimboCustomImages: data.productionCarimboCustomImages || {},
      productionCarimboDimensions: data.productionCarimboDimensions || DEFAULT_CARIMBO_DIMENSIONS,
      productionCarimboTextStyle: data.productionCarimboTextStyle || DEFAULT_CARIMBO_TEXT_STYLE,

    });
    get().recomputeGeometry();
  },

  laneDirections: {},
  toggleLaneDirection: (key) => set((state) => {
    const current = state.laneDirections[key] || "forward";
    const next = current === "forward" ? "backward" : "forward";
    
    // We should theoretically rebuild intersections here but we don't have access to get() easily without modifying set
    return { laneDirections: { ...state.laneDirections, [key]: next } };
  }),
  setLaneDirection: (key, direction) => {
    set((state) => ({
      laneDirections: { ...state.laneDirections, [key]: direction }
    }));
    // Rebuild all intersections because flow direction affects taper type
    const state = get();
    state.intersections.forEach(int => {
      state.rebuildIntersectionCorridors(int.id);
    });
  },

  interactionMode: "none",
  setInteractionMode: (mode) => set({ interactionMode: mode }),
  osnapEnabled: true,
  setOsnapEnabled: (enabled) => set({ osnapEnabled: enabled }),
  osnapConfig: {
    endpoint: true,
    midpoint: true,
    center: true,
    intersection: true,
    perpendicular: true,
    nearest: true,
  },
  setOsnapConfig: (config) => set((state) => ({ osnapConfig: { ...state.osnapConfig, ...config } })),
  orthoModeEnabled: false,
  setOrthoModeEnabled: (enabled) => set({ orthoModeEnabled: enabled }),
  tempPIs: [],
  addTempPI: (pi) => set((state) => ({ tempPIs: [...state.tempPIs, pi] })),
  setTempPIs: (pis) => set({ tempPIs: pis }),
  clearTempPIs: () => set({ tempPIs: [] }),
  
  tempProfilePIVs: [],
  addTempProfilePIV: (piv) => set((state) => ({ tempProfilePIVs: [...state.tempProfilePIVs, piv] })),
  setTempProfilePIVs: (pivs) => set({ tempProfilePIVs: pivs }),
  clearTempProfilePIVs: () => set({ tempProfilePIVs: [] }),
  commitTempProfile: () => set((state) => {
    if (!state.activeAlignmentId || state.tempProfilePIVs.length < 2) return state;
    
    // Sort PIVs by station
    const sortedPIVs = [...state.tempProfilePIVs].sort((a, b) => a.sta - b.sta);
    
    const { profilePoints, keyProfilePoints } = rebuildProfileFromPIVs(sortedPIVs);
    
    const newAlignments = state.alignments.map(a => {
        if (a.id === state.activeAlignmentId) {
            a.profile = profilePoints;
            a.keyProfilePoints = keyProfilePoints;
        }
        return a;
    });
    
    return {
        tempProfilePIVs: [],
        interactionMode: "none",
        alignments: rebuildDynamicOffsets(newAlignments)
    };
  }),
  updateActiveProfilePivLength: (index, length) => {
      set((state) => {
          if (!state.activeAlignmentId) return state;
          const algIndex = state.alignments.findIndex(a => a.id === state.activeAlignmentId);
          if (algIndex === -1) return state;
          
          const alg = state.alignments[algIndex];
          const pivs = alg.keyProfilePoints
              .filter(p => ["PP", "PIV", "PF"].includes(p.label || ""))
              .map(p => ({ sta: p.sta, elev: p.elev, l: p.l, k: p.k }));
              
          if (index >= 0 && index < pivs.length) {
              pivs[index].l = length;
          }
          
          const { profilePoints, keyProfilePoints } = rebuildProfileFromPIVs(pivs);
          
          const newAlignments = [...state.alignments];
          newAlignments[algIndex] = {
              ...alg,
              profile: profilePoints,
              keyProfilePoints
          } as Alignment3D;
          Object.setPrototypeOf(newAlignments[algIndex], Alignment3D.prototype);
          
          return { alignments: rebuildDynamicOffsets(newAlignments) };
      });
      
      // Rebuild related intersections
      const state = get();
      if (state.activeAlignmentId) {
         const relatedInts = state.intersections.filter(
           (i) => i.branchAlignmentId === state.activeAlignmentId || i.mainAlignmentId === state.activeAlignmentId
         );
         relatedInts.forEach((int) => {
            state.rebuildIntersectionCorridors(int.id);
         });
      }
  },
  commitTempAlignment: () =>
    set((state) => {
      if (state.tempPIs.length < 2) return state;

      // Build an Alignment3D from tempPIs using rebuildFromPIs to ensure consistency
      const { points, keyPoints, length } = rebuildFromPIs(
        state.tempPIs.map((p) => ({
          x: p.x,
          y: p.y,
          radius: (p as any).radius || 0,
        })),
      );

      // Add a fallback if points generation fails
      if (points.length === 0) return state;

      const sta = length;

      // Gerar perfil padrão (mesma lógica do import/setActive)
      let startElev = 0,
        endElev = 0;
      if (state.surface) {
        startElev =
          state.surface.getElevation(
            points[0].x,
            points[0].y,
          ) ?? 0;
        endElev =
          state.surface.getElevation(
            points[points.length - 1].x,
            points[points.length - 1].y,
          ) ?? 0;
      }

      const pivs = [
        { sta: points[0].sta, elev: startElev, l: undefined, k: undefined },
        { sta: points[points.length - 1].sta, elev: endElev, l: undefined, k: undefined },
      ];
      const { profilePoints, keyProfilePoints } = rebuildProfileFromPIVs(pivs);

      // If there's an active alignment, we append/overwrite its structural state
      if (state.activeAlignmentId) {
        const existingIndex = state.alignments.findIndex(
          (a) => a.id === state.activeAlignmentId,
        );
        if (existingIndex !== -1) {
          const existing = state.alignments[existingIndex];
          if (existing.isLocked) return { tempPIs: [], interactionMode: "none" };
          const updated = new Alignment3D(
            existing.name,
            sta,
            points,
            profilePoints,
            keyPoints,
            keyProfilePoints,
          );
          updated.id = existing.id; // Preserve existing ID
          updated.superelevationData = existing.superelevationData;
          updated.isManuallyEdited = true;

          const newAlignments = [...state.alignments];
          newAlignments[existingIndex] = updated;

          const corridors = state.corridors.map((c) => {
            if (c.alignmentId !== existing.id) return c;
            if (c.regions.length === 0) return c;
            const updatedRegions = [...c.regions];
            updatedRegions[updatedRegions.length - 1] = {
              ...updatedRegions[updatedRegions.length - 1],
              endStation: sta,
            };
            for (let i = 0; i < updatedRegions.length; i++) {
              if (updatedRegions[i].startStation > sta) updatedRegions[i].startStation = sta;
              if (updatedRegions[i].endStation > sta) updatedRegions[i].endStation = sta;
            }
            return { ...c, regions: updatedRegions };
          });

          const intersections = state.intersections.map((int) => {
            if (int.branchAlignmentId === existing.id) {
               const isStart = int.branchStation === 0 || int.branchStation < existing.length / 2;
               const newBranchSta = isStart ? 0 : sta;
               if (int.branchStation !== newBranchSta) {
                   return { ...int, branchStation: newBranchSta };
               }
            }
            return int;
          });

          return {
            tempPIs: [],
            interactionMode: "none",
            alignments: rebuildDynamicOffsets(newAlignments),
            corridors,
            intersections,
            station:
              points[0].sta +
              (points[points.length - 1].sta - points[0].sta) / 2,
          };
        }
      }

      const newAlignment = new Alignment3D(
        `Alinhamento ${state.alignments.length + 1}`,
        sta,
        points,
        profilePoints,
        keyPoints,
        keyProfilePoints,
      );

      return {
        tempPIs: [],
        interactionMode: "none",
        alignments: [...state.alignments, newAlignment],
        activeAlignmentId: newAlignment.id,
        station:
          points[0].sta + (points[points.length - 1].sta - points[0].sta) / 2,
      };
    }),

  showSurfaceTriangles: true,
  setShowSurfaceTriangles: (show) => set({ showSurfaceTriangles: show }),
  showSurfaceBoundary: true,
  setShowSurfaceBoundary: (show) => set({ showSurfaceBoundary: show }),
  showCadastre: true,
  setShowCadastre: (show) => set({ showCadastre: show }),

  station: 0,
  setStation: (sta) => {
    set({ station: sta });
    get().recomputeGeometry();
  },

  profileTransform: d3.zoomIdentity,
  setProfileTransform: (transform) => set({ profileTransform: transform }),

  assemblies: DEFAULT_ASSEMBLIES,
  addAssembly: (newAssembly?: Partial<Assembly>) => {
    set((state) => {
      const maxIdNum = state.assemblies.reduce((max, a) => {
        const num = parseInt(a.id.replace('a', ''));
        return !isNaN(num) && num > max ? num : max;
      }, 0);
      const id = `a${maxIdNum + 1}`;
      return {
        assemblies: [
          ...state.assemblies,
          {
            id,
            name:
              newAssembly?.name || `Nova Seção ${maxIdNum + 1}`,
            parameters: newAssembly?.parameters || [],
            points: newAssembly?.points || [],
            links: newAssembly?.links || [],
            jsFunctionBody: newAssembly?.jsFunctionBody,
            components: newAssembly?.components || [],
          },
        ],
      };
    });
  },
  updateAssembly: (id, updates) => {
    set((state) => ({
      assemblies: state.assemblies.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
    get().recomputeGeometry();
  },
  removeAssembly: (id) => {
    set((state) => ({
      assemblies: state.assemblies.filter((a) => a.id !== id),
    }));
    get().recomputeGeometry();
  },

  selectedAssemblyId: "a1",
  setSelectedAssemblyId: (id) => set({ selectedAssemblyId: id }),

  updateParameter: (assemblyId, paramId, value) => {
    set((state) => ({
      assemblies: state.assemblies.map((a) => {
        if (a.id !== assemblyId) return a;
        return {
          ...a,
          parameters: a.parameters.map((p) =>
            p.id === paramId ? { ...p, value } : p,
          ),
        };
      }),
    }));
    get().recomputeGeometry();
  },

  corridors: DEFAULT_CORRIDORS,
  addCorridor: (alignmentIdArg?: string) => {
    set((state) => {
      const maxIdNum = state.corridors.reduce((max, c) => {
        const num = parseInt(c.id.replace('c', ''));
        return !isNaN(num) && num > max ? num : max;
      }, 0);
      const id = `c${maxIdNum + 1}`;

      let alignmentId = alignmentIdArg || state.activeAlignmentId;
      if (!alignmentId && state.alignments.length > 0) {
        alignmentId = state.alignments[0].id;
      }

      let initialRegions: CorridorRegion[] = [];
      if (alignmentId && state.assemblies.length > 0) {
        const align = state.alignments.find((a) => a.id === alignmentId);
        if (align && align.points.length > 0) {
          initialRegions = [
            {
              id: `r${Date.now()}_${Math.floor(Math.random()*1000)}`,
              name: "Região Inicial",
              startStation: align.points[0].sta,
              endStation: align.points[align.points.length - 1].sta,
              assemblyId: state.assemblies[0].id,
            },
          ];
        }
      }

      return {
        corridors: [
          ...state.corridors,
          {
            id,
            name: `Corredor ${maxIdNum + 1}`,
            alignmentId: alignmentId,
            regions: initialRegions,
          },
        ],
      };
    });
    get().recomputeGeometry();
  },
  updateCorridor: (id, updates) => {
    set((state) => {
      let corridors = state.corridors.map((c) => {
        if (c.id !== id) return c;
        const newC = { ...c, ...updates };

        // When assigning an Alignment to a Corridor, adapt the regions range to the Alignment
        if ("alignmentId" in updates && updates.alignmentId !== c.alignmentId) {
          const align = state.alignments.find(
            (a) => a.id === updates.alignmentId,
          );
          if (align && align.points.length > 0) {
            const start = align.points[0].sta;
            const end = align.points[align.points.length - 1].sta;

            if (newC.regions.length === 0) {
              newC.regions = [
                {
                  id: `r${Date.now()}_${Math.floor(Math.random()*1000)}`,
                  name: "Região Inicial",
                  startStation: start,
                  endStation: end,
                  assemblyId: state.assemblies[0]?.id || "",
                },
              ];
            } else {
              newC.regions = newC.regions.map((r, i) => {
                let rStart = r.startStation;
                let rEnd = r.endStation;
                if (i === 0) rStart = start;
                if (i === newC.regions.length - 1) rEnd = end;
                return { ...r, startStation: rStart, endStation: rEnd };
              });
            }
          }
        }
        return newC;
      });
      return { corridors };
    });
    get().recomputeGeometry();
  },
  updateCorridorRegion: (corridorId, regionIndex, updates) => {
    set((state) => ({
      corridors: state.corridors.map((c) => {
        if (c.id !== corridorId) return c;
        const newRegions = [...c.regions];
        newRegions[regionIndex] = { ...newRegions[regionIndex], ...updates };
        return { ...c, regions: newRegions };
      }),
    }));
    get().recomputeGeometry();
  },
  removeCorridor: (id) => {
    set((state) => ({
      corridors: state.corridors.filter((c) => c.id !== id),
    }));
    get().recomputeGeometry();
  },

  addRegion: (corridorId) => {
    set((state) => ({
      corridors: state.corridors.map((c) => {
        if (c.id !== corridorId) return c;

        let initialStart = 0;
        let initialEnd = 100;
        const align = state.alignments.find((a) => a.id === c.alignmentId);
        if (align && align.points.length > 0) {
          if (c.regions.length > 0) {
            initialStart = c.regions[c.regions.length - 1].endStation;
            initialEnd = Math.min(
              initialStart + 100,
              align.points[align.points.length - 1].sta,
            );
          } else {
            initialStart = align.points[0].sta;
            initialEnd = align.points[align.points.length - 1].sta;
          }
        }

        const id = `r${Date.now()}`;
        return {
          ...c,
          regions: [
            ...c.regions,
            {
              id,
              name: `Nova Região`,
              startStation: initialStart,
              endStation: initialEnd,
              assemblyId: state.assemblies[0]?.id || "",
            },
          ],
        };
      }),
    }));
    get().recomputeGeometry();
  },
  removeRegion: (corridorId, regionId) => {
    set((state) => ({
      corridors: state.corridors.map((c) => {
        if (c.id !== corridorId) return c;
        return {
          ...c,
          regions: c.regions.filter((r) => r.id !== regionId),
        };
      }),
    }));
    get().recomputeGeometry();
  },
  updateRegion: (corridorId, regionId, updates) => {
    set((state) => ({
      corridors: state.corridors.map((c) => {
        if (c.id !== corridorId) return c;
        return {
          ...c,
          regions: c.regions.map((r) =>
            r.id === regionId ? { ...r, ...updates } : r,
          ),
        };
      }),
    }));
    get().recomputeGeometry();
  },
  splitRegion: (corridorId, regionId, station) => {
    set((state) => {
      const corridors = state.corridors.map((c) => {
        if (c.id !== corridorId) return c;
        const regionToSplit = c.regions.find((r) => r.id === regionId);
        if (!regionToSplit) return c;
        if (
          station <= regionToSplit.startStation ||
          station >= regionToSplit.endStation
        ) {
          return c; // Invalid split station
        }

        const newRegion: CorridorRegion = {
          ...regionToSplit,
          id: `r${Date.now()}_${Math.floor(Math.random()*1000)}`,
          name: `${regionToSplit.name} (Copy)`,
          startStation: station,
          endStation: regionToSplit.endStation,
        };

        const updatedRegion: CorridorRegion = {
          ...regionToSplit,
          endStation: station,
        };

        const newRegions = c.regions.map((r) =>
          r.id === regionId ? updatedRegion : r,
        );
        const idx = newRegions.findIndex((r) => r.id === regionId);
        newRegions.splice(idx + 1, 0, newRegion);

        return {
          ...c,
          regions: newRegions,
        };
      });
      return { corridors };
    });
    get().recomputeGeometry();
  },

  computedPoints: {},
  activeLinks: [],
  drawingShowCorridors: false,
  setDrawingShowCorridors: (show) => set({ drawingShowCorridors: show }),
  drawingShowSurfaces: false,
  setDrawingShowSurfaces: (show) => set({ drawingShowSurfaces: show }),
  drawingShowAlignments: false,
  setDrawingShowAlignments: (show) => set({ drawingShowAlignments: show }),

  planScene: { ribbons: [], features: [], stamp: 0 },
  setPlanScene: (scene: any) => set({ planScene: scene } as any),

  corridorVisibility: {},
  setCorridorVisible: (id: string, visible: boolean) => set((state: any) => ({
    corridorVisibility: { ...(state.corridorVisibility || {}), [id]: visible },
  })),
  showAllCorridors: () => set({ corridorVisibility: {} } as any),

  baselineVisibility: {},
  setBaselineVisible: (alignmentId: string, visible: boolean) => set((state: any) => ({
    baselineVisibility: { ...(state.baselineVisibility || {}), [alignmentId]: visible },
  })),
  showAllBaselines: () => set({ baselineVisibility: {} } as any),
  isolateBaseline: (alignmentId: string) => set((state: any) => {
    const map: Record<string, boolean> = {};
    (state.corridors || []).forEach((c: any) => {
      if (c.alignmentId) map[c.alignmentId] = c.alignmentId === alignmentId;
    });
    map[alignmentId] = true;
    return { baselineVisibility: map };
  }),

  bases: [],
  addBase: (base) => set((state) => ({
    bases: [...(state.bases || []), { ...base, id: `base-${Date.now()}-${Math.floor(Math.random() * 1000)}` }],
  })),
  updateBase: (id, updates) => set((state) => ({
    bases: (state.bases || []).map((b) => (b.id === id ? { ...b, ...updates } : b)),
  })),
  removeBase: (id) => set((state) => ({ bases: (state.bases || []).filter((b) => b.id !== id) })),
  duplicateBase: (id) => set((state) => {
    const src = (state.bases || []).find((b) => b.id === id);
    if (!src) return {} as any;
    const copia: ProjectBase = {
      ...src,
      id: `base-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `${src.name} (cópia)`,
      members: { ...emptyBaseMembers(), ...src.members },
    };
    return { bases: [...(state.bases || []), copia] };
  }),
  toggleBase: (id) => set((state) => ({
    bases: (state.bases || []).map((b) => (b.id === id ? { ...b, active: !b.active } : b)),
  })),
  globalCorridorFrequency: 2,
  setGlobalCorridorFrequency: (freq) => { set({ globalCorridorFrequency: freq }); get().recomputeGeometry(); },
  /* Arranque no ambiente Projeto, contexto de alinhamento horizontal, com a
   * planta ocupando o visualizador — mesma combinação que a aba já aplicava. */
  activeTab: "horizontal",
  setActiveTab: (tab) => set({ activeTab: tab }),

  ambiente: "projeto",
  setAmbiente: (a) => {
    const s = get();
    /* Reproduz exatamente as combinações de modo que as abas já acionavam, para
     * que nenhuma tela mude de comportamento ao trocar de ambiente. */
    if (a === "projeto") {
      const atual = s.activeTab;
      set({
        ambiente: a,
        activeTab: TABS_POR_AMBIENTE.projeto.includes(atual as any) ? atual : "horizontal",
      });
      s.setPlanMode(true);
      s.setProfileMode(false);
      s.setProductionMode(false);
    } else if (a === "perfis") {
      set({ ambiente: a, activeTab: "vertical" });
      s.setProfileMode(true);
      s.setPlanMode(false);
      s.setProductionMode(false);
    } else if (a === "secoes") {
      set({ ambiente: a, activeTab: "assemblies" });
      s.setProductionMode(false);
    } else {
      set({ ambiente: a, activeTab: "production" });
      s.setProductionMode(true);
      s.setPlanMode(false);
      s.setProfileMode(false);
      s.setSectionMode(false);
      s.setPlan3DMode(false);
    }
  },

  nomeProjeto: "projeto",
  setNomeProjeto: (nome) => set({ nomeProjeto: nome || "projeto" }),

  planFitTrigger: 0,
  pedirEnquadramentoPlanta: () => set((s) => ({ planFitTrigger: s.planFitTrigger + 1 })),
  zoomJanelaAtivo: false,
  setZoomJanelaAtivo: (ativo) => set({ zoomJanelaAtivo: ativo }),
  historicoZoom: [],
  empilharZoom: () =>
    set((s) => ({ historicoZoom: [...s.historicoZoom, s.planView2DTransform].slice(-20) })),
  zoomAnterior: () =>
    set((s) => {
      const h = [...s.historicoZoom];
      const anterior = h.pop();
      if (!anterior) return {} as any;
      return { historicoZoom: h, planView2DTransform: anterior };
    }),

  selecaoDesenho: [],
  alternarSelecaoDesenho: (item, acumular) =>
    set((s) => {
      const jaTem = s.selecaoDesenho.some((x) => x.tipo === item.tipo && x.id === item.id);
      if (!acumular) return { selecaoDesenho: jaTem ? [] : [item] };
      return {
        selecaoDesenho: jaTem
          ? s.selecaoDesenho.filter((x) => !(x.tipo === item.tipo && x.id === item.id))
          : [...s.selecaoDesenho, item],
      };
    }),
  limparSelecaoDesenho: () => set({ selecaoDesenho: [] }),

  areaTransferencia: null,
  copiarSelecaoDesenho: () => {
    const s = get();
    const itens = coletarItensDesenho(s, s.selecaoDesenho);
    if (itens.length) set({ areaTransferencia: { itens, corte: false } });
  },
  cortarSelecaoDesenho: () => {
    const s = get();
    const itens = coletarItensDesenho(s, s.selecaoDesenho);
    if (!itens.length) return;
    set({ areaTransferencia: { itens, corte: true } });
    s.selecaoDesenho.forEach((sel) => {
      if (sel.tipo === "ponto") s.removePoint3D(sel.id);
      else if (sel.tipo === "linha") s.removeLine3D(sel.id);
      else s.removeCircle3D(sel.id);
    });
    set({ selecaoDesenho: [] });
  },
  excluirSelecaoDesenho: () => {
    const s = get();
    s.selecaoDesenho.forEach((sel) => {
      if (sel.tipo === "ponto") s.removePoint3D(sel.id);
      else if (sel.tipo === "linha") s.removeLine3D(sel.id);
      else s.removeCircle3D(sel.id);
    });
    set({ selecaoDesenho: [] });
  },

  colarAreaTransferencia: () => {
    const s = get();
    const area = s.areaTransferencia;
    if (!area || !area.itens.length) return;
    /* Deslocamento fixo para a cópia não nascer exatamente sobre o original e
     * ficar impossível de pegar com o mouse. */
    const d = DESLOCAMENTO_COLAGEM;
    area.itens.forEach((it: any) => {
      if (it.tipo === "ponto") {
        const { id, ...pt } = it.dado;
        s.addPoint3D({ ...pt, x: pt.x + d, y: pt.y + d });
      } else if (it.tipo === "linha") {
        const { id, ...ln } = it.dado;
        s.addLine3D({
          ...ln,
          p1: { ...ln.p1, x: ln.p1.x + d, y: ln.p1.y + d },
          p2: { ...ln.p2, x: ln.p2.x + d, y: ln.p2.y + d },
        });
      } else {
        const { id, ...cr } = it.dado;
        s.addCircle3D({
          ...cr,
          center: { ...cr.center, x: cr.center.x + d, y: cr.center.y + d },
        });
      }
    });
    /* Depois de um CORTAR a área continua válida: colar de novo duplica, como em CAD. */
    if (area.corte) set({ areaTransferencia: { itens: area.itens, corte: false } });
  },

  editingIntersectionId: null,
  setEditingIntersectionId: (id) => set({ editingIntersectionId: id }),
  intersectionNTs: {},
  setIntersectionNTs: (map) => {
    /* MIGRAÇÃO DE CHAVE — coordenada → topológica.
     *
     * O que está salvo nos projetos antigos está chaveado pela coordenada
     * arredondada do nariz. Aqui cada entrada antiga é casada com o nariz mais
     * próximo desta rodada e reescrita na chave nova. Roda uma vez: depois não
     * sobra chave antiga para migrar. Entrada que não casa fica de lado — o
     * nariz volta ao padrão, exatamente como já acontecia quando ele migrava. */
    const s: any = get();
    const nts = Object.values(map || {}).flat() as any[];
    const patch: any = {};
    if (nts.length) {
      const TOL = 1.0; // m
      const alvo = (kOld: string) => {
        const [xs, ys] = kOld.split(",");
        const x = parseFloat(xs), y = parseFloat(ys);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        let melhor: any = null, d2 = TOL * TOL;
        for (const nt of nts) {
          const dd = (nt.x - x) ** 2 + (nt.y - y) ** 2;
          if (dd < d2) { d2 = dd; melhor = nt; }
        }
        if (!melhor) return null;
        const kNew = narizKey(melhor);
        return kNew !== kOld ? kNew : null;
      };
      const renomear = (nome: string) => {
        const src = s[nome] as Record<string, any> | undefined;
        if (!src) return;
        const antigas = Object.keys(src).filter(isChaveCoord);
        if (!antigas.length) return;
        const out: Record<string, any> = { ...src };
        let mexeu = false;
        for (const kOld of antigas) {
          const kNew = alvo(kOld);
          if (!kNew) continue;
          if (out[kNew] === undefined) out[kNew] = src[kOld];
          delete out[kOld];
          mexeu = true;
        }
        if (mexeu) patch[nome] = out;
      };
      renomear("ntEscolhas");
      renomear("ntTipos");
      renomear("ntParams");

      /* Alvo de corredor que aponta para um alinhamento de nariz com id antigo
       * segue o mesmo destino da chave — senão o alvo fica órfão na migração. */
      const deParaId: Record<string, string> = {};
      for (const nt of nts) {
        const kNew = narizKey(nt);
        const kOld = narizKeyCoord(nt);
        if (kNew !== kOld) deParaId[noseAlignmentId(kOld)] = noseAlignmentId(kNew);
      }
      if (Object.keys(deParaId).length) {
        const troca = (v?: string) => v
          ? v.split(",").map((t) => deParaId[t.trim()] || t.trim()).join(",")
          : v;
        let mexeuCorr = false;
        const corridors = (s.corridors || []).map((c: any) => {
          let mexeuC = false;
          const regions = (c.regions || []).map((r: any) => {
            const nova: any = { ...r };
            let mexeuR = false;
            if (r.islandTargetId) {
              const t = troca(r.islandTargetId);
              if (t !== r.islandTargetId) { nova.islandTargetId = t; mexeuR = true; }
            }
            if (r.targets) {
              const ts: Record<string, string> = { ...r.targets };
              let mexeuT = false;
              for (const k of Object.keys(ts)) {
                const t = troca(ts[k]) as string;
                if (t !== ts[k]) { ts[k] = t; mexeuT = true; }
              }
              if (mexeuT) { nova.targets = ts; mexeuR = true; }
            }
            if (r.targetsPrefer) {
              const tp: Record<string, string> = { ...r.targetsPrefer };
              let mexeuP = false;
              for (const k of Object.keys(tp)) {
                const t = troca(tp[k]) as string;
                if (t !== tp[k]) { tp[k] = t; mexeuP = true; }
              }
              if (mexeuP) { nova.targetsPrefer = tp; mexeuR = true; }
            }
            if (mexeuR) mexeuC = true;
            return mexeuR ? nova : r;
          });
          if (mexeuC) { mexeuCorr = true; return { ...c, regions }; }
          return c;
        });
        if (mexeuCorr) patch.corridors = corridors;
      }
    }
    set({ intersectionNTs: map, ...patch });
    agendarSyncNarizAligns(get);
  },
  ntDebug: null,
  ntIgnorados: [],
  ntEscolhas: {},
  setNtEscolha: (key: string, v: "sim" | "nao" | null) => {
    set((s: any) => {
      const e = { ...s.ntEscolhas };
      if (v === null) delete e[key]; else e[key] = v;
      return { ntEscolhas: e };
    });
    agendarRebuildNariz(get, key);
  },
  ntTipos: {},
  setNtTipo: (key: string, tipo: TipoNariz) => {
    set((s: any) => ({ ntTipos: { ...s.ntTipos, [key]: tipo } }));
    agendarRebuildNariz(get, key);
  },
  ntParams: {},
  setNtParam: (key: string, patch: {
    offset?: number;
    offsetB?: number;
    comprimento?: number;
    larguraCustom?: number;
    estiloPonta?: "chanfro" | "arredondado" | "inclinado";
    tratamento?: "zebrado" | "canteiro" | "pavimento";
    inverterLado?: boolean;
    nomeCustom?: string;
    /** nome do alinhamento da amarração (tracejada NT → cap) */
    nomeCustomAmarra?: string;
    modoTransicao?: "continuo" | "taper" | "auto" | "uniforme";
  }) => {
    set((s: any) => ({
      ntParams: { ...s.ntParams, [key]: { ...(s.ntParams?.[key] || {}), ...patch } },
    }));
    agendarRebuildNariz(get, key);
  },
  narizCortes: {},
  setNarizCortes: (m) => {
    set({ narizCortes: m } as any);
    const s: any = get();
    Object.keys(m).forEach((id) => s.rebuildIntersectionCorridors?.(id));
    s.recomputeGeometry?.();
  },

  refugioCortes: {},
  setRefugioCortes: (m) => {
    set({ refugioCortes: m } as any);
    /* O corte muda a região do corredor: reconstruir. Coalescido, porque a
     * planta publica isto a cada resolução de nariz. */
    const s: any = get();
    Object.keys(m).forEach((id) => s.rebuildIntersectionCorridors?.(id));
    s.recomputeGeometry?.();
  },

  ntBordos: {},
  setNtBordos: (m: Record<string, { x: number; y: number }[]>) => {
    /* Isto é chamado a CADA render de corredor. Sem a guarda, todo render
     * publica um objeto novo e derruba a jusante tudo o que depende de
     * ntBordos — o memo da planta, a geometria dos narizes, os alinhamentos.
     * O hash é aritmética sobre os pontos: mais barato que o trabalho que
     * evita, e muito mais barato que um JSON.stringify da geometria toda. */
    /* Gatilho só pelas entradas ESTÁVEIS: o bordo do refúgio nasce das fitas,
     * que nascem dos alvos do nariz — contá-lo aqui fechava o laço de duas
     * voltas que fazia o desenho piscar. Ele continua a ser gravado e usado na
     * construção; só não manda reconstruir. */
    const h = hashPolylinesEstavel(m);
    if (h === __ntBordosHash) return;
    __ntBordosHash = h;
    set({ ntBordos: m } as any);
    agendarSyncNarizAligns(get);
  },

  /* ALINHAMENTOS DE NARIZ — um por nariz confirmado, vinculado ao nariz.
   *
   * Mesma conta da planta e do corredor (resolverNarizes), então a linha preta
   * e a laranja que o usuário vê SÃO este alinhamento. Id derivado da chave do
   * nariz: sobrevive à reconstrução, e um corredor que aponte para ele como
   * alvo continua apontando. Não passa por setAlignments de propósito —
   * setAlignments reconstrói os corredores da interseção, o que reentraria
   * aqui em laço. */
  syncNoseAlignments: () => {
    const s: any = get();
    const mapa = (s.intersectionNTs || {}) as Record<string, any[]>;
    const todos = Object.values(mapa).flat();

    const anteriores: Alignment3D[] = s.alignments.filter(
      (a: any) => a.isNoseAlignment || isNoseAlignmentId(a.id),
    );
    const outros = (as: any[]) => as.filter(
      (a: any) => !a.isNoseAlignment && !isNoseAlignmentId(a.id),
    );
    if (!todos.length) {
      /* MAPA VAZIO ≠ SEM NARIZES.
       *
       * A planta reescreve o mapa de NTs a cada render. Enquanto as fitas do
       * corredor ainda não estão calculadas (logo após uma reconstrução), o
       * mapa sai SEM CHAVES — "ainda não avaliado", não "não há narizes". Este
       * caminho apagava então todos os alinhamentos de nariz; os
       * `targetsPrefer` dos quadrantes, que já apontavam para eles, ficavam
       * pendurados em alvos inexistentes e o pavimento deixava de fechar na
       * linha preta. Era este o "sem targets".
       *
       * Só apaga quando o mapa foi realmente avaliado (tem chaves) e veio sem
       * narizes; sem chave nenhuma, conserva o que existe. */
      const avaliado = Object.keys(mapa).length > 0;
      if (!avaliado && anteriores.length) return;
      if (anteriores.length) set({ alignments: outros(s.alignments) });
      __narizAlignSig = null;
      __narizAlignN = 0;
      return;
    }

    const ctx = {
      ntEscolhas: s.ntEscolhas,
      ntTipos: s.ntTipos,
      ntParams: s.ntParams,
      ntBordos: s.ntBordos,
      intersections: s.intersections,
    };

    /* Assinatura das entradas mais os rótulos que entram no nome. Se nada disso
     * mudou e a contagem em estado ainda confere, os alinhamentos já estão
     * certos — nem resolve narizes, nem ajusta reta/arco, nem toca no estado. */
    const sig = assinaturaNarizes(todos, ctx)
      + "~" + (s.intersections || []).map((i: any) => `${i.id}:${i.name}`).join(",")
      + "~" + outros(s.alignments).map((a: any) => `${a.id}:${a.name}`).join(",");
    if (sig === __narizAlignSig && anteriores.length === __narizAlignN) return;

    const resolvidos = resolverNarizes(todos, ctx);

    /* Procedência: o mapa de NTs é chaveado por interseção, então o nome da
     * interseção sai de graça. Ramo = a rodovia do par que não é a principal. */
    const nomeDe = (id?: string) =>
      id ? s.alignments.find((a: any) => a.id === id)?.name : undefined;
    const info: Record<string, NoseAlignInfo> = {};
    Object.entries(mapa).forEach(([intId, lista]) => {
      const int = s.intersections.find((i: any) => i.id === intId);
      (lista || []).forEach((nt: any) => {
        const key = narizKey(nt);
        const raizPista = int?.mainAlignmentId;
        const raizRamo = nt.raizA === raizPista ? nt.raizB : nt.raizA;
        info[key] = {
          intersecao: int?.name || intId,
          ramo: nomeDe(raizRamo) || nomeDe(nt.armB),
          pista: nomeDe(raizPista),
          nt: nt.id,
          tipo: s.ntTipos?.[key] || "entrada",
          nomeCustom: s.ntParams?.[key]?.nomeCustom,
          nomeCustomAmarra: s.ntParams?.[key]?.nomeCustomAmarra,
        };
      });
    });

    const novos: Alignment3D[] = [];
    for (const [key, r] of Object.entries(resolvidos) as [string, any][]) {
      const alg = buildNoseAlignment(r.geom, info[key] || {}, key);
      if (alg) novos.push(alg);
      /* A amarração é alinhamento por direito próprio — é nela que os
       * corredores vão pegar alvo. */
      const amarra = buildTieAlignment(r.geom, info[key] || {}, key);
      if (amarra) novos.push(amarra);
    }

    /* Nada mudou de fato? Sai sem tocar no estado — este passe roda a cada
     * render de bordo e um set inútil reconstruiria a planta inteira. */
    const igual =
      anteriores.length === novos.length &&
      novos.every((n) => {
        const v: any = anteriores.find((a) => a.id === n.id);
        if (!v) return false;
        if (v.name !== n.name || v.points.length !== n.points.length) return false;
        if (Math.abs((v.length || 0) - n.length) > 1e-4) return false;
        const a0 = v.points[0], b0 = n.points[0];
        const a1 = v.points[v.points.length - 1], b1 = n.points[n.points.length - 1];
        return Math.hypot(a0.x - b0.x, a0.y - b0.y) < 1e-6
          && Math.hypot(a1.x - b1.x, a1.y - b1.y) < 1e-6;
      });
    if (igual) {
      __narizAlignSig = sig;
      __narizAlignN = novos.length;
      return;
    }

    // camada, cor e visibilidade são do usuário: sobrevivem à reconstrução
    const antigos = new Map(anteriores.map((a) => [a.id, a as any]));
    novos.forEach((n) => {
      const v = antigos.get(n.id);
      if (v) {
        n.layerId = v.layerId;
        n.color = v.color;
        n.isHidden = v.isHidden;
      }
    });

    const comLayer = s.layers.some((l: any) => l.id === NOSE_LAYER_ID)
      ? s.layers
      : [...s.layers, { id: NOSE_LAYER_ID, name: "Narizes Físicos", color: "#0f172a", isVisible: true, isLocked: false }];

    set({
      layers: comLayer,
      alignments: [...outros(s.alignments), ...novos],
    } as any);
    __narizAlignSig = sig;
    __narizAlignN = novos.length;
  },
  toggleNtIgnorado: (key: string) => set((s: any) => ({
    ntIgnorados: s.ntIgnorados.includes(key)
      ? s.ntIgnorados.filter((k: string) => k !== key)
      : [...s.ntIgnorados, key],
  })),
  bordoQuadro: [],
  setBordoQuadro: (q: any[]) => {
    const cur = (get() as any).bordoQuadro;
    if (JSON.stringify(cur) !== JSON.stringify(q)) set({ bordoQuadro: q } as any);
  },
  setNtDebug: (d: any) => {
    const cur = (get() as any).ntDebug;
    if (JSON.stringify(cur) !== JSON.stringify(d)) set({ ntDebug: d } as any);
  },
  ntWindowIntersectionId: null,
  setNtWindowIntersectionId: (id) => set({ ntWindowIntersectionId: id, ntWindowFocusKey: null }),
  ntWindowFocusKey: null,
  setNtWindowFocusKey: (key) => set({ ntWindowFocusKey: key }),
  /* Atalho da planta: abre a janela já com o item do nariz clicado em destaque. */
  abrirNarizNaJanela: (intId, key) => set({ ntWindowIntersectionId: intId, ntWindowFocusKey: key }),


  selectedElementId: null,
  setSelectedElementId: (id) => set({ selectedElementId: id }),

  selectedCorridorId: null,
  setSelectedCorridorId: (id) => set({ selectedCorridorId: id }),

  selectedRegionId: null,
  setSelectedRegionId: (id) => set({ selectedRegionId: id }),

  pendingPointAdd: null,
  setPendingPointAdd: (pt) => set({ pendingPointAdd: pt }),

  pendingExtendOffset: false,
  setPendingExtendOffset: (show) => set({ pendingExtendOffset: show }),

  pendingCleanBoundary: false,
  setPendingCleanBoundary: (show) => set({ pendingCleanBoundary: show }),

  mdtEditMode: "none",
  setMdtEditMode: (mode) => set({ mdtEditMode: mode }),

  triggerSurfaceUpdate: () =>
    set((state) => ({
      surface: state.surface
        ? Object.assign(
            Object.create(Object.getPrototypeOf(state.surface)),
            state.surface,
          )
        : null,
    })),

  fillBoundaryHoles: () => {
    const state = useStore.getState();
    if (state.surface) {
      state.addMDTEdit({ type: "fill_holes", data: {} });
    }
  },

  planMode: true,
  setPlanMode: (mode) => set({ planMode: mode }),
  
  plan3DMode: false,
  setPlan3DMode: (mode) => set({ plan3DMode: mode }),
  
  sectionMode: false,
  setSectionMode: (mode) => set({ sectionMode: mode }),
  
  profileMode: false,
  setProfileMode: (mode) => set({ profileMode: mode }),

  productionActiveAlignment: null,
  setProductionActiveAlignment: (id) => set((state) => {
    const newState: any = { productionActiveAlignment: id, productionBaseAlignment: id || "" };
    if (id) {
      const key = `${id}_${state.productionLayout}`;
      newState.productionConfigs = {
        ...state.productionConfigs,
        [key]: { ...(state.productionConfigs[key] || {}), productionActiveAlignment: id, productionBaseAlignment: id || "" }
      };
    }
    return newState;
  }),
  productionConfigs: {},
  
  loadProductionConfig: (alignmentId: string, layout: string) => set((state) => {
    const key = `${alignmentId}_${layout}`;
    const saved = state.productionConfigs[key];
    if (saved) {
      const tables = saved.productionTables || [];
      return {
        productionActiveAlignment: alignmentId,
        productionBaseAlignment: saved.productionBaseAlignment || alignmentId,
        productionLayout: layout,
        ...saved,
        productionTables: tables
      };
    } else {
      // Default configurations for layout
      /* Layouts de caderno nascem VAZIOS: as tabelas passaram a ser janelas
       * escolhidas pelo utilizador no Editor de Layouts. */
      const legado = ["Planta", "Planta e Perfil", "Perfil", "Seções acabadas", "Seção tipo"].includes(layout);
      let defaultTables = (!legado || layout === "Perfil") ? [] : [{ id: "table_1", title: "Tabela de Alinhamento Horizontal", type: "alignment", x: 20, y: 380, w: 540, h: 180 }];
      let defaults: any = { 
         productionSheetSize: "A1",
         productionSheetOrientation: "Landscape",
         productionTable: defaultTables.length > 0,
         productionTables: defaultTables,
         productionTitleBlock: "predefined",
         productionViewportCategories: ["viewport planta", "viewport perfil", "viewport seção tipo", "viewport seções acabadas"],
         productionViewportScales: ["1:2000", "1:2000", "1:2000", "1:2000"],
         productionViewportNorths: ["Sem símbolo", "Sem símbolo", "Sem símbolo", "Sem símbolo"],
         productionViewportGrids: ["Ligar", "Ligar", "Ligar", "Ligar"],
         productionViewportBaseAlignments: [alignmentId, alignmentId, alignmentId, alignmentId],
         productionViewportBases: [[], [], [], []],
         productionViewportBaseProfiles: ["", "", "", ""],
         productionViewportAssemblies: ["", "", "", ""],
         productionViewportCorridors: ["", "", "", ""],
         productionViewportSizes: {},
         productionViewportPositions: {},
         productionCrossSectionInterval: 20,
         productionCrossSectionIncludeKeyPoints: true,
         productionCrossSectionIncludeProfileKeyPoints: true,

         productionCarimboElements: state.productionCarimboElements || DEFAULT_CARIMBO_ELEMENTS,
         productionCarimboTextValues: state.productionCarimboTextValues || DEFAULT_CARIMBO_TEXT_VALUES,
         productionCarimboTheme: state.productionCarimboTheme || "cad",
         productionShowCarimboDimensions: state.productionShowCarimboDimensions !== undefined ? state.productionShowCarimboDimensions : true,
         productionCarimboCustomImages: state.productionCarimboCustomImages || {},
         productionCarimboDimensions: state.productionCarimboDimensions || DEFAULT_CARIMBO_DIMENSIONS,
         productionCarimboTextStyle: state.productionCarimboTextStyle || DEFAULT_CARIMBO_TEXT_STYLE,

      };
      
      if (layout === "Planta") {
        defaults.productionViewportCategories = ["viewport planta", "viewport planta", "viewport planta", "viewport planta"];
        defaults.productionViewportScales = ["1:1000", "1:2000", "1:2000", "1:2000"];
        defaults.productionViewportNorths = ["Símbolo 1", "Sem símbolo", "Sem símbolo", "Sem símbolo"];
        defaults.productionViewportGrids = ["Ligar", "Ligar", "Ligar", "Ligar"];
      } else if (layout === "Planta e Perfil") {
        defaults.productionViewportCategories = ["viewport planta", "viewport perfil", "viewport planta", "viewport planta"];
        defaults.productionViewportScales = ["1:1000", "1:1000", "1:2000", "1:2000"];
        defaults.productionViewportNorths = ["Símbolo 1", "Sem símbolo", "Sem símbolo", "Sem símbolo"];
        defaults.productionViewportGrids = ["Ligar", "Ligar", "Ligar", "Ligar"];
      } else if (layout === "Perfil") {
        defaults.productionViewportCategories = ["viewport perfil", "viewport perfil", "viewport perfil", "viewport perfil"];
        defaults.productionViewportScales = ["1:1000", "1:1000", "1:2000", "1:2000"];
        defaults.productionViewportNorths = ["Sem símbolo", "Sem símbolo", "Sem símbolo", "Sem símbolo"];
        defaults.productionViewportGrids = ["Desligar", "Desligar", "Ligar", "Ligar"];
        defaults.productionTable = false;
      } else if (layout === "Seções acabadas") {
        defaults.productionViewportCategories = ["viewport seções acabadas", "viewport seções acabadas", "viewport seções acabadas", "viewport seções acabadas"];
        defaults.productionViewportScales = ["1:200", "1:200", "1:200", "1:200"];
        defaults.productionViewportNorths = ["Sem símbolo", "Sem símbolo", "Sem símbolo", "Sem símbolo"];
        defaults.productionViewportGrids = ["Desligar", "Desligar", "Desligar", "Desligar"];
      } else if (layout === "Seção tipo") {
        defaults.productionViewportCategories = ["viewport seção tipo", "viewport seção tipo", "viewport seção tipo", "viewport seção tipo"];
        defaults.productionViewportScales = ["1:50", "1:50", "1:50", "1:50"];
        defaults.productionViewportNorths = ["Sem símbolo", "Sem símbolo", "Sem símbolo", "Sem símbolo"];
        defaults.productionViewportGrids = ["Desligar", "Desligar", "Desligar", "Desligar"];
      }
      
      const newState = {
        productionActiveAlignment: alignmentId,
        productionLayout: layout,
        ...defaults,
        productionConfigs: {
          ...state.productionConfigs,
          [key]: defaults
        }
      };
      return newState;
    }
  }),

  setProductionConfig: (alignmentId, layout, config) => set((state) => ({
    productionConfigs: {
      ...state.productionConfigs,
      [`${alignmentId}_${layout}`]: {
        ...state.productionConfigs[`${alignmentId}_${layout}`],
        ...config
      }
    }
  })),

  productionMode: false,
  setProductionMode: (mode) => set({ productionMode: mode }),
  
  productionLayout: "",
  setProductionLayout: (layout) => set({ productionLayout: layout }),
  /* Projeto novo: um caderno vazio, sem layouts. */
  productionCadernos: [{ id: "cad-1", nome: "Caderno de Layouts", layouts: [] }] as any[],
  setProductionCadernos: (cadernos: any[]) => set({ productionCadernos: cadernos }),
  productionCadernoAtivo: "cad-1" as string | null,
  setProductionCadernoAtivo: (id: string | null) => set({ productionCadernoAtivo: id }),
  productionScale: "1:2000",
  setProductionScale: (val) => set((state) => {
    const newState: any = { productionScale: val };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionScale: val }
      };
    }
    return newState;
  }),
  productionNorth: "Sem símbolo",
  setProductionNorth: (val) => set((state) => {
    const newState: any = { productionNorth: val };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionNorth: val }
      };
    }
    return newState;
  }),
  productionGrid: "Ligar",
  setProductionGrid: (val) => set((state) => {
    const newState: any = { productionGrid: val };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionGrid: val }
      };
    }
    return newState;
  }),
  productionSheetSize: "A1",
  setProductionSheetSize: (val) => set((state) => {
    const newState: any = { productionSheetSize: val };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionSheetSize: val }
      };
    }
    return newState;
  }),
  productionSheetOrientation: "Landscape",
  setProductionSheetOrientation: (val) => set((state) => {
    const newState: any = { productionSheetOrientation: val };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionSheetOrientation: val }
      };
    }
    return newState;
  }),
  productionTable: true,
  setProductionTable: (val) => set((state) => {
    const newState: any = { productionTable: val };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionTable: val }
      };
    }
    return newState;
  }),
  productionTables: [] as ProductionTableItem[],
  addProductionTable: (table) => set((state) => {
    const currentTables = state.productionTables || [];
    const newId = `table_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const count = currentTables.length + 1;
    const newTable: ProductionTableItem = {
      id: newId,
      title: table?.title || `Tabela ${count}`,
      type: table?.type || "alignment",
      x: table?.x ?? Math.min(20 + (count - 1) * 20, 200),
      y: table?.y ?? Math.max(380 - (count - 1) * 15, 50),
      w: table?.w ?? (state.productionLayout === "Seções acabadas" ? 180 : 250),
      h: table?.h ?? (state.productionLayout === "Seções acabadas" ? 100 : 80),
      alignmentId: table?.alignmentId || state.activeAlignmentId || state.alignments[0]?.id,
      ...table,
    };
    const newTables = [...currentTables, newTable];
    const newState: any = { productionTables: newTables, productionSelectedViewport: newId, productionTable: true };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
        ...state.productionConfigs,
        [key]: { ...(state.productionConfigs[key] || {}), productionTables: newTables, productionTable: true }
      };
    }
    return newState;
  }),
  removeProductionTable: (id) => set((state) => {
    const newTables = (state.productionTables || []).filter(t => t.id !== id);
    const newState: any = { 
      productionTables: newTables,
      productionSelectedViewport: state.productionSelectedViewport === id ? null : state.productionSelectedViewport,
      productionTable: newTables.length > 0
    };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
        ...state.productionConfigs,
        [key]: { ...(state.productionConfigs[key] || {}), productionTables: newTables, productionTable: newTables.length > 0 }
      };
    }
    return newState;
  }),
  updateProductionTable: (id, updates) => set((state) => {
    const newTables = (state.productionTables || []).map(t => t.id === id ? { ...t, ...updates } : t);
    const newState: any = { productionTables: newTables };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
        ...state.productionConfigs,
        [key]: { ...(state.productionConfigs[key] || {}), productionTables: newTables }
      };
    }
    return newState;
  }),
  setProductionTables: (tables) => set((state) => {
    const newState: any = { productionTables: tables, productionTable: tables.length > 0 };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
        ...state.productionConfigs,
        [key]: { ...(state.productionConfigs[key] || {}), productionTables: tables, productionTable: tables.length > 0 }
      };
    }
    return newState;
  }),
  productionBaseAlignment: "",
  setProductionBaseAlignment: (val) => set((state) => {
    const activeId = val || state.productionActiveAlignment;
    const newState: any = { productionBaseAlignment: val, productionActiveAlignment: activeId };
    if (activeId) {
      const key = `${activeId}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionBaseAlignment: val, productionActiveAlignment: activeId }
      };
    }
    return newState;
  }),
  productionBaseProfile: "",
  setProductionBaseProfile: (val) => set((state) => {
    const newState: any = { productionBaseProfile: val };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionBaseProfile: val }
      };
    }
    return newState;
  }),
  productionTitleBlock: "predefined",
  setProductionTitleBlock: (val) => set((state) => {
    const newState: any = { productionTitleBlock: val };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionTitleBlock: val }
      };
    }
    return newState;
  }),
  productionSelectedViewport: null,
  setProductionSelectedViewport: (val) => set({ productionSelectedViewport: val }),
  productionViewportCategories: ["viewport planta", "viewport perfil", "viewport seção tipo", "viewport seção acabada"],
  setProductionViewportCategory: (index: number, val: string) => set((state) => {
    const newVal = [...state.productionViewportCategories];
    newVal[index] = val;
    const newState: any = { productionViewportCategories: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionViewportCategories: newVal }
      };
    }
    return newState;
  }),
  productionViewportScales: ["1:2000", "1:2000", "1:2000", "1:2000"],
  setProductionViewportScale: (index: number, val: string) => set((state) => {
    const newVal = [...state.productionViewportScales];
    newVal[index] = val;
    const newState: any = { productionViewportScales: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionViewportScales: newVal }
      };
    }
    return newState;
  }),
  productionViewportNorths: ["Sem símbolo", "Sem símbolo", "Sem símbolo", "Sem símbolo"],
  setProductionViewportNorth: (index: number, val: string) => set((state) => {
    const newVal = [...state.productionViewportNorths];
    newVal[index] = val;
    const newState: any = { productionViewportNorths: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionViewportNorths: newVal }
      };
    }
    return newState;
  }),
  productionViewportGrids: ["Ligar", "Ligar", "Ligar", "Ligar"],
  productionGridStyles: [defaultGridStyle(), defaultGridStyle(), defaultGridStyle(), defaultGridStyle()],
  setProductionGridStyle: (index: number, updates: Partial<GridStyleCfg>) => set((state) => {
    const newVal = state.productionGridStyles.map((g, i) => i === index ? { ...g, ...updates } : g);
    const newState: any = { productionGridStyles: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionGridStyles: newVal }
      };
    }
    return newState;
  }),
  setProductionViewportGrid: (index: number, val: string) => set((state) => {
    const newVal = [...state.productionViewportGrids];
    newVal[index] = val;
    const newState: any = { productionViewportGrids: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionViewportGrids: newVal }
      };
    }
    return newState;
  }),
  productionViewportBases: [[], [], [], []],
  setProductionViewportBases: (index: number, baseIds: string[]) => set((state) => {
    const newVal = [...(state.productionViewportBases || [[], [], [], []])];
    newVal[index] = baseIds;
    const newState: any = { productionViewportBases: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
        ...state.productionConfigs,
        [key]: { ...(state.productionConfigs[key] || {}), productionViewportBases: newVal },
      };
    }
    return newState;
  }),
  productionViewportBaseAlignments: ["", "", "", ""],
  setProductionViewportBaseAlignment: (index: number, val: string) => set((state) => {
    const newVal = [...state.productionViewportBaseAlignments];
    newVal[index] = val;
    const newState: any = { productionViewportBaseAlignments: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionViewportBaseAlignments: newVal }
      };
    }
    return newState;
  }),
  productionFrames: {},
  setProductionFrame: (key, patch) => set((state: any) => ({
    productionFrames: {
      ...state.productionFrames,
      [key]: { widthMm: 0.35, color: "#000000", style: "solid", ...(state.productionFrames?.[key] || {}), ...patch },
    },
  })),
  productionViewportBaseProfiles: ["", "", "", ""],
  setProductionViewportBaseProfile: (index: number, val: string) => set((state) => {
    const newVal = [...state.productionViewportBaseProfiles];
    newVal[index] = val;
    const newState: any = { productionViewportBaseProfiles: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionViewportBaseProfiles: newVal }
      };
    }
    return newState;
  }),
  productionViewportAssemblies: ["", "", "", ""],
  setProductionViewportAssembly: (index: number, val: string) => set((state) => {
    const newVal = [...state.productionViewportAssemblies];
    newVal[index] = val;
    const newState: any = { productionViewportAssemblies: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionViewportAssemblies: newVal }
      };
    }
    return newState;
  }),
  productionViewportCorridors: ["", "", "", ""],
  setProductionViewportCorridor: (index: number, val: string) => set((state) => {
    const newVal = [...state.productionViewportCorridors];
    newVal[index] = val;
    const newState: any = { productionViewportCorridors: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionViewportCorridors: newVal }
      };
    }
    return newState;
  }),
  productionViewportSizes: {} as Record<string, {w: number, h: number}>,
  productionViewportPositions: {} as Record<string, {x: number, y: number}>,
  productionViewportProfileBands: [[], [], [], []],
  setProductionViewportProfileBands: (index: number, val: any[]) => set((state) => {
    const newVal = [...state.productionViewportProfileBands];
    newVal[index] = val;
    const newState: any = { productionViewportProfileBands: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionViewportProfileBands: newVal }
      };
    }
    return newState;
  }),
  setProductionViewportSizes: (newSizes: Record<string, {w: number, h: number}>) => set((state) => {
    const newState: any = { productionViewportSizes: newSizes };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionViewportSizes: newSizes }
      };
    }
    return newState;
  }),
  setProductionViewportPositions: (newPositions: Record<string, {x: number, y: number}>) => set((state) => {
    const newState: any = { productionViewportPositions: newPositions };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionViewportPositions: newPositions }
      };
    }
    return newState;
  }),
  productionCrossSectionInterval: 20,
  setProductionCrossSectionInterval: (val: number) => set((state) => {
    const newState: any = { productionCrossSectionInterval: val };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionCrossSectionInterval: val }
      };
    }
    return newState;
  }),
  productionCrossSectionIncludeKeyPoints: true,
  setProductionCrossSectionIncludeKeyPoints: (val: boolean) => set((state) => {
    const newState: any = { productionCrossSectionIncludeKeyPoints: val };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionCrossSectionIncludeKeyPoints: val }
      };
    }
    return newState;
  }),
  productionCrossSectionIncludeProfileKeyPoints: true,
  setProductionCrossSectionIncludeProfileKeyPoints: (val: boolean) => set((state) => {
    const newState: any = { productionCrossSectionIncludeProfileKeyPoints: val };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionCrossSectionIncludeProfileKeyPoints: val }
      };
    }
    return newState;
  }),
  productionZoom: 1.0,
  setProductionZoom: (val) => set({ productionZoom: val }),
  productionPan: { x: 0, y: 0 },
  setProductionPan: (val) => set({ productionPan: val }),

  productionCarimboElements: DEFAULT_CARIMBO_ELEMENTS,
  setProductionCarimboElements: (updater) => set((state) => {
    const newVal = typeof updater === 'function' ? updater(state.productionCarimboElements) : updater;
    const newState: any = { productionCarimboElements: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionCarimboElements: newVal }
      };
    }
    return newState;
  }),
  productionCarimboTextValues: DEFAULT_CARIMBO_TEXT_VALUES,
  setProductionCarimboTextValues: (updater) => set((state) => {
    const newVal = typeof updater === 'function' ? updater(state.productionCarimboTextValues) : updater;
    const newState: any = { productionCarimboTextValues: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionCarimboTextValues: newVal }
      };
    }
    return newState;
  }),
  productionCarimboTheme: "cad",
  setProductionCarimboTheme: (val) => set((state) => {
    const newState: any = { productionCarimboTheme: val };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionCarimboTheme: val }
      };
    }
    return newState;
  }),
  productionShowCarimboDimensions: true,
  setProductionShowCarimboDimensions: (updater) => set((state) => {
    const newVal = typeof updater === 'function' ? updater(state.productionShowCarimboDimensions) : updater;
    const newState: any = { productionShowCarimboDimensions: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionShowCarimboDimensions: newVal }
      };
    }
    return newState;
  }),
  productionCarimboCustomImages: {},
  setProductionCarimboCustomImages: (updater) => set((state) => {
    const newVal = typeof updater === 'function' ? updater(state.productionCarimboCustomImages) : updater;
    const newState: any = { productionCarimboCustomImages: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionCarimboCustomImages: newVal }
      };
    }
    return newState;
  }),
  productionCarimboDimensions: DEFAULT_CARIMBO_DIMENSIONS,
  setProductionCarimboDimensions: (updater) => set((state) => {
    const newVal = typeof updater === 'function' ? updater(state.productionCarimboDimensions) : updater;
    const newState: any = { productionCarimboDimensions: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionCarimboDimensions: newVal }
      };
    }
    return newState;
  }),
  productionCarimboTextStyle: DEFAULT_CARIMBO_TEXT_STYLE,
  setProductionCarimboTextStyle: (updater) => set((state) => {
    const newVal = typeof updater === 'function' ? updater(state.productionCarimboTextStyle) : updater;
    const newState: any = { productionCarimboTextStyle: newVal };
    if (state.productionActiveAlignment) {
      const key = `${state.productionActiveAlignment}_${state.productionLayout}`;
      newState.productionConfigs = {
         ...state.productionConfigs,
         [key]: { ...(state.productionConfigs[key] || {}), productionCarimboTextStyle: newVal }
      };
    }
    return newState;
  }),


  dynamicCursor: false,
  setDynamicCursor: (enabled) => set({ dynamicCursor: enabled }),

  showAlignmentEditor: false,
  setShowAlignmentEditor: (show) => set({ showAlignmentEditor: show }),

  recomputeGeometry: () => {
    const {
      station,
      assemblies,
      corridors,
      surface,
      alignments,
      activeAlignmentId,
    } = get();
    const result = evaluateAssemblyAtStation(
      station,
      assemblies,
      corridors,
      surface,
      alignments,
      activeAlignmentId,
    );
    if (!result) {
      set({ computedPoints: {}, activeLinks: [] });
    } else {
      set({ computedPoints: result.points, activeLinks: result.links });
    }
  }
}),
  {
    partialize: (state) => ({
      surface: state.surface,
      surfaces: state.surfaces,
      alignments: state.alignments,
      cadastre: state.cadastre,
      corridors: state.corridors,
      assemblies: state.assemblies,
      intersections: state.intersections,
    }),
    equality: (pastState: any, currentState: any) => {
      return pastState.surface === currentState.surface &&
             pastState.surfaces === currentState.surfaces &&
             pastState.alignments === currentState.alignments &&
             pastState.cadastre === currentState.cadastre &&
             pastState.corridors === currentState.corridors &&
             pastState.assemblies === currentState.assemblies &&
             pastState.intersections === currentState.intersections;
    },
    handleSet: (handleSetFn: any) => {
      savedHandleSetFn = handleSetFn;
      return (pastState: any, replace: any, currentState: any, deltaState: any) => {
        // Capture initial past state from before the edit sequence started
        if (savedPastState === null) {
          savedPastState = pastState;
          savedReplace = replace;
        }
        savedCurrentState = currentState;
        savedDeltaState = deltaState;

        if (pendingHistoryTimer) {
          clearTimeout(pendingHistoryTimer);
        }
        pendingHistoryTimer = setTimeout(() => {
          if (savedPastState !== null) {
            handleSetFn(savedPastState, savedReplace, savedCurrentState, savedDeltaState);
            savedPastState = null;
            savedCurrentState = null;
            savedDeltaState = null;
            pendingHistoryTimer = null;
          }
        }, 400);
      };
    }
  }
));

export const flushTemporalHistory = () => {
  if (pendingHistoryTimer && savedPastState !== null && savedHandleSetFn) {
    clearTimeout(pendingHistoryTimer);
    pendingHistoryTimer = null;
    savedHandleSetFn(savedPastState, savedReplace, savedCurrentState, savedDeltaState);
    savedPastState = null;
    savedCurrentState = null;
    savedDeltaState = null;
  }
};

export const restoreProjectPrototypes = () => {
  const s = useStore.getState();
  if (s.surface && !(s.surface instanceof SurfaceDTM)) {
    Object.setPrototypeOf(s.surface, SurfaceDTM.prototype);
  }
  if (s.surfaces && Array.isArray(s.surfaces)) {
    s.surfaces.forEach((layer: any) => {
      if (layer?.surface && !(layer.surface instanceof SurfaceDTM)) {
        Object.setPrototypeOf(layer.surface, SurfaceDTM.prototype);
      }
    });
  }
  if (s.alignments && Array.isArray(s.alignments)) {
    s.alignments.forEach((alg: any) => {
      if (alg && !(alg instanceof Alignment3D)) {
        Object.setPrototypeOf(alg, Alignment3D.prototype);
      }
    });
  }
};

export const undoProjectAction = () => {
  flushTemporalHistory();
  const temporal = useStore.temporal.getState();
  if (temporal.pastStates.length > 0) {
    temporal.undo();
    restoreProjectPrototypes();
    useStore.getState().recomputeGeometry();
  }
};

export const redoProjectAction = () => {
  flushTemporalHistory();
  const temporal = useStore.temporal.getState();
  if (temporal.futureStates.length > 0) {
    temporal.redo();
    restoreProjectPrototypes();
    useStore.getState().recomputeGeometry();
  }
};

useStore.getState().recomputeGeometry();

if (typeof window !== "undefined") { (window as any).useStore = useStore; }
