import React, { useRef, useState, useEffect } from "react";
import {
  Save, SaveAll, Download, Upload, Undo, Redo, LayoutDashboard, UploadCloud,
  Loader2, Link, MapIcon, BoxIcon, Crosshair, TrendingUp, FolderOpen, FilePlus,
  ChevronDown, Eye, Ruler, ArrowLeftRight, MoveDiagonal, Navigation, Circle,
  Wrench, Scissors, ArrowRightToLine, Copy, FlipHorizontal, CornerDownRight,
  Layers, MonitorUp, Boxes, Search, Maximize2, History, SquareDashed, MapPin,
  Minus, ClipboardPaste, ScissorsLineDashed, Mountain, Spline, Route, GitMerge,
  Printer, Trash2, Share2, Pencil,
} from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";
import { useStore as useZustandStore } from "zustand";
import {
  useStore, undoProjectAction, redoProjectAction, serializeProject,
  AMBIENTES, TABS_POR_AMBIENTE, type Ambiente,
} from "../store";
import { parseLandXML, parseTXT } from "../lib/dtm";
import { parseLandXMLAlignment } from "../lib/alignment";
import DxfParser from "dxf-parser";
import { del } from "idb-keyval";
import BasesPanel from "./BasesPanel";
import { ExtractedGeometrySection, DrawingPanel } from "./Sidebar";

/* ————— peças de layout da barra ————— */

function Coluna({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    /* shrink-0: a coluna vale a largura do seu conteúdo. Encolhível, os botões
     * mantinham a largura do texto e passavam a sobrepor-se uns aos outros
     * abaixo de ~1300 px; agora a barra rola na horizontal em vez de amassar. */
    <div className="flex items-stretch h-full shrink-0">
      <div className="w-px bg-slate-300/70 mx-3 my-2" />
      <div className="flex flex-col justify-center gap-1.5 py-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 px-0.5">
          {titulo}
        </span>
        <div className="grid grid-flow-col grid-rows-3 gap-x-2 gap-y-1">{children}</div>
      </div>
    </div>
  );
}

const CLASSE_BOTAO =
  "flex items-center gap-1.5 h-[26px] px-2.5 bg-slate-50 hover:bg-slate-100 rounded-md transition-colors text-[11px] font-medium text-slate-700 border border-slate-300/50 shadow-sm whitespace-nowrap w-full";

function Botao({
  rotulo, icone: Icone, onClick, ativo, desativado, titulo,
}: {
  rotulo: string;
  icone: React.ElementType;
  onClick?: () => void;
  ativo?: boolean;
  desativado?: boolean;
  titulo?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={desativado}
      title={titulo || rotulo}
      className={cn(
        CLASSE_BOTAO,
        ativo && "border-blue-500/60 text-blue-700 bg-blue-50",
        desativado && "opacity-40 cursor-not-allowed hover:bg-slate-50",
      )}
    >
      <Icone size={13} className="shrink-0" />
      {rotulo}
    </button>
  );
}

/** Painel suspenso de um botão da barra.
 *
 *  Vive em PORTAL, posicionado em `fixed` a partir do rect do botão: a barra é
 *  um container de rolagem horizontal, e um painel `absolute` lá dentro seria
 *  recortado por ele. */
function PainelSuspenso({
  ancoraRef, largura, onFechar, children,
}: {
  ancoraRef: React.RefObject<HTMLDivElement>;
  largura: number;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  const painelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const medir = () => {
      const r = ancoraRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({
        top: r.bottom + 4,
        left: Math.max(8, Math.min(r.left, window.innerWidth - largura - 8)),
      });
    };
    medir();
    window.addEventListener("resize", medir);
    // Capturado: a rolagem que importa é a da própria barra, não a da janela.
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [largura]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (painelRef.current?.contains(alvo) || ancoraRef.current?.contains(alvo)) return;
      onFechar();
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [onFechar]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={painelRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: largura }}
      className="bg-white border border-slate-300 rounded-md shadow-xl py-1 z-[400] max-h-[75vh] overflow-y-auto custom-scrollbar"
    >
      {children}
    </div>,
    document.body,
  );
}

/** Botão de modo de desenho com um símbolo de edição acoplado à direita:
 *  o corpo liga/desliga o modo, o símbolo abre as listas e editores do tipo. */
