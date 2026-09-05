/**
 * DOM -> jsPDF vector painter.
 *
 * Repinta uma subárvore do DOM dentro do PDF usando primitivas nativas
 * (retângulos, linhas e TEXTO real), em vez de rasterizar. Usado para as
 * janelas de tabelas e para o carimbo, mantendo o texto nítido,
 * selecionável e pesquisável no PDF.
 *
 * Geometria: as folhas do app usam 1 px CSS = 1 mm, mas o fator é sempre
 * derivado do rect real da folha, então qualquer zoom/escala é absorvido.
 */

type Pdf = any;

interface Ctx {
  pdf: Pdf;
  /** mm por px CSS */
  k: number;
  /** canto superior-esquerdo da folha, em px de viewport */
  ox: number;
  oy: number;
}

const PT_PER_MM = 1 / 0.352778;

function rgb(color: string): [number, number, number] | null {
  if (!color) return null;
  const c = color.trim().toLowerCase();
  if (c === "transparent" || c === "none") return null;
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    const [r, g, b] = parts;
    const a = parts.length > 3 ? parts[3] : 1;
    if (!(a > 0.04)) return null;
    if (a < 1) {
      // compõe sobre branco (folha) para evitar sólidos indesejados
      return [
        Math.round(255 - (255 - r) * a),
        Math.round(255 - (255 - g) * a),
        Math.round(255 - (255 - b) * a),
      ];
    }
    return [r, g, b];
  }
  if (c.startsWith("#")) {
    const h = c.slice(1);
    const f = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    return [
      parseInt(f.slice(0, 2), 16),
      parseInt(f.slice(2, 4), 16),
      parseInt(f.slice(4, 6), 16),
    ];
  }
  return null;
}

function isHidden(el: Element): boolean {
  const s = getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden") return true;
  if (parseFloat(s.opacity || "1") < 0.05) return true;
  return false;
}

function fontOf(pdf: Pdf, s: CSSStyleDeclaration) {
  const fam = (s.fontFamily || "").toLowerCase();
  let base = "helvetica";
  if (/times|serif/.test(fam) && !/sans/.test(fam)) base = "times";
  if (/mono|courier|consolas/.test(fam)) base = "courier";
  const w = parseInt(s.fontWeight, 10);
  const bold = s.fontWeight === "bold" || (!isNaN(w) && w >= 600);
  const italic = s.fontStyle === "italic" || s.fontStyle === "oblique";
  let style = "normal";
  if (bold && italic) style = "bolditalic";
  else if (bold) style = "bold";
  else if (italic) style = "italic";
  pdf.setFont(base, style);
}

function transform(text: string, s: CSSStyleDeclaration) {
  switch (s.textTransform) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "capitalize":
      return text.replace(/\b\p{L}/gu, (m) => m.toUpperCase());
    default:
      return text;
  }
}

/**
 * Espessura PRETENDIDA da linha, em mm.
 *
 * O navegador arredonda border-width sub-pixel para 1 device pixel, e nesta
 * folha 1 px = 1 mm: uma grade de 0,2 mm chega ao estilo computado como 1 px,
 * isto é, 1 mm. Então o desenho respeita `data-grid-mm` / `data-frame-mm`
 * quando o elemento (ou um ancestral) os declara, e só cai no computado
 * quando não há intenção declarada.
 */
function intendedLineMm(el: Element, computedPx: number, k: number): number {
  const own = (el as HTMLElement).dataset?.frameMm ?? (el as HTMLElement).dataset?.gridMm;
  const src = own ?? (el.closest("[data-grid-mm]") as HTMLElement | null)?.dataset?.gridMm;
  const mm = src === undefined ? NaN : parseFloat(src);
  return isFinite(mm) && mm > 0 ? mm : computedPx * k;
}

