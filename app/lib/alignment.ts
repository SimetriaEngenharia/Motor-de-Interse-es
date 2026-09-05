import { AlignmentData } from "../superelevation/types";
import { parseLandXML } from "../superelevation/utils/landXmlParser";

export interface AlignmentPoint {
  id?: string;
  sta: number;
  x: number;
  y: number;
  label?: string;
  pi?: boolean;
  radius?: number; // Curve radius for PIs
  rot?: "cw" | "ccw";
  spiralIn?: number;
  spiralOut?: number;
}

export interface ProfilePoint {
  sta: number;
  elev: number;
  label?: string;
  l?: number;
  k?: number;
}

export function rebuildProfileFromPIVs(
  pivs: { sta: number; elev: number; l?: number; k?: number }[]
) {
  const profilePoints: ProfilePoint[] = [];
  const keyProfilePoints: ProfilePoint[] = [];

  if (pivs.length === 0) return { profilePoints, keyProfilePoints };
  if (pivs.length === 1) {
    profilePoints.push({ sta: pivs[0].sta, elev: pivs[0].elev });
    keyProfilePoints.push({ sta: pivs[0].sta, elev: pivs[0].elev, label: "PVI" });
    return { profilePoints, keyProfilePoints };
  }

  for (let i = 0; i < pivs.length; i++) {
    const pt = pivs[i];
    
    if (i === 0 || i === pivs.length - 1) {
      profilePoints.push({ sta: pt.sta, elev: pt.elev });
      keyProfilePoints.push({
        sta: pt.sta,
        elev: pt.elev,
        label: i === 0 ? "PP" : "PF",
      });
      continue;
    }

    const prevPt = pivs[i - 1];
    const nextPt = pivs[i + 1];

    const g1 = (pt.elev - prevPt.elev) / (pt.sta - prevPt.sta);
    const g2 = (nextPt.elev - pt.elev) / (nextPt.sta - pt.sta);

    let L = pt.l || 0;
    let K = pt.k || 0;

    if (!L && K > 0) {
      L = K * Math.abs(g2 - g1) * 100;
    } else if (L > 0) {
      K = Math.abs(g2 - g1) > 0.0001 ? Math.abs(L / ((g2 - g1) * 100)) : 0;
    }

    if (L <= 0) {
      profilePoints.push({ sta: pt.sta, elev: pt.elev });
      keyProfilePoints.push({
        sta: pt.sta,
        elev: pt.elev,
        label: "PIV",
      });
    } else {
      const L_2 = L / 2;

      const pvcSta = pt.sta - L_2;
      const pvcElev = pt.elev - g1 * L_2;
      profilePoints.push({ sta: pvcSta, elev: pvcElev });
      keyProfilePoints.push({ sta: pvcSta, elev: pvcElev, label: "PCV" });
      keyProfilePoints.push({
        sta: pt.sta,
        elev: pt.elev,
        label: "PIV",
        l: L,
        k: K,
      });

      const steps = Math.max(10, Math.floor(L / 5)); // 5m res
      for (let j = 1; j < steps; j++) {
        const X = (L * j) / steps;
        const sta = pvcSta + X;
        const elev = pvcElev + g1 * X + ((g2 - g1) * X * X) / (2 * L);
        profilePoints.push({ sta, elev });
      }

      const pvtSta = pt.sta + L_2;
      const pvtElev = pt.elev + g2 * L_2;
      profilePoints.push({ sta: pvtSta, elev: pvtElev });
      keyProfilePoints.push({ sta: pvtSta, elev: pvtElev, label: "PTV" });
    }
  }

  profilePoints.sort((a, b) => a.sta - b.sta);
  const uniqueProfilePoints: ProfilePoint[] = [];
  for (let i = 0; i < profilePoints.length; i++) {
    if (
      i === 0 ||
      Math.abs(profilePoints[i].sta - uniqueProfilePoints[uniqueProfilePoints.length - 1].sta) > 0.001
    ) {
      uniqueProfilePoints.push(profilePoints[i]);
    }
  }

  keyProfilePoints.sort((a, b) => a.sta - b.sta);

  return { profilePoints: uniqueProfilePoints, keyProfilePoints };
}

