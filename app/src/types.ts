import { SurfaceDTM } from './lib/dtm';

export type Parameter = {
  id: string;
  name: string;
  type: 'Double' | 'Integer' | 'String';
  value: number;
};

export type C3DPoint = {
  id: string;
  referenceId: string | null; // ID of the origin point, or null for absolute origin
  dx: string; // formula
  dy: string; // formula
  isETW?: boolean; // Se é bordo (Edge of Traveled Way)
  label?: string;
  targetSurface?: boolean;
  cutSlope?: number;
  fillSlope?: number;
  maxDrop?: number;
  benchWidth?: number;
  benchSlope?: number;
  side?: 'Left' | 'Right';
};

export type C3DLink = {
  id: string;
  p1: string;
  p2: string;
  type?: string;
  offsetStyle?: string;
};

export type PavementLayer = {
  id: string;
  name: string;
  thickness: number;
};

export type PavementLayersConfig = {
  revestimento: PavementLayer[];
  base: PavementLayer[];
  subBase: PavementLayer[];
  cftCorte: number;
  cftAterro: number;
  limpeza: number;
};

export type SubassemblyComponent = {
  id: string;
  type: 'Pista' | 'Acostamento' | 'Guia' | 'Sarjeta' | 'Talude' | 'Passeio' | 'New Jersey' | 'Canteiro Central' | 'Faixa de Segurança' | 'Refúgio';
  side: 'Left' | 'Right';
  params: Record<string, any>;
  attachToPoint?: string;
  layers?: PavementLayersConfig;
};

export type Assembly = {
  id: string;
  name: string;
  parameters: Parameter[]; // Keep this for legacy or generic params
  points: C3DPoint[];
  links: C3DLink[];
  jsFunctionBody?: string;
  components?: SubassemblyComponent[];
  etwPointIds?: string[];
};


export type CorridorRegion = {
  id: string;
  name: string;
  startStation: number;
  endStation: number;
  originalStartStation?: number;
  originalEndStation?: number;
  assemblyId: string;
  targets?: Record<string, string>; // Maps parameter name to target alignmentId
  /* ALVO PREFERENCIAL — tentado antes de `targets`, e SEM prolongar as pontas.
   * É como o alinhamento de nariz manda enquanto existe: quando o raio da seção
   * já não corta a linha preta, o alvo cai de volta para `targets` (o
   * alinhamento filho do bordo). */
  targetsPrefer?: Record<string, string>;
  inwardCenter?: { x: number, y: number };
  suppressSide?: "left" | "right";
  islandTargetId?: string;
};

export type Corridor = {
  id: string;
  name: string;
  alignmentId: string | null;
  regions: CorridorRegion[];
  frequency?: number;
  /* MÃO DA VIA — dado de projeto. Ausente = o software deduz da seção
   * (faixa de um lado só = mão única; dos dois lados = mão dupla). */
  mao?: "dupla" | "unica";
  /* Sentido da mão única: a favor (forward) ou contra (backward) o
   * estaqueamento. Só vale quando mao = "unica". */
  maoSentido?: "forward" | "backward";
};

// Topographic alignment type
export type AlignmentPoint = {
  x: number;
  y: number;
  station: number;
};

export type Layer = {
  id: string;
  name: string;
  color: string;
  isVisible: boolean;
  isLocked: boolean;
};
