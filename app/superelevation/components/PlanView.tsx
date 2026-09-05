import React, { useRef, useState, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import { AlignmentData } from '../types';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { formatStation } from '../utils/formatters';

interface PlanViewProps {
  data: AlignmentData;
  zoomedGeometryId?: string | null;
  onGeometryClick?: (id: string) => void;
  hoveredStation?: number | null;
  onHoverStation?: (station: number | null) => void;
}

export const PlanView: React.FC<PlanViewProps> = ({ data, zoomedGeometryId, onGeometryClick, hoveredStation, onHoverStation }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(300);
  const [transform, setTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.clientWidth);
        setHeight(containerRef.current.clientHeight);
      }
    };
    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const pathPoints = useMemo(() => {

    let x = 0;
    let y = 0;
    let dir = 0;
    
    const firstGeom = data.geometries[0];
    if (firstGeom) {
      if (firstGeom.startX !== undefined && firstGeom.startY !== undefined) {
        x = firstGeom.startX;
        y = firstGeom.startY;
        
        if (firstGeom.type === 'Tangent' && firstGeom.endX !== undefined && firstGeom.endY !== undefined) {
          dir = Math.atan2(firstGeom.endY - firstGeom.startY, firstGeom.endX - firstGeom.startX);
        } else if (firstGeom.piX !== undefined && firstGeom.piY !== undefined) {
          dir = Math.atan2(firstGeom.piY - firstGeom.startY, firstGeom.piX - firstGeom.startX);
        }
      }
    }

    const pts: { x: number, y: number, station: number, type: string, dir: number }[] = [{ x, y, station: firstGeom?.startStation || 0, type: 'Start', dir }];

    for (let i = 0; i < data.geometries.length; i++) {
      const g = data.geometries[i];
      const L = g.endStation - g.startStation;
      if (L <= 0) continue;
      
      let segmentPts: { x: number, y: number, station: number, type: string, dir: number }[] = [];
      const steps = Math.max(5, Math.floor(L / (g.type === 'Tangent' ? 50 : 5)));
        
      if (g.startX !== undefined && g.startY !== undefined) {
          x = g.startX;
          y = g.startY;
          // compute dir so the math traces from correct initial heading
          if (g.type === 'Tangent' && g.endX !== undefined && g.endY !== undefined) {
              dir = Math.atan2(g.endY - g.startY, g.endX - g.startX);
          } else if (g.piX !== undefined && g.piY !== undefined) {
              dir = Math.atan2(g.piY - g.startY, g.piX - g.startX);
          }
      }

      const dirStart = dir;

      for (let step = 1; step <= steps; step++) {
          const dL = L / steps;
          const dist = dL * step;
          let currentDir = dir;
          
          if (g.type === 'Tangent') {
              // dir stays same
          } else if (g.type === 'Curve') {
              const R = Math.abs(g.radius || 1000);
              const sign = g.rot === 'cw' ? -1 : 1;
              dir += sign * (dL / R);
              currentDir = dir;
          } else if (g.type === 'Spiral') {
              const nextG = data.geometries[i + 1];
              const prevG = data.geometries[i - 1];
              let R = 1000;
              if (nextG && nextG.type === 'Curve' && nextG.radius) R = Math.abs(nextG.radius);
              else if (prevG && prevG.type === 'Curve' && prevG.radius) R = Math.abs(prevG.radius);
              const sign = g.rot === 'cw' ? -1 : 1;
              const isExit = prevG && prevG.type === 'Curve';
              let currentDelta = 0;
              if (isExit) {
                  currentDelta = (dist / R) - (dist * dist) / (2 * R * L);
              } else {
                  currentDelta = (dist * dist) / (2 * R * L);
              }
              dir = dirStart + sign * currentDelta;
              currentDir = dir;
          }
          
          x += dL * Math.cos(currentDir);
          y += dL * Math.sin(currentDir);
          segmentPts.push({ x, y, station: g.startStation + dist, type: g.type, dir: currentDir });
      }

      // Linear error distribution to EXACT end point if available!
      if (g.endX !== undefined && g.endY !== undefined && segmentPts.length > 0) {
          const lastP = segmentPts[segmentPts.length - 1];
          const errX = g.endX - lastP.x;
          const errY = g.endY - lastP.y;
          
          for (let j = 0; j < segmentPts.length; j++) {
              const factor = (j + 1) / segmentPts.length;
              segmentPts[j].x += errX * factor;
              segmentPts[j].y += errY * factor;
          }
          
          x = g.endX;
          y = g.endY;
      }

      pts.push(...segmentPts);
    }
    
    return pts;
  }, [data]);

  const xDomain = useMemo(() => {
    const ext = d3.extent(pathPoints, (p: any) => p.x) as [number, number];
    return ext[0] === undefined ? [-100, 100] : ext;
  }, [pathPoints]);

  const yDomain = useMemo(() => {
    const ext = d3.extent(pathPoints, (p: any) => p.y) as [number, number];
    return ext[0] === undefined ? [-100, 100] : ext;
  }, [pathPoints]);

  // Adjust domains to match aspect ratio
  const pad = 100;

  const { adjXDomain, adjYDomain } = useMemo(() => {
    let dx = (xDomain[1] - xDomain[0]) || 200;
    let dy = (yDomain[1] - yDomain[0]) || 200;
    
    const xCenter = (xDomain[0] + xDomain[1]) / 2;
    const yCenter = (yDomain[0] + yDomain[1]) / 2;
    
    dx += pad * 2;
    dy += pad * 2;
    
    // We strictly maintain a 1:1 spatial aspect ratio so map never distorts
    const aspect = width / Math.max(1, height);
    const reqAspect = dx / dy;
    
    let finalDx = dx;
    let finalDy = dy;
    
    if (aspect > reqAspect) {
        finalDx = dy * aspect;
    } else {
        finalDy = dx / aspect;
    }
    
    return {
        adjXDomain: [xCenter - finalDx / 2, xCenter + finalDx / 2],
        adjYDomain: [yCenter - finalDy / 2, yCenter + finalDy / 2]
    };
  }, [xDomain, yDomain, width, height, pad]);
  
  const baseXScale = useMemo(() => {
    return d3.scaleLinear().domain(adjXDomain).range([0, width]);
  }, [width, adjXDomain]);

  const baseYScale = useMemo(() => {
    return d3.scaleLinear().domain(adjYDomain).range([height, 0]);
  }, [height, adjYDomain]);

  const xScale = useMemo(() => transform.rescaleX(baseXScale), [transform, baseXScale]);
  const yScale = useMemo(() => transform.rescaleY(baseYScale), [transform, baseYScale]);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 50])
      .filter((event) => {
        return !event.button;
      })
      .on('zoom', (event) => {
        setTransform(event.transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);
  }, []);

  const handleZoomIn = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 1.5);
    }
  };

  const handleZoomOut = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 0.7);
    }
  };

  const handleZoomFit = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
    }
    if (zoomedGeometryId && onGeometryClick) {
       onGeometryClick(zoomedGeometryId); // This toggles it off
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !onHoverStation) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const transform = d3.zoomTransform(svgRef.current);
    const unzoomedX = (mouseX - transform.x) / transform.k;
    const unzoomedY = (mouseY - transform.y) / transform.k;

    let minDistSq = Infinity;
    let closestStation: number | null = null;
    
    // Check closest station. Since we precalculated points, just find nearest point.
    // Optimization: limit search space if points are many, but usually it's fine
    for (const p of pathPoints) {
       const px = xScale(p.x);
       const py = yScale(p.y);
       const dx = unzoomedX - px;
       const dy = unzoomedY - py;
       const distSq = dx * dx + dy * dy;
       if (distSq < minDistSq) {
          minDistSq = distSq;
          closestStation = p.station;
       }
    }

    if (minDistSq < 600) { // ~25px threshold unzoomed
       onHoverStation(closestStation);
    } else {
       onHoverStation(null);
    }
  };

  const handleMouseLeave = () => {
    if (onHoverStation) onHoverStation(null);
  };

  // Synchronize external zoom selection
  useEffect(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || !zoomedGeometryId) {
      return;
    }

    const geom = data.geometries.find(g => g.id === zoomedGeometryId);
    if (!geom) return;

    // We need to find the bounding box of pathPoints that fall within this geometry
    const eps = 0.01;
    const pts = pathPoints.filter(p => p.station >= geom.startStation - eps && p.station <= geom.endStation + eps);
    if (pts.length === 0) return;

    const minX = (d3.min(pts, (p: any) => p.x) as unknown as number) ?? 0;
    const maxRealX = (d3.max(pts, (p: any) => p.x) as unknown as number) ?? 0;
    const minY = (d3.min(pts, (p: any) => p.y) as unknown as number) ?? 0;
    const maxY = (d3.max(pts, (p: any) => p.y) as unknown as number) ?? 0;

    const gWidth = baseXScale(maxRealX) - baseXScale(minX);
    const gHeight = baseYScale(minY) - baseYScale(maxY); // baseYScale is inverted

    // fallback if gWidth or gHeight is 0
    const effWidth = Math.max(gWidth, 10);
    const effHeight = Math.max(gHeight, 10);

    const paddingMultiplier = 1.3;
    const scaleX = width / (effWidth * paddingMultiplier);
    const scaleY = height / (effHeight * paddingMultiplier);
    const targetScale = Math.min(scaleX, scaleY, 20);

    const xCenter = (baseXScale(minX) + baseXScale(maxRealX)) / 2;
    const yCenter = (baseYScale(minY) + baseYScale(maxY)) / 2;

    const transformX = width / 2 - xCenter * targetScale;
    const transformY = height / 2 - yCenter * targetScale;

    const targetTransform = d3.zoomIdentity.translate(transformX, transformY).scale(targetScale);

    d3.select(svgRef.current)
      .transition()
      .duration(750)
      .call(zoomBehaviorRef.current.transform, targetTransform);

  }, [zoomedGeometryId, data.geometries, baseXScale, baseYScale, width, height, pathPoints]);

  const lineGen = d3.line<any>()
    .x(d => xScale(d.x))
    .y(d => yScale(d.y)); // removed curveMonotoneX to avoid 2d map artifacts

  const highlightedPoints = useMemo(() => {
    if (!zoomedGeometryId) return [];
    const geom = data.geometries.find(g => g.id === zoomedGeometryId);
    if (!geom) return [];

    const eps = 0.01;
    return pathPoints.filter(p => p.station >= geom.startStation - eps && p.station <= geom.endStation + eps);
  }, [pathPoints, zoomedGeometryId, data.geometries]);

  const highlightColor = useMemo(() => {
    if (!zoomedGeometryId) return '#fff';
    const geom = data.geometries.find(g => g.id === zoomedGeometryId);
    if (!geom) return '#fff';
    return geom.type === 'Curve' ? '#f43f5e' : (geom.type === 'Spiral' ? '#eab308' : '#22c55e');
  }, [zoomedGeometryId, data.geometries]);

  const hoveredPoint = useMemo(() => {
    if (hoveredStation === null || pathPoints.length === 0) return null;
    let p1 = pathPoints[0];
    let p2 = pathPoints[pathPoints.length - 1];
    
    // Extrapolation cases if outside bounds
    if (hoveredStation <= p1.station) return { x: xScale(p1.x), y: yScale(p1.y), dir: p1.dir };
    if (hoveredStation >= p2.station) return { x: xScale(p2.x), y: yScale(p2.y), dir: p2.dir };

    for (let i = 0; i < pathPoints.length - 1; i++) {
        if (hoveredStation >= pathPoints[i].station && hoveredStation <= pathPoints[i+1].station) {
          p1 = pathPoints[i];
          p2 = pathPoints[i+1];
          break;
        }
    }
    if (p1.station === p2.station) return { x: xScale(p1.x), y: yScale(p1.y), dir: p1.dir };
    const t = (hoveredStation - p1.station) / (p2.station - p1.station);
    const x = p1.x + t * (p2.x - p1.x);
    const y = p1.y + t * (p2.y - p1.y);
    const dir = p1.dir + t * (p2.dir - p1.dir);

    const sx = xScale(x);
    const sy = yScale(y);
    const dxScreen = xScale(x + Math.cos(dir)) - sx;
    const dyScreen = yScale(y + Math.sin(dir)) - sy;
    const sAngle = Math.atan2(dyScreen, dxScreen);

    const activeGeom = data.geometries.find(g => hoveredStation >= g.startStation && hoveredStation <= g.endStation);
    const rot = activeGeom?.rot;
    const geomType = activeGeom?.type;
    
    return { x: sx, y: sy, dir, sAngle, rot, geomType };
  }, [hoveredStation, pathPoints, xScale, yScale, data.geometries]);

  const superIndicators = useMemo(() => {
    if (pathPoints.length === 0) return [];
    
    return data.superPoints.map(sp => {
      // Find the two points that bound this station
      let p1 = pathPoints[0];
      let p2 = pathPoints[pathPoints.length - 1];
      
      for (let i = 0; i < pathPoints.length - 1; i++) {
        if (sp.station >= pathPoints[i].station && sp.station <= pathPoints[i+1].station) {
          p1 = pathPoints[i];
          p2 = pathPoints[i+1];
          break;
        }
      }

      const dist = p2.station - p1.station;
      const t = dist === 0 ? 0 : (sp.station - p1.station) / dist;
      
      const x = p1.x + (p2.x - p1.x) * t;
      const y = p1.y + (p2.y - p1.y) * t;
      const d = p1.dir + (p2.dir - p1.dir) * t;

      const sx = xScale(x);
      const sy = yScale(y);

      // Determine screen angle of the tangent
      // To get the screen angle, we can test a small differential
      const dxScreen = xScale(x + Math.cos(d)) - sx;
      const dyScreen = yScale(y + Math.sin(d)) - sy;
      const sAngle = Math.atan2(dyScreen, dxScreen);

      // Normal is perpendicular
      const isLeft = sp.lane === 'left';
      const normalAngle = isLeft ? sAngle - Math.PI / 2 : sAngle + Math.PI / 2;
      const angleDeg = normalAngle * 180 / Math.PI;

      return {
        ...sp,
        sx,
        sy,
        angleDeg
      };
    });
  }, [data.superPoints, pathPoints, xScale, yScale]);

  return (
    <div ref={containerRef} className="absolute inset-0 bg-white overflow-hidden font-mono select-none rounded-b-lg">
      <div className="absolute right-4 top-4 flex flex-col gap-2 z-10">
        <button className="w-8 h-8 flex items-center justify-center bg-slate-50 border border-slate-300 text-slate-700 rounded hover:bg-slate-100 hover:text-slate-900 transition shadow-lg" onClick={handleZoomIn} title="Zoom In">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className="w-8 h-8 flex items-center justify-center bg-slate-50 border border-slate-300 text-slate-700 rounded hover:bg-slate-100 hover:text-slate-900 transition shadow-lg" onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button className="w-8 h-8 flex items-center justify-center bg-slate-50 border border-slate-300 text-slate-700 rounded hover:bg-slate-100 hover:text-slate-900 transition shadow-lg" onClick={handleZoomFit} title="Centralizar Tudo">
          <Maximize className="w-4 h-4" />
        </button>
      </div>

      <svg ref={svgRef} width="100%" height="100%" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
         <g>
           {/* Draw Path */}
           <path 
             d={lineGen(pathPoints) || ''} 
             stroke="#22d3ee" 
             strokeWidth={zoomedGeometryId ? 2 : 4} 
             fill="none" 
             opacity={zoomedGeometryId ? 0.3 : 0.8}
           />
           {/* Draw Highlighted Path */}
           {highlightedPoints.length > 0 && (
             <path 
               d={lineGen(highlightedPoints) || ''} 
               stroke={highlightColor} 
               strokeWidth={6} 
               fill="none" 
               className="drop-shadow-lg"
             />
           )}
           {/* Hover Line Indicator */}
           {hoveredPoint && hoveredPoint.sAngle !== undefined && (
             <g transform={`translate(${hoveredPoint.x}, ${hoveredPoint.y})`}>
                {hoveredPoint.geomType === 'Tangent' ? (
                    <line 
                      x1={Math.cos(hoveredPoint.sAngle + Math.PI/2) * -50} 
                      y1={Math.sin(hoveredPoint.sAngle + Math.PI/2) * -50} 
                      x2={Math.cos(hoveredPoint.sAngle + Math.PI/2) * 50} 
                      y2={Math.sin(hoveredPoint.sAngle + Math.PI/2) * 50} 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      opacity={0.8}
                    />
                ) : (
                    <g transform={`rotate(${((hoveredPoint.rot === 'cw' ? hoveredPoint.sAngle + Math.PI/2 : hoveredPoint.sAngle - Math.PI/2) * 180 / Math.PI)})`}>
                        <line x1={0} y1={0} x2={50} y2={0} stroke="#3b82f6" strokeWidth={2} opacity={0.8} />
                        <polygon points="50,0 40,-5 40,5" fill="#3b82f6" opacity={0.8} />
                    </g>
                )}

                <circle r={4} fill="#3b82f6" />
                <text y={-10} fill="#60a5fa" fontSize={10} fontFamily="monospace" textAnchor="middle" className="drop-shadow-md" style={{ textShadow: "1px 1px 2px #0f172a" }}>
                   {formatStation(hoveredStation!)}
                </text>
             </g>
           )}
           {/* Draw Start/End of Geometries */}
           {data.geometries.map(g => {
             const startPt = pathPoints.find(p => p.station >= g.startStation);
             if (!startPt) return null;
             const color = g.type === 'Curve' ? '#f43f5e' : (g.type === 'Spiral' ? '#eab308' : '#22c55e');
             const isSelected = g.id === zoomedGeometryId;

             return (
               <g key={g.id} transform={`translate(${xScale(startPt.x)}, ${yScale(startPt.y)})`}>
                 <circle r={isSelected ? 6 : 4} fill={color} stroke="#64748b" strokeWidth={1} />
                 <text 
                   y={-15} 
                   fill={isSelected ? "#2dd4bf" : color} 
                   fontSize={isSelected ? 16 : 14} 
                   fontWeight={isSelected ? "bold" : "bold"}
                   textAnchor="middle"
                   className="cursor-pointer hover:underline transition-all drop-shadow-md"
                   style={{ textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}
                   onClick={(e) => {
                     e.stopPropagation();
                     onGeometryClick?.(g.id);
                   }}
                 >
                   {g.name}
                 </text>
                 <text y={20} fill="#f8fafc" fontSize={12} textAnchor="middle" className="drop-shadow-md font-bold" style={{ textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}>
                   {formatStation(g.startStation)}
                 </text>
               </g>
             );
           })}

           {/* Draw slope arrows */}
           {superIndicators.map(ind => {
             return (
               <g key={ind.id} transform={`translate(${ind.sx}, ${ind.sy}) rotate(${ind.angleDeg})`}>
                 {/* The arrow shaft */}
                 <line x1={12} y1={0} x2={45} y2={0} stroke="#f1f5f9" strokeWidth={2} />
                 {/* The arrow head (pointing away) */}
                 <polygon points="45,0 35,-6 35,6" fill="#f1f5f9" />
                 {/* The percentage text, rotated back to horizontal so it's readable */}
                 {/* Pivot around (55, 0) */}
                 <text 
                   x={55} 
                   y={0} 
                   fill="#f1f5f9" 
                   fontSize={14} 
                   fontWeight="bold"
                   alignmentBaseline="middle"
                   transform={`rotate(${-ind.angleDeg}, 55, 0)`}
                   className="drop-shadow-md cursor-default pointer-events-none"
                   style={{ textShadow: "1px 1px 3px rgba(0,0,0,0.8)" }}
                 >
                   {parseFloat(ind.slope.toFixed(2))}%
                 </text>
               </g>
             )
           })}

         </g>
      </svg>
    </div>
  );
}
