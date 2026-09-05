import { AlignmentData, AlignmentGeometry, SuperPoint } from '../types';

function getAttr(el, names) {
  for (const name of names) {
    if (el.hasAttribute(name)) return el.getAttribute(name);
    if (el.hasAttribute(name.toLowerCase())) return el.getAttribute(name.toLowerCase());
    if (el.hasAttribute(name.toUpperCase())) return el.getAttribute(name.toUpperCase());
    // Also try capitalization
    const cap = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    if (el.hasAttribute(cap)) return el.getAttribute(cap);
  }
  return null;
}

export function parseLandXML(xmlContent: string): AlignmentData[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
  const alignments: AlignmentData[] = [];
  
  try {
    const algNodes = xmlDoc.getElementsByTagName("Alignment");
    
    for (let i = 0; i < algNodes.length; i++) {
      const alg = algNodes[i];
      const name = getAttr(alg, ["name"]) || "Eixo Desconhecido";
      const geometries: AlignmentGeometry[] = [];
      const superPoints: SuperPoint[] = [];
      
      let currentStation = parseFloat(getAttr(alg, ["staStart", "station"]) || "0");
      
      let tangentCount = 0;
      let curveCount = 0;
      let spiralCount = 0;
      
      const coordGeoms = alg.getElementsByTagName("CoordGeom");
      if (coordGeoms.length > 0) {
        const coordGeom = coordGeoms[0];
        
        // Iterate through all children of CoordGeom to preserve order
        for (let j = 0; j < coordGeom.children.length; j++) {
          const el = coordGeom.children[j];
          const rawTag = (el.localName || el.tagName).replace(/^.*:/, '');
          let type = '';
          if (rawTag.toLowerCase() === 'line') type = 'Line';
          else if (rawTag.toLowerCase() === 'curve') type = 'Curve';
          else if (rawTag.toLowerCase() === 'spiral') type = 'Spiral';

          if (type === "Line" || type === "Curve" || type === "Spiral") {
            const getChildCI = (parent: any, name: string) => {
              for (let i = 0; i < parent.children.length; i++) {
                const childName = (parent.children[i].localName || parent.children[i].tagName).replace(/^.*:/, '').toLowerCase();
                if (childName === name.toLowerCase()) return parent.children[i];
              }
              return null;
            };

            const length = parseFloat(getAttr(el, ["length"]) || "0");
            let radius = type === "Curve" ? parseFloat(getAttr(el, ["radius", "r", "radiusStart", "radiusEnd"]) || "0") : undefined;
            if (type === "Curve" && (!radius || radius === 0)) {
              const radChild = getChildCI(el, "Radius") || getChildCI(el, "R");
              if (radChild && radChild.textContent) {
                const val = parseFloat(radChild.textContent.trim().replace(/,/g, "."));
                if (!isNaN(val) && val > 0) radius = val;
              }
            }
            const elName = getAttr(el, ["name"]);
            
            let startX, startY, endX, endY, piX, piY;
            let rot = getAttr(el, ["rot"]) || "ccw";
            const dirAttr = getAttr(el, ["dir"]) || "";
            if (dirAttr.toLowerCase() === "right" || dirAttr.toLowerCase() === "cw") rot = "cw";
            if (dirAttr.toLowerCase() === "left" || dirAttr.toLowerCase() === "ccw") rot = "ccw";
            if (type === "Curve" && radius && radius < 0) rot = "cw";
            
            const startEl = getChildCI(el, "Start");
            if (startEl && startEl.textContent) {
              const parts = startEl.textContent.trim().split(/\s+/);
              if (parts.length >= 2) {
                startY = parseFloat(parts[0]);
                startX = parseFloat(parts[1]);
              }
            }
            const endEl = getChildCI(el, "End");
            if (endEl && endEl.textContent) {
              const parts = endEl.textContent.trim().split(/\s+/);
              if (parts.length >= 2) {
                endY = parseFloat(parts[0]);
                endX = parseFloat(parts[1]);
              }
            }
            const piEl = getChildCI(el, "PI");
            if (piEl && piEl.textContent) {
              const parts = piEl.textContent.trim().split(/\s+/);
              if (parts.length >= 2) {
                piY = parseFloat(parts[0]);
                piX = parseFloat(parts[1]);
              }
            }
            
            let ptName = elName;
            if (!ptName) {
                if (type === "Line") {
                    tangentCount++;
                    ptName = `Tangente ${tangentCount}`;
                } else if (type === "Curve") {
                    curveCount++;
                    ptName = `Curva ${curveCount}`;
                } else if (type === "Spiral") {
                    spiralCount++;
                    ptName = `Espiral ${spiralCount}`;
                } else {
                    ptName = `${type} ${geometries.length + 1}`;
                }
            }
            
            geometries.push({
              id: Math.random().toString(36).substring(2, 9),
              type: type === "Line" ? "Tangent" : type as any,
              startStation: currentStation,
              endStation: currentStation + length,
              name: ptName,
              radius: radius,
              startX, startY, endX, endY, piX, piY, rot: rot as 'cw' | 'ccw'
            });
            
            currentStation += length;
          }
        }
      }

      // Parse Superelevation
      const superElems = alg.getElementsByTagName("Superelevation");
      const superelevations = superElems.length > 0 ? superElems : alg.getElementsByTagName("Superelevations");
      
      if (superelevations.length > 0) {
        const superData = superelevations[0];
        const bands = superData.getElementsByTagName("SuperelevationBand");
        
        for (let b = 0; b < bands.length; b++) {
          const points = bands[b].getElementsByTagName("CrossSectPnt");
          for (let p = 0; p < points.length; p++) {
            const pt = points[p];
            const station = parseFloat(getAttr(pt, ["station", "sta"]) || "0");
            const crossSlope = parseFloat(getAttr(pt, ["crossSlope", "slope"]) || "0");
            const typeAttr = getAttr(pt, ["type"]) || "";
            
            // Usually -0.02 is -2%
            const slope = crossSlope * 100;
            
            // Heuristic for lane
            const lane = typeAttr.toLowerCase().includes("left") ? "left" : "right";
            
            superPoints.push({
              id: Math.random().toString(36).substring(2, 9),
              station,
              slope,
              lane,
              type: typeAttr
            });
          }
        }
      }

      alignments.push({
        name,
        geometries,
        superPoints
      });
    }
  } catch(e) {
    console.error("Error parsing LandXML:", e);
  }
  
  return alignments;
}
