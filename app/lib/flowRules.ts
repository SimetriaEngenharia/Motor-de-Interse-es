/* REGRAS DE ENGENHARIA DE FLUXO
 * ---------------------------------------------------------------------------
 * Este módulo é o que um engenheiro sabe ao olhar uma planta, escrito como
 * regra. Nada aqui depende do ESTAQUEAMENTO: o estaqueamento é endereço
 * interno, arbitrário — o eixo pode ter sido desenhado em qualquer sentido, e
 * as regiões de cunha nascem com estaca decrescente. Confiar nele para deduzir
 * sentido é errado por construção.
 *
 * O que ancora o fluxo é a GEOMETRIA DA CONCORDÂNCIA:
 *
 *   1. MANTER A DIREITA. O raio de um quadrante só é dirigível num sentido —
 *      aquele em que a curva fica à direita do condutor. O outro obrigaria a
 *      cortar a mão contrária. Isto sozinho decide, em cada quadrante, se o
 *      movimento é da principal para o ramo (desaceleração / entrada do ramo)
 *      ou do ramo para a principal (aceleração / saída).
 *
 *   2. NUMA VIA DE MÃO DUPLA a regra de manter a direita já resolve as faixas:
 *      a faixa à direita do eixo leva um fluxo, a da esquerda o oposto. Não é
 *      convenção — é a mesma regra de circulação.
 *
 *   3. NUMA VIA DE MÃO ÚNICA (ramo, marginal, pista de via dividida) a seção
 *      não diz o sentido: ele vem da rede. Quem o dá é a concordância dirigível
 *      da regra 1.
 *
 * As duas grandezas de entrada são vetores geométricos, não estacas:
 *   M = direção do eixo da principal junto ao cruzamento (qualquer dos sentidos)
 *   B = direção do eixo do ramo APONTANDO PARA LONGE da principal
 * O resultado é invariante ao sinal de M (trocar M troca montante por jusante
 * e o sinal do giro ao mesmo tempo), que é o que garante independência do
 * estaqueamento.
 */

import { CIRCULACAO, FlowDir, outerLaneFlow, flowCtxFromComponents, sideOf } from "./flow";

export type Pt = { x: number; y: number };
export type Quadrante = "montante" | "jusante";
export type TipoRamo = "Aceleração" | "Desaceleração";

export const cross2 = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;

export const unit = (v: Pt): Pt => {
  const n = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / n, y: v.y / n };
};

/** GIRO DA CONCORDÂNCIA — mantido só para diagnóstico; nenhuma decisão de
 * sentido depende dele. */
export const giroDeConcordanciaDiag = (M: Pt, B: Pt) => cross2(unit(M), unit(B));

/** REGRA 1 — CONTINUIDADE DE FLUXO. É só isto.
 *
 * O quadrante não tem sentido próprio: ele é a CONTINUAÇÃO do fluxo das duas
 * faixas que liga. Quem chega, entra; quem sai, sai. Então basta olhar a faixa
 * da principal que serve aquele quadrante:
 *
 *   o braço da principal daquele quadrante está A MONTANTE do fluxo dela
 *     → o veículo vem por ali e vira para o ramo   = ENTRADA (desaceleração)
 *   está a jusante
 *     → o veículo sai do ramo e entra na principal  = SAÍDA (aceleração)
 *
 * `alimentaPelaPrincipal` é esse teste, medido no próprio quadrante: o fluxo da
 * faixa vizinha da principal aponta para dentro dele?
 *
 * Nada de posição do nó ao longo da via, nada de giro de concordância. Foi essa
 * herança que fazia o sentido MUDAR quando a interseção era arrastada de lugar:
 * o papel do ramo passava a depender de onde o nó caiu, e não do fluxo — que é
 * a única coisa que o determina.
 *
 * `maoRamo` é a única exceção, e é dado do usuário: ramo declarado de mão única
 * manda, porque aí o ramo já diz sozinho se recebe ou entrega tráfego. */
