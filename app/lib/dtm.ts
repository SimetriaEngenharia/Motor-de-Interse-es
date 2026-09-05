import Delaunator from 'delaunator';

export class SurfaceDTM {
  vertices: Float32Array; // [x,y,z, x,y,z, ...]
  indices: Int32Array; // [v1,v2,v3, v1,v2,v3, ...]
  
  minX = Infinity; maxX = -Infinity;
  minY = Infinity; maxY = -Infinity;
  minZ = Infinity; maxZ = -Infinity;

  // Spatial Index for fast Point-in-Triangle lookup
  gridCols = 150;
  gridRows = 150;
  gridSizeX = 1;
  gridSizeY = 1;
  grid: number[][] = []; 

  boundaryEdges: number[] = [];
  bGraph: Map<number, number[]> | null = null;
  boundaries: {x: number, y: number}[][] = []; // Explicit user-drawn boundaries

  constructor(points: Map<number, number[]>, faces: number[][]) {
    this.vertices = new Float32Array(points.size * 3);
    this.indices = new Int32Array(faces.length * 3);

    const idToIndex = new Map<number, number>();
    let vIdx = 0;

    // Calculate Bounds & populate vertices
    for (const [id, [y, x, z]] of points.entries()) {
      // LandXML typically exports Northing, Easting, Elev -> Y, X, Z
      this.vertices[vIdx * 3] = x;
      this.vertices[vIdx * 3 + 1] = y;
      this.vertices[vIdx * 3 + 2] = z;
      
      idToIndex.set(id, vIdx);

      if (x < this.minX) this.minX = x;
      if (x > this.maxX) this.maxX = x;
      if (y < this.minY) this.minY = y;
      if (y > this.maxY) this.maxY = y;
      if (z < this.minZ) this.minZ = z;
      if (z > this.maxZ) this.maxZ = z;

      vIdx++;
    }

    // Populate indices
    let iIdx = 0;
    for (const f of faces) {
      const v1 = idToIndex.get(f[0]) ?? 0;
      const v2 = idToIndex.get(f[1]) ?? 0;
      const v3 = idToIndex.get(f[2]) ?? 0;
        
      this.indices[iIdx * 3] = v1;
      this.indices[iIdx * 3 + 1] = v2;
      this.indices[iIdx * 3 + 2] = v3;
      
      iIdx++;
    }
    
    this.recalculateBoundaryEdges();
    this.buildSpatialIndex();
  }

  get width() { return this.maxX - this.minX; }
  get height() { return this.maxY - this.minY; }
  get centerX() { return this.minX + this.width / 2; }
  get centerY() { return this.minY + this.height / 2; }

