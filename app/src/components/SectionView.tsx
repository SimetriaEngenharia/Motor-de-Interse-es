import { formatStation } from "./ProductionStudio";
import React, { useRef, useEffect, useState } from "react";
import { useStore } from "../store";
import { Layers } from "lucide-react";

export function SectionView({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const computedPoints = useStore((state) => state.computedPoints);
  const activeLinks = useStore((state) => state.activeLinks);
  const selectedElementId = useStore((state) => state.selectedElementId);
  const setSelectedElementId = useStore((state) => state.setSelectedElementId);
  const station = useStore((state) => state.station);
  const layers = useStore((state) => state.layers);
  const surface = useStore((state) => state.surface);
  const alignments = useStore((state) => state.alignments);
  const activeAlignmentId = useStore((state) => state.activeAlignmentId);

  const [dimensions, setDimensions] = useState({ w: 800, h: 400 });

  // Transform State for Pan/Zoom
  const [transform, setTransform] = useState({ scale: 1, dx: 0, dy: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [fitTrigger, setFitTrigger] = useState(0);

  const alignment =
    alignments.find((a) => a.id === activeAlignmentId) ||
    (alignments.length > 0 ? alignments[0] : null);
  const fg_elevation =
    alignment && alignment.profile.length > 0
      ? alignment.getElevationAtStation(station)
      : 0;

  // Reset view on trigger
  useEffect(() => {
    setTransform({ scale: 1, dx: 0, dy: 0 });
  }, [fitTrigger]);

  const activeRefElev = fg_elevation;
  const fgOffset = 0;

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

  // Viewport mapping (Section is usually centered, zero is top-center)
  const SCALE = 40 * transform.scale; // pixels per unit
  const oX = dimensions.w / 2 + transform.dx;
  const oY = dimensions.h / 3 + transform.dy;

  const toPx = (x: number, y: number) => ({
    cx: oX + (isNaN(x) ? 0 : x) * SCALE,
    cy: oY - ((isNaN(y) ? 0 : y) + (isNaN(fgOffset) ? 0 : fgOffset)) * SCALE, // relative to activeRefElev
  });

  // Dynamic Terrain (EG) Cross Section Logic deferred to requestAnimationFrame
  const [groundPath, setGroundPath] = useState("");

  useEffect(() => {
    if (!surface) {
      setGroundPath("");
      return;
    }

    const handle = requestAnimationFrame(() => {
      const worldW = 100; // Search 50 units left & right
      const steps = 80;

      const worldPt = alignment
        ? alignment.getPointAtStation(station)
        : { x: station, y: 0 };
      const orient = alignment
        ? alignment.getOrientationAtStation(station)
        : { nx: 0, ny: 1, tx: 1, ty: 0 };

      let gPath = "";
      for (let i = 0; i <= steps; i++) {
        const lat = (i / steps) * worldW - worldW / 2;
        const rX = worldPt.x + orient.nx * lat;
        const rY = worldPt.y + orient.ny * lat;
        const elev = surface.getElevation(rX, rY);

        if (elev !== null) {
          const localZ = elev - (fg_elevation || 0);
          const pt = toPx(lat, localZ);
          if (gPath === "") gPath = `M ${pt.cx} ${pt.cy}`;
          else gPath += ` L ${pt.cx} ${pt.cy}`;
        }
      }
      setGroundPath(gPath);
    });

    return () => cancelAnimationFrame(handle);
  }, [surface, station, alignment, fg_elevation, oX, oY, SCALE]);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-transparent overflow-hidden ${className || ""}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
    >
      <div className="absolute top-0 left-0 right-0 p-2 flex items-center justify-between border-b border-slate-300 bg-slate-50/80 backdrop-blur-sm z-10 pointer-events-none shadow-sm">
        <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs tracking-wide">
          <Layers size={14} className="text-blue-600" /> SECTION VIEW {alignment ? `(${alignment.name})` : ""}
        </div>
        <div className="flex items-center gap-4 pointer-events-auto">
          {alignment && (
            <select
              value={station}
              onChange={(e) => {
                const s = Number(e.target.value);
                useStore.getState().setStation(s);
              }}
              className="text-xs border border-slate-300 rounded px-1 py-0.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {Array.from({ length: Math.floor(alignment.length / 20) + 1 }).map((_, i) => {
                const s = i * 20;
                return (
                  <option key={s} value={s}>
                    Estaca {Math.floor(s / 20)} + {(s % 20).toFixed(3)} (STA {s.toFixed(2)})
                  </option>
                );
              })}
              {alignment.length % 20 !== 0 && (
                <option key={alignment.length} value={alignment.length}>
                  Estaca {Math.floor(alignment.length / 20)} + {(alignment.length % 20).toFixed(3)} (STA {alignment.length.toFixed(2)})
                </option>
              )}
            </select>
          )}
          <div className="text-slate-500 text-xs font-medium">
            Scale: 1:{Math.round(100 / (SCALE / 40))}
          </div>
          <div className="flex bg-slate-50 rounded pointer-events-auto shadow-xl border border-slate-300">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTransform((t) => ({ ...t, scale: t.scale * 1.2 }));
              }}
              className="px-2 py-1 hover:bg-slate-100 text-slate-700 font-mono text-sm border-r border-slate-300"
            >
              +
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTransform((t) => ({ ...t, scale: t.scale / 1.2 }));
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
      </div>

      <svg
        className={`flex-1 w-full h-full ${isDragging ? "cursor-grabbing" : "cursor-crosshair"}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelectedElementId(null);
        }}
      >
        <defs>
          <pattern
            id="sectionGridMinor"
            width={SCALE / 4}
            height={SCALE / 4}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${SCALE / 4} 0 L 0 0 0 ${SCALE / 4}`}
              fill="none"
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="1"
            />
          </pattern>
          <pattern
            id="sectionGridMajor"
            width={SCALE}
            height={SCALE}
            patternUnits="userSpaceOnUse"
          >
            <rect width={SCALE} height={SCALE} fill="url(#sectionGridMinor)" />
            <path
              d={`M ${SCALE} 0 L 0 0 0 ${SCALE}`}
              fill="none"
              stroke="rgba(0,0,0,0.05)"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        {/* Grid Background aligned to origin */}
        <rect
          x={oX % (SCALE / 4)}
          y={((oY + activeRefElev * SCALE) % (SCALE / 4)) - SCALE / 4}
          width="200%"
          height="200%"
          fill="url(#sectionGridMajor)"
        />

        {/* Y Axis Ruler */}
        {(() => {
          let elevStep = 0.1;
          const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
          for (const s of steps) {
            if (s * SCALE >= 25) {
              elevStep = s;
              break;
            }
          }
          
          const minElev = activeRefElev + (oY - dimensions.h) / SCALE;
          const maxElev = activeRefElev + oY / SCALE;
          const startElev = Math.floor(minElev / elevStep) * elevStep - elevStep;
          
          const ticks = [];
          for (let elev = startElev; elev <= maxElev + elevStep * 2; elev += elevStep) {
            const y = oY - (elev - activeRefElev) * SCALE;
            const isMajor = Math.abs(elev % (elevStep * 2)) < (elevStep / 4);
            ticks.push(
              <g key={`y-tick-${elev.toFixed(2)}`}>
                <line
                  x1="0"
                  y1={y}
                  x2={isMajor ? "16" : "8"}
                  y2={y}
                  stroke={
                    isMajor ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.15)"
                  }
                  strokeWidth="1"
                />
                <text
                  x={isMajor ? "20" : "12"}
                  y={y + 3}
                  fill={
                    isMajor ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)"
                  }
                  fontSize={isMajor ? "11" : "9"}
                >
                  {elev.toFixed(elevStep < 1 ? 1 : 0)}
                </text>
              </g>,
            );
          }
          return <g>{ticks}</g>;
        })()}

        {/* Centerline Axes */}
        <line
          x1={oX}
          y1="0"
          x2={oX}
          y2="100%"
          stroke="rgba(59, 130, 246, 0.4)"
          strokeWidth="1.5"
          strokeDasharray="10 5"
        />
        <line
          x1="0"
          y1={oY - fgOffset * SCALE}
          x2="100%"
          y2={oY - fgOffset * SCALE}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="1"
        />

        {/* Red Center Tracking Dot to explicitly show Grade Line Elevation Match */}
        {(() => {
          const { cx, cy } = toPx(0, 0);
          return (
            <g>
              <circle
                cx={cx}
                cy={cy}
                r="4"
                fill="#ef4444"
                className="pointer-events-none"
              />
              <text
                x={cx + 8}
                y={cy - 8}
                fill="#ef4444"
                fontSize="12"
                className="pointer-events-none font-bold drop-shadow-md"
              >
                Estaca {formatStation(station)}
              </text>
            </g>
          );
        })()}

        {/* Dynamic Ground Surface (EG) line relative to FG (Y=0) */}
        {groundPath && (
          <path
            d={groundPath}
            fill="none"
            stroke="#22c55e"
            strokeWidth="2"
            strokeDasharray="12 6"
            className="opacity-80"
          />
        )}

        {/* Render Links */}
        {activeLinks.map((link) => {
          const pt1 = computedPoints[link.p1];
          const pt2 = computedPoints[link.p2];
          if (!pt1 || !pt2) return null;
          const { cx: x1, cy: y1 } = toPx(pt1.x, pt1.y);
          const { cx: x2, cy: y2 } = toPx(pt2.x, pt2.y);
          const isSelected = selectedElementId === link.id;

          let strokeColor = "#cbd5e1";
          if (isSelected) strokeColor = "#3b82f6";
          else if (link.type === "cut" || link.offsetStyle === "cut") strokeColor = "#ef4444";
          else if (link.type === "fill" || link.offsetStyle === "fill") strokeColor = "#10b981";
          else if (link.type === "Pista") strokeColor = layers.find(l => l.id === "layer-pista")?.color || "#3f3f46";
          else if (link.type === "Acostamento") strokeColor = layers.find(l => l.id === "layer-acostamento")?.color || "#71717a";
          else if (link.type === "Guia" || link.type === "Sarjeta" || link.type === "New Jersey" || link.type === "Passeio" || link.type === "Meio Fio") strokeColor = layers.find(l => l.id === "layer-meiofio")?.color || "#d4d4d8";
          else if (link.type === "Aterro") strokeColor = layers.find(l => l.id === "layer-aterro")?.color || "#54A53B";
          else if (link.type === "Corte") strokeColor = layers.find(l => l.id === "layer-corte")?.color || "#DF3F6A";
          else if (link.type === "Banqueta") strokeColor = layers.find(l => l.id === "layer-banqueta")?.color || "#E59E42";
          else if (link.type === "Talude" || link.type === "Passeio") strokeColor = layers.find(l => l.id === "layer-talude")?.color || "#22c55e";
          else if (link.type === "Base") strokeColor = "#a1a1aa";
          else if (link.type === "Sub-base") strokeColor = "#d4d4d8";
          else if (link.type === "Foundation") strokeColor = "#71717a";

          return (
            <g
              key={link.id}
              className="group cursor-pointer"
              onClick={() => setSelectedElementId(link.id)}
            >
              {/* Hit area for selection */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth="15"
              />
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={strokeColor}
                strokeWidth={isSelected ? "4" : "2"}
              />
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 10}
                fill="#94a3b8"
                fontSize="10"
                textAnchor="middle"
                className={`transition-opacity ${isSelected ? "opacity-100 font-bold fill-blue-400" : "opacity-0 group-hover:opacity-100"}`}
              >
                {link.id}
              </text>
            </g>
          );
        })}

        {/* Render Points */}
        {Object.entries(computedPoints).map(([id, pt]) => {
          const { cx, cy } = toPx(pt.x, pt.y);
          const isSelected = selectedElementId === id;
          return (
            <g
              key={id}
              onClick={() => setSelectedElementId(id)}
              className="cursor-pointer group"
            >
              {/* Hover area */}
              <circle cx={cx} cy={cy} r="12" fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? "6" : "4"}
                fill={isSelected ? "#3b82f6" : (pt.label ? "#fbbf24" : "#f8fafc")}
                stroke={pt.label ? "#b45309" : "#64748b"}
                strokeWidth="2"
                className="transition-all"
              />
              {pt.label && (
                <text
                  x={cx}
                  y={cy - 10}
                  fill="#fbbf24"
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {pt.label}
                </text>
              )}
              <text
                x={cx + 10}
                y={cy + 4}
                fill="#cbd5e1"
                fontSize="11"
                fontWeight={isSelected ? "bold" : "normal"}
                className={`transition-opacity ${isSelected ? "opacity-100 fill-blue-400" : "opacity-0 group-hover:opacity-100"}`}
              >
                {id} ({pt.x.toFixed(2)}, {pt.y.toFixed(2)})
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