export function rebuildFromPIs(
  inputPIs: { x: number; y: number; radius?: number; spiralIn?: number; spiralOut?: number }[],
  startStation: number = 0,
) {
  const points: AlignmentPoint[] = [];
  const keyPoints: AlignmentPoint[] = [];
  
  // Clone to avoid mutation
  const pis = inputPIs.map((p) => ({ ...p }));
  
  if (pis.length === 0) return { points, keyPoints, length: 0 };
  if (pis.length === 1) {
    keyPoints.push({
      id: "pi-0",
      sta: startStation,
      x: pis[0].x,
      y: pis[0].y,
      label: "PP",
      pi: true,
      radius: pis[0].radius,
    });
    points.push({ sta: startStation, x: pis[0].x, y: pis[0].y });
    return { points, keyPoints, length: startStation };
  }

  const angles: number[] = new Array(pis.length).fill(0);
  const crosses: number[] = new Array(pis.length).fill(0);
  
  const idealTansIn: number[] = new Array(pis.length).fill(0);
  const idealTansOut: number[] = new Array(pis.length).fill(0);

  // Compute angles and ideal tangents
  for (let i = 1; i < pis.length - 1; i++) {
    const prevPI = pis[i - 1];
    const pi = pis[i];
    const nextPI = pis[i + 1];

    if (pi.radius && pi.radius > 0) {
      const dx1 = prevPI.x - pi.x;
      const dy1 = prevPI.y - pi.y;
      const dx2 = nextPI.x - pi.x;
      const dy2 = nextPI.y - pi.y;

      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      if (len1 > 0 && len2 > 0) {
        const dot = (dx1 / len1) * (dx2 / len2) + (dy1 / len1) * (dy2 / len2);
        const cross = (dx1 / len1) * (dy2 / len2) - (dy1 / len1) * (dx2 / len2);
        let angle = Math.acos(Math.max(-1, Math.min(1, dot))); // Interior angle

        if (angle > 0.001 && angle < Math.PI - 0.001) {
          angles[i] = angle;
          crosses[i] = cross;
          
          let deflectionAbs = Math.PI - angle;
          let R = pi.radius;
          let lsIn = pi.spiralIn || 0;
          let lsOut = pi.spiralOut || 0;
          
          let p1 = 0, k1 = 0, p2 = 0, k2 = 0;
          if (lsIn > 0) {
            p1 = (lsIn * lsIn) / (24 * R) - Math.pow(lsIn, 4) / (2688 * Math.pow(R, 3));
            k1 = lsIn / 2 - Math.pow(lsIn, 3) / (240 * Math.pow(R, 2));
          }
          if (lsOut > 0) {
            p2 = (lsOut * lsOut) / (24 * R) - Math.pow(lsOut, 4) / (2688 * Math.pow(R, 3));
            k2 = lsOut / 2 - Math.pow(lsOut, 3) / (240 * Math.pow(R, 2));
          }
          
          idealTansIn[i] = k1 + (R + p2 - (R + p1) * Math.cos(deflectionAbs)) / Math.sin(deflectionAbs);
          idealTansOut[i] = k2 + (R + p1 - (R + p2) * Math.cos(deflectionAbs)) / Math.sin(deflectionAbs);
        }
      }
    }
  }

  // Resolve overlaps proportionally
  
  const piScales = new Array(pis.length).fill(1.0);
  for (let i = 0; i < pis.length - 1; i++) {
    const L = Math.sqrt(Math.pow(pis[i].x - pis[i + 1].x, 2) + Math.pow(pis[i].y - pis[i + 1].y, 2));
    const tA = idealTansOut[i];
    const tB = idealTansIn[i + 1];
    const sumTans = tA + tB;
    if (sumTans > L * 0.99 && sumTans > 0) {
      const scale = (L * 0.99) / sumTans;
      piScales[i] = Math.min(piScales[i], scale);
      piScales[i + 1] = Math.min(piScales[i + 1], scale);
    }
  }
  
  const actualTansIn = new Array(pis.length).fill(0);
  const actualTansOut = new Array(pis.length).fill(0);
  for (let i = 0; i < pis.length; i++) {
     actualTansIn[i] = idealTansIn[i] * piScales[i];
     actualTansOut[i] = idealTansOut[i] * piScales[i];
  }
  
  let currentSta = startStation;

  keyPoints.push({
    id: "pi-0",
    sta: startStation,
    x: pis[0].x,
    y: pis[0].y,
    label: "PP",
    pi: true,
    radius: pis[0].radius,
  });

  points.push({ sta: startStation, x: pis[0].x, y: pis[0].y });

  let lastPoint = { x: pis[0].x, y: pis[0].y };

  for (let i = 1; i < pis.length - 1; i++) {
    const prevPI = pis[i - 1];
    const pi = pis[i];
    const nextPI = pis[i + 1];

    let hasCurve = false;

    if (nextPI && pi.radius && pi.radius > 0) {
      const dx1 = prevPI.x - pi.x;
      const dy1 = prevPI.y - pi.y;
      const dx2 = nextPI.x - pi.x;
      const dy2 = nextPI.y - pi.y;

      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      if (len1 > 0 && len2 > 0) {
        const nx1 = dx1 / len1;
        const ny1 = dy1 / len1;
        const nx2 = dx2 / len2;
        const ny2 = dy2 / len2;

        const angle = angles[i];
        if (angle > 0.001 && angle < Math.PI - 0.001) {
          hasCurve = true;

          const tIn = actualTansIn[i];
          const tOut = actualTansOut[i];
          const scale = piScales[i];
          let lsIn = (pi.spiralIn || 0) * scale;
          let lsOut = (pi.spiralOut || 0) * scale;
          
          let deflectionAbs = Math.PI - angle;
          let cross = crosses[i];
          let sign = cross < 0 ? 1 : -1; // +1 left, -1 right
          
          let actualRadius = pi.radius * scale;
          
          let p1 = 0, k1 = 0, p2 = 0, k2 = 0;
          if (lsIn > 0) {
            p1 = (lsIn * lsIn) / (24 * actualRadius) - Math.pow(lsIn, 4) / (2688 * Math.pow(actualRadius, 3));
            k1 = lsIn / 2 - Math.pow(lsIn, 3) / (240 * Math.pow(actualRadius, 2));
          }
          if (lsOut > 0) {
            p2 = (lsOut * lsOut) / (24 * actualRadius) - Math.pow(lsOut, 4) / (2688 * Math.pow(actualRadius, 3));
            k2 = lsOut / 2 - Math.pow(lsOut, 3) / (240 * Math.pow(actualRadius, 2));
          }
          
          let curveStart = { x: pi.x + nx1 * tIn, y: pi.y + ny1 * tIn }; // TS or PC
          let curveEnd = { x: pi.x + nx2 * tOut, y: pi.y + ny2 * tOut }; // ST or PT

          const lineDx = curveStart.x - lastPoint.x;
          const lineDy = curveStart.y - lastPoint.y;
          const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);
          if (lineLen > 0) {
            const samples = Math.max(2, Math.floor(lineLen / 2));
            for (let j = 0; j < samples; j++) {
              const t = j / samples;
              points.push({
                sta: currentSta + lineLen * t,
                x: lastPoint.x + lineDx * t,
                y: lastPoint.y + lineDy * t,
              });
            }
          }
          currentSta += lineLen;
          points.push({ sta: currentSta, x: curveStart.x, y: curveStart.y });
          
          let SC = curveStart;
          
          if (lsIn > 0) {
             keyPoints.push({ sta: currentSta, x: curveStart.x, y: curveStart.y, label: "TS", radius: actualRadius, rot: cross > 0 ? "cw" : "ccw", spiralIn: lsIn, spiralOut: lsOut });
             const uinX = -nx1;
             const uinY = -ny1;
             const uinPerpX = -uinY;
             const uinPerpY = uinX;
             
             const samples = Math.max(5, Math.floor(lsIn / 0.25));
             for (let j = 1; j <= samples; j++) {
                let l = lsIn * (j / samples);
                let X = l - Math.pow(l, 5) / (40 * Math.pow(actualRadius, 2) * Math.pow(lsIn, 2));
                let Y = Math.pow(l, 3) / (6 * actualRadius * lsIn) - Math.pow(l, 7) / (336 * Math.pow(actualRadius, 3) * Math.pow(lsIn, 3));
                
                let px = curveStart.x + X * uinX + (sign * Y) * uinPerpX;
                let py = curveStart.y + X * uinY + (sign * Y) * uinPerpY;
                points.push({ sta: currentSta + l, x: px, y: py });
                if (j === samples) SC = { x: px, y: py };
             }
             currentSta += lsIn;
             keyPoints.push({ sta: currentSta, x: SC.x, y: SC.y, label: "SC", radius: actualRadius, rot: cross > 0 ? "cw" : "ccw" });
          } else {
             keyPoints.push({ sta: currentSta, x: curveStart.x, y: curveStart.y, label: "PC", radius: actualRadius, rot: cross > 0 ? "cw" : "ccw", spiralIn: lsIn, spiralOut: lsOut });
          }

          let CS = curveEnd;
          let spiralOutPoints = [];
          
          if (lsOut > 0) {
             const vX = -nx2;
             const vY = -ny2;
             const vPerpX = -vY;
             const vPerpY = vX;
             
             const samples = Math.max(5, Math.floor(lsOut / 0.25));
             for (let j = samples; j >= 0; j--) {
                let l = lsOut * (j / samples);
                let X = l - Math.pow(l, 5) / (40 * Math.pow(actualRadius, 2) * Math.pow(lsOut, 2));
                let Y = Math.pow(l, 3) / (6 * actualRadius * lsOut) - Math.pow(l, 7) / (336 * Math.pow(actualRadius, 3) * Math.pow(lsOut, 3));
                
                let px = curveEnd.x + X * vX - (sign * Y) * vPerpX;
                let py = curveEnd.y + X * vY - (sign * Y) * vPerpY;
                if (j === samples) CS = { x: px, y: py };
                spiralOutPoints.push({ l_offset: lsOut - l, x: px, y: py });
             }
          } else {
             CS = curveEnd;
          }

          let TprimeIn = (actualRadius + p2 - (actualRadius + p1) * Math.cos(deflectionAbs)) / Math.sin(deflectionAbs);
          if (isNaN(TprimeIn) || Math.abs(TprimeIn) > 1e10) TprimeIn = 0;
          let PC_shiftedX = pi.x + nx1 * TprimeIn;
          let PC_shiftedY = pi.y + ny1 * TprimeIn;
          
          const uinX = -nx1;
          const uinY = -ny1;
          const uinPerpX = -uinY;
          const uinPerpY = uinX;
          
          let cx = PC_shiftedX + (actualRadius + p1) * (sign * uinPerpX);
          let cy = PC_shiftedY + (actualRadius + p1) * (sign * uinPerpY);

          let startAng = Math.atan2(SC.y - cy, SC.x - cx);
          let endAng = Math.atan2(CS.y - cy, CS.x - cx);
          
          let sweep = endAng - startAng;
          while (sweep > Math.PI) sweep -= 2 * Math.PI;
          while (sweep < -Math.PI) sweep += 2 * Math.PI;
          
          if (sign > 0 && sweep < 0) sweep += 2 * Math.PI;
          if (sign < 0 && sweep > 0) sweep -= 2 * Math.PI;
          
          let arcLen = Math.abs(sweep * actualRadius);
          
          if (arcLen > 0.1) {
              const arcSteps = Math.max(5, Math.floor(arcLen / 0.25));
              for (let j = 1; j <= arcSteps; j++) {
                const ang = startAng + sweep * (j / arcSteps);
                points.push({
                  sta: currentSta + arcLen * (j / arcSteps),
                  x: cx + Math.cos(ang) * actualRadius,
                  y: cy + Math.sin(ang) * actualRadius,
                });
              }
          }
          currentSta += arcLen;

          if (lsOut > 0) {
             keyPoints.push({ sta: currentSta, x: CS.x, y: CS.y, label: "CS", radius: actualRadius, rot: cross > 0 ? "cw" : "ccw" });
             for (let i = 1; i < spiralOutPoints.length; i++) {
                 points.push({ sta: currentSta + spiralOutPoints[i].l_offset, x: spiralOutPoints[i].x, y: spiralOutPoints[i].y });
             }
             currentSta += lsOut;
             keyPoints.push({ sta: currentSta, x: curveEnd.x, y: curveEnd.y, label: "ST", spiralIn: lsIn, spiralOut: lsOut, radius: actualRadius, rot: cross > 0 ? "cw" : "ccw" });
          } else {
             keyPoints.push({ sta: currentSta, x: CS.x, y: CS.y, label: "PT", spiralIn: lsIn, spiralOut: lsOut, radius: actualRadius, rot: cross > 0 ? "cw" : "ccw" });
          }

          lastPoint = curveEnd;
          hasCurve = true;
          
          keyPoints.push({
             id: `pi-${i}`,
             sta: currentSta - (arcLen + lsOut + lsIn) / 2,
             x: pi.x,
             y: pi.y,
             label: "PI",
             pi: true,
             radius: actualRadius,
             spiralIn: lsIn,
             spiralOut: lsOut
          });
        }
      }
    }

    if (!hasCurve) {
      const lineDx = pi.x - lastPoint.x;
      const lineDy = pi.y - lastPoint.y;
      const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);

      if (lineLen > 0) {
        const samples = Math.max(2, Math.floor(lineLen / 2));
        for (let j = 0; j < samples; j++) {
          const t = j / samples;
          points.push({
            sta: currentSta + lineLen * t,
            x: lastPoint.x + lineDx * t,
            y: lastPoint.y + lineDy * t,
          });
        }
      }

      currentSta += lineLen;
      points.push({ sta: currentSta, x: pi.x, y: pi.y });
      lastPoint = { x: pi.x, y: pi.y };
      
      keyPoints.push({
         id: `pi-${i}`,
         sta: currentSta,
         x: pi.x,
         y: pi.y,
         label: "PI",
         pi: true,
         radius: pi.radius,
         spiralIn: pi.spiralIn,
         spiralOut: pi.spiralOut
      });
    }
  }

  const lastPI = pis[pis.length - 1];
  const finalDx = lastPI.x - lastPoint.x;
  const finalDy = lastPI.y - lastPoint.y;
  const finalLen = Math.sqrt(finalDx * finalDx + finalDy * finalDy);
  if (finalLen > 0) {
    const samples = Math.max(2, Math.floor(finalLen / 2));
    for (let j = 0; j < samples; j++) {
      const t = j / samples;
      points.push({
        sta: currentSta + finalLen * t,
        x: lastPoint.x + finalDx * t,
        y: lastPoint.y + finalDy * t,
      });
    }
  }
  currentSta += finalLen;
  points.push({ sta: currentSta, x: lastPI.x, y: lastPI.y });
  keyPoints.push({
    id: `pi-${pis.length - 1}`,
    sta: currentSta,
    x: lastPI.x,
    y: lastPI.y,
    label: "PF",
    pi: true,
  });

  const finalKeyPoints: AlignmentPoint[] = [];
  let lastCurveRot: "cw" | "ccw" | undefined;
  for (let i = 0; i < keyPoints.length; i++) {
    const kp = keyPoints[i];
    if (kp.label === "PC" || kp.label === "TS") {
      let lastKpIndex = finalKeyPoints.length - 1;
      while (lastKpIndex >= 0 && (finalKeyPoints[lastKpIndex].label === "PI" || finalKeyPoints[lastKpIndex].label === "PIV")) {
        lastKpIndex--;
      }
      const lastKp = lastKpIndex >= 0 ? finalKeyPoints[lastKpIndex] : null;

      if (lastKp && (lastKp.label === "PT" || lastKp.label === "ST") && Math.abs(lastKp.sta - kp.sta) < 0.001) {
        lastKp.label = lastCurveRot === kp.rot ? "PCC" : "PRC";
        lastKp.radius = kp.radius;
        lastKp.rot = kp.rot;
        lastCurveRot = kp.rot;
        lastKp.pi = true;
        continue;
      }
      
      if (finalKeyPoints.length > 0) {
          const first = finalKeyPoints[finalKeyPoints.length - 1];
          if (first && (first.label === "INICIO" || first.label === "PI") && Math.abs(first.sta - kp.sta) < 0.001) {
              first.label = kp.label;
              first.radius = kp.radius;
              first.rot = kp.rot;
              first.pi = true;
              lastCurveRot = kp.rot;
              continue;
          }
      }
      
      lastCurveRot = kp.rot;
    }
    
    if (kp.label === "FIM" || kp.label === "PF" || (kp.label === "PI" && kp.pi && i === keyPoints.length - 1)) {
        let lastKpIndex = finalKeyPoints.length - 1;
        while (lastKpIndex >= 0 && finalKeyPoints[lastKpIndex].label === "PIV") lastKpIndex--;
        const lastKp = lastKpIndex >= 0 ? finalKeyPoints[lastKpIndex] : null;
        if (lastKp && (lastKp.label === "PT" || lastKp.label === "ST") && Math.abs(lastKp.sta - kp.sta) < 0.001) {
            lastKp.pi = true;
            continue;
        }
    }
    
    finalKeyPoints.push(kp);
  }

  return { points, keyPoints: finalKeyPoints, length: currentSta };
}