/** fundo + bordas de um elemento */
function paintBox(ctx: Ctx, el: Element, bordersOnly = false) {
  const { pdf, k, ox, oy } = ctx;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;

  const x = (r.left - ox) * k;
  const y = (r.top - oy) * k;
  const w = r.width * k;
  const h = r.height * k;

  const bg = bordersOnly ? null : rgb(s.backgroundColor);
  if (bg) {
    pdf.setFillColor(bg[0], bg[1], bg[2]);
    const rad = Math.min(parseFloat(s.borderTopLeftRadius) || 0, r.height / 2) * k;
    if (rad > 0.15) pdf.roundedRect(x, y, w, h, rad, rad, "F");
    else pdf.rect(x, y, w, h, "F");
  }

  const sides: [string, number, number, number, number][] = [
    ["Top", x, y, x + w, y],
    ["Right", x + w, y, x + w, y + h],
    ["Bottom", x, y + h, x + w, y + h],
    ["Left", x, y, x, y + h],
  ];
  for (const [side, x1, y1, x2, y2] of sides) {
    const bwPx = parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0;
    if (bwPx <= 0) continue;
    if (s.getPropertyValue(`border-${side.toLowerCase()}-style`) === "none") continue;
    const col = rgb(s.getPropertyValue(`border-${side.toLowerCase()}-color`));
    if (!col) continue;
    pdf.setDrawColor(col[0], col[1], col[2]);
    pdf.setLineWidth(Math.max(0.05, intendedLineMm(el, bwPx, k)));
    pdf.line(x1, y1, x2, y2);
  }
}

/** todos os nós de texto de um elemento (linha a linha, via Range) */
function paintText(ctx: Ctx, el: Element) {
  const { pdf, k, ox, oy } = ctx;
  const s = getComputedStyle(el);
  const col = rgb(s.color) || [0, 0, 0];
  const fontPx = parseFloat(s.fontSize) || 10;
  const clip = el.getBoundingClientRect();

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const raw = node.nodeValue || "";
    if (!raw.trim()) continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0.2 && r.height > 0.2);
    range.detach?.();
    if (rects.length === 0) continue;

    const content = transform(raw.replace(/\s+/g, " ").trim(), s);
    // uma linha -> um rect; várias linhas (wrap) -> reparte o texto proporcionalmente
    const lines =
      rects.length === 1
        ? [content]
        : splitByWidth(content, rects.map((r) => r.width));

    fontOf(pdf, s);
    pdf.setTextColor(col[0], col[1], col[2]);
    const ls = parseFloat(s.letterSpacing);
    pdf.setCharSpace(isNaN(ls) ? 0 : ls * k);

    rects.forEach((r, i) => {
      const str = (lines[i] || "").trim();
      if (!str) return;
      // descarta o que estiver fora da caixa recortada (overflow hidden / truncate)
      if (r.bottom < clip.top - 0.5 || r.top > clip.bottom + 0.5) return;

      let sizeMm = fontPx * k;
      pdf.setFontSize(sizeMm * PT_PER_MM);
      // encolhe ligeiramente se a métrica do PDF for mais larga que a do browser
      const avail = (rects.length === 1 ? r.width : r.width) * k;
      const measured = pdf.getTextWidth(str);
      if (measured > avail * 1.005 && measured > 0) {
        sizeMm = sizeMm * (avail / measured);
        pdf.setFontSize(sizeMm * PT_PER_MM);
      }
      const x = (r.left - ox) * k;
      const y = (r.top - oy + r.height / 2) * k;
      pdf.text(str, x, y, { baseline: "middle" });
    });

    pdf.setCharSpace(0);
  }
}

/** reparte uma string em N linhas conforme as larguras medidas */
function splitByWidth(text: string, widths: number[]): string[] {
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  const words = text.split(" ");
  const out: string[] = [];
  let idx = 0;
  for (let i = 0; i < widths.length; i++) {
    const share = widths[i] / total;
    const take = i === widths.length - 1 ? words.length - idx : Math.max(1, Math.round(words.length * share));
    out.push(words.slice(idx, idx + take).join(" "));
    idx += take;
  }
  return out;
}

function paintMedia(ctx: Ctx, el: Element) {
  const { pdf, k, ox, oy } = ctx;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  const x = (r.left - ox) * k;
  const y = (r.top - oy) * k;
  try {
    if (el instanceof HTMLImageElement && el.src) {
      pdf.addImage(el.src, undefined, x, y, r.width * k, r.height * k);
    } else if (el instanceof HTMLCanvasElement) {
      pdf.addImage(el.toDataURL("image/png"), "PNG", x, y, r.width * k, r.height * k);
    }
  } catch {
    /* imagem não embutível: ignora */
  }
}

/* ------------------------------ SVG -> vetor ------------------------------ */

