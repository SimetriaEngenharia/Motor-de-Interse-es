import { AlignmentData } from '../types';

export const defaultAlignmentData: AlignmentData = {
  name: "Eixo Amostral (3 Curvas)",
  geometries: [
    { id: "g1", type: "Tangent", startStation: 0, endStation: 100, name: "Tangente 1" },
    { id: "g2", type: "Spiral", startStation: 100, endStation: 140, name: "Espiral L1" },
    { id: "g3", type: "Curve", startStation: 140, endStation: 240, name: "Curva 1", radius: 500 },
    { id: "g4", type: "Spiral", startStation: 240, endStation: 280, name: "Espiral L2" },
    { id: "g5", type: "Tangent", startStation: 280, endStation: 400, name: "Tangente 2" },
    { id: "g6", type: "Curve", startStation: 400, endStation: 500, name: "Curva 2 (Sem Espiral)", radius: 800 },
    { id: "g7", type: "Tangent", startStation: 500, endStation: 600, name: "Tangente 3" },
    { id: "g8", type: "Spiral", startStation: 600, endStation: 650, name: "Espiral L3" },
    { id: "g9", type: "Curve", startStation: 650, endStation: 750, name: "Curva 3", radius: 400 },
    { id: "g10", type: "Spiral", startStation: 750, endStation: 800, name: "Espiral L4" },
    { id: "g11", type: "Tangent", startStation: 800, endStation: 1000, name: "Tangente 4" }
  ],
  superPoints: [
    // Curva 1 (Com Espirais)
    // Left Lane (BE)
    { id: "c1_l1", station: 80, slope: -2.0, lane: 'left', type: 'Normal' },
    { id: "c1_l2", station: 100, slope: 0.0, lane: 'left', type: 'TE' },
    { id: "c1_l3", station: 120, slope: 2.0, lane: 'left', type: 'Symmetry' },
    { id: "c1_l4", station: 140, slope: 4.0, lane: 'left', type: 'EC' },
    { id: "c1_l5", station: 240, slope: 4.0, lane: 'left', type: 'CE' },
    { id: "c1_l6", station: 260, slope: 2.0, lane: 'left', type: 'Symmetry' },
    { id: "c1_l7", station: 280, slope: 0.0, lane: 'left', type: 'ET' },
    { id: "c1_l8", station: 300, slope: -2.0, lane: 'left', type: 'Normal' },
    // Right Lane (BI)
    { id: "c1_r1", station: 80, slope: -2.0, lane: 'right', type: 'Normal' },
    { id: "c1_r2", station: 100, slope: -2.0, lane: 'right', type: 'TE' },
    { id: "c1_r3", station: 120, slope: -2.0, lane: 'right', type: 'Symmetry' },
    { id: "c1_r4", station: 140, slope: -4.0, lane: 'right', type: 'EC' },
    { id: "c1_r5", station: 240, slope: -4.0, lane: 'right', type: 'CE' },
    { id: "c1_r6", station: 260, slope: -2.0, lane: 'right', type: 'Symmetry' },
    { id: "c1_r7", station: 280, slope: -2.0, lane: 'right', type: 'ET' },
    { id: "c1_r8", station: 300, slope: -2.0, lane: 'right', type: 'Normal' },

    // Curva 2 (Sem Espirais)
    // Left Lane (BE)
    { id: "c2_l0", station: 345, slope: -2.0, lane: 'left', type: 'Normal' },
    { id: "c2_l1", station: 370, slope: 0.0, lane: 'left', type: 'Zero' },
    { id: "c2_l2", station: 395, slope: 2.0, lane: 'left', type: 'Symmetry' },
    { id: "c2_l3", station: 420, slope: 4.0, lane: 'left', type: 'Max' },
    { id: "c2_l4", station: 480, slope: 4.0, lane: 'left', type: 'Max' },
    { id: "c2_l5", station: 505, slope: 2.0, lane: 'left', type: 'Symmetry' },
    { id: "c2_l6", station: 530, slope: 0.0, lane: 'left', type: 'Zero' },
    { id: "c2_l7", station: 555, slope: -2.0, lane: 'left', type: 'Normal' },
    // Right Lane (BI)
    { id: "c2_r0", station: 345, slope: -2.0, lane: 'right', type: 'Normal' },
    { id: "c2_r1", station: 370, slope: -2.0, lane: 'right', type: 'Zero' },
    { id: "c2_r2", station: 395, slope: -2.0, lane: 'right', type: 'Symmetry' },
    { id: "c2_r3", station: 420, slope: -4.0, lane: 'right', type: 'Max' },
    { id: "c2_r4", station: 480, slope: -4.0, lane: 'right', type: 'Max' },
    { id: "c2_r5", station: 505, slope: -2.0, lane: 'right', type: 'Symmetry' },
    { id: "c2_r6", station: 530, slope: -2.0, lane: 'right', type: 'Zero' },
    { id: "c2_r7", station: 555, slope: -2.0, lane: 'right', type: 'Normal' },

    // Curva 3 (Com Espirais)
    // Left Lane (BE)
    { id: "c3_l1", station: 583.33, slope: -2.0, lane: 'left', type: 'Normal' },
    { id: "c3_l2", station: 600, slope: 0.0, lane: 'left', type: 'TE' },
    { id: "c3_l3", station: 616.67, slope: 2.0, lane: 'left', type: 'Symmetry' },
    { id: "c3_l4", station: 650, slope: 6.0, lane: 'left', type: 'EC' },
    { id: "c3_l5", station: 750, slope: 6.0, lane: 'left', type: 'CE' },
    { id: "c3_l6", station: 783.33, slope: 2.0, lane: 'left', type: 'Symmetry' },
    { id: "c3_l7", station: 800, slope: 0.0, lane: 'left', type: 'ET' },
    { id: "c3_l8", station: 816.67, slope: -2.0, lane: 'left', type: 'Normal' },
    // Right Lane (BI)
    { id: "c3_r1", station: 583.33, slope: -2.0, lane: 'right', type: 'Normal' },
    { id: "c3_r2", station: 600, slope: -2.0, lane: 'right', type: 'TE' },
    { id: "c3_r3", station: 616.67, slope: -2.0, lane: 'right', type: 'Symmetry' },
    { id: "c3_r4", station: 650, slope: -6.0, lane: 'right', type: 'EC' },
    { id: "c3_r5", station: 750, slope: -6.0, lane: 'right', type: 'CE' },
    { id: "c3_r6", station: 783.33, slope: -2.0, lane: 'right', type: 'Symmetry' },
    { id: "c3_r7", station: 800, slope: -2.0, lane: 'right', type: 'ET' },
    { id: "c3_r8", station: 816.67, slope: -2.0, lane: 'right', type: 'Normal' },
  ]
};
