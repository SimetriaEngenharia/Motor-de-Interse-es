import React, { useMemo } from 'react';
import { AlignmentData } from '../types';
import { FATOR_DE_ATRITO, SUPERELEVATION_DISPENSABLE, TRANSITION_DISPENSABLE, getFmax, getRmax, getSuperelevationDispensableRadius, getTransitionDispensableRadius } from '../utils/referenceTables';

interface CalculoMemoriaProps {
  data: AlignmentData;
  zoomedGeometryId: string | null;
}

// Tabela 10.7 Comprimento Mínimo Transição from DER - NOT fully visible, so we use LminAbs estimates based on normal formulas
export const getLminAbs = (v: number) => {
    // Fmax list for DER L min (30 30 30 30 40 40 50 60 60 70 etc)
    if (v <= 60) return 30;
    if (v <= 80) return 40;
    if (v <= 90) return 50;
    if (v <= 110) return 60;
    return 70;
};

export const calculateCurveParams = (R: number, V: number, norm: string, eMax: number, distAxis: number, laneWidth?: number) => {
  const fmax = getFmax(V, norm);
  const Rmin = Math.pow(V, 2) / (127 * ( (eMax/100) + fmax ));
  let e_calc_pct = 1.5; // Padrão mínimo de abaulamento na planilha de referência
  if (R < Rmin) {
     e_calc_pct = eMax;
  } else {
     const ratio = Rmin / R;
     // Usamos a formula hiperbolica padrao: e = e_max * (2*(Rmin/R) - (Rmin/R)^2)
     const e_ratio = (eMax/100) * (2 * ratio - ratio * ratio);
     e_calc_pct = Math.max(1.5, e_ratio * 100);
  }
  
  // A planilha de referência parece arredondar a superelevação SEMPRE para cima no MÚLTIPLO de 0.1%
  e_calc_pct = Math.ceil(e_calc_pct * 10) / 10;
  
  const superCalc = Math.min(eMax, e_calc_pct);
  
  const r_max_percent = getRmax(V, norm);
  
  // Fator de largura equivalente b_w (AASHTO / Manuais brasileiros com multiplas faixas)
  let bw = 1.0;
  if (laneWidth && laneWidth > 0 && distAxis > laneWidth) {
    const n = distAxis / laneWidth; // número de faixas giradas
    bw = 0.5 + 0.5 / n;
  }
  
  // A planilha arredonda a transição de rampa calculada para o MÚLTIPLO superior de 1 m
  const L_ramp = Math.ceil((distAxis * bw * superCalc) / r_max_percent);
  
  const C = -0.009 * V + 1.5;
  const accelTerm1 = Math.pow(V, 3) / (46.656 * C * R);
  const accelTerm2 = ( (superCalc/100) * V ) / (0.367 * C);
  const L_accel = Math.max(0, accelTerm1 - accelTerm2);
  
  const L_otica = R / 9;
  const L_minAbs = getLminAbs(V);
  
  const finalMinL = norm === 'DNIT - Interseções' 
    ? Math.max(L_ramp, L_otica, L_minAbs)
    : Math.max(L_ramp, L_accel, L_otica, L_minAbs);
  const L_adotado = Math.ceil(finalMinL / 10) * 10;

  return {
    fmax,
    C,
    accelTerm1,
    accelTerm2,
    Rmin,
    superCalc,
    bw,
    r_max_percent,
    L_ramp,
    L_accel,
    L_otica,
    L_minAbs,
    finalMinL,
    L_adotado
  };
};

export const calculateCurveMinLength = (R: number, V: number, norm: string, eMax: number, distAxis: number, laneWidth?: number) => {
  return calculateCurveParams(R, V, norm, eMax, distAxis, laneWidth).L_adotado;
};

