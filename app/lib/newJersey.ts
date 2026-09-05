/* BARREIRA DE CONCRETO — PERFIL NEW JERSEY
 * ---------------------------------------------------------------------------
 * Fonte única do perfil, usada pela geometria do corredor, pelo desenho da
 * seção tipo e pelo glifo da paleta. Antes o componente era uma caixa de
 * quatro pontos com deltas fixos (0,10 / 0,05 / 0,30) — não era New Jersey
 * nenhuma: não tinha pé, barriga nem pescoço, e a largura declarada não
 * fechava com a base desenhada.
 *
 * O perfil é uma FACE de segurança repetida:
 *
 *      topo (0,15)
 *        ├──────┤            ─┬─
 *        │      │             │  pescoço  (face quase vertical)
 *        ╱      ╲            ─┼─  0,33  barriga (quebra)
 *       ╱        ╲            │  corpo defletor
 *      ╱          ╲          ─┼─  0,075  pé
 *     ╱            ╲          │
 *    ┴──────────────┴        ─┴─  base
 *
 * Larguras de base normativas (DNIT / ABNT NBR 14885):
 *   SIMPLES = 0,38 m  → uma face + tardoz vertical  (recuo 0,23 + topo 0,15)
 *   DUPLA   = 0,61 m  → duas faces simétricas       (2 × 0,23 + topo 0,15)
 * As duas saem da MESMA face: recuo de 0,23 m por face. É por isso que 0,38 e
 * 0,61 não são números soltos — são 0,15 + 1×0,23 e 0,15 + 2×0,23.
 *
 * DUPLA EM DESNÍVEL: pistas em níveis diferentes. O topo é único; a face de
 * jusante nasce mais embaixo, então aquela face fica mais alta pelo desnível.
 *
 * O recuo do pescoço é sempre DERIVADO (base − topo − pé − barriga): assim a
 * base que o usuário declara é exatamente a que o desenho fecha.
 */

export type NJTipo = "Simples" | "Dupla" | "Dupla Desnível";

/** Base normativa por tipo [m]. */
export const NJ_BASE: Record<NJTipo, number> = {
  Simples: 0.38,
  Dupla: 0.61,
  "Dupla Desnível": 0.61,
};

export const NJ_PADRAO = {
  tipo: "Simples" as NJTipo,
  width: 0.38,        // largura da base
  height: 0.81,       // altura total
  topWidth: 0.15,     // largura do topo
  toeHeight: 0.075,   // altura do pé
  toeWidth: 0.05,     // recuo do pé
  bellyHeight: 0.33,  // altura da barriga (quebra da face)
  bellyWidth: 0.155,  // recuo do corpo defletor
  desnivel: 0,        // só na dupla em desnível
  lastro: 0.1,        // altura do lastro/berço de concreto sob a barreira
  lastroWidth: 0,     // largura do lastro (0 = base + 2 × 0,05 de balanço)
};

export interface NJParams {
  tipo?: NJTipo | string;
  width?: number;
  height?: number;
  topWidth?: number;
  toeHeight?: number;
  toeWidth?: number;
  bellyHeight?: number;
  bellyWidth?: number;
  desnivel?: number;
  lastro?: number;
  lastroWidth?: number;
}

export interface NJPonto {
  /** Distância para FORA a partir da base interna (lado do tráfego) [m]. */
  x: number;
  /** Altura acima do ponto de ancoragem [m]. */
  y: number;
  code: string;
}

/** Perfil fechado da barreira, no sentido: base interna → topo → base externa.
 * O primeiro ponto é (0,0) e coincide com a ancoragem no pavimento. */
