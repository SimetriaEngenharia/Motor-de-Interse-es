import React, { useState, useMemo, useEffect, useRef } from "react";
import { useStore, LARGURA_NARIZ_FISICO, OFFSET_BORDO_NARIZ, COMPR_NARIZ_FISICO, TipoNariz } from "../store";
import { narizKey, recusasNariz, rotuloNF } from "../lib/intersection";
import { DraggableWindow } from "./DraggableWindow";
import {
  Crosshair,
  Sliders,
  Sparkles,
  BookOpen,
  Info,
  CheckCircle2,
  XCircle,
  RotateCw,
  Layers,
  ArrowRight,
  HelpCircle,
  Maximize2,
  Check,
  ChevronDown,
  ChevronUp,
  TrendingUp,
} from "lucide-react";

export function NTWindow() {
  const intId = useStore((state: any) => state.ntWindowIntersectionId);
  if (!intId) return null;
  return <NTWindowModal intId={intId} />;
}

function NTWindowModal({ intId }: { intId: string }) {
  const store = useStore() as any;
  const [activeTab, setActiveTab] = useState<"lista" | "editor" | "guia">("lista");
  const [selectedNtKey, setSelectedNtKey] = useState<string | null>(null);
  const [showDidacticBanner, setShowDidacticBanner] = useState(true);
  /* DESTAQUE VINDO DA PLANTA — o chip NT-xx abre a janela pedindo ênfase num
     nariz. Guardamos a chave, rolamos até ao item e apagamos o realce a seguir. */
  const [destaque, setDestaque] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [simShowGhost, setSimShowGhost] = useState<boolean>(true);

  const focoKey = store.ntWindowFocusKey as string | null;
  useEffect(() => {
    if (!focoKey) return;
    setActiveTab("lista");
    setDestaque(focoKey);
    store.setNtWindowFocusKey(null);
    const t = window.setTimeout(() => {
      const el = itemRefs.current[focoKey];
      if (el) {
        /* rolagem manual: procura o ancestral que rola e centra o item nele.
           Sem scrollIntoView — mexe no layout de toda a app. */
        let p: HTMLElement | null = el.parentElement;
        while (p && p.scrollHeight <= p.clientHeight + 1) p = p.parentElement;
        if (p) {
          const r = el.getBoundingClientRect(), rp = p.getBoundingClientRect();
          p.scrollTo({ top: p.scrollTop + (r.top - rp.top) - (rp.height - r.height) / 2, behavior: "smooth" });
        }
      }
    }, 60);
    const t2 = window.setTimeout(() => setDestaque(null), 2600);
    return () => { window.clearTimeout(t); window.clearTimeout(t2); };
  }, [focoKey]);

  const int = store.intersections.find((i: any) => i.id === intId);
  const nts = (store.intersectionNTs?.[intId] || []) as any[];

  /* NARIZ DE CUNHA — nenhum dos dois braços é bordo de pista principal, os dois
     são bordos de ramo. É o caso que precisa de um afastamento por ramo. */
  const raizPistaSet = useMemo(
    () => new Set((store.intersections || []).map((i: any) => i.mainAlignmentId)),
    [store.intersections],
  );
  const nomeAlin = (id?: string) =>
    (store.alignments || []).find((a: any) => a.id === id)?.name || null;

  // Lista com status processado
  const ntsProcessados = useMemo(() => {
    return nts.map((nt, idx) => {
      const key = narizKey(nt);
      const escolha = store.ntEscolhas?.[key];
      const recusa = recusasNariz[key] || null;
      const ativo = escolha === "sim" || (escolha !== "nao" && nt.sugerido !== false);
      const tipo: TipoNariz = store.ntTipos?.[key] || "entrada";
      const params = store.ntParams?.[key] || {};
      const largura = (params.larguraCustom && params.larguraCustom > 0) ? params.larguraCustom : LARGURA_NARIZ_FISICO[tipo];
      const offset = params.offset ?? OFFSET_BORDO_NARIZ;
      const ehCunha = !!(nt.raizA && nt.raizB &&
        !raizPistaSet.has(nt.raizA) && !raizPistaSet.has(nt.raizB));
      const offsetB = params.offsetB ?? offset;
      const comprimento = params.comprimento ?? COMPR_NARIZ_FISICO;
      const estiloPonta = params.estiloPonta ?? "chanfro";
      const tratamento = params.tratamento ?? "zebrado";

      return {
        ...nt,
        key,
        index: idx + 1,
        ativo,
        recusa,
        tipo,
        largura,
        offset,
        offsetB,
        ehCunha,
        nomeRamoA: nomeAlin(nt.raizA),
        nomeRamoB: nomeAlin(nt.raizB),
        comprimento,
        estiloPonta,
        tratamento,
        params,
      };
    });
  }, [nts, store.ntEscolhas, store.ntTipos, store.ntParams, raizPistaSet, store.alignments]);

  // Se nenhum estiver selecionado para o editor, seleciona o primeiro
  const currentSelectedNt = useMemo(() => {
    if (!ntsProcessados.length) return null;
    if (selectedNtKey) {
      const found = ntsProcessados.find((n) => n.key === selectedNtKey);
      if (found) return found;
    }
    return ntsProcessados[0];
  }, [ntsProcessados, selectedNtKey]);



  // Ações em massa
  const ativarTodos = () => {
    ntsProcessados.forEach((nt) => {
      store.setNtEscolha(nt.key, "sim");
    });
  };

  const padronizarDER = () => {
    ntsProcessados.forEach((nt) => {
      store.setNtParam(nt.key, {
        offset: 1.0,
        offsetB: 1.0,
        comprimento: 25.0,
        estiloPonta: "chanfro",
        tratamento: "zebrado",
      });
    });
  };

  const totalAtivos = ntsProcessados.filter((n) => n.ativo).length;

  return (
    <DraggableWindow
      title={`Modelagem de Narizes — ${int?.name || "Interseção"}`}
      onClose={() => store.setNtWindowIntersectionId(null)}
      initialWidth={720}
      initialHeight={580}
      initialX={140}
      initialY={70}
    >
      <div className="h-full flex flex-col bg-slate-900 text-slate-100 font-sans select-none overflow-hidden">
        {/* TOPO: Informações de contexto e contadores */}
        <div className="shrink-0 px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-orange-500/20 text-orange-400 flex items-center justify-center">
              <Crosshair size={14} />
            </div>
            <div>
              <div className="text-xs font-semibold text-white flex items-center gap-2">
                <span>{int?.name || "Interseção"}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {ntsProcessados.length} narizes ({totalAtivos} ativos)
                </span>
              </div>
              <div className="text-[10px] text-slate-400">
                Ponto de encontro (NT) e ponta construída de transição (NF)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowDidacticBanner(!showDidacticBanner)}
              className="px-2 py-1 text-[10px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
              title="O que são Nariz Teórico e Nariz Físico?"
            >
              <HelpCircle size={12} className="text-amber-400" />
              <span>O que é Nariz?</span>
              {showDidacticBanner ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </div>

        {/* BANNER DIDÁTICO EXPANSÍVEL (Para quem não sabe o que é Nariz) */}
        {showDidacticBanner && (
          <div className="shrink-0 p-3 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 border-b border-slate-800">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-900/90 border border-purple-500/30 rounded-lg p-2.5 flex items-start gap-2.5">
                <div className="w-5 h-5 rounded bg-purple-500/20 text-purple-400 shrink-0 flex items-center justify-center text-[10px] font-bold font-mono">
                  NT
                </div>
                <div>
                  <div className="font-semibold text-purple-300 text-[11px] flex items-center gap-1">
                    <span>Nariz Teórico (Virtual)</span>
                  </div>
                  <p className="text-[10.5px] text-slate-300 leading-snug mt-0.5">
                    É o <b>vértice geométrico exato</b> onde as bordas das duas vias se cruzam no papel. Não é pavimentado nem construído pontudo por motivo de segurança.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-orange-500/30 rounded-lg p-2.5 flex items-start gap-2.5">
                <div className="w-5 h-5 rounded bg-orange-500/20 text-orange-400 shrink-0 flex items-center justify-center text-[10px] font-bold font-mono">
                  NF
                </div>
                <div>
                  <div className="font-semibold text-orange-300 text-[11px] flex items-center gap-1">
                    <span>Nariz Físico (Construído)</span>
                  </div>
                  <p className="text-[10.5px] text-slate-300 leading-snug mt-0.5">
                    É a <b>ponta real da ilha ou zebrado</b>. Fica <b>recuado</b> até atingir a largura de segurança (1,00 m a 2,00 m), com transição suave para as pistas.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NAVEGAÇÃO ENTRE ABAS */}
        <div className="shrink-0 flex items-center px-2 bg-slate-950/80 border-b border-slate-800 text-xs overflow-x-auto custom-scrollbar">
          {[
            { id: "lista", label: "Gestão dos Narizes", icon: Layers, count: ntsProcessados.length },
            { id: "editor", label: "Parâmetros Físicos", icon: Sliders },
            { id: "guia", label: "Normas & Conceitos", icon: BookOpen },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-all whitespace-nowrap ${
                  isSelected
                    ? "border-orange-500 text-orange-400 bg-slate-900"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
                }`}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* CONTEÚDO DA ABA */}
        <div className="flex-1 overflow-y-auto bg-slate-900 text-slate-200 p-3 custom-scrollbar">
          {/* ======================================================== */}
          {/* ABA 1: LISTA E GESTÃO GERAL DOS NARIZES                 */}
          {/* ======================================================== */}
          {activeTab === "lista" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                <div className="text-xs text-slate-300">
                  Cada cruzamento de bordo gera um par <b className="text-purple-400">NT</b> (Teórico) e <b className="text-orange-400">NF</b> (Físico).
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={ativarTodos}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium rounded transition-colors"
                  >
                    Ativar Todos
                  </button>
                  <button
                    onClick={padronizarDER}
                    className="px-2.5 py-1 bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-medium rounded transition-colors flex items-center gap-1 shadow-sm"
                  >
                    <Sparkles size={11} />
                    Padronizar DER-SP
                  </button>
                </div>
              </div>

              {ntsProcessados.length === 0 ? (
                <div className="text-center py-12 px-4 bg-slate-950/40 rounded-lg border border-slate-800">
                  <Crosshair size={32} className="mx-auto text-slate-600 mb-2 animate-pulse" />
                  <div className="text-sm font-semibold text-slate-300">Nenhum Nariz Identificado Automaticamente</div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                    Certifique-se de que os alinhamentos principal e ramos possuem bordos gerados e se interceptam no plano 2D.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {ntsProcessados.map((nt) => (
                    <div
                      key={nt.id}
                      ref={(el) => { itemRefs.current[nt.key] = el; }}
                      className={`p-3 rounded-lg border transition-all duration-500 ${
                        destaque === nt.key
                          ? "bg-slate-900 border-orange-500/70 ring-2 ring-orange-500/60 shadow-lg shadow-orange-950/40"
                          : nt.ativo
                          ? "bg-slate-950/80 border-slate-700/80 hover:border-slate-600"
                          : "bg-slate-950/30 border-slate-800/50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={nt.ativo}
                            onChange={() => store.setNtEscolha(nt.key, nt.ativo ? "nao" : "sim")}
                            className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-orange-500 focus:ring-orange-500 focus:ring-offset-slate-900 cursor-pointer"
                            title={nt.ativo ? "Desativar este nariz" : "Ativar este nariz"}
                          />
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-sm text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                              {rotuloNF(nt.id)}
                            </span>
                            <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${
                              nt.tipo === "entrada"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : nt.tipo === "saida"
                                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            }`}>
                              {nt.tipo} ({nt.largura.toFixed(2)} m)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedNtKey(nt.key);
                              setActiveTab("editor");
                            }}
                            className="px-2.5 py-1 text-[11px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded flex items-center gap-1 transition-colors"
                          >
                            <Sliders size={12} />
                            Ajustar Parâmetros
                          </button>
                        </div>
                      </div>

                      {/* Detalhes Técnicos e Geométricos */}
                      {nt.recusa && (
                        <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-2">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300">
                            <XCircle size={12} />
                            Nariz físico não construído
                          </div>
                          <p className="text-[10.5px] text-rose-200/90 leading-snug mt-0.5 m-0">
                            {nt.recusa}.
                          </p>
                          <p className="text-[10px] text-slate-400 leading-snug mt-1 m-0">
                            Confirmar na mão não vale aqui: não é discordância de critério, é
                            geometria degenerada — a ponta colapsa e a linha corre para o
                            lado errado. Ajuste o raio do quadrante ou a largura do ramo.
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5 pt-2 border-t border-slate-800/80 text-[11px]">
                        <div>
                          <span className="text-slate-500 block text-[10px]">Origem (Bordos)</span>
                          <span className="font-mono text-slate-300 font-medium truncate block" title={`${nt.armA} × ${nt.armB}`}>
                            {nt.armA} × {nt.armB}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Coordenadas NT (E, N)</span>
                          <span className="font-mono text-slate-300 font-medium block">
                            E {nt.x.toFixed(2)} · N {nt.y.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Afastamento (Offset)</span>
                          <span className="font-mono text-purple-300 font-medium block">
                            {nt.ehCunha && Math.abs(nt.offsetB - nt.offset) > 1e-6
                              ? `${nt.offset.toFixed(2)} / ${nt.offsetB.toFixed(2)} m`
                              : `${nt.offset.toFixed(2)} m`}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Trecho Transição (L)</span>
                          <span className="font-mono text-orange-300 font-medium block">
                            {nt.comprimento.toFixed(1)} m ({nt.estiloPonta})
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}


          {/* ======================================================== */}
          {/* ABA 3: EDITOR DETALHADO DE PARÂMETROS                    */}
          {/* ======================================================== */}
          {activeTab === "editor" && currentSelectedNt && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-base text-orange-400 bg-slate-900 px-2.5 py-1 rounded border border-slate-700">
                      {rotuloNF(currentSelectedNt.id)}
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-white">Configuração do Nariz Físico</div>
                      <div className="text-[10px] text-slate-400">
                        Ajuste todos os parâmetros físicos para este ponto específico.
                      </div>
                    </div>
                  </div>

                  {/* Seletor de outros narizes */}
                  <select
                    value={currentSelectedNt.key}
                    onChange={(e) => setSelectedNtKey(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                  >
                    {ntsProcessados.map((n) => (
                      <option key={n.key} value={n.key}>
                        {rotuloNF(n.id)} ({n.tipo} - {n.largura.toFixed(2)} m)
                      </option>
                    ))}
                  </select>
                </div>

                {/* 1. Função da Pista & Largura */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-200 block">
                    1. Função da Pista (Largura Nominal do Nariz)
                  </label>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    A largura do corte determina o recuo de segurança do Nariz Físico em relação ao Nariz Teórico.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {[
                      { id: "entrada", title: "Entrada (2,00 m)", desc: "Pista de aceleração / convergência (DER-SP)" },
                      { id: "saida", title: "Saída (1,00 m)", desc: "Pista de desaceleração / divergência (DER-SP)" },
                      { id: "misto", title: "Misto (1,50 m)", desc: "Bifurcação, retorno ou canteiro central" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => {
                          store.setNtTipo(currentSelectedNt.key, opt.id as any);
                          store.setNtParam(currentSelectedNt.key, { larguraCustom: undefined });
                        }}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          currentSelectedNt.tipo === opt.id && !currentSelectedNt.params?.larguraCustom
                            ? "bg-orange-600/20 border-orange-500 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="font-semibold text-xs text-white">{opt.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <label className="text-xs text-slate-300 whitespace-nowrap">Largura Personalizada (m):</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.3"
                      max="10.0"
                      value={currentSelectedNt.params?.larguraCustom ?? currentSelectedNt.largura}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        store.setNtParam(currentSelectedNt.key, { larguraCustom: val > 0 ? val : undefined });
                      }}
                      className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-orange-400"
                    />
                  </div>
                </div>

                {/* 2. Afastamento (Offset) e Comprimento de Giro (L) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                  <div>
                    <label className="text-xs font-semibold text-slate-200 block mb-1">
                      Afastamento do Bordo (Offset)
                    </label>
                    <p className="text-[10px] text-slate-400 mb-2">
                      {currentSelectedNt.ehCunha
                        ? "Cunha entre dois ramos: cada braço afasta do seu próprio bordo (padrão DER: 1,00 m)."
                        : "Distância lateral de afastamento da linha do ramo (padrão DER: 1,00 m)."}
                    </p>
                    {currentSelectedNt.ehCunha ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="5.0"
                            value={currentSelectedNt.offset}
                            onChange={(e) => store.setNtParam(currentSelectedNt.key, { offset: Number(e.target.value) })}
                            className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-purple-300"
                          />
                          <span className="text-xs text-slate-400 truncate">
                            m · {currentSelectedNt.nomeRamoA || "ramo A"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="5.0"
                            value={currentSelectedNt.offsetB}
                            onChange={(e) => store.setNtParam(currentSelectedNt.key, { offsetB: Number(e.target.value) })}
                            className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-purple-300"
                          />
                          <span className="text-xs text-slate-400 truncate">
                            m · {currentSelectedNt.nomeRamoB || "ramo B"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="5.0"
                          value={currentSelectedNt.offset}
                          onChange={(e) => store.setNtParam(currentSelectedNt.key, { offset: Number(e.target.value) })}
                          className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-purple-300"
                        />
                        <span className="text-xs text-slate-400">metros</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-200 block mb-1">
                      Trecho de Transição (Comprimento L)
                    </label>
                    <p className="text-[10px] text-slate-400 mb-2">
                      Comprimento quebrado no offset e girado no NF até encostar no bordo da pista (padrão DER: 25,00 m).
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="1"
                        min="5"
                        max="100"
                        value={currentSelectedNt.comprimento}
                        onChange={(e) => store.setNtParam(currentSelectedNt.key, { comprimento: Number(e.target.value) })}
                        className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-slate-200"
                      />
                      <span className="text-xs text-slate-400">metros</span>
                    </div>
                  </div>
                </div>

                {/* 3. Forma da Ponta, Tratamento e Casamento de Ilha */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
                  <div>
                    <label className="text-xs font-semibold text-slate-200 block mb-1">Forma da Ponta do NF</label>
                    <select
                      value={currentSelectedNt.estiloPonta}
                      onChange={(e) => store.setNtParam(currentSelectedNt.key, { estiloPonta: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="chanfro">Chanfro Reto (Padrão DER-SP)</option>
                      <option value="arredondado">Arredondado (Semi-círculo / Boleado)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-200 block mb-1">Tratamento da Cunha (Gore)</label>
                    <select
                      value={currentSelectedNt.tratamento}
                      onChange={(e) => store.setNtParam(currentSelectedNt.key, { tratamento: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="zebrado">Área Zebrada (Canalização Termoplástica)</option>
                      <option value="canteiro">Canteiro com Guia / Meio-Fio</option>
                      <option value="pavimento">Pavimento Asfáltico Integral</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-200 block mb-1">Modo de Afastamento</label>
                    <select
                      value={currentSelectedNt.params?.modoTransicao ?? "auto"}
                      onChange={(e) => store.setNtParam(currentSelectedNt.key, { modoTransicao: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-orange-300 font-medium"
                    >
                      <option value="auto">Automático (uniforme se encavalar, senão gira)</option>
                      <option value="uniforme">Uniforme 1,00m nos 25 m (sem giro)</option>
                      <option value="continuo">Contínuo 1,00m (casamento ilha fechada)</option>
                      <option value="taper">Afunilado (giro concordando no bordo)</option>
                    </select>
                  </div>
                </div>

                {/* Inverter Eixo Pista x Ramo se necessário */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    Bordo de Referência: <span className="font-mono text-slate-200">{currentSelectedNt.armA} × {currentSelectedNt.armB}</span>
                  </div>
                  <button
                    onClick={() => {
                      const cur = currentSelectedNt.params?.inverterLado ?? false;
                      store.setNtParam(currentSelectedNt.key, { inverterLado: !cur });
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded flex items-center gap-1.5"
                  >
                    <RotateCw size={12} />
                    Inverter Pista / Ramo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* ABA 4: GUIA COMPLETO E NORMAS (DER-SP & DNIT)           */}
          {/* ======================================================== */}
          {activeTab === "guia" && (
            <div className="space-y-4 max-w-3xl mx-auto text-slate-300 text-xs leading-relaxed">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BookOpen size={16} className="text-orange-400" />
                  Como funcionam os Narizes de Interseção?
                </h3>
                <p>
                  Em projetos de rodovias e vias urbanas, quando duas pistas se encontram ou se separam (acessos, alças, ramos de entroncamento e trevos), surge uma área triangular chamada de <b>cunha de canalização</b>.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="font-semibold text-purple-400 text-xs">Por que existe o Nariz Teórico (NT)?</div>
                    <p className="text-[11px] text-slate-400">
                      O <b>NT</b> é o cruzamento puro das linhas de bordo no papel. Ele serve como referência topográfica e matemática inicial para amarrar a geometria e calcular estacas.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="font-semibold text-orange-400 text-xs">Por que o Nariz Físico (NF) é recuado?</div>
                    <p className="text-[11px] text-slate-400">
                      Se a ilha ou meio-fio fosse construído até o ponto exato do NT, a ponta ficaria extremamente fina e quebradiça, e motoristas em velocidade colidiriam com facilidade. Por isso, a engenharia recua o NF até atingir uma largura confortável.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tabela de Normas DER-SP */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Tabela Prática de Larguras Normativas (DER-SP)
                </h4>
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-900 text-slate-400 text-left">
                      <tr>
                        <th className="p-2 font-semibold">Tipo de Acesso</th>
                        <th className="p-2 font-semibold">Largura Nominal</th>
                        <th className="p-2 font-semibold">Offset Padrão</th>
                        <th className="p-2 font-semibold">Trecho de Transição (L)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-2 font-medium text-emerald-400">Entrada (Aceleração)</td>
                        <td className="p-2 font-mono text-white">2,00 m</td>
                        <td className="p-2 font-mono text-slate-300">1,00 m</td>
                        <td className="p-2 font-mono text-slate-300">25,00 m</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium text-sky-400">Saída (Desaceleração)</td>
                        <td className="p-2 font-mono text-white">1,00 m</td>
                        <td className="p-2 font-mono text-slate-300">1,00 m</td>
                        <td className="p-2 font-mono text-slate-300">25,00 m</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium text-purple-400">Misto / Bifurcação</td>
                        <td className="p-2 font-mono text-white">1,50 m</td>
                        <td className="p-2 font-mono text-slate-300">1,00 m</td>
                        <td className="p-2 font-mono text-slate-300">25,00 m</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </DraggableWindow>
  );
}