export interface ElementStyle {
  color?: string;
  layerId?: string;
  lineType?: string; // e.g. "solid", "dashed", "dotted", "dashdot"
  visible?: boolean;
}

export interface AlignmentStyles {
  tangents?: ElementStyle;
  curves?: ElementStyle;
  spirals?: ElementStyle;
  extensions?: ElementStyle;
}

export class Alignment3D {
  id: string;
  name: string = "Alignment";
  length: number = 0;
  points: AlignmentPoint[] = [];
  profile: ProfilePoint[] = [];
  keyPoints: AlignmentPoint[] = [];
  keyProfilePoints: ProfilePoint[] = [];
  isHidden: boolean = false;
  isLocked: boolean = false;
  color?: string;
  superelevationData: AlignmentData | null = null;
  isManuallyEdited?: boolean;
  profileName?: string;
  profileColor?: string;
  isProfileHidden?: boolean;
  visualStartStation?: number;
  visualEndStation?: number;
  parentId?: string;
  offsetValue?: number;
  layerId?: string;
  isSectionLine?: boolean;
  styles?: AlignmentStyles;
  /* ALINHAMENTO DE DESENHO — nariz físico promovido a alinhamento. Derivado e
   * vinculado: reconstruído do nariz a cada mudança, id estável. */
  isNoseAlignment?: boolean;
  /** chave do nariz de origem — o vínculo */
  noseKey?: string;
  /** procedência, para exibição: interseção · ramo · NT */
  noseSource?: {
    intersecao?: string;
    ramo?: string;
    pista?: string;
    nt?: string;
    tipo?: string;
    nomeCustom?: string;
  };
  /** elementos reta/arco ajustados (raio, tangente) do nariz */
  noseSegments?: any[];

  constructor(
    name: string,
    length: number,
    points: AlignmentPoint[],
    profile: ProfilePoint[],
    keyPoints: AlignmentPoint[] = [],
    keyProfilePoints: ProfilePoint[] = [],
  ) {
    this.id = "align_" + Date.now() + Math.random().toString(36).substr(2, 5);
    this.name = name;
    this.length = length;
    this.points = points;
    this.profile = profile;
    this.keyPoints = keyPoints;
    this.keyProfilePoints = keyProfilePoints;
  }

