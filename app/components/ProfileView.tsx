import { AciColorPicker } from "./AciColorPicker";
import React, { useRef, useEffect, useState } from "react";
import { useStore, flushTemporalHistory } from "../store";
import { Activity, Magnet, ChevronDown, Ruler } from "lucide-react";
import { createDefaultDataFromAlignment } from "../superelevation/SuperelevationPanel";
import { Alignment3D } from "../lib/alignment";

function EditPIVModal({
  alignment,
  piIndex,
  initialSta,
  initialElev,
  initialL,
  initialK,
  onClose,
}: {
  alignment: Alignment3D;
  piIndex: number;
  initialSta: number;
  initialElev: number;
  initialL?: number;
  initialK?: number;
  onClose: () => void;
}) {
  const [sta, setSta] = useState(initialSta.toFixed(2));
  const [elev, setElev] = useState(initialElev.toFixed(2));
  const [l, setL] = useState(initialL ? initialL.toFixed(2) : "");
  const [k, setK] = useState(initialK ? initialK.toFixed(2) : "");

  const [gradeInInput, setGradeInInput] = useState("");
  const [gradeOutInput, setGradeOutInput] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const pivs = alignment.keyProfilePoints.filter((p) =>
    ["PP", "PIV", "PF"].includes(p.label || "")
  );

  const prevPiv = piIndex > 0 ? pivs[piIndex - 1] : null;
  const nextPiv = piIndex < pivs.length - 1 ? pivs[piIndex + 1] : null;

  const currentSta = parseFloat(sta) || 0;
  const currentElev = parseFloat(elev) || 0;

  const gradeIn =
    prevPiv && currentSta - prevPiv.sta !== 0
      ? ((currentElev - prevPiv.elev) / (currentSta - prevPiv.sta)) * 100
      : 0;

  const [nextElevState, setNextElevState] = useState<number | null>(null);

  const gradeOut =
    nextPiv && nextPiv.sta - currentSta !== 0
      ? (((nextElevState !== null ? nextElevState : nextPiv.elev) - currentElev) / (nextPiv.sta - currentSta)) * 100
      : 0;

  useEffect(() => {
    if (focusedField !== "gradeIn") {
      setGradeInInput(gradeIn.toFixed(2));
    }
  }, [gradeIn, focusedField]);

  useEffect(() => {
    if (focusedField !== "gradeOut") {
      setGradeOutInput(gradeOut.toFixed(2));
    }
  }, [gradeOut, focusedField]);

  const handleGradeInChange = (val: string) => {
    setGradeInInput(val);
    const gIn = parseFloat(val);
    if (!isNaN(gIn) && prevPiv) {
      const newElev = prevPiv.elev + (gIn / 100) * (currentSta - prevPiv.sta);
      if (focusedField === "gradeIn") {
        setElev(newElev.toFixed(3)); // use more decimals internally to avoid drift
      }
    }
  };

  const handleGradeOutChange = (val: string) => {
    setGradeOutInput(val);
    const gOut = parseFloat(val);
    if (!isNaN(gOut) && nextPiv) {
      // Calculate NEXT PIV's elevation based on current elevation and NEW grade out
      const newNextElev = currentElev + (gOut / 100) * (nextPiv.sta - currentSta);
      if (focusedField === "gradeOut") {
         setNextElevState(newNextElev);
      }
    }
  };

  const handleSave = () => {
    const staVal = parseFloat(sta);
    const elevVal = parseFloat(elev);
    const lVal = l ? parseFloat(l) : null;
    const kVal = k ? parseFloat(k) : null;

    if (!isNaN(staVal) && !isNaN(elevVal)) {
      useStore
        .getState()
        .updateActiveProfilePIV(
          piIndex,
          staVal,
          elevVal,
          lVal,
          kVal,
          nextElevState ?? undefined
        );
    }
    onClose();
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-100/70 z-[200]">
      <div
        className="bg-slate-50 border border-slate-300 p-6 rounded-md shadow-xl max-w-lg w-full flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-slate-800 font-medium text-lg border-b border-slate-300 pb-2">
          Editar Características do PIV
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-500">Estaca (m)</label>
            <input
              type="number"
              value={sta}
              onChange={(e) => setSta(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-800 outline-none focus:border-amber-600 transition-colors"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-500">Cota (m)</label>
            <input
              type="number"
              value={elev}
              onChange={(e) => setElev(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-800 outline-none focus:border-amber-600 transition-colors"
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {prevPiv && (
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-500">Rampa Anterior (%)</label>
              <input
                type="number"
                value={gradeInInput}
                onChange={(e) => handleGradeInChange(e.target.value)}
                onFocus={() => setFocusedField("gradeIn")}
                onBlur={() => setFocusedField(null)}
                step="0.1"
                className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-800 outline-none focus:border-amber-600 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === "Escape") onClose();
                  if (e.key === "Enter") handleSave();
                }}
              />
            </div>
          )}

          {nextPiv && (
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-500">Rampa Posterior (%)</label>
              <input
                type="number"
                value={gradeOutInput}
                onChange={(e) => handleGradeOutChange(e.target.value)}
                onFocus={() => setFocusedField("gradeOut")}
                onBlur={() => setFocusedField(null)}
                step="0.1"
                className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-800 outline-none focus:border-amber-600 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === "Escape") onClose();
                  if (e.key === "Enter") handleSave();
                }}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-500">Comprimento da Curva (L)</label>
            <input
              type="number"
              value={l}
              onChange={(e) => {
                setL(e.target.value);
                if (e.target.value) setK("");
              }}
              placeholder="Exemplo: 200"
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-800 outline-none focus:border-amber-600 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-500">Valor K (Raio / 100)</label>
            <input
              type="number"
              value={k}
              onChange={(e) => {
                setK(e.target.value);
                if (e.target.value) setL("");
              }}
              placeholder="Exemplo: 43"
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-800 outline-none focus:border-amber-600 transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-300">
          <button
            className="px-4 py-2 rounded text-slate-700 hover:bg-slate-100 font-medium text-sm transition-colors"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm transition-colors shadow-sm"
            onClick={handleSave}
          >
            Salvar PIV
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProfileView({

  className,
  hideHeader,
}: {
  className?: string;
  hideHeader?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    station,
    surface,
    surfaces,
    alignments,
    activeAlignmentId,
    profileTransform,
    setProfileTransform,
    osnapEnabled,
    setOsnapEnabled,
    osnapConfig,
    setOsnapConfig,
    orthoModeEnabled,
    setOrthoModeEnabled,
  } = useStore();
  const alignment =
    alignments.find((a) => a.id === activeAlignmentId) ||
    (alignments.length > 0 ? alignments[0] : null);
  const [dimensions, setDimensions] = useState({ w: 400, h: 200 });

  // Transform State for Pan/Zoom
  const [localDy, setLocalDy] = useState(0);
  const transform = {
    scale: profileTransform.k,
    dx: profileTransform.x,
    dy: localDy,
  };

  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [fitTrigger, setFitTrigger] = useState(0);
  const [osnapMenuOpen, setOsnapMenuOpen] = useState(false);

  // Reset view on trigger
  useEffect(() => {
    // Only reset if actually triggered
    if (fitTrigger > 0) {
      setLocalDy(0);
      import("d3").then((d3) => {
        setProfileTransform(d3.zoomIdentity);
      });
    }
  }, [fitTrigger, setProfileTransform]);

  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    import("d3").then((d3) => {
      const newScale = transform.scale * zoomFactor;
      const newDx = mx - (mx - transform.dx) * zoomFactor;
      const newDy = my - (my - transform.dy) * zoomFactor;
      setLocalDy(newDy);
      setProfileTransform(d3.zoomIdentity.translate(newDx, 0).scale(newScale));
    });
  };

  const [draggedPIV, setDraggedPIV] = useState<{ index: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggedPIV(null);
    flushTemporalHistory();
  };

  const [crosshairPos, setCrosshairPos] = useState<{sta: number, elev: number, isSnapped?: boolean}>({ sta: 0, elev: 0 });
  const [pendingProfileCurve, setPendingProfileCurve] = useState<{piIndex: number, currentLength: number} | null>(null);
  const [editingPIV, setEditingPIV] = useState<{piIndex: number, sta: number, elev: number, l?: number, k?: number} | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  const scaleRef = useRef({ minElev: 0, elevRange: 1, PROFILE_CANVAS_H: 200 });

  const getStationElevation = (mx: number, my: number) => {
    const startSta = alignment && alignment.points.length > 0 ? alignment.points[0].sta : 0;
    const endSta = alignment && alignment.points.length > 0 ? alignment.points[alignment.points.length - 1].sta : 1000;
    const maxSta = endSta - startSta || 1;
    const marginX = 60;
    const innerW = dimensions.w - marginX * 2;
    
    let appliedMx = mx;
    let appliedMy = my;

    const store = useStore.getState();
    const isDrawing = store.interactionMode === "draw_profile_pvi" || store.interactionMode === "extend_profile";
    const isDrawingLine = store.interactionMode === "draw_profile_line";
    const tempPIVs = store.tempProfilePIVs;
    const { minElev, elevRange, PROFILE_CANVAS_H } = scaleRef.current;

    const getScreenX = (s: number) => {
       return ((s - startSta) / maxSta) * innerW * transform.scale + transform.dx + marginX;
    };
    const getScreenY = (e: number) => {
       return (PROFILE_CANVAS_H - ((e - minElev) / (elevRange || 1)) * PROFILE_CANVAS_H) * transform.scale + transform.dy;
    };

    // ORTHOMODE
    let orthoLockedX = false;
    let orthoLockedY = false;
    let refPtSta = 0;
    let refPtElev = 0;

    if (store.orthoModeEnabled) {
      let refPt = null;
      if (isDrawing && tempPIVs.length > 0) {
        refPt = tempPIVs[tempPIVs.length - 1];
      } else if (isDrawingLine && store.pendingProfileLineStart) {
        refPt = store.pendingProfileLineStart;
      }

      if (refPt) {
        refPtSta = refPt.sta;
        refPtElev = refPt.elev;
        const refX = getScreenX(refPt.sta);
        const refY = getScreenY(refPt.elev);
        
        if (Math.abs(mx - refX) > Math.abs(my - refY)) {
          appliedMy = refY;
          orthoLockedY = true;
        } else {
          appliedMx = refX;
          orthoLockedX = true;
        }
      }
    }

    let sta = startSta + ((appliedMx - marginX - transform.dx) / (innerW * transform.scale)) * maxSta;
    let elev = minElev + (1 - (appliedMy - transform.dy) / (transform.scale * PROFILE_CANVAS_H)) * elevRange;
    
    // OSNAP
    let isSnapped = false;
    if (store.osnapEnabled) {
      let closestDist = Infinity;
      let closestSta = sta;
      let closestElev = elev;
      const snapRadius = 20; // pixels

      if (store.osnapConfig.endpoint) {
        // Snap to points of ALL alignments (outros perfis)
        const snapPoints: {sta: number, elev: number}[] = [];
        store.alignments.forEach(a => {
          if (a.keyProfilePoints) {
             a.keyProfilePoints.forEach(p => {
               if (p.sta !== undefined && p.elev !== undefined) snapPoints.push({sta: p.sta, elev: p.elev});
             });
          }
        });
        tempPIVs.forEach(p => snapPoints.push(p));
        
        snapPoints.forEach(pt => {
           const sx = getScreenX(pt.sta);
           const sy = getScreenY(pt.elev);
           // Calculate distance to raw mouse, so hover works intuitively even with ORTHO
           const dist = Math.hypot(mx - sx, my - sy);
           if (dist < snapRadius && dist < closestDist) {
              closestDist = dist;
              closestSta = pt.sta;
              closestElev = pt.elev;
              isSnapped = true;
           }
        });
      }
      
      // Snap to Profile Lines
      store.profileLines.forEach(line => {
         const sx1 = getScreenX(line.p1.sta);
         const sy1 = getScreenY(line.p1.elev);
         const sx2 = getScreenX(line.p2.sta);
         const sy2 = getScreenY(line.p2.elev);

         // Endpoint snap
         if (store.osnapConfig.endpoint) {
             [ {sta: line.p1.sta, elev: line.p1.elev, sx: sx1, sy: sy1},
               {sta: line.p2.sta, elev: line.p2.elev, sx: sx2, sy: sy2} ].forEach(pt => {
                const dist = Math.hypot(mx - pt.sx, my - pt.sy);
                if (dist < snapRadius && dist < closestDist) {
                   closestDist = dist;
                   closestSta = pt.sta;
                   closestElev = pt.elev;
                   isSnapped = true;
                }
             });
         }

         // Nearest snap to the line segment
         if (store.osnapConfig.nearest || store.osnapConfig.intersection) {
            const l2 = (sx1 - sx2)**2 + (sy1 - sy2)**2;
            if (l2 !== 0) {
                let t = ((mx - sx1) * (sx2 - sx1) + (my - sy1) * (sy2 - sy1)) / l2;
                t = Math.max(0, Math.min(1, t));
                const projX = sx1 + t * (sx2 - sx1);
                const projY = sy1 + t * (sy2 - sy1);
                const dist = Math.hypot(mx - projX, my - projY);
                if (dist < snapRadius && dist < closestDist) {
                    closestDist = dist;
                    closestSta = line.p1.sta + t * (line.p2.sta - line.p1.sta);
                    closestElev = line.p1.elev + t * (line.p2.elev - line.p1.elev);
                    isSnapped = true;
                }
            }
         }
      });

      // Apply OSNAP results, respecting ORTHOMODE constraints
      if (closestDist < Infinity) {
        if (orthoLockedX) {
           sta = refPtSta; // keep X locked
           elev = closestElev; // snap Y to point
        } else if (orthoLockedY) {
           sta = closestSta; // snap X to point
           elev = refPtElev; // keep Y locked
        } else {
           sta = closestSta;
           elev = closestElev;
        }
      }
    }

    return { sta, elev, isSnapped }; 
  };

  const handleClick = (e: React.MouseEvent) => {
      const store = useStore.getState();
      if (store.interactionMode === "draw_profile_pvi" || store.interactionMode === "extend_profile") {
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const { sta, elev } = getStationElevation(mx, my);
          store.addTempProfilePIV({ sta, elev });
      } else if (store.interactionMode === "insert_pvi") {
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const { sta, elev } = getStationElevation(mx, my);
          
          if (store.activeAlignmentId) {
             const alg = store.alignments.find(a => a.id === store.activeAlignmentId);
             if (alg) {
                 const newPivs = alg.keyProfilePoints
                     .filter(p => ["PP", "PIV", "PF"].includes(p.label || ""))
                     .map(p => ({ sta: p.sta, elev: p.elev, l: p.l, k: p.k }));
                 
                 newPivs.push({ sta, elev, l: undefined, k: undefined });
                 newPivs.sort((a,b) => a.sta - b.sta);
                 
                 store.setTempProfilePIVs(newPivs);
                 store.commitTempProfile();
                 store.setInteractionMode("none");
             }
          }
      } else if (store.interactionMode === "draw_profile_line") {
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const { sta, elev } = getStationElevation(mx, my);

          if (store.activeAlignmentId) {
            if (!store.pendingProfileLineStart) {
              store.setPendingProfileLineStart({ sta, elev });
            } else {
              store.addProfileLine({
                alignmentId: store.activeAlignmentId,
                p1: { ...store.pendingProfileLineStart },
                p2: { sta, elev },
              });
              // Keep it active, chaining from the new point
              store.setPendingProfileLineStart({ sta, elev });
            }
          }
      }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      const store = useStore.getState();
      if (store.interactionMode === "draw_profile_pvi" || store.interactionMode === "extend_profile") {
          store.commitTempProfile();
      } else if (store.interactionMode === "draw_profile_line") {
          store.setPendingProfileLineStart(null);
          store.setInteractionMode("none");
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (draggedPIV !== null) {
      const { sta, elev } = getStationElevation(mx, my);
      useStore.getState().updateActiveProfilePIV(draggedPIV.index, sta, elev);
      return;
    }

    if (isDragging) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;

      setLocalDy(transform.dy + dy);
      import("d3").then((d3) => {
        setProfileTransform(
          d3.zoomIdentity
            .translate(transform.dx + dx, 0)
            .scale(transform.scale),
        );
      });

      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
    }

    if (!alignment || alignment.points.length === 0) return;

    const startSta = alignment.points[0].sta;
    const endSta = alignment.points[alignment.points.length - 1].sta;
    const maxSta = endSta - startSta || 1;

    const { sta: hoverSta, elev: hoverElev, isSnapped } = getStationElevation(mx, my);
    
    setCrosshairPos({ sta: hoverSta, elev: hoverElev, isSnapped });

    if (hoverSta >= startSta && hoverSta <= endSta) {
      useStore.getState().setStation(hoverSta);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const store = useStore.getState();
        if (store.interactionMode === "draw_profile_line") {
          store.setPendingProfileLineStart(null);
          store.setInteractionMode("none");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions((prev) => {
          if (
            prev.w === entry.contentRect.width &&
            prev.h === entry.contentRect.height
          ) {
            return prev;
          }
          return {
            w: entry.contentRect.width,
            h: entry.contentRect.height,
          };
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Generate Profile Lines
  const pointsCount = 200;
  const egPaths: Record<string, string> = {};
  let fgPath = ``;

  // Real Elevation Scanner
  const startSta =
    alignment && alignment.points.length > 0 ? alignment.points[0].sta : 0;
  const endSta =
    alignment && alignment.points.length > 0
      ? alignment.points[alignment.points.length - 1].sta
      : 1000;
  const maxSta = endSta - startSta;

  const rawData: { st: number; egs: Record<string, number | null>; fg: number | null }[] = [];

  const stasToSample = new Set<number>();
  for (let i = 0; i <= pointsCount; i++) {
    stasToSample.add(startSta + (i / pointsCount) * maxSta);
  }
  if (alignment) {
    alignment.keyProfilePoints.forEach((p) => stasToSample.add(p.sta));
    // And also horizontally important points because surface changes abruptly
    alignment.keyPoints.forEach((p) => {
      if (p.sta >= startSta && p.sta <= endSta) stasToSample.add(p.sta);
    });
  }
  const orderedStas = Array.from(stasToSample).sort((a, b) => a - b);

  const visibleSurfaces = surfaces.filter(s => s.isVisible && (s.showInProfile ?? true));
  visibleSurfaces.forEach(s => { egPaths[s.id] = ""; });

  for (const st of orderedStas) {
    const worldPt = alignment
      ? alignment.getPointAtStation(st)
      : { x: st, y: 0 };
    
    const egs: Record<string, number | null> = {};
    visibleSurfaces.forEach(s => {
      egs[s.id] = s.surface.getElevation(worldPt.x, worldPt.y);
    });

    const sFG =
      alignment && alignment.profile.length > 0
        ? alignment.getElevationAtStation(st)
        : null;
    rawData.push({ st, egs, fg: sFG });
  }

  // Dynamic scaling bounds
  const validEG = rawData
    .flatMap((d) => Object.values(d.egs))
    .filter((e) => e !== null) as number[];
  const minEG = validEG.length > 0 ? Math.min(...validEG) : Infinity;
  const maxEG = validEG.length > 0 ? Math.max(...validEG) : -Infinity;

  const validFG = rawData
    .map((d) => d.fg)
    .filter((e) => e !== null) as number[];
  const minFG = validFG.length > 0 ? Math.min(...validFG) : Infinity;
  const maxFG = validFG.length > 0 ? Math.max(...validFG) : -Infinity;

  let minElev = Math.min(minEG, minFG) - 5;
  let maxElev = Math.max(maxEG, maxFG) + 5;

  if (!isFinite(minElev)) minElev = -10;
  if (!isFinite(maxElev)) maxElev = 10;

  const elevRange = maxElev - minElev;

  const getX = (sta: number) => {
    const marginX = 60;
    const innerW = dimensions.w - marginX * 2;
    const x =
      ((sta - startSta) / (maxSta || 1)) * innerW * transform.scale +
      transform.dx +
      marginX;
    return isNaN(x) ? 0 : x;
  };
  const PROFILE_CANVAS_H =
    dimensions.h > 150 ? dimensions.h - 120 : dimensions.h;

  if (
    scaleRef.current.minElev !== minElev ||
    scaleRef.current.elevRange !== elevRange ||
    scaleRef.current.PROFILE_CANVAS_H !== PROFILE_CANVAS_H
  ) {
    scaleRef.current = { minElev, elevRange, PROFILE_CANVAS_H };
  }

  const getY = (elev: number) => {
    const y =
      (PROFILE_CANVAS_H -
        ((elev - minElev) / (elevRange || 1)) * PROFILE_CANVAS_H) *
        transform.scale +
      transform.dy;
    return isNaN(y) ? 0 : y;
  };

  const getStaFromX = (x: number) => {
    const marginX = 60;
    const innerW = dimensions.w - marginX * 2;
    return ((x - marginX - transform.dx) / (innerW * transform.scale)) * (maxSta || 1) + startSta;
  };
  
  const getElevFromY = (y: number) => {
    return minElev + (1 - (y - transform.dy) / (PROFILE_CANVAS_H * transform.scale)) * (elevRange || 1);
  };
  
  // Grid computation
  const staMinVisible = getStaFromX(0);
  const staMaxVisible = getStaFromX(dimensions.w);
  const elevMinVisible = getElevFromY(PROFILE_CANVAS_H);
  const elevMaxVisible = getElevFromY(0);
  
  const getTicks = (start: number, stop: number, count: number) => {
    if (stop <= start || count <= 0) return [];
    let step = Math.pow(10, Math.floor(Math.log10((stop - start) / count)));
    const err = (count / (stop - start)) * step;
    if (err <= 0.15) step *= 10;
    else if (err <= 0.35) step *= 5;
    else if (err <= 0.75) step *= 2;
    
    // Fallbacks
    if(step <= 0 || !isFinite(step)) step = 1;

    const min = Math.ceil(start / step) * step;
    const max = Math.floor(stop / step) * step;
    const ticks = [];
    for(let i = min; i <= max; i += step) {
        ticks.push(i);
        if(ticks.length > 200) break; // safety
    }
    return ticks;
  };

  const staTicks = getTicks(staMinVisible, staMaxVisible, Math.max(1, Math.floor(dimensions.w / 100)));
  const elevTicks = getTicks(elevMinVisible, elevMaxVisible, Math.max(1, Math.floor(PROFILE_CANVAS_H / 50)));

  for (let i = 0; i < rawData.length; i++) {
    const { st, egs, fg } = rawData[i];
    const x = getX(st);

    // EG Paths
    Object.keys(egs).forEach(id => {
      const eg = egs[id];
      if (eg !== null) {
        const egY = getY(eg);
        if (egPaths[id] === "") egPaths[id] = `M ${x} ${egY}`;
        else egPaths[id] += ` L ${x} ${egY}`;
      }
    });

    // FG Path
    if (fg !== null) {
      const fgY = getY(fg);
      if (fgPath === "") fgPath = `M ${x} ${fgY}`;
      else fgPath += ` L ${x} ${fgY}`;
    }
  }

  // Current Station Position Tracker
  let currentEGYs: {id: string, y: number, color: string}[] = [];
  let currentFGY: number | null = null;
  const currentX = getX(station);

  if (alignment) {
    const currentWorldPt = alignment.getPointAtStation(station);
    visibleSurfaces.forEach(s => {
      const curRawEG = s.surface.getElevation(currentWorldPt.x, currentWorldPt.y);
      if (curRawEG !== null) {
        currentEGYs.push({
          id: s.id,
          y: getY(curRawEG),
          color: s.profileColor || s.trianglesColor || "#22c55e"
        });
      }
    });

    if (alignment.profile.length > 0) {
      const sFG = alignment.getElevationAtStation(station);
      currentFGY = getY(sFG);
    }
  }

  // Superelevation Computations
  let superLeftPath = "";
  let superRightPath = "";
  const superData =
    alignment?.superelevationData || createDefaultDataFromAlignment(alignment);

  if (superData && dimensions.h > 150) {
    const leftPoints = superData.superPoints
      .filter((p) => p.lane === "left")
      .sort((a, b) => a.station - b.station);
    const rightPoints = superData.superPoints
      .filter((p) => p.lane === "right")
      .sort((a, b) => a.station - b.station);

    const SUPER_AREA_H = 100;
    const midSuperY = dimensions.h - SUPER_AREA_H / 2 - 10;
    const maxSlope = Math.max(
      8,
      ...superData.superPoints.map((p) => Math.abs(p.slope)),
    );

    const getSuperY = (slope: number) => {
      // slope maps from -maxSlope to +maxSlope (bottom is negative, top is positive depending on standard, usually top is positive curve)
      return midSuperY - (slope / maxSlope) * (SUPER_AREA_H / 2 - 10);
    };

    leftPoints.forEach((p, idx) => {
      const x = getX(p.station);
      const y = getSuperY(p.slope);
      if (idx === 0) superLeftPath += `M ${x} ${y}`;
      else superLeftPath += ` L ${x} ${y}`;
    });

    rightPoints.forEach((p, idx) => {
      const x = getX(p.station);
      const y = getSuperY(p.slope);
      if (idx === 0) superRightPath += `M ${x} ${y}`;
      else superRightPath += ` L ${x} ${y}`;
    });
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-transparent border-l border-slate-200 overflow-hidden ${className || ""}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
    >
      {!hideHeader && (
        <div className="absolute top-0 left-0 right-0 p-2 flex items-center justify-between border-b border-slate-200 bg-slate-100/50 backdrop-blur-sm z-10 pointer-events-none">
          <div className="flex items-center gap-2 text-slate-500 font-medium text-xs">
            <Activity size={14} /> PROFILE VIEW
          </div>

          <div 
            className="flex bg-slate-50 rounded mx-2 pointer-events-auto shadow-xl border border-slate-300"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                import("d3").then((d3) =>
                  setProfileTransform(
                    d3.zoomIdentity
                      .translate(transform.dx, 0)
                      .scale(transform.scale * 1.2),
                  ),
                );
              }}
              className="px-2 py-1 hover:bg-slate-100 text-slate-700 font-mono text-sm border-r border-slate-300"
            >
              +
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                import("d3").then((d3) =>
                  setProfileTransform(
                    d3.zoomIdentity
                      .translate(transform.dx, 0)
                      .scale(transform.scale / 1.2),
                  ),
                );
              }}
              className="px-2 py-1 hover:bg-slate-100 text-slate-700 font-mono text-sm border-r border-slate-300"
            >
              -
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFitTrigger((f) => f + 1);
              }}
              className="px-2 py-1 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
            >
              RECEN
            </button>
          </div>
        </div>
      )}

      {/* Visualization Tools Toolbar */}
      <div 
        className="absolute top-1/2 right-4 -translate-y-1/2 flex flex-col gap-2 p-1.5 bg-white border border-slate-300/50 rounded-lg shadow-xl z-[300] pointer-events-auto"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative group/osnap">
          <div className="flex bg-white rounded border border-transparent hover:border-slate-300 transition-colors">
            <button
              className={`p-2 rounded-l transition-colors relative ${osnapEnabled ? 'bg-sky-600/20 text-sky-400' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
              onClick={(e) => { e.stopPropagation(); setOsnapEnabled(!osnapEnabled); }}
              title={`OSNAP ${osnapEnabled ? "(Ativo)" : "(Inativo)"}`}
            >
              <Magnet size={18} />
            </button>
            <button
              className={`p-1 rounded-r transition-colors flex items-center justify-center ${osnapEnabled ? 'bg-sky-600/20 text-sky-400' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'} border-l border-slate-200/50`}
              onClick={(e) => { e.stopPropagation(); setOsnapMenuOpen(!osnapMenuOpen); }}
            >
              <ChevronDown size={12} />
            </button>
          </div>
          
          {osnapMenuOpen && (
            <div className="absolute right-full top-0 mr-2 w-40 bg-white border border-slate-300 rounded-lg shadow-xl py-1 z-[300]">
              <div className="px-3 py-1.5 border-b border-slate-200 text-[10px] font-semibold tracking-wider text-slate-500">
                SNAP OPTIONS
              </div>
              {[
                { key: 'endpoint', label: 'Endpoint' },
                { key: 'midpoint', label: 'Midpoint' },
                { key: 'center', label: 'Center' },
                { key: 'intersection', label: 'Intersection' },
                { key: 'perpendicular', label: 'Perpendicular' },
                { key: 'nearest', label: 'Nearest' }
              ].map(opt => (
                <label key={opt.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={osnapConfig[opt.key as keyof typeof osnapConfig] || false}
                    onChange={(e) => setOsnapConfig({ [opt.key]: e.target.checked })}
                    className="rounded border-slate-300 bg-slate-50 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-xs text-slate-700 select-none">{opt.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          className={`p-2 rounded transition-colors group relative ${orthoModeEnabled ? 'bg-sky-600/20 text-sky-400' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
          onClick={(e) => { e.stopPropagation(); setOrthoModeEnabled(!orthoModeEnabled); }}
        >
          <Ruler size={18} />
          <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-50 text-xs text-slate-800 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-lg">
            ORTHO {orthoModeEnabled ? "(Ativo)" : "(Inativo)"}
          </div>
        </button>
      </div>

      <svg
        className={`flex-1 w-full h-full ${isDragging ? "cursor-grabbing" : typeof useStore.getState().interactionMode === 'string' && useStore.getState().interactionMode.includes('profile') ? "cursor-crosshair" : "cursor-grab"}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Dynamic Grid */}
        <g className="profile-grid">
          {staTicks.map(sta => {
            const x = getX(sta);
            return (
              <g key={`x-${sta}`}>
                <line x1={x} y1={0} x2={x} y2={dimensions.h} stroke="rgba(255,255,255,0.05)" strokeWidth={1}/>
                <text x={x} y={PROFILE_CANVAS_H - 10} fill="#64748b" fontSize="12" textAnchor="middle">{sta.toFixed(0)}</text>
              </g>
            );
          })}
          {elevTicks.map(elev => {
            const y = getY(elev);
            return (
              <g key={`y-${elev}`}>
                <line x1={0} y1={y} x2={dimensions.w} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1}/>
                <text x={10} y={y - 4} fill="#64748b" fontSize="12">{elev.toFixed(1)}</text>
              </g>
            );
          })}
        </g>

        {/* Existing Ground (EG) */}
        {visibleSurfaces.map(s => {
          const pathStr = egPaths[s.id];
          if (!pathStr) return null;
          
          const strokeStyle = s.profileLineStyle || "dashed";
          const strokeDasharray = strokeStyle === "dashed" ? "5 5" : strokeStyle === "dotted" ? "2 2" : "none";
          
          return (
            <path
              key={`eg-${s.id}`}
              d={pathStr}
              fill="none"
              stroke={s.profileColor || s.trianglesColor || "#22c55e"}
              strokeWidth="2"
              strokeDasharray={strokeDasharray}
              className="opacity-80"
            />
          );
        })}

        {/* Finished Grade (FG) */}
        {!alignment?.isProfileHidden && (
          <path d={fgPath} fill="none" stroke={alignment?.profileColor || "#ef4444"} strokeWidth="2" />
        )}

        {/* Temp Profile Drawing */}
        {useStore.getState().tempProfilePIVs.length > 0 && (
            <path
              d={`M ${useStore.getState().tempProfilePIVs.map(p => `${getX(p.sta)},${getY(p.elev)}`).join(" L ")} L ${getX(crosshairPos.sta)},${getY(crosshairPos.elev)}`}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
        )}
        
        {useStore.getState().tempProfilePIVs.map((p, idx) => (
            <circle key={`tpiv-${idx}`} cx={getX(p.sta)} cy={getY(p.elev)} r="4" fill="#fbbf24" />
        ))}

        {/* Profile Lines */}
        {useStore.getState().profileLines
          .filter(l => l.alignmentId === alignment?.id)
          .map(l => (
            <g key={`pvl-${l.id}`}>
              <line
                x1={getX(l.p1.sta)}
                y1={getY(l.p1.elev)}
                x2={getX(l.p2.sta)}
                y2={getY(l.p2.elev)}
                stroke={l.color || "#06b6d4"}
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <text
                x={getX(l.p1.sta) + 4}
                y={getY(l.p1.elev) - 10}
                fill={l.color || "#06b6d4"}
                fontSize="10"
                className="font-mono"
              >
                {l.description || `Line ${l.id.split("-")[1]}`}
              </text>
            </g>
          ))}

        {/* Temp Profile Line Drawing */}
        {useStore.getState().interactionMode === "draw_profile_line" && useStore.getState().pendingProfileLineStart && (
            <g>
              <line
                x1={getX(useStore.getState().pendingProfileLineStart!.sta)}
                y1={getY(useStore.getState().pendingProfileLineStart!.elev)}
                x2={getX(crosshairPos.sta)}
                y2={getY(crosshairPos.elev)}
                stroke="#06b6d4"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                className="opacity-70"
              />
              <text
                x={getX(crosshairPos.sta) + 4}
                y={getY(crosshairPos.elev) - 10}
                fill="#06b6d4"
                fontSize="10"
                className="font-mono opacity-70"
              >
                {`Est: ${crosshairPos.sta.toFixed(2)}, Cota: ${crosshairPos.elev.toFixed(2)}`}
              </text>
            </g>
        )}

        {/* Superelevation Graph */}
        {dimensions.h > 150 && (
          <g className="superelevation-graph pointer-events-none">
            {/* Zero separator line */}
            <line
              x1={0}
              x2={dimensions.w}
              y1={dimensions.h - 100}
              y2={dimensions.h - 100}
              stroke="#64748b"
              strokeWidth={2}
            />
            <line
              x1={0}
              x2={dimensions.w}
              y1={dimensions.h - 60}
              y2={dimensions.h - 60}
              stroke="#e2e8f0"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            {superLeftPath && (
              <path
                d={superLeftPath}
                fill="none"
                stroke="#eab308"
                strokeWidth="2"
              />
            )}
            {superRightPath && (
              <path
                d={superRightPath}
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
              />
            )}
            <text
              x={10}
              y={dimensions.h - 90}
              fill="#94a3b8"
              fontSize={12}
              className="font-mono"
            >
              Superelevação
            </text>
            <text
              x={10}
              y={dimensions.h - 60 - 5}
              fill="#cbd5e1"
              fontSize={11}
              className="font-mono"
            >
              0%
            </text>
          </g>
        )}

        {/* Profile Slopes (Grades) */}
        {(() => {
          const pivs = alignment?.keyProfilePoints.filter(pt => ["PP", "PIV", "PF"].includes(pt.label || "")) || [];
          return pivs.map((pt, i) => {
            if (i === pivs.length - 1) return null;
            const nextPt = pivs[i + 1];
            if (nextPt.sta - pt.sta === 0) return null;
            const grade = ((nextPt.elev - pt.elev) / (nextPt.sta - pt.sta)) * 100;
            
            const midSta = (pt.sta + nextPt.sta) / 2;
            const midElev = (pt.elev + nextPt.elev) / 2;
            const px = getX(midSta);
            const py = getY(midElev);
            
            // Calculate angle for text rotation
            const dx = getX(nextPt.sta) - getX(pt.sta);
            const dy = getY(nextPt.elev) - getY(pt.elev);
            let angle = Math.atan2(dy, dx) * (180 / Math.PI);
            
            // Adjust angle to always be readable from left to right
            if (angle > 90 || angle < -90) {
              angle += 180;
            }

            return (
              <g key={`grade-${i}`} transform={`translate(${px}, ${py})`}>
                <text
                  x="0"
                  y="-8"
                  fill="#94a3b8"
                  fontSize="12"
                  textAnchor="middle"
                  transform={`rotate(${angle})`}
                  className="font-mono font-bold drop-shadow-md"
                  style={{ textShadow: "1px 1px 2px rgba(0,0,0,0.8)" }}
                >
                  {grade.toFixed(2)}%
                </text>
              </g>
            );
          });
        })()}

        {/* Profile Points (PVI) */}
        {(() => {
          let pivIndexCounter = 0;
          return alignment?.keyProfilePoints.map((pt, i) => {
            const isPIV = ["PP", "PIV", "PF"].includes(pt.label || "");
            const currentPivIndex = isPIV ? pivIndexCounter++ : -1;

            const px = getX(pt.sta);
            const py = getY(pt.elev);
            if (
              px < -50 ||
              px > dimensions.w + 50 ||
              py < -50 ||
              py > dimensions.h + 50
            )
              return null;

            return (
              <g
                key={`pvi-${i}`}
                transform={`translate(${px}, ${py})`}
                className={isPIV ? `pointer-events-auto ${useStore.getState().interactionMode === "create_profile_curve" ? "cursor-crosshair" : useStore.getState().interactionMode === "delete_profile_curve" ? "cursor-alias" : useStore.getState().interactionMode === "delete_pvi" ? "cursor-not-allowed" : useStore.getState().interactionMode === "edit_pvi" ? "cursor-text" : "cursor-move"}` : "pointer-events-none"}
                onClick={(e) => {
                    if (!isPIV) return;
                    e.stopPropagation();
                    if (useStore.getState().interactionMode === "create_profile_curve") {
                        // For valid PIVs that aren't the first or last
                        if (currentPivIndex > 0 && currentPivIndex < pivIndexCounter - 1) {
                            setPendingProfileCurve({ piIndex: currentPivIndex, currentLength: pt.l || 100 });
                        }
                        useStore.getState().setInteractionMode("none");
                    } else if (useStore.getState().interactionMode === "delete_profile_curve") {
                        if (currentPivIndex > 0 && currentPivIndex < pivIndexCounter - 1) {
                            useStore.getState().updateActiveProfilePIV(currentPivIndex, pt.sta, pt.elev, null, null);
                        }
                        useStore.getState().setInteractionMode("none");
                    } else if (useStore.getState().interactionMode === "delete_pvi") {
                        if (currentPivIndex > 0 && currentPivIndex < pivIndexCounter - 1) {
                            useStore.getState().removeActiveProfilePIV(currentPivIndex);
                        }
                    } else if (useStore.getState().interactionMode === "edit_pvi") {
                        setEditingPIV({ piIndex: currentPivIndex, sta: pt.sta, elev: pt.elev, l: pt.l, k: pt.k });
                        useStore.getState().setInteractionMode("none");
                    }
                }}
                onMouseDown={(e) => {
                    if (!isPIV) return;
                    e.stopPropagation();
                    if (useStore.getState().interactionMode === "create_profile_curve" || useStore.getState().interactionMode === "delete_profile_curve" || useStore.getState().interactionMode === "delete_pvi" || useStore.getState().interactionMode === "edit_pvi") return;
                    setDraggedPIV({ index: currentPivIndex });
                }}
                onContextMenu={(e) => {
                    if (!isPIV) return;
                    e.preventDefault();
                    e.stopPropagation();
                    // Do not delete first or last PIVs (PP and PF)
                    if (currentPivIndex > 0 && currentPivIndex < pivIndexCounter - 1) {
                        useStore.getState().removeActiveProfilePIV(currentPivIndex);
                    }
                }}
              >
                {isPIV && <circle r="12" fill="transparent" />}
                <circle r={isPIV ? "3" : "2"} fill={isPIV ? "#ef4444" : "#f59e0b"} stroke="#64748b" strokeWidth="1" />
                <text
                  x="6"
                  y="-6"
                  fill={isPIV ? "#fca5a5" : "#fcd34d"}
                  fontSize="11"
                  className="font-mono drop-shadow-md font-bold"
                >
                  {pt.label || "PIV"}
                </text>
                <text
                  x="6"
                  y="4"
                  fill="#64748b"
                  fontSize="10"
                  className="font-mono drop-shadow-md"
                >
                  {pt.sta.toFixed(2)}
                </text>
                {pt.l !== undefined && isPIV && (
                  <text
                    x="6"
                    y="14"
                    fill="#94a3b8"
                    fontSize="8.5"
                    className="font-mono drop-shadow-md mt-1"
                  >
                    L: {pt.l.toFixed(2)}m
                  </text>
                )}
                {pt.k !== undefined && isPIV && (
                  <text
                    x="6"
                    y="24"
                    fill="#94a3b8"
                    fontSize="8.5"
                    className="font-mono drop-shadow-md"
                  >
                    K: {pt.k.toFixed(2)}
                  </text>
                )}
              </g>
            );
          });
        })()}

        {/* Dynamic Crosshair */}
        {useStore.getState().interactionMode !== "none" && (
          <g className="pointer-events-none opacity-50">
            <line
              x1={getX(crosshairPos.sta)}
              y1={0}
              x2={getX(crosshairPos.sta)}
              y2={dimensions.h}
              stroke="#fbbf24"
              strokeWidth="1"
            />
            <line
              x1={0}
              y1={getY(crosshairPos.elev)}
              x2={dimensions.w}
              y2={getY(crosshairPos.elev)}
              stroke="#fbbf24"
              strokeWidth="1"
            />
            {crosshairPos.isSnapped ? (
              <rect
                x={getX(crosshairPos.sta) - 6}
                y={getY(crosshairPos.elev) - 6}
                width="12"
                height="12"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
              />
            ) : (
              <circle
                cx={getX(crosshairPos.sta)}
                cy={getY(crosshairPos.elev)}
                r="4"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="1.5"
              />
            )}
          </g>
        )}

        {/* Current Station Tracker */}
        <g transform={`translate(${currentX}, 0)`}>
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="100%"
            stroke="#3b82f6"
            strokeWidth="1"
            strokeDasharray="4 4"
            className="opacity-60"
          />
          {/* Tracker dots */}
          {currentEGYs.map(dot => (
            <circle key={`dot-${dot.id}`} cx="0" cy={dot.y} r="4" fill={dot.color} />
          ))}
          {currentFGY !== null && (
            <circle cx="0" cy={currentFGY} r="4" fill="#ef4444" />
          )}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1 text-[10px] bg-slate-100 p-2 rounded border border-slate-200 pointer-events-auto shadow-xl z-[300]">
        {surfaces.filter(s => s.isVisible).map(s => {
          const isVisible = s.showInProfile ?? true;
          const strokeColor = s.profileColor || s.trianglesColor || "#22c55e";
          const strokeStyle = s.profileLineStyle || "dashed";
          const isEditing = editingProfileId === s.id;
          
          return (
            <div key={`legend-${s.id}`} className="flex flex-col gap-1 border-b border-slate-200/50 pb-1 mb-1 last:border-0 last:pb-0 last:mb-0">
              <div className="flex items-center justify-between gap-4 group">
                <div 
                  className="flex items-center gap-2 cursor-pointer flex-1"
                  onClick={() => useStore.getState().updateSurfaceLayer(s.id, { showInProfile: !isVisible })}
                  title={isVisible ? "Ocultar perfil" : "Exibir perfil"}
                >
                  <div 
                    className="w-4 h-0.5 border-t-2 transition-opacity" 
                    style={{ 
                      borderColor: strokeColor, 
                      borderStyle: strokeStyle === "solid" ? "solid" : strokeStyle === "dotted" ? "dotted" : "dashed",
                      opacity: isVisible ? 1 : 0.3
                    }}
                  ></div>
                  <span className={`truncate max-w-[150px] transition-colors ${isVisible ? 'text-slate-700' : 'text-slate-600 line-through'}`}>
                    {s.name}
                  </span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setEditingProfileId(isEditing ? null : s.id); }} 
                  className={`p-1 rounded hover:bg-slate-50 transition-colors ${isEditing ? 'text-amber-600' : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:text-slate-700'}`}
                  title="Editar perfil"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
              </div>

              {isEditing && (
                <div className="flex flex-col gap-2 mt-1 bg-white p-2 rounded border border-slate-300">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-500 uppercase font-semibold">Nome</label>
                    <input 
                      type="text" 
                      value={s.name} 
                      onChange={(e) => useStore.getState().updateSurfaceLayer(s.id, { name: e.target.value })}
                      className="bg-slate-50 text-xs text-white px-2 py-1 rounded border border-slate-300 w-full outline-none focus:border-amber-600"
                    />
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-slate-500 uppercase font-semibold">Cor</label>
                      <AciColorPicker
                        value={strokeColor.startsWith('rgba') ? '#22c55e' : strokeColor}
                        onChange={(hex) => useStore.getState().updateSurfaceLayer(s.id, { profileColor: hex })}
                      />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-[9px] text-slate-500 uppercase font-semibold">Estilo</label>
                      <select 
                        value={strokeStyle}
                        onChange={(e) => useStore.getState().updateSurfaceLayer(s.id, { profileLineStyle: e.target.value })}
                        className="bg-slate-50 text-xs text-white px-2 py-1 rounded border border-slate-300 w-full outline-none focus:border-amber-600 cursor-pointer"
                      >
                        <option value="solid">Contínuo</option>
                        <option value="dashed">Tracejado</option>
                        <option value="dotted">Pontilhado</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {alignment && (
          <div className="flex flex-col gap-1 border-t border-slate-200 mt-1 pt-1">
            <div className="flex items-center justify-between gap-4 group">
              <div 
                className="flex items-center gap-2 cursor-pointer flex-1"
                onClick={() => {
                  const newAlignments = useStore.getState().alignments.map(a => {
                    if (a.id === alignment.id) return Object.assign(Object.create(Object.getPrototypeOf(a)), a, { isProfileHidden: !a.isProfileHidden });
                    return a;
                  });
                  useStore.getState().setAlignments(newAlignments);
                }}
                title={!alignment.isProfileHidden ? "Ocultar perfil" : "Exibir perfil"}
              >
                <div 
                  className="w-4 h-0.5 border-t-2 transition-opacity"
                  style={{ 
                    borderColor: alignment.profileColor || "#ef4444", 
                    borderStyle: "solid",
                    opacity: !alignment.isProfileHidden ? 1 : 0.3
                  }}
                ></div>
                <span className={`truncate max-w-[150px] transition-colors ${!alignment.isProfileHidden ? 'text-slate-700' : 'text-slate-600 line-through'}`}>
                  {alignment.profileName || "Finished Grade"}
                </span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setEditingProfileId(editingProfileId === "fg" ? null : "fg"); }} 
                className={`p-1 rounded hover:bg-slate-50 transition-colors ${editingProfileId === "fg" ? 'text-amber-600' : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:text-slate-700'}`}
                title="Editar perfil"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
            </div>

            {editingProfileId === "fg" && (
              <div className="flex flex-col gap-2 mt-1 bg-white p-2 rounded border border-slate-300">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] text-slate-500 uppercase font-semibold">Nome</label>
                  <input 
                    type="text" 
                    value={alignment.profileName || "Finished Grade"} 
                    onChange={(e) => {
                      const newAlignments = useStore.getState().alignments.map(a => {
                        if (a.id === alignment.id) return Object.assign(Object.create(Object.getPrototypeOf(a)), a, { profileName: e.target.value });
                        return a;
                      });
                      useStore.getState().setAlignments(newAlignments);
                    }}
                    className="bg-slate-50 text-xs text-slate-800 px-2 py-1 rounded border border-slate-300 w-full outline-none focus:border-amber-600"
                  />
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-500 uppercase font-semibold">Cor</label>
                    <AciColorPicker
                      value={alignment.profileColor || "#ef4444"}
                      onChange={(hex) => {
                        const newAlignments = useStore.getState().alignments.map(a => {
                          if (a.id === alignment.id) return Object.assign(Object.create(Object.getPrototypeOf(a)), a, { profileColor: hex });
                          return a;
                        });
                        useStore.getState().setAlignments(newAlignments);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {pendingProfileCurve && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/70 z-[200]">
          <div
            className="bg-slate-50 border border-slate-300 p-6 rounded-md shadow-xl max-w-sm flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-slate-800 font-medium text-lg">
              Comprimento da Curva Vertical (m)
            </h3>
            <input
              type="number"
              defaultValue={pendingProfileCurve.currentLength}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-800 outline-none focus:border-emerald-600 transition-colors"
              autoFocus
              id="profile-curve-length-input"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = parseFloat(e.currentTarget.value);
                  if (!isNaN(val) && val >= 0) {
                    useStore
                      .getState()
                      .updateActiveProfilePivLength(pendingProfileCurve.piIndex, val);
                  }
                  setPendingProfileCurve(null);
                } else if (e.key === "Escape") {
                  setPendingProfileCurve(null);
                }
              }}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                className="px-4 py-2 rounded text-slate-700 hover:bg-slate-100 font-medium text-sm transition-colors"
                onClick={() => setPendingProfileCurve(null)}
              >
                Cancelar
              </button>
              <button
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors shadow-sm"
                onClick={() => {
                  const input = document.getElementById(
                    "profile-curve-length-input",
                  ) as HTMLInputElement;
                  if (input) {
                    const val = parseFloat(input.value);
                    if (!isNaN(val) && val >= 0) {
                      useStore
                        .getState()
                        .updateActiveProfilePivLength(pendingProfileCurve.piIndex, val);
                    }
                  }
                  setPendingProfileCurve(null);
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
      {editingPIV && alignment && (
        <EditPIVModal
          alignment={alignment}
          piIndex={editingPIV.piIndex}
          initialSta={editingPIV.sta}
          initialElev={editingPIV.elev}
          initialL={editingPIV.l}
          initialK={editingPIV.k}
          onClose={() => setEditingPIV(null)}
        />
      )}
    </div>
  );
}