  private buildSpatialIndex() {
    this.gridSizeX = this.width / this.gridCols;
    this.gridSizeY = this.height / this.gridRows;
    
    if (this.gridSizeX <= 0 || !isFinite(this.gridSizeX)) this.gridSizeX = 1;
    if (this.gridSizeY <= 0 || !isFinite(this.gridSizeY)) this.gridSizeY = 1;

    this.grid = new Array(this.gridCols * this.gridRows).fill(0).map(() => []);

    for (let i = 0; i < this.indices.length; i += 3) {
      const v1 = this.indices[i];
      const v2 = this.indices[i+1];
      const v3 = this.indices[i+2];

      const x1 = this.vertices[v1*3], y1 = this.vertices[v1*3+1];
      const x2 = this.vertices[v2*3], y2 = this.vertices[v2*3+1];
      const x3 = this.vertices[v3*3], y3 = this.vertices[v3*3+1];

      const minX = Math.min(x1, x2, x3);
      const maxX = Math.max(x1, x2, x3);
      const minY = Math.min(y1, y2, y3);
      const maxY = Math.max(y1, y2, y3);

      const cMin = Math.max(0, Math.floor((minX - this.minX) / this.gridSizeX));
      const cMax = Math.min(this.gridCols - 1, Math.floor((maxX - this.minX) / this.gridSizeX));
      const rMin = Math.max(0, Math.floor((minY - this.minY) / this.gridSizeY));
      const rMax = Math.min(this.gridRows - 1, Math.floor((maxY - this.minY) / this.gridSizeY));

      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          this.grid[r * this.gridCols + c].push(i);
        }
      }
    }
  }

  // Mutation methods for simple editing
  addPoint(x: number, y: number, z: number): boolean {
    const targetTri = this.findTriangleIndex(x, y);
    const currentVCount = this.vertices.length / 3;
    const vn = currentVCount;

    if (targetTri === -1) {
        // Find visible boundary edges
        const newTriangles = [];
        
        for (let i = 0; i < this.boundaryEdges.length; i += 2) {
            const ea = this.boundaryEdges[i];
            const eb = this.boundaryEdges[i+1];
            const ax = this.vertices[ea*3];
            const ay = this.vertices[ea*3+1];
            const bx = this.vertices[eb*3];
            const by = this.vertices[eb*3+1];

            // For edge a->b, interior is to the left.
            // P must be to the right of a->b. So cross product should be < 0
            const crossProduct = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
            
            if (crossProduct < -1e-5) {
                // Potential triangle: P, b, a (so b -> a -> P is CCW, order: eb, ea, vn)
                // Center check
                const cx = (x + bx + ax) / 3;
                const cy = (y + by + ay) / 3;
                if (this.findTriangleIndex(cx, cy) !== -1) continue;

                // Segment intersection check
                const segIntersects = (x1: number, y1: number, x2: number, y2: number, skipEnd: number) => {
                    for (let j = 0; j < this.boundaryEdges.length; j += 2) {
                        const ca = this.boundaryEdges[j];
                        const cb = this.boundaryEdges[j+1];
                        if (ca === skipEnd || cb === skipEnd) continue;
                        
                        const ox1 = this.vertices[ca*3];
                        const oy1 = this.vertices[ca*3+1];
                        const ox2 = this.vertices[cb*3];
                        const oy2 = this.vertices[cb*3+1];
                        
                        const ccw = (px1: number, py1: number, px2: number, py2: number, px3: number, py3: number) => {
                            return (py3 - py1) * (px2 - px1) > (py2 - py1) * (px3 - px1);
                        };
                        const inter1 = ccw(x1, y1, ox1, oy1, ox2, oy2) !== ccw(x2, y2, ox1, oy1, ox2, oy2);
                        const inter2 = ccw(x1, y1, x2, y2, ox1, oy1) !== ccw(x1, y1, x2, y2, ox2, oy2);
                        if (inter1 && inter2) return true;
                    }
                    return false;
                };

                if (!segIntersects(x, y, ax, ay, ea)) {
                    if (!segIntersects(x, y, bx, by, eb)) {
                        newTriangles.push(eb, ea, vn);
                    }
                }
            }
        }
        
        if (newTriangles.length === 0) {
            // Fallback: if no edge is completely visible (rare but possible due to precision),
            // just find the closest valid boundary edge that doesn't cross other edges.
            let bestDist = Infinity;
            let bestEdge = null;
            for (let i = 0; i < this.boundaryEdges.length; i += 2) {
                const ea = this.boundaryEdges[i];
                const eb = this.boundaryEdges[i+1];
                const ax = this.vertices[ea*3];
                const ay = this.vertices[ea*3+1];
                const bx = this.vertices[eb*3];
                const by = this.vertices[eb*3+1];
                
                const mx = (ax + bx) / 2;
                const my = (ay + by) / 2;
                const distSq = (mx - x) * (mx - x) + (my - y) * (my - y);
                if (distSq < bestDist) {
                    const cx = (x + bx + ax) / 3;
                    const cy = (y + by + ay) / 3;
                    if (this.findTriangleIndex(cx, cy) === -1) {
                        bestDist = distSq;
                        bestEdge = [ea, eb];
                    }
                }
            }
            if (!bestEdge) return false;
            newTriangles.push(bestEdge[1], bestEdge[0], vn);
        }

        const newVertices = new Float32Array(this.vertices.length + 3);
        newVertices.set(this.vertices);
        newVertices[vn * 3] = x;
        newVertices[vn * 3 + 1] = y;
        newVertices[vn * 3 + 2] = z;
        this.vertices = newVertices;

        const newIndices = new Int32Array(this.indices.length + newTriangles.length);
        newIndices.set(this.indices);
        for(let t=0; t<newTriangles.length; t++) {
            newIndices[this.indices.length + t] = newTriangles[t];
        }
        this.indices = newIndices;
        this.optimizeTriangulation();
        this.recalculateBoundaryEdges();
        this.recalculateBounds();
        this.buildSpatialIndex();
        return true;
    }

    const v1 = this.indices[targetTri];
    const v2 = this.indices[targetTri + 1];
    const v3 = this.indices[targetTri + 2];

    // Expand vertices array
    const newVertices = new Float32Array(this.vertices.length + 3);
    newVertices.set(this.vertices);
    newVertices[vn * 3] = x;
    newVertices[vn * 3 + 1] = y;
    newVertices[vn * 3 + 2] = z;
    this.vertices = newVertices;

    // We replace targetTri with [v1, v2, vn], and append [v2, v3, vn] and [v3, v1, vn]
    const newIndices = new Int32Array(this.indices.length + 6);
    newIndices.set(this.indices);
    
    // Replace original
    newIndices[targetTri] = v1;
    newIndices[targetTri + 1] = v2;
    newIndices[targetTri + 2] = vn;

    // Append 1
    newIndices[this.indices.length] = v2;
    newIndices[this.indices.length + 1] = v3;
    newIndices[this.indices.length + 2] = vn;

    // Append 2
    newIndices[this.indices.length + 3] = v3;
    newIndices[this.indices.length + 4] = v1;
    newIndices[this.indices.length + 5] = vn;

    this.indices = newIndices;

    this.optimizeTriangulation();
    this.recalculateBoundaryEdges();
    this.recalculateBounds();
    // Rebuild spatial index (could be optimized, but ok for now)
    this.buildSpatialIndex();
    return true;
  }

  removeTrianglesByLine(x1: number, y1: number, x2: number, y2: number): boolean {
    const newIndices = [];
    let changed = false;

    const ccw = (px1: number, py1: number, px2: number, py2: number, px3: number, py3: number) => {
        return (py3 - py1) * (px2 - px1) > (py2 - py1) * (px3 - px1);
    };

    const intersect = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => {
        return ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) && ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy);
    };

    const pointInTriangle = (px: number, py: number, tx1: number, ty1: number, tx2: number, ty2: number, tx3: number, ty3: number) => {
        const d1 = ccw(px, py, tx1, ty1, tx2, ty2);
        const d2 = ccw(px, py, tx2, ty2, tx3, ty3);
        const d3 = ccw(px, py, tx3, ty3, tx1, ty1);
        const has_neg = !(d1 && d2 && d3);
        const has_pos = (d1 || d2 || d3);
        return !(has_neg && has_pos);
    };

    for (let i = 0; i < this.indices.length; i += 3) {
      const v1 = this.indices[i], v2 = this.indices[i+1], v3 = this.indices[i+2];
      const tx1 = this.vertices[v1*3], ty1 = this.vertices[v1*3+1];
      const tx2 = this.vertices[v2*3], ty2 = this.vertices[v2*3+1];
      const tx3 = this.vertices[v3*3], ty3 = this.vertices[v3*3+1];

      const cross1 = intersect(x1, y1, x2, y2, tx1, ty1, tx2, ty2);
      const cross2 = intersect(x1, y1, x2, y2, tx2, ty2, tx3, ty3);
      const cross3 = intersect(x1, y1, x2, y2, tx3, ty3, tx1, ty1);

      const inside1 = pointInTriangle(x1, y1, tx1, ty1, tx2, ty2, tx3, ty3);
      const inside2 = pointInTriangle(x2, y2, tx1, ty1, tx2, ty2, tx3, ty3);

      if (cross1 || cross2 || cross3 || inside1 || inside2) {
          changed = true;
          // Triangle intersects the line, don't add to newIndices
      } else {
          newIndices.push(v1, v2, v3);
      }
    }

    if (changed) {
        this.indices = new Int32Array(newIndices);
        this.recalculateBoundaryEdges();
        this.buildSpatialIndex();
    }
    return changed;
  }

  removePoint(x: number, y: number): boolean {
    // Basic point removal - finds nearest point and creates a hole, then simplistic hole patching
    let nearestDist = Infinity;
    let nearestVIdx = -1;
    for (let i = 0; i < this.vertices.length / 3; i++) {
        const dx = this.vertices[i*3] - x;
        const dy = this.vertices[i*3+1] - y;
        const dist = dx*dx + dy*dy;
        if (dist < nearestDist) {
            nearestDist = dist;
            nearestVIdx = i;
        }
    }

    if (nearestVIdx === -1 || nearestDist > 100) return false; // Max 10m snap radius

    // Find all triangles connected to this vertex
    const connectedTris: number[] = []; // indices of the first element of each triangle
    for (let i = 0; i < this.indices.length; i += 3) {
      if (this.indices[i] === nearestVIdx || this.indices[i+1] === nearestVIdx || this.indices[i+2] === nearestVIdx) {
          connectedTris.push(i);
      }
    }

    if (connectedTris.length === 0) return false;

    // Simplistic approach: delete connected triangles, creating a hole. 
    // A robust ear clipping is needed to fill the hole, but simply leaving the hole is better than corrupt TIN.
    const newIndices = [];
    for (let i = 0; i < this.indices.length; i += 3) {
        if (!connectedTris.includes(i)) {
            newIndices.push(this.indices[i], this.indices[i+1], this.indices[i+2]);
        }
    }
    
    this.indices = new Int32Array(newIndices);
    this.recalculateBoundaryEdges();
    this.buildSpatialIndex();
    return true;
  }

  cutHole(x: number, y: number, radius: number): boolean {
    const radiusSq = radius * radius;
    const newIndices = [];
    let changed = false;

    // Filter out triangles whose centroids fall within the radius
    for (let i = 0; i < this.indices.length; i += 3) {
      const v1 = this.indices[i], v2 = this.indices[i+1], v3 = this.indices[i+2];
      
      const x1 = this.vertices[v1*3], y1 = this.vertices[v1*3+1];
      const x2 = this.vertices[v2*3], y2 = this.vertices[v2*3+1];
      const x3 = this.vertices[v3*3], y3 = this.vertices[v3*3+1];

      const cx = (x1 + x2 + x3) / 3;
      const cy = (y1 + y2 + y3) / 3;

      const distSq = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      
      if (distSq > radiusSq) {
          newIndices.push(v1, v2, v3);
      } else {
          changed = true;
      }
    }

    if (changed) {
        this.indices = new Int32Array(newIndices);
        this.recalculateBoundaryEdges();
        this.buildSpatialIndex();
    }
    return changed;
  }

  flipEdge(x: number, y: number): boolean {
    let nearestEdgeIdx = -1;
    let minEdgeDistSq = Infinity;
    let edgeV1 = -1;
    let edgeV2 = -1;

    // Find the edge closest to (x, y)
    for (let i = 0; i < this.indices.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        const vA = this.indices[i + j];
        const vB = this.indices[i + ((j + 1) % 3)];
        
        const ax = this.vertices[vA * 3], ay = this.vertices[vA * 3 + 1];
        const bx = this.vertices[vB * 3], by = this.vertices[vB * 3 + 1];
        
        // Point to line segment distance squared
        const l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
        let t = 0;
        if (l2 !== 0) {
           t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2));
        }
        const projX = ax + t * (bx - ax);
        const projY = ay + t * (by - ay);
        const distSq = (x - projX) * (x - projX) + (y - projY) * (y - projY);

        if (distSq < minEdgeDistSq) {
           minEdgeDistSq = distSq;
           nearestEdgeIdx = i;
           edgeV1 = vA;
           edgeV2 = vB;
        }
      }
    }

    if (edgeV1 === -1 || minEdgeDistSq > 100) return false; // 10m snap radius

    // Find the two triangles sharing this edge
    const sharedTriangles = [];
    for (let i = 0; i < this.indices.length; i += 3) {
      const vA = this.indices[i], vB = this.indices[i+1], vC = this.indices[i+2];
      if ((vA === edgeV1 || vB === edgeV1 || vC === edgeV1) &&
          (vA === edgeV2 || vB === edgeV2 || vC === edgeV2)) {
        sharedTriangles.push(i);
      }
    }

    if (sharedTriangles.length !== 2) return false; // Edge is not shared by exactly 2 triangles (boundary or error)

    const tri1 = sharedTriangles[0];
    const tri2 = sharedTriangles[1];

    // Find the opposite vertices
    let opp1 = -1, opp2 = -1;
    for (let j = 0; j < 3; j++) {
      if (this.indices[tri1 + j] !== edgeV1 && this.indices[tri1 + j] !== edgeV2) opp1 = this.indices[tri1 + j];
      if (this.indices[tri2 + j] !== edgeV1 && this.indices[tri2 + j] !== edgeV2) opp2 = this.indices[tri2 + j];
    }

    if (opp1 === -1 || opp2 === -1) return false;

    // Check if the quadrilateral is strictly convex
    const p1x = this.vertices[edgeV1 * 3], p1y = this.vertices[edgeV1 * 3 + 1];
    const p2x = this.vertices[edgeV2 * 3], p2y = this.vertices[edgeV2 * 3 + 1];
    const o1x = this.vertices[opp1 * 3], o1y = this.vertices[opp1 * 3 + 1];
    const o2x = this.vertices[opp2 * 3], o2y = this.vertices[opp2 * 3 + 1];

    // Intersection test for diagonals (edgeV1-edgeV2) and (opp1-opp2)
    const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
        return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
    };

    const intersect = ccw(p1x, p1y, p2x, p2y, o1x, o1y) !== ccw(p1x, p1y, p2x, p2y, o2x, o2y) &&
                      ccw(o1x, o1y, o2x, o2y, p1x, p1y) !== ccw(o1x, o1y, o2x, o2y, p2x, p2y);

    if (!intersect) return false; // Non-convex quadrilateral, flipping is invalid

    // Flip the edge
    // Old triangles: (edgeV1, edgeV2, opp1) and (edgeV2, edgeV1, opp2) (order may vary)
    // New triangles: (opp1, opp2, edgeV1) and (opp2, opp1, edgeV2)
    
    // To preserve winding order, we need to be careful. 
    // We can just construct them using opp1, edgeV1, opp2 and opp1, opp2, edgeV2 and rely on ccw check
    const ccw1 = ccw(o1x, o1y, p1x, p1y, o2x, o2y);
    const ccw2 = ccw(o1x, o1y, o2x, o2y, p2x, p2y);
    
    // Actually, simply:
    // T1: opp1, edgeV1, opp2
    // T2: opp2, edgeV2, opp1
    // Let's ensure CCW order
    const makeCCW = (vA: number, vB: number, vC: number) => {
        const ax = this.vertices[vA * 3], ay = this.vertices[vA * 3 + 1];
        const bx = this.vertices[vB * 3], by = this.vertices[vB * 3 + 1];
        const cx = this.vertices[vC * 3], cy = this.vertices[vC * 3 + 1];
        if (ccw(ax, ay, bx, by, cx, cy)) return [vA, vB, vC];
        return [vA, vC, vB];
    };

    const newT1 = makeCCW(opp1, edgeV1, opp2);
    const newT2 = makeCCW(opp2, edgeV2, opp1);

    this.indices[tri1] = newT1[0];
    this.indices[tri1 + 1] = newT1[1];
    this.indices[tri1 + 2] = newT1[2];

    this.indices[tri2] = newT2[0];
    this.indices[tri2 + 1] = newT2[1];
    this.indices[tri2 + 2] = newT2[2];

    this.buildSpatialIndex();
    return true;
  }

  getBoundaryPath(p1: {x: number, y: number}, p2: {x: number, y: number}): {x: number, y: number}[] {
    if (!this.bGraph) return [];

    const matchVertex = (p: {x: number, y: number}) => {
        let minD = Infinity;
        let minV = -1;
        for (let i = 0; i < this.boundaryEdges.length; i++) {
             const v = this.boundaryEdges[i];
             const ax = this.vertices[v*3], ay = this.vertices[v*3+1];
             const d = (ax-p.x)**2 + (ay-p.y)**2;
             if (d < minD) { minD = d; minV = v; }
        }
        return minV;
    };

    const start = matchVertex(p1);
    const end = matchVertex(p2);
    if (start === -1 || end === -1) return [];

    const q = [[start]];
    const visited = new Set<number>();
    visited.add(start);
    
    let bestPath: number[] = [];
    while(q.length > 0) {
        const path = q.shift()!;
        const u = path[path.length - 1];
        if (u === end) {
            bestPath = path;
            break;
        }
        
        for (const v of (this.bGraph.get(u) || [])) {
            if (!visited.has(v)) {
                visited.add(v);
                q.push([...path, v]);
            }
        }
    }

    return bestPath.map(v => ({ x: this.vertices[v*3], y: this.vertices[v*3+1] }));
  }

  extrapolateArea(drawnPoints: {x: number, y: number}[]): boolean {
      if (drawnPoints.length < 2) return false;
      
      const bp = this.getBoundaryPath(drawnPoints[0], drawnPoints[drawnPoints.length - 1]);
      if (bp.length < 2) return false;

      // Snap the drawn endpoints exactly to the matched boundary points
      drawnPoints[0] = { x: bp[0].x, y: bp[0].y };
      drawnPoints[drawnPoints.length - 1] = { x: bp[bp.length - 1].x, y: bp[bp.length - 1].y };

      const matchVertexOnBoundary = (p: {x: number, y: number}) => {
          let minD = Infinity; let minV = -1;
          for (const v of this.boundaryEdges) {
              const dx = this.vertices[v*3] - p.x;
              const dy = this.vertices[v*3+1] - p.y;
              const d = dx*dx + dy*dy;
              if (d < minD) { minD = d; minV = v; }
          }
          return minD < 1e-4 ? minV : -1;
      };

      const bpVertices = bp.map(p => {
          const idx = matchVertexOnBoundary(p);
          return {x: this.vertices[idx*3], y: this.vertices[idx*3+1], z: this.vertices[idx*3+2], origIdx: idx};
      });

      const newDrawnPts: {x: number, y: number, z: number, origIdx?: number}[] = [];
      const sampleDist = 10;
      for (let i = 0; i < drawnPoints.length - 1; i++) {
          const p1 = drawnPoints[i];
          const p2 = drawnPoints[i+1];
          const dist = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
          const steps = Math.max(1, Math.ceil(dist / sampleDist));
          for (let j = 0; j < steps; j++) {
              const x = p1.x + (p2.x - p1.x) * (j / steps);
              const y = p1.y + (p2.y - p1.y) * (j / steps);
              newDrawnPts.push({x, y, z: this.extrapolateZ(x, y)});
          }
      }
      const lastP = drawnPoints[drawnPoints.length - 1];
      newDrawnPts.push({x: lastP.x, y: lastP.y, z: this.extrapolateZ(lastP.x, lastP.y)});

      // Fix endpoint origIdx snapping
      if (bpVertices.length > 0 && newDrawnPts.length > 0) {
          newDrawnPts[0].origIdx = bpVertices[0].origIdx;
          newDrawnPts[newDrawnPts.length - 1].origIdx = bpVertices[bpVertices.length - 1].origIdx;
      }

      let expectedSign = 0;
      if (this.indices.length >= 3) {
          const v0 = this.indices[0] * 3, v1 = this.indices[1] * 3, v2 = this.indices[2] * 3;
          const ax = this.vertices[v0], ay = this.vertices[v0+1];
          const bx = this.vertices[v1], by = this.vertices[v1+1];
          const cx = this.vertices[v2], cy = this.vertices[v2+1];
          expectedSign = Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
      }

      const validTriangles: any[] = [];
      const addTri = (p1: any, p2: any, p3: any) => {
          if ((p1.x === p2.x && p1.y === p2.y) || 
              (p2.x === p3.x && p2.y === p3.y) || 
              (p3.x === p1.x && p3.y === p1.y)) return;
          
          if (expectedSign !== 0) {
              const curSign = Math.sign((p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x));
              if (curSign !== expectedSign && curSign !== 0) {
                  validTriangles.push([p1, p3, p2]);
                  return;
              }
          }
          validTriangles.push([p1, p2, p3]);
      };

      let i = 0; let j = 0;
      while (i < bpVertices.length - 1 || j < newDrawnPts.length - 1) {
          const u_curr = bpVertices[i];
          const u_next = i + 1 < bpVertices.length ? bpVertices[i+1] : null;
          const v_curr = newDrawnPts[j];
          const v_next = j + 1 < newDrawnPts.length ? newDrawnPts[j+1] : null;

          if (u_next && !v_next) {
              addTri(u_curr, v_curr, u_next);
              i++;
          } else if (!u_next && v_next) {
              addTri(u_curr, v_curr, v_next);
              j++;
          } else if (u_next && v_next) {
              const d1 = (u_next.x - v_curr.x)**2 + (u_next.y - v_curr.y)**2;
              const d2 = (u_curr.x - v_next.x)**2 + (u_curr.y - v_next.y)**2;
              if (d1 < d2) {
                  addTri(u_curr, v_curr, u_next);
                  i++;
              } else {
                  addTri(u_curr, v_curr, v_next);
                  j++;
              }
          }
      }

      if (validTriangles.length === 0) return false;

      let currentVCount = this.vertices.length / 3;
      for (const p of newDrawnPts) {
          if (p.origIdx === undefined) {
              p.origIdx = currentVCount++;
          }
      }

      const newVertices = new Float32Array(currentVCount * 3);
      newVertices.set(this.vertices);
      for (const p of newDrawnPts) {
          if (p.origIdx !== undefined && p.origIdx >= this.vertices.length / 3) {
              newVertices[p.origIdx * 3] = p.x;
              newVertices[p.origIdx * 3 + 1] = p.y;
              newVertices[p.origIdx * 3 + 2] = p.z;
          }
      }
      this.vertices = newVertices;

      const newIndices = new Int32Array(this.indices.length + validTriangles.length * 3);
      newIndices.set(this.indices);
      for (let k = 0; k < validTriangles.length; k++) {
          newIndices[this.indices.length + k*3] = validTriangles[k][0].origIdx;
          newIndices[this.indices.length + k*3 + 1] = validTriangles[k][1].origIdx;
          newIndices[this.indices.length + k*3 + 2] = validTriangles[k][2].origIdx;
      }
      this.indices = newIndices;

      this.optimizeTriangulation();
      this.recalculateBoundaryEdges();
      this.recalculateBounds();
      this.buildSpatialIndex();
      return true;
  }

  forceAddLineXY(x1: number, y1: number, x2: number, y2: number): boolean {
    const findNearest = (x: number, y: number) => {
        let nearestDist = Infinity;
        let nearestV = -1;
        for (let i = 0; i < this.vertices.length / 3; i++) {
            const dx = this.vertices[i*3] - x;
            const dy = this.vertices[i*3+1] - y;
            const dist = dx*dx + dy*dy;
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestV = i;
            }
        }
        return {v: nearestV, dist: nearestDist};
    };

    const uReq = findNearest(x1, y1);
    const vReq = findNearest(x2, y2);

    if (uReq.v === -1 || vReq.v === -1) return false;
    if (uReq.dist > 400 || vReq.dist > 400) return false;

    return this.forceAddLine(uReq.v, vReq.v);
  }

  forceAddLine(u: number, v: number): boolean {
    if (u === v) return false;

    const ux = this.vertices[u*3], uy = this.vertices[u*3+1];
    const vx = this.vertices[v*3], vy = this.vertices[v*3+1];

    const ccw = (px1: number, py1: number, px2: number, py2: number, px3: number, py3: number) => {
        return (py3 - py1) * (px2 - px1) > (py2 - py1) * (px3 - px1);
    };

    const segmentsIntersectStrict = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => {
        if ((ax === cx && ay === cy) || (ax === dx && ay === dy) ||
            (bx === cx && by === cy) || (bx === dx && by === dy)) return false;
        return ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) && 
               ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy);
    };

    const pointInTriangle = (px: number, py: number, tx1: number, ty1: number, tx2: number, ty2: number, tx3: number, ty3: number) => {
        const d1 = ccw(px, py, tx1, ty1, tx2, ty2);
        const d2 = ccw(px, py, tx2, ty2, tx3, ty3);
        const d3 = ccw(px, py, tx3, ty3, tx1, ty1);
        const has_neg = !(d1 && d2 && d3);
        const has_pos = (d1 || d2 || d3);
        return !(has_neg && has_pos);
    };

    const intersectedTris = new Set<number>();
    for (let i = 0; i < this.indices.length; i += 3) {
        const t1 = this.indices[i], t2 = this.indices[i+1], t3 = this.indices[i+2];
        if ((t1 === u && t2 === v) || (t2 === u && t1 === v) ||
            (t2 === u && t3 === v) || (t3 === u && t2 === v) ||
            (t3 === u && t1 === v) || (t1 === u && t3 === v)) {
            return false; // Edge already exists
        }

        const t1x = this.vertices[t1*3], t1y = this.vertices[t1*3+1];
        const t2x = this.vertices[t2*3], t2y = this.vertices[t2*3+1];
        const t3x = this.vertices[t3*3], t3y = this.vertices[t3*3+1];
        
        let intersects = false;
        if (segmentsIntersectStrict(ux, uy, vx, vy, t1x, t1y, t2x, t2y)) intersects = true;
        if (segmentsIntersectStrict(ux, uy, vx, vy, t2x, t2y, t3x, t3y)) intersects = true;
        if (segmentsIntersectStrict(ux, uy, vx, vy, t3x, t3y, t1x, t1y)) intersects = true;
        
        if (intersects) {
            intersectedTris.add(i);
        }
    }

    if (intersectedTris.size === 0) return false;

    const edgeCounts = new Map<string, number>();
    for (const tri of intersectedTris) {
         const t1 = this.indices[tri], t2 = this.indices[tri+1], t3 = this.indices[tri+2];
         for (const [a, b] of [[t1,t2], [t2,t3], [t3,t1]]) {
             const key = a < b ? `${a}-${b}` : `${b}-${a}`;
             edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
         }
    }
    
    const adj = new Map<number, number>();
    const allBoundaryVertices = new Set<number>();
    for (const tri of intersectedTris) {
         const t1 = this.indices[tri], t2 = this.indices[tri+1], t3 = this.indices[tri+2];
         for (const [a, b] of [[t1,t2], [t2,t3], [t3,t1]]) {
             const key = a < b ? `${a}-${b}` : `${b}-${a}`;
             if (edgeCounts.get(key) === 1) {
                 adj.set(a, b);
                 allBoundaryVertices.add(a);
                 allBoundaryVertices.add(b);
             }
         }
    }

    let startPoint = u;
    let endPoint = v;

    if (!adj.has(startPoint)) {
        // Find nearest boundary point to u
        let minDist = Infinity;
        for (const pt of allBoundaryVertices) {
            const dx = this.vertices[pt*3] - ux;
            const dy = this.vertices[pt*3+1] - uy;
            const dist = dx*dx + dy*dy;
            if (dist < minDist) { minDist = dist; startPoint = pt; }
        }
    }
    if (!allBoundaryVertices.has(endPoint)) {
        let minDist = Infinity;
        for (const pt of allBoundaryVertices) {
            const dx = this.vertices[pt*3] - vx;
            const dy = this.vertices[pt*3+1] - vy;
            const dist = dx*dx + dy*dy;
            if (dist < minDist) { minDist = dist; endPoint = pt; }
        }
    }
    
    if (startPoint === endPoint) return false;

    const path1 = [startPoint];
    let curr = startPoint;
    let maxIter = adj.size + 2;
    while (adj.get(curr) !== endPoint && maxIter > 0) {
        curr = adj.get(curr)!;
        if (curr === undefined) return false;
        path1.push(curr);
        maxIter--;
    }
    path1.push(endPoint);
    
    const path2 = [endPoint];
    curr = endPoint;
    maxIter = adj.size + 2;
    while (adj.get(curr) !== startPoint && maxIter > 0) {
        curr = adj.get(curr)!;
        if (curr === undefined) return false;
        path2.push(curr);
        maxIter--;
    }
    path2.push(startPoint);

    let targetSign = 1;
    if (this.indices.length >= 3) {
        const i0 = this.indices[0], i1 = this.indices[1], i2 = this.indices[2];
        const ax = this.vertices[i0*3], ay = this.vertices[i0*3+1];
        const bx = this.vertices[i1*3], by = this.vertices[i1*3+1];
        const cx = this.vertices[i2*3], cy = this.vertices[i2*3+1];
        const cross = (bx - ax)*(cy - ay) - (by - ay)*(cx - ax);
        targetSign = cross > 0 ? 1 : -1;
    }

    const triangulatePolygon = (poly: number[]) => {
        if (poly.length < 3) return [];
        const tris: number[] = [];
        let remaining = [...poly];
        let iter = 0;
        
        while (remaining.length > 3 && iter < remaining.length * 2) {
            let earFound = false;
            for (let i = 0; i < remaining.length; i++) {
                const prev = remaining[(i - 1 + remaining.length) % remaining.length];
                const curr = remaining[i];
                const next = remaining[(i + 1) % remaining.length];
                
                const px = this.vertices[prev*3], py = this.vertices[prev*3+1];
                const cx = this.vertices[curr*3], cy = this.vertices[curr*3+1];
                const nx = this.vertices[next*3], ny = this.vertices[next*3+1];
                
                const cross = (cx - px) * (ny - py) - (cy - py) * (nx - px);
                if (cross * targetSign <= 1e-5) continue; 
                
                let isEar = true;
                for (let j = 0; j < remaining.length; j++) {
                    if (j === i || j === (i - 1 + remaining.length) % remaining.length || j === (i + 1) % remaining.length) continue;
                    const pt = remaining[j];
                    const ptx = this.vertices[pt*3], pty = this.vertices[pt*3+1];
                    if (pointInTriangle(ptx, pty, px, py, cx, cy, nx, ny)) {
                        isEar = false;
                        break;
                    }
                }
                
                if (isEar) {
                    tris.push(prev, curr, next);
                    remaining.splice(i, 1);
                    earFound = true;
                    break;
                }
            }
            if (!earFound) {
                tris.push(remaining[0], remaining[1], remaining[2]);
                remaining.splice(1, 1);
            }
            iter++;
        }
        if (remaining.length === 3) {
            tris.push(remaining[0], remaining[1], remaining[2]);
        }
        return tris;
    };

    const tris1 = triangulatePolygon(path1);
    const tris2 = triangulatePolygon(path2);

    const newIndices = [];
    for (let i = 0; i < this.indices.length; i += 3) {
        if (!intersectedTris.has(i)) {
            newIndices.push(this.indices[i], this.indices[i+1], this.indices[i+2]);
        }
    }
    
    newIndices.push(...tris1, ...tris2);
    this.indices = new Int32Array(newIndices);
    
    this.recalculateBoundaryEdges();
    this.recalculateBounds();
    this.buildSpatialIndex();
    
    return true;
  }

  extrapolateLine(points: {x: number, y: number, z: number}[]): boolean {
    if (points.length < 2) return false;
    
    const baseVertexCount = this.vertices.length / 3;
    const newVertices = new Float32Array(this.vertices.length + points.length * 3);
    newVertices.set(this.vertices);
    for (let i = 0; i < points.length; i++) {
        newVertices[(baseVertexCount + i) * 3] = points[i].x;
        newVertices[(baseVertexCount + i) * 3 + 1] = points[i].y;
        newVertices[(baseVertexCount + i) * 3 + 2] = points[i].z;
    }
    
    // 1. Find closest boundary vertex for each point
    const bNodes = Array.from(this.bGraph?.keys() || []);
    if (bNodes.length === 0) return false;

    const closestB = points.map(p => {
        let minD = Infinity; let bestB = -1;
        for (const b of bNodes) {
            const bx = this.vertices[b*3], by = this.vertices[b*3+1];
            const d = (p.x - bx)**2 + (p.y - by)**2;
            if (d < minD) { minD = d; bestB = b; }
        }
        return bestB;
    });

    // 2. Build continuous boundary path W
    const W: number[] = [closestB[0]];
    for (let i = 0; i < closestB.length - 1; i++) {
        const start = closestB[i];
        const end = closestB[i+1];
        if (start === end) continue;
        
        const q: number[][] = [[start]];
        const visited = new Set<number>();
        visited.add(start);
        let foundPath: number[] | null = null;
        
        while(q.length > 0) {
            const path = q.shift()!;
            const u = path[path.length - 1];
            if (u === end) { foundPath = path; break; }
            if (path.length > 5000) continue; 
            
            for (const nxt of (this.bGraph?.get(u) || [])) {
                if (!visited.has(nxt)) {
                    visited.add(nxt);
                    q.push([...path, nxt]);
                }
            }
        }
        if (foundPath) {
            for (let j = 1; j < foundPath.length; j++) W.push(foundPath[j]);
        } else {
            W.push(end);
        }
    }

    const P = [];
    for (let i = 0; i < points.length; i++) P.push(baseVertexCount + i);

    const newTriangles: number[] = [];
    let targetSign = 1;
    if (this.indices.length >= 3) {
        const i0 = this.indices[0], i1 = this.indices[1], i2 = this.indices[2];
        const ax = this.vertices[i0*3], ay = this.vertices[i0*3+1];
        const bx = this.vertices[i1*3], by = this.vertices[i1*3+1];
        const cx = this.vertices[i2*3], cy = this.vertices[i2*3+1];
        const cross = (bx - ax)*(cy - ay) - (by - ay)*(cx - ax);
        targetSign = cross >= 0 ? 1 : -1;
    }

    const addTri = (i1: number, i2: number, i3: number) => {
        const ax = newVertices[i1*3], ay = newVertices[i1*3+1];
        const bx = newVertices[i2*3], by = newVertices[i2*3+1];
        const cx = newVertices[i3*3], cy = newVertices[i3*3+1];
        // Triangle 2D cross product check
        const cross = (bx - ax)*(cy - ay) - (by - ay)*(cx - ax);
        if ((cross >= 0 ? 1 : -1) === targetSign) {
            newTriangles.push(i1, i2, i3);
        } else {
            newTriangles.push(i1, i3, i2);
        }
    };

    let i = 0;
    let j = 0;
    while(i < P.length - 1 || j < W.length - 1) {
        if (i === P.length - 1) {
            addTri(P[i], W[j+1], W[j]);
            j++;
        } else if (j === W.length - 1) {
            addTri(P[i], P[i+1], W[j]);
            i++;
        } else {
            const pd1x = newVertices[P[i+1]*3] - newVertices[W[j]*3];
            const pd1y = newVertices[P[i+1]*3+1] - newVertices[W[j]*3+1];
            const dist1 = pd1x*pd1x + pd1y*pd1y; 
            
            const pd2x = newVertices[P[i]*3] - newVertices[W[j+1]*3];
            const pd2y = newVertices[P[i]*3+1] - newVertices[W[j+1]*3+1];
            const dist2 = pd2x*pd2x + pd2y*pd2y; 
            
            if (dist1 < dist2) {
                addTri(P[i], P[i+1], W[j]);
                i++;
            } else {
                addTri(P[i], W[j+1], W[j]);
                j++;
            }
        }
    }
    
    if (newTriangles.length > 0) {
        this.vertices = newVertices;
        const newIndices = new Int32Array(this.indices.length + newTriangles.length);
        newIndices.set(this.indices);
        newIndices.set(newTriangles, this.indices.length);
        this.indices = newIndices;
        
        this.optimizeTriangulation();
        this.recalculateBoundaryEdges();
        this.recalculateBounds();
        this.buildSpatialIndex();
        return true;
    }
    return false;
  }

  extrapolateInfo(x: number, y: number): {z: number, projX: number, projY: number, uX: number, uY: number, vX: number, vY: number, zBase: number, inwardSlope: number} | null {
    if (!this.boundaryEdges || this.boundaryEdges.length === 0) return null;
    
    let minDist = Infinity;
    let closestEdge = -1;
    let closestT = 0;

    for (let i = 0; i < this.boundaryEdges.length; i += 2) {
        const u = this.boundaryEdges[i];
        const v = this.boundaryEdges[i+1];
        const ux = this.vertices[u*3], uy = this.vertices[u*3+1];
        const vx = this.vertices[v*3], vy = this.vertices[v*3+1];

        const l2 = (vx - ux)**2 + (vy - uy)**2;
        let t = 0;
        if (l2 !== 0) {
            t = Math.max(0, Math.min(1, ((x - ux) * (vx - ux) + (y - uy) * (vy - uy)) / l2));
        }
        const projx = ux + t * (vx - ux);
        const projy = uy + t * (vy - uy);
        
        const d = (x - projx)**2 + (y - projy)**2;
        if (d < minDist) {
            minDist = d;
            closestEdge = i;
            closestT = t;
        }
    }

    if (closestEdge === -1) return null;
    
    const edgeU = this.boundaryEdges[closestEdge];
    const edgeV = this.boundaryEdges[closestEdge+1];
    
    const ux = this.vertices[edgeU*3], uy = this.vertices[edgeU*3+1], uz = this.vertices[edgeU*3+2];
    const vx = this.vertices[edgeV*3], vy = this.vertices[edgeV*3+1], vz = this.vertices[edgeV*3+2];
    const projX = ux + closestT * (vx - ux);
    const projY = uy + closestT * (vy - uy);
    const zBase = uz + closestT * (vz - uz);

    const dx = projX - x;
    const dy = projY - y;
    const distToBoundary = Math.sqrt(dx*dx + dy*dy);

    if (distToBoundary < 1e-3) {
        return { z: zBase, projX, projY, uX: ux, uY: uy, vX: vx, vY: vy, zBase, inwardSlope: 0 };
    }

    const dirX = dx / distToBoundary;
    const dirY = dy / distToBoundary;
    
    const samples: {d: number, z: number}[] = [];
    for (let d = 0; d <= 50; d += 1) {
        const sampleX = projX + dirX * d;
        const sampleY = projY + dirY * d;
        const sampleZ = this.getElevation(sampleX, sampleY);
        if (sampleZ !== null && !isNaN(sampleZ)) {
            samples.push({d, z: sampleZ});
        }
    }

    let m = 0; // inward slope (dz / dd)
    if (samples.length >= 2) {
        // Try to ignore the immediate localized boundary noise (first 2 meters) for the regression
        let validSamples = samples.filter(s => s.d >= 2);
        if (validSamples.length < 2) validSamples = samples;
        
        const n = validSamples.length;
        let sumD = 0, sumZ = 0, sumDZ = 0, sumDD = 0;
        for (const s of validSamples) {
            sumD += s.d;
            sumZ += s.z;
            sumDZ += s.d * s.z;
            sumDD += s.d * s.d;
        }
        
        const denominator = (n * sumDD - sumD * sumD);
        if (denominator !== 0) {
            m = (n * sumDZ - sumD * sumZ) / denominator;
        }
    } else if (samples.length === 1) {
        // If only one point available (unlikely unless very small surface)
        m = (samples[0].z - zBase) / (samples[0].d || 1);
    }

    // Extrapolate outward using the overall terrain slope m
    // Since outward distance is negative relative to the inward sampling direction:
    let z = zBase + m * (-distToBoundary);
    
    return { z, projX, projY, uX: ux, uY: uy, vX: vx, vY: vy, zBase, inwardSlope: m };
  }

  extrapolateZ(x: number, y: number): number {
    const info = this.extrapolateInfo(x, y);
    return info ? info.z : 0;
  }

  extendBoundary(polyline: {x: number, y: number}[], offset: number): boolean {
    if (polyline.length < 2) return false;
    if (!this.bGraph) return false;

    const matchedVertices = polyline.map(p => {
        let minD = Infinity;
        let minV = -1;
        for (let i = 0; i < this.boundaryEdges.length; i++) {
             const v = this.boundaryEdges[i];
             const ax = this.vertices[v*3], ay = this.vertices[v*3+1];
             const d = (ax-p.x)**2 + (ay-p.y)**2;
             if (d < minD) { minD = d; minV = v; }
        }
        return minV;
    });

    const findPathOnBoundary = (start: number, end: number) => {
        const q = [[start]];
        const visited = new Set<number>();
        visited.add(start);
        
        while(q.length > 0) {
            const path = q.shift()!;
            const u = path[path.length - 1];
            if (u === end) return path;
            
            for (const v of (this.bGraph!.get(u) || [])) {
                if (!visited.has(v)) {
                    visited.add(v);
                    q.push([...path, v]);
                }
            }
        }
        return [];
    };

    const directedEdges = new Set<string>();
    for (let i = 0; i < this.boundaryEdges.length; i+=2) {
        directedEdges.add(`${this.boundaryEdges[i]}-${this.boundaryEdges[i+1]}`);
    }

    const selectedEdges: number[][] = [];
    const addedEdges = new Set<string>();

    for (let i = 0; i < matchedVertices.length - 1; i++) {
         const path = findPathOnBoundary(matchedVertices[i], matchedVertices[i+1]);
         for (let j = 0; j < path.length - 1; j++) {
             let a = path[j];
             let b = path[j+1];
             if (!directedEdges.has(`${a}-${b}`)) {
                 // Force directed CCW order
                 a = path[j+1];
                 b = path[j];
             }
             
             const key1 = `${a}-${b}`;
             if (!addedEdges.has(key1)) {
                 selectedEdges.push([a, b]);
                 addedEdges.add(key1);
             }
         }
    }

    if (selectedEdges.length === 0) return false;

    const vertexMap = new Map<number, { normals: {nx: number, ny: number}[] }>();
    
    // We don't need getTriangleEq or edgeToTri anymore
    for (const [a, b] of selectedEdges) {
        const ax = this.vertices[a*3], ay = this.vertices[a*3+1];
        const bx = this.vertices[b*3], by = this.vertices[b*3+1];
        
        const dx = bx - ax;
        const dy = by - ay;
        let nx = dy;
        let ny = -dx;
        const len = Math.sqrt(nx*nx + ny*ny);
        if (len > 0) {
            nx /= len; ny /= len;
        }
        
        for (const v of [a, b]) {
            if (!vertexMap.has(v)) vertexMap.set(v, { normals: [] });
            const data = vertexMap.get(v)!;
            data.normals.push({nx, ny});
        }
    }

    const newVertexIdMap = new Map<number, number>();
    const newVerticesArray: number[] = [];
    const currentVCount = this.vertices.length / 3;
    let nextVIdx = currentVCount;

    for (const [v, data] of vertexMap.entries()) {
        const oldX = this.vertices[v*3], oldY = this.vertices[v*3+1], oldZ = this.vertices[v*3+2];
        
        let anx = 0, any = 0;
        for (const n of data.normals) {
            anx += n.nx; any += n.ny;
        }
        const len = Math.sqrt(anx*anx + any*any);
        if (len > 0) { anx /= len; any /= len; }
        
        const newX = oldX + anx * offset;
        const newY = oldY + any * offset;
        
        const samples: {d: number, z: number}[] = [];
        for (let d = 0; d <= 50; d += 1) {
            const sampleX = oldX - anx * d; // move inward
            const sampleY = oldY - any * d;
            const sampleZ = this.getElevation(sampleX, sampleY);
            if (sampleZ !== null && !isNaN(sampleZ)) {
                samples.push({d, z: sampleZ});
            }
        }

        let m = 0;
        if (samples.length >= 2) {
            // Ignore boundary artifacts (first 2 meters)
            let validSamples = samples.filter(s => s.d >= 2);
            if (validSamples.length < 2) validSamples = samples;
            
            const n = validSamples.length;
            let sumD = 0, sumZ = 0, sumDZ = 0, sumDD = 0;
            for (const s of validSamples) {
                sumD += s.d;
                sumZ += s.z;
                sumDZ += s.d * s.z;
                sumDD += s.d * s.d;
            }
            
            const denominator = (n * sumDD - sumD * sumD);
            if (denominator !== 0) {
                m = (n * sumDZ - sumD * sumZ) / denominator;
            }
        } else if (samples.length === 1) {
            m = (samples[0].z - oldZ) / (samples[0].d || 1);
        }

        // Outward distance is offset, but our sampling d is inward, so outward is -offset
        const newZ = oldZ + m * (-offset);
        
        newVertexIdMap.set(v, nextVIdx++);
        newVerticesArray.push(newX, newY, newZ);
    }

    const newIndicesArray: number[] = [];
    for (const [a, b] of selectedEdges) {
        const na = newVertexIdMap.get(a)!;
        const nb = newVertexIdMap.get(b)!;
        newIndicesArray.push(b, a, na);
        newIndicesArray.push(b, na, nb);
    }

    const finalVertices = new Float32Array(this.vertices.length + newVerticesArray.length);
    finalVertices.set(this.vertices);
    finalVertices.set(newVerticesArray, this.vertices.length);
    this.vertices = finalVertices;

    const finalIndices = new Int32Array(this.indices.length + newIndicesArray.length);
    finalIndices.set(this.indices);
    finalIndices.set(newIndicesArray, this.indices.length);
    this.indices = finalIndices;

    this.optimizeTriangulation();
    this.recalculateBoundaryEdges();
    this.recalculateBounds();
    this.buildSpatialIndex();
    
    return true;
  }

  cleanBoundary(maxEdgeLength: number): number {
    let totalRemoved = 0;
    const maxLengthSq = maxEdgeLength * maxEdgeLength;

    let removedAny = true;
    while (removedAny) {
      removedAny = false;
      
      const edgeCount = new Map<string, number[]>();
      for (let i = 0; i < this.indices.length; i += 3) {
          const a = this.indices[i], b = this.indices[i+1], c = this.indices[i+2];
          for (const [u, v] of [[a,b], [b,c], [c,a]]) {
              const key = u < v ? `${u}-${v}` : `${v}-${u}`;
              if (!edgeCount.has(key)) edgeCount.set(key, []);
              edgeCount.get(key)!.push(i);
          }
      }

      const trianglesToRemove = new Set<number>();
      
      for (const triIndices of edgeCount.values()) {
          if (triIndices.length === 1) { // boundary edge
              const triIdx = triIndices[0];
              const a = this.indices[triIdx], b = this.indices[triIdx+1], c = this.indices[triIdx+2];
              
              let hasLongEdge = false;
              for (const [u, v] of [[a,b], [b,c], [c,a]]) {
                  const ux = this.vertices[u*3], uy = this.vertices[u*3+1];
                  const vx = this.vertices[v*3], vy = this.vertices[v*3+1];
                  const d2 = (vx - ux)**2 + (vy - uy)**2;
                  if (d2 > maxLengthSq) {
                      hasLongEdge = true;
                      break;
                  }
              }
              
              if (hasLongEdge) {
                  trianglesToRemove.add(triIdx);
              }
          }
      }

      if (trianglesToRemove.size > 0) {
          const newIndices = [];
          for (let i = 0; i < this.indices.length; i += 3) {
              if (!trianglesToRemove.has(i)) {
                  newIndices.push(this.indices[i], this.indices[i+1], this.indices[i+2]);
              }
          }
          this.indices = new Int32Array(newIndices);
          removedAny = true;
          totalRemoved += trianglesToRemove.size;
      }
    }
    
    if (totalRemoved > 0) {
        this.recalculateBoundaryEdges();
        this.recalculateBounds();
        this.buildSpatialIndex();
    }
    return totalRemoved;
  }

  private removeUnusedVertices(): boolean {
    const used = new Uint8Array(this.vertices.length / 3);
    for (let i = 0; i < this.indices.length; i++) {
        used[this.indices[i]] = 1;
    }
    
    let newVertexCount = 0;
    const oldToNew = new Int32Array(this.vertices.length / 3);
    oldToNew.fill(-1);
    
    for (let i = 0; i < used.length; i++) {
        if (used[i]) {
            oldToNew[i] = newVertexCount;
            newVertexCount++;
        }
    }
    
    if (newVertexCount === used.length) return false;
    
    const newVertices = new Float32Array(newVertexCount * 3);
    let vIdx = 0;
    for (let i = 0; i < used.length; i++) {
        if (used[i]) {
            newVertices[vIdx * 3] = this.vertices[i * 3];
            newVertices[vIdx * 3 + 1] = this.vertices[i * 3 + 1];
            newVertices[vIdx * 3 + 2] = this.vertices[i * 3 + 2];
            vIdx++;
        }
    }
    
    for (let i = 0; i < this.indices.length; i++) {
        this.indices[i] = oldToNew[this.indices[i]];
    }
    
    this.vertices = newVertices;
    return true;
  }

  cropToPolygon(polygon: {x: number, y: number}[]): boolean {

    const newIndices = [];
    let changed = false;

    // Point in polygon function
    const isPointInPolygon = (x: number, y: number) => {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };

    // Filter out triangles whose centroids fall OUTSIDE the polygon
    for (let i = 0; i < this.indices.length; i += 3) {
      const v1 = this.indices[i], v2 = this.indices[i+1], v3 = this.indices[i+2];
      
      const x1 = this.vertices[v1*3], y1 = this.vertices[v1*3+1];
      const x2 = this.vertices[v2*3], y2 = this.vertices[v2*3+1];
      const x3 = this.vertices[v3*3], y3 = this.vertices[v3*3+1];

      const cx = (x1 + x2 + x3) / 3;
      const cy = (y1 + y2 + y3) / 3;

      if (isPointInPolygon(cx, cy)) {
          newIndices.push(v1, v2, v3);
      } else {
          changed = true;
      }
    }

    if (changed) {
        this.indices = new Int32Array(newIndices);
        this.removeUnusedVertices();
        this.recalculateBoundaryEdges();
        this.recalculateBounds();
        this.buildSpatialIndex();
    }
    
    // Always add the boundary even if it didn't crop anything, so it displays
    this.boundaries.push([...polygon]);
    
    return true;
  }

  removeInsidePolygon(polygon: {x: number, y: number}[]): boolean {

    const newIndices = [];
    let changed = false;

    // Point in polygon function
    const isPointInPolygon = (x: number, y: number) => {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };

    // Filter out triangles whose centroids fall INSIDE the polygon
    for (let i = 0; i < this.indices.length; i += 3) {
      const v1 = this.indices[i], v2 = this.indices[i+1], v3 = this.indices[i+2];
      
      const x1 = this.vertices[v1*3], y1 = this.vertices[v1*3+1];
      const x2 = this.vertices[v2*3], y2 = this.vertices[v2*3+1];
      const x3 = this.vertices[v3*3], y3 = this.vertices[v3*3+1];

      const cx = (x1 + x2 + x3) / 3;
      const cy = (y1 + y2 + y3) / 3;

      if (!isPointInPolygon(cx, cy)) {
          newIndices.push(v1, v2, v3);
      } else {
          changed = true;
      }
    }

    if (changed) {
        this.indices = new Int32Array(newIndices);
        this.removeUnusedVertices();
        this.recalculateBoundaryEdges();
        this.recalculateBounds();
        this.buildSpatialIndex();
    }
    
    // Always add the hole boundary so it displays
    this.boundaries.push([...polygon]);
    
    return true;
  }

  optimizeTriangulation(maxIterations: number = 20): boolean {
    let changedAny = false;
    let iter = 0;
    
    const isLeftTurn = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
        return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) > 0;
    };

    while (iter < maxIterations) {
        let swappedThisPass = false;
        const edgeMap = new Map<string, { triOffset: number, oppOffset: number }>();
        
        for (let i = 0; i < this.indices.length; i += 3) {
            edgeMap.set(`${this.indices[i]}-${this.indices[i+1]}`, { triOffset: i, oppOffset: 2 });
            edgeMap.set(`${this.indices[i+1]}-${this.indices[i+2]}`, { triOffset: i, oppOffset: 0 });
            edgeMap.set(`${this.indices[i+2]}-${this.indices[i]}`, { triOffset: i, oppOffset: 1 });
        }
        
        const skipTris = new Set<number>();

        for (let i = 0; i < this.indices.length; i += 3) {
            if (skipTris.has(i)) continue;

            const tri = [this.indices[i], this.indices[i+1], this.indices[i+2]];
            let swapped = false;

            for (let j = 0; j < 3; j++) {
                const u = tri[j];
                const v = tri[(j+1)%3];
                const w = tri[(j+2)%3];

                const adj = edgeMap.get(`${v}-${u}`);
                if (adj && !skipTris.has(adj.triOffset)) {
                    const tri2 = [this.indices[adj.triOffset], this.indices[adj.triOffset+1], this.indices[adj.triOffset+2]];
                    const d = tri2[adj.oppOffset];

                    const ux = this.vertices[u*3], uy = this.vertices[u*3+1];
                    const vx = this.vertices[v*3], vy = this.vertices[v*3+1];
                    const wx = this.vertices[w*3], wy = this.vertices[w*3+1];
                    const dx = this.vertices[d*3], dy = this.vertices[d*3+1];

                    // Quad: u, v, d, w should be CCW strictly convex
                    const convex = 
                        isLeftTurn(ux, uy, vx, vy, dx, dy) &&
                        isLeftTurn(vx, vy, dx, dy, wx, wy) &&
                        isLeftTurn(dx, dy, wx, wy, ux, uy) &&
                        isLeftTurn(wx, wy, ux, uy, vx, vy);

                    if (convex) {
                        // Check empty circumcircle condition
                        const px = dx, py = dy;
                        const adx = ux - px, ady = uy - py;
                        const bdx = vx - px, bdy = vy - py;
                        const cdx = wx - px, cdy = wy - py;

                        const abdet = adx * bdy - bdx * ady;
                        const bcdet = bdx * cdy - cdx * bdy;
                        const cadet = cdx * ady - adx * cdy;
                        const alift = adx * adx + ady * ady;
                        const blift = bdx * bdx + bdy * bdy;
                        const clift = cdx * cdx + cdy * cdy;

                        const inCircle = alift * bcdet + blift * cadet + clift * abdet > 0;

                        if (inCircle) {
                            // Swap edge u-v -> w-d
                            // tri1 was u, v, w. Will become w, d, u
                            this.indices[i] = w;
                            this.indices[i+1] = d;
                            this.indices[i+2] = u;
                            
                            // tri2 was v, u, d. Will become d, w, v
                            this.indices[adj.triOffset] = d;
                            this.indices[adj.triOffset+1] = w;
                            this.indices[adj.triOffset+2] = v;

                            skipTris.add(i);
                            skipTris.add(adj.triOffset);
                            swapped = true;
                            swappedThisPass = true;
                            changedAny = true;
                            break;
                        }
                    }
                }
            }
        }
        
        if (!swappedThisPass) break;
        iter++;
    }
    
    if (changedAny) {
        this.recalculateBoundaryEdges();
        this.buildSpatialIndex();
    }
    
    return changedAny;
  }

  fillHoleAtPoint(x: number, y: number): number {
    let trianglesAdded = 0;

    // 1. Extract all boundary loops
    const nextEdge = new Map<number, number>();
    for (let i = 0; i < this.boundaryEdges.length; i += 2) {
        nextEdge.set(this.boundaryEdges[i], this.boundaryEdges[i+1]);
    }

    const visited = new Set<number>();
    const loops: number[][] = [];

    for (const start of nextEdge.keys()) {
        if (!visited.has(start)) {
            const loop: number[] = [];
            let curr = start;
            while (!visited.has(curr)) {
                visited.add(curr);
                loop.push(curr);
                const next = nextEdge.get(curr);
                if (next === undefined) break;
                curr = next;
            }
            if (loop.length >= 3) {
                loops.push(loop);
            }
        }
    }

    let targetSign = 1;
    if (this.indices.length >= 3) {
        const i0 = this.indices[0], i1 = this.indices[1], i2 = this.indices[2];
        const ax = this.vertices[i0*3], ay = this.vertices[i0*3+1];
        const bx = this.vertices[i1*3], by = this.vertices[i1*3+1];
        const cx = this.vertices[i2*3], cy = this.vertices[i2*3+1];
        const cross = (bx - ax)*(cy - ay) - (by - ay)*(cx - ax);
        targetSign = cross >= 0 ? 1 : -1;
    }

    let targetLoop: number[] | null = null;
    let minAreaSq = Infinity;
    
    for (const loop of loops) {
        // Calculate signed area of the loop
        let area = 0;
        for (let i = 0; i < loop.length; i++) {
            const j = (i + 1) % loop.length;
            const vi = loop[i], vj = loop[j];
            area += (this.vertices[vi*3] * this.vertices[vj*3+1] - this.vertices[vj*3] * this.vertices[vi*3+1]);
        }
        
        // A hole has the opposite orientation of the triangles
        const loopSign = area >= 0 ? 1 : -1;
        if (loopSign === targetSign) continue; // Skip outer boundaries (or boundaries with same orientation)

        let inside = false;
        for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
            const xi = this.vertices[loop[i]*3], yi = this.vertices[loop[i]*3+1];
            const xj = this.vertices[loop[j]*3], yj = this.vertices[loop[j]*3+1];
            
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        if (inside) {
            // Find the smallest loop containing the point (in case of nested holes, though unlikely)
            const absArea = Math.abs(area);
            if (absArea < minAreaSq) {
                minAreaSq = absArea;
                targetLoop = loop;
            }
        }
    }

    if (!targetLoop) return 0;

    // 3. Triangulate the target loop (Ear Clipping)
    const ccw = (px1: number, py1: number, px2: number, py2: number, px3: number, py3: number) => {
        return (py3 - py1) * (px2 - px1) > (py2 - py1) * (px3 - px1);
    };

    const pointInTriangle = (px: number, py: number, tx1: number, ty1: number, tx2: number, ty2: number, tx3: number, ty3: number) => {
        const d1 = ccw(px, py, tx1, ty1, tx2, ty2);
        const d2 = ccw(px, py, tx2, ty2, tx3, ty3);
        const d3 = ccw(px, py, tx3, ty3, tx1, ty1);
        const has_neg = !(d1 && d2 && d3);
        const has_pos = (d1 || d2 || d3);
        return !(has_neg && has_pos);
    };

    let area = 0;
    for (let i = 0; i < targetLoop.length; i++) {
        const j = (i + 1) % targetLoop.length;
        const vi = targetLoop[i], vj = targetLoop[j];
        area += (this.vertices[vi*3] * this.vertices[vj*3+1] - this.vertices[vj*3] * this.vertices[vi*3+1]);
    }
    const isClockwise = area < 0;

    let loop = [...targetLoop];
    let changed = true;
    let iter = 0;

    while (loop.length >= 3 && changed && iter < 1000) {
        changed = false;
        for (let i = 0; i < loop.length; i++) {
            const u = loop[(i + loop.length - 1) % loop.length];
            const v = loop[i];
            const w = loop[(i + 1) % loop.length];

            const ux = this.vertices[u*3], uy = this.vertices[u*3+1];
            const vx = this.vertices[v*3], vy = this.vertices[v*3+1];
            const wx = this.vertices[w*3], wy = this.vertices[w*3+1];

            // Check if it's an ear.
            // If the loop is clockwise, the interior is to the right, so the ear must be a right turn.
            const cross = (vx - ux) * (wy - uy) - (vy - uy) * (wx - ux);
            const isConvex = isClockwise ? cross < 0 : cross > 0;

            if (isConvex) {
                // Check if any other vertex of the loop is inside the triangle
                let valid = true;
                for (let k = 0; k < loop.length; k++) {
                    const vert = loop[k];
                    if (vert === u || vert === v || vert === w) continue;
                    const kx = this.vertices[vert*3], ky = this.vertices[vert*3+1];
                    if (pointInTriangle(kx, ky, ux, uy, wx, wy, vx, vy)) {
                        valid = false;
                        break;
                    }
                }

                if (valid) {
                    // Add triangle (u, w, v) because the mesh is on the left of (u->w, w->v, v->u).
                    // Wait, if loop is CW (hole), the correct CCW triangle for the mesh is (u, w, v).
                    // Let's verify winding: cross product of (w-u) and (v-u) should be > 0.
                    // u->w->v turn? 
                    // Actually, if it's a hole (CW), then u, v, w is CW.
                    // To make a CCW triangle (for the mesh), we need to add it as u, w, v.
                    
                    const newIndices = new Int32Array(this.indices.length + 3);
                    newIndices.set(this.indices);
                    if (isClockwise) {
                        newIndices[this.indices.length] = u;
                        newIndices[this.indices.length+1] = w;
                        newIndices[this.indices.length+2] = v;
                    } else {
                        newIndices[this.indices.length] = u;
                        newIndices[this.indices.length+1] = v;
                        newIndices[this.indices.length+2] = w;
                    }
                    this.indices = newIndices;

                    loop.splice(i, 1);
                    changed = true;
                    trianglesAdded++;
                    break;
                }
            }
        }
        iter++;
    }

    if (trianglesAdded > 0) {
        this.optimizeTriangulation();
        this.recalculateBoundaryEdges();
        this.recalculateBounds();
        this.buildSpatialIndex();
    }

    return trianglesAdded;
  }

  recalculateBoundaryEdges() {
      const edges = new Set<string>();
      
      for (let i = 0; i < this.indices.length; i += 3) {
          edges.add(`${this.indices[i]}-${this.indices[i+1]}`);
          edges.add(`${this.indices[i+1]}-${this.indices[i+2]}`);
          edges.add(`${this.indices[i+2]}-${this.indices[i]}`);
      }

      this.boundaryEdges = [];
      for (let i = 0; i < this.indices.length; i += 3) {
          const a = this.indices[i];
          const b = this.indices[i+1];
          const c = this.indices[i+2];

          if (!edges.has(`${b}-${a}`)) this.boundaryEdges.push(a, b);
          if (!edges.has(`${c}-${b}`)) this.boundaryEdges.push(b, c);
          if (!edges.has(`${a}-${c}`)) this.boundaryEdges.push(c, a);
      }

      this.bGraph = new Map<number, number[]>();
      for (let i = 0; i < this.boundaryEdges.length; i+=2) {
          const u = this.boundaryEdges[i];
          const v = this.boundaryEdges[i+1];
          if (!this.bGraph.has(u)) this.bGraph.set(u, []);
          if (!this.bGraph.has(v)) this.bGraph.set(v, []);
          this.bGraph.get(u)!.push(v);
          this.bGraph.get(v)!.push(u);
      }
  }

  private recalculateBounds() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const usedVertices = new Uint8Array(this.vertices.length / 3);
    for (let i = 0; i < this.indices.length; i++) {
        usedVertices[this.indices[i]] = 1;
    }
    let hasVertices = false;
    for (let i = 0; i < usedVertices.length; i++) {
        if (usedVertices[i]) {
            const x = this.vertices[i*3];
            const y = this.vertices[i*3+1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            hasVertices = true;
        }
    }
    if (hasVertices) {
        this.minX = minX;
        this.maxX = maxX;
        this.minY = minY;
        this.maxY = maxY;
    }
  }

  getTrianglesInBoundingBox(vMinX: number, vMaxX: number, vMinY: number, vMaxY: number): number[] {
    const minCol = Math.max(0, Math.floor((vMinX - this.minX) / this.gridSizeX));
    const maxCol = Math.min(this.gridCols - 1, Math.floor((vMaxX - this.minX) / this.gridSizeX));
    const minRow = Math.max(0, Math.floor((vMinY - this.minY) / this.gridSizeY));
    const maxRow = Math.min(this.gridRows - 1, Math.floor((vMaxY - this.minY) / this.gridSizeY));

    if (minCol > maxCol || minRow > maxRow) return [];

    const found: number[] = [];
    const visited = new Uint8Array((this.indices.length / 3) + 1);

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = this.grid[r * this.gridCols + c];
        if (cell) {
          for (let i = 0; i < cell.length; i++) {
            const triIdx = cell[i];
            const triId = triIdx / 3;
            if (visited[triId] === 0) {
              visited[triId] = 1;
              found.push(triIdx);
            }
          }
        }
      }
    }
    return found;
  }

  findTriangleIndex(x: number, y: number): number {
    if (x < this.minX || x > this.maxX || y < this.minY || y > this.maxY) return -1;

    const col = Math.floor((x - this.minX) / this.gridSizeX);
    const row = Math.floor((y - this.minY) / this.gridSizeY);
    
    if (col < 0 || col >= this.gridCols || row < 0 || row >= this.gridRows) return -1;

    const cellTriangles = this.grid[row * this.gridCols + col];
    if (!cellTriangles) return -1;

    for (const i of cellTriangles) {
      const v1 = this.indices[i], v2 = this.indices[i+1], v3 = this.indices[i+2];
      
      const x1 = this.vertices[v1*3], y1 = this.vertices[v1*3+1];
      const x2 = this.vertices[v2*3], y2 = this.vertices[v2*3+1];
      const x3 = this.vertices[v3*3], y3 = this.vertices[v3*3+1];

      const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
      if (det === 0) continue;

      const l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det;
      const l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det;
      const l3 = 1.0 - l1 - l2;

      // Small epsilon only for float inaccuracies, not for 0.001 scale which can be huge in world units
      if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) {
        return i;
      }
    }
    return -1;
  }

  // Fast Barycentric coordinate elevation solver $O(1)$ usually
  getElevation(x: number, y: number): number | null {
    if (x < this.minX || x > this.maxX || y < this.minY || y > this.maxY) return null;

    const col = Math.floor((x - this.minX) / this.gridSizeX);
    const row = Math.floor((y - this.minY) / this.gridSizeY);
    
    // Safety bounds
    if (col < 0 || col >= this.gridCols || row < 0 || row >= this.gridRows) return null;

    const cellTriangles = this.grid[row * this.gridCols + col];

    if (!cellTriangles) return null;

    for (const i of cellTriangles) {
      const v1 = this.indices[i], v2 = this.indices[i+1], v3 = this.indices[i+2];
      
      const x1 = this.vertices[v1*3], y1 = this.vertices[v1*3+1], z1 = this.vertices[v1*3+2];
      const x2 = this.vertices[v2*3], y2 = this.vertices[v2*3+1], z2 = this.vertices[v2*3+2];
      const x3 = this.vertices[v3*3], y3 = this.vertices[v3*3+1], z3 = this.vertices[v3*3+2];

      const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
      if (det === 0) continue;

      const l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det;
      const l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det;
      const l3 = 1.0 - l1 - l2;

      // Small epsilon to catch points exactly on shared edges
      if (l1 >= -0.001 && l2 >= -0.001 && l3 >= -0.001) {
        return l1 * z1 + l2 * z2 + l3 * z3;
      }
    }

    return null; // outside all triangles in this cell
  }

  getInterpolatedElevation(x: number, y: number): number {
    const directZ = this.getElevation(x, y);
    if (directZ !== null) return directZ;

    // Use Inverse Distance Weighting to find an average Z from the nearest points
    // Collect closest N points
    const nearest: {d2: number, z: number}[] = [];
    let sumWeights = 0;
    let sumWeightedZ = 0;

    for (let i = 0; i < this.vertices.length; i += 3) {
        const vx = this.vertices[i];
        const vy = this.vertices[i+1];
        const vz = this.vertices[i+2];
        const d2 = (x - vx)**2 + (y - vy)**2;
        if (d2 < 0.0001) return vz; // extremely close point
        nearest.push({d2, z: vz});
    }

    nearest.sort((a, b) => a.d2 - b.d2);
    const k = Math.min(5, nearest.length); // Use up to 5 nearest points
    for (let i = 0; i < k; i++) {
        const pt = nearest[i];
        const w = 1 / Math.sqrt(pt.d2);
        sumWeights += w;
        sumWeightedZ += pt.z * w;
    }

    if (sumWeights > 0) {
        return sumWeightedZ / sumWeights;
    }

    return 0; // fallback
  }
}