  getPointAtStation(sta: number) {
    if (this.points.length === 0) return { x: 0, y: 0 };
    if (sta <= this.points[0].sta) {
      if (this.points.length > 1) {
        const p1 = this.points[0];
        const p2 = this.points[1];
        const dist = p2.sta - p1.sta;
        if (dist > 0.0001) {
          const t = (sta - p1.sta) / dist;
          return {
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t,
          };
        }
      }
      return { x: this.points[0].x, y: this.points[0].y };
    }
    if (sta >= this.points[this.points.length - 1].sta) {
      if (this.points.length > 1) {
        const p1 = this.points[this.points.length - 2];
        const p2 = this.points[this.points.length - 1];
        const dist = p2.sta - p1.sta;
        if (dist > 0.0001) {
          const t = (sta - p2.sta) / dist;
          return {
            x: p2.x + (p2.x - p1.x) * t,
            y: p2.y + (p2.y - p1.y) * t,
          };
        }
      }
      return {
        x: this.points[this.points.length - 1].x,
        y: this.points[this.points.length - 1].y,
      };
    }

    // Binary search
    let low = 0;
    let high = this.points.length - 1;
    while (low <= high) {
      let mid = Math.floor((low + high) / 2);
      if (
        this.points[mid].sta <= sta &&
        (mid === this.points.length - 1 || this.points[mid + 1].sta > sta)
      ) {
        const p1 = this.points[mid];
        const p2 = this.points[mid + 1];
        if (!p2) return { x: p1.x, y: p1.y };
        const t = (sta - p1.sta) / (p2.sta - p1.sta);
        return {
          x: p1.x + (p2.x - p1.x) * t,
          y: p1.y + (p2.y - p1.y) * t,
        };
      }
      if (this.points[mid].sta > sta) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    return { x: 0, y: 0 };
  }

  getNearestStationAndDistance(
    x: number,
    y: number,
  ): { sta: number; dist: number } {
    if (this.points.length === 0) return { sta: 0, dist: Infinity };
    if (this.points.length === 1) {
      const pt = this.points[0];
      const dist = Math.sqrt(Math.pow(x - pt.x, 2) + Math.pow(y - pt.y, 2));
      return { sta: pt.sta, dist };
    }

    let minDistSq = Infinity;
    let closestSta = 0;

    for (let i = 0; i < this.points.length; i++) {
        const pt = this.points[i];
        const dSq = (pt.x - x)**2 + (pt.y - y)**2;
        if (dSq < minDistSq) minDistSq = dSq;
    }
    
    let searchRadius = Math.sqrt(minDistSq) + 0.1;
    let minDist = Infinity;
    
    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = this.points[i];
      const p2 = this.points[i + 1];
      
      const minX = Math.min(p1.x, p2.x) - searchRadius;
      const maxX = Math.max(p1.x, p2.x) + searchRadius;
      if (x < minX || x > maxX) continue;
      
      const minY = Math.min(p1.y, p2.y) - searchRadius;
      const maxY = Math.max(p1.y, p2.y) + searchRadius;
      if (y < minY || y > maxY) continue;

      const l2 = Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2);
      if (l2 === 0) continue;

      let t = ((x - p1.x) * (p2.x - p1.x) + (y - p1.y) * (p2.y - p1.y)) / l2;
      t = Math.max(0, Math.min(1, t));

      const projX = p1.x + t * (p2.x - p1.x);
      const projY = p1.y + t * (p2.y - p1.y);

      const dist = Math.sqrt(Math.pow(x - projX, 2) + Math.pow(y - projY, 2));

      if (dist < minDist) {
        minDist = dist;
        closestSta = p1.sta + t * (p2.sta - p1.sta);
        searchRadius = dist + 0.1; 
      }
    }

    return { sta: closestSta, dist: minDist };
  }

  getOrientationAtStation(sta: number) {
    if (this.points.length < 2) return { nx: 0, ny: 1, tx: 1, ty: 0 };

    // Quick delta
    const delta = 0.1;
    const p1 = this.getPointAtStation(sta - delta);
    const p2 = this.getPointAtStation(sta + delta);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    return {
      nx: -dy / len,
      ny: dx / len,
      tx: dx / len,
      ty: dy / len,
    };
  }

  getCrossSlope(
    sta: number,
    side: "left" | "right" | "leftShoulder" | "rightShoulder",
  ): number {
    if (!this.superelevationData || !this.superelevationData.superPoints)
      return -2.0;

    const pts = this.superelevationData.superPoints
      .filter((p) => p.lane === side)
      .sort((a, b) => a.station - b.station);
    if (pts.length === 0) return -2.0;
    if (sta <= pts[0].station) return pts[0].slope;
    if (sta >= pts[pts.length - 1].station) return pts[pts.length - 1].slope;

    // Find segment
    for (let i = 0; i < pts.length - 1; i++) {
      if (sta >= pts[i].station && sta <= pts[i + 1].station) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        if (p2.station === p1.station) return p1.slope;
        const t = (sta - p1.station) / (p2.station - p1.station);
        return p1.slope + (p2.slope - p1.slope) * t;
      }
    }
    return -2.0;
  }

  getElevationAtStation(sta: number) {
    if (this.profile.length === 0) return 0;
    if (sta <= this.profile[0].sta) return this.profile[0].elev;
    if (sta >= this.profile[this.profile.length - 1].sta)
      return this.profile[this.profile.length - 1].elev;

    // Binary search
    let low = 0;
    let high = this.profile.length - 1;
    while (low <= high) {
      let mid = Math.floor((low + high) / 2);
      if (
        this.profile[mid].sta <= sta &&
        (mid === this.profile.length - 1 || this.profile[mid + 1].sta > sta)
      ) {
        const p1 = this.profile[mid];
        const p2 = this.profile[mid + 1];
        if (!p2) return p1.elev;
        const t = (sta - p1.sta) / (p2.sta - p1.sta);
        return p1.elev + (p2.elev - p1.elev) * t;
      }
      if (this.profile[mid].sta > sta) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    return 0;
  }

  getGradeAtStation(sta: number) {
    if (this.profile.length < 2) return 0;
    let p1 = this.profile[0];
    let p2 = this.profile[1];

    if (sta <= this.profile[0].sta) {
      p1 = this.profile[0];
      p2 = this.profile[1];
    } else if (sta >= this.profile[this.profile.length - 1].sta) {
      p1 = this.profile[this.profile.length - 2];
      p2 = this.profile[this.profile.length - 1];
    } else {
      for (let i = 0; i < this.profile.length - 1; i++) {
        if (sta >= this.profile[i].sta && sta <= this.profile[i + 1].sta) {
          p1 = this.profile[i];
          p2 = this.profile[i + 1];
          break;
        }
      }
    }
    
    const dSta = p2.sta - p1.sta;
    if (dSta === 0) return 0;
    return ((p2.elev - p1.elev) / dSta) * 100; // Return in percentage
  }
}

