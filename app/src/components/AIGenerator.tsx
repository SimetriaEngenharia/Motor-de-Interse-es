import React, { useState, useEffect, useRef } from 'react';
import { SearchCode, Settings2, Target, GitMerge, GitBranch, LayoutTemplate, X, Workflow, Clipboard, CheckCircle2, Play, Save, Upload, Code } from 'lucide-react';
import JSZip from 'jszip';
import { cn } from '../lib/utils';
import { useStore } from '../store';
import { pedirPlanoIA } from '../lib/aiChat';

// Types
interface LogicPlan {
  reply: string;
  packetSettings?: { subassemblyName: string, description: string, version: string };
  parameters: { name: string; type: string; direction: string; defaultValue: string; description: string; }[];
  targetParameters: { name: string; type: string; description: string; }[];
  superelevation?: { name: string; type: string; description: string; }[];
  cant?: { name: string; type: string; description: string; }[];
  flowchart: { step: number; type: string; name: string; description: string; howToCreate?: string }[];
  expressions: { elementType: string; elementName: string; property: string; formula: string; explanation: string; }[];
  decisions: { name: string; condition: string; truePath: string; falsePath: string; explanation: string; }[];
  simulator?: {
    description: string;
    surfaceSlider?: { min: number, max: number, default: number };
    horizontalTargetSlider?: { min: number, max: number, default: number };
    jsFunctionBody: string;
  };
}

// Subcomponent for Code Block Copy
const CopyBlock = ({ title, text }: { title?: string, text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden mb-3 relative group">
      {title && (
        <div className="flex bg-zinc-900 border-b border-zinc-800 px-3 py-1.5 justify-between items-center">
          <span className="text-xs font-medium text-zinc-400">{title}</span>
          <button 
            onClick={handleCopy}
            className="text-zinc-500 hover:text-emerald-600 transition-colors flex items-center gap-1.5 focus:outline-none"
            title="Copiar texto"
          >
            {copied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Clipboard size={14} />}
            <span className="text-[10px] uppercase font-semibold">{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
        </div>
      )}
      <div className="p-3 overflow-x-auto">
        <code className="text-xs font-mono text-emerald-300 whitespace-pre">{text}</code>
      </div>
      {!title && !!text && (
         <div className="absolute right-2 top-2">
           <button 
             onClick={handleCopy}
             className="p-1.5 bg-zinc-800 rounded text-zinc-500 hover:text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity"
           >
             {copied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Clipboard size={14} />}
           </button>
         </div>
      )}
    </div>
  );
}

const CopyInline = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex justify-between items-center group/copy cursor-pointer" onClick={() => {
      if(!text) return;
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }}
    title="Clique para copiar">
      <span className="truncate">{text}</span>
      {copied ? <CheckCircle2 size={12} className="text-blue-500 ml-1 shrink-0" /> : <Clipboard size={12} className="text-blue-300 opacity-0 group-hover/copy:opacity-100 ml-1 shrink-0 transition-opacity" />}
    </div>
  )
}