const GEOM_TAGS = ["path", "line", "polyline", "polygon", "rect", "circle", "ellipse"];

/** achata qualquer geometria SVG numa polilinha em mm de PDF */
function flatten(ctx: Ctx, el: SVGGraphicsElement): { pts: [number, number][]; closed: boolean } | null {
  const { k, ox, oy } = ctx;
  const m = el.getScreenCTM();
  if (!m) return null;
  const toMm = (x: number, y: number): [number, number] => [
    (m.a * x + m.c * y + m.e - ox) * k,
    (m.b * x + m.d * y + m.f - oy) * k,
  ];

  const tag = el.tagName.toLowerCase();
  const geo = el as unknown as SVGGeometryElement;
  const closed = tag === "polygon" || tag === "rect" || tag === "circle" || tag === "ellipse";

  // caminho reto/segmento -> não precisa amostragem
  if (tag === "line") {
    const l = el as unknown as SVGLineElement;
    return {
      pts: [
        toMm(l.x1.baseVal.value, l.y1.baseVal.value),
        toMm(l.x2.baseVal.value, l.y2.baseVal.value),
      ],
      closed: false,
    };
  }
  if (tag === "polyline" || tag === "polygon") {
    const list = (el as unknown as SVGPolylineElement).points;
    const pts: [number, number][] = [];
    for (let i = 0; i < list.numberOfItems; i++) {
      const p = list.getItem(i);
      pts.push(toMm(p.x, p.y));
    }
    return pts.length > 1 ? { pts, closed } : null;
  }

  if (typeof geo.getTotalLength !== "function" || typeof geo.getPointAtLength !== "function") return null;
  let total = 0;
  try {
    total = geo.getTotalLength();
  } catch {
    return null;
  }
  if (!(total > 0)) return null;

  // escala média user-space -> px de ecrã
  const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  const stepPx = 0.4; // erro de achatamento sub-pixel
  let n = Math.ceil((total * scale) / stepPx);
  n = Math.max(2, Math.min(n, 6000));
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const p = geo.getPointAtLength((total * i) / n);
    pts.push(toMm(p.x, p.y));
  }
  return { pts, closed };
}

/** remove pontos colineares (tolerância em mm) para enxugar o PDF */
function simplify(pts: [number, number][], tol = 0.02): [number, number][] {
  if (pts.length < 3) return pts;
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const len = Math.hypot(dx, dy);
    const dev = len < 1e-9
      ? Math.hypot(b[0] - a[0], b[1] - a[1])
      : Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / len;
    if (dev > tol) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function polyline(ctx: Ctx, pts: [number, number][], style: string, closed: boolean) {
  const { pdf } = ctx;
  if (pts.length < 2) return;
  const deltas: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  }
  pdf.lines(deltas, pts[0][0], pts[0][1], [1, 1], style, closed);
}

function paintSvgText(ctx: Ctx, el: SVGGraphicsElement) {
  const { pdf, k, ox, oy } = ctx;
  const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (!txt) return;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (r.width <= 0 && r.height <= 0) return;
  const m = el.getScreenCTM();
  const angle = m ? -(Math.atan2(m.b, m.a) * 180) / Math.PI : 0;
  const scale = m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1 : 1;

  fontOf(pdf, s);
  const c = rgb(s.fill) || rgb(s.color) || [0, 0, 0];
  pdf.setTextColor(c[0], c[1], c[2]);
  pdf.setFontSize((parseFloat(s.fontSize) || 8) * scale * k * PT_PER_MM);
  const cx = (r.left + r.width / 2 - ox) * k;
  const cy = (r.top + r.height / 2 - oy) * k;
  pdf.text(txt, cx, cy, { baseline: "middle", align: "center", angle });
}