export async function parseLandXMLAlignment(
  text: string,
): Promise<Alignment3D> {
  // 1. Extract ONLY the Alignments block using substring to prevent DOMParser and Regex engines from freezing on massive <Surfaces> data
  const textLower = text.toLowerCase();
  let alignStart = textLower.indexOf("<alignments");
  let alignEnd = textLower.lastIndexOf("</alignments>");

  // If no <Alignments> wrapper, look for the first and last <Alignment>
  if (alignStart === -1) alignStart = textLower.indexOf("<alignment");
  if (alignEnd === -1) alignEnd = textLower.lastIndexOf("</alignment>");

  let xmlToParse = `<LandXML></LandXML>`;
  if (alignStart !== -1 && alignEnd !== -1 && alignEnd > alignStart) {
    xmlToParse =
      `<LandXML>` + text.substring(alignStart, alignEnd + 13) + `</LandXML>`;
  } else {
    throw new Error("No <Alignment> found in XML");
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlToParse, "text/xml");

  // Grab the first alignment
  const alignNode = xmlDoc.querySelector("Alignment");
  if (!alignNode) throw new Error("No <Alignment> found in XML");

  const name = alignNode.getAttribute("name") || "Loaded Alignment";
  const lengthStr = alignNode.getAttribute("length");
  const staStartStr = alignNode.getAttribute("staStart");

  const length = lengthStr ? parseFloat(lengthStr) : 1000;
  let currentSta = staStartStr ? parseFloat(staStartStr) : 0;

  const points: AlignmentPoint[] = [];
  const keyPoints: AlignmentPoint[] = [];

  // Parse horizontal geometry safely from DOM
  const coordGeom = alignNode.querySelector("CoordGeom");
  if (coordGeom) {
    const children = coordGeom.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const startNode = child.querySelector("Start");
      const endNode = child.querySelector("End");
      const piNode = child.querySelector("PI");
      const centerNode = child.querySelector("Center");

      const childLengthStr = child.getAttribute("length");
      const childLength = childLengthStr ? parseFloat(childLengthStr) : 0;

      if (startNode && endNode) {
        // LandXML coordinates are Northing Easting -> Y X
        // Handle potential commas in numeric streams instead of dots (common in Portuguese locales)
        const sText = startNode.textContent?.trim().replace(/,/g, ".") || "";
        const eText = endNode.textContent?.trim().replace(/,/g, ".") || "";

        const sVals = sText
          .split(/\s+/)
          .map(Number)
          .filter((n) => !isNaN(n));
        const eVals = eText
          .split(/\s+/)
          .map(Number)
          .filter((n) => !isNaN(n));

        if (sVals.length >= 2 && eVals.length >= 2) {
          points.push({ sta: currentSta, x: sVals[1], y: sVals[0] });

          const currType = (child.localName || child.tagName).replace(/^.*:/, '').toLowerCase();

          // 1. Robust Radius extraction
          let radiusVal: number | undefined = undefined;
          const radiusAttr = child.getAttribute("radius") || child.getAttribute("Radius") || child.getAttribute("RADIUS") || child.getAttribute("r") || child.getAttribute("R") || child.getAttribute("radiusStart") || child.getAttribute("radiusEnd") || child.getAttribute("radiusIn") || child.getAttribute("radiusOut") || child.getAttribute("rad") || child.getAttribute("crvRadius") || child.getAttribute("curveRadius");
          if (radiusAttr && !isNaN(parseFloat(radiusAttr)) && Math.abs(parseFloat(radiusAttr)) > 0) {
            radiusVal = Math.abs(parseFloat(radiusAttr));
          } else {
            const radNode = child.querySelector("Radius") || child.querySelector("R") || child.querySelector("radius") || child.querySelector("RadiusStart") || child.querySelector("RadiusEnd") || child.querySelector("Rad");
            if (radNode && radNode.textContent) {
              const val = parseFloat(radNode.textContent.trim().replace(/,/g, "."));
              if (!isNaN(val) && Math.abs(val) > 0) radiusVal = Math.abs(val);
            }
          }

          if (radiusVal === undefined && centerNode && sVals.length >= 2) {
            const cText = centerNode.textContent?.trim().replace(/,/g, ".") || "";
            const cVals = cText.split(/\s+/).map(Number).filter((n) => !isNaN(n));
            if (cVals.length >= 2) {
              const cX = cVals[1], cY = cVals[0];
              const sX = sVals[1], sY = sVals[0];
              const calcR = Math.hypot(sX - cX, sY - cY);
              if (calcR > 0.01) radiusVal = calcR;
            }
          }

          // If radiusVal is still undefined for curve, calculate geometrically from PI or chord/length
          if (radiusVal === undefined && (currType === "curve" || currType === "circ curve" || currType.includes("curve") || currType.includes("arc"))) {
            if (piNode) {
              const piText = piNode.textContent?.trim().replace(/,/g, ".") || "";
              const piVals = piText.split(/\s+/).map(Number).filter((n) => !isNaN(n));
              if (piVals.length >= 2) {
                const pX = piVals[1], pY = piVals[0];
                const sX = sVals[1], sY = sVals[0];
                const eX = eVals[1], eY = eVals[0];
                const tanLen = Math.hypot(pX - sX, pY - sY);
                const v1x = pX - sX, v1y = pY - sY;
                const v2x = eX - pX, v2y = eY - pY;
                const a1 = Math.atan2(v1y, v1x);
                const a2 = Math.atan2(v2y, v2x);
                let defl = Math.abs(a2 - a1);
                while (defl > Math.PI) defl = Math.abs(defl - 2 * Math.PI);
                if (defl > 0.0001) {
                  const calcR = tanLen / Math.tan(defl / 2);
                  if (isFinite(calcR) && calcR > 0.01) radiusVal = calcR;
                }
              }
            }
            if (radiusVal === undefined && childLength > 0) {
              const chord = Math.hypot(eVals[1] - sVals[1], eVals[0] - sVals[0]);
              if (childLength > chord + 0.001) {
                const ratio = chord / childLength;
                if (ratio < 0.99999) {
                  // Newton solver for sin(x)/x = ratio, where x = delta / 2
                  let x = Math.sqrt(Math.max(0, 6 * (1 - ratio)));
                  for (let iter = 0; iter < 10; iter++) {
                    const sinx = Math.sin(x);
                    const cosx = Math.cos(x);
                    const f = sinx / x - ratio;
                    const fprime = (x * cosx - sinx) / (x * x);
                    if (Math.abs(fprime) < 1e-12) break;
                    const dx = f / fprime;
                    x -= dx;
                    if (Math.abs(dx) < 1e-8) break;
                  }
                  if (x > 0) {
                    const calcR = childLength / (2 * x);
                    if (isFinite(calcR) && calcR > 0.01) radiusVal = calcR;
                  }
                }
              }
            }
          }

          // 2. Spiral/Transition extraction
          let spiralInVal: number | undefined = undefined;
          let spiralOutVal: number | undefined = undefined;
          if (currType === "spiral" || currType.includes("spiral") || currType.includes("clothoid")) {
            spiralInVal = childLength;
            if (radiusVal === undefined) {
              const rEnd = parseFloat(child.getAttribute("radiusEnd") || child.getAttribute("radiusIn") || "");
              const rStart = parseFloat(child.getAttribute("radiusStart") || child.getAttribute("radiusOut") || "");
              if (!isNaN(rEnd) && rEnd > 0) radiusVal = rEnd;
              else if (!isNaN(rStart) && rStart > 0) radiusVal = rStart;
            }
          } else {
            const inSp = child.getAttribute("spiralIn") || child.getAttribute("inSpiral") || child.querySelector("InSpiral")?.getAttribute("length");
            const outSp = child.getAttribute("spiralOut") || child.getAttribute("outSpiral") || child.querySelector("OutSpiral")?.getAttribute("length");
            if (inSp) spiralInVal = parseFloat(inSp);
            if (outSp) spiralOutVal = parseFloat(outSp);
          }

          // 3. Determine label for start node
          let label = "";
          let isPi = false;
          if (i === 0) {
            label = "PP";
            isPi = true;
          } else {
            let prevType = (children[i - 1].localName || children[i - 1].tagName).replace(/^.*:/, '').toLowerCase();
            if (prevType === "line" && currType === "curve") label = "PC";
            else if (prevType === "curve" && currType === "line") label = "PT";
            else if (prevType === "line" && currType === "spiral") label = "TS";
            else if (prevType === "spiral" && currType === "curve") label = "SC";
            else if (prevType === "curve" && currType === "spiral") label = "CS";
            else if (prevType === "spiral" && currType === "line") label = "ST";
            else if (prevType === "curve" && currType === "curve") {
              label = "PCC";
              isPi = true;
            }
            else if (prevType === "line" && currType === "line") {
              label = "PI";
              isPi = true;
            }
          }

          const rotAttr = child.getAttribute("rot");
          keyPoints.push({
            sta: currentSta,
            x: sVals[1],
            y: sVals[0],
            label,
            pi: isPi,
            radius: radiusVal,
            spiralIn: spiralInVal,
            spiralOut: spiralOutVal,
            rot: (rotAttr === "cw" || rotAttr === "right" || rotAttr === "CW" || rotAttr === "RIGHT") ? "cw" : "ccw",
          });

          // 4. PI calculation/extraction for curves & spirals
          let piX: number | undefined = undefined;
          let piY: number | undefined = undefined;

          if (piNode) {
            const piText = piNode.textContent?.trim().replace(/,/g, ".") || "";
            const piVals = piText.split(/\s+/).map(Number).filter((n) => !isNaN(n));
            if (piVals.length >= 2) {
              piY = piVals[0];
              piX = piVals[1];
            }
          }

          if (piX === undefined && (currType === "curve" || currType === "spiral") && centerNode) {
            const cText = centerNode.textContent?.trim().replace(/,/g, ".") || "";
            const cVals = cText.split(/\s+/).map(Number).filter((n) => !isNaN(n));
            if (cVals.length >= 2) {
              const cX = cVals[1], cY = cVals[0];
              const sX = sVals[1], sY = sVals[0];
              const eX = eVals[1], eY = eVals[0];
              const rot = (child.getAttribute("rot") || child.getAttribute("dir") || "cw").toLowerCase();
              const isCw = rot === "cw" || rot === "right";

              const v1x = sX - cX, v1y = sY - cY;
              const v2x = eX - cX, v2y = eY - cY;

              const t1x = isCw ? v1y : -v1y;
              const t1y = isCw ? -v1x : v1x;
              const t2x = isCw ? v2y : -v2y;
              const t2y = isCw ? -v2x : v2x;

              const denom = t1x * t2y - t1y * t2x;
              if (Math.abs(denom) > 1e-6) {
                const t = ((eX - sX) * t2y - (eY - sY) * t2x) / denom;
                piX = sX + t * t1x;
                piY = sY + t * t1y;
              }
            }
          }

          if (piX !== undefined && piY !== undefined) {
            keyPoints.push({
              sta: currentSta + (childLength > 0 ? childLength / 2 : 10),
              x: piX,
              y: piY,
              label: "PI",
              pi: true,
              radius: radiusVal,
              spiralIn: spiralInVal,
              spiralOut: spiralOutVal,
            });
          } else if (currType === "curve" || currType === "spiral") {
            // Push mid-curve point as PI reference if geometric PI calculation wasn't available
            keyPoints.push({
              sta: currentSta + (childLength > 0 ? childLength / 2 : 10),
              x: (sVals[1] + eVals[1]) / 2,
              y: (sVals[0] + eVals[0]) / 2,
              label: "PI",
              pi: true,
              radius: radiusVal,
              spiralIn: spiralInVal,
              spiralOut: spiralOutVal,
            });
          }

          let advance = childLength;
          if (advance === 0)
            advance = Math.sqrt(
              Math.pow(eVals[1] - sVals[1], 2) +
                Math.pow(eVals[0] - sVals[0], 2),
            );

          if (currType === "curve" || currType === "spiral") {
            if (centerNode && currType === "curve") {
              const cText =
                centerNode.textContent?.trim().replace(/,/g, ".") || "";
              const cVals = cText
                .split(/\s+/)
                .map(Number)
                .filter((n) => !isNaN(n));
              if (cVals.length >= 2) {
                const cX = cVals[1],
                  cY = cVals[0];
                const sX = sVals[1],
                  sY = sVals[0];
                const eX = eVals[1],
                  eY = eVals[0];
                const rot = (child.getAttribute("rot") || "cw").toLowerCase();

                const r = Math.sqrt(
                  Math.pow(sX - cX, 2) + Math.pow(sY - cY, 2),
                );
                const startAng = Math.atan2(sY - cY, sX - cX);
                const endAng = Math.atan2(eY - cY, eX - cX);

                let sweep = endAng - startAng;
                if (rot === "cw" || rot === "right") {
                  if (sweep > 0) sweep -= 2 * Math.PI;
                } else {
                  if (sweep < 0) sweep += 2 * Math.PI;
                }

                const steps = Math.max(
                  10,
                  Math.floor((Math.abs(sweep) * r) / 5),
                ); // ~5m resolution
                const stepLen = advance / steps;
                for (let j = 1; j < steps; j++) {
                  const ang = startAng + sweep * (j / steps);
                  points.push({
                    sta: currentSta + stepLen * j,
                    x: cX + Math.cos(ang) * r,
                    y: cY + Math.sin(ang) * r,
                  });
                }
              }
            } else if (currType === "spiral") {
              const steps = 10;
              const stepLen = advance / steps;
              for (let j = 1; j < steps; j++) {
                const t = j / steps;
                points.push({
                  sta: currentSta + stepLen * j,
                  x: sVals[1] + (eVals[1] - sVals[1]) * t,
                  y: sVals[0] + (eVals[0] - sVals[0]) * t,
                });
              }
            }
          }

          currentSta += advance;
          points.push({ sta: currentSta, x: eVals[1], y: eVals[0] });
          if (i === children.length - 1) {
            keyPoints.push({
              sta: currentSta,
              x: eVals[1],
              y: eVals[0],
              label: "PF",
              pi: true,
            });
          }
        }
      } else {
        currentSta += childLength;
      }
    }

    // Propagate radius and spirals between keyPoints so PIs and PC/PT/TS/ST share them
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < keyPoints.length; k++) {
        const kp = keyPoints[k];
        const r = kp.radius;
        const spIn = kp.spiralIn;
        const spOut = kp.spiralOut;

        if ((r && r > 0) || (spIn && spIn > 0) || (spOut && spOut > 0)) {
          for (let j = Math.max(0, k - 4); j <= Math.min(keyPoints.length - 1, k + 4); j++) {
            if (r && r > 0 && (!keyPoints[j].radius || keyPoints[j].radius === 0)) {
              keyPoints[j].radius = r;
            }
            if (spIn && spIn > 0 && (!keyPoints[j].spiralIn || keyPoints[j].spiralIn === 0)) {
              keyPoints[j].spiralIn = spIn;
            }
            if (spOut && spOut > 0 && (!keyPoints[j].spiralOut || keyPoints[j].spiralOut === 0)) {
              keyPoints[j].spiralOut = spOut;
            }
          }
        }
      }
    }
  }

  // Clean duplicates from points
  points.sort((a, b) => a.sta - b.sta);
  const uniquePoints: AlignmentPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (
      i === 0 ||
      Math.abs(points[i].sta - uniquePoints[uniquePoints.length - 1].sta) >
        0.001
    ) {
      uniquePoints.push(points[i]);
    }
  }
  if (uniquePoints.length === 0) {
    uniquePoints.push({ sta: 0, x: 0, y: 0 }, { sta: length, x: length, y: 0 });
  }

  // Profile Points Extraction (DOM avoids all cross-alignment regex traps and empty array bugs)
  const profilePoints: ProfilePoint[] = [];

  // Select all ProfAligns specifically within this alignment
  let profileNodes = alignNode.querySelectorAll("Profile > ProfAlign");
  if (profileNodes.length === 0) {
    profileNodes = alignNode.querySelectorAll("ProfAlign");
  }

  let targetProfile = Array.from(profileNodes).find(
    (p) => p.getAttribute("state")?.toLowerCase() === "proposed",
  );
  if (!targetProfile && profileNodes.length > 0) {
    targetProfile = profileNodes[profileNodes.length - 1]; // Fallback to last ProfAlign
  }

  const keyProfilePoints: ProfilePoint[] = [];

  if (targetProfile) {
    // Collect PVIs and Vertical Curves
    const rawPoints: {
      sta: number;
      elev: number;
      type: string;
      length: number;
    }[] = [];
    const curveElements = targetProfile.querySelectorAll(
      "PVI, ParaCurve, UnsymParaCurve, CircCurve",
    );
    curveElements.forEach((el) => {
      const textContent = el.textContent?.trim().replace(/,/g, ".");
      if (textContent) {
        const vals = textContent
          .split(/\s+/)
          .map(Number)
          .filter((n) => !isNaN(n));
        if (vals.length >= 2) {
          let len = 0;
          if (el.tagName.toLowerCase() === "paracurve") {
            len = parseFloat(el.getAttribute("length") || "0");
          }
          rawPoints.push({
            sta: vals[0],
            elev: vals[1],
            type: el.tagName.toLowerCase(),
            length: len,
          });
        }
      }
    });

    rawPoints.sort((a, b) => a.sta - b.sta);

    for (let i = 0; i < rawPoints.length; i++) {
      const pt = rawPoints[i];

      if (
        pt.type === "paracurve" &&
        pt.length > 0 &&
        i > 0 &&
        i < rawPoints.length - 1
      ) {
        const prev = rawPoints[i - 1];
        const next = rawPoints[i + 1];

        // Grades from PI to PI
        const g1 = (pt.elev - prev.elev) / (pt.sta - prev.sta);
        const g2 = (next.elev - pt.elev) / (next.sta - pt.sta);

        const L = pt.length;
        const L_2 = L / 2;

        const A = Math.abs((g2 - g1) * 100);
        const K = A > 0 ? L / A : 0;

        const pvcSta = pt.sta - L_2;
        const pvcElev = pt.elev - g1 * L_2;

        profilePoints.push({ sta: pvcSta, elev: pvcElev });
        keyProfilePoints.push({ sta: pvcSta, elev: pvcElev, label: "PCV" });
        keyProfilePoints.push({
          sta: pt.sta,
          elev: pt.elev,
          label: "PIV",
          l: L,
          k: K,
        });

        const steps = Math.max(10, Math.floor(L / 5)); // 5m res
        for (let j = 1; j < steps; j++) {
          const X = (L * j) / steps;
          const sta = pvcSta + X;
          const elev = pvcElev + g1 * X + ((g2 - g1) * X * X) / (2 * L);
          profilePoints.push({ sta, elev });
        }

        const pvtSta = pt.sta + L_2;
        const pvtElev = pt.elev + g2 * L_2;
        profilePoints.push({ sta: pvtSta, elev: pvtElev });
        keyProfilePoints.push({ sta: pvtSta, elev: pvtElev, label: "PTV" });
      } else {
        profilePoints.push({ sta: pt.sta, elev: pt.elev });
        keyProfilePoints.push({
          sta: pt.sta,
          elev: pt.elev,
          label: i === 0 ? "PP" : i === rawPoints.length - 1 ? "PF" : "PIV",
        });
      }
    }
  }

  profilePoints.sort((a, b) => a.sta - b.sta);
  const uniqueProfilePoints: ProfilePoint[] = [];
  for (let i = 0; i < profilePoints.length; i++) {
    // Skip duplicate PVI stations
    if (
      i === 0 ||
      Math.abs(
        profilePoints[i].sta -
          uniqueProfilePoints[uniqueProfilePoints.length - 1].sta,
      ) > 0.001
    ) {
      uniqueProfilePoints.push(profilePoints[i]);
    }
  }

  keyProfilePoints.sort((a, b) => a.sta - b.sta);


  const alignment3d = new Alignment3D(
    name,
    currentSta > 0 ? uniquePoints[uniquePoints.length - 1].sta : length,
    uniquePoints,
    uniqueProfilePoints,
    keyPoints,
    keyProfilePoints,
  );

  try {
    const superData = parseLandXML(text);
    if (superData && superData.length > 0) {
      alignment3d.superelevationData = superData[0];
    }
  } catch (err) {
    console.warn("Failed to parse super geometries from XML", err);
  }

  return alignment3d;
}

