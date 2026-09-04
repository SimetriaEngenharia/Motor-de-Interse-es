export interface HorizontalElementRow {
  num: string; // e.g. "T-1", "C-1", "E-1"
  type: "Tangente" | "Curva Circular" | "Espiral";
  deflexaoAzimute: string;
  lc?: number;
  tc?: number;
  tt?: number;
  tl?: number;
  raio?: number;
  dl: number;
  ac: string;
  staStart: number;
  staEnd: number;
  staPI?: number;
  coordStart: { x: number; y: number };
  coordEnd: { x: number; y: number };
  /** Coordenada do PI da curva (coluna PI da tabela DER). */
  coordPI?: { x: number; y: number };
}

export interface CurveRow {
  piName: string;
  nortePI: number;
  estePI: number;
  azEntradaDeg: number;
  azSaidaDeg: number;
  deltaDeg: number;
  sentido: "D" | "E";
  raio: number;
  ls: number;
  tangente: number;
  desenvolvimento: number;
  staPI: number;
  isCircular: boolean;
  staTS_PC: number;
  staSC?: number;
  staCS?: number;
  staST_PT: number;
}

/**
 * Formats station in Brazilian highway standard: 20m stations (Estaca + Fração)
 * Example: 254.56m => "12 + 14,560"
 */
export function formatEstaca(staMeters: number): string {
  if (isNaN(staMeters) || staMeters === undefined) return "-";
  const estaca = Math.floor(staMeters / 20);
  const fracao = staMeters % 20;
  const fracaoStr = fracao.toFixed(3).replace('.', ',').padStart(6, '0');
  return `${estaca} + ${fracaoStr}`;
}

/**
 * Formats decimal degree into Degrees, Minutes, Seconds (GG°MM'SS")
 */
export function formatDMS(deg: number): string {
  if (isNaN(deg) || deg === undefined) return "00°00'00\"";
  const absVal = Math.abs(deg);
  let d = Math.floor(absVal);
  let mFloat = (absVal - d) * 60;
  let m = Math.floor(mFloat);
  let s = Math.round((mFloat - m) * 60);
  if (s >= 60) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }
  return `${d}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`;
}

/**
 * Formats linear dimension with 3 decimal places (Brazilian Portuguese comma)
 */
export function formatDecimal3(num: number): string {
  if (isNaN(num) || num === undefined) return "0,000";
  return num.toFixed(3).replace('.', ',');
}

/**
 * Formats coordinate value with thousands separators and 3 decimal places
 */