/** desenha um <svg> completo como geometria vetorial nativa */
function paintSvg(ctx: Ctx, svg: SVGSVGElement) {
  const { pdf, k } = ctx;
  const nodes = svg.querySelectorAll<SVGGraphicsElement>([...GEOM_TAGS, "text", "image"].join(","));
  nodes.forEach((n) => {
    if (isHidden(n)) return;
    if (n.closest("[data-vec-skip]")) return;
    const tag = n.tagName.toLowerCase();

    if (tag === "text") {
      paintSvgText(ctx, n);
      return;
    }
    if (tag === "image") {
      paintMedia(ctx, n);
      return;
    }

    const s = getComputedStyle(n);
    const opacity = parseFloat(s.opacity || "1");
    if (opacity < 0.05) return;
    const stroke = rgb(s.stroke);
    const fill = rgb(s.fill);
    if (!stroke && !fill) return;

    const flat = flatten(ctx, n);
    if (!flat) return;
    const pts = simplify(flat.pts);
    if (pts.length < 2) return;

    const m = n.getScreenCTM();
    const scale = m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1 : 1;
    const swMm = (parseFloat(s.strokeWidth) || 0) * scale * k;

    if (fill) pdf.setFillColor(fill[0], fill[1], fill[2]);
    if (stroke) {
      pdf.setDrawColor(stroke[0], stroke[1], stroke[2]);
      pdf.setLineWidth(Math.max(0.05, swMm));
      const dash = (s.strokeDasharray || "none").trim();
      if (dash && dash !== "none") {
        const arr = dash.split(/[,\s]+/).map((v) => parseFloat(v) * scale * k).filter((v) => v > 0);
        if (arr.length) pdf.setLineDashPattern(arr, 0);
      } else {
        pdf.setLineDashPattern([], 0);
      }
      pdf.setLineJoin?.("round");
      pdf.setLineCap?.(s.strokeLinecap === "butt" ? "butt" : "round");
    }

    const style = fill && stroke && swMm > 0 ? "FD" : fill ? "F" : "S";
    polyline(ctx, pts, style, flat.closed || style !== "S");
    pdf.setLineDashPattern([], 0);
  });
}

/**
 * Pinta `root` no `pdf` como conteúdo vetorial.
 * @param sheetEl elemento da folha (define a origem e a escala px->mm)
 * @param pdfWidthMm largura da página do PDF em mm
 */
export function drawElementVector(pdf: Pdf, root: HTMLElement, sheetEl: HTMLElement, pdfWidthMm: number) {
  const sheetRect = sheetEl.getBoundingClientRect();
  if (sheetRect.width <= 0) return;
  const ctx: Ctx = { pdf, k: pdfWidthMm / sheetRect.width, ox: sheetRect.left, oy: sheetRect.top };

  const walk = (el: Element, boxes: Element[], texts: Element[], media: Element[], svgs: Element[]) => {
    if (isHidden(el)) return;
    if (el.hasAttribute("data-vec-skip")) return;
    if (el instanceof SVGSVGElement) {
      svgs.push(el);
      return;
    }
    if (el instanceof HTMLImageElement || el instanceof HTMLCanvasElement) {
      media.push(el);
      return;
    }
    boxes.push(el);
    if (Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue || "").trim())) {
      texts.push(el);
    }
    Array.from(el.children).forEach((c) => walk(c, boxes, texts, media, svgs));
  };

  const boxes: Element[] = [];
  const texts: Element[] = [];
  const media: Element[] = [];
  const svgs: Element[] = [];
  walk(root, boxes, texts, media, svgs);

  // recorta ao retângulo do bloco (viewports têm overflow hidden)
  const rr = root.getBoundingClientRect();
  let clipped = false;
  if (typeof pdf.saveGraphicsState === "function" && typeof pdf.clip === "function") {
    pdf.saveGraphicsState();
    // `null` como estilo constrói o caminho SEM pintar; pintar consome o path e
    // o clip() seguinte não recortaria nada (era por isso que a malha vazava).
    pdf.rect(
      (rr.left - ctx.ox) * ctx.k,
      (rr.top - ctx.oy) * ctx.k,
      rr.width * ctx.k,
      rr.height * ctx.k,
      null
    );
    pdf.clip();
    pdf.discardPath?.();
    clipped = true;
  }

  boxes.forEach((el) => paintBox(ctx, el));
  media.forEach((el) => paintMedia(ctx, el));
  svgs.forEach((el) => paintSvg(ctx, el as SVGSVGElement));
  texts.forEach((el) => paintText(ctx, el));

  if (clipped) pdf.restoreGraphicsState();
  // A moldura fica FORA do recorte: desenhada sobre a borda, metade do traço
  // cairia fora do clip e a linha saía pela metade (ou invisível).
  paintBox(ctx, root, true);
  pdf.setCharSpace(0);
  pdf.setLineWidth(0.2);
  pdf.setLineDashPattern?.([], 0);
}
