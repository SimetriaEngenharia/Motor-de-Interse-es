/* FLUXO — FONTE ÚNICA
 * ---------------------------------------------------------------------------
 * O sentido do tráfego é dado de projeto, não decoração: a planta desenha a
 * seta a partir daqui e a interseção classifica aceleração/desaceleração a
 * partir daqui. Duas leituras da mesma regra davam desenho e cálculo em
 * desacordo — a seta apontava para um lado e a tabela dizia o contrário.
 */

export type FlowDir = "forward" | "backward";

/* REGRA DE CIRCULAÇÃO DO PAÍS — no Brasil os veículos andam pela DIREITA.
 * Este é o único lugar do software que sabe disto: é daqui que sai o sentido
 * padrão de toda faixa. Mão inglesa (Reino Unido, África do Sul) é trocar esta
 * constante — nada mais no código repete a convenção. */
export type Circulacao = "direita" | "esquerda";
export const CIRCULACAO: Circulacao = "direita";

/** Chave do fluxo de uma faixa: corredor::lado::nº (1 = a que encosta no eixo). */
export const laneFlowKey = (
  corridorId: string | undefined,
  side: "Esq" | "Dir",
  index: number,
) => `${corridorId}::${side}::${index}`;

/** PADRÃO FÍSICO — mão dupla num eixo: o veículo mantém-se do lado da
 * circulação do país. Circulando pela direita, a faixa à direita do eixo (Dir)
 * corre no sentido do estaqueamento e a da esquerda (Esq) volta. */
export const defaultLaneFlow = (side: "Esq" | "Dir"): FlowDir =>
  CIRCULACAO === "direita"
    ? side === "Dir"
      ? "forward"
      : "backward"
    : side === "Esq"
      ? "forward"
      : "backward";

/** O que a seção diz sobre a via, para o palpite de mão. */
export interface FlowCtx {
  /** Declarado no corredor — manda em qualquer palpite. */
  mao?: "dupla" | "unica" | null;
  /** Sentido da mão única declarada (padrão: sentido do estaqueamento). */
  maoSentido?: FlowDir | null;
  /** DEDUZIDO PELA GEOMETRIA (lib/flowRules): sentido que a concordância
   * dirigível impõe a esta via. É o único dado que resolve uma via de mão
   * única — a seção dela não contém essa informação. */
  sentidoDeduzido?: FlowDir | null;
  /** Lado do eixo-pai, quando este eixo é um offset dele (+1 Dir, -1 Esq). */
  axisOffsetSign?: number | null;
  /** Lados que realmente têm faixa de tráfego na seção. */
  sidesWithLanes?: ("Esq" | "Dir")[] | null;
  /** Há canteiro central / separador físico entre os dois lados. */
  hasMedian?: boolean | null;
}

/** MÃO DO CORREDOR — devolve o sentido único da via quando ela é de mão única,
 * ou null quando é de mão dupla (aí quem decide é o lado da faixa, pela mesma
 * regra de manter a direita).
 *
 * 1. Mão declarada no corredor manda — dado de projeto.
 * 2. Eixo em OFFSET de outro é pista de via dividida (ou marginal): mão única.
 * 3. Seção com faixa de um só lado é mão única — e aí o sentido vem da
 *    geometria da concordância, não da seção: a seção não o contém. */
export function corridorHandedness(ctx?: FlowCtx): FlowDir | null {
  if (!ctx) return null;
  if (ctx.mao === "unica") return ctx.maoSentido || ctx.sentidoDeduzido || "forward";
  if (ctx.mao === "dupla") return null;
  if (ctx.axisOffsetSign) return ctx.axisOffsetSign > 0 ? "forward" : "backward";
  const lados = ctx.sidesWithLanes;
  if (lados && lados.length === 1)
    return ctx.sentidoDeduzido || defaultLaneFlow(lados[0]);
  return null;
}

/** Palpite para uma faixa: mão do corredor, senão o lado dela. */
export const guessLaneFlow = (side: "Esq" | "Dir", ctx?: FlowCtx): FlowDir =>
  corridorHandedness(ctx) || defaultLaneFlow(side);