export function getOffsetPIs(pis: {x: number, y: number, radius?: number}[], offsetDist: number) {
   if (pis.length < 2) return [];
   
   // Clean up duplicate PIs first to avoid dx=0, dy=0 which causes random normals
   const cleanIndices = [0];
   const cleanPIs = [pis[0]];
   for (let i = 1; i < pis.length; i++) {
       if (Math.hypot(pis[i].x - cleanPIs[cleanPIs.length - 1].x, pis[i].y - cleanPIs[cleanPIs.length - 1].y) > 0.01) {
           cleanPIs.push(pis[i]);
           cleanIndices.push(cleanPIs.length - 1);
       } else {
           cleanIndices.push(cleanPIs.length - 1); // Maps to the same clean PI
       }
   }
   if (cleanPIs.length < 2) {
       return pis.map(p => ({ x: p.x, y: p.y, radius: p.radius }));
   }

   const cleanNewPIs: {x: number, y: number, radius?: number}[] = [];
   
   const getOffsetLine = (p1: any, p2: any, d: number) => {
       const dx = p2.x - p1.x;
       const dy = p2.y - p1.y;
       const len = Math.sqrt(dx*dx + dy*dy) || 1;
       const nx = -dy / len;
       const ny = dx / len;
       return {
           p1: { x: p1.x + nx * d, y: p1.y + ny * d },
           p2: { x: p2.x + nx * d, y: p2.y + ny * d },
           nx, ny,
           dx, dy
       };
   };
   
   const intersect = (a1: any, a2: any, b1: any, b2: any) => {
       const x1 = a1.x, y1 = a1.y;
       const x2 = a2.x, y2 = a2.y;
       const x3 = b1.x, y3 = b1.y;
       const x4 = b2.x, y4 = b2.y;
       
       const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
       if (Math.abs(denom) < 1e-6) return null;
       
       const px = ((x1*y2 - y1*x2)*(x3 - x4) - (x1 - x2)*(x3*y4 - y3*x4)) / denom;
       const py = ((x1*y2 - y1*x2)*(y3 - y4) - (y1 - y2)*(x3*y4 - y3*x4)) / denom;
       return { x: px, y: py };
   };
   
   const lines = [];
   for (let i = 0; i < cleanPIs.length - 1; i++) {
        lines.push(getOffsetLine(cleanPIs[i], cleanPIs[i+1], offsetDist));
   }
   
   cleanNewPIs.push({ x: lines[0].p1.x, y: lines[0].p1.y, radius: cleanPIs[0].radius });
   
   for (let i = 0; i < lines.length - 1; i++) {
       const l1 = lines[i];
       const l2 = lines[i+1];
       const pt = intersect(l1.p1, l1.p2, l2.p1, l2.p2);
       
       if (pt) {
           let newRadius = cleanPIs[i+1].radius;
           if (newRadius) {
                const cross = l1.dx * l2.dy - l1.dy * l2.dx;
                if ((cross > 0 && offsetDist > 0) || (cross < 0 && offsetDist < 0)) {
                    newRadius = Math.max(0.1, newRadius - Math.abs(offsetDist));
                } else {
                    newRadius = newRadius + Math.abs(offsetDist);
                }
           }
           cleanNewPIs.push({ ...pt, radius: newRadius });
       } else {
           cleanNewPIs.push({ x: l2.p1.x, y: l2.p1.y, radius: cleanPIs[i+1].radius });
       }
   }
   
   const lastLine = lines[lines.length - 1];
   cleanNewPIs.push({ x: lastLine.p2.x, y: lastLine.p2.y, radius: cleanPIs[cleanPIs.length - 1].radius });
   
   // Map back to original indices to preserve length
   const newPIs: {x: number, y: number, radius?: number}[] = [];
   for (let i = 0; i < pis.length; i++) {
       newPIs.push(cleanNewPIs[cleanIndices[i]]);
   }

   return newPIs;
}

