/* GALHO DA ÁRVORE — ramo gerado a partir da principal.
 *
 * A ordem se inverte em relação à interseção clássica. Lá o eixo do ramo já
 * existe, cruza o eixo da principal, e a estaca é ENCONTRADA por esse
 * cruzamento. Aqui a estaca é DADA e o eixo do ramo é GERADO a partir dela.
 *
 * Dois princípios sustentam o resto:
 *
 * 1. UM MOTOR SÓ. O eixo nasce NO EIXO da principal — cruzamento real — tanto
 *    no entroncamento como na alça. A alça é o entroncamento inteiro menos um
 *    ramo: o eixo do ramo dela não se sintetiza aqui, nasce da máquina como
 *    filho (offset) do fillete do quadrante que sobrevive, e por isso já vem
 *    no bordo por construção.
 *
 * 2. AMARRADO NA DIVERGÊNCIA, LIVRE DEPOIS. Só o primeiro PI (o nascimento) é
 *    regenerado quando a principal muda. Do segundo PI em diante o traçado é
 *    do projetista: raio, curvas e comprimento são dele. Sem isto o utilizador
 *    não consegue projetar o ramo; com amarração total, o app briga com ele.
 */

import { Alignment3D, rebuildFromPIs, rebuildProfileFromPIVs } from "./alignment";

/** Como a secundária encontra a principal. */
export type TopologiaGalho =
  /** Entroncamento menos um ramo: 1 nariz, no gore. Faixa de acel ou desacel. */
  | "alca"
  /** Chega até a principal: os dois bordos batem em ângulo. 2 narizes. */
  | "entroncamento";

export interface ParametrosGalho {
  mainAlignmentId: string;
  /** Âncora. Endereço estável no eixo da principal. */
  mainStation: number;
  lado: "Esq" | "Dir";
  /** Ângulo de divergência em relação à tangente da principal, em graus. */
  angulo: number;
  comprimento: number;
  topologia: TopologiaGalho;
  /** Mão única gera uma faixa adicional; dupla exige entroncamento. */
  maoUnica: boolean;
  /** Só para alça: decide QUAL ramo sobrevive — entrada (M-Fwd) ou saída (M-Back). */
  sentido?: "entrada" | "saida";
  /** Raio da curva do galho logo após a divergência. 0 = tangente reta. */
  raio?: number;
  largura?: number;
}

/** Ângulo abaixo do qual o fillete degenera e o caso é de gore, não de nariz. */
export const ANGULO_MIN_CRUZAMENTO = 16;
/** Abaixo deste, o cruzamento ainda é firme. Entre os dois, é zona de aviso. */
export const ANGULO_FRANCO = 30;

export type RegimeGalho = "cruzamento" | "limite" | "gore";

export function regimeDoAngulo(angulo: number): RegimeGalho {
  if (angulo >= ANGULO_FRANCO) return "cruzamento";
  if (angulo >= ANGULO_MIN_CRUZAMENTO) return "limite";
  return "gore";
}

/** Token do braço da principal cujo quadrante SOBREVIVE na alça.
 *
 * Os tokens são absolutos: não dependem do lado do galho. Quem SAI da principal
 * contorna o canto entre o braço de trás e o ramo (M-Back); quem ENTRA vem do
 * ramo e funde no braço da frente (M-Fwd). O espelhamento esquerda/direita troca
 * o giro, não o par de braços. Uma regra só, lida por todos os consumidores —
 * quadrante, aresta e nariz têm de concordar sobre qual lado vive. */
export function tokenQuadranteVivo(sentido?: "entrada" | "saida"): "M-Fwd" | "M-Back" {
  return sentido === "saida" ? "M-Back" : "M-Fwd";
}

/** A aresta do quadrante que NÃO existe na alça.
 *
 * É a "linha preta" que atravessa o gore: a perna do fillete do lado descartado.
 * Os narizes dela são cruzamentos com uma aresta que não deveria existir, então
 * removida a aresta eles caem sozinhos — não há o que apagar em separado.
 *
 * Só as duas arestas que tocam o ramo são candidatas; a que liga os dois braços
 * da principal (`M-Fwd-M-Back`) é o bordo oposto e fica intacta. */
export function arestaDoQuadranteMorto(
  edgeId: string,
  sentido?: "entrada" | "saida",
): boolean {
  if (!edgeId.includes("B-Arm")) return false;
  return !edgeId.includes(tokenQuadranteVivo(sentido));
}

export interface AvisoGalho {
  nivel: "erro" | "aviso";
  texto: string;
}