export function formatCoord(num: number): string {
  if (isNaN(num) || num === undefined) return "0,000";
  const parts = num.toFixed(3).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${integerPart},${parts[1]}`;
}

/**
 * Default sample curve dataset conforming strictly to DNIT standards
 */
export const defaultDNITCurves: CurveRow[] = [
  {
    piName: "PI-01",
    nortePI: 7452120.450,
    estePI: 320145.200,
    azEntradaDeg: 45.202778, // 45°12'10"
    azSaidaDeg: 82.758333,  // 82°45'30"
    deltaDeg: 37.555556,   // 37°33'20"
    sentido: "D",
    raio: 350.000,
    ls: 0.000,
    tangente: 119.012,
    desenvolvimento: 229.410,
    staPI: 912.000, // 45 + 12,000
    isCircular: true,
    staTS_PC: 792.988, // 39 + 12,988
    staST_PT: 1022.398 // 51 + 02,398
  },
  {
    piName: "PI-02",
    nortePI: 7452890.120,
    estePI: 320850.780,
    azEntradaDeg: 82.758333,  // 82°45'30"
    azSaidaDeg: 138.179167,  // 138°10'45"
    deltaDeg: 55.420833,    // 55°25'15"
    sentido: "D",
    raio: 250.000,
    ls: 60.000,
    tangente: 163.485,
    desenvolvimento: 301.822,
    staPI: 1765.000, // 88 + 05,000
    isCircular: false,
    staTS_PC: 1601.515, // TS: 80 + 01,515
    staSC: 1661.515,    // SC: 83 + 01,515
    staCS: 1843.337,    // CS: 92 + 03,337
    staST_PT: 1903.337  // ST: 95 + 03,337
  },
  {
    piName: "PI-03",
    nortePI: 7453210.000,
    estePI: 321410.500,
    azEntradaDeg: 138.179167, // 138°10'45"
    azSaidaDeg: 92.087500,   // 92°05'15"
    deltaDeg: 46.091667,    // 46°05'30"
    sentido: "E",
    raio: 400.000,
    ls: 0.000,
    tangente: 170.185,
    desenvolvimento: 321.775,
    staPI: 2510.000, // 125 + 10,000
    isCircular: true,
    staTS_PC: 2339.815, // PC: 116 + 19,815
    staST_PT: 2661.590  // PT: 133 + 01,590
  }
];

/**
 * Calculates curve elements from an alignment point array
 */
export function computeCurvesFromPoints(inputPoints: any[]): CurveRow[] {
  // Sem eixo (ou eixo sem PIs) => sem curvas. Nunca devolver dados de exemplo:
  // uma tabela preenchida sem alinhamento no projeto é informação falsa.
  if (!inputPoints || inputPoints.length < 3) return [];

  // Filter for structural PIs if passed keyPoints or mixed array
  let piPoints = inputPoints.filter((p) => p && (p.pi || p.label === "PI" || p.label === "PP" || p.label === "PF" || p.label === "INICIO" || p.label === "FIM"));
  if (piPoints.length < 3) {
    piPoints = inputPoints.filter((p) => p && (p.pi || p.radius > 0 || p.label));
  }
  const points = piPoints.length >= 3 ? piPoints : inputPoints;

  const rows: CurveRow[] = [];
  let piCounter = 1;

  let prevPTSta = (points[0]?.sta !== undefined && points[0].sta >= 0) ? points[0].sta : 0;
  let prevT = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const ptPrev = points[i - 1];
    const ptPI = points[i];
    const ptNext = points[i + 1];

    // Compute vectors
    const dx1 = ptPI.x - ptPrev.x;
    const dy1 = ptPI.y - ptPrev.y;
    const dx2 = ptNext.x - ptPI.x;
    const dy2 = ptNext.y - ptPI.y;

    const leg1 = Math.hypot(dx1, dy1);
    const leg2 = Math.hypot(dx2, dy2);

    let az1 = (Math.atan2(dx1, dy1) * 180 / Math.PI + 360) % 360;
    let az2 = (Math.atan2(dx2, dy2) * 180 / Math.PI + 360) % 360;

    let diff = az2 - az1;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;

    const deltaDeg = Math.abs(diff);
    if (deltaDeg < 0.01) continue; // Ignore straight line vertices

    const sentido: "D" | "E" = diff >= 0 ? "D" : "E";

    // 1. Extract radius robustly
    let raio = ptPI.radius || ptPI.r || ptPI.R;
    if (!raio || raio <= 0) {
      // Search in inputPoints for adjacent keyPoints with radius
      const idxInAll = inputPoints.indexOf(ptPI);
      if (idxInAll >= 0) {
        for (let k = Math.max(0, idxInAll - 3); k <= Math.min(inputPoints.length - 1, idxInAll + 3); k++) {
          const kp = inputPoints[k];
          if (kp && (kp.radius > 0 || kp.r > 0 || kp.R > 0)) {
            raio = kp.radius || kp.r || kp.R;
            break;
          }
        }
      }
    }
    if (!raio || raio <= 0) {
      // Global search in inputPoints for nearest point with radius
      const found = inputPoints.find((p) => p && (p.radius > 0 || p.r > 0) && Math.hypot((p.x ?? 0) - ptPI.x, (p.y ?? 0) - ptPI.y) < 1000);
      if (found) raio = found.radius || found.r;
    }
    if (!raio || raio <= 0) {
      // Default to reasonable radius based on leg lengths
      raio = Math.max(20, Math.min(300, Math.min(leg1, leg2) * 0.4));
    }

    // 2. Extract spiral transition
    let ls = ptPI.spiralIn || ptPI.spiralOut || ptPI.ls || 0.000;
    if (!ls || ls <= 0) {
      const idxInAll = inputPoints.indexOf(ptPI);
      if (idxInAll >= 0) {
        for (let k = Math.max(0, idxInAll - 3); k <= Math.min(inputPoints.length - 1, idxInAll + 3); k++) {
          const kp = inputPoints[k];
          if (kp && (kp.spiralIn || kp.spiralOut || kp.ls)) {
            ls = kp.spiralIn || kp.spiralOut || kp.ls || 0;
            break;
          }
        }
      }
    }

    const isCircular = ls <= 0.001;
    const deltaRad = (deltaDeg * Math.PI) / 180;

    let tangente = 0;
    let desenvolvimento = 0;

    if (isCircular) {
      tangente = raio * Math.tan(deltaRad / 2);
      desenvolvimento = raio * deltaRad;
    } else {
      const thetaS = ls / (2 * raio);
      const p = (ls * ls) / (24 * raio) - Math.pow(ls, 4) / (2688 * Math.pow(raio, 3));
      const k = ls / 2 - Math.pow(ls, 3) / (240 * raio * raio);
      tangente = k + (raio + p) * Math.tan(deltaRad / 2);
      const deltaC = deltaRad - 2 * thetaS;
      const devC = Math.max(0, raio * deltaC);
      desenvolvimento = devC + 2 * ls;
    }

    // 3. Compute continuous stationing along alignment
    let staPI = 0;
    let staTS_PC = 0;
    let staSC: number | undefined = undefined;
    let staCS: number | undefined = undefined;
    let staST_PT = 0;

    if (i === 1) {
      const startSta = (points[0]?.sta !== undefined && points[0].sta >= 0) ? points[0].sta : 0;
      staPI = startSta + leg1;
    } else {
      staPI = prevPTSta + (leg1 - prevT);
    }

    staTS_PC = staPI - tangente;

    if (isCircular) {
      staST_PT = staTS_PC + desenvolvimento;
    } else {
      const thetaS = ls / (2 * raio);
      const deltaC = deltaRad - 2 * thetaS;
      const devC = Math.max(0, raio * deltaC);
      staSC = staTS_PC + ls;
      staCS = staSC + devC;
      staST_PT = staCS + ls;
    }

    prevPTSta = staST_PT;
    prevT = tangente;

    const piName = `PI-${String(piCounter).padStart(2, '0')}`;
    piCounter++;

    rows.push({
      piName,
      nortePI: ptPI.y,
      estePI: ptPI.x,
      azEntradaDeg: az1,
      azSaidaDeg: az2,
      deltaDeg,
      sentido,
      raio,
      ls: isCircular ? 0 : ls,
      tangente,
      desenvolvimento,
      staPI,
      isCircular,
      staTS_PC,
      staSC,
      staCS,
      staST_PT
    });
  }

  return rows;
}

/**
 * Generates a clean and organized Markdown table strictly following DNIT standards
 */
export function generateMarkdownTableDNIT(rows: CurveRow[]): string {
  const header = "| Vértice (PI) | Coordenadas PI (Norte, Este) | Azimutes (Entrada / Saída) | Ângulo Central (Δ) e Sentido | Raio (R) [m] | Transição (Ls) [m] | Tangente (T) [m] | Desenvolvimento (D) [m] | Estaqueamento |";
  const separator = "| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |";

  const lines = rows.map((r) => {
    const coordsStr = `N: ${formatCoord(r.nortePI)}<br>E: ${formatCoord(r.estePI)}`;
    const azStr = `Ent: ${formatDMS(r.azEntradaDeg)}<br>Saí: ${formatDMS(r.azSaidaDeg)}`;
    const deltaStr = `${formatDMS(r.deltaDeg)} ${r.sentido}`;
    const raioStr = formatDecimal3(r.raio);
    const lsStr = r.isCircular || r.ls === 0 ? "0,000" : formatDecimal3(r.ls);
    const tStr = formatDecimal3(r.tangente);
    const dStr = formatDecimal3(r.desenvolvimento);

    let staStr = "";
    if (r.isCircular) {
      staStr = `**PI:** ${formatEstaca(r.staPI)}<br>**PC:** ${formatEstaca(r.staTS_PC)}<br>**PT:** ${formatEstaca(r.staST_PT)}`;
    } else {
      staStr = `**PI:** ${formatEstaca(r.staPI)}<br>**TS:** ${formatEstaca(r.staTS_PC)}<br>**SC:** ${formatEstaca(r.staSC ?? 0)}<br>**CS:** ${formatEstaca(r.staCS ?? 0)}<br>**ST:** ${formatEstaca(r.staST_PT)}`;
    }

    return `| **${r.piName}** | ${coordsStr} | ${azStr} | ${deltaStr} | ${raioStr} | ${lsStr} | ${tStr} | ${dStr} | ${staStr} |`;
  });

  return [
    "### QUADRO DE ELEMENTOS DAS CURVAS HORIZONTAIS (NORMA DNIT)",
    "",
    header,
    separator,
    ...lines
  ].join("\n");
}

/**
 * Helper to get coordinate (x, y) at a given station
 */
export function getCoordAtStation(points: any[], sta: number): { x: number; y: number } {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (sta <= points[0].sta) return { x: points[0].x ?? 0, y: points[0].y ?? 0 };
  if (sta >= points[points.length - 1].sta) {
    const last = points[points.length - 1];
    return { x: last.x ?? 0, y: last.y ?? 0 };
  }
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (p1.sta !== undefined && p2.sta !== undefined && sta >= p1.sta && sta <= p2.sta) {
      const denom = p2.sta - p1.sta;
      const t = denom > 1e-6 ? (sta - p1.sta) / denom : 0;
      return {
        x: (p1.x ?? 0) + t * ((p2.x ?? 0) - (p1.x ?? 0)),
        y: (p1.y ?? 0) + t * ((p2.y ?? 0) - (p1.y ?? 0))
      };
    }
  }
  return { x: points[0].x ?? 0, y: points[0].y ?? 0 };
}

/**
 * Computes individual alignment horizontal elements (Tangente, Curva Circular, Espiral)
 * ordered strictly by starting station.
 */
export function computeHorizontalElements(inputPoints: any[]): HorizontalElementRow[] {
  const curveRows = computeCurvesFromPoints(inputPoints);
  const rawElements: Omit<HorizontalElementRow, "num">[] = [];

  let currentSta = 0;

  for (let i = 0; i < curveRows.length; i++) {
    const crv = curveRows[i];

    // Tangent before curve
    const tanStartSta = currentSta;
    const tanEndSta = crv.staTS_PC;
    if (tanEndSta > tanStartSta + 0.001) {
      const dl = tanEndSta - tanStartSta;
      rawElements.push({
        type: "Tangente",
        deflexaoAzimute: formatDMS(crv.azEntradaDeg), // Apenas Azimute
        dl,
        ac: "-",
        staStart: tanStartSta,
        staEnd: tanEndSta,
        coordStart: getCoordAtStation(inputPoints, tanStartSta),
        coordEnd: getCoordAtStation(inputPoints, tanEndSta)
      });
    }

    if (crv.isCircular || crv.ls <= 0.001) {
      // Simple Circular Curve
      const dl = crv.desenvolvimento;
      rawElements.push({
        type: "Curva Circular",
        deflexaoAzimute: `${formatDMS(crv.deltaDeg)} ${crv.sentido}`,
        tt: crv.tangente,
        raio: crv.raio,
        dl,
        ac: formatDMS(crv.deltaDeg),
        staStart: crv.staTS_PC,
        staEnd: crv.staST_PT,
        staPI: crv.staPI,
        coordPI: { x: crv.estePI, y: crv.nortePI },
        coordStart: getCoordAtStation(inputPoints, crv.staTS_PC),
        coordEnd: getCoordAtStation(inputPoints, crv.staST_PT)
      });
      currentSta = crv.staST_PT;
    } else {
      // Transition Spiral Curve
      const thetaSRad = crv.ls / (2 * crv.raio);
      const thetaS = thetaSRad * (180 / Math.PI);
      const deltaC = Math.max(0, crv.deltaDeg - 2 * thetaS);
      const lcC = (crv.raio * deltaC * Math.PI) / 180;

      // Spiral tangents calculation
      const Xs = crv.ls * (1 - Math.pow(thetaSRad, 2) / 10 + Math.pow(thetaSRad, 4) / 216);
      const Ys = crv.ls * (thetaSRad / 3 - Math.pow(thetaSRad, 3) / 42 + Math.pow(thetaSRad, 5) / 1320);
      const sinT = Math.sin(thetaSRad);
      const tanT = Math.tan(thetaSRad);
      const tcVal = sinT > 1e-6 ? Ys / sinT : crv.ls / 3;
      const lcVal = tanT > 1e-6 ? Xs - Ys / tanT : (2 * crv.ls) / 3;

      const staTS = crv.staTS_PC;
      const staSC = crv.staSC ?? staTS + crv.ls;
      const staCS = crv.staCS ?? staSC + lcC;
      const staST = crv.staST_PT;

      // 1. Espiral de Entrada (TS -> SC)
      rawElements.push({
        type: "Espiral",
        deflexaoAzimute: `${formatDMS(thetaS)} ${crv.sentido}`,
        lc: lcVal,
        tc: tcVal,
        tl: crv.ls,
        dl: crv.ls,
        ac: formatDMS(thetaS),
        staStart: staTS,
        staEnd: staSC,
        staPI: crv.staPI,
        coordPI: { x: crv.estePI, y: crv.nortePI },
        coordStart: getCoordAtStation(inputPoints, staTS),
        coordEnd: getCoordAtStation(inputPoints, staSC)
      });

      // 2. Curva Circular Trecho Central (SC -> CS)
      if (staCS > staSC + 0.001) {
        rawElements.push({
          type: "Curva Circular",
          deflexaoAzimute: `${formatDMS(deltaC)} ${crv.sentido}`,
          tt: crv.tangente,
          raio: crv.raio,
          dl: lcC,
          ac: formatDMS(deltaC),
          staStart: staSC,
          staEnd: staCS,
          staPI: crv.staPI,
        coordPI: { x: crv.estePI, y: crv.nortePI },
          coordStart: getCoordAtStation(inputPoints, staSC),
          coordEnd: getCoordAtStation(inputPoints, staCS)
        });
      }

      // 3. Espiral de Saída (CS -> ST)
      rawElements.push({
        type: "Espiral",
        deflexaoAzimute: `${formatDMS(thetaS)} ${crv.sentido}`,
        lc: lcVal,
        tc: tcVal,
        tl: crv.ls,
        dl: crv.ls,
        ac: formatDMS(thetaS),
        staStart: staCS,
        staEnd: staST,
        staPI: crv.staPI,
        coordPI: { x: crv.estePI, y: crv.nortePI },
        coordStart: getCoordAtStation(inputPoints, staCS),
        coordEnd: getCoordAtStation(inputPoints, staST)
      });

      currentSta = staST;
    }
  }

  // Final Tangent after last curve
  const lastCurve = curveRows[curveRows.length - 1];
  const maxSta = inputPoints && inputPoints.length > 0 ? Math.max(...inputPoints.map((p) => p.sta ?? 0)) : currentSta + 500;
  if (lastCurve && maxSta > currentSta + 0.001) {
    const dl = maxSta - currentSta;
    rawElements.push({
      type: "Tangente",
      deflexaoAzimute: formatDMS(lastCurve.azSaidaDeg), // Apenas Azimute
      dl,
      ac: "-",
      staStart: currentSta,
      staEnd: maxSta,
      coordStart: getCoordAtStation(inputPoints, currentSta),
      coordEnd: getCoordAtStation(inputPoints, maxSta)
    });
  }

  // Sort strictly by starting station
  rawElements.sort((a, b) => a.staStart - b.staStart);

  let countT = 0;
  let countC = 0;
  let countE = 0;

  return rawElements.map((elem) => {
    let numStr = "";
    if (elem.type === "Tangente") {
      countT++;
      numStr = `T-${countT}`;
    } else if (elem.type === "Curva Circular") {
      countC++;
      numStr = `C-${countC}`;
    } else if (elem.type === "Espiral") {
      countE++;
      numStr = `E-${countE}`;
    }
    return {
      ...elem,
      num: numStr
    };
  });
}

/**
 * Filters horizontal elements to only those overlapping a given station range (sheet/folha).
 */
export function filterHorizontalElementsForStationRange(
  rows: HorizontalElementRow[],
  startStation?: number,
  endStation?: number
): HorizontalElementRow[] {
  if (startStation === undefined || endStation === undefined) return rows;
  if (endStation <= startStation) return rows;

  return rows.filter((r) => r.staEnd >= startStation - 0.001 && r.staStart <= endStation + 0.001);
}

/**
 * Generates only the table lines (header, separator, and data rows) without the top title
 */
export function generateHorizontalElementsTableLines(rows: HorizontalElementRow[]): string {
  // Ordem das colunas conforme padrão DER-SP
  const header = "| Nº | DEFLEXÃO/AZIMUTE | LC (m) | TT (m) | TL (m) | TC (m) | R (m) | D/L (m) | AC | TE-PC | ET-PT | PONTO | PI | TE-PC | ET-PT |";
  const separator = "| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |";

  const lines = rows.map((r) => {
    const lcStr = r.type === "Espiral" && r.lc !== undefined ? formatDecimal3(r.lc) : "-";
    const tcStr = r.type === "Espiral" && r.tc !== undefined ? formatDecimal3(r.tc) : "-";
    const ttStr = r.type === "Curva Circular" && r.tt !== undefined ? formatDecimal3(r.tt) : "-";
    const tlStr = r.type === "Espiral" && r.tl !== undefined ? formatDecimal3(r.tl) : "-";
    const raioStr = r.type === "Curva Circular" && r.raio !== undefined ? formatDecimal3(r.raio) : "-";
    const dlStr = formatDecimal3(r.dl);
    const acStr = r.ac || "-";
    const staTE_PC = formatEstaca(r.staStart);
    const staET_PT = formatEstaca(r.staEnd);
    const staPIStr = r.staPI !== undefined ? formatEstaca(r.staPI) : "-";
    const fmtXY = (v: number) => (!isFinite(v) ? "-" : v.toFixed(4).replace(".", ","));
    const cPI = r.coordPI || r.coordStart;
    const coordPI = `${fmtXY(cPI.y)}<br>${fmtXY(cPI.x)}`;
    const coordTE_PC = `${fmtXY(r.coordStart.y)}<br>${fmtXY(r.coordStart.x)}`;
    const coordET_PT = `${fmtXY(r.coordEnd.y)}<br>${fmtXY(r.coordEnd.x)}`;

    return `| ${r.num} | ${r.deflexaoAzimute} | ${lcStr} | ${ttStr} | ${tlStr} | ${tcStr} | ${raioStr} | ${dlStr} | ${acStr} | ${staTE_PC} | ${staET_PT} | Y<br>X | ${coordPI} | ${coordTE_PC} | ${coordET_PT} |`;
  });

  return [header, separator, ...lines].join("\n");
}

/**
 * Parses markdown table text into headers and rows of cells
 */
export function parseMarkdownTableLines(text: string): { headers: string[]; rows: string[][] } {
  if (!text || !text.trim()) {
    return { headers: [], rows: [] };
  }
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const tableLines = lines.filter(l => l.startsWith("|") && l.endsWith("|"));
  
  if (tableLines.length === 0) {
    const allRows = lines.map(l => l.split(/\t|\|/).map(c => c.trim()).filter(Boolean));
    if (allRows.length > 0) {
      return {
        headers: allRows[0],
        rows: allRows.slice(1)
      };
    }
    return { headers: [], rows: [] };
  }

  const nonSeparatorLines = tableLines.filter(l => !/^\|(\s*:?-+:?\s*\|)+$/.test(l));
  if (nonSeparatorLines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map(c => c.trim());
  };

  const headers = parseRow(nonSeparatorLines[0]);
  const rows = nonSeparatorLines.slice(1).map(parseRow);

  return { headers, rows };
}

/**
 * Serializes headers and rows into markdown table lines
 */
export function serializeToMarkdownTable(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const sepLine = `| ${headers.map(() => ":---:").join(" | ")} |`;
  const rowLines = rows.map(r => `| ${r.join(" | ")} |`);
  return [headerLine, sepLine, ...rowLines].join("\n");
}

/**
 * Markdown exporter for horizontal elements table
 */
export function generateMarkdownHorizontalElementsTable(
  rows: HorizontalElementRow[], 
  alignmentName: string = "EIXO 1",
  customTitle?: string,
  customLines?: string
): string {
  const title = customTitle || `TABELA DE ALINHAMENTO HORIZONTAL – ${alignmentName.toUpperCase()}`;
  const lines = customLines && customLines.trim() ? customLines.trim() : generateHorizontalElementsTableLines(rows);

  return [
    `### ${title}`,
    "",
    lines
  ].join("\n");
}

