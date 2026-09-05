import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useThree, ThreeEvent } from '@react-three/fiber';
import { MapControls, Grid, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useStore, evaluateAssemblyAtStation } from '../store';
import { buildIntersectionPolygon } from '../lib/intersection';
import { BookOpen, Moon, Eye, Layers, Compass } from 'lucide-react';

function CameraController() {
  const { planView2DTransform, setPlanView2DTransform, planViewDimensions } = useStore();
  const { camera, controls } = useThree() as any;
  const isDraggingRef = useRef(false);

  // Sync 2D transform TO 3D camera
  useEffect(() => {
    if (isDraggingRef.current) return;
    if (!controls) return;
    
    let transform = planView2DTransform;
    if (isNaN(transform.scale) || isNaN(transform.dx) || isNaN(transform.dy) || transform.scale === 0) {
        transform = { scale: 1, dx: 0, dy: 0 };
    }
    
    const screenW = planViewDimensions.w || window.innerWidth * 0.6;
    const screenH = planViewDimensions.h || window.innerHeight * 0.6;
    
    const cx = (screenW / 2 - transform.dx) / transform.scale;
    const cy = (transform.dy - screenH / 2) / transform.scale;
    
    camera.left = -screenW / 2;
    camera.right = screenW / 2;
    camera.top = screenH / 2;
    camera.bottom = -screenH / 2;
    camera.zoom = transform.scale;
    camera.position.set(cx, 1000, -cy);
    camera.near = 0.1;
    camera.far = 1000000;
    camera.updateProjectionMatrix();

    controls.target.set(cx, 0, -cy);
    controls.update();

  }, [planView2DTransform, planViewDimensions, controls, camera]);

  return null;
}