/** LÊ A SEÇÃO e diz que tipo de via é aquela — é daqui que sai o palpite bom.
 * Quantos lados do eixo têm pista, e há canteiro central? São os mesmos sinais
 * que uma pessoa usa olhando o mapa. */
export function flowCtxFromComponents(
  components?: { type?: string; side?: "Left" | "Right" }[] | null,
): FlowCtx {
  if (!components || components.length === 0) return {};
  const lados = new Set<"Esq" | "Dir">();
  let hasMedian = false;
  for (const c of components) {
    if (c.type === "Pista") lados.add(c.side === "Left" ? "Esq" : "Dir");
    if (c.type === "Canteiro Central") hasMedian = true;
  }
  return { sidesWithLanes: lados.size ? Array.from(lados) : null, hasMedian };
}

/** Por que o palpite é este — vai no diagnóstico da planta. */
export function flowGuessReason(ctx?: FlowCtx): string {
  if (ctx?.mao === "unica")
    return "mão única declarada no corredor (" +
      (ctx.maoSentido === "backward" ? "contra o estaqueamento" : "a favor do estaqueamento") + ")";
  if (ctx?.mao === "dupla") return "mão dupla declarada no corredor";
  if (ctx?.axisOffsetSign) return "eixo em offset: pista de via dividida, mão única";
  const lados = ctx?.sidesWithLanes;
  if (lados && lados.length === 1)
    return (
      "pista só à " + (lados[0] === "Dir" ? "direita" : "esquerda") + " do eixo: mão única" +
      (ctx?.sentidoDeduzido ? ", sentido dado pela concordância dirigível" : "")
    );
  if (ctx?.hasMedian) return "canteiro central: mão dupla dividida";
  return "mão dupla, circulação pela " + CIRCULACAO;
}

/** Sentido de uma faixa: o que o usuário fixou, senão o palpite. */
export function laneFlow(
  laneDirections: Record<string, FlowDir>,
  corridorId: string | undefined,
  side: "Esq" | "Dir",
  index: number,
  ctx?: FlowCtx,
): FlowDir {
  return laneDirections[laneFlowKey(corridorId, side, index)] || guessLaneFlow(side, ctx);
}

/** Fluxo do BORDO daquele lado: manda a faixa mais externa já definida. */
export function outerLaneFlow(
  laneDirections: Record<string, FlowDir>,
  corridorId: string | undefined,
  side: "Esq" | "Dir",
  ctx?: FlowCtx,
): FlowDir {
  const prefix = `${corridorId}::${side}::`;
  let outer: { idx: number; dir: FlowDir } | null = null;
  for (const [k, v] of Object.entries(laneDirections || {})) {
    if (!k.startsWith(prefix)) continue;
    const idx = Number(k.slice(prefix.length)) || 0;
    if (!outer || idx > outer.idx) outer = { idx, dir: v };
  }
  return outer ? outer.dir : guessLaneFlow(side, ctx);
}

/** Lado geométrico de um vetor em relação a um sentido de estaqueamento.
 * Mundo com y para cima: produto vetorial negativo = direita (Dir). Isto
 * substitui bandeiras herdadas do desenho da interseção — o lado é um fato
 * geométrico, não uma convenção guardada. */
export const cross = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => a.x * b.y - a.y * b.x;

export const sideOf = (
  stationDir: { x: number; y: number },
  toward: { x: number; y: number },
): "Esq" | "Dir" => (cross(stationDir, toward) < 0 ? "Dir" : "Esq");

/** PAPEL DO RAMO — a regra vive em lib/flowRules (geometria da concordância).
 * Aqui ficam apenas os rótulos. */
export const rampLabel = (type: "Aceleração" | "Desaceleração") =>
  type === "Desaceleração" ? "ENTRADA" : "SAÍDA";

export const rampColor = (type: "Aceleração" | "Desaceleração") =>
  type === "Desaceleração" ? "#f59e0b" : "#38bdf8";
