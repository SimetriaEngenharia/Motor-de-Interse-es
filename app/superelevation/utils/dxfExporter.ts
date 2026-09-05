import { AlignmentData, SuperPoint } from '../types';

export const exportToDxf = (data: AlignmentData, filename: string = 'SuperelevationChart.dxf', yScale: number = 1) => {
  const HEADER = `  0
SECTION
  2
HEADER
  9
$ACADVER
  1
AC1009
  0
ENDSEC
  0
SECTION
  2
TABLES
  0
TABLE
  2
LTYPE
  70
1
  0
LTYPE
  2
CONTINUOUS
  70
0
  3
Solid line
  72
65
  73
0
  40
0.0
  0
LTYPE
  2
DASHED
  70
0
  3
Dashed line
  72
65
  73
0
  40
0.0
  0
ENDTAB
  0
TABLE
  2
LAYER
  70
8
  0
LAYER
  2
GEOMETRY_INFO
  70
0
  62
3
  6
CONTINUOUS
  0
LAYER
  2
LANE_LEFT
  70
0
  62
2
  6
CONTINUOUS
  0
LAYER
  2
LANE_RIGHT
  70
0
  62
1
  6
CONTINUOUS
  0
LAYER
  2
SHOULDER_LEFT
  70
0
  62
2
  6
DASHED
  0
LAYER
  2
SHOULDER_RIGHT
  70
0
  62
1
  6
DASHED
  0
LAYER
  2
AXIS
  70
0
  62
8
  6
CONTINUOUS
  0
LAYER
  2
TEXTO
  70
0
  62
7
  6
CONTINUOUS
  0
ENDTAB
  0
ENDSEC
  0
SECTION
  2
ENTITIES
`;

  const FOOTER = `  0
ENDSEC
  0
EOF
`;

  let entities = "";

  const addLine = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    entities += `  0
LINE
  8
${layer}
 10
${x1.toFixed(3)}
 20
${(y1 * yScale).toFixed(3)}
 30
0.0
 11
${x2.toFixed(3)}
 21
${(y2 * yScale).toFixed(3)}
 31
0.0
`;
  };

  const addText = (layer: string, text: string, x: number, y: number, height: number = 0.5) => {
    entities += `  0
TEXT
  8
${layer}
 10
${x.toFixed(3)}
 20
${(y * yScale).toFixed(3)}
 30
0.0
 40
${height.toFixed(3)}
  1
${text}
`;
  };

  // Draw 0% axis line
  let minStation = 0;
  let maxStation = 1000;
  if (data.geometries.length > 0) {
    minStation = Math.min(...data.geometries.map(g => g.startStation));
    maxStation = Math.max(...data.geometries.map(g => g.endStation));
  }
  
  addLine('AXIS', minStation - 10, 0, maxStation + 10, 0);

  // Group points by lane
  const leftPoints = data.superPoints.filter(p => p.lane === 'left').sort((a, b) => a.station - b.station);
  const rightPoints = data.superPoints.filter(p => p.lane === 'right').sort((a, b) => a.station - b.station);

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

  const leftShoulderPoints = generateShoulderPoints(leftPoints, 'leftShoulder');
  const rightShoulderPoints = generateShoulderPoints(rightPoints, 'rightShoulder');

  // Draw Lines for Left Lane
  for (let i = 0; i < leftPoints.length - 1; i++) {
    const p1 = leftPoints[i];
    const p2 = leftPoints[i + 1];
    addLine('LANE_LEFT', p1.station, p1.slope, p2.station, p2.slope);
  }
  leftPoints.forEach(p => {
    addText('TEXTO', `${p.slope > 0 ? '+' : ''}${p.slope.toFixed(2)}%`, p.station, p.slope + 0.3, 0.3);
  });

  // Draw Lines for Left Shoulder
  for (let i = 0; i < leftShoulderPoints.length - 1; i++) {
    const p1 = leftShoulderPoints[i];
    const p2 = leftShoulderPoints[i + 1];
    addLine('SHOULDER_LEFT', p1.station, p1.slope, p2.station, p2.slope);
  }

  // Draw Lines for Right Lane
  for (let i = 0; i < rightPoints.length - 1; i++) {
    const p1 = rightPoints[i];
    const p2 = rightPoints[i + 1];
    addLine('LANE_RIGHT', p1.station, p1.slope, p2.station, p2.slope);
  }
  rightPoints.forEach(p => {
    addText('TEXTO', `${p.slope > 0 ? '+' : ''}${p.slope.toFixed(2)}%`, p.station, p.slope - 0.6, 0.3);
  });

  // Draw Lines for Right Shoulder
  for (let i = 0; i < rightShoulderPoints.length - 1; i++) {
    const p1 = rightShoulderPoints[i];
    const p2 = rightShoulderPoints[i + 1];
    addLine('SHOULDER_RIGHT', p1.station, p1.slope, p2.station, p2.slope);
  }


  // Draw Geometry Info
  data.geometries.forEach((g) => {
    addLine('GEOMETRY_INFO', g.startStation, 8, g.endStation, 8);
    addLine('GEOMETRY_INFO', g.startStation, -8, g.startStation, 8);
    addLine('GEOMETRY_INFO', g.endStation, -8, g.endStation, 8);
    
    // Station texts
    addText('TEXTO', `${Math.floor(g.startStation / 20) * 20}+${(g.startStation % 20).toFixed(2)}`, g.startStation + 0.5, 7.5, 0.4);
    addText('TEXTO', `${Math.floor(g.endStation / 20) * 20}+${(g.endStation % 20).toFixed(2)}`, g.endStation + 0.5, 7.5, 0.4);
    
    const midX = (g.startStation + g.endStation) / 2;
    addText('TEXTO', g.name, midX - (g.name.length * 0.2), 8.5, 0.5);
    
    if (g.radius) {
      const radText = `r=${g.radius.toFixed(0)}m`;
      addText('TEXTO', radText, midX - (radText.length * 0.2), 9.5, 0.5);
    }
  });

  const dxfContent = HEADER + entities + FOOTER;
  
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