function BasePlane({ onPlaneClick, onPlaneMove, onPlaneUp }: any) {
  return (
    <mesh 
      rotation={[-Math.PI / 2, 0, 0]} 
      position={[0, 0, 0]} 
      onPointerDown={onPlaneClick}
      onPointerMove={onPlaneMove}
      onPointerUp={onPlaneUp}
    >
      <planeGeometry args={[10000000, 10000000]} />
      <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Cadastre3D() {
  const { cadastre } = useStore();
  
  if (!cadastre) return null;

  return (
    <group>
      {cadastre.map((layer, lIdx) => (
         <group key={lIdx}>
            {layer.entities.map((ent, eIdx) => {
               if (ent.type === 'LINE' || ent.type === 'POLYLINE' || ent.type === 'LWPOLYLINE') {
                  if (ent.vertices && ent.vertices.length > 1) {
                     const pts = ent.vertices.map((p: any) => new THREE.Vector3(p.x, 0, -p.y));
                     return <Line key={eIdx} points={pts} color={layer.color || "#94a3b8"} lineWidth={1} />;
                  }
               }
               return null;
            })}
         </group>
      ))}
    </group>
  );
}

function SurfaceLayer3D({ layer, showWireframe, styleMode }: { layer: any; showWireframe: boolean; styleMode: 'illustration' | 'cad' }) {
  const geo = useMemo(() => {
     if (!layer.surface) return null;
     
     const verts = new Float32Array(layer.surface.vertices.length);
     for (let i = 0; i < layer.surface.vertices.length; i += 3) {
         verts[i] = layer.surface.vertices[i];         // X
         verts[i+1] = layer.surface.vertices[i+2];     // Elev (Z in civil)
         verts[i+2] = -layer.surface.vertices[i+1];    // -Y (Northing to -Z in THREE)
     }
     
     const geometry = new THREE.BufferGeometry();
     geometry.setAttribute("position", new THREE.BufferAttribute(verts, 3));
     geometry.setIndex(new THREE.BufferAttribute(layer.surface.indices, 1));
     geometry.computeVertexNormals();
     return geometry;
  }, [layer.surface]);

  const boundaryLines = useMemo(() => {
     if (!layer.surface) return null;
     const lines = [];
     for (let i = 0; i < layer.surface.boundaryEdges.length; i += 2) {
         const i1 = layer.surface.boundaryEdges[i] * 3;
         const i2 = layer.surface.boundaryEdges[i+1] * 3;
         const p1 = new THREE.Vector3(layer.surface.vertices[i1], layer.surface.vertices[i1+2], -layer.surface.vertices[i1+1]);
         const p2 = new THREE.Vector3(layer.surface.vertices[i2], layer.surface.vertices[i2+2], -layer.surface.vertices[i2+1]);
         lines.push(p1, p2);
     }
     return new THREE.BufferGeometry().setFromPoints(lines);
  }, [layer.surface]);
  
  if (!layer.isVisible) return null;

  const isIllustration = styleMode === 'illustration';
  const groundColor = isIllustration ? "#86efac" : "#1e293b"; // Soft vibrant grass green in illustration mode

  return (
    <group>
      {geo && (
        <mesh geometry={geo} receiveShadow castShadow>
           <meshStandardMaterial 
             color={groundColor} 
             roughness={0.85} 
             wireframe={showWireframe} 
             transparent={showWireframe}
             opacity={showWireframe ? 0.4 : 1.0}
             side={THREE.DoubleSide} 
           />
        </mesh>
      )}
      {boundaryLines && (layer.showBoundary ?? true) && (
        <lineSegments geometry={boundaryLines}>
           <lineBasicMaterial color={isIllustration ? "#10b981" : "#eab308"} linewidth={2} />
        </lineSegments>
      )}
    </group>
  );
}

function Surface3D({ showWireframe, styleMode }: { showWireframe: boolean; styleMode: 'illustration' | 'cad' }) {
  const { surfaces } = useStore();
  
  return (
    <group>
      {surfaces.map(layer => (
        <SurfaceLayer3D key={layer.id} layer={layer} showWireframe={showWireframe} styleMode={styleMode} />
      ))}
    </group>
  );
}

function Alignment({ align }: { align: any }) {
  const { activeAlignmentId } = useStore();
  const isActive = align.id === activeAlignmentId;

  const points = useMemo(() => {
    const pts = [];
    for (let s = 0; s <= align.length; s += Math.max(5, align.length / 500)) {
      const p = align.getPointAtStation(s);
      const elev = align.getElevationAtStation(s);
      pts.push(new THREE.Vector3(p.x, elev + 0.1, -p.y));
    }
    const lastP = align.getPointAtStation(align.length);
    const lastElev = align.getElevationAtStation(align.length);
    pts.push(new THREE.Vector3(lastP.x, lastElev + 0.1, -lastP.y));
    return pts;
  }, [align, align.length]);

  return (
    <group>
      <Line
        points={points}
        color={isActive ? "#38bdf8" : "#94a3b8"}
        lineWidth={isActive ? 3 : 1.5}
        transparent
        opacity={0.7}
      />
    </group>
  );
}

function getLinkCategory(link: any): 'pista' | 'acostamento' | 'meiofio' | 'talude' | 'ignore' {
  if (!link) return 'pista';
  if (link.type === 'Base') return 'ignore'; // Hide underground links in 3D surface view

  if (link.type === 'Pista') return 'pista';
  if (link.type === 'Acostamento') return 'acostamento';
  if (link.type === 'Guia' || link.type === 'Sarjeta' || link.type === 'New Jersey' || link.type === 'Passeio' || link.type === 'Meio Fio') return 'meiofio';
  if (link.type === 'Talude' || link.type === 'Aterro' || link.type === 'Corte' || link.type === 'Banqueta') return 'talude';

  // Fallbacks by Code / ID
  const p1 = link.p1 || '';
  const p2 = link.p2 || '';
  const id = link.id || '';

  if (id.includes('Daylight') || p1 === 'P5' || p2 === 'P5' || p1 === 'P6' || p2 === 'P6') return 'talude';
  if (id.includes('Shoulder') || (p1 === 'P2' && p2 === 'P5') || (p1 === 'P3' && p2 === 'P6')) return 'acostamento';
  if (id.includes('Curb') || id.includes('Sidewalk')) return 'meiofio';
  if (p1 === 'P4' || p2 === 'P4' || Number(p1.slice(1)) > 6) return 'ignore';

  return 'pista';
}

export function Corridors3D({ 
  showMarkings = true, 
  styleMode = 'illustration' 
}: { 
  showMarkings?: boolean; 
  styleMode?: 'illustration' | 'cad'; 
}) {
  const { corridors, alignments, assemblies, surface, laneDirections } = useStore();
  const baselineVisibility = useStore((s: any) => s.baselineVisibility) as Record<string, boolean>;
  const corridorVisibility = useStore((s: any) => s.corridorVisibility) as Record<string, boolean>;

  const corridorElements = useMemo(() => {
    const meshes: React.ReactNode[] = [];
    const markings: React.ReactNode[] = [];

    const isIllustration = styleMode === 'illustration';
    
    // Clean, distinct material colors for 3D illustration
    const colorPista = isIllustration ? "#334155" : "#1f1f22";       // Dark asphalt slate
    const colorAcostamento = isIllustration ? "#475569" : "#27272a"; // Slightly lighter shoulder slate
    const colorMeioFio = isIllustration ? "#e2e8f0" : "#d4d4d8";     // Concrete off-white / light grey
    const colorTalude = isIllustration ? "#22c55e" : "#54a53b";      // Soft vibrant grass green

    corridors.forEach(corridor => {
      if (corridor.alignmentId && baselineVisibility?.[corridor.alignmentId] === false) return;
      if (corridorVisibility?.[corridor.id] === false) return;
      const alignment = alignments.find(a => a.id === corridor.alignmentId);
      if (!alignment) return;

      corridor.regions.forEach((region, rIdx) => {
        const assembly = assemblies.find(a => a.id === region.assemblyId);
        if (!assembly) return;

        // Buckets for separate category geometries
        const pistaVerts: number[] = [];
        const acostamentoVerts: number[] = [];
        const meiofioVerts: number[] = [];
        const taludeVerts: number[] = [];

        // Markings tracking
        const centerLinePointsL: THREE.Vector3[] = [];
        const centerLinePointsR: THREE.Vector3[] = [];
        const rightEdgeLinePoints: THREE.Vector3[] = [];
        const leftEdgeLinePoints: THREE.Vector3[] = [];
        const arrowGeometries: React.ReactNode[] = [];

        let prevResult: any = null;
        let prevStation = -1;

        // Sampling station steps (high resolution for 3D curves)
        const sampleStationsSet = new Set<number>();
        const step = corridor.frequency || useStore.getState().globalCorridorFrequency || 2;
        for (let s = region.startStation; s <= region.endStation; s += step) {
          sampleStationsSet.add(s);
        }
        sampleStationsSet.add(region.endStation);

        if (alignment.keyPoints) {
          alignment.keyPoints.forEach((kp) => {
            if (kp.sta >= region.startStation && kp.sta <= region.endStation) {
              sampleStationsSet.add(kp.sta);
            }
          });
        }
        

        const sampleStations = Array.from(sampleStationsSet).sort((a, b) => a - b);

        let distanceSinceLastArrow = 0;

        for (const currentS of sampleStations) {
          const result = evaluateAssemblyAtStation(
            currentS, assemblies, corridors, surface, alignments, alignment.id, region.id
          );
          if (!result) continue;

          const worldPt = alignment.getPointAtStation(currentS);
          const orientation = alignment.getOrientationAtStation(currentS);
          const alignElev = alignment.getElevationAtStation(currentS);

          const get3D = (code: string) => {
            const offset = result.points[code];
            if (!offset) return null;
            return {
              x: worldPt.x + orientation.nx * offset.x,
              y: alignElev + offset.y,
              z: -(worldPt.y + orientation.ny * offset.x)
            };
          };

          const p1 = get3D("P1"); // Centerline / Crown
          const p2 = get3D("P2"); // Right edge
          const p3 = get3D("P3"); // Left edge

          // Markings calculation:
          if (p1) {
            // Double yellow center lines: offset perpendicular by 0.12m
            const dyL_x = p1.x - orientation.nx * 0.12;
            const dyL_z = p1.z + orientation.ny * 0.12;
            const dyR_x = p1.x + orientation.nx * 0.12;
            const dyR_z = p1.z - orientation.ny * 0.12;

            centerLinePointsL.push(new THREE.Vector3(dyL_x, p1.y + 0.08, dyL_z));
            centerLinePointsR.push(new THREE.Vector3(dyR_x, p1.y + 0.08, dyR_z));
          }

          if (p2) {
            rightEdgeLinePoints.push(new THREE.Vector3(p2.x, p2.y + 0.08, p2.z));
          }
          if (p3) {
            leftEdgeLinePoints.push(new THREE.Vector3(p3.x, p3.y + 0.08, p3.z));
          }

          // Generate direction arrows every ~35m
          if (prevStation >= 0) {
            distanceSinceLastArrow += (currentS - prevStation);
            if (distanceSinceLastArrow >= 35 && p1 && p2 && p3) {
              distanceSinceLastArrow = 0;

              // Right lane arrow
              const midRx = (p1.x + p2.x) / 2;
              const midRy = (p1.y + p2.y) / 2 + 0.09;
              const midRz = (p1.z + p2.z) / 2;

              // Left lane arrow
              const midLx = (p1.x + p3.x) / 2;
              const midLy = (p1.y + p3.y) / 2 + 0.09;
              const midLz = (p1.z + p3.z) / 2;

              // Direction vectors along alignment
              const tx = orientation.tx;
              const tz = -orientation.ty;
              const nx = orientation.nx;
              const nz = -orientation.ny;

              const arrowKeyR = `${corridor.id}_${region.id}_right`;
              const arrowKeyL = `${corridor.id}_${region.id}_left`;
              const isBackwardR = laneDirections[arrowKeyR] === 'backward';
              const isBackwardL = laneDirections[arrowKeyL] === 'backward';

              const dirRx = isBackwardR ? -tx : tx;
              const dirRz = isBackwardR ? -tz : tz;
              const dirLx = isBackwardL ? -tx : tx;
              const dirLz = isBackwardL ? -tz : tz;

              // Realistic road traffic marking arrow helper in 3D
              const makeRoadArrow = (midX: number, midY: number, midZ: number, dX: number, dZ: number, keyStr: string) => {
                const headLen = 1.4;
                const headWid = 0.55;
                const stemWid = 0.18;
                const stemLen = 1.3;

                // Perpendicular normal vector in XZ plane
                const nVecX = -dZ;
                const nVecZ = dX;

                const tip = new THREE.Vector3(midX + dX * headLen, midY, midZ + dZ * headLen);
                const barbL = new THREE.Vector3(midX + nVecX * headWid, midY, midZ + nVecZ * headWid);
                const neckL = new THREE.Vector3(midX + dX * 0.15 + nVecX * stemWid, midY, midZ + dZ * 0.15 + nVecZ * stemWid);
                const tailL = new THREE.Vector3(midX - dX * stemLen + nVecX * stemWid, midY, midZ - dZ * stemLen + nVecZ * stemWid);
                const notch = new THREE.Vector3(midX - dX * (stemLen - 0.25), midY, midZ - dZ * (stemLen - 0.25));
                const tailR = new THREE.Vector3(midX - dX * stemLen - nVecX * stemWid, midY, midZ - dZ * stemLen - nVecZ * stemWid);
                const neckR = new THREE.Vector3(midX + dX * 0.15 - nVecX * stemWid, midY, midZ + dZ * 0.15 - nVecZ * stemWid);
                const barbR = new THREE.Vector3(midX - nVecX * headWid, midY, midZ - nVecZ * headWid);

                return (
                  <Line
                    key={keyStr}
                    points={[tip, barbL, neckL, tailL, notch, tailR, neckR, barbR, tip]}
                    color="#ffffff"
                    lineWidth={2.5}
                  />
                );
              };

              arrowGeometries.push(makeRoadArrow(midRx, midRy, midRz, dirRx, dirRz, `arrow-r-${currentS}`));
              arrowGeometries.push(makeRoadArrow(midLx, midLy, midLz, dirLx, dirLz, `arrow-l-${currentS}`));
            }
          }

          // Build link quad geometries
          if (prevResult && prevStation >= 0) {
            const prevWorld = alignment.getPointAtStation(prevStation);
            const prevOrientation = alignment.getOrientationAtStation(prevStation);
            const prevAlignElev = alignment.getElevationAtStation(prevStation);

            const getPrev3D = (code: string) => {
              const offset = prevResult!.points[code];
              if (!offset) return null;
              return {
                x: prevWorld.x + prevOrientation.nx * offset.x,
                y: prevAlignElev + offset.y,
                z: -(prevWorld.y + prevOrientation.ny * offset.x)
              };
            };

            result.links.forEach((link: any) => {
              const currP1 = get3D(link.p1);
              const currP2 = get3D(link.p2);
              const prevP1 = getPrev3D(link.p1);
              const prevP2 = getPrev3D(link.p2);

              if (currP1 && currP2 && prevP1 && prevP2) {
                const quad = [
                  prevP1.x, prevP1.y, prevP1.z,
                  currP1.x, currP1.y, currP1.z,
                  currP2.x, currP2.y, currP2.z,

                  prevP1.x, prevP1.y, prevP1.z,
                  currP2.x, currP2.y, currP2.z,
                  prevP2.x, prevP2.y, prevP2.z
                ];

                const category = getLinkCategory(link);
                if (category === 'pista') pistaVerts.push(...quad);
                else if (category === 'acostamento') acostamentoVerts.push(...quad);
                else if (category === 'meiofio') meiofioVerts.push(...quad);
                else if (category === 'talude') taludeVerts.push(...quad);
              }
            });
          }

          prevResult = result;
          prevStation = currentS;
        }

        // Helper to construct geometry and mesh
        const buildMesh = (verts: number[], color: string, key: string, roughness = 0.85) => {
          if (verts.length === 0) return null;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
          geo.computeVertexNormals();
          return (
            <mesh key={key} geometry={geo} receiveShadow castShadow>
              <meshStandardMaterial color={color} roughness={roughness} side={THREE.DoubleSide} />
            </mesh>
          );
        };

        const keyPrefix = `${corridor.id}-${rIdx}`;
        const meshPista = buildMesh(pistaVerts, colorPista, `${keyPrefix}-pista`, 0.85);
        const meshAcostamento = buildMesh(acostamentoVerts, colorAcostamento, `${keyPrefix}-acostamento`, 0.85);
        const meshMeioFio = buildMesh(meiofioVerts, colorMeioFio, `${keyPrefix}-meiofio`, 0.6);
        const meshTalude = buildMesh(taludeVerts, colorTalude, `${keyPrefix}-talude`, 0.95);

        if (meshPista) meshes.push(meshPista);
        if (meshAcostamento) meshes.push(meshAcostamento);
        if (meshMeioFio) meshes.push(meshMeioFio);
        if (meshTalude) meshes.push(meshTalude);

        // Add markings
        if (showMarkings) {
          const isInt = corridor.id.includes('int-');
          if (centerLinePointsL.length > 1) {
            markings.push(
              <Line
                key={`${keyPrefix}-center-l`}
                points={centerLinePointsL}
                color={isInt ? "#ffffff" : "#facc15"}
                lineWidth={3}
              />
            );
            if (!isInt) {
              markings.push(
                <Line
                  key={`${keyPrefix}-center-r`}
                  points={centerLinePointsR}
                  color="#facc15"
                  lineWidth={3}
                />
              );
            }
          }
          if (rightEdgeLinePoints.length > 1) {
            markings.push(
              <Line
                key={`${keyPrefix}-rt-edge`}
                points={rightEdgeLinePoints}
                color="#ffffff"
                lineWidth={2.5}
              />
            );
          }
          if (leftEdgeLinePoints.length > 1) {
            markings.push(
              <Line
                key={`${keyPrefix}-lt-edge`}
                points={leftEdgeLinePoints}
                color="#ffffff"
                lineWidth={2.5}
              />
            );
          }
          if (arrowGeometries.length > 0) {
            markings.push(...arrowGeometries);
          }
        }
      });
    });

    return [...meshes, ...markings];
  }, [corridors, alignments, assemblies, surface, laneDirections, showMarkings, styleMode, baselineVisibility, corridorVisibility]);

  return <group>{corridorElements}</group>;
}

function Intersections3D() {
  const store = useStore() as any;
  const { intersections, alignments, selectedIntersectionId, surface } = store;

  const meshes = useMemo(() => {
     const res: React.ReactNode[] = [];

     intersections.forEach((int: any) => {
        const mainAlign = alignments.find((a: any) => a.id === int.mainAlignmentId);
        const branchAlign = alignments.find((a: any) => a.id === int.branchAlignmentId);
        if (!mainAlign || !branchAlign) return;

        const M = mainAlign.getPointAtStation(int.mainStation);
        const isSelected = int.id === selectedIntersectionId;
        const isStart = int.branchStation < branchAlign.length / 2;

        const mainFwdStats = Math.min(int.mainStation + 100, mainAlign.length);
        const mainBackStats = Math.max(int.mainStation - 100, 0);
        const mainFwdWorld = mainAlign.getPointAtStation(mainFwdStats);
        const mainBackWorld = mainAlign.getPointAtStation(mainBackStats);

        const branchArmStats = isStart
          ? Math.min(int.branchStation + 100, branchAlign.length)
          : Math.max(int.branchStation - 100, 0);
        const branchArmWorld = branchAlign.getPointAtStation(branchArmStats);

        const mainRes = evaluateAssemblyAtStation(int.mainStation, store.assemblies, store.corridors, surface, alignments, int.mainAlignmentId);
        const branchRes = evaluateAssemblyAtStation(int.branchStation, store.assemblies, store.corridors, surface, alignments, int.branchAlignmentId);
        
        const getLaneW = (res: any) => Math.abs(res?.points['P2']?.x || res?.points['P3']?.x || 3.6);
        const getLaneWFallback = (alignId: string): number | null => {
            for (const c of store.corridors) {
                if (c.alignmentId === alignId && c.regions.length > 0) {
                   const r = c.regions[0];
                   const res = evaluateAssemblyAtStation(r.startStation + 0.01, store.assemblies, store.corridors, surface, alignments, alignId);
                   if (res) return getLaneW(res);
                }
            }
            return null;
        };

        const mainLaneW = mainRes ? getLaneW(mainRes) : (getLaneWFallback(int.mainAlignmentId) || 3.6);
        const branchLaneW = branchRes ? getLaneW(branchRes) : (getLaneWFallback(int.branchAlignmentId) || 3.6);

        const laneArms = [
            { id: "M-Fwd", p: mainFwdWorld, width: mainLaneW },
            { id: "M-Back", p: mainBackWorld, width: mainLaneW },
            { id: "B-Arm", p: branchArmWorld, width: branchLaneW },
        ];
        
        const radiusConfig = {
            "M-Back-B-Arm": int.leftRadius || 15,
            "B-Arm-M-Back": int.leftRadius || 15,
            "M-Fwd-B-Arm": int.rightRadius || 15,
            "B-Arm-M-Fwd": int.rightRadius || 15,
        };

        const mainDir = { x: mainFwdWorld.x - mainBackWorld.x, y: mainFwdWorld.y - mainBackWorld.y };
        const mLen = Math.hypot(mainDir.x, mainDir.y);
        mainDir.x /= mLen || 1; mainDir.y /= mLen || 1;

        const branchDirObj = branchAlign.getPointAtStation(int.branchStation + (isStart ? 10 : -10));
        const branchDir = { x: branchDirObj.x - M.x, y: branchDirObj.y - M.y };
        const bLen = Math.hypot(branchDir.x, branchDir.y);
        branchDir.x /= bLen || 1; branchDir.y /= bLen || 1;

        const mSlope = (int.mainCrossSlope ?? -2) / 100;
        const edgeMeshes: React.ReactNode[] = [];

        try {
            const result = buildIntersectionPolygon(M, laneArms, radiusConfig);
            
            const intersectLines = (p1: {x:number, y:number}, d1: {x:number, y:number}, p2: {x:number, y:number}, d2: {x:number, y:number}) => {
              const det = d1.x * d2.y - d1.y * d2.x;
              if (Math.abs(det) < 0.0001) return p1;
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const t = (dx * d2.y - dy * d2.x) / det;
              return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
            };

            const intersectRayLine = (rayOrg: {x:number, y:number}, rayDir: {x:number, y:number}, p1: {x:number, y:number}, p2: {x:number, y:number}) => {
              const v1 = { x: rayOrg.x - p1.x, y: rayOrg.y - p1.y };
              const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
              const v3 = { x: -rayDir.y, y: rayDir.x };
              const dot = v2.x * v3.x + v2.y * v3.y;
              if (Math.abs(dot) < 0.0001) return null;
              const t1 = (v2.x * v1.y - v2.y * v1.x) / dot;
              if (t1 >= -0.001) return { x: rayOrg.x + t1 * rayDir.x, y: rayOrg.y + t1 * rayDir.y };
              return null;
            };

            if (result && result.path) {
                result.edges.forEach((edge: any) => {
                   if (edge.arcInfo) {
                       const arc = edge.arcInfo;
                       const isT1Main = edge.id.startsWith("M-");
                       const T_main = isT1Main ? arc.T1 : arc.T2;
                       
                       const M_edge = intersectLines(T_main, mainDir, M, branchDir);
                       const M_branchFar = { x: M.x + branchDir.x * 200, y: M.y + branchDir.y * 200 };
                       
                       const Seg1 = { p1: T_main, p2: M_edge };
                       const Seg2 = { p1: M_edge, p2: M_branchFar };
     
                       const getElevQ = (Q: {x:number, y:number}, isMain: boolean) => {
                         if (isMain) {
                           const distM = (Q.x - M.x) * mainDir.x + (Q.y - M.y) * mainDir.y;
                           const mSta = int.mainStation + distM;
                           const baseE = mainAlign.getElevationAtStation(mSta) || (surface?.getElevation(M.x, M.y) || 0);
                           return baseE + mainLaneW * mSlope;
                         } else {
                           const distB = (Q.x - M.x) * branchDir.x + (Q.y - M.y) * branchDir.y;
                           const bSta = int.branchStation + (isStart ? distB : -distB);
                           return branchAlign.getElevationAtStation(bSta) || (surface?.getElevation(M.x, M.y) || 0);
                         }
                       };
     
                       const elevT1 = getElevQ(arc.T1, isT1Main);
                       const elevT2 = getElevQ(arc.T2, !isT1Main);
     
                       const steps = 15;
                       const startAng = Math.atan2(arc.T1.y - arc.center.y, arc.T1.x - arc.center.x);
                       const endAng = Math.atan2(arc.T2.y - arc.center.y, arc.T2.x - arc.center.x);
                       let sweep = endAng - startAng;
                       if (arc.sweep === 1 && sweep < 0) sweep += 2 * Math.PI;
                       if (arc.sweep === 0 && sweep > 0) sweep -= 2 * Math.PI;
     
                       const sections: { P: any, Q: any, elevP: number, elevQ: number }[] = [];
     
                       const M_edge_ang = Math.atan2(M_edge.y - arc.center.y, M_edge.x - arc.center.x);
                       let diff = M_edge_ang - startAng;
                       if (arc.sweep === 1 && diff < 0) diff += 2 * Math.PI;
                       if (arc.sweep === 0 && diff > 0) diff -= 2 * Math.PI;
                       let t_edge = diff / sweep;
                       
                       let t_values = [];
                       for (let s = 0; s <= steps; s++) { t_values.push(s / steps); }
                       if (t_edge > 0.001 && t_edge < 0.999) t_values.push(t_edge);
                       t_values.sort((a, b) => a - b);
     
                       for (const t of t_values) {
                         const ang = startAng + sweep * t;
                         const P = { x: arc.center.x + arc.R * Math.cos(ang), y: arc.center.y + arc.R * Math.sin(ang) };
                         const rayDir = { x: P.x - arc.center.x, y: P.y - arc.center.y };
                         
                         let Q;
                         let isOnMain = false;
                         
                         if (isT1Main) {
                             if (t <= t_edge + 0.0001) {
                               Q = intersectRayLine(arc.center, rayDir, Seg1.p1, Seg1.p2);
                               isOnMain = true;
                             } else {
                               Q = intersectRayLine(arc.center, rayDir, Seg2.p1, Seg2.p2);
                               isOnMain = false;
                             }
                         } else {
                             if (t <= t_edge + 0.0001) {
                               Q = intersectRayLine(arc.center, rayDir, Seg2.p1, Seg2.p2);
                               isOnMain = false;
                             } else {
                               Q = intersectRayLine(arc.center, rayDir, Seg1.p1, Seg1.p2);
                               isOnMain = true;
                             }
                         }
                         
                         if (!Q) {
                             if (Math.abs(t - t_edge) < 0.001) Q = M_edge;
                             else Q = P;
                         }
                         
                         sections.push({ P, Q, elevP: elevT1 + t * (elevT2 - elevT1), elevQ: getElevQ(Q, isOnMain) });
                       }
     
                       const verts = [];
                       for (let i = 0; i < sections.length - 1; i++) {
                         const s1 = sections[i];
                         const s2 = sections[i+1];
                         verts.push(s1.P.x, s1.elevP, -s1.P.y, s1.Q.x, s1.elevQ, -s1.Q.y, s2.P.x, s2.elevP, -s2.P.y);
                         verts.push(s1.Q.x, s1.elevQ, -s1.Q.y, s2.Q.x, s2.elevQ, -s2.Q.y, s2.P.x, s2.elevP, -s2.P.y);
                       }
     
                       const geo = new THREE.BufferGeometry();
                       geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
                       geo.computeVertexNormals();
     
                       edgeMeshes.push(
                         <mesh key={edge.id} geometry={geo} receiveShadow castShadow>
                           <meshStandardMaterial color={isSelected ? "#3b82f6" : "#334155"} side={THREE.DoubleSide} roughness={0.85} />
                         </mesh>
                       );
     
                       const pts = sections.map(s => new THREE.Vector3(s.P.x, s.elevP + 0.05, -s.P.y));
                       edgeMeshes.push(<Line key={`line-${edge.id}`} points={pts} color={isSelected ? "#38bdf8" : "#38bdf8"} lineWidth={3} />);
                   } else {
                       const m = edge.path.match(/M ([-\d.]+) ([-\d.]+)/);
                       const l = edge.path.match(/L ([-\d.]+) ([-\d.]+)/);
                       if (m && l) {
                           edgeMeshes.push(<Line key={edge.id} points={[
                               new THREE.Vector3(parseFloat(m[1]), 0.2, -parseFloat(m[2])),
                               new THREE.Vector3(parseFloat(l[1]), 0.2, -parseFloat(l[2])),
                           ]} color={isSelected ? "#38bdf8" : "#38bdf8"} lineWidth={3} />);
                       }
                   }
                });

                res.push(
                   <group key={int.id}>
                      {edgeMeshes}
                   </group>
                );
            }
        } catch (e) {}
     });

     return res;
  }, [intersections, alignments, selectedIntersectionId, surface]);

  return <group>{meshes}</group>;
}

function Points3DRenderer() {
  const { points3D } = useStore();
  if (!points3D || points3D.length === 0) return null;

  return (
    <group>
      {points3D.map(pt => {
        const ptColor = pt.color || "#10b981";
        return (
          <group key={pt.id} position={[pt.x, pt.z, -pt.y]}>
            <mesh>
              <sphereGeometry args={[0.5, 16, 16]} />
              <meshStandardMaterial color={ptColor} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Lines3DRenderer() {
  const { lines3D } = useStore();
  if (!lines3D || lines3D.length === 0) return null;

  return (
    <group>
      {lines3D.map((line) => {
        const p1 = new THREE.Vector3(line.p1.x, line.p1.z, -line.p1.y);
        const p2 = new THREE.Vector3(line.p2.x, line.p2.z, -line.p2.y);
        const lineColor = line.color || "#eab308";
        return (
          <Line
            key={line.id}
            points={[p1, p2]}
            color={lineColor}
            lineWidth={3}
          />
        );
      })}
    </group>
  );
}

export function PlanView3D({ className }: { className?: string }) {
   const store = useStore();
   const [dragState, setDragState] = useState<{index: number, alignId: string} | null>(null);
   const [drawCursorPos, setDrawCursorPos] = useState<THREE.Vector3 | null>(null);

   const [styleMode, setStyleMode] = useState<'illustration' | 'cad'>('illustration');
   const [showMarkings, setShowMarkings] = useState<boolean>(true);
   const [showWireframe, setShowWireframe] = useState<boolean>(false);

   useEffect(() => {
      const handleStart = (e: any) => setDragState(e.detail);
      document.body.addEventListener('startPIDrag', handleStart);
      
      const handleKeyDown = (e: KeyboardEvent) => {
         if (e.key === 'Enter') {
            const state = useStore.getState();
            if (state.interactionMode === 'draw_alignment_pi' || state.interactionMode === 'extend_alignment') {
               state.commitTempAlignment();
               state.setInteractionMode('none');
               setDrawCursorPos(null);
            }
         } else if (e.key === 'Escape') {
            const state = useStore.getState();
            if (state.interactionMode === 'draw_alignment_pi' || state.interactionMode === 'extend_alignment') {
               state.commitTempAlignment();
               state.setInteractionMode('none');
               setDrawCursorPos(null);
            }
         }
      };
      window.addEventListener('keydown', handleKeyDown);
      
      return () => {
         document.body.removeEventListener('startPIDrag', handleStart);
         window.removeEventListener('keydown', handleKeyDown);
      };
   }, []);

   const handlePlaneMove = (e: ThreeEvent<PointerEvent>) => {
       if (dragState) {
           store.updateActiveAlignmentPI(dragState.index, e.point.x, -e.point.z);
       }
       if ((store.interactionMode === 'draw_alignment_pi' || store.interactionMode === 'extend_alignment') && store.tempPIs.length > 0) {
           setDrawCursorPos(new THREE.Vector3(e.point.x, 0.1, e.point.z));
       } else if (drawCursorPos) {
           setDrawCursorPos(null);
       }
   };

   const handlePlaneUp = () => {
       if (dragState) {
          const align = store.alignments.find(a => a.id === dragState.alignId);
          if (align) {
              const pi = align.keyPoints[dragState.index];
              if (pi) {
                  store.checkAndCreateIntersection(dragState.alignId, dragState.index, pi.x, pi.y);
              }
          }
       }
       setDragState(null);
   };

   const handleResetCamera = () => {
      const activeAlign = store.alignments.find(a => a.id === store.activeAlignmentId) || store.alignments[0];
      if (activeAlign) {
        const midP = activeAlign.getPointAtStation(activeAlign.length / 2);
        store.setPlanView2DTransform({
          scale: 1.5,
          dx: (window.innerWidth * 0.6) / 2 - midP.x * 1.5,
          dy: midP.y * 1.5 + (window.innerHeight * 0.6) / 2,
        });
      }
   };

   const isIllustration = styleMode === 'illustration';
   const bgColor = isIllustration ? "#f0f9ff" : "#020617"; // Soft sky background vs CAD Navy

   return (
      <div className={`relative flex flex-col bg-slate-900 overflow-hidden ${className || 'flex-1'}`}>
         {/* Top Floating Control Toolbar */}
         <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/90 backdrop-blur-md shadow-md border border-slate-200/80 text-slate-800 font-semibold text-xs pointer-events-auto">
              <BookOpen size={16} className="text-emerald-500" />
              <span>Visualização 3D (Estilo Livro)</span>
            </div>

            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-white/90 backdrop-blur-md shadow-md border border-slate-200/80 text-xs pointer-events-auto">
              <button
                onClick={() => setStyleMode(styleMode === 'illustration' ? 'cad' : 'illustration')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                  styleMode === 'illustration' 
                    ? 'bg-emerald-600 text-white font-medium shadow-sm' 
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                title="Alternar entre Estilo Livro/Ilustração e CAD Escuro"
              >
                {styleMode === 'illustration' ? <BookOpen size={14} /> : <Moon size={14} />}
                <span>{styleMode === 'illustration' ? 'Livro / Ilustração' : 'CAD Escuro'}</span>
              </button>

              <button
                onClick={() => setShowMarkings(!showMarkings)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                  showMarkings ? 'bg-amber-500 text-white font-medium shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                title="Mostrar ou ocultar sinalização horizontal (faixa amarela, bordo e setas)"
              >
                <Eye size={14} />
                <span>Sinalização</span>
              </button>

              <button
                onClick={() => setShowWireframe(!showWireframe)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                  showWireframe ? 'bg-sky-500 text-white font-medium shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                title="Mostrar ou ocultar malha de triângulos TIN do terreno"
              >
                <Layers size={14} />
                <span>Triângulos</span>
              </button>

              <button
                onClick={handleResetCamera}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                title="Recentralizar visualização 3D na estrada"
              >
                <Compass size={14} />
                <span>Recentralizar</span>
              </button>
            </div>
         </div>
         
         <Canvas shadows orthographic camera={{ position: [0, 500, 0], zoom: 1, near: 0.1, far: 10000000 }}>
            <CameraController />
            <color attach="background" args={[bgColor]} />
            
            <Grid
              renderOrder={-1}
              position={[0, -0.2, 0]}
              infiniteGrid
              cellSize={20}
              cellThickness={0.5}
              sectionSize={100}
              sectionThickness={1.2}
              sectionColor={isIllustration ? "#cbd5e1" : "#334c80"}
              cellColor={isIllustration ? "#e2e8f0" : "#191933"}
              fadeDistance={30000}
            />

            {/* Base Grass Field Plane in Illustration Mode when no surface exists */}
            {isIllustration && store.surfaces.length === 0 && (
              <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[100000, 100000]} />
                <meshStandardMaterial color="#dcfce7" roughness={0.95} />
              </mesh>
            )}
            
            <BasePlane 
               onPlaneMove={handlePlaneMove} 
               onPlaneUp={handlePlaneUp} 
               onPlaneClick={(e: any) => {
                   if (store.interactionMode === 'draw_alignment_pi' || store.interactionMode === 'extend_alignment') {
                       e.stopPropagation();
                       if (e.nativeEvent.button === 2) {
                           store.commitTempAlignment();
                           if (store.interactionMode !== 'extend_alignment') {
                              store.setInteractionMode('none');
                           }
                           setDrawCursorPos(null);
                       } else if (e.nativeEvent.button === 0) {
                           store.addTempPI({ x: e.point.x, y: -e.point.z });
                           if (store.interactionMode === 'extend_alignment') {
                              store.commitTempAlignment();
                           }
                       }
                   }
               }}
            />

            <Surface3D showWireframe={showWireframe} styleMode={styleMode} />
            <Cadastre3D />

            {/* Alignments hidden in 3D as requested: "tire todas" */}
            
            {store.tempPIs.length > 0 && (
                <Line 
                   points={[
                       ...store.tempPIs.map(p => new THREE.Vector3(p.x, 0.1, -p.y)),
                       ...(drawCursorPos ? [drawCursorPos] : [])
                   ]}
                   color="#34d399"
                   lineWidth={2}
                   dashed
                   dashSize={1}
                />
            )}

            <Corridors3D showMarkings={showMarkings} styleMode={styleMode} />
            {/* <Intersections3D /> */}
            <Points3DRenderer />
            <Lines3DRenderer />
            
            <MapControls 
               makeDefault 
               maxPolarAngle={Math.PI / 2 - 0.05} 
               enabled={!dragState}
               screenSpacePanning={false}
            />

            {/* Lighting setup for 3D illustration rendering */}
            <ambientLight intensity={isIllustration ? 1.6 : 1.2} color="#ffffff" />
            <directionalLight 
               position={[1000, 2000, 1000]} 
               intensity={isIllustration ? 2.8 : 2.0} 
               color="#ffffff" 
               castShadow 
            />
            <directionalLight 
               position={[-1000, 1000, -1000]} 
               intensity={isIllustration ? 1.2 : 0.8} 
               color="#e0f2fe" 
            />
         </Canvas>
      </div>
   );
}
