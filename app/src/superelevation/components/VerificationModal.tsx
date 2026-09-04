import React, { useMemo } from 'react';
import { AlignmentData, AlignmentGeometry } from '../types';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { calculateCurveMinLength } from './CalculoMemoria';
import { SUPERELEVATION_DISPENSABLE, TRANSITION_DISPENSABLE, getTransitionDispensableRadius } from '../utils/referenceTables';
import { getAdjacentGeometry } from '../utils/geometryUtils';

interface VerificationModalProps {
  data: AlignmentData;
  onClose: () => void;
}

export const VerificationModal: React.FC<VerificationModalProps> = ({ data, onClose }) => {
  
  const results = useMemo(() => {
    const V = data.designSpeed || 80;
    const norm = data.norm || 'DNIT';
    const eMax = 8.0;
    const laneWidth = data.laneWidth || 3.6;

    const out = [];

    // Tabela items for transition dispensa
    const transDispensaRadius = getTransitionDispensableRadius(V, norm);

    for (let i = 0; i < data.geometries.length; i++) {
        const geom = data.geometries[i];
        if (geom.type === 'Curve') {
            const R = Math.abs(geom.radius || 1200);
            
            // Expected spiral length
            const L_min_required = calculateCurveMinLength(R, V, norm, eMax, laneWidth);

            // Find spirals before and after avoiding incorrect distant matches
            const prevAdj = getAdjacentGeometry(data.geometries, i, 'prev');
            const prev = prevAdj?.type === 'Spiral' ? prevAdj : null;

            const nextAdj = getAdjacentGeometry(data.geometries, i, 'next');
            const next = nextAdj?.type === 'Spiral' ? nextAdj : null;

            const isTransDispensavel = R > transDispensaRadius;

            // Spiral In
            let spiralInLen = 0;
            if (prev) {
                spiralInLen = prev.endStation - prev.startStation;
            }

            // Spiral Out
            let spiralOutLen = 0;
            if (next) {
                spiralOutLen = next.endStation - next.startStation;
            }

            // check justification
            const isOverlapJustified = data.justifications?.some(j => 
              (j.curveId === geom.id && j.text.includes("Tangente Curta") && j.startStation === geom.endStation) || 
              (j.startStation <= geom.startStation && j.endStation >= geom.startStation && j.text.includes("Tangente Curta")) ||
              (j.startStation <= geom.endStation && j.endStation >= geom.endStation && j.text.includes("Tangente Curta"))
            ) || false;

            const isReverseJustified = data.justifications?.some(j => 
              (j.curveId === geom.id && j.text.includes("Reversas") && j.startStation === geom.endStation) || 
              (j.startStation <= geom.startStation && j.endStation >= geom.startStation && j.text.includes("Reversas")) ||
              (j.startStation <= geom.endStation && j.endStation >= geom.endStation && j.text.includes("Reversas"))
            ) || false;

            let spiralInStatus: 'APROVADO' | 'REPROVADO' | 'DISPENSADO' | 'JUSTIFICADO' = 'APROVADO';
            let spiralInMsg = '';

            let spiralOutStatus: 'APROVADO' | 'REPROVADO' | 'DISPENSADO' | 'JUSTIFICADO' = 'APROVADO';
            let spiralOutMsg = '';

            // check spiral in
            if (spiralInLen > 0) {
               if (spiralInLen < L_min_required - 0.1) {
                  if (isReverseJustified || isOverlapJustified) {
                      spiralInStatus = 'JUSTIFICADO';
                      spiralInMsg = `Espiral de ${spiralInLen.toFixed(2)}m justificada por Tangente Curta / Reversa.`;
                  } else if (isTransDispensavel) {
                      spiralInStatus = 'DISPENSADO';
                      spiralInMsg = `Espiral de ${spiralInLen.toFixed(2)}m (menor que ${L_min_required}m), mas R > R.dispensável (${transDispensaRadius}m).`;
                  } else {
                      spiralInStatus = 'REPROVADO';
                      spiralInMsg = `Espiral muito curta: ${spiralInLen.toFixed(2)}m. O mínimo normativo é ${L_min_required}m.`;
                  }
               } else {
                  spiralInMsg = `Espiral de ${spiralInLen.toFixed(2)}m atende o mínimo de ${L_min_required}m.`;
               }
            } else {
               if (isReverseJustified || isOverlapJustified) {
                  spiralInStatus = 'JUSTIFICADO';
                  spiralInMsg = `Espiral ausente, mas trecho justificado (Reversa ou Tangente Curta).`;
               } else if (isTransDispensavel) {
                  spiralInStatus = 'DISPENSADO';
                  spiralInMsg = `Espiral ausente. Normativa dispensa transição para R=${R.toFixed(2)}m > ${transDispensaRadius}m.`;
               } else {
                  spiralInStatus = 'REPROVADO';
                  spiralInMsg = `Espiral ausente! O raio ${R.toFixed(2)}m exige transição mínima de ${L_min_required}m.`;
               }
            }

            // check spiral out
            if (spiralOutLen > 0) {
               if (spiralOutLen < L_min_required - 0.1) {
                  if (isReverseJustified || isOverlapJustified) {
                      spiralOutStatus = 'JUSTIFICADO';
                      spiralOutMsg = `Espiral de ${spiralOutLen.toFixed(2)}m justificada por Tangente Curta / Reversa.`;
                  } else if (isTransDispensavel) {
                      spiralOutStatus = 'DISPENSADO';
                      spiralOutMsg = `Espiral de ${spiralOutLen.toFixed(2)}m (menor que ${L_min_required}m), mas R > R.dispensável (${transDispensaRadius}m).`;
                  } else {
                      spiralOutStatus = 'REPROVADO';
                      spiralOutMsg = `Espiral muito curta: ${spiralOutLen.toFixed(2)}m. O mínimo normativo é ${L_min_required}m.`;
                  }
               } else {
                  spiralOutMsg = `Espiral de ${spiralOutLen.toFixed(2)}m atende o mínimo de ${L_min_required}m.`;
               }
            } else {
               if (isReverseJustified || isOverlapJustified) {
                  spiralOutStatus = 'JUSTIFICADO';
                  spiralOutMsg = `Espiral ausente, mas trecho justificado (Reversa ou Tangente Curta).`;
               } else if (isTransDispensavel) {
                  spiralOutStatus = 'DISPENSADO';
                  spiralOutMsg = `Espiral ausente. Normativa dispensa transição para R=${R.toFixed(2)}m > ${transDispensaRadius}m.`;
               } else {
                  spiralOutStatus = 'REPROVADO';
                  spiralOutMsg = `Espiral ausente! O raio ${R.toFixed(2)}m exige transição mínima de ${L_min_required}m.`;
               }
            }

            out.push({
               curve: geom,
               R,
               L_min_required,
               spiralIn: { len: spiralInLen, status: spiralInStatus, msg: spiralInMsg },
               spiralOut: { len: spiralOutLen, status: spiralOutStatus, msg: spiralOutMsg }
            });
        }
    }
    return out;
  }, [data]);

  const StatusIcon = ({ status }: { status: string }) => {
     if (status === 'APROVADO' || status === 'DISPENSADO') return <CheckCircle className="w-5 h-5 text-green-400" />;
     if (status === 'JUSTIFICADO') return <Info className="w-5 h-5 text-blue-600" />;
     return <AlertTriangle className="w-5 h-5 text-red-500" />;
  };

  const getStatusClass = (status: string) => {
     if (status === 'APROVADO') return 'bg-green-500/10 border-green-500/30 text-green-400';
     if (status === 'DISPENSADO') return 'bg-green-500/10 border-green-500/30 text-green-400';
     if (status === 'JUSTIFICADO') return 'bg-blue-500/10 border-blue-600/30 text-blue-600';
     return 'bg-red-500/10 border-red-500/30 text-red-400';
  };

  const errorCount = results.filter(r => r.spiralIn.status === 'REPROVADO' || r.spiralOut.status === 'REPROVADO').length;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-100/80 backdrop-blur-sm">
      <div className="bg-white border border-slate-300 rounded-lg shadow-2xl flex flex-col w-full max-w-4xl max-h-[85vh] overflow-hidden">
        
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50/50">
           <div className="flex flex-col">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                 Verificação Normativa de Espirais
                 {errorCount > 0 ? (
                    <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded border border-red-500/30 font-semibold">{errorCount} Curvas com Erro</span>
                 ) : (
                    <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded border border-green-500/30 font-semibold">Tudo Correto</span>
                 )}
              </h2>
              <p className="text-xs text-slate-500 mt-1">Verificando normas {data.norm} (V = {data.designSpeed} km/h)</p>
           </div>
           <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors">
              <X className="w-5 h-5" />
           </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
           {results.map((res, i) => (
             <div key={res.curve.id} className="border border-slate-200 bg-slate-50/30 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-300/50 pb-2">
                   <div className="flex items-center gap-3">
                      <span className="bg-slate-100 text-slate-800 text-xs font-bold px-2 py-1 rounded">Curva {i+1}</span>
                      <span className="font-mono text-sm text-slate-700">R = {res.R.toFixed(1)}m</span>
                      <span className="bg-blue-500/10 text-blue-600 border border-blue-600/20 text-xs font-semibold px-2 py-0.5 rounded">
                         L<sub>min</sub> {res.L_min_required}m
                      </span>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                   {/* Spiral In */}
                   <div className={`p-3 rounded border flex gap-3 ${getStatusClass(res.spiralIn.status)}`}>
                      <div className="shrink-0 mt-0.5"><StatusIcon status={res.spiralIn.status} /></div>
                      <div className="flex flex-col">
                         <span className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">Espiral de Entrada (TE-EC)</span>
                         <span className="text-sm">{res.spiralIn.msg}</span>
                      </div>
                   </div>

                   {/* Spiral Out */}
                   <div className={`p-3 rounded border flex gap-3 ${getStatusClass(res.spiralOut.status)}`}>
                      <div className="shrink-0 mt-0.5"><StatusIcon status={res.spiralOut.status} /></div>
                      <div className="flex flex-col">
                         <span className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">Espiral de Saída (CE-ET)</span>
                         <span className="text-sm">{res.spiralOut.msg}</span>
                      </div>
                   </div>
                </div>
             </div>
           ))}
           
           {results.length === 0 && (
             <div className="text-center p-8 text-slate-500">Nenhuma curva encontrada no alinhamento.</div>
           )}
        </div>
      </div>
    </div>
  );
};
