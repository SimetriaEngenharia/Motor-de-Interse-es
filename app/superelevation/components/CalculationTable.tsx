import React, { useEffect, useRef, useState } from 'react';
import { AlignmentData } from '../types';
import { getSuperelevationDispensableRadius, getTransitionDispensableRadius, getRmax, getFmax } from '../utils/referenceTables';

import { calculateCurveParams } from './CalculoMemoria';
import { getAdjacentGeometry } from '../utils/geometryUtils';

interface CalculationTableProps {
  data: AlignmentData;
  updateTrackType?: (newType: 'Coroado' | 'Ramo') => void;
  updateRamoAxis?: (newAxis: 'left' | 'right') => void;
  updateDesignSpeed?: (speed: number) => void;
  updateLaneWidth?: (width: number) => void;
  updateNorm?: (norm: 'DNIT' | 'DER' | 'DNIT - Interseções') => void;
  updateDistAxis?: (dist: number) => void;
  updateEmax?: (eMax: number) => void;
  updateCurveConfig?: (curveId: string, property: 'designSpeed' | 'laneWidth' | 'distAxis' | 'eMax' | 'overrideRadius', value: number | undefined) => void;
  zoomedGeometryId?: string | null;
  onGeometryClick?: (id: string) => void;
}

export const CalculationTable: React.FC<CalculationTableProps> = ({ data, updateTrackType, updateRamoAxis, updateDesignSpeed, updateLaneWidth, updateNorm, updateDistAxis, updateEmax, updateCurveConfig, zoomedGeometryId, onGeometryClick }) => {
  type TransitionCriterion = 'L_ramp' | 'L_accel' | 'L_otica' | 'L_minAbs' | 'finalMinL';
  const [transitionCriterion, setTransitionCriterion] = useState<TransitionCriterion>('L_ramp');

  // Extract only curves for the calculation
  const curves = data.geometries.filter(g => g.type === 'Curve');
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    if (zoomedGeometryId && tbodyRef.current) {
      const selectedRow = tbodyRef.current.querySelector(`tr[data-curve-id="${zoomedGeometryId}"]`);
      if (selectedRow) {
        selectedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [zoomedGeometryId]);

  return (
    <div className="w-full h-full overflow-auto bg-white border border-slate-300 shadow-xl custom-scrollbar" style={{ maxHeight: '100%' }}>
      <table className="w-full text-xs text-center border-collapse whitespace-nowrap">
        <thead className="bg-[#00acc1] text-white font-medium sticky top-0 z-10">
          <tr>
            <th colSpan={1} className="border border-cyan-700/50 px-2 py-2">
              <div className="flex flex-col items-center justify-center gap-1 text-[10px] sm:text-xs font-normal">
                <div className="flex items-center gap-1">
                  <label>Tipo de Eixo:</label>
                  <select 
                    value={data.trackType || 'Coroado'} 
                    onChange={(e) => updateTrackType?.(e.target.value as 'Coroado' | 'Ramo')}
                    className="bg-cyan-800 border border-cyan-500 rounded outline-none px-1 py-0.5 cursor-pointer hover:bg-cyan-700 transition-colors"
                  >
                    <option value="Coroado">Coroado</option>
                    <option value="Ramo">Ramo</option>
                  </select>
                </div>
                {data.trackType === 'Ramo' && (
                  <div className="flex items-center gap-1 mt-1">
                    <label>Eixo no Bordo:</label>
                    <select 
                      value={data.ramoAxis || 'left'} 
                      onChange={(e) => updateRamoAxis?.(e.target.value as 'left' | 'right')}
                      className="bg-cyan-800 border border-cyan-500 rounded outline-none px-1 py-0.5 cursor-pointer hover:bg-cyan-700 transition-colors"
                    >
                      <option value="left">Esquerdo</option>
                      <option value="right">Direito</option>
                    </select>
                  </div>
                )}
              </div>
            </th>
            <th colSpan={7} className="border border-cyan-700/50 px-2 py-2">
              <div className="flex items-center justify-center gap-4">
                <span className="font-semibold uppercase tracking-wider">Premissas</span>
                <div className="flex items-center gap-2 text-[10px] sm:text-xs font-normal bg-cyan-800/50 px-2 py-1 rounded">
                  <div className="flex items-center gap-1">
                    <label>Norma:</label>
                    <select 
                      value={data.norm || 'DNIT'} 
                      onChange={(e) => updateNorm?.(e.target.value as 'DNIT' | 'DER' | 'DNIT - Interseções')}
                      className="bg-cyan-800 border border-cyan-500 rounded outline-none px-1 py-0.5 cursor-pointer hover:bg-cyan-700 transition-colors"
                    >
                      <option value="DNIT">DNIT</option>
                      <option value="DER">DER</option>
                      <option value="DNIT - Interseções">DNIT - Interseções</option>
                    </select>
                  </div>
                </div>
              </div>
            </th>
            <th colSpan={4} className="border border-cyan-700/50 px-2 py-2">Projeto Executivo</th>
          </tr>
          <tr className="bg-[#009aba]">
            <th className="border border-cyan-700/50 px-3 py-2">Curva</th>
            
            <th className="border border-cyan-700/50 px-1 py-1 leading-tight text-center">
              <select
                value={data.designSpeed || 80}
                onChange={(e) => updateDesignSpeed?.(Number(e.target.value))}
                className="bg-transparent border-none text-cyan-50 font-bold outline-none cursor-pointer w-full text-center appearance-none"
                style={{ textAlignLast: 'center' }}
              >
                {[20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130].map(v => (
                  <option className="bg-cyan-800" key={v} value={v}>{v}</option>
                ))}
              </select>
              <div className="text-xs font-normal text-cyan-200 mt-0.5">V (km/h)</div>
            </th>
            <th className="border border-cyan-700/50 px-1 py-1 leading-tight text-center">
              <select
                value={data.laneWidth || 3.6}
                onChange={(e) => updateLaneWidth?.(Number(e.target.value))}
                className="bg-transparent border-none text-cyan-50 font-bold outline-none cursor-pointer w-full text-center appearance-none"
                style={{ textAlignLast: 'center' }}
              >
                {[3.0, 3.3, 3.5, 3.6, 7.20].map(v => (
                  <option className="bg-cyan-800" key={v} value={v}>{v.toFixed(2).replace('.', ',')}</option>
                ))}
              </select>
              <div className="text-xs font-normal text-cyan-200 mt-0.5">Largura faixa (m)</div>
            </th>

            <th className="border border-cyan-700/50 px-1 py-1 leading-tight text-center">
              <select
                value={data.distAxis || 7.2}
                onChange={(e) => updateDistAxis?.(Number(e.target.value))}
                className="bg-transparent border-none text-cyan-50 font-bold outline-none cursor-pointer w-full text-center appearance-none"
                style={{ textAlignLast: 'center' }}
              >
                {[3.6, 7.2].map(v => (
                  <option className="bg-cyan-800" key={v} value={v}>{v.toFixed(2).replace('.', ',')}</option>
                ))}
              </select>
              <div className="text-xs font-normal text-cyan-200 mt-0.5">Dist. Eixo R. (m)</div>
            </th>
            <th className="border border-cyan-700/50 px-1 py-1 leading-tight text-center">
              <select
                value={data.eMax || 8}
                onChange={(e) => updateEmax?.(Number(e.target.value))}
                className="bg-transparent border-none text-cyan-50 font-bold outline-none cursor-pointer w-full text-center appearance-none"
                style={{ textAlignLast: 'center' }}
              >
                {[4, 5, 6, 7, 8, 9, 10, 11, 12].map(v => (
                  <option className="bg-cyan-800" key={v} value={v}>{v}%</option>
                ))}
              </select>
              <div className="text-xs font-normal text-cyan-200 mt-0.5">Emax</div>
            </th>
            <th className="border border-cyan-700/50 px-3 py-2">fmax</th>
            <th className="border border-cyan-700/50 px-3 py-2 leading-tight">Rampa<br/>Máxima (%)</th>
            
            <th className="border border-cyan-700/50 px-3 py-2 leading-tight">Raio da<br/>Curva (m)</th>
            <th className="border border-cyan-700/50 px-3 py-2">Super (%)</th>
            <th className="border border-cyan-700/50 px-1 py-1 leading-tight text-center">
              <select
                value={transitionCriterion}
                onChange={(e) => setTransitionCriterion(e.target.value as TransitionCriterion)}
                className="bg-transparent border-none text-cyan-50 font-bold outline-none cursor-pointer w-full text-center appearance-none"
                style={{ textAlignLast: 'center' }}
              >
                <option className="bg-cyan-800" value="L_ramp">T. Rampa</option>
                <option className="bg-cyan-800" value="L_accel">T. Accel</option>
                <option className="bg-cyan-800" value="L_otica">T. Ótica</option>
                <option className="bg-cyan-800" value="L_minAbs">T. Mín Abs</option>
                <option className="bg-cyan-800" value="finalMinL">T. Maior</option>
              </select>
              <div className="text-xs font-normal text-cyan-200 mt-0.5">(m)</div>
            </th>
            <th className="border border-cyan-700/50 px-3 py-2 leading-tight">Transição<br/>Minima (m)</th>
            <th className="border border-cyan-700/50 px-3 py-2 leading-tight text-[#ffeb3b]">Transição<br/>Adotada (m)</th>
          </tr>
          <tr className="bg-cyan-600/30 text-cyan-50">
            <th colSpan={12} className="border border-cyan-700/50 px-4 py-1.5 font-bold text-left tracking-wider">
              {data.name.toUpperCase()}
            </th>
          </tr>
        </thead>
        <tbody ref={tbodyRef} className="bg-slate-100 text-slate-800 font-mono text-[11px]">
          {curves.length > 0 ? curves.map((curve, index) => {
            // Real parameters from app state
            const globalSpeed = data.designSpeed || 80;
            const globalLaneWidth = data.laneWidth || 3.6;
            const globalDistAxis = data.distAxis || 7.2;
            const globalEmax = data.eMax || 8;
            
            const speed = curve.designSpeed ?? globalSpeed;
            const norm = data.norm || 'DNIT';
            const laneWidth = curve.laneWidth ?? globalLaneWidth;
            const distAxis = curve.distAxis ?? globalDistAxis;
            const eMax = curve.eMax ?? globalEmax;
            
            const fMax = getFmax(speed, norm);
            const rampMax = getRmax(speed, norm);
            
            const baseRadius = curve.radius ? Math.abs(curve.radius) : 1200;
            const radius = curve.overrideRadius ?? baseRadius;
            
            const transitionDispensableR = getTransitionDispensableRadius(speed, norm);
            const superDispensableR = getSuperelevationDispensableRadius(speed, norm);
            
            const params = calculateCurveParams(radius, speed, norm, eMax, distAxis, laneWidth);
            
            let rawSuperPct = radius > superDispensableR ? 1.5 : params.superCalc;
            
            let superPct = rawSuperPct;
            let isSuperRounded = false;
            if (rawSuperPct < 2.0 && rawSuperPct > 0) {
                superPct = 2.0;
                isSuperRounded = true;
            }

            let L_ramp_adjusted = params.L_ramp;
            if (isSuperRounded) {
                L_ramp_adjusted = Math.ceil((distAxis * params.bw * superPct) / params.r_max_percent);
            }
            
            const transition1 = transitionCriterion === 'L_ramp' ? L_ramp_adjusted :
                                transitionCriterion === 'finalMinL' ? Math.max(L_ramp_adjusted, params.L_accel, params.L_otica, params.L_minAbs) :
                                params[transitionCriterion];

            const minTransition = params.L_minAbs;
            
            const geomIndex = data.geometries.indexOf(curve);
            const prevAdj = getAdjacentGeometry(data.geometries, geomIndex, 'prev');
            let actualSpiralLen = 0;
            if (prevAdj && prevAdj.type === 'Spiral') {
                actualSpiralLen = prevAdj.endStation - prevAdj.startStation;
            }
            
            let displayAdopted = '-';
            if (actualSpiralLen > 0) {
               displayAdopted = actualSpiralLen.toFixed(0);
            } else {
               const calcTrans = Math.max(L_ramp_adjusted, minTransition);
               const computedAdotada = Math.ceil(calcTrans / 10) * 10;
               displayAdopted = computedAdotada.toFixed(0);
            }

            const isSelected = curve.id === zoomedGeometryId;
            const rowClasses = isSelected 
              ? "bg-blue-100 hover:bg-blue-200 border-b-2 border-blue-400" 
              : "hover:bg-cyan-100 transition-colors odd:bg-white even:bg-slate-50 border-b border-cyan-100/50";

            return (
              <tr 
                key={curve.id} 
                data-curve-id={curve.id}
                className={`${rowClasses} cursor-pointer transition-all duration-200`}
                onClick={() => onGeometryClick?.(curve.id)}
              >
                <td className="border-r border-cyan-200/50 px-2 py-1.5 text-center">{index + 1}</td>
                
                <td className="border-r border-cyan-200/50 p-0 text-center bg-cyan-50/30">
                  <input type="number" min={0} 
                    value={curve.designSpeed ?? ''} 
                    placeholder={globalSpeed.toString()} 
                    onChange={e => updateCurveConfig?.(curve.id, 'designSpeed', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-transparent text-center outline-none py-1.5 focus:bg-white focus:ring-1 focus:ring-cyan-400 placeholder:-text-cyan-800 placeholder-opacity-50" />
                </td>
                <td className="border-r border-cyan-200/50 p-0 text-center bg-cyan-50/30">
                  <input type="number" min={0} step={0.1}
                    value={curve.laneWidth ?? ''} 
                    placeholder={globalLaneWidth.toFixed(2).replace('.', ',')} 
                    onChange={e => updateCurveConfig?.(curve.id, 'laneWidth', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-transparent text-center outline-none py-1.5 focus:bg-white focus:ring-1 focus:ring-cyan-400 placeholder:-text-cyan-800 placeholder-opacity-50" />
                </td>
                <td className="border-r border-cyan-200/50 p-0 text-center bg-cyan-50/30">
                  <input type="number" min={0} step={0.1}
                    value={curve.distAxis ?? ''} 
                    placeholder={globalDistAxis.toString()} 
                    onChange={e => updateCurveConfig?.(curve.id, 'distAxis', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-transparent text-center outline-none py-1.5 focus:bg-white focus:ring-1 focus:ring-cyan-400 placeholder:-text-cyan-800 placeholder-opacity-50" />
                </td>
                <td className="border-r border-cyan-200/50 p-0 text-center bg-cyan-50/30">
                  <input type="number" min={0} step={0.1}
                    value={curve.eMax ?? ''} 
                    placeholder={globalEmax.toString()} 
                    onChange={e => updateCurveConfig?.(curve.id, 'eMax', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-transparent text-center outline-none py-1.5 focus:bg-white focus:ring-1 focus:ring-cyan-400 placeholder:-text-cyan-800 placeholder-opacity-50" />
                </td>
                <td className="border-r border-cyan-200/50 px-2 py-1.5 text-center bg-cyan-50/30">{fMax.toString().replace('.', ',')}</td>
                <td className="border-r border-cyan-200/50 px-2 py-1.5 text-center bg-cyan-50/30">{rampMax.toString().replace('.', ',')}</td>
                
                <td className="border-r border-cyan-200/50 p-0 text-center">
                  <input type="number" min={0} 
                    value={curve.overrideRadius ?? ''} 
                    placeholder={baseRadius.toFixed(0)} 
                    onChange={e => updateCurveConfig?.(curve.id, 'overrideRadius', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-transparent text-center outline-none py-1.5 focus:bg-white focus:ring-1 focus:ring-cyan-400 placeholder:-text-cyan-800 placeholder-opacity-50" />
                </td>
                <td 
                  className={`border-r border-cyan-200/50 px-2 py-1.5 text-center ${isSuperRounded ? 'bg-orange-200 font-bold' : ''}`}
                  title={isSuperRounded ? `Arredondado de ${rawSuperPct.toFixed(2)}% para 2.00%` : undefined}
                >
                  {superPct.toFixed(2).replace('.', ',')}
                </td>
                <td className="border-r border-cyan-200/50 px-2 py-1.5 text-center">{transition1.toFixed(2).replace('.', ',')}</td>
                <td className="border-r border-cyan-200/50 px-2 py-1.5 text-center">{minTransition}</td>
                <td 
                  className={`border-r border-cyan-200/50 px-2 py-1.5 text-center text-slate-800 font-bold ${actualSpiralLen > 0 ? 'bg-orange-200' : ''}`}
                  title={actualSpiralLen > 0 ? "Comprimento da Espiral Importada" : undefined}
                >
                  {displayAdopted}
                </td>
              </tr>
            );
          }) : (
             <tr>
               <td colSpan={12} className="border border-cyan-200 px-4 py-8 text-slate-500">
                 Nenhuma curva encontrada no eixo atual.
               </td>
             </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