/** Validação das combinações. A mão diz quantas FAIXAS; a topologia, quantos NARIZES. */
export function validarGalho(p: ParametrosGalho): AvisoGalho[] {
  const avisos: AvisoGalho[] = [];

  /* Alça de mão dupla não fecha: precisaria de desaceleração E aceleração no
   * mesmo lado, sobrepostas. Isso já não é alça — é entroncamento. */
  if (p.topologia === "alca" && !p.maoUnica) {
    avisos.push({
      nivel: "erro",
      texto:
        "Alça de mão dupla não fecha: entrada e saída disputariam a mesma faixa. Use entroncamento.",
    });
  }

  const regime = regimeDoAngulo(p.angulo);
  if (regime === "gore") {
    avisos.push({
      nivel: "aviso",
      texto: `Ângulo de ${p.angulo}° é fechado demais para concordância: o nariz vira ponta de cunha e o cruzamento fica instável. Acima de ${ANGULO_MIN_CRUZAMENTO}° o motor responde bem.`,
    });
  } else if (regime === "limite") {
    avisos.push({
      nivel: "aviso",
      texto: `Ângulo de ${p.angulo}° está na zona limite. Funciona, mas pequenas mudanças no traçado deslocam bastante o nariz.`,
    });
  }

  if (p.topologia === "entroncamento" && p.angulo < 45) {
    avisos.push({
      nivel: "aviso",
      texto:
        "Entroncamento enviesado: um quadrante abre em α e o outro em 180−α, então com o mesmo raio um nariz sai apertado e o outro largo.",
    });
  }
  return avisos;
}

export interface GeometriaGalho {
  /** PIs do eixo. O primeiro é o nascimento — regenerado; os outros, do projetista. */
  pis: { x: number; y: number; radius?: number }[];
  nascimento: { x: number; y: number };
  azimute: number;
}

/** Geometria do galho a partir da âncora, no eixo da principal.
 *
 *  CONVENÇÃO DE LADO: o motor lê `dotRight = branchUnitDir · n >= 0` como lado
 *  DIREITO — o giro segue esse sinal. */
export function geometriaDoGalho(
  main: Alignment3D,
  p: ParametrosGalho,
): GeometriaGalho | null {
  if (!main?.getPointAtStation || !main.getOrientationAtStation) return null;

  const sta = Math.max(0, Math.min(p.mainStation, main.length));
  const M = main.getPointAtStation(sta);
  const o = main.getOrientationAtStation(sta);
  const sgn = p.lado === "Dir" ? 1 : -1;

  const nascimento = { x: M.x, y: M.y };
  const azimute = Math.atan2(o.ty, o.tx) + (sgn * (p.angulo * Math.PI)) / 180;
  const dir = { x: Math.cos(azimute), y: Math.sin(azimute) };

  const pis: { x: number; y: number; radius?: number }[] = [
    { x: nascimento.x, y: nascimento.y, radius: 0 },
  ];

  /* Com raio, o galho ganha um PI intermediário: diverge reto e depois curva.
   * Sem raio é uma tangente só. */
  if (p.raio && p.raio > 0 && p.comprimento > 40) {
    const dReto = Math.min(p.comprimento * 0.45, 60);
    /* O giro segue para o mesmo lado da divergência: o ramo abre da principal e
     * continua a abrir, nunca volta contra ela. */
    const az2 = azimute + sgn * 0.35;
    const resto = p.comprimento - dReto;
    pis.push({
      x: nascimento.x + dir.x * dReto,
      y: nascimento.y + dir.y * dReto,
      radius: p.raio,
    });
    pis.push({
      x: nascimento.x + dir.x * dReto + Math.cos(az2) * resto,
      y: nascimento.y + dir.y * dReto + Math.sin(az2) * resto,
      radius: 0,
    });
  } else {
    pis.push({
      x: nascimento.x + dir.x * p.comprimento,
      y: nascimento.y + dir.y * p.comprimento,
      radius: 0,
    });
  }

  return { pis, nascimento, azimute };
}

/** Constrói o Alignment3D do galho. `pisExistentes` preserva o traçado do projetista. */
export function construirAlinhamentoGalho(
  id: string,
  nome: string,
  main: Alignment3D,
  p: ParametrosGalho,
  surface: { getElevation: (x: number, y: number) => number | null } | null,
  pisExistentes?: { x: number; y: number; radius?: number }[],
): Alignment3D | null {
  const g = geometriaDoGalho(main, p);
  if (!g) return null;

  /* AMARRADO NA DIVERGÊNCIA, LIVRE DEPOIS: quando já há traçado, só o primeiro
   * PI é regenerado. Os seguintes são do projetista e ficam como estão. */
  const pis =
    pisExistentes && pisExistentes.length >= 2
      ? [{ ...pisExistentes[0], x: g.nascimento.x, y: g.nascimento.y }, ...pisExistentes.slice(1)]
      : g.pis;

  const { points, keyPoints, length } = rebuildFromPIs(pis);
  if (points.length === 0) return null;

  const elev = (pt: { x: number; y: number }) => surface?.getElevation(pt.x, pt.y) ?? 0;

  /* O greide nasce colado ao da principal no ponto de divergência — é o que o
   * projetista espera; dali para a frente é dele. */
  const { profilePoints, keyProfilePoints } = rebuildProfileFromPIVs([
    {
      sta: points[0].sta,
      elev: main.getElevationAtStation?.(p.mainStation) ?? elev(points[0]),
    },
    {
      sta: points[points.length - 1].sta,
      elev: elev(points[points.length - 1]),
    },
  ]);

  const a = new Alignment3D(nome, length, points, profilePoints, keyPoints, keyProfilePoints);
  a.id = id;
  return a;
}