const ComposerMockup = ({ plan, selectedStepIndex, setSelectedStepIndex, surfaceVal, setSurfaceVal, targetXVal, setTargetXVal, simulatorData, onPlanUpdate, onPointClick }: any) => {
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  return (
    <div className="flex-1 flex flex-col relative min-w-0 min-h-0 bg-[#e7ebef] text-[#333] font-sans h-full">
      <div className="flex-1 flex flex-col min-h-0 relative">
        <div className="bg-[#e0e0e0] px-2 py-1 text-xs font-semibold border-b border-[#ccc] flex justify-between items-center w-full z-10">
          <span>Preview</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom(z => z * 1.2)} className="w-5 h-5 flex items-center justify-center bg-white border border-gray-300 rounded text-gray-600 hover:bg-gray-100" title="Zoom In">+</button>
            <button onClick={() => setZoom(z => z / 1.2)} className="w-5 h-5 flex items-center justify-center bg-white border border-gray-300 rounded text-gray-600 hover:bg-gray-100" title="Zoom Out">-</button>
          </div>
        </div>
        <div 
          className="flex-1 relative overflow-hidden bg-white cursor-crosshair"
          onWheel={(e) => {
            setZoom(z => Math.max(0.1, Math.min(10, z * (1 - e.deltaY * 0.001))));
          }}
          onMouseDown={(e) => {
            setIsPanning(true);
            setStartPan({ x: e.clientX, y: e.clientY });
          }}
          onMouseMove={(e) => {
            if (isPanning) {
              const dx = (e.clientX - startPan.x) * (20 / zoom / 500); // approximate scale mapping
              const dy = (e.clientY - startPan.y) * (20 / zoom / 500);
              setPan({ x: pan.x - dx, y: pan.y - dy }); // Notice SVG coordinate system
              setStartPan({ x: e.clientX, y: e.clientY });
            }
          }}
          onMouseUp={() => setIsPanning(false)}
          onMouseLeave={() => setIsPanning(false)}
        >
          <svg width="100%" height="100%" viewBox={`${-10/zoom + pan.x} ${-10/zoom + pan.y} ${20/zoom} ${20/zoom}`} preserveAspectRatio="xMidYMid meet" className="flex-1">
             <defs>
               <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
                 <rect width="1" height="1" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="0.05" />
               </pattern>
             </defs>
             <rect width="100%" height="100%" fill="url(#grid)" x="-50" y="-50"/>
             
             <g transform="scale(1, -1)">
               <line x1="0" y1="-50" x2="0" y2="50" stroke="rgba(239,68,68,0.5)" strokeWidth={0.1 / zoom} strokeDasharray={`${0.5/zoom} ${0.5/zoom}`} />
               {!isNaN(surfaceVal) && (
                 <line x1="-50" y1={surfaceVal} x2="50" y2={surfaceVal} stroke="#65a30d" strokeWidth={0.1 / zoom} />
               )}
               {!isNaN(targetXVal) && (
                 <line x1={targetXVal} y1="-50" x2={targetXVal} y2="50" stroke="#d97706" strokeWidth={0.1 / zoom} strokeDasharray={`${0.5/zoom} ${0.5/zoom}`} />
               )}
               
               {/* Render links and points */}
               {simulatorData.links?.map((link: any, i: number) => {
                 const p1 = simulatorData.points?.find((p: any) => p.id === link.start || p.id === link.p1);
                 const p2 = simulatorData.points?.find((p: any) => p.id === link.end || p.id === link.p2);
                 if (!p1 || !p2 || isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)) return null;
                 
                 let color = "#3b82f6";
                 if (link.type === 'cut') color = "#ef4444";
                 if (link.type === 'fill') color = "#10b981";
                 
                 const midX = (p1.x + p2.x) / 2;
                 const midY = (p1.y + p2.y) / 2;
                 let dx = p2.x - p1.x;
                 let dy = p2.y - p1.y;
                 let slopeText = '';
                 if (Math.abs(dx) > 0.0001) {
                   let pct = (dy / dx) * 100;
                   slopeText = `${pct.toFixed(1)}%`;
                 } else {
                   slopeText = 'Vert.';
                 }

                 return (
                   <g key={`link-${i}`}>
                     <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={0.2 / zoom} />
                     <text x={midX} y={-(midY + 0.3/zoom)} fill={color} fontSize={1.0 / zoom} transform="scale(1, -1)" textAnchor="middle" className="font-bold pointer-events-none">{slopeText}</text>
                   </g>
                 );
               })}

               {simulatorData.points?.map((p: any, i: number) => {
                 if (isNaN(p.x) || isNaN(p.y)) return null;
                 return (
                   <g key={i} onClick={() => onPointClick && onPointClick(p)} className="cursor-pointer group">
                     <circle cx={p.x} cy={p.y} r={0.8 / zoom} fill="transparent" />{/* larger invisible touch target */}
                     <circle cx={p.x} cy={p.y} r={0.2 / zoom} fill="#fff" stroke="#ef4444" strokeWidth={0.05 / zoom} className="group-hover:stroke-emerald-500 group-hover:fill-emerald-100 transition-colors" />
                     <text x={Number(p.x) + (0.3/zoom)} y={-(Number(p.y) + (0.3/zoom))} fill="#333" fontSize={1.2 / zoom} transform="scale(1, -1)" className="pointer-events-none font-bold">{p.id}</text>
                   </g>
                 );
               })}
             </g>
          </svg>
        </div>
        {(plan.simulator?.surfaceSlider || plan.simulator?.horizontalTargetSlider) && (
          <div className="bg-[#f0f0f0] border-t border-[#ccc] p-2 shrink-0 flex flex-col gap-2 relative z-10 w-full">
            {plan.simulator?.surfaceSlider && (
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 mb-1">
                  Testar Terreno (Surface Elev): <span className="text-blue-600">{surfaceVal.toFixed(1)}m</span>
                </label>
                <input 
                  type="range" 
                  min={plan.simulator.surfaceSlider.min} 
                  max={plan.simulator.surfaceSlider.max} 
                  step={0.1}
                  value={surfaceVal}
                  onChange={(e) => setSurfaceVal(parseFloat(e.target.value))}
                  className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer outline-none"
                />
              </div>
            )}
            {plan.simulator?.horizontalTargetSlider && (
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 mb-1">
                  Testar Target Horizontal (X): <span className="text-orange-600">{targetXVal.toFixed(1)}m</span>
                </label>
                <input 
                  type="range" 
                  min={plan.simulator.horizontalTargetSlider.min} 
                  max={plan.simulator.horizontalTargetSlider.max} 
                  step={0.1}
                  value={targetXVal}
                  onChange={(e) => setTargetXVal(parseFloat(e.target.value))}
                  className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer outline-none"
                />
              </div>
            )}
            <button 
              onClick={() => {
                const addAssembly = useStore.getState().addAssembly;
                if (!plan.packetSettings) return;
                
                const simParams = plan.parameters.map((p: any) => ({
                    id: p.name,
                    name: p.name,
                    value: parseFloat(p.defaultValue) || 0,
                    type: p.type
                }));
                
                addAssembly({
                    name: plan.packetSettings.subassemblyName,
                    parameters: simParams,
                    links: simulatorData.links.map((l: any) => ({
                        id: l.id || `${l.p1 || l.start}-${l.p2 || l.end}`,
                        p1: l.p1 || l.start,
                        p2: l.p2 || l.end
                    })),
                    jsFunctionBody: plan.simulator?.jsFunctionBody,
                });
                alert("Sessão criada e adicionada nas disponíveis!");
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-1.5 rounded mt-1 shadow"
            >
               Importar para Corredor (Beta)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AIGenerator({ onClose }: { onClose: () => void }) {
  const [activePlan, setActivePlan] = useState<LogicPlan | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(-1);
  const [surfaceVal, setSurfaceVal] = useState<number>(0);
  const [targetXVal, setTargetXVal] = useState<number>(0);
  const [simulatorData, setSimulatorData] = useState<{points:any[], links:any[]}>({ points: [], links: [] });
  const loadInputRef = useRef<HTMLInputElement>(null);

  // Parse simulator body safely
  useEffect(() => {
    if (activePlan?.simulator && activePlan.parameters) {
      try {
        const params: Record<string, number> = {};
        activePlan.parameters.forEach((p: any) => {
          params[p.name] = parseFloat(p.defaultValue) || 0;
        });
        params['SurfaceY'] = surfaceVal;
        params['surfaceY'] = surfaceVal;
        params['TargetX'] = targetXVal;
        params['targetX'] = targetXVal;

        let bodyToRun = activePlan.simulator.jsFunctionBody || '';
        bodyToRun = bodyToRun.replace(/^```[a-z]*\n?/im, '').replace(/```$/m, '');
        
        const varsToInject = Object.keys(params).filter(v => {
           return !new RegExp(`(?:const|let|var)\\s+(?:{\\s*[^}]*\\b${v}\\b[^}]*\\s*}|\\b${v}\\b)`).test(bodyToRun);
        });

        const injectVars = varsToInject.length > 0 ? `const { ${varsToInject.join(', ')} } = params;\n` : '';
        const dynamicFn = new Function('params', injectVars + bodyToRun);
        const result = dynamicFn(params);
        setSimulatorData(result);
      } catch (err) {
        console.error("Error executing dynamic simulator function:", err);
      }
    }
  }, [surfaceVal, targetXVal, activePlan]);

  const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (parsed.activePlan) setActivePlan(parsed.activePlan);
        else setActivePlan(parsed);
      } catch (err) {
        alert("Erro ao ler arquivo de projeto.");
      }
    };
    reader.readAsText(file);
    if (loadInputRef.current) loadInputRef.current.value = '';
  };

  const handleChat = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const msg = fd.get("msg") as string;
      if (!msg) return;
      e.currentTarget.reset();
      
      try {
          setActivePlan(await pedirPlanoIA(msg, activePlan));
      } catch (err) {
          console.error(err);
          alert("A IA não respondeu. Configure GEMINI_API_KEY em .env.local ou suba o backend /api/chat.");
      }
  };

  return (
    <div className="fixed inset-0 bg-zinc-950 z-[999] flex flex-col text-zinc-100 font-sans shadow-2xl">
      <div className="bg-zinc-900 border-b border-zinc-800 p-3 flex justify-between items-center shadow-md shrink-0">
        <div className="flex items-center gap-2">
          <Workflow size={20} className="text-emerald-500" />
          <div>
            <h1 className="font-bold text-zinc-100 text-sm tracking-tight leading-none">Criador de Seção Tipo com IA</h1>
            <span className="text-[10px] text-zinc-400">Subassembly Composer Simulator</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="file" ref={loadInputRef} onChange={loadProject} accept=".json" className="hidden" />
          <button onClick={() => loadInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-emerald-600 rounded text-xs transition-colors border border-zinc-700">
             <Upload size={14} /> Carregar JSON
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 border border-red-800 hover:bg-red-900/50 text-red-400 rounded text-xs transition-colors ml-2">
             <X size={14} /> Fechar
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden min-h-0 bg-zinc-950">
        {!activePlan ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 w-full relative">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/40 via-zinc-950 to-zinc-950 pointer-events-none" />
              <div className="z-10 bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-xl max-w-xl w-full">
                  <h2 className="text-xl font-bold text-zinc-200 mb-2">Descreva a seção que você deseja criar</h2>
                  <p className="text-sm text-zinc-400 mb-6">A Inteligência Artificial vai gerar o fluxograma lógico, as fórmulas e os parâmetros automaticamente.</p>
                  
                  <form onSubmit={handleChat} className="flex flex-col gap-3">
                      <textarea 
                        name="msg"
                        placeholder="Ex: Crie uma valeta triangular de 1 metro de largura..."
                        className="w-full bg-zinc-950 border border-zinc-700 rounded p-4 text-emerald-600 font-mono text-sm resize-none h-32 focus:outline-none focus:border-emerald-600"
                      />
                      <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded transition-colors shadow-lg">
                          Gerar Seção
                      </button>
                  </form>
                  <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-center">
                    <button onClick={() => loadInputRef.current?.click()} className="text-xs text-blue-600 hover:text-blue-300">Ou faça upload de um projeto antigo (JSON)</button>
                  </div>
              </div>
            </div>
        ) : (
            <div className="flex-1 flex w-full h-full relative">
                {/* Left Side: Logic / Text */}
                <div className="w-1/2 flex flex-col border-r border-zinc-800 bg-zinc-900 h-full overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                        {activePlan.reply && (
                            <div className="mb-6 bg-blue-900/20 border border-blue-900/50 p-4 rounded-lg text-sm text-blue-200 shadow-inner">
                                {activePlan.reply}
                            </div>
                        )}
                        
                        <div className="mb-6">
                            <h3 className="text-xs font-bold text-emerald-500 mb-3 uppercase tracking-widest border-b border-zinc-800 pb-1">Parâmetros (Input)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {activePlan.parameters.map((p: any, i: number) => (
                                    <div key={i} className="bg-zinc-800 p-2 rounded text-xs border border-zinc-700/50 flex flex-col">
                                        <span className="font-mono text-emerald-300 font-medium">{p.name} ({p.type}) = {p.defaultValue}</span>
                                        <span className="text-zinc-500 text-[10px] mt-1 line-clamp-2">{p.description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mb-6">
                            <h3 className="text-xs font-bold text-orange-500 mb-3 uppercase tracking-widest border-b border-zinc-800 pb-1">Targets</h3>
                            <div className="grid grid-cols-1 gap-2">
                                {activePlan.targetParameters.map((p: any, i: number) => (
                                    <div key={i} className="bg-zinc-800 p-2 rounded text-xs border border-zinc-700/50 flex flex-col">
                                        <span className="font-mono text-orange-300 font-medium">{p.name} ({p.type})</span>
                                        <span className="text-zinc-500 text-[10px] mt-1">{p.description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mb-6">
                            <h3 className="text-xs font-bold text-purple-600 mb-3 uppercase tracking-widest border-b border-zinc-800 pb-1">Chat para Ajustes</h3>
                            <form onSubmit={handleChat} className="flex gap-2">
                                <input 
                                    type="text" 
                                    name="msg"
                                    placeholder="Peça ajustes para a IA (ex: diminui a largura pra 0.5)"
                                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-600"
                                />
                                <button type="submit" className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded text-sm font-medium">Enviar</button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* Right Side: Mockup Preview */}
                <div className="w-1/2 flex flex-col bg-slate-100 h-full">
                     <ComposerMockup 
                          plan={activePlan} 
                          selectedStepIndex={selectedStepIndex} 
                          setSelectedStepIndex={setSelectedStepIndex} 
                          surfaceVal={surfaceVal} 
                          setSurfaceVal={setSurfaceVal} 
                          targetXVal={targetXVal}
                          setTargetXVal={setTargetXVal}
                          simulatorData={simulatorData} 
                          onPlanUpdate={setActivePlan}
                     />
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
