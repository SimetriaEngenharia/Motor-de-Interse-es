import { AlignmentGeometry } from '../types';

export function getAdjacentGeometry(geometries: AlignmentGeometry[], currentIndex: number, direction: 'prev' | 'next'): AlignmentGeometry | null {
   const step = direction === 'prev' ? -1 : 1;
   let idx = currentIndex + step;
   while (idx >= 0 && idx < geometries.length) {
       const g = geometries[idx];
       
       // Skip very small tangent segments (e.g. gaps < 0.1m that are artifacts of XML parsing)
       if (g.type === 'Tangent' && Math.abs(g.endStation - g.startStation) < 0.1) {
           idx += step;
           continue;
       }
       
       return g;
   }
   return null;
}