function BotaoDesenho({
  rotulo, icone: Icone, foco, ativo, desativado, onClick, titulo,
}: {
  rotulo: string;
  icone: React.ElementType;
  foco: "ponto" | "linha" | "circulo";
  ativo?: boolean;
  desativado?: boolean;
  onClick: () => void;
  titulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={ref}>
      <div
        className={cn(
          CLASSE_BOTAO,
          "p-0 pl-2.5 pr-0 gap-0",
          ativo && "border-blue-500/60 text-blue-700 bg-blue-50",
          desativado && "opacity-40 cursor-not-allowed",
        )}
      >
        <button
          onClick={onClick}
          disabled={desativado}
          title={titulo || rotulo}
          className="flex items-center gap-1.5 flex-1 h-full text-left disabled:cursor-not-allowed"
        >
          <Icone size={13} className="shrink-0" />
          {rotulo}
        </button>
        <button
          onClick={() => setAberto(!aberto)}
          disabled={desativado}
          title={`Editar ${rotulo}`}
          className={cn(
            "h-full px-1.5 border-l border-slate-300/60 text-slate-500 hover:text-blue-700 hover:bg-slate-100 rounded-r-md transition-colors disabled:cursor-not-allowed",
            aberto && "text-blue-700 bg-blue-50",
          )}
        >
          <Pencil size={11} />
        </button>
      </div>
      {aberto && (
        <PainelSuspenso ancoraRef={ref} largura={380} onFechar={() => setAberto(false)}>
          <PainelElementos foco={foco} />
        </PainelSuspenso>
      )}
    </div>
  );
}

/** Botão que abre um painel flutuante ancorado nele. */
function BotaoMenu({
  rotulo, icone: Icone, desativado, largura = 224, children,
}: {
  rotulo: string;
  icone: React.ElementType;
  desativado?: boolean;
  largura?: number;
  children: (fechar: () => void) => React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto(!aberto)}
        disabled={desativado}
        title={rotulo}
        className={cn(
          CLASSE_BOTAO,
          aberto && "border-blue-500/60 text-blue-700 bg-blue-50",
          desativado && "opacity-40 cursor-not-allowed hover:bg-slate-50",
        )}
      >
        <Icone size={13} className="shrink-0" />
        {rotulo}
        <ChevronDown size={11} className={cn("ml-auto transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <PainelSuspenso ancoraRef={ref} largura={largura} onFechar={() => setAberto(false)}>
          {children(() => setAberto(false))}
        </PainelSuspenso>
      )}
    </div>
  );
}

function ItemMenu({
  rotulo, icone: Icone, onClick, ativo, cor, desativado,
}: {
  rotulo: string;
  icone: React.ElementType;
  onClick: () => void;
  ativo?: boolean;
  cor?: string;
  desativado?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={desativado}
      className={cn(
        "flex items-center w-full gap-2 px-3 py-2 hover:bg-slate-100 transition-colors text-xs font-medium text-left disabled:opacity-40 disabled:hover:bg-transparent",
        cor || (ativo ? "text-blue-700" : "text-slate-700"),
      )}
    >
      <Icone size={14} className="shrink-0" />
      {rotulo}
    </button>
  );
}

/** Vaga reservada na grade — função ainda não definida. */
const Reservado = () => (
  <div className={cn(CLASSE_BOTAO, "justify-center text-slate-400 border-dashed bg-transparent cursor-default")}>
    A DEFINIR
  </div>
);

const Separador = () => <div className="h-px bg-slate-200 my-1 w-full" />;

/* Contextos (activeTab) oferecidos por cada ambiente, na ordem em que aparecem.
 * As cores são as mesmas que as abas do painel esquerdo usavam. */
const CONTEXTOS: Record<Ambiente, { id: any; rotulo: string; icone: any; corTexto: string; corBorda: string }[]> = {
  projeto: [
    { id: "surface", rotulo: "MDT", icone: Mountain, corTexto: "text-amber-600", corBorda: "border-amber-600" },
    { id: "horizontal", rotulo: "Alinh. Hor", icone: Spline, corTexto: "text-blue-600", corBorda: "border-blue-600" },
    { id: "regions", rotulo: "Corredores", icone: Route, corTexto: "text-purple-600", corBorda: "border-purple-600" },
    { id: "intersections", rotulo: "Ints", icone: GitMerge, corTexto: "text-cyan-700", corBorda: "border-cyan-500" },
  ],
  perfis: [{ id: "vertical", rotulo: "Alinh. Ver", icone: TrendingUp, corTexto: "text-rose-600", corBorda: "border-rose-600" }],
  secoes: [{ id: "assemblies", rotulo: "Seções", icone: Layers, corTexto: "text-emerald-600", corBorda: "border-emerald-600" }],
  producao: [{ id: "production", rotulo: "Produção", icone: Printer, corTexto: "text-orange-500", corBorda: "border-orange-500" }],
};