export async function parseLandXML(text: string): Promise<SurfaceDTM> {
  return new Promise((resolve, reject) => {
    try {
      const points = new Map<number, number[]>();
      const faces: number[][] = [];
      
      // Use robust indexOf to locate the main tag bodies
      const textLower = text.toLowerCase();
      
      let pntsRaw = '';
      let facesRaw = '';

      const pStartMatch = textLower.match(/<pnts[^>]*>/);
      if (pStartMatch && pStartMatch.index !== undefined) {
          const pStartIdx = pStartMatch.index + pStartMatch[0].length;
          const pEndIdx = textLower.indexOf('</pnts>', pStartIdx);
          if (pEndIdx !== -1) pntsRaw = text.substring(pStartIdx, pEndIdx);
      }

      const fStartMatch = textLower.match(/<faces[^>]*>/);
      if (fStartMatch && fStartMatch.index !== undefined) {
          const fStartIdx = fStartMatch.index + fStartMatch[0].length;
          const fEndIdx = textLower.indexOf('</faces>', fStartIdx);
          if (fEndIdx !== -1) facesRaw = text.substring(fStartIdx, fEndIdx);
      }

      if (!pntsRaw || !facesRaw) {
          throw new Error("Could not find <Pnts> or <Faces> in the provided LandXML file.");
      }

      // 2. Parse Points: <P id="1">Northing Easting Elevation</P>
      let pIndex = 0;
      const pntsLower = pntsRaw.toLowerCase();
      let counter = 1;
      
      while (true) {
         const start = pntsLower.indexOf('<p', pIndex);
         if (start === -1) break;
         
         const nextChar = pntsLower[start + 2];
         if (nextChar !== '>' && nextChar !== ' ' && nextChar !== '\t' && nextChar !== '\n') {
             pIndex = start + 2;
             continue;
         }

         const closeBracket = pntsLower.indexOf('>', start);
         if (closeBracket === -1) break;
         
         const end = pntsLower.indexOf('</p>', closeBracket);
         if (end === -1) break;

         // Extract ID if exists
         let id = counter++;
         const tagAttrs = pntsRaw.substring(start + 2, closeBracket);
         const idMatch = tagAttrs.match(/id\s*=\s*['"]?(\d+)['"]?/i);
         if (idMatch) {
             id = parseInt(idMatch[1]);
         }

         const content = pntsRaw.substring(closeBracket + 1, end).trim();
         const vals = content.split(/\s+/).map(Number);
         if (vals.length >= 3) {
             points.set(id, [vals[0], vals[1], vals[2]]);
         }
         
         pIndex = end + 4;
      }

      // 3. Parse Faces: <F>1 2 3</F> or <F n="1">1 2 3</F>
      let fIndex = 0;
      const facesLower = facesRaw.toLowerCase();
      
      while (true) {
         const start = facesLower.indexOf('<f', fIndex);
         if (start === -1) break;
         
         const nextChar = facesLower[start + 2];
         if (nextChar !== '>' && nextChar !== ' ' && nextChar !== '\t' && nextChar !== '\n') {
             fIndex = start + 2;
             continue;
         }

         const closeBracket = facesLower.indexOf('>', start);
         if (closeBracket === -1) break;

         const end = facesLower.indexOf('</f>', closeBracket);
         if (end === -1) break;
         
         const content = facesRaw.substring(closeBracket + 1, end).trim();
         const ids = content.split(/\s+/).map(Number);
         if (ids.length >= 3) {
             for(let i=0; i<ids.length - 2; i+=3) {
                 faces.push([ids[i], ids[i+1], ids[i+2]]);
             }
         }
         fIndex = end + 4;
      }

      const surface = new SurfaceDTM(points, faces);
      resolve(surface);
    } catch(e) {
      reject(e);
    }
  });
}

export async function parseTXT(text: string): Promise<SurfaceDTM> {
  return new Promise((resolve, reject) => {
    try {
      const lines = text.split(/\r?\n/);
      const pointsArray: {x: number, y: number, z: number}[] = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Accept spaces, tabs or commas
        const parts = trimmed.split(/[\s,]+/).map(Number);
        if (parts.length >= 3 && !parts.slice(0, 3).some(isNaN)) {
          pointsArray.push({
            x: parts[0],
            y: parts[1],
            z: parts[2]
          });
        }
      }

      if (pointsArray.length < 3) {
        throw new Error("Não há pontos suficientes no arquivo TXT.");
      }

      // Triangulate
      const coords = new Float64Array(pointsArray.length * 2);
      const ptsMap = new Map<number, number[]>();
      
      for (let i = 0; i < pointsArray.length; i++) {
        const p = pointsArray[i];
        ptsMap.set(i + 1, [p.y, p.x, p.z]); // id -> [y, x, z] to match LandXML format parsing
        coords[i * 2] = p.x;
        coords[i * 2 + 1] = p.y;
      }

      const delaunay = new Delaunator(coords);
      const faces: number[][] = [];
      
      for (let i = 0; i < delaunay.triangles.length; i += 3) {
        faces.push([
          delaunay.triangles[i] + 1,
          delaunay.triangles[i + 1] + 1,
          delaunay.triangles[i + 2] + 1
        ]);
      }

      const surface = new SurfaceDTM(ptsMap, faces);
      resolve(surface);
    } catch(e) {
      reject(e);
    }
  });
}

