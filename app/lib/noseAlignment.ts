/* ALINHAMENTO DE NARIZ (alinhamento de desenho)
 * ─────────────────────────────────────────────────────────────────
 * O desenho do nariz físico — cap laranja (largura NF) + bordo preto (offset
 * girado) — promovido a ALINHAMENTO DE VERDADE: entra na lista de
 * alinhamentos, é selecionável na planta, tem raio/tangente por elemento e
 * pode ser apontado como alvo de corredor.
 *
 * VINCULADO: reconstruído a cada mudança do nariz (tipo, offset, comprimento,
 * bordos do corredor), mas conservando o id — derivado da chave do nariz, a
 * mesma identidade que ntTipos/ntParams/ntEscolhas já usam. Assim os alvos que
 * apontam para ele não quebram quando a geometria muda.
 *
 * Editar à mão não faz sentido aqui: a fonte é o nariz, não o traço.
 */

import { Alignment3D, AlignmentPoint } from "./alignment";
import { fitLineArc, GeomSegment, Pt } from "./geomExtract";
import { rotuloNF, type NarizFisicoGeom } from "./intersection";

export const NOSE_ALIGN_PREFIX = "align-nariz-";
/* AMARRAÇÃO — a tracejada do nariz teórico até o meio do cap. Promovida a
 * alinhamento próprio, com nome e id estável, pelo mesmo motivo que a linha
 * preta: é para ela que os corredores vão apontar como alvo. Fica na camada
 * auxiliar para não haver traço a dobrar — quem a desenha na planta é o nariz,
 * e é ele que lhe dá o tracejado fino. Ligue a camada Auxiliar para a ver como
 * alinhamento. */
export const TIE_ALIGN_PREFIX = "align-amarra-";
export const NOSE_LAYER_ID = "layer-nariz";

/** Id estável a partir da chave do nariz ("123.4,567.8"). */
export const noseAlignmentId = (noseKey: string) =>
  NOSE_ALIGN_PREFIX + noseKey.replace(/[^A-Za-z0-9._-]+/g, "_");

export const tieAlignmentId = (noseKey: string) =>
  TIE_ALIGN_PREFIX + noseKey.replace(/[^A-Za-z0-9._-]+/g, "_");

export const isTieAlignmentId = (id: string) => id.startsWith(TIE_ALIGN_PREFIX);

/** Alinhamento derivado de nariz — a linha preta do nariz ou a sua amarração. */
export const isNoseAlignmentId = (id: string) =>
  id.startsWith(NOSE_ALIGN_PREFIX) || id.startsWith(TIE_ALIGN_PREFIX);

export interface NoseAlignInfo {
  /** nome da interseção que contém o nariz */
  intersecao?: string;
  /** nome do ramo (a rodovia do par que NÃO é a pista principal) */
  ramo?: string;
  /** nome da pista principal do par */
  pista?: string;
  /** rótulo interno do nariz — NT-01, NT-02 … (apresentado como NF-01) */
  nt?: string;
  /** entrada · saída · misto */
  tipo?: string;
  /** nome dado pelo usuário ao nariz — tem precedência */
  nomeCustom?: string;
  /** nome dado pelo usuário à amarração — tem precedência sobre o gerado */
  nomeCustomAmarra?: string;
}

/** AM · Interseção 01 · Ramo B · NF-01 */
export const tieAlignmentName = (info: NoseAlignInfo) => {
  if (info.nomeCustomAmarra && info.nomeCustomAmarra.trim()) {
    return info.nomeCustomAmarra.trim();
  }
  return ["AM", info.intersecao, info.ramo, rotuloNF(info.nt)]
    .filter((p) => p && String(p).trim())
    .join(" · ");
};

/** NF-01 · Interseção 01 · Ramo B */
export const noseAlignmentName = (info: NoseAlignInfo) => {
  if (info.nomeCustom && info.nomeCustom.trim()) return info.nomeCustom.trim();
  const partes = [rotuloNF(info.nt) || "NF", info.intersecao, info.ramo].filter(
    (p) => p && String(p).trim(),
  );
  return partes.join(" · ");
};

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Encadeia o nariz numa polilinha única: bordo da pista → NF → bordo do nariz.
 *  A estação 0 fica no bordo da pista, o NF cai na estação = largura do nariz. */
export const noseChain = (geom: NarizFisicoGeom): Pt[] => {
  let bruto: Pt[];
  if (geom.bordoB && geom.bordoB.length > 1) {
    const legB = [...geom.bordoB].slice(1).reverse();
    const legA = [...(geom.bordo || [])].slice(1);
    bruto = [...legB, geom.cap[0], geom.cap[1], ...legA];
  } else {
    bruto = [geom.cap[0], geom.cap[1], ...(geom.bordo || []).slice(1)];
  }
  const out: Pt[] = [];
  for (const p of bruto) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const ult = out[out.length - 1];
    if (ult && dist(ult, p) < 1e-4) continue;
    out.push({ x: p.x, y: p.y });
  }
  return out;
};

/** Rótulo de fronteira entre dois elementos ajustados. */
const rotuloFronteira = (
  anterior: GeomSegment | undefined,
  proximo: GeomSegment | undefined,
): string => {
  const aArco = anterior?.type === "arc";
  const pArco = proximo?.type === "arc";
  if (!anterior) return "PP";
  if (!proximo) return "PF";
  if (aArco && pArco) return "PCC";
  if (pArco) return "PC";
  if (aArco) return "PT";
  return "PI";
};