export function movimentoDoQuadrante(o: {
  alimentaPelaPrincipal: boolean;
  maoRamo?: "afastando" | "aproximando" | null;
}): { tipo: TipoRamo; porque: string } {
  const { alimentaPelaPrincipal, maoRamo } = o;
  if (maoRamo === "afastando")
    return { tipo: "Desaceleração", porque: "ramo de mão única, só afastando da principal" };
  if (maoRamo === "aproximando")
    return { tipo: "Aceleração", porque: "ramo de mão única, só aproximando da principal" };
  return alimentaPelaPrincipal
    ? { tipo: "Desaceleração", porque: "o fluxo da principal entra no quadrante e continua para o ramo" }
    : { tipo: "Aceleração", porque: "o fluxo da principal sai do quadrante: o tráfego vem do ramo" };
}

/** GIRO DA CONCORDÂNCIA — mantido só para diagnóstico; nenhuma decisão de
 * sentido depende dele. */
export const giroDeConcordancia = (M: Pt, B: Pt) => cross2(unit(M), unit(B));

/** REGRA 2 — o fluxo que o movimento impõe ao RAMO, como vetor.
 * Entrada do ramo: o tráfego afasta-se da principal (+B). Saída: aproxima-se.
 * É a continuidade lida do outro lado do quadrante. */
export function fluxoDoRamo(B: Pt, tipo: TipoRamo): Pt {
  const u = unit(B);
  return tipo === "Desaceleração" ? u : { x: -u.x, y: -u.y };
}

/** Traduz um fluxo geométrico para a convenção de ARMAZENAMENTO (a favor ou
 * contra o estaqueamento). O estaqueamento entra só aqui, e só como endereço:
 * é assim que o sentido deduzido é guardado e redesenhado. */
export const fluxoParaSentido = (fluxo: Pt, tangenteDoEixo: Pt): FlowDir =>
  fluxo.x * tangenteDoEixo.x + fluxo.y * tangenteDoEixo.y >= 0 ? "forward" : "backward";

/** Mão única declarada num corredor, traduzida para a relação com a principal
 * (é o que a regra 1 consome). `sentido` é a mão declarada, em relação ao
 * estaqueamento do ramo; `tangenteNoCruzamento` é a tangente do ramo junto à
 * principal e `B` aponta para longe dela. */
export function maoDoRamo(
  sentido: FlowDir | null | undefined,
  tangenteNoCruzamento: Pt,
  B: Pt,
): "afastando" | "aproximando" | null {
  if (!sentido) return null;
  const t = unit(tangenteNoCruzamento);
  const fluxo = sentido === "forward" ? t : { x: -t.x, y: -t.y };
  return fluxo.x * B.x + fluxo.y * B.y >= 0 ? "afastando" : "aproximando";
}

/** Pé da perpendicular de um ponto sobre uma polilinha, com a tangente local
 * (no sentido em que a polilinha foi escrita) e a distância acumulada. */
export function noEixo(poly: Pt[], p: Pt) {
  let melhor = { d: Infinity, x: poly[0].x, y: poly[0].y, ux: 1, uy: 0, s: 0 };
  let acc = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const l2 = vx * vx + vy * vy;
    const len = Math.sqrt(l2);
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2)) : 0;
    const qx = a.x + t * vx;
    const qy = a.y + t * vy;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d < melhor.d) {
      melhor = { d, x: qx, y: qy, ux: len > 0 ? vx / len : 1, uy: len > 0 ? vy / len : 0, s: acc + t * len };
    }
    acc += len;
  }
  return melhor;
}

/** Direção do ramo APONTANDO PARA LONGE da principal, lida a `recuo` metros do
 * cruzamento — perto o suficiente para valer como direção local, longe o
 * suficiente para não ser ruído do próprio nó. */