export function joinAlignmentsWithFillet(align1: Alignment3D, align2: Alignment3D, radius: number, newName: string): Alignment3D | null {
  const pis1 = align1.keyPoints.filter(p => p.pi).map(p => ({ x: p.x, y: p.y, radius: p.radius }));
  const pis2 = align2.keyPoints.filter(p => p.pi).map(p => ({ x: p.x, y: p.y, radius: p.radius }));

  if (pis1.length < 2 || pis2.length < 2) return null;

  const p1 = pis1[pis1.length - 2];
  const p2 = pis1[pis1.length - 1];
  
  const p3 = pis2[0];
  const p4 = pis2[1];

  const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  
  let newPIs = [];
  if (Math.abs(denom) > 0.0001) {
    const intX = ((p1.x * p2.y - p1.y * p2.x) * (p3.x - p4.x) - (p1.x - p2.x) * (p3.x * p4.y - p3.y * p4.x)) / denom;
    const intY = ((p1.x * p2.y - p1.y * p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x * p4.y - p3.y * p4.x)) / denom;
    
    newPIs = [...pis1.slice(0, -1)];
    newPIs.push({ x: intX, y: intY, radius: radius });
    newPIs.push(...pis2.slice(1));
  } else {
    // Parallel or nearly parallel, just append
    newPIs = [...pis1, ...pis2];
  }

  const geom = rebuildFromPIs(newPIs);
  if (!geom) return null;
  
  // Combine profiles if possible, or just keep first profile
  return new Alignment3D(newName, geom.length, geom.points, align1.profile, geom.keyPoints, align1.keyProfilePoints);
}