export function njProfile(p: NJParams = {}): {
  pts: NJPonto[];
  base: number;
  height: number;
  tipo: NJTipo;
  dupla: boolean;
  lastro: number;
  lastroWidth: number;
  desnivel: number;
} {
  const tipo = (["Simples", "Dupla", "Dupla Desnível"].includes(String(p.tipo))
    ? (p.tipo as NJTipo)
    : "Simples");
  const dupla = tipo !== "Simples";
  const base = Math.max(0.2, p.width ?? NJ_BASE[tipo]);
  const height = Math.max(0.3, p.height ?? NJ_PADRAO.height);
  const topWidth = Math.min(base * 0.8, Math.max(0.05, p.topWidth ?? NJ_PADRAO.topWidth));
  const toeHeight = Math.max(0, p.toeHeight ?? NJ_PADRAO.toeHeight);
  const bellyHeight = Math.max(toeHeight + 0.01, p.bellyHeight ?? NJ_PADRAO.bellyHeight);
  const desnivel = tipo === "Dupla Desnível" ? Math.max(0, p.desnivel ?? 0) : 0;
  const lastro = Math.max(0, p.lastro ?? NJ_PADRAO.lastro);
  /* O berço projeta-se além das faces da barreira; 0 acompanha a base com
     5 cm de balanço de cada lado. */
  const lastroPedido = Math.max(0, p.lastroWidth ?? 0);

  /* Recuo disponível por face: numa dupla, as duas faces repartem. */
  const recuoTotal = Math.max(0.02, base - topWidth);
  const recuoFace = dupla ? recuoTotal / 2 : recuoTotal;

  /* Pé e barriga são cotas de projeto; o pescoço fecha a conta. Se as duas
     primeiras já estourarem o recuo da face, elas são reduzidas na proporção
     em que foram pedidas — a base declarada nunca é violada. */
  let toeWidth = Math.max(0, p.toeWidth ?? NJ_PADRAO.toeWidth);
  let bellyWidth = Math.max(0, p.bellyWidth ?? NJ_PADRAO.bellyWidth);
  const somaBaixo = toeWidth + bellyWidth;
  const limiteBaixo = recuoFace * 0.97;
  if (somaBaixo > limiteBaixo && somaBaixo > 0) {
    const k = limiteBaixo / somaBaixo;
    toeWidth *= k;
    bellyWidth *= k;
  }

  const face = (
    x0: number,
    dir: 1 | -1,
    yBase: number,
    prefixo: string,
  ): NJPonto[] => {
    const pe = { x: x0 + dir * toeWidth, y: yBase + toeHeight, code: `${prefixo}_Pe` };
    const barriga = {
      x: x0 + dir * (toeWidth + bellyWidth),
      y: yBase + bellyHeight,
      code: `${prefixo}_Barriga`,
    };
    const topo = { x: x0 + dir * recuoFace, y: height, code: `${prefixo}_Topo` };
    return [pe, barriga, topo];
  };

  const pts: NJPonto[] = [{ x: 0, y: 0, code: "NJ_Base_Int" }];
  pts.push(...face(0, 1, 0, "NJ_Int"));
  if (dupla) {
    /* Face externa espelhada; em desnível ela nasce abaixo da interna. */
    const externa = face(base, -1, -desnivel, "NJ_Ext").reverse();
    pts.push({ x: externa[0].x, y: height, code: "NJ_Ext_Topo" });
    pts.push(externa[1], externa[2]);
    pts.push({ x: base, y: -desnivel, code: "NJ_Base_Ext" });
  } else {
    /* Simples: tardoz vertical. */
    pts.push({ x: base, y: height, code: "NJ_Ext_Topo" });
    pts.push({ x: base, y: 0, code: "NJ_Base_Ext" });
  }
  /* O topo externo espelhado já entrou com o code certo; remove duplicata de
     nome quando a face externa devolveu o topo. */
  const vistos = new Set<string>();
  for (const pt of pts) {
    let c = pt.code;
    let n = 2;
    while (vistos.has(c)) c = `${pt.code}_${n++}`;
    pt.code = c;
    vistos.add(c);
  }

  return { pts, base, height, tipo, dupla, lastro, lastroWidth: lastroPedido > 0 ? lastroPedido : base + 0.1, desnivel };
}

/** Perfil em coordenadas de tela (y para baixo), pronto para SVG.
 * `escala` em px/m; devolve também a caixa para dimensionar o viewBox. */
export function njPolygon(p: NJParams, escala: number) {
  const prof = njProfile(p);
  const yTop = prof.height;
  const yMin = -Math.max(prof.desnivel, 0) - prof.lastro;
  const pts = prof.pts.map((q) => ({ x: q.x * escala, y: (yTop - q.y) * escala, code: q.code }));
  const w = prof.base * escala;
  const h = (yTop - yMin) * escala;
  const yBaseInt = (yTop - 0) * escala;
  const yBaseExt = (yTop + prof.desnivel) * escala;
  /* Balanço do berço para cada lado, em px. */
  const balancoPx = ((prof.lastroWidth - prof.base) / 2) * escala;
  return { prof, pts, w, h, yBaseInt, yBaseExt, lastroPx: prof.lastro * escala, balancoPx };
}