export function direcaoParaLonge(
  eixoRamo: Pt[],
  eixoMain: Pt[],
  cruzamento: Pt,
  recuo = 15,
): Pt | null {
  if (eixoRamo.length < 2) return null;
  const noRamo = noEixo(eixoRamo, cruzamento);
  let acc = 0;
  const cum: number[] = [0];
  for (let i = 0; i < eixoRamo.length - 1; i++) {
    acc += Math.hypot(eixoRamo[i + 1].x - eixoRamo[i].x, eixoRamo[i + 1].y - eixoRamo[i].y);
    cum.push(acc);
  }
  const total = acc;
  const emS = (s: number): Pt => {
    const alvo = Math.max(0, Math.min(total, s));
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < alvo) i++;
    const seg = cum[i + 1] - cum[i] || 1;
    const t = (alvo - cum[i]) / seg;
    return {
      x: eixoRamo[i].x + (eixoRamo[i + 1].x - eixoRamo[i].x) * t,
      y: eixoRamo[i].y + (eixoRamo[i + 1].y - eixoRamo[i].y) * t,
    };
  };
  /* Anda para os dois lados e fica com o que se afasta da principal. */
  const a = emS(noRamo.s + recuo);
  const b = emS(noRamo.s - recuo);
  const dA = noEixo(eixoMain, a).d;
  const dB = noEixo(eixoMain, b).d;
  const alvo = dA >= dB ? a : b;
  const v = { x: alvo.x - cruzamento.x, y: alvo.y - cruzamento.y };
  if (Math.hypot(v.x, v.y) < 1e-6) return null;
  return unit(v);
}

/** Ponto de cruzamento de dois eixos: o ponto do ramo mais próximo da
 * principal. Vale para ramo que morre na principal e para ramo que a cruza. */
export function cruzamentoDeEixos(eixoMain: Pt[], eixoRamo: Pt[]): Pt {
  let melhor = eixoRamo[0];
  let d = Infinity;
  for (const p of eixoRamo) {
    const dd = noEixo(eixoMain, p).d;
    if (dd < d) {
      d = dd;
      melhor = p;
    }
  }
  return melhor;
}

/** SENTIDO DO BORDO de um lado da via, na estaca dada.
 *
 * Lê a chave nova da faixa (corredor::lado::nº). Projetos antigos guardavam o
 * sentido por região/link — ainda são lidos, mas só quando não há chave nova. */
export function sentidoDoBordo(
  estado: {
    corridors: any[];
    assemblies: any[];
    laneDirections: Record<string, FlowDir>;
  },
  alignmentId: string,
  sta: number,
  lado: "Esq" | "Dir",
): FlowDir {
  const c = estado.corridors.find((c: any) => c.alignmentId === alignmentId);
  if (!c) return "forward";
  const regiao =
    c.regions.find((r: any) => sta >= r.startStation && sta <= r.endStation) || c.regions[0];

  const explicito = Object.keys(estado.laneDirections || {}).some((k) =>
    k.startsWith(`${c.id}::${lado}::`),
  );
  if (!explicito && regiao) {
    const legado = estado.laneDirections[`${c.id}_${regiao.id}_${lado === "Dir" ? "L1" : "L2"}`];
    if (legado) return legado;
  }

  return outerLaneFlow(estado.laneDirections as any, c.id, lado, {
    ...flowCtxFromComponents(
      estado.assemblies.find((a: any) => a.id === regiao?.assemblyId)?.components,
    ),
    mao: (c as any).mao ?? null,
    maoSentido: (c as any).maoSentido ?? null,
  });
}

/** PAPEL DOS DOIS QUADRANTES de uma interseção — a conta, num só lugar.
 *
 * Existiam três cópias dela: o store (com esta regra), a planta e o assistente
 * (cada um com uma versão mais pobre, que lia só a chave antiga de
 * laneDirections e caía sempre em "forward"). Quando discordavam, o assistente
 * escrevia o L que o usuário arrastava em `decelL` enquanto o store lia
 * `accelL` — e a faixa de aceleração simplesmente não mudava, como se não
 * tivesse sido feita. Uma conta só, um resultado só. */
