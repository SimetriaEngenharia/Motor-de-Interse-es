import React, { useRef, useEffect, useState, useMemo } from "react";
import { useStore, evaluateAssemblyAtStation } from "../store";

export function SectionLineView({ className }: { className?: string }) {
  const { alignments, activeSectionLineId, setActiveSectionLineId } = useStore();
  const sectionLines = alignments.filter(a => a.isSectionLine);
  
  useEffect(() => {
    if (sectionLines.length > 0 && !activeSectionLineId) {
      setActiveSectionLineId(sectionLines[0].id);
    }
  }, [sectionLines, activeSectionLineId, setActiveSectionLineId]);

  return (
    <div className={`flex flex-col w-full h-full bg-slate-50 ${className || ""}`}>
      <div className="flex-1 relative overflow-hidden">
        {activeSectionLineId ? (
          <SectionLineCanvas sectionLineId={activeSectionLineId} />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-sm text-slate-400">
            Nenhuma Linha de Corte selecionada ou encontrada.
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLineCanvas({ sectionLineId }: { sectionLineId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 400 });
  const [transform, setTransform] = useState({ scale: 1, dx: 0, dy: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  
  const { alignments, surface, corridors, assemblies } = useStore();
  const sectionLine = alignments.find(a => a.id === sectionLineId);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setTransform((prev) => {
      const newScale = prev.scale * zoomFactor;
      const newDx = mx - (mx - prev.dx) * zoomFactor;
      const newDy = my - (my - prev.dy) * zoomFactor;
      return { scale: newScale, dx: newDx, dy: newDy };
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setTransform((prev) => ({ ...prev, dx: prev.dx + dx, dy: prev.dy + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const { minElev, maxElev, surfacePathPoints, corridorData } = useMemo(() => {
    if (!sectionLine) return { minElev: Infinity, maxElev: -Infinity, surfacePathPoints: [], corridorData: {} };
    let minE = Infinity;
    let maxE = -Infinity;
    
    if (surface && sectionLine.length > 0) {
      const step = Math.max(0.5, sectionLine.length / 50);
      for (let sta = 0; sta <= sectionLine.length; sta += step) {
        const ptW = sectionLine.getPointAtStation(sta);
        const elev = surface.getElevation(ptW.x, ptW.y);
        if (elev !== null) {
          if (elev < minE) minE = elev;
          if (elev > maxE) maxE = elev;
        }
      }
    }
    
    const sData = [];
    if (surface && sectionLine.length > 0) {
      const step = Math.max(0.5, sectionLine.length / 200);
      for (let sta = 0; sta <= sectionLine.length; sta += step) {
        const ptW = sectionLine.getPointAtStation(sta);
        const elev = surface.getElevation(ptW.x, ptW.y);
        if (elev !== null) {
          sData.push({ sta, elev });
        }
      }
    }

    const getIntersection = (p1: any, p2: any, p3: any, p4: any) => {
      const denom = (p4.y - p3.y)*(p2.x - p1.x) - (p4.x - p3.x)*(p2.y - p1.y);
      if (denom === 0) return null;
      const ua = ((p4.x - p3.x)*(p1.y - p3.y) - (p4.y - p3.y)*(p1.x - p3.x)) / denom;
      const ub = ((p2.x - p1.x)*(p1.y - p3.y) - (p2.y - p1.y)*(p1.x - p3.x)) / denom;
      if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
        return {
          x: p1.x + ua * (p2.x - p1.x),
          y: p1.y + ua * (p2.y - p1.y),
          ua, ub
        };
      }
      return null;
    };

    const cData: Record<string, { pts: {sta: number, elev: number, id: string}[], links: {p1: string, p2: string}[] }> = {};

    if (sectionLine.length > 0) {
      const slPts: {sta: number, pt: any}[] = [];
      const step = Math.max(2, sectionLine.length / 100);
      for (let sta = 0; sta <= sectionLine.length; sta += step) {
        slPts.push({sta, pt: sectionLine.getPointAtStation(sta)});
      }
      
      for (const corridor of corridors) {
        const parentAlign = alignments.find(a => a.id === corridor.alignmentId);
        if (!parentAlign) continue;

        let minSta = Infinity;
        let maxSta = -Infinity;
        for (const r of corridor.regions) {
          if (r.startStation < minSta) minSta = r.startStation;
          if (r.endStation > maxSta) maxSta = r.endStation;
        }
        if (minSta === Infinity || maxSta === -Infinity) continue;

        
        const cPts: any[] = [];
        
        // Optimize: find bounding box of section line
        const slMinX = Math.min(...slPts.map(p => p.pt.x));
        const slMaxX = Math.max(...slPts.map(p => p.pt.x));
        const slMinY = Math.min(...slPts.map(p => p.pt.y));
        const slMaxY = Math.max(...slPts.map(p => p.pt.y));
        const CORRIDOR_MAX_WIDTH = 200; // Expanded bounding box
        
        // Find relevant station ranges
        let optMinSta = Infinity;
        let optMaxSta = -Infinity;
        for (let s = minSta; s <= maxSta; s += 20) {
          const pt = parentAlign.getPointAtStation(s);
          if (pt.x >= slMinX - CORRIDOR_MAX_WIDTH && pt.x <= slMaxX + CORRIDOR_MAX_WIDTH &&
              pt.y >= slMinY - CORRIDOR_MAX_WIDTH && pt.y <= slMaxY + CORRIDOR_MAX_WIDTH) {
              if (s < optMinSta) optMinSta = s;
              if (s > optMaxSta) optMaxSta = s;
          }
        }
        
        if (optMinSta === Infinity) continue; // Section line is too far from this corridor
        
        // Expand the bounds slightly to ensure we capture the intersection
        optMinSta = Math.max(minSta, optMinSta - 50);
        optMaxSta = Math.min(maxSta, optMaxSta + 50);

        for (let s = optMinSta; s <= optMaxSta; s += 2) {
          const result = evaluateAssemblyAtStation(
            s, assemblies, corridors, surface, alignments, corridor.alignmentId
          );
          if (result) {
            const ptW = parentAlign.getPointAtStation(s);
            const orientation = parentAlign.getOrientationAtStation(s);
            const fg = parentAlign.getElevationAtStation(s) || 0;
            
            const fp: Record<string, {x: number, y: number, z: number}> = {};
            for (const key in result.points) {
              const ptLocal = result.points[key];
              const wx = ptW.x + orientation.nx * ptLocal.x;
              const wy = ptW.y + orientation.ny * ptLocal.x;
              const wElev = fg + ptLocal.y;
              fp[key] = {x: wx, y: wy, z: wElev};
            }
            cPts.push(fp);
          }
        }

        const fKeys = new Set<string>();
        cPts.forEach(fp => Object.keys(fp).forEach(k => fKeys.add(k)));
        
        const fPts: {sta: number, elev: number, id: string}[] = [];
        let sumS = 0;
        let countS = 0;
        
        for (const fId of fKeys) {
          for (let i = 0; i < cPts.length - 1; i++) {
            const p1 = cPts[i][fId];
            const p2 = cPts[i+1][fId];
            if (!p1 || !p2) continue;
            
            for (let j = 0; j < slPts.length - 1; j++) {
              const sl1 = slPts[j];
              const sl2 = slPts[j+1];
              
              const intersect = getIntersection(sl1.pt, sl2.pt, p1, p2);
              if (intersect) {
                const staOnSl = sl1.sta + intersect.ua * (sl2.sta - sl1.sta);
                const zOnFeature = p1.z + intersect.ub * (p2.z - p1.z);
                fPts.push({
                  sta: staOnSl,
                  elev: zOnFeature,
                  id: fId
                });
                sumS += (minSta + i * 2) + intersect.ub * 2;
                countS++;
              }
            }
          }
        }
        
        let cLinks: any[] = [];
        if (countS > 0) {
            const avgSta = sumS / countS;
            const res = evaluateAssemblyAtStation(avgSta, assemblies, corridors, surface, alignments, corridor.alignmentId);
            if (res) {
                cLinks = res.links;
            }
        }

        cData[corridor.id] = { pts: fPts, links: cLinks };
      }
    }
    return { minElev: minE, maxElev: maxE, surfacePathPoints: sData, corridorData: cData };
  }, [surface, sectionLine, corridors, assemblies, alignments]);

  if (!sectionLine) return null;

  const refElev = minElev !== Infinity ? (minElev + maxElev) / 2 : 0;
  
  const elevDiff = (maxElev !== -Infinity && minElev !== Infinity) ? (maxElev - minElev) : 10;
  
  const baseScale = Math.min(
    (dimensions.w - 100) / Math.max(1, sectionLine.length),
    (dimensions.h - 100) / Math.max(1, elevDiff || 10)
  );

  const SCALE = isNaN(baseScale) || baseScale === 0 ? 10 * transform.scale : baseScale * transform.scale;
  
  const oX = (dimensions.w / 2) - (sectionLine.length / 2) * SCALE + transform.dx;
  
  const oY = (dimensions.h / 2) + transform.dy;
  
  const toPx = (x: number, y: number) => ({
    cx: oX + x * SCALE,
    cy: oY - (y - refElev) * SCALE,
  });

  let surfacePath = "";
  for (let i = 0; i < surfacePathPoints.length; i++) {
    const p = toPx(surfacePathPoints[i].sta, surfacePathPoints[i].elev);
    if (i === 0) surfacePath += `M ${p.cx} ${p.cy}`;
    else surfacePath += ` L ${p.cx} ${p.cy}`;
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-grab active:cursor-grabbing bg-slate-100"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseUp}
    >
      <svg width="100%" height="100%" className="block">
        {/* Grid and Axes */}
        {(() => {
          const calculateStep = (scale: number, minSpacingPx: number) => {
            if (scale === 0) return 10;
            const minStepVal = minSpacingPx / scale;
            const order = Math.floor(Math.log10(minStepVal));
            const magnitude = Math.pow(10, order);
            const residual = minStepVal / magnitude;
            let step;
            if (residual <= 1) step = 1;
            else if (residual <= 2) step = 2;
            else if (residual <= 5) step = 5;
            else step = 10;
            return step * magnitude;
          };

          const xStep = calculateStep(SCALE, 100);
          const yStep = calculateStep(SCALE, 50);

          const minX = (0 - oX) / SCALE;
          const maxX = (dimensions.w - oX) / SCALE;
          
          const minY = refElev - (dimensions.h - oY) / SCALE;
          const maxY = refElev + oY / SCALE;

          const startX = Math.floor(minX / xStep) * xStep;
          const endX = Math.ceil(maxX / xStep) * xStep;

          const startY = Math.floor(minY / yStep) * yStep;
          const endY = Math.ceil(maxY / yStep) * yStep;

          const xTicks = [];
          for (let x = startX; x <= endX; x += xStep) {
            xTicks.push(x);
          }

          const yTicks = [];
          for (let y = startY; y <= endY; y += yStep) {
            yTicks.push(y);
          }

          return (
            <g>
              {xTicks.map(x => {
                const px = toPx(x, refElev).cx;
                return (
                  <g key={`xtick-${x}`}>
                    <line x1={px} y1={0} x2={px} y2={dimensions.h} stroke="#e2e8f0" strokeWidth="1" />
                    <text x={px + 4} y={oY > 20 ? oY - 6 : 14} fontSize="10" fill="#64748b" className="select-none">
                      {x.toFixed(1)}
                    </text>
                  </g>
                );
              })}
              {yTicks.map(y => {
                const py = toPx(0, y).cy;
                return (
                  <g key={`ytick-${y}`}>
                    <line x1={0} y1={py} x2={dimensions.w} y2={py} stroke="#e2e8f0" strokeWidth="1" />
                    <text x={oX > 20 ? oX + 4 : 4} y={py - 6} fontSize="10" fill="#64748b" className="select-none">
                      {y.toFixed(1)}
                    </text>
                  </g>
                );
              })}
              <line x1={0} y1={oY} x2={dimensions.w} y2={oY} stroke="#94a3b8" strokeWidth="1.5" />
              <line x1={oX} y1={0} x2={oX} y2={dimensions.h} stroke="#94a3b8" strokeWidth="1.5" />
            </g>
          );
        })()}
        
        {surfacePath && (
          <path d={surfacePath} fill="none" stroke="#22c55e" strokeWidth="2" opacity="0.8" />
        )}

        {(() => {
          return Object.entries(corridorData).map(([cId, data]) => {
            const elements = [];
            data.links.forEach((link, lIdx) => {
              const pts1 = data.pts.filter(p => p.id === link.p1);
              const pts2 = data.pts.filter(p => p.id === link.p2);
              pts1.sort((a,b) => a.sta - b.sta);
              pts2.sort((a,b) => a.sta - b.sta);
              
              const minLen = Math.min(pts1.length, pts2.length);
              for (let i = 0; i < minLen; i++) {
                const px1 = toPx(pts1[i].sta, pts1[i].elev);
                const px2 = toPx(pts2[i].sta, pts2[i].elev);
                
                // Set color based on link type
                let stroke = "#3b82f6"; // blue
                let strokeWidth = "2";
                if ((link as any).type === 'datum') stroke = "#ef4444"; // red
                else if ((link as any).type === 'subbase') stroke = "#f59e0b"; // amber
                else if ((link as any).type === 'base') stroke = "#10b981"; // emerald

                elements.push(
                  <line 
                    key={`${cId}-link-${lIdx}-${i}`} 
                    x1={px1.cx} y1={px1.cy} 
                    x2={px2.cx} y2={px2.cy} 
                    stroke={stroke} 
                    strokeWidth={strokeWidth} 
                  />
                );
              }
            });
            // also draw dots at the feature lines
            data.pts.forEach((pt, pIdx) => {
              const px = toPx(pt.sta, pt.elev);
              elements.push(
                <circle 
                  key={`${cId}-pt-${pIdx}`}
                  cx={px.cx} cy={px.cy} r="1.5" fill="#f87171" 
                />
              );
            });
            return <g key={`c-${cId}`}>{elements}</g>;
          });
        })()}
      </svg>
    </div>
  );
}