/**
 * Constrói o alinhamento de um nariz a partir da sua geometria resolvida.
 * `tol` em metros — mesma tolerância da Geometria Extraída.
 */
export function buildNoseAlignment(
  geom: NarizFisicoGeom,
  info: NoseAlignInfo,
  noseKey: string,
  tol = 0.05,
): Alignment3D | null {
  const pts = noseChain(geom);
  if (pts.length < 2) return null;

  /* Pontos estaqueados pela corda — é a polilinha que o alvo de corredor
   * intercepta (findTargetIntersection varre .points), então ela tem de ser a
   * geometria fiel, não a ajustada. */
  const points: AlignmentPoint[] = [{ sta: 0, x: pts[0].x, y: pts[0].y }];
  let sta = 0;
  for (let i = 1; i < pts.length; i++) {
    sta += dist(pts[i - 1], pts[i]);
    points.push({ sta, x: pts[i].x, y: pts[i].y });
  }
  const comprimento = sta;
  if (comprimento < 0.05) return null;

  /* Ajuste reta/arco: é daqui que saem raio, tangente e comprimento de cada
   * elemento na janela de propriedades. */
  let segs: GeomSegment[] = [];
  try {
    segs = fitLineArc(pts, tol);
  } catch {
    segs = [];
  }

  /** estação do vértice da polilinha mais próximo de P */
  const staDe = (p: Pt) => {
    let melhor = 0;
    let d = Infinity;
    for (const q of points) {
      const dq = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (dq < d) {
        d = dq;
        melhor = q.sta;
      }
    }
    return melhor;
  };

  const keyPoints: AlignmentPoint[] = [];
  if (segs.length === 0) {
    keyPoints.push({ sta: 0, x: pts[0].x, y: pts[0].y, label: "PP" });
    keyPoints.push({
      sta: comprimento,
      x: pts[pts.length - 1].x,
      y: pts[pts.length - 1].y,
      label: "PF",
    });
  } else {
    for (let i = 0; i <= segs.length; i++) {
      const anterior = i > 0 ? segs[i - 1] : undefined;
      const proximo = i < segs.length ? segs[i] : undefined;
      const p = proximo ? proximo.p1 : (anterior as GeomSegment).p2;
      const label = rotuloFronteira(anterior, proximo);
      // fronteira reta-reta sem deflexão real não vira elemento: ignora
      if (label === "PI" && anterior && proximo) {
        const a = Math.atan2(anterior.p2.y - anterior.p1.y, anterior.p2.x - anterior.p1.x);
        const b = Math.atan2(proximo.p2.y - proximo.p1.y, proximo.p2.x - proximo.p1.x);
        let d = Math.abs(((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (d < 0.5 * Math.PI / 180) continue;
      }
      const kp: AlignmentPoint = {
        sta: i === 0 ? 0 : i === segs.length ? comprimento : staDe(p),
        x: p.x,
        y: p.y,
        label,
      };
      // o raio vive no início do arco — é onde a janela de elemento o procura
      if (proximo?.type === "arc" && proximo.radius) kp.radius = proximo.radius;
      else if (!proximo && anterior?.type === "arc" && anterior.radius) kp.radius = anterior.radius;
      keyPoints.push(kp);
    }
  }

  const alg = new Alignment3D(noseAlignmentName(info), comprimento, points, [], keyPoints, []);
  alg.id = noseAlignmentId(noseKey);
  alg.isNoseAlignment = true;
  alg.noseKey = noseKey;
  alg.noseSource = { ...info };
  alg.noseSegments = segs;
  alg.layerId = NOSE_LAYER_ID;
  alg.color = "#0f172a";
  alg.isLocked = true; // derivado: não se arrasta PI de nariz
  return alg;
}

/**
 * Alinhamento da AMARRAÇÃO de um nariz: meio do cap → nariz teórico.
 *
 * Duas pontas, um segmento — de propósito. Como alvo de corredor ele passa a
 * valer exatamente sobre a cunha que fecha e nem um metro além: a extensão da
 * polilinha É o limite do alvo.
 *
 * Id derivado da chave do nariz, tal como a linha preta: sobrevive à
 * reconstrução, e um alvo que aponte para ele continua a apontar.
 */
export function buildTieAlignment(
  geom: NarizFisicoGeom,
  info: NoseAlignInfo,
  noseKey: string,
): Alignment3D | null {
  const a = geom?.amarra?.[0], b = geom?.amarra?.[1];
  if (!a || !b) return null;
  if (![a.x, a.y, b.x, b.y].every((v) => Number.isFinite(v))) return null;
  const comprimento = dist(a, b);
  if (comprimento < 0.05) return null;

  const points: AlignmentPoint[] = [
    { sta: 0, x: a.x, y: a.y },
    { sta: comprimento, x: b.x, y: b.y },
  ];
  const keyPoints: AlignmentPoint[] = [
    { sta: 0, x: a.x, y: a.y, label: "PP" },
    { sta: comprimento, x: b.x, y: b.y, label: "PF" },
  ];
  const alg = new Alignment3D(tieAlignmentName(info), comprimento, points, [], keyPoints, []);
  alg.id = tieAlignmentId(noseKey);
  alg.isNoseAlignment = true;
  (alg as any).isTieAlignment = true;
  (alg as any).noseKey = noseKey;
  (alg as any).noseSource = { ...info };
  alg.layerId = "layer-auxiliar";
  return alg;
}