export function papelDosQuadrantes(o: {
  corridors: any[];
  assemblies: any[];
  laneDirections: Record<string, FlowDir>;
  mainAlignmentId: string;
  mainStation: number;
  branchAlignmentId: string;
  /** Tangente da principal no cruzamento, no sentido do estaqueamento. */
  mainUnitDir: Pt;
  /** Eixo do ramo apontando PARA LONGE da principal. */
  branchUnitDir: Pt;
  /** Tangente do ramo no nó, no sentido do estaqueamento do ramo. */
  tangenteRamoNoNo: Pt;
}): {
  back: TipoRamo;
  fwd: TipoRamo;
  principalAFavor: boolean;
  porqueBack: string;
  porqueFwd: string;
} {
  const lado = sideOf(o.mainUnitDir, o.branchUnitDir);
  const principalAFavor =
    sentidoDoBordo(o, o.mainAlignmentId, o.mainStation, lado) === "forward";

  const ramo = o.corridors.find((c: any) => c.alignmentId === o.branchAlignmentId);
  const maoRamo =
    (ramo as any)?.mao === "unica"
      ? maoDoRamo(
          (ramo as any).maoSentido || "forward",
          o.tangenteRamoNoNo,
          o.branchUnitDir,
        )
      : null;

  const back = movimentoDoQuadrante({ alimentaPelaPrincipal: principalAFavor, maoRamo });
  const fwd = movimentoDoQuadrante({ alimentaPelaPrincipal: !principalAFavor, maoRamo });
  return {
    back: back.tipo,
    fwd: fwd.tipo,
    principalAFavor,
    porqueBack: back.porque,
    porqueFwd: fwd.porque,
  };
}

/** `papelDosQuadrantes` a partir do estado e da interseção: deriva os vetores
 *  dos alinhamentos. É a porta que a UI usa — a planta e o assistente. */
export function papelDosQuadrantesDaInt(
  estado: {
    alignments: any[];
    corridors: any[];
    assemblies: any[];
    laneDirections: Record<string, FlowDir>;
  },
  int: any,
) {
  const mainAlign = estado.alignments.find((a: any) => a.id === int.mainAlignmentId);
  const branchAlign = estado.alignments.find((a: any) => a.id === int.branchAlignmentId);
  if (!mainAlign?.getPointAtStation || !branchAlign?.getOrientationAtStation) {
    return {
      back: "Desaceleração" as TipoRamo,
      fwd: "Aceleração" as TipoRamo,
      principalAFavor: true,
      porqueBack: "sem alinhamento para medir",
      porqueFwd: "sem alinhamento para medir",
    };
  }

  const isStart =
    int.branchStation === 0 || int.branchStation < branchAlign.length / 2;
  const bN = branchAlign.getOrientationAtStation(int.branchStation);
  const branchUnitDir = isStart
    ? { x: bN.tx, y: bN.ty }
    : { x: -bN.tx, y: -bN.ty };

  const M = mainAlign.getPointAtStation(int.mainStation);
  const Mf = mainAlign.getPointAtStation(
    Math.min(int.mainStation + 10, mainAlign.length),
  );
  const mainUnitDir = unit({ x: Mf.x - M.x, y: Mf.y - M.y });

  return papelDosQuadrantes({
    corridors: estado.corridors,
    assemblies: estado.assemblies,
    laneDirections: estado.laneDirections,
    mainAlignmentId: int.mainAlignmentId,
    mainStation: int.mainStation,
    branchAlignmentId: int.branchAlignmentId,
    mainUnitDir,
    branchUnitDir,
    tangenteRamoNoNo: isStart
      ? branchUnitDir
      : { x: -branchUnitDir.x, y: -branchUnitDir.y },
  });
}
