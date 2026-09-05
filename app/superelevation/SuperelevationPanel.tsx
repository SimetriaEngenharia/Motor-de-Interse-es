import React, { useState, useEffect } from "react";
import { SuperelevationChart } from "./components/SuperelevationChart";
import { FileUploader } from "./components/FileUploader";
import { CalculationTable } from "./components/CalculationTable";
import {
  CalculoMemoria,
  calculateCurveParams,
} from "./components/CalculoMemoria";
import { PlanView } from "./components/PlanView";
import { NormativasView } from "./components/Normativas";
import { VerificationModal } from "./components/VerificationModal";
import { defaultAlignmentData } from "./data/defaultData";
import { parseLandXML } from "./utils/landXmlParser";
import { AlignmentData } from "./types";
import {
  getSuperelevationDispensableRadius,
  getTransitionDispensableRadius,
} from "./utils/referenceTables";
import { getAdjacentGeometry } from "./utils/geometryUtils";
import {
  Settings2,
  Calculator,
  TableProperties,
  FileText,
  Scale,
  CheckSquare,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { SuperPoint } from "./types";
import { useStore } from "../store";
import { Alignment3D } from "../lib/alignment";
import { X, Save } from "lucide-react";

export function createDefaultDataFromAlignment(
  alignment: Alignment3D | undefined,
): AlignmentData {
  if (!alignment) return defaultAlignmentData;

  const geometries: any[] = [];

  if (alignment.keyPoints && alignment.keyPoints.length > 0) {
    const rawStructPoints = [...alignment.keyPoints]
      .map((p, i) => ({ ...p, _idx: i }))
      .sort((a, b) => a.sta !== b.sta ? a.sta - b.sta : a._idx - b._idx)
      .filter((p) => p.label && (["PP", "PC", "PT", "PF", "PCC", "PRC", "TS", "SC", "CS", "ST", "POB", "POE", "TE", "EC", "CE", "ET", "PI"].includes(p.label)));

    const structPoints = rawStructPoints.filter((p, i) => {
      if (p.label !== "PI") return true;
      if (p.radius) return false;
      const prev = rawStructPoints[i - 1];
      const next = rawStructPoints[i + 1];
      if (prev && next) {
         if (
           (prev.label === "TE" && next.label === "EC") ||
           (prev.label === "EC" && next.label === "CE") ||
           (prev.label === "CE" && (next.label === "ET" || next.label === "PF")) ||
           (prev.label === "TS" && next.label === "SC") ||
           (prev.label === "SC" && next.label === "CS") ||
           (prev.label === "CS" && (next.label === "ST" || next.label === "PF")) ||
           (prev.label === "PP" && (next.label === "SC" || next.label === "EC")) ||
           (["PC", "PCC", "PRC"].includes(prev.label) && ["PT", "PCC", "PRC", "PF"].includes(next.label)) ||
           (["PP"].includes(prev.label) && ["PT", "PCC", "PRC"].includes(next.label))
         ) {
            return false;
         }
      }
      return true;
    });
      
    let curveCount = 0;
    let tangentCount = 0;
    let spiralCount = 0;

    for (let i = 0; i < structPoints.length - 1; i++) {
      const kp1 = structPoints[i];
      const kp2 = structPoints[i + 1];

      let type: "Tangent" | "Curve" | "Spiral" = "Tangent";

      const isCurveStart = kp1.label && ["PC", "PCC", "PRC"].includes(kp1.label);
      const isCurveEnd = kp2.label && ["PT", "PCC", "PRC"].includes(kp2.label);

      if (
        (isCurveStart && isCurveEnd) ||
        (kp1.label === "SC" && kp2.label === "CS") ||
        (kp1.label === "EC" && kp2.label === "CE") ||
        (kp1.label === "PP" && isCurveEnd) ||
        (isCurveStart && kp2.label === "PF")
      ) {
        type = "Curve";
      } else if (
        (kp1.label === "TS" && kp2.label === "SC") ||
        (kp1.label === "CS" && kp2.label === "ST") ||
        (kp1.label === "TE" && kp2.label === "EC") ||
        (kp1.label === "CE" && kp2.label === "ET") ||
        (kp1.label === "CE" && kp2.label === "PF") ||
        (kp1.label === "CS" && kp2.label === "PF") ||
        (kp1.label === "PP" && kp2.label === "SC") ||
        (kp1.label === "PP" && kp2.label === "EC")
      ) {
        type = "Spiral";
      }

      let name = "";
      if (type === "Curve") {
        curveCount++;
        name = `Curva ${curveCount}`;
      } else if (type === "Spiral") {
        spiralCount++;
        name = `Espiral ${spiralCount}`;
      } else {
        tangentCount++;
        name = `Tangente ${tangentCount}`;
      }

      let radius = kp1.radius;
      let piX: number | undefined;
      let piY: number | undefined;

      if (type === "Curve") {
        const pi = alignment.keyPoints.find(p => p.label === "PI" && p.sta >= kp1.sta && p.sta <= kp2.sta);
        if (pi) {
          if (!radius && pi.radius) radius = pi.radius;
          piX = pi.x;
          piY = pi.y;
        }
      }

      geometries.push({
        id: `t_${i}`,
        type: type,
        startStation: kp1.sta,
        endStation: kp2.sta,
        name: name,
        radius: radius || 1000,
        rot: kp1.rot || "cw",
        startX: kp1.x,
        startY: kp1.y,
        endX: kp2.x,
        endY: kp2.y,
        piX: piX,
        piY: piY,
      });
    }
  } else if (alignment.points && alignment.points.length > 0) {
    geometries.push({
      id: `t_0`,
      type: "Tangent",
      startStation: alignment.points[0].sta,
      endStation: alignment.points[alignment.points.length - 1].sta,
      name: `Tangente 1`,
      startX: alignment.points[0].x,
      startY: alignment.points[0].y,
      endX: alignment.points[alignment.points.length - 1].x,
      endY: alignment.points[alignment.points.length - 1].y,
    });
  }

  const existingData = alignment.superelevationData;
  if (existingData) {
    // Preserve custom overrides in geometries while updating geometry stats
    const syncedGeometries = geometries.map((ng) => {
      const existingG = existingData.geometries.find((eg) => eg.type === ng.type && eg.name === ng.name);
      if (existingG) {
        return {
          ...ng,
          overrideRadius: existingG.overrideRadius,
          designSpeed: existingG.designSpeed,
          laneWidth: existingG.laneWidth,
          distAxis: existingG.distAxis,
          eMax: existingG.eMax,
        };
      }
      return ng;
    });

    return {
      ...existingData,
      name: alignment.name || existingData.name,
      geometries: syncedGeometries,
    };
  }

  return {
    name: alignment.name,
    geometries,
    superPoints: [],
    trackType: "Coroado",
    norm: "DNIT",
    designSpeed: 60,
    laneWidth: 3.6,
    eMax: 8,
    distAxis: 7.2,
    ramoAxis: "right",
  };
}

export function SuperelevationPanel({
  alignmentId,
  onClose,
}: {
  alignmentId?: string;
  onClose: () => void;
}) {
  const store = useStore();
  const alignment = store.alignments.find((a) => a.id === alignmentId);
  const [data, setData] = useState<AlignmentData>(
    createDefaultDataFromAlignment(alignment),
  );
  const [zoomedGeometryId, setZoomedGeometryId] = useState<string | null>(null);
  const [hoveredStation, setHoveredStation] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<
    "planilha" | "memoria" | "normativas"
  >("planilha");
  const [showVerification, setShowVerification] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [appMode, setAppMode] = useState<"alignment" | "calculator">(
    "alignment",
  );
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [radiiInput, setRadiiInput] = useState("");

  const handleSave = () => {
    if (alignment) {
      alignment.superelevationData = data;
      store.recomputeGeometry();
      onClose();
    }
  };

  const updateTrackType = (newType: "Coroado" | "Ramo") => {
    setData((prev) => ({ ...prev, trackType: newType }));
  };

  const updateRamoAxis = (newAxis: "left" | "right") => {
    setData((prev) => ({ ...prev, ramoAxis: newAxis }));
  };

  const updateDesignSpeed = (speed: number) => {
    setData((prev) => ({ ...prev, designSpeed: speed }));
  };

  const updateLaneWidth = (width: number) => {
    setData((prev) => ({ ...prev, laneWidth: width }));
  };

  const updateNorm = (norm: "DNIT" | "DER" | "DNIT - Interseções") => {
    setData((prev) => ({ ...prev, norm: norm }));
  };

  const updateDistAxis = (dist: number) => {
    setData((prev) => ({ ...prev, distAxis: dist }));
  };

  const updateEmax = (eMax: number) => {
    setData((prev) => ({ ...prev, eMax: eMax }));
  };

  const updateCurveConfig = (
    curveId: string,
    property:
      | "designSpeed"
      | "laneWidth"
      | "distAxis"
      | "eMax"
      | "overrideRadius",
    value: number | undefined,
  ) => {
    setData((prev) => ({
      ...prev,
      geometries: prev.geometries.map((g) =>
        g.id === curveId ? { ...g, [property]: value } : g,
      ),
    }));
  };

  const autoCalculateTransitions = () => {
    setData((prevData) => {
      let newSuperPoints: SuperPoint[] = [];
      let newJustifications: {
        startStation: number;
        endStation: number;
        text: string;
        curveId?: string;
      }[] = [];

      const speed = prevData.designSpeed || 80;
      const norm = prevData.norm || "DNIT";
      const transitionDispensableR = getTransitionDispensableRadius(
        speed,
        norm,
      );
      const superDispensableR = getSuperelevationDispensableRadius(speed, norm);
      const eMax = prevData.eMax || 8;

      const curves = prevData.geometries.filter((g) => g.type === "Curve");

      const curveTransitions = curves.map((curve) => {
        const radius =
          curve.overrideRadius ??
          (curve.radius ? Math.abs(curve.radius) : 1200);
        const cSpeed = curve.designSpeed ?? speed;
        const cEmax = curve.eMax ?? eMax;
        const cDistAxis = curve.distAxis ?? (prevData.distAxis || 7.2);

        const cLaneWidth = curve.laneWidth ?? (prevData.laneWidth || 3.6);
        const params = calculateCurveParams(
          radius,
          cSpeed,
          norm,
          cEmax,
          cDistAxis,
          cLaneWidth,
        );

        const cSuperDispensableR = getSuperelevationDispensableRadius(
          cSpeed,
          norm,
        );
        let rawSuperPct = radius > cSuperDispensableR ? 1.5 : params.superCalc;

        let superPct = rawSuperPct;
        let isSuperRounded = false;
        if (rawSuperPct < 2.0 && rawSuperPct > 0) {
          superPct = 2.0;
          isSuperRounded = true;
        }

        let L_ramp_adjusted = params.L_ramp;
        if (isSuperRounded) {
          L_ramp_adjusted = Math.ceil(
            (cDistAxis * params.bw * superPct) / params.r_max_percent,
          );
        }

        // Transição Adotada will ALWAYS use T. Rampa (L_ramp_adjusted) compared against L_minAbs, rounded UP to a multiple of 10
        const calcTrans = Math.max(L_ramp_adjusted, params.L_minAbs);
        const adoptedTransition = Math.ceil(calcTrans / 10) * 10;

        const gIdx = prevData.geometries.findIndex((g) => g.id === curve.id);

        const prevAdj = getAdjacentGeometry(prevData.geometries, gIdx, "prev");
        const prevG = prevAdj?.type === "Spiral" ? prevAdj : null;

        const nextAdj = getAdjacentGeometry(prevData.geometries, gIdx, "next");
        const nextG = nextAdj?.type === "Spiral" ? nextAdj : null;

        const hasSpiralBefore = !!prevG;
        const hasSpiralAfter = !!nextG;

        let stNormal1, stZero1, stSym1, stMax1;
        let stMax2, stSym2, stZero2, stNormal2;

        if (hasSpiralBefore) {
          const Ls = prevG.endStation - prevG.startStation;
          stNormal1 = prevG.startStation;
          stMax1 = prevG.endStation;

          const totalChange = superPct + 2.0; // From -2.0 to superPct
          const rate = totalChange / Ls;
          const distFromNormalToZero = 2.0 / rate;
          const distFromZeroToSym = 2.0 / rate;

          stZero1 = stNormal1 + distFromNormalToZero;
          stSym1 = stZero1 + distFromZeroToSym;
        } else {
          const lInCurve = adoptedTransition * 0.4;
          const lInTangent = adoptedTransition * 0.6;

          const rate = superPct / adoptedTransition;
          const distFromZeroToNormal = 2.0 / rate;

          stMax1 = curve.startStation + lInCurve;
          stZero1 = curve.startStation - lInTangent;
          stNormal1 = stZero1 - distFromZeroToNormal;
          stSym1 = stZero1 + distFromZeroToNormal;
        }

        if (hasSpiralAfter) {
          const Ls = nextG.endStation - nextG.startStation;
          stMax2 = nextG.startStation;
          stNormal2 = nextG.endStation;

          const totalChange = superPct + 2.0; // From superPct down to -2.0
          const rate = totalChange / Ls;
          const distFromMaxToSym = (superPct - 2.0) / rate;
          const distFromSymToZero = 2.0 / rate;

          stSym2 = stMax2 + distFromMaxToSym;
          stZero2 = stSym2 + distFromSymToZero;
        } else {
          const lInCurve = adoptedTransition * 0.4;
          const lInTangent = adoptedTransition * 0.6;

          const rate = superPct / adoptedTransition;
          const distFromZeroToNormal = 2.0 / rate;

          stMax2 = curve.endStation - lInCurve;
          stZero2 = curve.endStation + lInTangent;
          stNormal2 = stZero2 + distFromZeroToNormal;
          stSym2 = stZero2 - distFromZeroToNormal;
        }

        return {
          curve,
          radius,
          superPct,
          adoptedTransition,
          stNormal1,
          stZero1,
          stSym1,
          stMax1,
          stMax2,
          stSym2,
          stZero2,
          stNormal2,
          hasSpiralBefore,
          hasSpiralAfter,
          superDispensableR,
          transitionDispensableR,
        };
      });

      // Filter transitions for overlaps
      for (let i = 0; i < curveTransitions.length; i++) {
        const ct = curveTransitions[i];

        const prevCt = i > 0 ? curveTransitions[i - 1] : null;
        const nextCt =
          i < curveTransitions.length - 1 ? curveTransitions[i + 1] : null;

        const isSameDirectionWithPrev =
          prevCt && ct.curve.rot === prevCt.curve.rot;
        const isSameDirectionWithNext =
          nextCt && ct.curve.rot === nextCt.curve.rot;

        const tangentPrev = prevCt
          ? ct.curve.startStation - prevCt.curve.endStation
          : Infinity;
        const tangentNext = nextCt
          ? nextCt.curve.startStation - ct.curve.endStation
          : Infinity;

        let overlapPrev = false;
        let overlapNext = false;

        if (prevCt) {
          if (isSameDirectionWithPrev && tangentPrev >= 0 && tangentPrev < 400)
            overlapPrev = true;
          if (!isSameDirectionWithPrev && ct.stNormal1 <= prevCt.stNormal2)
            overlapPrev = true;
        }

        if (nextCt) {
          if (isSameDirectionWithNext && tangentNext >= 0 && tangentNext < 400)
            overlapNext = true;
          if (!isSameDirectionWithNext && nextCt.stNormal1 <= ct.stNormal2) {
            overlapNext = true;
            const offsetMeters = Math.abs(tangentNext / 2).toFixed(2);
            newJustifications.push({
              startStation: ct.curve.endStation,
              endStation: nextCt.curve.startStation,
              text: `Curvas Reversas: Aplicado offset de ${offsetMeters}m para cada lado atendendo a transição necessária para o giro`,
              curveId: ct.curve.id,
            });
          }
        }

        const curve = ct.curve;
        const isRamo = prevData.trackType === "Ramo";
        const isLeftCurve = curve.rot === "ccw";

        let targetLeftSlope = isLeftCurve ? -ct.superPct : ct.superPct;
        let targetRightSlope = isLeftCurve ? ct.superPct : -ct.superPct;

        if (!overlapPrev) {
          if (isRamo) {
            // For Ramo, both lanes rotate as a direct single plane.
            // We just show one single line for the whole slope.
            const targetLane = prevData.ramoAxis === "right" ? "left" : "right";
            newSuperPoints.push({
              id: `auto_${curve.id}_${targetLane}0`,
              station: ct.stNormal1,
              slope: -2.0,
              lane: targetLane,
              type: "Normal",
            });
          } else {
            // Coroado original
            // Left
            newSuperPoints.push({
              id: `auto_${curve.id}_l0`,
              station: ct.stNormal1,
              slope: -2.0,
              lane: "left",
              type: "Normal",
            });
            if (ct.radius <= ct.superDispensableR) {
              newSuperPoints.push({
                id: `auto_${curve.id}_l1`,
                station: ct.stZero1,
                slope: isLeftCurve ? -2.0 : 0.0,
                lane: "left",
                type: ct.hasSpiralBefore ? "TE" : "Zero",
              });
              if (ct.superPct >= 2.0)
                newSuperPoints.push({
                  id: `auto_${curve.id}_l1_5`,
                  station: ct.stSym1,
                  slope: isLeftCurve ? -2.0 : 2.0,
                  lane: "left",
                  type: "Symmetry",
                });
            }
            // Right
            newSuperPoints.push({
              id: `auto_${curve.id}_r0`,
              station: ct.stNormal1,
              slope: -2.0,
              lane: "right",
              type: "Normal",
            });
            if (ct.radius <= ct.superDispensableR) {
              newSuperPoints.push({
                id: `auto_${curve.id}_r1`,
                station: ct.stZero1,
                slope: isLeftCurve ? 0.0 : -2.0,
                lane: "right",
                type: ct.hasSpiralBefore ? "TE" : "Zero",
              });
              if (ct.superPct >= 2.0)
                newSuperPoints.push({
                  id: `auto_${curve.id}_r1_5`,
                  station: ct.stSym1,
                  slope: isLeftCurve ? 2.0 : -2.0,
                  lane: "right",
                  type: "Symmetry",
                });
            }
          }
        }

        // The Max points
        if (ct.radius <= ct.superDispensableR) {
          let actualStMax1 = ct.stMax1;
          let actualStMax2 = ct.stMax2;

          if (
            overlapPrev &&
            prevCt &&
            !isSameDirectionWithPrev &&
            !ct.hasSpiralBefore &&
            !prevCt.hasSpiralAfter
          ) {
            const stZero = prevCt.curve.endStation + tangentPrev / 2;
            actualStMax1 = stZero + ct.adoptedTransition;
          }
          if (
            overlapNext &&
            nextCt &&
            !isSameDirectionWithNext &&
            !ct.hasSpiralAfter &&
            !nextCt.hasSpiralBefore
          ) {
            const stZero = ct.curve.endStation + tangentNext / 2;
            actualStMax2 = stZero - ct.adoptedTransition;
          }

          if (isRamo) {
            const targetLane = prevData.ramoAxis === "right" ? "left" : "right";
            const targetSlope =
              targetLane === "left" ? targetLeftSlope : targetRightSlope;
            newSuperPoints.push({
              id: `auto_${curve.id}_${targetLane}2`,
              station: actualStMax1,
              slope: targetSlope,
              lane: targetLane,
              type: ct.hasSpiralBefore ? "EC" : "Max",
            });
            newSuperPoints.push({
              id: `auto_${curve.id}_${targetLane}3`,
              station: actualStMax2,
              slope: targetSlope,
              lane: targetLane,
              type: ct.hasSpiralAfter ? "CE" : "Max",
            });
          } else {
            newSuperPoints.push({
              id: `auto_${curve.id}_l2`,
              station: actualStMax1,
              slope: targetLeftSlope,
              lane: "left",
              type: ct.hasSpiralBefore ? "EC" : "Max",
            });
            newSuperPoints.push({
              id: `auto_${curve.id}_r2`,
              station: actualStMax1,
              slope: targetRightSlope,
              lane: "right",
              type: ct.hasSpiralBefore ? "EC" : "Max",
            });

            newSuperPoints.push({
              id: `auto_${curve.id}_l3`,
              station: actualStMax2,
              slope: targetLeftSlope,
              lane: "left",
              type: ct.hasSpiralAfter ? "CE" : "Max",
            });
            newSuperPoints.push({
              id: `auto_${curve.id}_r3`,
              station: actualStMax2,
              slope: targetRightSlope,
              lane: "right",
              type: ct.hasSpiralAfter ? "CE" : "Max",
            });
          }
        } else {
          newJustifications.push({
            startStation: curve.startStation,
            endStation: curve.endStation,
            text: "Dispensa de Super. (Norma) - Mantida contra-superelevação a -2% / Coroamento normal",
            curveId: curve.id,
          });
        }

        if (!overlapNext) {
          if (isRamo) {
            const targetLane = prevData.ramoAxis === "right" ? "left" : "right";
            newSuperPoints.push({
              id: `auto_${curve.id}_${targetLane}5`,
              station: ct.stNormal2,
              slope: -2.0,
              lane: targetLane,
              type: "Normal",
            });
          } else {
            // Left
            if (ct.radius <= ct.superDispensableR) {
              if (ct.superPct >= 2.0)
                newSuperPoints.push({
                  id: `auto_${curve.id}_l3_5`,
                  station: ct.stSym2,
                  slope: isLeftCurve ? -2.0 : 2.0,
                  lane: "left",
                  type: "Symmetry",
                });
              newSuperPoints.push({
                id: `auto_${curve.id}_l4`,
                station: ct.stZero2,
                slope: isLeftCurve ? -2.0 : 0.0,
                lane: "left",
                type: ct.hasSpiralAfter ? "ET" : "Zero",
              });
            }
            newSuperPoints.push({
              id: `auto_${curve.id}_l5`,
              station: ct.stNormal2,
              slope: -2.0,
              lane: "left",
              type: "Normal",
            });
            // Right
            if (ct.radius <= ct.superDispensableR) {
              if (ct.superPct >= 2.0)
                newSuperPoints.push({
                  id: `auto_${curve.id}_r3_5`,
                  station: ct.stSym2,
                  slope: isLeftCurve ? 2.0 : -2.0,
                  lane: "right",
                  type: "Symmetry",
                });
              newSuperPoints.push({
                id: `auto_${curve.id}_r4`,
                station: ct.stZero2,
                slope: isLeftCurve ? 0.0 : -2.0,
                lane: "right",
                type: ct.hasSpiralAfter ? "ET" : "Zero",
              });
            }
            newSuperPoints.push({
              id: `auto_${curve.id}_r5`,
              station: ct.stNormal2,
              slope: -2.0,
              lane: "right",
              type: "Normal",
            });
          }
        } else if (isSameDirectionWithNext && nextCt) {
          // Transition to the next curve's superelevation over the exit transition (Spiral or equivalent)
          const nextTargetLeft =
            nextCt.curve.rot === "ccw" ? -nextCt.superPct : nextCt.superPct;
          const nextTargetRight =
            nextCt.curve.rot === "ccw" ? nextCt.superPct : -nextCt.superPct;

          // For spiral, stNormal2 is the end of the spiral. For tangent transition, it's the end of transition.
          const transitionEndStation = ct.stNormal2;

          if (isRamo) {
            const targetLane = prevData.ramoAxis === "right" ? "left" : "right";
            const targetSlope =
              targetLane === "left" ? nextTargetLeft : nextTargetRight;
            newSuperPoints.push({
              id: `auto_${curve.id}_${targetLane}5_overlap`,
              station: transitionEndStation,
              slope: targetSlope,
              lane: targetLane,
              type: "Overlap",
            });
          } else {
            newSuperPoints.push({
              id: `auto_${curve.id}_l5_overlap`,
              station: transitionEndStation,
              slope: nextTargetLeft,
              lane: "left",
              type: "Overlap",
            });
            newSuperPoints.push({
              id: `auto_${curve.id}_r5_overlap`,
              station: transitionEndStation,
              slope: nextTargetRight,
              lane: "right",
              type: "Overlap",
            });
          }

          newJustifications.push({
            startStation: ct.curve.endStation,
            endStation: nextCt.curve.startStation,
            text: "Curvas Mesmo Sentido: Tangente curta (<400m), super transita na espiral e se mantém até a próxima curva.",
            curveId: curve.id,
          });
        }
      }

      if (prevData.geometries.length > 0) {
        const startSt = prevData.geometries[0].startStation;
        let pStart = newSuperPoints.find((p) => p.station <= startSt + 0.1);
        if (!pStart) {
          if (prevData.trackType === "Ramo") {
            const targetLane = prevData.ramoAxis === "right" ? "left" : "right";
            newSuperPoints.push({
              id: `start_${targetLane}`,
              station: startSt,
              slope: -2.0,
              lane: targetLane,
              type: "Normal",
            });
          } else {
            newSuperPoints.push({
              id: "start_l",
              station: startSt,
              slope: -2.0,
              lane: "left",
              type: "Normal",
            });
            newSuperPoints.push({
              id: "start_r",
              station: startSt,
              slope: -2.0,
              lane: "right",
              type: "Normal",
            });
          }
        }

        const endSt =
          prevData.geometries[prevData.geometries.length - 1].endStation;
        let pEnd = newSuperPoints.find((p) => p.station >= endSt - 0.1);
        if (!pEnd) {
          if (prevData.trackType === "Ramo") {
            const targetLane = prevData.ramoAxis === "right" ? "left" : "right";
            newSuperPoints.push({
              id: `end_${targetLane}`,
              station: endSt,
              slope: -2.0,
              lane: targetLane,
              type: "Normal",
            });
          } else {
            newSuperPoints.push({
              id: "end_l",
              station: endSt,
              slope: -2.0,
              lane: "left",
              type: "Normal",
            });
            newSuperPoints.push({
              id: "end_r",
              station: endSt,
              slope: -2.0,
              lane: "right",
              type: "Normal",
            });
          }
        }
      }

      // Sort by station
      newSuperPoints.sort((a, b) => a.station - b.station);

      return {
        ...prevData,
        superPoints: newSuperPoints,
        justifications: newJustifications,
      };
    });
  };

  const handlePointMove = (
    id: string,
    newStation: number,
    newSlope: number,
  ) => {
    setData((prevData) => {
      const newPoints = prevData.superPoints.map((p) => {
        if (p.id === id) {
          return { ...p, station: newStation, slope: newSlope };
        }
        return p;
      });
      return { ...prevData, superPoints: newPoints };
    });
  };

  const handlePointAdd = (pointData: Omit<SuperPoint, "id">) => {
    setData((prevData) => {
      const newPoint: SuperPoint = {
        id: `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        ...pointData,
      };
      const newPoints = [...prevData.superPoints, newPoint].sort(
        (a, b) => a.station - b.station,
      );
      return { ...prevData, superPoints: newPoints };
    });
  };

  const handleGeometryClick = (geomId: string) => {
    // Se clicar no mesmo, tira o zoom. Se em outro, dá zoom no outro.
    setZoomedGeometryId((prev) => (prev === geomId ? null : geomId));
  };

  const handleFileLoaded = (xmlContent: string) => {
    const parsedAlignments = parseLandXML(xmlContent);
    if (parsedAlignments && parsedAlignments.length > 0) {
      // Load the first alignment found
      setData(parsedAlignments[0]);
      setZoomedGeometryId(null);
      setAppMode("alignment");
    } else {
      alert("Nenhum dado de Superelevação / Eixo encontrado no arquivo XML.");
    }
  };

  const handleCalculateSpirals = () => {
    const lines = radiiInput.split("\n");
    const radii = lines
      .map((l) => parseFloat(l.trim().replace(",", ".")))
      .filter((r) => !isNaN(r) && r > 0);
    if (radii.length === 0) {
      alert("Por favor, insira pelo menos um raio válido. 1 raio por linha.");
      return;
    }

    const geometries: any[] = [];
    let currentStation = 0;

    radii.forEach((r, idx) => {
      // Create a tangent before
      geometries.push({
        id: `t_${idx}`,
        type: "Tangent",
        startStation: currentStation,
        endStation: currentStation + 100,
        name: `Tangente ${idx + 1}`,
      });
      currentStation += 100;

      // Create the curve
      geometries.push({
        id: `c_${idx}`,
        type: "Curve",
        startStation: currentStation,
        endStation: currentStation + 100,
        name: `Curva ${idx + 1}`,
        radius: r,
        rot: "cw",
      });
      currentStation += 100;
    });

    // Final tangent
    geometries.push({
      id: `t_final`,
      type: "Tangent",
      startStation: currentStation,
      endStation: currentStation + 100,
      name: `Tangente Final`,
    });

    const newAlignment: AlignmentData = {
      name: "Calculadora de Espirais (Sem Eixo)",
      geometries,
      superPoints: [],
    };

    setData(newAlignment);
    setAppMode("calculator");
    setShowCalculatorModal(false);
    setActiveTab("planilha");
    setZoomedGeometryId(null);
  };

  return (
    <div className="h-full bg-slate-100 text-slate-800 flex flex-col font-sans overflow-hidden">
      {showCloseConfirm && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowCloseConfirm(false)}
        >
          <div
            className="bg-white border border-slate-300 p-5 rounded-lg shadow-xl outline-none w-[400px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-slate-800 font-medium mb-4">Atenção</h3>
            <p className="text-slate-500 text-sm mb-6">
              Você possui alterações na superelevação que não foram salvas. Deseja salvar antes de sair?
            </p>
            <div className="flex justify-end gap-3 font-sans">
              <button
                className="px-4 py-2 rounded text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 transition"
                onClick={() => {
                  setShowCloseConfirm(false);
                  onClose();
                }}
              >
                Sair sem Salvar
              </button>
              <button
                className="px-4 py-2 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition flex items-center gap-2"
                onClick={() => {
                  setShowCloseConfirm(false);
                  handleSave();
                }}
              >
                Salvar e Sair
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Calculator Modal Overlay */}
      {showCalculatorModal && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-white/50 backdrop-blur-sm"
          onClick={() => setShowCalculatorModal(false)}
        >
          <div
            className="bg-slate-50 border border-slate-300 p-5 rounded-lg shadow-xl outline-none w-[400px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-medium mb-4">Calcular Espirais</h3>
            <p className="text-slate-500 text-sm mb-4">
              Insira os raios das curvas (um por linha) para preencher a
              planilha e descobrir a transição adotada.
            </p>
            <textarea
              className="w-full h-40 bg-white border border-slate-600 rounded px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-600 font-mono mb-6"
              placeholder="Exemplo:&#10;200&#10;1000&#10;550"
              value={radiiInput}
              onChange={(e) => setRadiiInput(e.target.value)}
            />
            <div className="flex justify-end gap-3 font-sans">
              <button
                className="px-4 py-2 rounded text-xs font-medium text-slate-700 border border-slate-600 hover:bg-slate-100 transition"
                onClick={() => setShowCalculatorModal(false)}
              >
                Cancelar
              </button>
              <button
                className="px-4 py-2 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition flex items-center gap-2"
                onClick={handleCalculateSpirals}
              >
                <Calculator className="w-3.5 h-3.5" /> Calcular
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Visualizador de Superelevação
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-300 rounded-md hover:bg-slate-100 text-sm text-blue-600 font-medium transition"
            onClick={() => setShowCalculatorModal(true)}
          >
            <Calculator className="w-4 h-4" /> Calcular Espirais
          </button>
          <div className="text-sm font-mono text-slate-500 bg-slate-50 px-3 py-1 rounded-md hidden md:block">
            Eixo atual:{" "}
            <span className="text-blue-600 font-semibold">{data.name}</span>
          </div>
          <FileUploader
            onFileLoaded={handleFileLoaded}
            className="p-2 border border-slate-300 bg-slate-50 rounded-md hover:bg-slate-100 cursor-pointer flex flex-row items-center gap-2 max-w-[200px]"
          />
          <div className="w-px h-6 bg-slate-100 mx-1 hidden md:block"></div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCloseConfirm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 text-sm font-medium transition"
            >
              <X className="w-4 h-4" /> Cancelar
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white border border-emerald-600 rounded-md hover:bg-emerald-500 text-sm font-medium transition"
            >
              <Save className="w-4 h-4" /> Salvar Superelevação
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto custom-scrollbar min-h-0">
        {/* Top Panel: Calculation Table / Memoria */}
        <div
          className={`w-full shrink-0 flex flex-col ${appMode === "calculator" ? "flex-1" : "h-[45vh] min-h-[300px]"}`}
        >
          <div className="flex bg-white border-b border-slate-300/50 rounded-t-lg shrink-0 w-full justify-between">
            <div className="flex">
            <button
              onClick={() => setActiveTab("planilha")}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${activeTab === "planilha" ? "border-b-2 border-blue-600 text-blue-600 bg-slate-50" : "text-slate-500 hover:text-slate-700"}`}
            >
              <TableProperties className="w-4 h-4" /> Planilha
            </button>
            <button
              onClick={() => setActiveTab("memoria")}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${activeTab === "memoria" ? "border-b-2 border-blue-600 text-blue-600 bg-slate-50" : "text-slate-500 hover:text-slate-700"}`}
            >
              <FileText className="w-4 h-4" /> Memória de Cálculo
            </button>
            <button
              onClick={() => setActiveTab("normativas")}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${activeTab === "normativas" ? "border-b-2 border-blue-600 text-blue-600 bg-slate-50" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Scale className="w-4 h-4" /> Normativas
            </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                <Save className="w-4 h-4" /> Salvar
              </button>
              <button
                onClick={() => setShowCloseConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
              >
                <X className="w-4 h-4" /> Fechar Módulo
              </button>
            </div>
          </div>
          {activeTab === "planilha" ? (
            <div className="flex-1 overflow-hidden relative bg-white border-x border-b border-slate-300 rounded-b-lg">
              <CalculationTable
                data={data}
                updateTrackType={updateTrackType}
                updateRamoAxis={updateRamoAxis}
                updateDesignSpeed={updateDesignSpeed}
                updateLaneWidth={updateLaneWidth}
                updateNorm={updateNorm}
                updateDistAxis={updateDistAxis}
                updateEmax={updateEmax}
                updateCurveConfig={updateCurveConfig}
                zoomedGeometryId={zoomedGeometryId}
                onGeometryClick={handleGeometryClick}
              />
            </div>
          ) : activeTab === "memoria" ? (
            <div className="flex-1 overflow-y-auto bg-white border-x border-b border-slate-300 rounded-b-lg custom-scrollbar">
              <CalculoMemoria data={data} zoomedGeometryId={zoomedGeometryId} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto bg-white border-x border-b border-slate-300 rounded-b-lg custom-scrollbar">
              <NormativasView data={data} zoomedGeometryId={zoomedGeometryId} />
            </div>
          )}
        </div>

        {/* Middle Panel: Plan View */}
        {appMode !== "calculator" && (
          <div className="w-full shrink-0 h-72 bg-white border border-slate-200 rounded-lg shadow-lg flex flex-col relative overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center z-10 w-full relative">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                Alinhamento em Planta
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setShowVerification(true)}
                  className="flex items-center gap-2 bg-slate-100 hover:bg-slate-600 border border-slate-600 text-white text-xs px-3 py-1.5 rounded transition-colors"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                  Verificar Normativas
                </button>
                <button
                  onClick={autoCalculateTransitions}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded transition-colors"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  Recalcular Todo o Gráfico
                </button>
              </div>
            </div>
            <div className="flex-1 relative">
              <PlanView
                data={data}
                zoomedGeometryId={zoomedGeometryId}
                onGeometryClick={handleGeometryClick}
                hoveredStation={hoveredStation}
                onHoverStation={setHoveredStation}
              />
            </div>
          </div>
        )}

        {/* Chart Area */}
        {appMode !== "calculator" && (
          <div className="w-full flex-1 bg-white border border-slate-200 rounded-lg shadow-lg flex flex-col relative min-h-[400px]">
            {/* Chart Canvas */}
            <div className="flex-1 relative w-full overflow-hidden flex flex-col">
              <SuperelevationChart
                data={data}
                zoomedGeometryId={zoomedGeometryId}
                onGeometryClick={handleGeometryClick}
                onPointMove={handlePointMove}
                onPointAdd={handlePointAdd}
                hoveredStation={hoveredStation}
                onHoverStation={setHoveredStation}
                onShowJustification={(curveId) => {
                  if (curveId) handleGeometryClick(curveId);
                  setActiveTab("memoria");
                }}
              />
            </div>
          </div>
        )}
      </main>
      {showVerification && (
        <VerificationModal
          data={data}
          onClose={() => setShowVerification(false)}
        />
      )}
    </div>
  );
}