export function createOffsetAlignment(base: Alignment3D, offsetDist: number, name: string): Alignment3D {
   const allPIs = base.keyPoints.filter(p => p.pi);
   const originalPIs = allPIs.map(p => ({ x: p.x, y: p.y, radius: p.radius }));
   
   const newPIs = getOffsetPIs(originalPIs, offsetDist);

   // To faithfully reproduce complex geometries (like intersection branches) that cannot be 
   // perfectly rebuilt from PIs due to overlap scaling, we directly offset the dense points array.
   let rawOffsetPoints: { x: number; y: number; origSta: number }[] = [];
   
   for (let i = 0; i < base.points.length; i++) {
       const p = base.points[i];
       const orient = base.getOrientationAtStation(p.sta);
       // orient.nx, orient.ny represents the left normal
       const nx = p.x + orient.nx * offsetDist;
       const ny = p.y + orient.ny * offsetDist;
       rawOffsetPoints.push({ x: nx, y: ny, origSta: p.sta });
   }

   // Keep offset points integral along the entire length of the parent alignment
   // without destructive geometric trimming.
   let baseRadius: number | undefined;
   for (const kp of base.keyPoints) {
       if (kp.radius && kp.radius > 0) {
           baseRadius = kp.radius;
           break;
       }
   }
   if (!baseRadius) {
       for (const pt of base.points) {
           if (pt.radius && pt.radius > 0) {
               baseRadius = pt.radius;
               break;
           }
       }
   }

   let exactOffsetRadius: number | undefined;
   if (baseRadius && baseRadius > 0) {
       const absOffset = Math.abs(offsetDist);
       if (rawOffsetPoints.length >= 3) {
           const p0 = rawOffsetPoints[0];
           const pMid = rawOffsetPoints[Math.floor(rawOffsetPoints.length / 2)];
           const pLast = rawOffsetPoints[rawOffsetPoints.length - 1];
           const d = 2 * (p0.x * (pMid.y - pLast.y) + pMid.x * (pLast.y - p0.y) + pLast.x * (p0.y - pMid.y));
           const approxR = Math.abs(d) > 1e-6
               ? (Math.hypot(pMid.x - p0.x, pMid.y - p0.y) * Math.hypot(pLast.x - pMid.x, pLast.y - pMid.y) * Math.hypot(p0.x - pLast.x, p0.y - pLast.y)) / (2 * Math.abs(d))
               : null;
           if (approxR && Math.abs(approxR - (baseRadius + absOffset)) < Math.abs(approxR - Math.abs(baseRadius - absOffset))) {
               exactOffsetRadius = baseRadius + absOffset;
           } else if (approxR && Math.abs(approxR - Math.abs(baseRadius - absOffset)) <= 2.0) {
               exactOffsetRadius = Math.abs(baseRadius - absOffset);
           } else {
               exactOffsetRadius = baseRadius + absOffset;
           }
       } else {
           exactOffsetRadius = baseRadius + absOffset;
       }
   }

   const newPoints: AlignmentPoint[] = [];
   const staMap: { orig: number, new: number }[] = [];
   let currentSta = 0;

   for (let i = 0; i < rawOffsetPoints.length; i++) {
       const pt = rawOffsetPoints[i];
       if (i > 0) {
           const prev = newPoints[i - 1];
           currentSta += Math.sqrt(Math.pow(pt.x - prev.x, 2) + Math.pow(pt.y - prev.y, 2));
       }
       newPoints.push({ sta: currentSta, x: pt.x, y: pt.y, radius: exactOffsetRadius });
       staMap.push({ orig: pt.origSta, new: currentSta });
   }

   function getNewSta(origSta: number) {
       if (staMap.length === 0) return 0;
       if (origSta <= staMap[0].orig) return staMap[0].new;
       if (origSta >= staMap[staMap.length - 1].orig) return staMap[staMap.length - 1].new;
       for (let i = 0; i < staMap.length - 1; i++) {
           if (origSta >= staMap[i].orig && origSta <= staMap[i+1].orig) {
               const denom = staMap[i+1].orig - staMap[i].orig;
               const t = denom > 1e-6 ? (origSta - staMap[i].orig) / denom : 0;
               return staMap[i].new + t * (staMap[i+1].new - staMap[i].new);
           }
       }
       return 0;
   }

   const startOrigSta = staMap.length > 0 ? staMap[0].orig : 0;
   const endOrigSta = staMap.length > 0 ? staMap[staMap.length - 1].orig : base.length;

   const newKeyPoints: any[] = [];
   // Start point
   newKeyPoints.push({
       label: "PC / INÍCIO",
       sta: 0,
       x: newPoints[0].x,
       y: newPoints[0].y,
       radius: exactOffsetRadius
   });

   // Intermediate key points that fall strictly within the trimmed interval
   for (let i = 1; i < base.keyPoints.length - 1; i++) {
       const kp = base.keyPoints[i];
       if (kp.sta > startOrigSta + 0.1 && kp.sta < endOrigSta - 0.1 && !kp.pi) {
           const newS = getNewSta(kp.sta);
           let ptOnNew = newPoints.find(p => Math.abs(p.sta - newS) < 0.2);
           if (!ptOnNew && newPoints.length > 0) {
               const orient = base.getOrientationAtStation(kp.sta);
               ptOnNew = { x: kp.x + orient.nx * offsetDist, y: kp.y + orient.ny * offsetDist, sta: newS };
           }
           if (ptOnNew) {
               newKeyPoints.push({
                   label: kp.label,
                   sta: newS,
                   x: ptOnNew.x,
                   y: ptOnNew.y,
                   radius: exactOffsetRadius !== undefined ? exactOffsetRadius : (kp.radius !== undefined ? Math.max(0, kp.radius + offsetDist) : undefined)
               });
           }
       }
   }

   // End point
   if (newPoints.length > 1) {
       newKeyPoints.push({
           label: "FINAL - PT",
           sta: currentSta,
           x: newPoints[newPoints.length - 1].x,
           y: newPoints[newPoints.length - 1].y,
           radius: exactOffsetRadius
       });
   }

   // Profile points also need to be re-stationed.
   const newProfile = base.profile.map(p => ({ ...p, sta: getNewSta(p.sta) }));
   const newKeyProfilePoints = base.keyProfilePoints.map(p => ({ ...p, sta: getNewSta(p.sta) }));

   const align = new Alignment3D(name, currentSta, newPoints, newProfile, newKeyPoints, newKeyProfilePoints);
   return align;
}