/** Contextos do ambiente atual. Só aparece quando o ambiente tem mais de um. */
function FitaContextos() {
  const ambiente = useStore((s) => s.ambiente);
  const activeTab = useStore((s) => s.activeTab);
  const contextos = CONTEXTOS[ambiente];
  if (contextos.length < 2) return null;

  return (
    <div>
      <Coluna titulo="Geometria Horizontal">
        {contextos.map((ctx) => (
          <Botao
            key={ctx.id}
            rotulo={ctx.rotulo.toUpperCase()}
            icone={ctx.icone}
            ativo={activeTab === ctx.id}
            onClick={() => {
              const s = useStore.getState();
              s.setActiveTab(ctx.id);
              /* Mesma combinação de modos que a aba do painel já aplicava. */
              s.setPlanMode(true);
              s.setProfileMode(false);
              s.setProductionMode(false);
            }}
          />
        ))}
        {ambiente === "projeto" && <Reservado />}
        {ambiente === "projeto" && <Reservado />}
      </Coluna>
    </div>
  );
}

/** Extração de geometria dos corredores, servida em painel suspenso.
 *  Componente próprio para que a assinatura do store fique fora da barra. */
function PainelExtrair() {
  const store = useStore();
  return (
    <div className="px-3 py-1">
      <ExtractedGeometrySection store={store as any} />
    </div>
  );
}

/** No ambiente Perfis longitudinais, escolher o alinhamento é a decisão de
 *  primeiro nível — sem ele o visualizador não tem o que mostrar. */
