import React, { useRef, useState, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import { AlignmentData, SuperPoint } from '../types';
import { formatStation, formatSlope } from '../utils/formatters';
import { cn } from '../utils/cn';
import { getRmax } from '../utils/referenceTables';
import { ZoomIn, ZoomOut, Maximize, Ruler, Download } from 'lucide-react';
import { exportToDxf } from '../utils/dxfExporter';
import { useStore } from '../../store';

interface SuperelevationChartProps {
  data: AlignmentData;
  onPointMove: (id: string, newStation: number, newSlope: number) => void;
  zoomedGeometryId?: string | null;
  onGeometryClick?: (id: string) => void;
  hoveredStation?: number | null;
  onHoverStation?: (station: number | null) => void;
  onShowJustification?: (curveId?: string) => void;
  onPointAdd?: (point: Omit<SuperPoint, 'id'>) => void;
  minimal?: boolean;
  minStationOverride?: number;
  maxStationOverride?: number;
  syncTransform?: boolean;
}

export const SuperelevationChart: React.FC<SuperelevationChartProps> = ({ data, onPointMove, zoomedGeometryId, onGeometryClick, hoveredStation, onHoverStation, onShowJustification, onPointAdd, minimal, minStationOverride, maxStationOverride, syncTransform }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(400);

  const globalProfileTransform = useStore(s => s.profileTransform);
  const setGlobalProfileTransform = useStore(s => s.setProfileTransform);
  const [localTransform, setLocalTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);
  
  const transform = syncTransform ? globalProfileTransform : localTransform;
  
  const handleSetTransform = (t: d3.ZoomTransform | ((prev: d3.ZoomTransform) => d3.ZoomTransform)) => {
     if (typeof t === 'function') {
        if (syncTransform) setGlobalProfileTransform(t(globalProfileTransform));
        else setLocalTransform(t);
     } else {
        if (syncTransform) setGlobalProfileTransform(t);
        else setLocalTransform(t);
     }
  };
  const setTransform = handleSetTransform;

  const [lineOffsets, setLineOffsets] = useState<Record<number, { left: number, right: number }>>({});
  const [selectedStation, setSelectedStation] = useState<number | null>(null);

  const [editingPoint, setEditingPoint] = useState<{ point: SuperPoint, x: number, y: number } | null>(null);
  const [newSlopeStr, setNewSlopeStr] = useState("");
  const [isExtendingRamp, setIsExtendingRamp] = useState(false);
  const [extendDistance, setExtendDistance] = useState("");
  const [extendTargetSlope, setExtendTargetSlope] = useState("");

  type MeasurePoint = { station: number, yPos: number };
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureMode, setMeasureMode] = useState<'idle' | 'start' | 'end' | 'done'>('idle');
  const [measureStart, setMeasureStart] = useState<MeasurePoint | null>(null);
  const [measureEnd, setMeasureEnd] = useState<MeasurePoint | null>(null);

  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportExaggeration, setExportExaggeration] = useState(5);

  const speed = data.designSpeed || 80;
  const norm = data.norm || 'DNIT';
  const maxRamp = getRmax(speed, norm);

  const handlePointClick = (event: React.MouseEvent, p: SuperPoint) => {
    event.stopPropagation();
    if (containerRef.current) {
      const bounds = containerRef.current.getBoundingClientRect();
      setEditingPoint({
         point: p,
         x: event.clientX - bounds.left + 15,
         y: event.clientY - bounds.top - 20
      });
      setNewSlopeStr(p.slope.toFixed(2));
      setIsExtendingRamp(false);
      setExtendDistance("20");
      setExtendTargetSlope((p.slope === 0 ? 0 : -p.slope).toFixed(2)); // default suggestion: flip sign or 0
    }
  };

  const margin = { top: 80, right: 60, bottom: 80, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Compute domains
  const xDomain = useMemo(() => {
    if (minStationOverride !== undefined && maxStationOverride !== undefined) {
      return [minStationOverride, maxStationOverride];
    }

    let minStation = Infinity;
    let maxStation = -Infinity;
    
    if (data.geometries.length > 0) {
      minStation = Math.min(...data.geometries.map(g => g.startStation));
      maxStation = Math.max(...data.geometries.map(g => g.endStation));
    }
    
    if (data.superPoints.length > 0) {
      minStation = Math.min(minStation, ...data.superPoints.map(p => p.station));
      maxStation = Math.max(maxStation, ...data.superPoints.map(p => p.station));
    }

    // Add some padding
    const padding = (maxStation - minStation) * 0.05 || 100;
    return [Math.max(0, minStation - padding), maxStation + padding];
  }, [data, minStationOverride, maxStationOverride]);

  const yDomain = useMemo(() => {
    let maxSlope = 8;
    if (data.superPoints.length > 0) {
      const maxAbsP = Math.max(...data.superPoints.map(p => Math.abs(p.slope)));
      maxSlope = Math.max(8, Math.ceil(maxAbsP) + 1);
    }
    return [-maxSlope, maxSlope];
  }, [data]);

  // Scales
  const baseXScale = useMemo(() => d3.scaleLinear().domain(xDomain).range([0, innerWidth]), [xDomain, innerWidth]);
  const baseYScale = useMemo(() => d3.scaleLinear().domain(yDomain).range([innerHeight, 0]), [yDomain, innerHeight]);

  const xScale = useMemo(() => transform.rescaleX(baseXScale), [transform, baseXScale]);
  
  // AutoCAD usually has independent scaling for profiles or a fixed exaggeration.
  // We'll keep Y fixed to always fit the screen perfectly, and only zoom/pan on X.
  // This keeps the 0% axis perfectly centered!
  const yScale = baseYScale; 

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

  const notableStations = useMemo(() => {
    const stations = new Set<number>();
    data.geometries.forEach(g => {
      stations.add(g.startStation);
      stations.add(g.endStation);
      
      const startOff = lineOffsets[g.startStation] || { left: 0, right: 0 };
      if (startOff.left > 0) stations.add(g.startStation - startOff.left);
      if (startOff.right > 0) stations.add(g.startStation + startOff.right);
      
      const endOff = lineOffsets[g.endStation] || { left: 0, right: 0 };
      if (endOff.left > 0) stations.add(g.endStation - endOff.left);
      if (endOff.right > 0) stations.add(g.endStation + endOff.right);
    });
    return Array.from(stations);
  }, [data.geometries, lineOffsets]);

  // Set up dragging and zooming
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    
    // Select all draggables
    const dragHandler = d3.drag<SVGGElement, SuperPoint>()
      .on('drag', function(event, d) {
        // Reverse scale
        let newStation = xScale.invert(event.x);
        let newSlope = yScale.invert(event.y);
        
        // Snap logic for X axis (stations)
        const SNAP_PIXELS = 15;
        let snapStation = newStation;
        let minDist = Infinity;

        for (const st of notableStations) {
          const pxDist = Math.abs(xScale(st) - event.x);
          if (pxDist < SNAP_PIXELS && pxDist < minDist) {
             minDist = pxDist;
             snapStation = st;
          }
        }
        
        onPointMove(d.id, snapStation, newSlope);
      });

    // We apply drag by selecting the points rendered by React
    svg.selectAll('.drag-point').call(dragHandler as any);

    return () => {
      svg.selectAll('.drag-point').on('.drag', null);
    };
  }, [data, xScale, yScale, onPointMove, notableStations]);

  // Setup zoom
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
        setEditingPoint(null); // hide edit point when panning
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
    const mouseX = e.clientX - rect.left - margin.left;

    const transform = d3.zoomTransform(svgRef.current);
    const unzoomedX = (mouseX - transform.x) / transform.k;

    const station = baseXScale.invert?.(unzoomedX);
    if (typeof station === 'number') {
      const minS = Math.min(...data.geometries.map(g => g.startStation));
      const maxS = Math.max(...data.geometries.map(g => g.endStation));
      if (Number.isFinite(minS) && Number.isFinite(maxS)) {
        if (station >= minS && station <= maxS) {
          onHoverStation(station);
          return;
        }
      }
    }
    onHoverStation(null);
  };

  const handleMouseLeave = () => {
    if (onHoverStation) onHoverStation(null);
  };

  // Synchronize external zoom selection
  useEffect(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || !zoomedGeometryId) {
      if (!zoomedGeometryId) {
        // Optional: revert to fit when null, or just ignore. We'll leave it as is or fit.
      }
      return;
    }

    const geom = data.geometries.find(g => g.id === zoomedGeometryId);
    if (!geom) return;

    // geom width in base X
    const gMinX = baseXScale(geom.startStation);
    const gMaxX = baseXScale(geom.endStation);
    const gWidth = gMaxX - gMinX;
    
    if (gWidth <= 0) return;

    // Calculate scale so the geometry width + some padding fits in the innerWidth
    const paddingMultiplier = 1.3;
    const paddingPixels = 100;
    const targetScale = Math.min(innerWidth / (gWidth * paddingMultiplier), 20); // max zoom 20x

    // X center of the geometry in base scale
    const xCenter = (gMinX + gMaxX) / 2;

    // We want xCenter to be at innerWidth / 2
    // transformX * 1 + xCenter * targetScale = innerWidth / 2
    const transformX = innerWidth / 2 - xCenter * targetScale;

    const targetTransform = d3.zoomIdentity.translate(transformX, 0).scale(targetScale);

    d3.select(svgRef.current)
      .transition()
      .duration(750)
      .call(zoomBehaviorRef.current.transform, targetTransform);

  }, [zoomedGeometryId, data.geometries, baseXScale, innerWidth]);

  const leftPoints = useMemo(() => data.superPoints.filter(p => p.lane === 'left').sort((a,b) => a.station - b.station), [data.superPoints]);
  const rightPoints = useMemo(() => data.superPoints.filter(p => p.lane === 'right').sort((a,b) => a.station - b.station), [data.superPoints]);

  const generateShoulderPoints = (trackPoints: SuperPoint[], laneName: 'leftShoulder' | 'rightShoulder') => {
    if (trackPoints.length === 0) return [];
    
    const getShoulderSlope = (s: number) => {
      if (s <= -5) return s;
      if (s <= 2) return -5;
      return Math.max(-5, Math.min(-1, s - 7));
    };
    
    const result: SuperPoint[] = [];
    
    for (let i = 0; i < trackPoints.length; i++) {
      const p = trackPoints[i];
      
      if (i > 0) {
        const prev = trackPoints[i - 1];
        const minSlope = Math.min(prev.slope, p.slope);
        const maxSlope = Math.max(prev.slope, p.slope);
        
        const crossings = [];
        if (minSlope < -5 && maxSlope > -5) crossings.push(-5);
        if (minSlope < 2 && maxSlope > 2) crossings.push(2);
        
        crossings.sort((a, b) => {
          const tA = (a - prev.slope) / (p.slope - prev.slope);
          const tB = (b - prev.slope) / (p.slope - prev.slope);
          return tA - tB;
        });
        
        for (const crossVal of crossings) {
          const t = (crossVal - prev.slope) / (p.slope - prev.slope);
          const crossStation = prev.station + t * (p.station - prev.station);
          result.push({
            id: `${prev.id}-cross-${crossVal}`,
            station: crossStation,
            slope: getShoulderSlope(crossVal),
            lane: laneName
          });
        }
      }
      
      result.push({
        ...p,
        id: `${p.id}-shoulder`,
        lane: laneName,
        slope: getShoulderSlope(p.slope)
      });
    }
    
    return result;
  };

  const leftShoulderPoints = useMemo(() => generateShoulderPoints(leftPoints, 'leftShoulder'), [leftPoints]);
  const rightShoulderPoints = useMemo(() => generateShoulderPoints(rightPoints, 'rightShoulder'), [rightPoints]);

  const lineGenerator = d3.line<SuperPoint>()
    .x(p => xScale(p.station))
    .y(p => yScale(p.slope));

  const getContinuousRamps = (points: SuperPoint[]) => {
    const ramps: SuperPoint[][] = [];
    let current: SuperPoint[] = [];
    for (let i = 0; i < points.length; i++) {
      if (i === 0) {
        current.push(points[i]);
        continue;
      }
      const prev = points[i - 1];
      const slopeChange = Math.abs(points[i].slope - prev.slope);
      
      if (slopeChange > 0.001) {
        current.push(points[i]);
      } else {
        if (current.length > 1) {
          ramps.push(current);
        }
        current = [points[i]];
      }
    }
    if (current.length > 1) {
      ramps.push(current);
    }
    return ramps;
  };

  const leftRamps = useMemo(() => getContinuousRamps(leftPoints), [leftPoints]);
  const rightRamps = useMemo(() => getContinuousRamps(rightPoints), [rightPoints]);

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0 bg-white overflow-hidden font-mono select-none rounded-b-lg flex flex-col"
      onClick={() => {
        setEditingPoint(null);
        setSelectedStation(null);
      }}
    >
      {/* Chart Toolbar/Info */}
      {!minimal && (
        <div className="w-full shrink-0 px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50/50 z-20" onClick={e => e.stopPropagation()}>
           <span className="text-xs text-slate-500 font-sans hidden md:inline">Arraste os pontos para alterar a rampa de superelevação. Clique no ponto para editar.</span>
           <div className="flex items-center gap-6 ml-auto font-sans">
              <div className="flex gap-4 text-xs font-mono text-slate-700">
                 {data.trackType === 'Ramo' ? (
                  <div className="flex items-center gap-4">
                     <div className="flex items-center gap-1.5">
                        <span className={`w-3 h-0.5 rounded-full ${data.ramoAxis === 'right' ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
                        Pista do Ramo
                     </div>
                     <div className="flex items-center gap-1.5 opacity-70">
                        <span className={`w-3 h-0.5 rounded-full border border-dashed ${data.ramoAxis === 'right' ? 'bg-[#854d0e] border-[#854d0e]' : 'bg-[#991b1b] border-[#991b1b]'}`}></span>
                        Acost. do Ramo
                     </div>
                  </div>
               ) : (
                  <>
                     <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-yellow-500 rounded-full"></span> Pista Esq</div>
                     <div className="flex items-center gap-1.5 opacity-70"><span className="w-3 h-0.5 bg-[#854d0e] rounded-full border border-dashed border-[#854d0e]"></span> Acost. Esq</div>
                     <div className="flex items-center gap-1.5 ml-2"><span className="w-3 h-0.5 bg-red-500 rounded-full"></span> Pista Dir</div>
                     <div className="flex items-center gap-1.5 opacity-70"><span className="w-3 h-0.5 bg-[#991b1b] rounded-full border border-dashed border-[#991b1b]"></span> Acost. Dir</div>
                  </>
               )}
            </div>
            {/* Exportar DXF */}
            <button 
              className="h-7 flex items-center justify-center border rounded transition shadow-sm cursor-pointer px-3 gap-2 text-xs whitespace-nowrap bg-blue-600 hover:bg-blue-500 border-blue-600 text-white"
              onClick={(e) => {
                e.stopPropagation();
                setShowExportOptions(true);
              }}
              title="Exportar DXF para o Civil 3D"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar DXF</span>
            </button>
            {/* Medir Distância */}
            <button 
              className={cn("h-7 flex items-center justify-center border rounded transition shadow-sm cursor-pointer px-3 gap-2 text-xs whitespace-nowrap",
                isMeasuring || measureMode !== 'idle' ? "bg-red-600 hover:bg-red-500 border-red-500 text-white" : "bg-slate-100 border-slate-600 text-slate-800 hover:bg-slate-600 hover:text-slate-900"
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (isMeasuring || measureMode !== 'idle') {
                   setIsMeasuring(false);
                   setMeasureMode('idle');
                   setMeasureStart(null);
                   setMeasureEnd(null);
                } else {
                   setIsMeasuring(true);
                   setMeasureMode('start');
                   setMeasureStart(null);
                   setMeasureEnd(null);
                }
              }}
              title={isMeasuring || measureMode !== 'idle' ? "Cancelar Medição" : "Medir Distância"}
            >
              <Ruler className="w-3.5 h-3.5 text-inherit pointer-events-none" />
              <span>{isMeasuring || measureMode !== 'idle' ? "Cancelar Medição" : "Medir Distância"}</span>
            </button>
         </div>
      </div>
      )}

      {/* SVG Canvas goes here implicitly via absolute position but now we have a relative container within */}
      <div className="flex-1 relative w-full overflow-hidden">
      
      {/* Export Options Modal overlay */}
      {showExportOptions && (
        <div className="absolute inset-0 z-[300] flex items-center justify-center bg-white/50 backdrop-blur-sm" onClick={() => setShowExportOptions(false)}>
           <div className="bg-slate-50 border border-slate-300 p-5 rounded-lg shadow-xl outline-none" onClick={e => e.stopPropagation()}>
              <h3 className="text-white font-medium mb-4 text-sm">Exportar DXF</h3>
              <div className="flex flex-col gap-3 mb-6 font-sans">
                 <label className="text-slate-700 text-xs font-semibold uppercase tracking-wider">Exagero Vertical (Y)</label>
                 <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-sm">A cada variação de 1% em Y equivale a </span>
                    <input 
                      type="number" 
                      className="w-20 bg-white border border-slate-600 rounded px-2 py-1.5 text-slate-800 focus:outline-none focus:border-blue-600 text-center font-mono" 
                      value={exportExaggeration}
                      onChange={e => setExportExaggeration(Number(e.target.value) || 1)}
                    />
                    <span className="text-slate-500 text-sm">metros em X</span>
                 </div>
              </div>
              <div className="flex justify-end gap-3 font-sans">
                 <button 
                   className="px-4 py-2 rounded text-xs font-medium text-slate-700 border border-slate-600 hover:bg-slate-100 transition"
                   onClick={() => setShowExportOptions(false)}
                 >
                   Cancelar
                 </button>
                 <button 
                   className="px-4 py-2 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition flex items-center gap-2"
                   onClick={() => {
                     exportToDxf(data, 'SuperelevationChart.dxf', exportExaggeration);
                     setShowExportOptions(false);
                   }}
                 >
                   <Download className="w-3.5 h-3.5" /> Download DXF
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Offset Controls Overlay */}
      {selectedStation !== null && (
        <div 
          className="absolute z-20 bg-slate-50/90 border border-slate-300 p-2 rounded-lg shadow-lg backdrop-blur-sm flex gap-4"
          style={{
            left: Math.max(16, xScale(selectedStation) + 16),
            top: 60
          }}
          onClick={e => e.stopPropagation()}
        >
           <div className="flex flex-col gap-1">
             <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Offset Esq (m)</label>
             <input type="number" 
               className="w-20 bg-white border border-slate-600 rounded px-2 py-1 text-slate-800 text-sm focus:outline-none focus:border-blue-600" 
               value={lineOffsets[selectedStation]?.left || 0} 
               min={0}
               onChange={e => setLineOffsets(prev => ({ 
                 ...prev, 
                 [selectedStation]: { ...(prev[selectedStation] || { left: 0, right: 0 }), left: Math.max(0, Number(e.target.value)) } 
               }))} />
           </div>
           <div className="flex flex-col gap-1">
             <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Offset Dir (m)</label>
             <input type="number" 
               className="w-20 bg-white border border-slate-600 rounded px-2 py-1 text-slate-800 text-sm focus:outline-none focus:border-orange-500" 
               value={lineOffsets[selectedStation]?.right || 0} 
               min={0}
               onChange={e => setLineOffsets(prev => ({ 
                 ...prev, 
                 [selectedStation]: { ...(prev[selectedStation] || { left: 0, right: 0 }), right: Math.max(0, Number(e.target.value)) } 
               }))} />
           </div>
           <button className="self-start text-slate-500 hover:text-slate-900" onClick={() => setSelectedStation(null)} title="Fechar">x</button>
        </div>
      )}

      {/* Zoom Controls Overlay */}
      <div className="absolute right-4 top-16 flex flex-col gap-2 z-10 items-end">
        <button 
          className="w-8 h-8 flex items-center justify-center bg-slate-50 border border-slate-300 text-slate-700 rounded hover:bg-slate-100 hover:text-slate-900 transition shadow-lg"
            onClick={handleZoomIn}
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button 
            className="w-8 h-8 flex items-center justify-center bg-slate-50 border border-slate-300 text-slate-700 rounded hover:bg-slate-100 hover:text-slate-900 transition shadow-lg"
            onClick={handleZoomOut}
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button 
            className="w-8 h-8 flex items-center justify-center bg-slate-50 border border-slate-300 text-slate-700 rounded hover:bg-slate-100 hover:text-slate-900 transition shadow-lg"
            onClick={handleZoomFit}
            title="Centralizar Tudo"
          >
          <Maximize className="w-4 h-4" />
        </button>
      </div>

      {isMeasuring && (
         <div 
           className="absolute inset-x-0 bottom-0 top-[40px] z-20 cursor-crosshair"
           onClick={(e) => {
             e.stopPropagation();
             const rect = containerRef.current?.getBoundingClientRect();
             if (!rect) return;
             const x = e.clientX - rect.left - margin.left;
             const y = e.clientY - rect.top;
             
             const station = xScale.invert(x);
             
             if (measureMode === 'start') {
                 setMeasureStart({ station, yPos: y });
                 setMeasureEnd({ station, yPos: y });
                 setMeasureMode('end');
             } else if (measureMode === 'end') {
                 setMeasureMode('done');
                 setIsMeasuring(false);
             } else if (measureMode === 'done') {
                 // Restart
                 setMeasureStart({ station, yPos: y });
                 setMeasureEnd({ station, yPos: y });
                 setMeasureMode('end');
                 setIsMeasuring(true);
             }
           }}
           onMouseMove={(e) => {
             if (measureMode === 'end' && measureStart) {
                 const rect = containerRef.current?.getBoundingClientRect();
                 if (!rect) return;
                 const x = e.clientX - rect.left - margin.left;
                 
                 setMeasureEnd({ station: xScale.invert(x), yPos: measureStart.yPos });
             }
           }}
         />
      )}

      <svg ref={svgRef} width="100%" height="100%" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onMouseUp={(e) => {
          // No-op
      }} >
        <defs>
          <clipPath id="chart-clip">
            <rect x={0} y={-80} width={Math.max(0, innerWidth)} height={Math.max(0, innerHeight + 100)} />
          </clipPath>
        </defs>
        <g transform={`translate(${margin.left},${margin.top})`}>
          
          {/* Unclipped Y Axis labels */}
          <g>
            {yScale.ticks(12).map(tick => (
              <text key={`yd-${tick}`} x={-10} y={yScale(tick) + 4} fill="#94a3b8" textAnchor="end" fontSize={10}>
                {formatSlope(tick)}
              </text>
            ))}
          </g>

          {/* Clipped Chart Area */}
          <g clipPath="url(#chart-clip)">
            
            {/* Background Grid - Vertical */}
            {!minimal && xScale.ticks(Math.max(2, Math.floor(innerWidth / 100))).map(tick => (
              <g key={`xt-${tick}`} transform={`translate(${xScale(tick)}, 0)`}>
                <line y1={0} y2={innerHeight} stroke="#f1f5f9" strokeWidth={1} />
                <text y={innerHeight + 15} fill="#cbd5e1" textAnchor="middle" fontSize={10}>
                   {tick.toFixed(0)}m
                </text>
              </g>
            ))}

            {/* Horizontal Grid Lines */}
            {!minimal && yScale.ticks(12).map(tick => (
              <line key={`y-${tick}`} x1={0} x2={innerWidth} y1={yScale(tick)} y2={yScale(tick)} stroke="#e2e8f0" strokeWidth={1} />
            ))}

            {/* Geometry Bands (Top) */}
            {!minimal && (
              <g transform="translate(0, -60)">
                <line x1={0} x2={innerWidth} y1={20} y2={20} stroke="#22c55e" strokeWidth={1} />
              {data.geometries.map((geom) => {
                const xStart = xScale(geom.startStation);
                const xEnd = xScale(geom.endStation);
                const geomWidth = Math.max(0, xEnd - xStart);
                const isSelected = geom.id === zoomedGeometryId;
                const startOff = lineOffsets[geom.startStation] || { left: 0, right: 0 };

                return (
                  <g key={geom.id} transform={`translate(${xStart}, 0)`}>
                    {/* Invisible thick line for easy clicking */}
                    <line 
                      x1={0} x2={0} y1={10} y2={innerHeight + 60} 
                      stroke="transparent" strokeWidth={16} 
                      className="cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setSelectedStation(geom.startStation); }}
                    />
                    {/* Main Geometry line */}
                    <line x1={0} x2={0} y1={10} y2={innerHeight + 60} stroke="#22c55e" strokeWidth={1} strokeDasharray="4 4" opacity={0.4} className="pointer-events-none" />
                    <line x1={0} x2={0} y1={10} y2={30} stroke="#22c55e" strokeWidth={1} className="pointer-events-none" />
                    <text 
                      x={geomWidth / 2} 
                      y={15} 
                      fill={isSelected ? "#34d399" : "#22c55e"} 
                      textAnchor="middle" 
                      fontSize={12}
                      fontWeight={isSelected ? "bold" : "normal"}
                      className="cursor-pointer hover:underline transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGeometryClick?.(geom.id);
                      }}
                    >
                      {geom.name}
                    </text>
                    {geom.type === 'Curve' && geom.radius && geom.radius !== 0 ? (
                      <text x={geomWidth / 2} y={-5} fill="#ef4444" textAnchor="middle" fontSize={12} fontWeight="bold" className="pointer-events-none">
                        r={Math.round(Math.abs(geom.radius))}m
                      </text>
                    ) : null}
                    {geom.type === 'Spiral' && (
                      <text x={geomWidth / 2} y={-5} fill="#ef4444" textAnchor="middle" fontSize={12} fontWeight="bold" className="pointer-events-none">
                        {Math.round(geom.endStation - geom.startStation)}m
                      </text>
                    )}

                    {/* Left Offset Line */}
                    {startOff.left > 0 && (
                      <g transform={`translate(${-xScale(startOff.left) + xScale(0)}, 0)`} className="pointer-events-none">
                        <line x1={0} x2={0} y1={30} y2={innerHeight + 60} stroke="#3b82f6" strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
                        <text x={4} y={45} fill="#3b82f6" fontSize={10}>-Esq {startOff.left}m</text>
                      </g>
                    )}

                    {/* Right Offset Line */}
                    {startOff.right > 0 && (
                      <g transform={`translate(${xScale(startOff.right) - xScale(0)}, 0)`} className="pointer-events-none">
                        <line x1={0} x2={0} y1={30} y2={innerHeight + 60} stroke="#f97316" strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
                        <text x={4} y={45} fill="#f97316" fontSize={10}>+Dir {startOff.right}m</text>
                      </g>
                    )}
                  </g>
                );
              })}
              {/* Last tick for geometries */}
              {data.geometries.length > 0 && (() => {
                const geom = data.geometries[data.geometries.length - 1];
                const xEnd = xScale(geom.endStation);
                const endOff = lineOffsets[geom.endStation] || { left: 0, right: 0 };
                return (
                  <g transform={`translate(${xEnd}, 0)`}>
                    <line 
                      x1={0} x2={0} y1={10} y2={innerHeight + 60} 
                      stroke="transparent" strokeWidth={16} 
                      className="cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setSelectedStation(geom.endStation); }}
                    />
                    <line x1={0} x2={0} y1={10} y2={innerHeight + 60} stroke="#22c55e" strokeWidth={1} strokeDasharray="4 4" opacity={0.4} className="pointer-events-none" />
                    <line x1={0} x2={0} y1={10} y2={30} stroke="#22c55e" strokeWidth={1} className="pointer-events-none" />

                    {endOff.left > 0 && (
                      <g transform={`translate(${-xScale(endOff.left) + xScale(0)}, 0)`} className="pointer-events-none">
                        <line x1={0} x2={0} y1={30} y2={innerHeight + 60} stroke="#3b82f6" strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
                        <text x={4} y={45} fill="#3b82f6" fontSize={10}>-Esq {endOff.left}m</text>
                      </g>
                    )}

                    {endOff.right > 0 && (
                      <g transform={`translate(${xScale(endOff.right) - xScale(0)}, 0)`} className="pointer-events-none">
                        <line x1={0} x2={0} y1={30} y2={innerHeight + 60} stroke="#f97316" strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
                        <text x={4} y={45} fill="#f97316" fontSize={10}>+Dir {endOff.right}m</text>
                      </g>
                    )}
                  </g>
                );
              })()}
              </g>
            )}

            {/* Vertical Station Lines from Points */}
            {!minimal && data.superPoints.map((p) => {
               const cx = xScale(p.station);
               return (
                 <g key={`vline-${p.id}`} transform={`translate(${cx}, 0)`}>
                   <line y1={-20} y2={innerHeight} stroke="#166534" strokeWidth={1} strokeDasharray="4 2" />
                   <text y={-25} fill="#22c55e" textAnchor="middle" fontSize={10}>
                     {formatStation(p.station)}
                   </text>
                 </g>
               )
            })}

            {/* Zero Axis */}
            <line x1={0} x2={innerWidth} y1={yScale(0)} y2={yScale(0)} stroke="#22c55e" strokeWidth={1} />

            {/* Left Lane Line (Yellow) */}
            <path 
              d={lineGenerator(leftPoints) || ''} 
              fill="none" 
              stroke="#eab308" 
              strokeWidth={1.5}
            />

            {/* Right Lane Line (Red) */}
            <path 
              d={lineGenerator(rightPoints) || ''} 
              fill="none" 
              stroke="#ef4444" 
              strokeWidth={1.5}
            />

            {/* Left Shoulder Line */}
            <path 
              d={lineGenerator(leftShoulderPoints) || ''} 
              fill="none" 
              stroke="#854d0e" 
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />

            {/* Right Shoulder Line */}
            <path 
              d={lineGenerator(rightShoulderPoints) || ''} 
              fill="none" 
              stroke="#991b1b" 
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />

            {/* Ramp Rates */}
            {leftPoints.map((p, i) => {
              if (i === leftPoints.length - 1) return null;
              const nextP = leftPoints[i + 1];
              if (p.slope === nextP.slope) return null;
              const midX = (xScale(p.station) + xScale(nextP.station)) / 2;
              const midY = (yScale(p.slope) + yScale(nextP.slope)) / 2;
              const dist = Math.abs(nextP.station - p.station);
              const laneWidth = data.laneWidth || 3.6;
              const rate = dist > 0 ? ((nextP.slope - p.slope) / dist) * laneWidth : 0;
              const isExceeding = Math.abs(rate) > maxRamp + 0.001; // small epsilon to avoid float issues
              return (
                <g key={`l_rate_${i}`}>
                  <text x={midX} y={midY - 8} fill={isExceeding ? "#ef4444" : "#eab308"} fontSize={11} textAnchor="middle" className="pointer-events-none drop-shadow-md">
                    {rate > 0 ? '+' : ''}{rate.toFixed(2).replace('.', ',')}%
                  </text>
                  {isExceeding && (
                    <text x={midX} y={midY - 20} fill="#ef4444" fontSize={14} textAnchor="middle" className="pointer-events-none drop-shadow-md font-bold">
                      ⚠️
                    </text>
                  )}
                </g>
              );
            })}
            {rightPoints.map((p, i) => {
              if (i === rightPoints.length - 1) return null;
              const nextP = rightPoints[i + 1];
              if (p.slope === nextP.slope) return null;
              const midX = (xScale(p.station) + xScale(nextP.station)) / 2;
              const midY = (yScale(p.slope) + yScale(nextP.slope)) / 2;
              const dist = Math.abs(nextP.station - p.station);
              const laneWidth = data.laneWidth || 3.6;
              const rate = dist > 0 ? ((nextP.slope - p.slope) / dist) * laneWidth : 0;
              const isExceeding = Math.abs(rate) > maxRamp + 0.001;
              if (leftPoints.some((lp, j) => j < leftPoints.length - 1 && lp.station === p.station && leftPoints[j+1].station === nextP.station && lp.slope === p.slope && leftPoints[j+1].slope === nextP.slope)) {
                  // If left point segment is identical, slightly offset the right text vertically to avoid overlap
                  return (
                    <g key={`r_rate_${i}`}>
                      <text x={midX} y={midY + 16} fill={isExceeding ? "#ef4444" : "#f87171"} fontSize={11} textAnchor="middle" className="pointer-events-none drop-shadow-md">
                        {rate > 0 ? '+' : ''}{rate.toFixed(2).replace('.', ',')}%
                      </text>
                      {isExceeding && (
                        <text x={midX} y={midY + 28} fill="#ef4444" fontSize={14} textAnchor="middle" className="pointer-events-none drop-shadow-md font-bold">
                          ⚠️
                        </text>
                      )}
                    </g>
                  );
              }
              return (
                <g key={`r_rate_${i}`}>
                  <text x={midX} y={midY + 16} fill={isExceeding ? "#ef4444" : "#f87171"} fontSize={11} textAnchor="middle" className="pointer-events-none drop-shadow-md">
                    {rate > 0 ? '+' : ''}{rate.toFixed(2).replace('.', ',')}%
                  </text>
                  {isExceeding && (
                    <text x={midX} y={midY + 28} fill="#ef4444" fontSize={14} textAnchor="middle" className="pointer-events-none drop-shadow-md font-bold">
                      ⚠️
                    </text>
                  )}
                </g>
              );
            })}

            {/* Transition Dimensions */}
            {!minimal && (() => {
              const transitionDimensions: any[] = [];
              
              [...leftRamps, ...rightRamps].forEach(ramp => {
                const ys = ramp.map(p => p.slope);
                const minS = Math.min(...ys);
                const maxS = Math.max(...ys);
                
                // Only dimension the ramp if it goes from (or crosses) 0% up to the maximum slope
                // A valid transition ramp crosses 0 or starts at 0, and has an absolute peak > 0.1
                if (minS <= 0.001 && maxS >= -0.001) {
                  const maxAbsSlope = Math.max(...ramp.map(p => Math.abs(p.slope)));
                  if (maxAbsSlope < 0.1) return;
                  
                  const pPeak = ramp.find(p => Math.abs(p.slope) === maxAbsSlope);
                  if (!pPeak) return;
                  
                  let stZero = null;
                  for (let i = 0; i < ramp.length - 1; i++) {
                    const p1 = ramp[i];
                    const p2 = ramp[i + 1];
                    if ((p1.slope <= 0 && p2.slope >= 0) || (p1.slope >= 0 && p2.slope <= 0)) {
                      if (p1.slope === p2.slope) stZero = p1.station;
                      else {
                        const t = (0 - p1.slope) / (p2.slope - p1.slope);
                        stZero = p1.station + t * (p2.station - p1.station);
                      }
                      break;
                    }
                  }
                  
                  if (stZero !== null) {
                    const absL = Math.abs(pPeak.station - stZero);
                    const isDuplicate = transitionDimensions.some(d => Math.abs(d.stZero - stZero) < 0.1 && Math.abs(d.stMax - pPeak.station) < 0.1);
                    if (!isDuplicate && absL > 0.1) {
                      transitionDimensions.push({
                         stZero,
                         stMax: pPeak.station,
                         color: '#ff0000',
                         peakSlope: pPeak.slope,
                         ramp
                      });
                    }
                  }
                }
              });

              return transitionDimensions.map((dim, idx) => {
                const startX = xScale(Math.min(dim.stZero, dim.stMax));
                const endX = xScale(Math.max(dim.stZero, dim.stMax));
                const length = Math.abs(dim.stMax - dim.stZero);
                
                // Find highest Y point of this setup
                const minY = Math.min(yScale(0), yScale(dim.peakSlope)); // highest physical point on SVG
                const yPos = Math.min(-10, minY - 30); // 30 px above the highest point
                
                return (
                  <g key={`t-dim-${idx}`} className="pointer-events-none">
                    {/* Dimension Line */}
                    <line x1={startX} x2={endX} y1={yPos} y2={yPos} stroke={dim.color} strokeWidth={4} strokeLinecap="round" />
                    
                    {/* Length Text */}
                    <text x={(startX + endX) / 2} y={yPos - 8} fill={dim.color} fontSize={12} fontWeight="bold" textAnchor="middle" className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                      L = {Number(length.toFixed(2)) === Math.round(length) ? Math.round(length) : length.toFixed(2).replace('.', ',')}m
                    </text>
                    
                    {/* Ticks at 0% and Max% */}
                    <path d={`M${startX-5},${yPos+5} L${startX+5},${yPos-5}`} stroke={dim.color} strokeWidth={3} strokeLinecap="round" />
                    <path d={`M${endX-5},${yPos+5} L${endX+5},${yPos-5}`} stroke={dim.color} strokeWidth={3} strokeLinecap="round" />
                  </g>
                );
              });
            })()}

            {/* Justifications - Removed as requested */}

            {/* Lines & Points rendering */}
            {data.superPoints.map(p => {
              const cx = xScale(p.station);
              const cy = yScale(p.slope);
              const isLeft = p.lane === 'left';
              const color = isLeft ? '#eab308' : '#ef4444';

              return (
                <g 
                  key={p.id} 
                  transform={`translate(${cx}, ${cy})`} 
                  className="cursor-pointer drag-point"
                  ref={(node) => {
                    if (node) d3.select(node).datum(p);
                  }}
                  onClick={(e) => handlePointClick(e, p)}
                >
                  <circle 
                    r={5} 
                    fill={color} 
                    stroke="#f1f5f9" 
                    strokeWidth={2} 
                  />
                </g>
              );
            })}

            {/* Smart Labels renderer - places flat segment labels in the middle and avoids overlap */}
            {(() => {
              const renderLabels = (points: SuperPoint[], laneType: 'left' | 'right' | 'leftShoulder' | 'rightShoulder') => {
                const isLeft = laneType.startsWith('left');
                const isShoulder = laneType.includes('Shoulder');
                const color = isLeft ? (isShoulder ? '#854d0e' : '#eab308') : (isShoulder ? '#991b1b' : '#ef4444');
                const fontSize = isShoulder ? 10 : 12;
                const fontWeight = isShoulder ? "normal" : "bold";
                
                // left: above, right: below, leftShoulder: below, rightShoulder: above
                let yOffset = 0;
                if (laneType === 'left') yOffset = -10;
                else if (laneType === 'right') yOffset = 15;
                else if (laneType === 'leftShoulder') yOffset = 14;
                else if (laneType === 'rightShoulder') yOffset = -10;
                
                const elements = [];
                let i = 0;
                while (i < points.length) {
                   let j = i;
                   while (j < points.length && Math.abs(points[j].slope - points[i].slope) < 0.001) {
                       j++;
                   }
                   if (j - 1 > i) {
                       const midX = (xScale(points[i].station) + xScale(points[j-1].station)) / 2;
                       elements.push(
                            <text 
                                key={`label-flat-${laneType}-${points[i].id}-${points[j-1].id}`}
                                x={midX} 
                                y={yScale(points[i].slope) + yOffset} 
                                fill={color} 
                                textAnchor="middle" 
                                fontSize={fontSize}
                                fontWeight={fontWeight}
                              >
                                {formatSlope(points[i].slope)}
                              </text>
                       );
                   } else {
                       elements.push(
                           <text 
                                key={`label-point-${laneType}-${points[i].id}`}
                                x={xScale(points[i].station)} 
                                y={yScale(points[i].slope) + yOffset} 
                                fill={color} 
                                textAnchor="middle" 
                                fontSize={fontSize}
                                fontWeight={fontWeight}
                              >
                                {formatSlope(points[i].slope)}
                              </text>
                       )
                   }
                   i = j;
                }
                return elements;
              };

              return (
                <>
                  {renderLabels(leftPoints, 'left')}
                  {renderLabels(rightPoints, 'right')}
                  {renderLabels(leftShoulderPoints, 'leftShoulder')}
                  {renderLabels(rightShoulderPoints, 'rightShoulder')}
                </>
              );
            })()}
            
            {/* Measure Line Drawing */}
            {measureStart !== null && measureEnd !== null && (
              <g className="pointer-events-none">
                 <line 
                    x1={xScale(measureStart.station)} x2={xScale(measureEnd.station)} 
                    y1={measureStart.yPos - margin.top} y2={measureStart.yPos - margin.top} 
                    stroke="#ef4444" strokeWidth={2} 
                 />
                 {/* Arrows */}
                 <polygon points={`${xScale(measureStart.station)},${measureStart.yPos - margin.top} ${xScale(measureStart.station) + (measureEnd.station > measureStart.station ? 10 : -10)},${measureStart.yPos - margin.top - 5} ${xScale(measureStart.station) + (measureEnd.station > measureStart.station ? 10 : -10)},${measureStart.yPos - margin.top + 5}`} fill="#ef4444" />
                 <polygon points={`${xScale(measureEnd.station)},${measureStart.yPos - margin.top} ${xScale(measureEnd.station) + (measureStart.station > measureEnd.station ? 10 : -10)},${measureStart.yPos - margin.top - 5} ${xScale(measureEnd.station) + (measureStart.station > measureEnd.station ? 10 : -10)},${measureStart.yPos - margin.top + 5}`} fill="#ef4444" />
                 
                 {/* Text stroke for readability */}
                 <text 
                   x={(xScale(measureStart.station) + xScale(measureEnd.station)) / 2} 
                   y={measureStart.yPos - margin.top - 10} 
                   fill="#ffffff" 
                   stroke="#64748b"
                   strokeWidth={4}
                   strokeLinejoin="round"
                   textAnchor="middle" 
                   fontWeight="bold"
                   fontSize={12}
                 >
                   {Math.abs(measureEnd.station - measureStart.station).toFixed(2)}m
                 </text>
                 <text 
                   x={(xScale(measureStart.station) + xScale(measureEnd.station)) / 2} 
                   y={measureStart.yPos - margin.top - 10} 
                   fill="#ef4444" 
                   textAnchor="middle" 
                   fontWeight="bold"
                   fontSize={12}
                 >
                   {Math.abs(measureEnd.station - measureStart.station).toFixed(2)}m
                 </text>
                 
                 <line x1={xScale(measureStart.station)} x2={xScale(measureStart.station)} y1={measureStart.yPos - margin.top - 20} y2={measureStart.yPos - margin.top + 20} stroke="#ef4444" strokeWidth={1} strokeDasharray="2 2" />
                 <line x1={xScale(measureEnd.station)} x2={xScale(measureEnd.station)} y1={measureStart.yPos - margin.top - 20} y2={measureStart.yPos - margin.top + 20} stroke="#ef4444" strokeWidth={1} strokeDasharray="2 2" />
              </g>
            )}

            {hoveredStation !== null && hoveredStation !== undefined && (
              <g transform={`translate(${xScale(hoveredStation)}, 0)`} className="pointer-events-none">
                <line y1={0} y2={innerHeight} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 4" />
                <rect x={-40} y={-20} width={80} height={16} rx={2} fill="#ef4444" opacity={0.8} />
                <text y={-8} fill="#334155" textAnchor="middle" fontSize={10} fontFamily="monospace" fontWeight="bold">
                   Estaca {hoveredStation.toFixed(2).replace('.', ',')}
                </text>
              </g>
            )}

          </g>

        </g>
      </svg>

      {/* Edit Popup */}
      {editingPoint && (
        <div
          className={cn(
            "absolute bg-slate-50 border border-slate-600 rounded-md shadow-xl p-3 z-[300] flex flex-col gap-2 w-52",
            editingPoint.x > width / 2 ? "-translate-x-full" : "",
            editingPoint.y > height / 2 ? "-translate-y-full" : ""
          )}
          style={{
            left: editingPoint.x + (editingPoint.x > width / 2 ? -10 : 10), 
            top: editingPoint.y + (editingPoint.y > height / 2 ? -10 : 10), 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-1">
            <div className="text-xs text-slate-700 font-semibold">
              {isExtendingRamp ? "Estender Rampa" : "Editar Superelevação"}
            </div>
            {!isExtendingRamp && onPointAdd && (
              <button 
                className="text-[10px] text-blue-600 hover:text-blue-300 underline"
                onClick={() => setIsExtendingRamp(true)}
              >
                Estender Rampa
              </button>
            )}
          </div>
          
          {isExtendingRamp ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500">Inclinação Alvo (%)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.1"
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-600 font-sans"
                    value={extendTargetSlope}
                    onChange={(e) => setExtendTargetSlope(e.target.value)}
                  />
                </div>
                <div className="flex gap-1 mt-1 justify-between">
                  <button
                    className="text-[9px] px-1.5 py-1 bg-slate-100 hover:bg-slate-600 rounded text-slate-700 w-full"
                    onClick={() => {
                      const pts = data.superPoints.filter(p => p.lane === editingPoint.point.lane).sort((a,b) => a.station - b.station);
                      const idx = pts.findIndex(p => p.id === editingPoint.point.id);
                      if (idx > 0) {
                        const prevPt = pts[idx - 1];
                        const distSegment = editingPoint.point.station - prevPt.station;
                        const target = parseFloat(extendTargetSlope);
                        if (distSegment !== 0 && !isNaN(target)) {
                          const rate = (editingPoint.point.slope - prevPt.slope) / distSegment;
                          if (Math.abs(rate) > 0.000001) {
                            const dist = (target - editingPoint.point.slope) / rate;
                            if (onPointAdd) {
                              onPointAdd({
                                station: editingPoint.point.station + dist,
                                slope: target,
                                lane: editingPoint.point.lane,
                                type: 'Extended'
                              });
                            }
                            setEditingPoint(null);
                          } else {
                            alert("A rampa anterior tem inclinação constante. Não é possível estender.");
                          }
                        }
                      } else {
                        alert("Não há ponto anterior para ler a rampa.");
                      }
                    }}
                    title="Estender com a inclinação do trecho anterior"
                  >
                    Criar c/ Rampa Ant.
                  </button>
                  <button
                    className="text-[9px] px-1.5 py-1 bg-slate-100 hover:bg-slate-600 rounded text-slate-700 w-full"
                    onClick={() => {
                      const pts = data.superPoints.filter(p => p.lane === editingPoint.point.lane).sort((a,b) => a.station - b.station);
                      const idx = pts.findIndex(p => p.id === editingPoint.point.id);
                      if (idx < pts.length - 1) {
                        const nextPt = pts[idx + 1];
                        const distSegment = nextPt.station - editingPoint.point.station;
                        const target = parseFloat(extendTargetSlope);
                        if (distSegment !== 0 && !isNaN(target)) {
                          const rate = (nextPt.slope - editingPoint.point.slope) / distSegment;
                          if (Math.abs(rate) > 0.000001) {
                            const dist = (target - editingPoint.point.slope) / rate;
                            if (onPointAdd) {
                              onPointAdd({
                                station: editingPoint.point.station + dist,
                                slope: target,
                                lane: editingPoint.point.lane,
                                type: 'Extended'
                              });
                            }
                            setEditingPoint(null);
                          } else {
                            alert("A rampa posterior tem inclinação constante. Não é possível estender.");
                          }
                        }
                      } else {
                        alert("Não há ponto posterior para ler a rampa.");
                      }
                    }}
                    title="Estender com a inclinação do trecho posterior"
                  >
                    Criar c/ Rampa Post.
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-600 font-sans"
                value={newSlopeStr}
                onChange={(e) => setNewSlopeStr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onPointMove(editingPoint.point.id, editingPoint.point.station, parseFloat(newSlopeStr) || 0);
                    setEditingPoint(null);
                  } else if (e.key === 'Escape') {
                    setEditingPoint(null);
                  }
                }}
                autoFocus
              />
              <span className="text-slate-500 text-sm">%</span>
            </div>
          )}

          <div className="flex gap-2 justify-end mt-2">
            <button
              className="text-xs px-2 py-1 text-slate-500 hover:text-slate-900 font-sans font-medium hover:bg-slate-100 rounded transition-colors"
              onClick={() => {
                if (isExtendingRamp) setIsExtendingRamp(false);
                else setEditingPoint(null);
              }}
            >
              {isExtendingRamp ? "Cancelar Extensão" : "Cancelar"}
            </button>
            {!isExtendingRamp && (
              <button
                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded font-sans font-medium transition-colors"
                onClick={() => {
                  onPointMove(editingPoint.point.id, editingPoint.point.station, parseFloat(newSlopeStr) || 0);
                  setEditingPoint(null);
                }}
              >
                Salvar
              </button>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