export const CalculoMemoria: React.FC<CalculoMemoriaProps> = ({ data, zoomedGeometryId }) => {
  const curve = useMemo(() => {
    if (!zoomedGeometryId) return null;
    const geom = data.geometries.find(g => g.id === zoomedGeometryId);
    if (!geom || geom.type !== 'Curve') return null;
    return geom;
  }, [data, zoomedGeometryId]);

  if (!curve) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white border-none text-slate-500 font-medium">
         <div className="text-center">
            <p className="text-lg mb-2">Selecione uma Curva</p>
            <p className="text-sm">Clique em uma curva na Planilha, na Planta ou no Gráfico para visualizar a Memória de Cálculo detalhada.</p>
         </div>
      </div>
    );
  }

  // Pre-calculated or assumed variables (could be derived from inputs in the future)
  const V = data.designSpeed || 80;
  const norm = data.norm || 'DNIT';
  const laneWidth = data.laneWidth || 3.6; // Largura da Faixa
  const numLanes = 2; // Número de Faixas total
  const B = data.distAxis || 7.2;
  const eMax = data.eMax || 8.0; // Taxa máxima de superelevação admissível (%), e_max = 8%
  const R = Math.abs(curve.radius || 1200);
  
  // Tables logic
  const superDispensavel = getSuperelevationDispensableRadius(V, norm);
  const transDispensa = getTransitionDispensableRadius(V, norm);
  
  const isSuperDispensavel = R > (superDispensavel || 0);
  const isTransDispensavel = R > (transDispensa || 0);

  const r_max_percent = getRmax(V, norm);
  
  const isIntersecoes = norm === 'DNIT - Interseções';
  const manualName = isIntersecoes ? "Manual de Projeto de Interseções (DNIT)" : `Tabelas de Referência ${norm}`;
  const tableFmax = isIntersecoes ? "Manual de Interseções (Tab. de Atrito)" : "Manual (Quadro 5.4.3.1)";
  const tableRmax = isIntersecoes ? "Manual de Interseções (Tab. de Rampa)" : "(Quadro 5.4.5.4)";
  const tableLmin = isIntersecoes ? "Manual de Interseções" : `Quadro 5.4.5.3 (V=${V}km/h)`;
  const tableSuperelev = isIntersecoes ? "Diretrizes de Interseções" : "Superelevação (Tabela 10.7)";

  const {
    fmax,
    C,
    accelTerm1,
    accelTerm2,
    Rmin,
    superCalc,
    bw,
    L_ramp,
    L_accel,
    L_otica,
    L_minAbs,
    finalMinL,
    L_adotado
  } = calculateCurveParams(R, V, norm, eMax, B, data.laneWidth);

  // Other lengths
  const L_maxTempo = 2.2 * V;
  const L_maxCurva = R;

  return (
    <div className="w-full text-slate-800 p-6">
      <div className="max-w-4xl mx-auto space-y-8 pb-10">
        
        {/* Cabeçalho */}
        <div className="border-b border-slate-300 pb-4">
          <h2 className="text-xl font-bold text-white mb-1">Memória de Cálculo da Curva</h2>
          <div className="flex gap-4 text-sm font-mono text-slate-500">
             <span>Estaca Inicial: <strong className="text-slate-800">{Math.floor(curve.startStation/20)} + {(curve.startStation%20).toFixed(2)}</strong></span>
             <span>Estaca Final: <strong className="text-slate-800">{Math.floor(curve.endStation/20)} + {(curve.endStation%20).toFixed(2)}</strong></span>
          </div>
        </div>

        {/* 1. Dados Iniciais */}
        <section className="bg-slate-50/60 p-4 rounded-lg border border-slate-300">
           <h3 className="text-lg font-semibold text-blue-600 mb-3 flex items-center gap-2">
             1. Dados Básicos de Projeto
           </h3>
           <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="flex flex-col">
                 <span className="text-xs text-slate-500">Raio da Curva (R)</span>
                 <span className="font-mono text-lg">{R.toFixed(2)} m</span>
              </div>
              <div className="flex flex-col">
                 <span className="text-xs text-slate-500">Norma</span>
                 <span className="font-mono text-lg">{norm}</span>
              </div>
              <div className="flex flex-col">
                 <span className="text-xs text-slate-500">Velocidade (V)</span>
                 <span className="font-mono text-lg">{V} km/h</span>
              </div>
              <div className="flex flex-col">
                 <span className="text-xs text-slate-500">Dist. Eixo-Bordo</span>
                 <span className="font-mono text-lg">{B.toFixed(2)} m</span>
              </div>
              <div className="flex flex-col">
                 <span className="text-xs text-slate-500">e<sub>máx</sub></span>
                 <span className="font-mono text-lg">{eMax}%</span>
              </div>
           </div>
        </section>

        {/* Avaliação de Dispensa */}
        <section>
          <h3 className="text-lg font-semibold text-blue-600 mb-2 border-b border-slate-300 pb-2">2. Critérios de Dispensa ({manualName})</h3>
          <p className="text-sm text-slate-700 leading-relaxed mb-4">
            Avaliando as tabelas normativas pertinentes para uma velocidade de <strong>{V} km/h</strong>:
          </p>
          <div className="grid md:grid-cols-2 gap-4 text-sm font-mono">
            <div className={`p-4 rounded border ${isSuperDispensavel ? 'border-green-500/50 bg-green-500/10' : 'border-slate-300 bg-slate-50'}`}>
               <p className="font-sans font-semibold mb-2 text-slate-700">{tableSuperelev}</p>
               <p>Raio p/ dispensa: <strong>{superDispensavel} m</strong></p>
               <p>Raio Atual: <strong>{R.toFixed(2)} m</strong></p>
               <p className={`mt-2 ${isSuperDispensavel ? 'text-green-400' : 'text-yellow-400'}`}>
                 {isSuperDispensavel ? 'Abaulamento mantido. Superelevação dispensada.' : 'Necessita cálculo de Superelevação.'}
               </p>
            </div>
            <div className={`p-4 rounded border ${isTransDispensavel ? 'border-green-500/50 bg-green-500/10' : 'border-slate-300 bg-slate-50'}`}>
               <p className="font-sans font-semibold mb-2 text-slate-700">Curvas de Transição</p>
               <p>Raio p/ dispensa: <strong>{transDispensa} m</strong></p>
               <p>Raio Atual: <strong>{R.toFixed(2)} m</strong></p>
               <p className={`mt-2 ${isTransDispensavel ? 'text-green-400' : 'text-yellow-400'}`}>
                 {isTransDispensavel ? 'Transição dispensada.' : 'Necessita Curva de Transição.'}
               </p>
            </div>
          </div>
        </section>

        {/* 3. Coeficiente de Atrito e Rmin */}
        <section>
           <h3 className="text-lg font-semibold text-blue-600 mb-2 border-b border-slate-300 pb-2">3. Coeficiente de Atrito e Raio Mínimo</h3>
           <p className="text-sm text-slate-700 leading-relaxed mb-4">
             De acordo com o {tableFmax}, o coeficiente de atrito transversal máximo (<code className="text-yellow-400 bg-slate-50 px-1 rounded">f_max</code>) limitante para a velocidade de <strong>{V} km/h</strong> é de <strong>{fmax.toFixed(2)}</strong>.
           </p>
           
           <div className="bg-white border border-slate-300 rounded p-4 font-mono text-sm">
              <p className="mb-2 text-slate-500">Fórmula do Raio Mínimo para não escorregamento:</p>
              <div className="bg-slate-50 px-4 py-3 rounded mb-3 flex justify-center text-center">
                 R<sub>min</sub> = V² / [127 × (e<sub>max</sub> + f<sub>max</sub>)]
              </div>
              <p className="text-slate-700">
                 R<sub>min</sub> = {V}² / [127 × ({(eMax/100).toFixed(2)} + {fmax.toFixed(2)})]<br/>
                 R<sub>min</sub> = {(Math.pow(V, 2)).toFixed(0)} / { (127*(eMax/100 + fmax)).toFixed(2) } = <strong className="text-green-400">{Rmin.toFixed(2)} m</strong>
              </p>
           </div>
        </section>

        {/* 3. Taxa de Superelevação Calculada */}
        <section>
           <h3 className="text-lg font-semibold text-blue-600 mb-2 border-b border-slate-300 pb-2">4. Cálculo da Superelevação (e%)</h3>
           <p className="text-sm text-slate-700 leading-relaxed mb-4">
             Considerando raios crescentes a partir de R<sub>min</sub> (3ª Hipótese, item 5.4.5.5), reduz-se gradual e simultaneamente a taxa de superelevação 
             e a força de atrito até que seja atingido o final da necessidade de elevação. O raio do projeto é de <strong>{R.toFixed(2)} m</strong>.
           </p>

           <div className="bg-white border border-slate-300 rounded p-4 font-mono text-sm">
              <p className="mb-2 text-slate-500">Distribuição da Superelevação {isIntersecoes ? '(Método AASHTO / DNIT Interseções)' : '(3ª Hipótese)'}:</p>
              <div className="bg-slate-50 px-4 py-3 rounded mb-3 flex justify-center text-center">
                 e = e<sub>max</sub> × [ 2(R<sub>min</sub> / R) - (R<sub>min</sub> / R)² ]
              </div>
              {R < Rmin ? (
                  <p className="text-red-400">
                    Raio {R.toFixed(2)} m é menor que o Raio mínimo ({Rmin.toFixed(2)} m)!<br/>
                    Superelevação Adotada: {eMax.toFixed(2)}%
                  </p>
              ) : (
                  <p className="text-slate-700">
                     e = {eMax}% × [ 2({Rmin.toFixed(2)} / {R.toFixed(2)}) - ({Rmin.toFixed(2)} / {R.toFixed(2)})² ]<br/>
                     e = {eMax}% × [ { (2 * Rmin / R).toFixed(4) } - { Math.pow(Rmin / R, 2).toFixed(4) } ]<br/>
                     <span className="text-lg text-green-400 font-bold block mt-3">e<sub>calculado</sub> = {superCalc.toFixed(2)}%</span>
                  </p>
              )}
           </div>
        </section>

        {/* 4. Comprimento de Transição */}
        <section>
           <h3 className="text-lg font-semibold text-blue-600 mb-2 border-b border-slate-300 pb-2">5. L<sub>min</sub> - Comprimento Mínimo de Transição</h3>
           <p className="text-sm text-slate-700 leading-relaxed mb-4">
             Para efetuar o giro do pavimento, considera-se a envoltória de restrições físicas.{' '}
             {isIntersecoes && "Nas interseções, verifica-se prioritariamente a rampa relativa e tempo de deflexão."}<br/>
             A mais severa definirá o valor final (L<sub>min</sub> final).
           </p>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div className="bg-slate-50 border border-slate-300 rounded p-4 font-mono text-xs">
                 <h4 className="text-blue-300 mb-2 border-b border-slate-300 pb-1">I. Rampa Máxima de Superelevação</h4>
                 <p className="mb-2 text-slate-500">Evita desnível severo nos bordos. r<sub>max</sub> {tableRmax} = {r_max_percent.toFixed(2)}%</p>
                 <div className="bg-white p-2 rounded mb-2">
                    L = (B × {bw !== 1.0 ? 'bw × ' : ''}e) / r<sub>max</sub>
                 </div>
                 {bw !== 1.0 && <p className="mb-2 text-slate-500">b_w (fator múltiplas faixas) = {bw.toFixed(2)}</p>}
                 <p>L = ({B.toFixed(2)}m × {bw !== 1.0 ? `${bw.toFixed(2)} × ` : ''}{superCalc.toFixed(2)}%) / {r_max_percent.toFixed(3)}%</p>
                 <p className="text-green-400 mt-1">L = {L_ramp.toFixed(2)} m</p>
              </div>

              {!isIntersecoes && (
              <div className="bg-slate-50 border border-slate-300 rounded p-4 font-mono text-xs">
                 <h4 className="text-blue-300 mb-2 border-b border-slate-300 pb-1">II. Aceleração Centrífuga Mín.</h4>
                 <p className="mb-2 text-slate-500">Limita conforto C = -0.009V + 1.5 = {C.toFixed(3)}</p>
                 <div className="bg-white p-2 rounded mb-2">
                    L = [V³ / (46.656·C·R)] - [(e·V) / (0.367·C)]
                 </div>
                 <p>L = {accelTerm1.toFixed(2)} - {accelTerm2.toFixed(2)}</p>
                 <p className="text-green-400 mt-1">L = {L_accel.toFixed(2)} m</p>
              </div>
              )}

              <div className="bg-slate-50 border border-slate-300 rounded p-4 font-mono text-xs">
                 <h4 className="text-blue-300 mb-2 border-b border-slate-300 pb-1">{isIntersecoes ? 'II. Fluência Ótica' : 'III. Fluência Ótica'}</h4>
                 <p className="mb-2 text-slate-500">Garante a concordância visual da curva.</p>
                 <div className="bg-white p-2 rounded mb-2">
                    L ≥ R / 9
                 </div>
                 <p>L = {R.toFixed(2)} / 9</p>
                 <p className="text-green-400 mt-1">L = {L_otica.toFixed(2)} m</p>
              </div>

              <div className="bg-slate-50 border border-slate-300 rounded p-4 font-mono text-xs">
                 <h4 className="text-blue-300 mb-2 border-b border-slate-300 pb-1">{isIntersecoes ? 'III. Comprimento Mín. Absoluto' : 'IV. Comprimento Mín. Absoluto'}</h4>
                 <p className="mb-2 text-slate-500">Critério de transição de viagem viável em projeto ({tableLmin}).</p>
                 <div className="bg-white p-2 rounded mb-2">
                    L ≥ Tabelado (Critério {V}km/h)
                 </div>
                 <p>Valor Tabelado</p>
                 <p className="text-green-400 mt-1">L = {L_minAbs.toFixed(2)} m</p>
              </div>

           </div>
           
           <div className="mt-6 flex flex-col sm:flex-row items-center gap-4 bg-[#0fa3b1]/20 border border-[#0fa3b1]/40 rounded-lg p-5">
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#8bfaff]">Conclusão de L<sub>min</sub></p>
                <p className="text-xs text-slate-700 mt-1">
                   O comprimento adotado obedece à envoltória contendo o maior valor rigoroso das condições acima calculadas, arredondado para uso de campo.
                </p>
              </div>
              <div className="bg-white px-6 py-4 rounded font-mono text-center border border-slate-300">
                <p className="text-xs text-slate-500 mb-1">Max({L_ramp.toFixed(1)}, {isIntersecoes ? '' : `${L_accel.toFixed(1)}, `}{L_otica.toFixed(1)}, {L_minAbs.toFixed(1)})</p>
                <div className="text-3xl font-bold text-[#8bfaff] tracking-wider">{L_adotado} m</div>
              </div>
           </div>

        </section>

      </div>
    </div>
  );
}