function SeletorAlinhamento() {
  const alignments = useStore((s) => s.alignments);
  const activeAlignmentId = useStore((s) => s.activeAlignmentId);
  const setActiveAlignmentId = useStore((s) => s.setActiveAlignmentId);

  return (
    <div className="flex items-stretch h-full">
      <div className="w-px bg-slate-300/70 mx-3 my-2" />
      <div className="flex flex-col justify-center gap-1.5 py-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 px-0.5">
          Alinhamento
        </span>
        <select
          value={activeAlignmentId || ""}
          onChange={(e) => setActiveAlignmentId(e.target.value || null)}
          className={cn(CLASSE_BOTAO, "w-[240px] cursor-pointer")}
        >
          <option value="">
            {alignments.length ? "Selecione um alinhamento…" : "Nenhum alinhamento no projeto"}
          </option>
          {alignments.map((a: any) => (
            <option key={a.id} value={a.id}>
              {a.name || a.id}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-slate-400 px-0.5 h-[26px] flex items-center">
          {activeAlignmentId
            ? `${alignments.length} alinhamento${alignments.length === 1 ? "" : "s"} no projeto`
            : "O perfil aparece após a escolha"}
        </span>
      </div>
    </div>
  );
}

/** Listas e editores dos elementos 3D, servidos em painel suspenso. */
function PainelElementos({ foco }: { foco?: "ponto" | "linha" | "circulo" }) {
  const store = useStore();
  return (
    <div className="px-3 py-1">
      <DrawingPanel store={store as any} foco={foco} />
    </div>
  );
}

/* ————— barra ————— */

export function BarraSuperior() {
  const ambiente = useStore((s) => s.ambiente);
  const setAmbiente = useStore((s) => s.setAmbiente);
  const nomeProjeto = useStore((s) => s.nomeProjeto);
  const setNomeProjeto = useStore((s) => s.setNomeProjeto);

  const points = useStore((s) => s.activeLinks);
  const links = useStore((s) => s.activeLinks);
  const setCadastre = useStore((s) => s.setCadastre);
  const resetProject = useStore((s) => s.resetProject);
  const importAlignment = useStore((s) => s.importAlignment);
  const loadProject = useStore((s) => s.loadProject);

  const planMode = useStore((s) => s.planMode);
  const setPlanMode = useStore((s) => s.setPlanMode);
  const plan3DMode = useStore((s) => s.plan3DMode);
  const setPlan3DMode = useStore((s) => s.setPlan3DMode);
  const sectionMode = useStore((s) => s.sectionMode);
  const setSectionMode = useStore((s) => s.setSectionMode);
  const profileMode = useStore((s) => s.profileMode);
  const setProfileMode = useStore((s) => s.setProfileMode);
  const dynamicCursor = useStore((s) => s.dynamicCursor);
  const setDynamicCursor = useStore((s) => s.setDynamicCursor);
  const mdtEditMode = useStore((s) => s.mdtEditMode);
  const setMdtEditMode = useStore((s) => s.setMdtEditMode);
  const selecaoDesenho = useStore((s) => s.selecaoDesenho);
  const areaTransferencia = useStore((s) => s.areaTransferencia);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const alignInputRef = useRef<HTMLInputElement>(null);
  const cadInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingAlign, setIsUploadingAlign] = useState(false);
  const [isUploadingCad, setIsUploadingCad] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [nomeSalvarComo, setNomeSalvarComo] = useState<string | null>(null);

  const pastStates = useZustandStore(useStore.temporal, (s: any) => s.pastStates);
  const futureStates = useZustandStore(useStore.temporal, (s: any) => s.futureStates);

  /* Ambientes onde a planta 2D está na tela — quem não a tem esmaece
   * os botões de desenho e de zoom em vez de escondê-los. */
  const temPlanta = ambiente === "projeto";

  const handleMdtUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const text = await file.text();
      const nome = file.name.toLowerCase();
      const surface =
        nome.endsWith(".txt") || nome.endsWith(".csv")
          ? await parseTXT(text)
          : await parseLandXML(text);
      useStore.getState().addSurface(surface, file.name);
    } catch (err) {
      console.error(err);
      alert(
        "Erro ao ler pacote MDT. Em LandXML, garanta que existam <Pnts> e <Faces>. Em TXT, forneça pontos: X Y Z separados por espaço ou vírgula.",
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAlignUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAlign(true);
    try {
      importAlignment(await parseLandXMLAlignment(await file.text()));
    } catch (err) {
      alert("Erro ao ler LandXML de Alinhamento. Garanta que há blocos em <Alignments> válidos.");
    } finally {
      setIsUploadingAlign(false);
      if (alignInputRef.current) alignInputRef.current.value = "";
    }
  };

  const handleCadUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingCad(true);
    try {
      let text = await file.text();
      // Alguns DXF chegam sem EOF e o parser recusa o arquivo inteiro por isso.
      if (!text.trim().endsWith("EOF")) text += "\n  0\nEOF\n";

      const dxf = new DxfParser().parseSync(text);
      const layersMap: Record<string, any> = {};

      if (dxf.tables && dxf.tables.layer && dxf.tables.layer.layers) {
        Object.keys(dxf.tables.layer.layers).forEach((l) => {
          layersMap[l] = { name: l, color: dxf.tables.layer.layers[l].color || 7, entities: [] };
        });
      }
      if (dxf.entities) {
        dxf.entities.forEach((entity: any) => {
          const layerName = entity.layer || "0";
          if (!layersMap[layerName]) layersMap[layerName] = { name: layerName, color: 7, entities: [] };
          layersMap[layerName].entities.push(entity);
        });
      }
      setCadastre(Object.values(layersMap));
    } catch (err) {
      console.error(err);
      alert(`Erro ao ler arquivo DXF: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsUploadingCad(false);
      if (cadInputRef.current) cadInputRef.current.value = "";
    }
  };

  const baixarProjeto = (nome: string) => {
    const data = JSON.stringify(serializeProject(useStore.getState()), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nome.replace(/\.json$/i, "") || "projeto"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPkt = () => {
    const data = JSON.stringify(
      { version: "1.0", type: "SubassemblyComposer", points, links },
      null,
      2,
    );
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "CustomLane.pkt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.type === "Civil3DWebProject") {
        resetProject();
        loadProject(parsed);
        setNomeProjeto(file.name.replace(/\.json$/i, ""));
        useStore.temporal.getState().clear();
      } else {
        alert("Arquivo de projeto inválido.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao ler o arquivo do projeto.");
    } finally {
      if (projectInputRef.current) projectInputRef.current.value = "";
    }
  };

  const modoCompleto = !planMode && !plan3DMode && !sectionMode && !profileMode;

  const alternarModoDesenho = (modo: "create_point_3d" | "create_line_3d" | "create_circle_3d") => {
    const s = useStore.getState();
    /* Os elementos de desenho só são renderizados no contexto Drawing — sem trocar
     * o contexto o usuário criaria pontos invisíveis. */
    if (s.activeTab !== "drawing") s.setActiveTab("drawing");
    setMdtEditMode(mdtEditMode === modo ? "none" : modo);
  };

  /* shrink-0 na barra: sem isso a coluna encolhe a barra e a linha que sobra é
   * pintada sobre o painel e o visualizador em vez de os empurrar para baixo.
   * Sem flex-wrap: quebrar linha comia um quinto da altura útil num portátil de
   * 1280. Em tela estreita as colunas rolam na horizontal — os painéis abrem em
   * portal, por isso a rolagem não os recorta. */
  return (
    <header className="relative z-[250] shrink-0 bg-white border-b border-slate-200 flex items-stretch overflow-x-auto overflow-y-visible pr-4 text-slate-700 select-none shadow-sm">
      <input type="file" accept=".xml,.txt,.csv" ref={fileInputRef} className="hidden" onChange={handleMdtUpload} />
      <input type="file" accept=".xml" ref={alignInputRef} className="hidden" onChange={handleAlignUpload} />
      <input type="file" accept=".dxf" ref={cadInputRef} className="hidden" onChange={handleCadUpload} />
      <input type="file" accept=".json" ref={projectInputRef} className="hidden" onChange={handleLoadProject} />

      {/* ——— coluna AMBIENTE ——— */}
      <div className="flex items-center gap-3 pl-4 pr-1 py-2 shrink-0">
        <div className="flex flex-col gap-1.5">
          <img src="/logo.png" alt="Simetria" className="h-11 w-[190px] object-contain object-left" />
          <select
            value={ambiente}
            onChange={(e) => setAmbiente(e.target.value as Ambiente)}
            title="Ambiente de trabalho"
            className="w-[190px] h-[26px] bg-blue-600 text-white text-[11px] font-semibold rounded-md px-2 border border-blue-700 outline-none cursor-pointer hover:bg-blue-500 transition-colors"
          >
            {AMBIENTES.map((a) => (
              <option key={a.id} value={a.id} className="bg-white text-slate-800 font-medium">
                {a.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={undoProjectAction}
            disabled={pastStates.length === 0}
            className={cn(
              "p-1.5 rounded-md border border-slate-300/50 transition-colors",
              pastStates.length === 0
                ? "text-slate-300 cursor-not-allowed"
                : "hover:bg-slate-100 text-slate-600 hover:text-slate-900 active:scale-95",
            )}
            title="Desfazer última alteração de projeto (Ctrl+Z)"
          >
            <Undo size={15} />
          </button>
          <button
            onClick={redoProjectAction}
            disabled={futureStates.length === 0}
            className={cn(
              "p-1.5 rounded-md border border-slate-300/50 transition-colors",
              futureStates.length === 0
                ? "text-slate-300 cursor-not-allowed"
                : "hover:bg-slate-100 text-slate-600 hover:text-slate-900 active:scale-95",
            )}
            title="Refazer alteração de projeto (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <Redo size={15} />
          </button>
        </div>
      </div>

      {/* ——— PRINCIPAL ——— */}
      <Coluna titulo="Principal">
        <Botao rotulo="NOVO" icone={FilePlus} onClick={() => setShowResetConfirm(true)} titulo="Novo Projeto" />
        <Botao rotulo="SALVAR" icone={Save} onClick={() => baixarProjeto(nomeProjeto)} titulo={`Salvar como ${nomeProjeto}.json`} />
        <BotaoMenu rotulo="LAYERS" icone={Layers} largura={208}>
          {(fechar) => (
            <>
              <ItemMenu
                rotulo="Gerenciador de Layers"
                icone={Layers}
                onClick={() => { useStore.getState().setIsLayerManagerOpen(true); fechar(); }}
              />
              <ItemMenu
                rotulo={useStore.getState().showCadastre ? "Ocultar DXF" : "Exibir DXF"}
                icone={MapIcon}
                onClick={() => { useStore.getState().setShowCadastre(!useStore.getState().showCadastre); fechar(); }}
              />
            </>
          )}
        </BotaoMenu>
        <Botao rotulo="ABRIR" icone={FolderOpen} onClick={() => projectInputRef.current?.click()} titulo="Abrir projeto (.json)" />
        <Botao rotulo="SALVAR COMO" icone={SaveAll} onClick={() => setNomeSalvarComo(nomeProjeto)} titulo="Salvar com outro nome" />
        <BotaoMenu rotulo="BASES" icone={Boxes} largura={360}>
          {() => (
            <div className="px-3 py-1">
              <BasesPanel />
            </div>
          )}
        </BotaoMenu>
      </Coluna>

      {/* ——— ORGANIZAÇÃO ——— */}
      <Coluna titulo="Organização">
        <BotaoMenu rotulo="VIEW" icone={Eye} largura={256}>
          {(fechar) => (
            <>
              <ItemMenu
                rotulo={`Cursor Dinâmico ${dynamicCursor ? "ON" : "OFF"}`}
                icone={Crosshair}
                ativo={dynamicCursor}
                onClick={() => { setDynamicCursor(!dynamicCursor); fechar(); }}
              />
              <Separador />
              <ItemMenu
                rotulo={modoCompleto ? "Modo Completo ATIVADO" : "Modo Completo"}
                icone={LayoutDashboard}
                cor={modoCompleto ? "text-emerald-600" : undefined}
                onClick={() => {
                  setPlanMode(false); setPlan3DMode(false);
                  setSectionMode(false); setProfileMode(false);
                  fechar();
                }}
              />
              <ItemMenu
                rotulo={planMode ? "Modo Planta ATIVADO" : "Modo Planta"}
                icone={BoxIcon}
                cor={planMode ? "text-amber-600" : undefined}
                onClick={() => {
                  setPlanMode(!planMode);
                  if (!planMode) { setProfileMode(false); setPlan3DMode(false); setSectionMode(false); }
                  fechar();
                }}
              />
              <ItemMenu
                rotulo={plan3DMode ? "Modo PLAN VIEW 3D ATIVADO" : "Modo PLAN VIEW 3D"}
                icone={BoxIcon}
                cor={plan3DMode ? "text-amber-600" : undefined}
                onClick={() => {
                  setPlan3DMode(!plan3DMode);
                  if (!plan3DMode) { setPlanMode(false); setProfileMode(false); setSectionMode(false); }
                  fechar();
                }}
              />
              <ItemMenu
                rotulo={sectionMode ? "Modo SECTION VIEW ATIVADO" : "Modo SECTION VIEW"}
                icone={Layers}
                cor={sectionMode ? "text-blue-600" : undefined}
                onClick={() => {
                  setSectionMode(!sectionMode);
                  if (!sectionMode) { setPlanMode(false); setPlan3DMode(false); setProfileMode(false); }
                  fechar();
                }}
              />
              <ItemMenu
                rotulo={profileMode ? "Modo Perfil ATIVADO" : "Modo Perfil"}
                icone={TrendingUp}
                cor={profileMode ? "text-rose-600" : undefined}
                onClick={() => {
                  setProfileMode(!profileMode);
                  if (!profileMode) { setPlanMode(false); setPlan3DMode(false); setSectionMode(false); }
                  fechar();
                }}
              />
              <Separador />
              <ItemMenu
                rotulo="Visualizador Flutuante"
                icone={MonitorUp}
                onClick={() => { useStore.getState().setIsFloatingViewerOpen(true); fechar(); }}
              />
            </>
          )}
        </BotaoMenu>
        <BotaoMenu rotulo="ZOOM" icone={Search} desativado={!temPlanta} largura={224}>
          {(fechar) => (
            <>
              <ItemMenu
                rotulo="Zoom Extensão"
                icone={Maximize2}
                onClick={() => {
                  useStore.getState().empilharZoom();
                  useStore.getState().pedirEnquadramentoPlanta();
                  fechar();
                }}
              />
              <ItemMenu
                rotulo="Zoom Janela"
                icone={SquareDashed}
                onClick={() => { useStore.getState().setZoomJanelaAtivo(true); fechar(); }}
              />
              <ItemMenu
                rotulo="Zoom Anterior"
                icone={History}
                desativado={useStore.getState().historicoZoom.length === 0}
                onClick={() => { useStore.getState().zoomAnterior(); fechar(); }}
              />
              <Separador />
              <ItemMenu
                rotulo="Escala 1:1 (1 px = 1 m)"
                icone={Ruler}
                onClick={() => {
                  const s = useStore.getState();
                  s.empilharZoom();
                  const t = s.planView2DTransform;
                  const d = s.planViewDimensions || { width: 0, height: 0 };
                  // Mantém no centro da tela o mesmo ponto do terreno que já estava lá.
                  const cx = d.width / 2;
                  const cy = d.height / 2;
                  const mundoX = (cx - t.dx) / t.scale;
                  const mundoY = (cy - t.dy) / t.scale;
                  s.setPlanView2DTransform({ scale: 1, dx: cx - mundoX, dy: cy - mundoY });
                  fechar();
                }}
              />
            </>
          )}
        </BotaoMenu>
        <BotaoMenu rotulo="DIMENSIONS" icone={Ruler} desativado={!temPlanta} largura={192}>
          {(fechar) => (
            <>
              <ItemMenu rotulo="LINEAR" icone={ArrowLeftRight} onClick={() => { useStore.getState().setInteractionMode("create_dimension_linear"); fechar(); }} />
              <ItemMenu rotulo="ALIGNED" icone={MoveDiagonal} onClick={() => { useStore.getState().setInteractionMode("create_dimension_aligned"); fechar(); }} />
              <ItemMenu rotulo="ANGULAR" icone={Navigation} onClick={() => { useStore.getState().setInteractionMode("create_dimension_angular"); fechar(); }} />
              <ItemMenu rotulo="RADIUS" icone={Circle} onClick={() => { useStore.getState().setInteractionMode("create_dimension_radius"); fechar(); }} />
            </>
          )}
        </BotaoMenu>
      </Coluna>

      {/* ——— DESENHO ——— */}
      <Coluna titulo="Desenho">
        <BotaoDesenho
          rotulo="POINTS 3D"
          icone={MapPin}
          foco="ponto"
          desativado={!temPlanta}
          ativo={mdtEditMode === "create_point_3d"}
          onClick={() => alternarModoDesenho("create_point_3d")}
          titulo="Criar Ponto 3D — clique no visualizador"
        />
        <BotaoDesenho
          rotulo="LINES 3D"
          icone={Minus}
          foco="linha"
          desativado={!temPlanta}
          ativo={mdtEditMode === "create_line_3d"}
          onClick={() => alternarModoDesenho("create_line_3d")}
          titulo="Criar Linha 3D — clique dois pontos no visualizador"
        />
        <BotaoDesenho
          rotulo="CIRCLES 3D"
          icone={Circle}
          foco="circulo"
          desativado={!temPlanta}
          ativo={mdtEditMode === "create_circle_3d"}
          onClick={() => alternarModoDesenho("create_circle_3d")}
          titulo="Criar Círculo 3D — centro e raio no visualizador"
        />
        <Botao
          rotulo="COPIAR"
          icone={Copy}
          desativado={selecaoDesenho.length === 0}
          onClick={() => useStore.getState().copiarSelecaoDesenho()}
          titulo="Copiar elementos de desenho selecionados"
        />
        <Botao
          rotulo="CORTAR"
          icone={ScissorsLineDashed}
          desativado={selecaoDesenho.length === 0}
          onClick={() => useStore.getState().cortarSelecaoDesenho()}
          titulo="Cortar elementos de desenho selecionados"
        />
        <Botao
          rotulo="COLAR"
          icone={ClipboardPaste}
          desativado={!areaTransferencia}
          onClick={() => useStore.getState().colarAreaTransferencia()}
          titulo="Colar deslocado 5 m"
        />
        <Botao
          rotulo="EXCLUIR"
          icone={Trash2}
          desativado={selecaoDesenho.length === 0}
          onClick={() => useStore.getState().excluirSelecaoDesenho()}
          titulo="Excluir elementos de desenho selecionados"
        />
        <BotaoMenu rotulo="MODIFY" icone={Wrench} desativado={!temPlanta} largura={192}>
          {(fechar) => (
            <>
              <ItemMenu rotulo="TRIM" icone={Scissors} onClick={() => { useStore.getState().setInteractionMode("modify_trim"); fechar(); }} />
              <ItemMenu rotulo="EXTEND" icone={ArrowRightToLine} onClick={() => { useStore.getState().setInteractionMode("modify_extend"); fechar(); }} />
              <ItemMenu rotulo="COPY" icone={Copy} onClick={() => { useStore.getState().setInteractionMode("modify_copy"); fechar(); }} />
              <ItemMenu rotulo="MIRROR" icone={FlipHorizontal} onClick={() => { useStore.getState().setInteractionMode("modify_mirror"); fechar(); }} />
              <ItemMenu rotulo="FILLET" icone={CornerDownRight} onClick={() => { useStore.getState().setInteractionMode("modify_fillet"); fechar(); }} />
            </>
          )}
        </BotaoMenu>
        <Reservado />
      </Coluna>

      {/* ——— INFORMAÇÃO ——— */}
      <Coluna titulo="Informação">
        <BotaoMenu rotulo="IMPORTAR" icone={Download} largura={240}>
          {(fechar) => (
            <>
              <ItemMenu
                rotulo="Importar MDT"
                icone={isUploading ? Loader2 : UploadCloud}
                desativado={isUploading}
                onClick={() => { fileInputRef.current?.click(); fechar(); }}
              />
              <ItemMenu
                rotulo="Importar Alinhamento"
                icone={isUploadingAlign ? Loader2 : Link}
                desativado={isUploadingAlign}
                onClick={() => { alignInputRef.current?.click(); fechar(); }}
              />
              <ItemMenu
                rotulo="Importar Cadastro (DXF)"
                icone={isUploadingCad ? Loader2 : MapIcon}
                desativado={isUploadingCad}
                onClick={() => { cadInputRef.current?.click(); fechar(); }}
              />
            </>
          )}
        </BotaoMenu>
        <BotaoMenu rotulo="EXPORTAR" icone={Upload} largura={240}>
          {(fechar) => (
            <>
              <ItemMenu
                rotulo="Projeto (.json)"
                icone={Save}
                onClick={() => { baixarProjeto(nomeProjeto); fechar(); }}
              />
              <ItemMenu
                rotulo="Seção Tipo (.pkt)"
                icone={Download}
                onClick={() => { handleExportPkt(); fechar(); }}
              />
            </>
          )}
        </BotaoMenu>
        <BotaoMenu rotulo="EXTRAIR" icone={Share2} desativado={!temPlanta} largura={380}>
          {() => <PainelExtrair />}
        </BotaoMenu>
      </Coluna>

      <FitaContextos />
      {ambiente === "perfis" && <SeletorAlinhamento />}

      {showResetConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-300 p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-medium text-slate-900 mb-2">Novo Projeto</h3>
            <p className="text-slate-700 text-sm mb-6">
              Isso apagará o projeto atual. Tem certeza que deseja começar um novo projeto?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  resetProject();
                  useStore.temporal.getState().clear();
                  await del("civil3dweb-last-project");
                  setShowResetConfirm(false);
                  window.location.reload(); // Recarrega para garantir memória limpa
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 rounded transition-colors shadow-sm"
              >
                Sim, apagar e criar novo
              </button>
            </div>
          </div>
        </div>
      )}

      {nomeSalvarComo !== null && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-300 p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-medium text-slate-900 mb-2">Salvar como</h3>
            <p className="text-slate-600 text-xs mb-3">
              O nome escolhido passa a ser o nome do projeto para os próximos SALVAR.
            </p>
            <input
              autoFocus
              value={nomeSalvarComo}
              onChange={(e) => setNomeSalvarComo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nomeSalvarComo.trim()) {
                  setNomeProjeto(nomeSalvarComo.trim());
                  baixarProjeto(nomeSalvarComo.trim());
                  setNomeSalvarComo(null);
                }
                if (e.key === "Escape") setNomeSalvarComo(null);
              }}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 px-3 py-2 rounded text-sm focus:outline-none focus:border-blue-600 mb-1"
              placeholder="nome-do-projeto"
            />
            <p className="text-[11px] text-slate-500 mb-5">
              Será baixado como <span className="font-mono">{(nomeSalvarComo || "projeto").replace(/\.json$/i, "")}.json</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setNomeSalvarComo(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={!nomeSalvarComo.trim()}
                onClick={() => {
                  const n = nomeSalvarComo.trim();
                  setNomeProjeto(n);
                  baixarProjeto(n);
                  setNomeSalvarComo(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors shadow-sm disabled:opacity-40"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
