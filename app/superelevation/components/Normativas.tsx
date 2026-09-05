import React, { useMemo, useState } from 'react';
import { AlignmentData } from '../types';
import { SUPERELEVATION_DISPENSABLE, TRANSITION_DISPENSABLE, RAMPA_MAXIMA, getSuperelevationDispensableRadius, getTransitionDispensableRadius } from '../utils/referenceTables';

const TabButton = ({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${
      active 
        ? 'border-blue-600 text-blue-600 bg-slate-50/50' 
        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50/30'
    }`}
  >
    {children}
  </button>
);

const TabelaDispensaSuper = ({ V }: { V: number }) => (
  <div className="border border-slate-300 bg-slate-50/50 rounded-lg overflow-hidden flex flex-col w-full max-w-4xl mx-auto mb-8">
    <div className="bg-white px-4 py-3 border-b border-slate-300">
      <h4 className="text-slate-800 font-semibold text-center">
        Tabela 10.7 – Valores dos Raios Acima dos Quais a Superelevação é Dispensável
      </h4>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-center border-collapse">
        <thead>
          <tr className="bg-slate-50/80">
            <th className="border border-slate-300 py-2 px-3 font-semibold text-slate-700" colSpan={2}>V (km/h)</th>
            {[30,40,50,60,70,80,90,100,110,120,130].map(val => (
              <th key={`th-${val}`} className={`border border-slate-300 py-2 px-2 ${V === val ? 'text-blue-600 font-bold bg-blue-400/10' : ''}`}>{val}</th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-slate-50/30">
          <tr>
            <td className="border border-slate-300 py-2 px-3 font-medium text-slate-700 row-span-2 align-middle border-r-0" rowSpan={2}>
              R<sub>min</sub> (m)
            </td>
            <td className="border border-slate-300 py-2 px-3 text-slate-500 font-medium whitespace-nowrap">
              DNER<br/>1999
            </td>
            {[450,800,1250,1800,2450,3200,4050,5000,5000,5000,5000].map((r, idx) => {
              const val = [30,40,50,60,70,80,90,100,110,120,130][idx];
              return <td key={`dner-${val}`} className={`border border-slate-300 py-2 px-2 ${V === val ? 'text-blue-600 font-bold bg-blue-400/10' : ''}`}>{r}</td>;
            })}
          </tr>
          <tr>
            <td className="border border-slate-300 py-2 px-3 text-slate-500 font-medium whitespace-nowrap">
              AASHTO<br/>2004
            </td>
            {[450,800,1100,1530,2020,2500,3030,3700,4270,4990,5450].map((r, idx) => {
              const val = [30,40,50,60,70,80,90,100,110,120,130][idx];
              return <td key={`aashto-${val}`} className={`border border-slate-300 py-2 px-2 ${V === val ? 'text-blue-600 font-bold bg-blue-400/10' : ''}`}>{r}</td>;
            })}
          </tr>
        </tbody>
      </table>
    </div>
    <div className="bg-white px-4 py-2 border-t border-slate-300 text-xs text-slate-500 text-left">
      Fontes: Tabela 10.7 do Manual de Projeto Geométrico de Rodovias Rurais do DNER (Pág. 125 da publicação IPR-706) e A Policy on Geometric Design of Highways and Streets.
    </div>
  </div>
);

const TabelaRampaMaxima = ({ V }: { V: number }) => (
  <div className="border border-slate-300 bg-slate-50/50 rounded-lg overflow-hidden flex flex-col w-full max-w-4xl mx-auto mb-8">
    <div className="bg-white px-4 py-3 border-b border-slate-300">
      <h4 className="text-slate-800 font-semibold text-center uppercase tracking-wide">
        RAMPA MÁXIMA
      </h4>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-center border-collapse">
        <thead>
          <tr className="bg-slate-50/80">
            <th className="border border-slate-300 py-2 px-3 font-semibold text-slate-700">Veloc.</th>
            {[30,40,50,60,70,80,90,100,110,120].map(val => (
              <th key={`th-ramp-${val}`} className={`border border-slate-300 py-2 px-2 ${V === val ? 'text-blue-600 font-bold bg-blue-400/10' : ''}`}>{val}</th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-slate-50/30">
          <tr>
            <td className="border border-slate-300 py-2 px-3 text-slate-500 font-medium whitespace-nowrap">
              Rampa (%)
            </td>
            {[0.73, 0.73, 0.65, 0.59, 0.54, 0.5, 0.47, 0.43, 0.43, 0.43].map((r, idx) => {
              const val = [30,40,50,60,70,80,90,100,110,120][idx];
              return <td key={`ramp-${val}`} className={`border border-slate-300 py-2 px-2 ${V === val ? 'text-blue-600 font-bold bg-blue-400/10' : ''}`}>{r.toString().replace('.', ',')}</td>;
            })}
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

const TabelaDispensaTransicao = ({ V }: { V: number }) => (
  <div className="border border-slate-300 bg-slate-50/50 rounded-lg overflow-hidden flex flex-col w-full max-w-4xl mx-auto mb-8">
    <div className="bg-white px-4 py-3 border-b border-slate-300">
      <h4 className="text-slate-800 font-semibold text-center uppercase tracking-wide">
        Valores dos Raios Acima dos Quais Podem ser Dispensadas Curvas de Transição
      </h4>
    </div>
    <div className="overflow-x-auto flex flex-col gap-6 p-4">
      
      {/* Tabela DER/SP */}
      <div>
        <h5 className="text-slate-500 text-xs font-semibold uppercase mb-2">DER/SP</h5>
        <table className="w-full text-sm text-center border-collapse">
          <thead>
            <tr className="bg-slate-50/80">
              <th className="border border-slate-300 py-2 px-3 font-semibold text-slate-700">Veloc.</th>
              {[20,30,40,50,60,70,80,90,100,110,120,130].map(val => (
                <th key={`th-dersp-${val}`} className={`border border-slate-300 py-2 px-2 ${V === val ? 'text-blue-600 font-bold bg-blue-400/10' : ''}`}>{val}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-slate-50/30">
            <tr>
              <td className="border border-slate-300 py-2 px-3 text-slate-500 font-medium whitespace-nowrap" colSpan={13}>
                Comprimento Mínimo Transição
              </td>
            </tr>
            <tr>
               <td className="border border-slate-300 py-2 px-3 text-slate-500 font-medium">Veloc.</td>
               {[30,40,50,60,70,80,90,100,110,120].map((val, i) => (
                  <td key={`v-min-${val}`} className={`border border-slate-300 py-2 px-2 ${V === val ? 'text-blue-600 font-bold bg-blue-400/10' : ''}`}>{val}</td>
               ))}
               <td className="border border-slate-300 py-2 px-2" colSpan={2}></td>
            </tr>
            <tr>
               <td className="border border-slate-300 py-2 px-3 font-medium text-slate-500">fmáx</td>
               {[30,30,30,30,40,40,50,60,60,70].map((val, i) => {
                  const spd = [30,40,50,60,70,80,90,100,110,120][i];
                  return <td key={`fmax-${i}`} className={`border border-slate-300 py-2 px-2 ${V === spd ? 'text-blue-600 font-bold bg-blue-400/10' : ''}`}>{val}</td>
               })}
               <td className="border border-slate-300 py-2 px-2" colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tabela DNER */}
      <div>
        <h5 className="text-slate-500 text-xs font-semibold uppercase mb-2">DNER</h5>
        <table className="w-full text-sm text-center border-collapse">
          <thead>
            <tr className="bg-slate-50/80">
              <th className="border border-slate-300 py-2 px-3 font-semibold text-slate-700">Veloc.</th>
              {[30,40,50,60,70,80,90,100,110,120].map(val => (
                <th key={`th-dner-vd-${val}`} className={`border border-slate-300 py-2 px-2 ${V === val ? 'text-blue-600 font-bold bg-blue-400/10' : ''}`}>{val}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-slate-50/30">
            <tr>
              <td className="border border-slate-300 py-2 px-3 font-medium text-slate-500">Raio</td>
              {[170,300,500,700,950,1200,1550,1900,2300,2800].map((val, i) => {
                 const spd = [30,40,50,60,70,80,90,100,110,120][i];
                 return <td key={`dner-raio-${i}`} className={`border border-slate-300 py-2 px-2 ${V === spd ? 'text-blue-600 font-bold bg-blue-400/10' : ''}`}>{val}</td>
              })}
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  </div>
);

interface NormativasProps {
  data: AlignmentData;
  zoomedGeometryId: string | null;
}

export const NormativasView: React.FC<NormativasProps> = ({ data, zoomedGeometryId }) => {
  const [activeTab, setActiveTab] = useState<'casos'|'tabelas'>('casos');

  const curve = useMemo(() => {
    if (!zoomedGeometryId) return null;
    const geom = data.geometries.find(g => g.id === zoomedGeometryId);
    if (!geom || geom.type !== 'Curve') return null;
    return geom;
  }, [data, zoomedGeometryId]);

  if (!curve) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white border-none text-slate-500 font-medium p-6">
         <div className="text-center">
            <p className="text-lg mb-2">Selecione uma Curva</p>
            <p className="text-sm">Clique em uma curva para visualizar as normativas e excessões.</p>
         </div>
      </div>
    );
  }

  const V = data.designSpeed || 80;
  const norm = data.norm || 'DNIT';
  const R = Math.abs(curve.radius || 1200);

  const superDispensavel = getSuperelevationDispensableRadius(V, norm);
  const transDispensa = getTransitionDispensableRadius(V, norm);
  
  const isSuperDispensavel = R > (superDispensavel || 0);
  const isTransDispensavel = R > (transDispensa || 0);

  const isOverlapJustified = data.justifications?.some(j => 
    (j.curveId === curve.id && j.text.includes("Tangente Curta") && j.startStation === curve.endStation) || 
    (j.startStation <= curve.startStation && j.endStation >= curve.startStation && j.text.includes("Tangente Curta")) ||
    (j.startStation <= curve.endStation && j.endStation >= curve.endStation && j.text.includes("Tangente Curta"))
  ) || false;

  const isReverseJustified = data.justifications?.some(j => 
    (j.curveId === curve.id && j.text.includes("Reversas") && j.startStation === curve.endStation) || 
    (j.startStation <= curve.startStation && j.endStation >= curve.startStation && j.text.includes("Reversas")) ||
    (j.startStation <= curve.endStation && j.endStation >= curve.endStation && j.text.includes("Reversas"))
  ) || false;

  const hasExceptionalCase = isSuperDispensavel || isTransDispensavel || isOverlapJustified || isReverseJustified;

  return (
    <div className="w-full text-slate-800 flex flex-col h-full">
      <div className="flex bg-white border-b border-slate-300/50 shrink-0 select-none">
         <TabButton active={activeTab === 'casos'} onClick={() => setActiveTab('casos')}>
           Casos Excepcionais (Curva Atual)
         </TabButton>
         <TabButton active={activeTab === 'tabelas'} onClick={() => setActiveTab('tabelas')}>
           Tabelas de Consulta
         </TabButton>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {activeTab === 'casos' && (
          <div className="max-w-4xl mx-auto space-y-8 pb-10">
            
            {/* Cabeçalho */}
            <div className="border-b border-slate-300 pb-4">
              <h2 className="text-xl font-bold text-white mb-1">Normativas Aplicadas à Curva</h2>
              <div className="flex gap-4 text-sm font-mono text-slate-500">
                 <span>Raio: <strong className="text-slate-800">{R.toFixed(2)}m</strong></span>
                 <span>Norma: <strong className="text-slate-800">{norm} ({V} km/h)</strong></span>
              </div>
            </div>

            {hasExceptionalCase ? (
              <section className="bg-slate-50/60 p-4 rounded-lg border border-yellow-500/50 mb-6 relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-2 h-full bg-yellow-500/80"></div>
                 <h3 className="text-lg font-semibold text-yellow-400 mb-2 pl-4 border-b border-slate-300 pb-2">Casos Excepcionais de Projeto (Adoção {norm})</h3>
                 <p className="text-sm text-slate-700 leading-relaxed mb-4 pl-4">
                   Segundo as diretrizes de projeto geométrico ({norm === 'DNIT' ? 'DNER/DNIT' : 'DER'}), existem casos fundamentais de exceção que o gráfico atende e as rotinas adotam automaticamente e que foram aplicados a esta curva:
                 </p>
                 
                 <div className="pl-4">
                   {(isSuperDispensavel || isTransDispensavel) && (
                     <>
                       <h4 className="text-slate-800 font-semibold mb-2">1. Curvas de Grande Raio (Dispensa)</h4>
                       <p className="text-slate-500 italic mb-4 text-sm">
                         Quando R &gt; R<sub>dispensável</sub>, o atrito lateral torna-se muito pequeno. Dispensa-se a necessidade de superelevar a pista e mantem-se o abaulamento padrão (normalmente -2% para favorecer a drenagem). Também pode-se dispensar o uso de trecho de acomodação espiral.
                       </p>
                       <div className='bg-slate-50/80 rounded p-3 text-xs text-yellow-300 border border-yellow-500/30 mb-4 mt-2'><strong>Nota Explicativa (Item de Gráfico "Dispensa de Super. (Norma)"):</strong><br/>O raio excede o limite tabelado ({superDispensavel}m): É seguro e normativo adotar o trecho como "Normal" ou ignorar superelevação.</div>
                     </>
                   )}
                   
                   {isOverlapJustified && (
                     <>
                       <h4 className="text-slate-800 font-semibold mb-2 mt-6">2. Tangentes Curtas (Desenvolvimento Contínuo)</h4>
                       <p className="text-slate-500 italic mb-4 text-sm">
                         "Nos casos em que o comprimento da tangente intermediária for insuficiente para o retorno ao abaulamento e desenvolvimento da próxima rampa de superelevação suavemente, pode-se manter a superelevação interligada e contínua." Esta prática previne reversões bruscas ou "torções" repentinas no pavimento, mantendo a estabilidade dinâmica do projeto.
                       </p>
                       
                       <div className="bg-slate-50/80 rounded p-3 text-xs text-yellow-300 border border-yellow-500/30 mt-4">
                         <strong>Nota Explicativa (Item de Gráfico "Tangente Curta (Norma)"):</strong><br/>
                         Tangente curta contínua: Superelevações foram mescladas propositalmente ignorando simetria formal para manter estabilidade viária.
                       </div>
                     </>
                   )}

                   {isReverseJustified && (
                     <>
                       <h4 className="text-slate-800 font-semibold mb-2 mt-6">3. Curvas Reversas (Transição Contínua)</h4>
                       <p className="text-slate-500 italic mb-4 text-sm">
                         Segundo o Manual de Projeto Geométrico, em percursos com curvas reversas, a inclinação transversal da pista deve variar de forma contínua do valor da superelevação máxima de uma curva até o valor máximo da curva seguinte. A seção em que a pista se apresenta horizontal (inclinação transversal nula) deve coincidir com o Ponto de Inflexão. Dessa forma, é suprimida a necessidade e o dever normativo de retornar a pista ao abaulamento normal entre as duas curvas, o que causaria solavancos na direção.
                       </p>

                       <div className="bg-slate-50/80 rounded p-3 text-xs text-yellow-300 border border-yellow-500/30 mt-4">
                         <strong>Nota Explicativa (Item de Gráfico "Curvas Reversas"):</strong><br/>
                         Transição contínua identificada: Foi detectada uma inflexão direta (curvas reversas). O gráfico aplica o cruzamento da rampa através da linha nula (0%) interligando diretamente as superelevações sem o estágio de abaulamento normal intermediário (-2%), atendendo ao critério de segurança direcional.
                       </div>
                     </>
                   )}
                 </div>
              </section>
            ) : (
              <div className="bg-slate-50/40 p-6 rounded-lg border border-slate-300/50 text-center text-slate-500">
                 Não há casos excepcionais ou dispensas normativas aplicáveis a esta curva. <br/>A curva segue os trâmites e comprimentos rigorosos de dimensionamento.
              </div>
            )}
          </div>
        )}

        {activeTab === 'tabelas' && (
          <div className="max-w-5xl mx-auto space-y-6 pb-12 pt-4">
             <TabelaRampaMaxima V={V} />
             <TabelaDispensaSuper V={V} />
             <TabelaDispensaTransicao V={V} />
          </div>
        )}
      </div>
    </div>
  );
}
