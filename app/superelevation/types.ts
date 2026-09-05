export type LaneType = 'left' | 'right' | 'leftShoulder' | 'rightShoulder';

export type SuperPoint = {
  id: string;
  station: number;
  slope: number;
  lane: LaneType;
  type?: string; 
};

export type AlignmentGeometry = {
  id: string;
  type: 'Tangent' | 'Curve' | 'Spiral';
  startStation: number;
  endStation: number;
  name: string;
  radius?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  piX?: number;
  piY?: number;
  rot?: 'cw' | 'ccw';
  designSpeed?: number;
  laneWidth?: number;
  distAxis?: number;
  eMax?: number;
  overrideRadius?: number;
};

export type AlignmentData = {
  name: string;
  geometries: AlignmentGeometry[];
  superPoints: SuperPoint[];
  trackType?: 'Coroado' | 'Ramo';
  ramoAxis?: 'left' | 'right';
  designSpeed?: number;
  laneWidth?: number;
  norm?: 'DNIT' | 'DER' | 'DNIT - Interseções';
  distAxis?: number;
  eMax?: number;
  justifications?: { startStation: number; endStation: number; text: string; curveId?: string }[];
};
