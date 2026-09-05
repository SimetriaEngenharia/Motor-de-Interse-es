import React, { useState, useRef } from "react";
import jsPDF from "jspdf";
import { toPng } from "html-to-image";
import { drawElementVector } from "../lib/pdfVector";
import { useStore, evaluateAssemblyAtStation, LARGURA_NARIZ_FISICO, OFFSET_BORDO_NARIZ, COMPR_NARIZ_FISICO, fatorConversaoDNIT, defaultGridStyle } from "../store";
import { narizFisicoCached,
  rotuloNF, narizKey } from "../lib/intersection";
import { Rnd } from "react-rnd";
import { AciColorPicker } from "./AciColorPicker";
import { getClosestAci } from "../lib/aciColors";
import { 
  Building2, 
  Compass, 
  ShieldCheck, 
  FileText, 
  Check, 
  X, 
  Sliders, 
  Settings, 
  Eye, 
  EyeOff, 
  Sparkles,
  Upload,
  Image as ImageIcon,
  Trash2,
  Type,
  Palette,
  RotateCcw,
  Settings2,
  Maximize2,
  Plus,
  Copy,
  FileCode,
  Edit3,
  RefreshCw,
  Table as TableIcon,
  AlignLeft,
  Layers,
  Boxes,
  Grid3x3,
  Scissors,
  Hand
} from "lucide-react";
import { 
  CurveRow, 
  HorizontalElementRow,
  computeCurvesFromPoints, 
  computeHorizontalElements,
  filterHorizontalElementsForStationRange,
  generateMarkdownTableDNIT, 
  generateMarkdownHorizontalElementsTable,
  generateHorizontalElementsTableLines,
  parseMarkdownTableLines,
  serializeToMarkdownTable,
  formatEstaca, 
  formatDMS, 
  formatDecimal3, 
  formatCoord 
} from "../lib/dnitCurvesTable";

export const formatStation = (sta: number) => {
   const e = Math.floor(sta / 20);
   const m = sta % 20;
   let mStr = m.toFixed(3).replace('.', ',');
   if (mStr.length === 5) mStr = '0' + mStr;
   return `${e}+${mStr}`;
};

export const TABLE_FONT_OPTIONS = [
  { label: "Arial (Padrão)", value: "Arial, Helvetica, sans-serif" },
  { label: "Monospace / ISOCPEUR (CAD)", value: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
  { label: "Consolas", value: "Consolas, 'Courier New', monospace" },
  { label: "Segoe UI", value: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
  { label: "Times New Roman (Técnico)", value: "'Times New Roman', Times, serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', sans-serif" },
  { label: "Tahoma", value: "Tahoma, Verdana, Segoe, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" }
];

export const TABLE_COLOR_PRESETS = [
  { name: "Preto Técnico", value: "#0f172a" },
  { name: "Preto Absoluto", value: "#000000" },
  { name: "Azul CAD", value: "#1e3a8a" },
  { name: "Azul Real", value: "#2563eb" },
  { name: "Grafite", value: "#334155" },
  { name: "Verde Técnico", value: "#047857" },
  { name: "Vermelho Técnico", value: "#b91c1c" },
  { name: "Âmbar", value: "#b45309" }
];

/** Tabela de Alinhamento Horizontal — colunas na ordem do padrão DER-SP. */
export const DEFAULT_CURVES_COL_WIDTHS_CM = [
  1.2, // Nº
  3.2, // DEFLEXÃO/AZIMUTE
  1.8, // LC (m)
  1.8, // TT (m)
  1.8, // TL (m)
  1.8, // TC (m)
  2.0, // R (m)
  2.0, // D/L (m)
  2.6, // AC
  2.2, // TE-PC
  2.2, // ET-PT
  1.3, // PONTO
  3.2, // PI (Y/X)
  3.2, // TE-PC (Y/X)
  3.2  // ET-PT (Y/X)
];

/** Faixa de aceleração / desaceleração — DNIT/DER. */
export const DEFAULT_FAIXA_COL_WIDTHS_CM = [2.2, 2.2, 2.0, 2.0, 2.8, 2.2];
/** Narizes físicos. */
export const DEFAULT_NF_COL_WIDTHS_CM = [1.6, 3.4, 3.4];


const interpolateElevation = (pts: any[], sta: number) => {
    if (!pts || pts.length === 0) return null;
    if (pts.length === 1) return pts[0].elev;
    if (sta <= pts[0].sta) return pts[0].elev;
    if (sta >= pts[pts.length - 1].sta) return pts[pts.length - 1].elev;
    
    let l = 0;
    let r = pts.length - 1;
    while (l <= r) {
        let m = Math.floor((l + r) / 2);
        if (pts[m].sta === sta) return pts[m].elev;
        if (pts[m].sta < sta) l = m + 1;
        else r = m - 1;
    }
    
    const p1 = pts[r];
    const p2 = pts[l];
    if (!p1 || !p2) return null;
    const t = (sta - p1.sta) / (p2.sta - p1.sta);
    return p1.elev + t * (p2.elev - p1.elev);
};

export function ProductionStudio() {
  const store = useStore();
  const alignments = useStore((state) => state.alignments);

  // States for right panel (Editor de produção)
  const baseAlignment = store.productionBaseAlignment;
  const setBaseAlignment = store.setProductionBaseAlignment;
  const baseProfile = store.productionBaseProfile;
  const setBaseProfile = store.setProductionBaseProfile;
  const titleBlock = store.productionTitleBlock;
  const setTitleBlock = store.setProductionTitleBlock;
  const selectedViewport = store.productionSelectedViewport;
  const setSelectedViewport = store.setProductionSelectedViewport;
  
  const viewportCategories = store.productionViewportCategories;
  const setViewportCategory = store.setProductionViewportCategory;
  
  const viewportScales = store.productionViewportScales;
  const setViewportScale = store.setProductionViewportScale;
  
  const viewportNorths = store.productionViewportNorths;
  const setViewportNorth = store.setProductionViewportNorth;
  
  const viewportGrids = store.productionViewportGrids;
  const setViewportGrid = store.setProductionViewportGrid;
  
  const viewportBaseAlignments = store.productionViewportBaseAlignments;
  const viewportBases = store.productionViewportBases || [[], [], [], []];
  const setViewportBases = store.setProductionViewportBases;
  const [basesModalVp, setBasesModalVp] = useState<number | null>(null);
  const [mostrarLimitesArticulacao, setMostrarLimitesArticulacao] = useState(false);
  /* EDIÇÃO DAS LINHAS DE ARTICULAÇÃO — por linha (índice 0 = início do traçado,
   * n = fim): estaca/km, ângulo com o eixo (90° = perpendicular), rótulo e
   * visibilidade. artEstilo é global à prancha. */
  const [artModalOpen, setArtModalOpen] = useState(false);
  const [paletaAberta, setPaletaAberta] = useState(false);  const [artEdits, setArtEdits] = useState<Record<number, { sta?: number; ang?: number; texto?: string; oculta?: boolean }>>({});
  const [artEstilo, setArtEstilo] = useState({ cor: "#0f172a", espessura: 0.8, tracejada: true, mostrarRotulos: true });
  const setArt = (i: number, patch: any) =>
    setArtEdits((prev) => ({ ...prev, [i]: { ...(prev[i] || {}), ...patch } }));
  const fmtKm = (s: number) => `${Math.floor(s / 1000)}+${(s % 1000).toFixed(2).padStart(6, "0")}`;
  const fmtEstaca = (s: number) => `${Math.floor(s / 20)}+${(s % 20).toFixed(2).padStart(5, "0")}`;

  /* MÃO (pan interno do Viewport Planta) — desloca a área de projeto dentro da
   * janela sem mexer no projeto: guarda um offset por janela e por folha, em
   * metros do referencial rodado da folha. */
  const [panVpAtivo, setPanVpAtivo] = useState<number | null>(null);
  const [vpPan, setVpPan] = useState<Record<string, { dx: number; dy: number }>>({});
  const panKey = (vpIndex: number, pagina: number) => `${layout}-${vpIndex}-${pagina}`;
  const iniciarPanVp = (ev: React.MouseEvent, vpIndex: number, vbW: number, vbH: number) => {
    ev.preventDefault();
    ev.stopPropagation();
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const kx = vbW / Math.max(1, rect.width);
    const ky = vbH / Math.max(1, rect.height);
    const x0 = ev.clientX, y0 = ev.clientY;
    const k = panKey(vpIndex, currentPage);
    const base = vpPan[k] || { dx: 0, dy: 0 };
    const mover = (e: MouseEvent) =>
      setVpPan((prev) => ({ ...prev, [k]: { dx: base.dx + (e.clientX - x0) * kx, dy: base.dy + (e.clientY - y0) * ky } }));
    const largar = () => {
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", largar);
    };
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", largar);
  };
  const setViewportBaseAlignment = store.setProductionViewportBaseAlignment;
  const viewportBaseProfiles = store.productionViewportBaseProfiles;
  const setViewportBaseProfile = store.setProductionViewportBaseProfile;
  const viewportAssemblies = store.productionViewportAssemblies;
  const setViewportAssembly = store.setProductionViewportAssembly;
  const viewportCorridors = store.productionViewportCorridors;
  const setViewportCorridor = store.setProductionViewportCorridor;

  const [isEditingTable, setIsEditingTable] = useState(false);
  const [tableTabMode, setTableTabMode] = useState<"preview" | "cells" | "markdown">("preview");
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [showMarkdownRaw, setShowMarkdownRaw] = useState(false);
  const [isEditingCarimbo, setIsEditingCarimbo] = useState(false);
    const carimboElements = store.productionCarimboElements;
  const setCarimboElements = store.setProductionCarimboElements;
  const carimboTextValues = store.productionCarimboTextValues;
  const setCarimboTextValues = store.setProductionCarimboTextValues;
  const carimboTheme = store.productionCarimboTheme;
  const setCarimboTheme = store.setProductionCarimboTheme;
  const showCarimboDimensions = store.productionShowCarimboDimensions;
  const setShowCarimboDimensions = store.setProductionShowCarimboDimensions;
  const carimboCustomImages = store.productionCarimboCustomImages;
  const setCarimboCustomImages = store.setProductionCarimboCustomImages;
  const carimboDimensions = store.productionCarimboDimensions;
  const setCarimboDimensions = store.setProductionCarimboDimensions;

  const totalCarimboHeight = 
    (carimboDimensions.row1 || 0) +
    (carimboDimensions.row2 || 0) +
    (carimboDimensions.row3 || 0) +
    (carimboDimensions.row4 || 0) +
    (carimboDimensions.row5 || 0) +
    (carimboDimensions.row6 || 0) +
    (carimboDimensions.row7 || 0) +
    (carimboDimensions.row8 || 0) || 102.5;

  const totalCarimboWidth = 
    (carimboDimensions.col1 || 0) +
    (carimboDimensions.col2 || 0) +
    (carimboDimensions.col3 || 0) || 175.0;

  const WINDOWS_TTF_FONTS = [
    "Arial",
    "Arial Black",
    "Calibri",
    "Cambria",
    "Comic Sans MS",
    "Consolas",
    "Courier New",
    "Ebrima",
    "Georgia",
    "Impact",
    "Isocpeur",
    "Lucida Console",
    "Lucida Sans Unicode",
    "MS Gothic",
    "MS PGothic",
    "MS Sans Serif",
    "Palatino Linotype",
    "Segoe UI",
    "SimSun",
    "Symbol",
    "Tahoma",
    "Times New Roman",
    "Trebuchet MS",
    "Verdana",
  ];

  const defaultCarimboTextStyle = {
    fontFamily: "Arial",
    textHeightMM: 2.5,
    labelColor: "#f59e0b",
    valueColor: "#10b981",
    fontWeight: "bold" as "normal" | "bold",
    fontStyle: "normal" as "normal" | "italic",
    textDecoration: "none" as "none" | "underline",
  };

  const carimboTextStyle = store.productionCarimboTextStyle;
  const setCarimboTextStyle = store.setProductionCarimboTextStyle;
  const [isEditingTextStyles, setIsEditingTextStyles] = useState(false);

  const handleSymbolImageUpload = (id: string, file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setCarimboCustomImages(prev => ({
          ...prev,
          [id]: e.target!.result as string
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveSymbolImage = (id: string) => {
    setCarimboCustomImages(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const toggleCarimboElement = (id: string) => {
    setCarimboElements(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const updateCarimboTextValue = (id: string, value: string) => {
    setCarimboTextValues(prev => ({
      ...prev,
      [id]: value
    }));
  };

  const setAllCarimboElements = (value: boolean) => {
    setCarimboElements({
      simbolo_1: value,
      simbolo_2: value,
      simbolo_3: value,
      texto_1: value,
      texto_2: value,
      texto_3: value,
      texto_4: value,
      texto_5: value,
      texto_6: value,
      texto_7: value,
      texto_8: value,
      texto_9: value,
      texto_10: value,
    });
  };

  const renderArtespCarimbo = (theme: "sheet" | "cad" = "sheet") => {
    const isCad = theme === "cad";
    
    const bgClass = isCad ? "bg-[#18181b] text-white border-slate-600" : "bg-white text-slate-900 border-slate-900";
    const borderClass = isCad ? "border-slate-600" : "border-slate-900";

    const totalH = 
      (carimboDimensions.row1 || 0) +
      (carimboDimensions.row2 || 0) +
      (carimboDimensions.row3 || 0) +
      (carimboDimensions.row4 || 0) +
      (carimboDimensions.row5 || 0) +
      (carimboDimensions.row6 || 0) +
      (carimboDimensions.row7 || 0) +
      (carimboDimensions.row8 || 0) || 102.5;

    const totalW = 
      (carimboDimensions.col1 || 0) +
      (carimboDimensions.col2 || 0) +
      (carimboDimensions.col3 || 0) || 175.0;

    const row1Pct = `${((carimboDimensions.row1 || 25) / totalH) * 100}%`;
    const row2Pct = `${((carimboDimensions.row2 || 32.5) / totalH) * 100}%`;
    const row3Pct = `${((carimboDimensions.row3 || 7.5) / totalH) * 100}%`;
    const row4Pct = `${((carimboDimensions.row4 || 7.5) / totalH) * 100}%`;
    const row56Sum = (carimboDimensions.row5 || 7.5) + (carimboDimensions.row6 || 7.5) || 15;
    const row56Pct = `${(row56Sum / totalH) * 100}%`;
    const row5SubPct = `${((carimboDimensions.row5 || 7.5) / row56Sum) * 100}%`;
    const row6SubPct = `${((carimboDimensions.row6 || 7.5) / row56Sum) * 100}%`;
    const row7Pct = `${((carimboDimensions.row7 || 7.5) / totalH) * 100}%`;
    const row8Pct = `${((carimboDimensions.row8 || 7.5) / totalH) * 100}%`;

    const col1Pct = `${((carimboDimensions.col1 || 101) / totalW) * 100}%`;
    const col2Pct = `${((carimboDimensions.col2 || 44) / totalW) * 100}%`;
    const col3Pct = `${((carimboDimensions.col3 || 30) / totalW) * 100}%`;
    const col12Pct = `${(((carimboDimensions.col1 || 101) + (carimboDimensions.col2 || 44)) / totalW) * 100}%`;

    const valHeightMM = typeof carimboTextStyle.textHeightMM === "number" && !isNaN(carimboTextStyle.textHeightMM) && carimboTextStyle.textHeightMM > 0 
      ? carimboTextStyle.textHeightMM 
      : 2.5;

    const labelHeightMM = Math.max(1.0, Math.min(valHeightMM * 0.85, 2.2));

    const valueCqh = (valHeightMM / totalH) * 100;
    const labelCqh = (labelHeightMM / totalH) * 100;

    const labelStyle: React.CSSProperties = {
      fontFamily: carimboTextStyle.fontFamily || "Arial",
      color: carimboTextStyle.labelColor || (isCad ? "#f59e0b" : "#0f172a"),
      fontSize: `${labelCqh}cqh`,
      lineHeight: "1",
      fontWeight: carimboTextStyle.fontWeight || "bold",
      fontStyle: carimboTextStyle.fontStyle || "normal",
      textDecoration: carimboTextStyle.textDecoration || "none",
    };

    const valueStyle: React.CSSProperties = {
      fontFamily: carimboTextStyle.fontFamily || "Arial",
      color: carimboTextStyle.valueColor || (isCad ? "#10b981" : "#1e293b"),
      fontSize: `${valueCqh}cqh`,
      lineHeight: "1",
      fontWeight: carimboTextStyle.fontWeight || "normal",
      fontStyle: carimboTextStyle.fontStyle || "normal",
      textDecoration: carimboTextStyle.textDecoration || "none",
    };

    const labelClass = "";
    const valueClass = "";

    return (
      <div className={`[container-type:size] w-full h-full border-2 ${borderClass} flex flex-col font-sans leading-none select-none overflow-hidden ${bgClass}`}>
        {/* SÍMBOLO 1: ARTESP LOGO & HEADER */}
        <div style={{ height: row1Pct }} className={`border-b-2 ${borderClass} flex items-center justify-center shrink-0 overflow-hidden px-2 py-0.5`}>
          {carimboElements.simbolo_1 ? (
            carimboCustomImages.simbolo_1 ? (
              <div className="flex items-center justify-center h-full w-full p-0.5 overflow-hidden">
                <img src={carimboCustomImages.simbolo_1} alt="Símbolo 1" className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2.5 max-w-full h-full overflow-hidden px-1">
                {/* Vector ARTESP Emblem */}
                <svg className="h-[80%] max-h-7 w-auto shrink-0" viewBox="0 0 110 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M 4 28 C 12 14, 22 6, 36 6 C 28 16, 18 24, 4 28 Z" fill="#DC2626" />
                  <path d="M 2 30 C 18 28, 30 18, 42 2 C 34 10, 20 22, 2 30 Z" fill="#2563EB" />
                  <path d="M 14 30 L 24 14" stroke="#FBBF24" strokeWidth="1.5" strokeDasharray="2 1.5" />
                  <text x="44" y="22" fontFamily="system-ui, sans-serif" fontWeight="900" fontStyle="italic" fontSize="16" fill={isCad ? "#EF4444" : "#B91C1C"} letterSpacing="-0.5">ARTESP</text>
                </svg>
                <div className="flex flex-col leading-[1.05] min-w-0 justify-center">
                  <span style={{ fontSize: `${(1.8 / totalH) * 100}cqh` }} className={`font-extrabold tracking-tight uppercase ${isCad ? "text-amber-300" : "text-slate-900"}`}>
                    AGÊNCIA DE TRANSPORTE DO ESTADO DE SÃO PAULO
                  </span>
                  <span style={{ fontSize: `${(1.35 / totalH) * 100}cqh` }} className={`font-bold tracking-tight uppercase ${isCad ? "text-slate-300" : "text-slate-700"}`}>
                    GOVERNO DO ESTADO DE SÃO PAULO
                  </span>
                </div>
              </div>
            )
          ) : (
            <div style={{ fontSize: `${(1.5 / totalH) * 100}cqh` }} className="w-full text-center text-slate-400 italic">[Símbolo 1 Desativado]</div>
          )}
        </div>

        {/* SÍMBOLO 2: CONCESSIONÁRIA CCR SPVIAS */}
        <div style={{ height: row2Pct }} className={`border-b-2 ${borderClass} p-1 flex items-center justify-center shrink-0 overflow-hidden`}>
          {carimboElements.simbolo_2 ? (
            carimboCustomImages.simbolo_2 ? (
              <div className="flex items-center justify-center w-full h-full p-0.5 overflow-hidden">
                <img src={carimboCustomImages.simbolo_2} alt="Símbolo 2" className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: `${(3.6 / totalH) * 100}cqh` }} className={`font-black tracking-tight ${isCad ? "text-slate-300" : "text-slate-700"}`}>CCR</span>
                <div style={{ width: `${(4.5 / totalH) * 100}cqh`, height: `${(4.5 / totalH) * 100}cqh`, fontSize: `${(2.2 / totalH) * 100}cqh` }} className="rounded-full border-2 border-red-600 flex items-center justify-center text-red-600 font-bold shadow-xs">
                  🌀
                </div>
                <span style={{ fontSize: `${(3.4 / totalH) * 100}cqh` }} className={`font-black tracking-tight italic ${isCad ? "text-slate-300" : "text-slate-800"}`}>SPVias</span>
              </div>
            )
          ) : (
            <div style={{ fontSize: `${(1.5 / totalH) * 100}cqh` }} className="w-full text-center text-slate-400 italic">[Símbolo 2 Desativado]</div>
          )}
        </div>

        {/* ROW 3: TEXTO 1 - N.º DESENHO INTERNO */}
        <div style={{ height: row3Pct }} className={`border-b ${borderClass} px-1.5 flex items-center gap-1 shrink-0 overflow-hidden`}>
          {carimboElements.texto_1 ? (
            <>
              <span className={`shrink-0 ${labelClass}`} style={labelStyle}>N.º DESENHO INTERNO:</span>
              <span className={`truncate ${valueClass}`} style={valueStyle}>{carimboTextValues.texto_1}</span>
            </>
          ) : (
            <span className="text-[5.5px] text-slate-400 italic">[Texto 1 Desativado]</span>
          )}
        </div>

        {/* ROW 4: TEXTO 2 & TEXTO 5 */}
        <div style={{ height: row4Pct }} className={`border-b ${borderClass} flex divide-x ${borderClass} shrink-0 overflow-hidden`}>
          {/* Left section */}
          <div style={{ width: col12Pct }} className="px-1.5 flex items-center gap-1 overflow-hidden shrink-0">
            {carimboElements.texto_2 ? (
              <>
                <span className={`shrink-0 ${labelClass}`} style={labelStyle}>N.º DESENHO ARTESP:</span>
                <span className={`truncate ${valueClass}`} style={valueStyle}>{carimboTextValues.texto_2}</span>
              </>
            ) : (
              <span className="text-[5.5px] text-slate-400 italic">[Texto 2 Desativado]</span>
            )}
          </div>
          {/* Right section */}
          <div style={{ width: col3Pct }} className="px-1 flex flex-col justify-center shrink-0 overflow-hidden">
            {carimboElements.texto_5 ? (
              <>
                <span className={`leading-none ${labelClass}`} style={labelStyle}>EMISSÃO</span>
                <span className={`leading-none truncate ${valueClass}`} style={valueStyle}>{carimboTextValues.texto_5}</span>
              </>
            ) : (
              <span style={{ fontSize: `${(1.5 / totalH) * 100}cqh` }} className="text-slate-400 italic">[Texto 5]</span>
            )}
          </div>
        </div>

        {/* ROW 5 & 6 COMBINED: TEXTO 3, TEXTO 4 & SÍMBOLO 3 DER SP */}
        <div style={{ height: row56Pct }} className={`border-b ${borderClass} flex divide-x ${borderClass} shrink-0 overflow-hidden`}>
          {/* Left section (split vertically into row 5 and row 6) */}
          <div style={{ width: col12Pct }} className={`flex flex-col divide-y ${borderClass} h-full`}>
            <div style={{ height: row5SubPct }} className="px-1.5 flex items-center gap-1 overflow-hidden">
              {carimboElements.texto_3 ? (
                <>
                  <span className={`shrink-0 ${labelClass}`} style={labelStyle}>TÍTULO:</span>
                  <span className={`truncate ${valueClass}`} style={valueStyle}>{carimboTextValues.texto_3}</span>
                </>
              ) : (
                <span className="text-[5.5px] text-slate-400 italic">[Texto 3 Desativado]</span>
              )}
            </div>
            <div style={{ height: row6SubPct }} className="px-1.5 flex items-center gap-1 overflow-hidden">
              {carimboElements.texto_4 ? (
                <>
                  <span className={`shrink-0 ${labelClass}`} style={labelStyle}>RODOVIA:</span>
                  <span className={`truncate ${valueClass}`} style={valueStyle}>{carimboTextValues.texto_4}</span>
                </>
              ) : (
                <span className="text-[5.5px] text-slate-400 italic">[Texto 4 Desativado]</span>
              )}
            </div>
          </div>

          {/* Right section (DER SP) */}
          <div style={{ width: col3Pct }} className="px-1 flex flex-col items-center justify-center shrink-0 overflow-hidden relative">
            {carimboElements.simbolo_3 ? (
              carimboCustomImages.simbolo_3 ? (
                <div className="flex items-center justify-center w-full h-full p-0.5 overflow-hidden">
                  <img src={carimboCustomImages.simbolo_3} alt="Símbolo 3" className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center leading-tight">
                  <span style={{ fontSize: `${(3.2 / totalH) * 100}cqh` }} className="font-black tracking-widest text-fuchsia-600 leading-none">DER</span>
                  <span style={{ fontSize: `${(2.0 / totalH) * 100}cqh` }} className="font-black text-amber-400 leading-none self-end mr-0.5">SP</span>
                </div>
              )
            ) : (
              <span className="text-[5.5px] text-slate-400 italic">[Símbolo 3]</span>
            )}
          </div>
        </div>

        {/* ROW 7: TEXTO 6 (TRECHO) & TEXTO 7 (ESTACA) */}
        <div style={{ height: row7Pct }} className={`border-b ${borderClass} flex divide-x ${borderClass} shrink-0 overflow-hidden`}>
          {/* Column 1 */}
          <div style={{ width: col1Pct }} className="px-1.5 flex items-center gap-1 overflow-hidden shrink-0">
            {carimboElements.texto_6 ? (
              <>
                <span className={`shrink-0 ${labelClass}`} style={labelStyle}>TRECHO:</span>
                <span className={`truncate ${valueClass}`} style={valueStyle}>{carimboTextValues.texto_6}</span>
              </>
            ) : (
              <span className="text-[5.5px] text-slate-400 italic">[Texto 6 Desativado]</span>
            )}
          </div>
          {/* Column 2 */}
          <div style={{ width: col2Pct }} className="px-1 flex items-center gap-1 overflow-hidden shrink-0">
            {carimboElements.texto_7 ? (
              <>
                <span className={`shrink-0 ${labelClass}`} style={labelStyle}>ESTACA</span>
                <span className={`truncate ${valueClass}`} style={valueStyle}>{carimboTextValues.texto_7}</span>
              </>
            ) : (
              <span className="text-[5.5px] text-slate-400 italic">[Texto 7]</span>
            )}
          </div>
          {/* Column 3 */}
          <div style={{ width: col3Pct }} className="shrink-0"></div>
        </div>

        {/* ROW 8: TEXTO 8 (ESCALA), TEXTO 10, TEXTO 9 (FOLHA) */}
        <div style={{ height: row8Pct }} className={`flex divide-x ${borderClass} shrink-0 overflow-hidden`}>
          {/* Column 1 */}
          <div style={{ width: col1Pct }} className="px-1.5 flex items-center gap-1 overflow-hidden shrink-0">
            {carimboElements.texto_8 ? (
              <>
                <span className={`shrink-0 ${labelClass}`} style={labelStyle}>ESCALA:</span>
                <span className={`truncate ${valueClass}`} style={valueStyle}>{carimboTextValues.texto_8}</span>
              </>
            ) : (
              <span className="text-[5.5px] text-slate-400 italic">[Texto 8 Desativado]</span>
            )}
          </div>
          {/* Column 2 */}
          <div style={{ width: col2Pct }} className="px-1 flex items-center justify-center overflow-hidden shrink-0">
            {carimboElements.texto_10 ? (
              <span className={`truncate ${valueClass}`} style={valueStyle}>{carimboTextValues.texto_10}</span>
            ) : null}
          </div>
          {/* Column 3 */}
          <div style={{ width: col3Pct }} className="px-1 flex flex-col justify-center shrink-0 overflow-hidden">
            {carimboElements.texto_9 ? (
              <>
                <span className={`leading-none ${labelClass}`} style={labelStyle}>FOLHA</span>
                <span className={`leading-none truncate ${valueClass}`} style={valueStyle}>{carimboTextValues.texto_9}</span>
              </>
            ) : (
              <span style={{ fontSize: `${(1.5 / totalH) * 100}cqh` }} className="text-slate-400 italic">[Texto 9]</span>
            )}
          </div>
        </div>
      </div>
    );
  };
  const zoom = store.productionZoom;
  const setZoom = store.setProductionZoom;
  const pan = store.productionPan;
  const setPan = store.setProductionPan;
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const visualizerRef = useRef<HTMLDivElement>(null);

  const handleSheetWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (Math.abs(e.deltaY) < 0.001) return;

    const container = visualizerRef.current || e.currentTarget;
    const rect = container.getBoundingClientRect();

    // Mouse coordinates relative to viewport center
    const mouseX = e.clientX - (rect.left + rect.width / 2);
    const mouseY = e.clientY - (rect.top + rect.height / 2);

    // Exponential scaling step based on deltaY for smooth trackpad & wheel behavior
    const scaleFactor = Math.exp(-e.deltaY * 0.0015);

    const minZoom = 0.1;
    const maxZoom = 6.0;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom * scaleFactor));

    if (Math.abs(newZoom - zoom) < 0.0001) return;

    const zoomRatio = newZoom / zoom;

    // Preserve mouse focal point position during zoom
    const newPanX = mouseX - (mouseX - pan.x) * zoomRatio;
    const newPanY = mouseY - (mouseY - pan.y) * zoomRatio;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(6.0, zoom * 1.25);
    const zoomRatio = newZoom / zoom;
    setZoom(newZoom);
    setPan({ x: pan.x * zoomRatio, y: pan.y * zoomRatio });
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(0.1, zoom / 1.25);
    const zoomRatio = newZoom / zoom;
    setZoom(newZoom);
    setPan({ x: pan.x * zoomRatio, y: pan.y * zoomRatio });
  };

  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  const handleFitToScreen = () => {
    if (!visualizerRef.current) {
      handleResetZoom();
      return;
    }
    const rect = visualizerRef.current.getBoundingClientRect();
    const padding = 64;
    const availW = Math.max(200, rect.width - padding);
    const availH = Math.max(200, rect.height - padding);

    const scaleX = availW / sw;
    const scaleY = availH / sh;
    const fitZoom = Math.max(0.15, Math.min(2.5, Math.min(scaleX, scaleY)));

    setZoom(fitZoom);
    setPan({ x: 0, y: 0 });
  };
  
  
  const handlePrintPDF = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    
    try {
      const pdf = new jsPDF({
        orientation: orientation === "Landscape" ? "landscape" : "portrait",
        unit: "mm",
        format: sheetSize.toLowerCase()
      });

      // Save current state
      const originalPage = currentPage;
      const originalZoom = zoom;
      const originalPan = { ...pan };

      // Set zoom to 1 and pan to 0 for clear capture
      setZoom(1);
      setPan({ x: 0, y: 0 });

      // Wait a bit for layout to settle
      await new Promise(r => setTimeout(r, 100));

      for (let p = 1; p <= totalPages; p++) {
        setCurrentPage(p);
        // Wait for render
        await new Promise(r => setTimeout(r, 500)); 

        const element = document.getElementById("sheet-capture-area");
        if (element) {
          // Hide safety margin during print
          const safetyMargin = element.querySelector('.safety-margin') as HTMLElement;
          if (safetyMargin) safetyMargin.style.display = 'none';

          // Blocos que serão emitidos em VETOR (texto real): tabelas e carimbo.
          // Ficam invisíveis na captura raster para não duplicar / borrar.
          const vectorBlocks = Array.from(
            element.querySelectorAll('[data-vec-marker]')
          )
            .map(m => m.parentElement as HTMLElement | null)
            .filter((el): el is HTMLElement => !!el);

          const prevVisibility = vectorBlocks.map(el => el.style.visibility);
          vectorBlocks.forEach(el => { el.style.visibility = 'hidden'; });

          let imgData: string | null = null;
          try {
            // Resta apenas o que não é vetorizado (planta, perfil, tabelas e
            // carimbo saem em vetor). Mantido como camada de segurança a ~150 DPI.
            const MAX_PX = 12e6;
            const areaPx = Math.max(1, sw * sh);
            const ratios = [
              Math.min(5.9, Math.sqrt(MAX_PX / areaPx)),
              4,
              2
            ];
            for (const ratio of ratios) {
              try {
                imgData = await toPng(element, {
                  pixelRatio: Math.max(2, ratio),
                  cacheBust: true,
                  style: {
                    transform: 'scale(1)',
                    transformOrigin: 'top left'
                  }
                });
                break;
              } catch (err) {
                console.warn(`Captura a ${ratio.toFixed(1)} px/mm falhou, a reduzir resolução`, err);
              }
            }
          } finally {
            vectorBlocks.forEach((el, i) => { el.style.visibility = prevVisibility[i] || ''; });
            if (safetyMargin) safetyMargin.style.display = '';
          }

          if (p > 1) {
            pdf.addPage(sheetSize.toLowerCase(), orientation === "Landscape" ? "landscape" : "portrait");
          }

          // PDF dimensions
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();

          if (imgData) pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

          // Repinta tabelas e carimbo como vetor por cima do raster da planta
          for (const block of vectorBlocks) {
            try {
              drawElementVector(pdf, block, element, pdfWidth);
            } catch (err) {
              console.warn('Falha ao vetorizar bloco, mantido apenas em raster', err);
            }
          }
        }
      }

      pdf.save(`Projeto_Export.pdf`);

      // Restore state
      setCurrentPage(originalPage);
      setZoom(originalZoom);
      setPan(originalPan);
    } catch (error) {
      console.error("Error generating PDF", error);
      alert("Erro ao gerar PDF.");
    } finally {
      setIsPrinting(false);
    }
  };

  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [bandSetModalOpen, setBandSetModalOpen] = useState<number | null>(null);
  const [gridCfgOpen, setGridCfgOpen] = useState<number | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceDown(true);
      }
      if (e.key === 'Escape') {
        useStore.getState().setProductionSelectedViewport(null);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceDown(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Mock states for Sheets visualizer
  const [currentPage, setCurrentPage] = useState(1);
  const viewportSizes = store.productionViewportSizes || {};
  const setViewportSizes = (updater: any) => {
    const newSizes = typeof updater === 'function' ? updater(store.productionViewportSizes || {}) : updater;
    store.setProductionViewportSizes(newSizes);
  };
  const viewportPositions = store.productionViewportPositions || {};
  const setViewportPositions = (updater: any) => {
    const newPositions = typeof updater === 'function' ? updater(store.productionViewportPositions || {}) : updater;
    store.setProductionViewportPositions(newPositions);
  };
  /* MOLDURA das janelas — espessura/cor/estilo por janela, editável pelo
   * utilizador. A espessura vai em mm (1 unidade da folha = 1 mm) e é publicada
   * em data-frame-mm para o PDF sair com traço fino de verdade. */
  const frameOf = (key: string | number) => {
    const f = (store.productionFrames || {})[String(key)] || {};
    return {
      widthMm: (f as any).widthMm ?? 0.35,
      color: (f as any).color ?? "#000000",
      style: ((f as any).style ?? "solid") as "solid" | "dashed" | "none",
    };
  };
  const frameStyle = (key: string | number) => {
    const f = frameOf(key);
    return f.style === "none"
      ? { borderStyle: "none" as const, borderWidth: 0 }
      : { borderStyle: f.style, borderWidth: `${f.widthMm}px`, borderColor: f.color };
  };

  const layout = store.productionLayout;
  /* CADERNOS: o layout ativo (quando existe) define folha, escala e as janelas
   * que compõem a prancha. Sem caderno, mantém-se o comportamento antigo. */
  const cadernosProd: any[] = (store as any).productionCadernos || [];
  const cadernoProdAtivo = cadernosProd.find((c: any) => c.id === (store as any).productionCadernoAtivo) || cadernosProd[0] || null;
  const layoutCfg: any = ((cadernoProdAtivo?.layouts || []) as any[]).find((l: any) => l.id === store.productionLayout) || null;
  const janelasLayout: any[] = layoutCfg?.janelas || [];
  const sheetSize = store.productionSheetSize;
  const orientation = store.productionSheetOrientation;
  const hasTable = store.productionTable;

  const getPointAt = (alignment, sta) => {
    if (!alignment || alignment.points.length === 0) return { x: 0, y: 0, station: 0, angle: 0 };
    if (sta <= alignment.points[0].sta) {
       const p1 = alignment.points[0];
       const p2 = alignment.points[1] || p1;
       return { ...p1, station: sta, angle: Math.atan2(p2.y - p1.y, p2.x - p1.x) };
    }
    const lastP = alignment.points[alignment.points.length - 1];
    if (sta >= lastP.sta) {
       const p1 = alignment.points[alignment.points.length - 2] || lastP;
       return { ...lastP, station: sta, angle: Math.atan2(lastP.y - p1.y, lastP.x - p1.x) };
    }
    for (let i = 0; i < alignment.points.length - 1; i++) {
      if (alignment.points[i].sta <= sta && alignment.points[i+1].sta >= sta) {
        const p1 = alignment.points[i];
        const p2 = alignment.points[i+1];
        const dist = p2.sta - p1.sta;
        if (dist === 0) {
            return {
                x: p1.x,
                y: p1.y,
                station: sta,
                angle: Math.atan2(p2.y - p1.y, p2.x - p1.x)
            };
        }
        const t = (sta - p1.sta) / dist;
        return {
          x: p1.x + t * (p2.x - p1.x),
          y: p1.y + t * (p2.y - p1.y),
          station: sta,
          angle: Math.atan2(p2.y - p1.y, p2.x - p1.x)
        };
      }
    }
    return { ...lastP, station: sta, angle: 0 };
  };

  /* Margem reservada em cada extremo da folha para as match lines (mm de folha). */
  const MARGEM_MATCHLINE_MM = 25;
  const PASSO_ESTACA = 20;

  /* Envolvente, no referencial rodado da folha, do EIXO e das LINHAS DO
   * CORREDOR que caem na janela. É o corredor que manda na altura — usar só o
   * eixo era o que fazia as bordas saírem cortadas. */
  const envolventeRodada = (
    alignment: any,
    staIni: number,
    staFim: number,
    angle: number,
    compr: number,
  ) => {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const startP = getPointAt(alignment, staIni);
    const rxStart = startP.x * ca - startP.y * sa;
    let minY = Infinity, maxY = -Infinity;
    const push = (x: number, y: number) => {
      const rx = x * ca - y * sa;
      if (rx < rxStart - 1 || rx > rxStart + compr + 1) return;
      const ry = x * sa + y * ca;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    };
    push(startP.x, startP.y);
    const endP = getPointAt(alignment, staFim);
    push(endP.x, endP.y);
    for (const pt of alignment.points) {
      if (pt.sta > staIni && pt.sta < staFim) push(pt.x, pt.y);
    }
    const feats = (useStore.getState() as any).corridorFeatures || [];
    for (const f of feats) {
      const pts = f.worldPoints || [];
      const salto = pts.length > 400 ? Math.ceil(pts.length / 400) : 1;
      for (let i = 0; i < pts.length; i += salto) push(pts[i].x, pts[i].y);
    }
    if (!isFinite(minY)) return { minY: 0, maxY: 0, rxStart };
    return { minY, maxY, rxStart };
  };

  const calculatePages = (alignment, vpWidthM, vpHeightM, scaleFactor = 1000) => {
    if (!alignment || alignment.points.length === 0) return [];
    let pages = [];
    
    let alignStartSta = alignment.points[0].sta;
    let alignEndSta = alignment.points[alignment.points.length - 1].sta;
    
    if (alignment.visualStartStation !== undefined) {
       alignStartSta = Math.max(alignStartSta, alignment.visualStartStation);
    }
    if (alignment.visualEndStation !== undefined) {
       alignEndSta = Math.min(alignEndSta, alignment.visualEndStation);
    }
    
    if (alignStartSta >= alignEndSta) return [{ startStation: alignStartSta, endStation: alignStartSta, angle: 0 }];

    /* A folha tem comprimento FIXO em estacas cheias: largura útil (janela
     * menos as duas margens) arredondada para baixo ao múltiplo de 20 m. */
    const margensM = MARGEM_MATCHLINE_MM * (scaleFactor / 1000);
    const utilM = Math.max(PASSO_ESTACA, vpWidthM - 2 * margensM);
    let comprFolha = Math.floor(utilM / PASSO_ESTACA) * PASSO_ESTACA;
    if (comprFolha < PASSO_ESTACA) comprFolha = PASSO_ESTACA;

    const alturaUtil = Math.max(1, vpHeightM - 2 * margensM);

    /* Começar em estaca cheia. */
    let currentStation = Math.floor(alignStartSta / PASSO_ESTACA) * PASSO_ESTACA;
    if (currentStation < alignStartSta - 1e-6) currentStation = Math.max(alignStartSta, currentStation);
    const maxStation = alignEndSta;

    while (currentStation < maxStation - 1e-6) {
      let endStation = Math.min(currentStation + comprFolha, maxStation);
      let angle = 0;
      let ok = false;

      while (true) {
        const sP = getPointAt(alignment, currentStation);
        const eP = getPointAt(alignment, endStation);
        angle = -Math.atan2(eP.y - sP.y, eP.x - sP.x);
        const env = envolventeRodada(alignment, currentStation, endStation, angle, endStation - currentStation);
        if (env.maxY - env.minY <= alturaUtil || endStation - currentStation <= PASSO_ESTACA) {
          ok = true;
          break;
        }
        endStation -= PASSO_ESTACA; // não cabe em altura: encurta uma estaca
      }
      void ok;

      pages.push({ startStation: currentStation, endStation, angle });
      currentStation = endStation;
      if (pages.length > 500) break;
    }
    return pages.length > 0 ? pages : [{ startStation: 0, endStation: 0, angle: 0 }];
  };

  const getDims = () => {
    let w = 841, h = 594; 
    if (sheetSize === "A0") { w = 1189; h = 841; }
    else if (sheetSize === "A2") { w = 594; h = 420; }
    else if (sheetSize === "A3") { w = 420; h = 297; }
    else if (sheetSize === "A4") { w = 297; h = 210; }
    
    if (orientation === "Portrait") {
      return { w: h, h: w };
    }
    return { w, h };
  };
  const { w: sw, h: sh } = getDims();

  const alignmentPagesBase = React.useMemo(() => {
    if (!layoutCfg) return [{ startStation: 0, endStation: 0, angle: 0 }];
    // Determine vp dimensions in mm based on layout
    let vpW_mm = sw - 35;
    let vpH_mm = sh - 20;
    if (layout === "Planta e Perfil" || layout === "Perfil") {
      vpH_mm = (sh - 32) / 2;
    } else if (layout === "Seção tipo") {
      vpW_mm = (sw - 47) / 2;
      vpH_mm = (sh - 32) / 2;
    }
    if (layoutCfg) {
      /* Cadernos: a altura por omissão é a fatia da janela na composição. */
      const cheias = janelasLayout.filter((j: any) => /planta|perfil/.test(String(j.tipo))).length || 1;
      vpW_mm = sw - 35;
      vpH_mm = Math.max(40, (sh - 20 - 12 * (cheias - 1)) / cheias);
    }

    // 1. Check if we are driven by Planta
    let plantaVpIndex = -1;
    for (let i = 0; i < viewportCategories.length; i++) {
      if ((viewportCategories[i] || "").toLowerCase().includes("planta")) {
        plantaVpIndex = i;
        break;
      }
    }
    
    let hasBands = false;
    for (let i = 0; i < viewportCategories.length; i++) {
       if ((viewportCategories[i] || "").toLowerCase().includes("perfil") && (store.productionViewportProfileBands?.[i] || []).length > 0) {
          hasBands = true;
          break;
       }
    }

    if (plantaVpIndex !== -1 && store.productionActiveAlignment) {
      const alignId = store.productionActiveAlignment;
      const alignment = store.alignments.find(a => a.id === alignId);
      if (!alignment || alignment.points.length === 0) return [{ startStation: 0, endStation: 0, angle: 0 }];
      
      const scaleStr = viewportScales[plantaVpIndex] || "1:1000";
      let scaleFactor = parseInt(scaleStr.split(":")[1]) || 1000;
      
      /* A janela desenha sem folga (o viewBox ocupa toda a janela), por isso o
       * comprimento da folha tem de sair da largura REAL do viewport. O antigo
       * "-32 mm" era uma folga que já não existe e encurtava as folhas (dava
       * 720 m em vez de 740 m no A1 landscape a 1:1000). */
      let pVW = Math.max(1, viewportSizes[`${layout}-${plantaVpIndex}`]?.w || vpW_mm);
      if (hasBands) pVW = Math.max(1, pVW - 40); // reserve 40mm for bands title box

      const pVH = Math.max(1, viewportSizes[`${layout}-${plantaVpIndex}`]?.h || vpH_mm);
      
      const vpWidthM = pVW * (scaleFactor / 1000);
      const vpHeightM = pVH * (scaleFactor / 1000);
      
      return calculatePages(alignment, vpWidthM, vpHeightM, scaleFactor);
    }
    
    // 2. Check if we are driven by Perfil
    let perfilVpIndex = -1;
    for (let i = 0; i < viewportCategories.length; i++) {
      if ((viewportCategories[i] || "").toLowerCase().includes("perfil") && viewportBaseProfiles[i]) {
        perfilVpIndex = i;
        break;
      }
    }
    
    if (perfilVpIndex !== -1) {
      // Find the associated alignment length
      // If it's a surface, we don't easily know the length, but typically it's the active alignment
      let minSta = 0;
      let maxSta = 1000;
      if (store.productionActiveAlignment) {
         const al = store.alignments.find(a => a.id === store.productionActiveAlignment);
         if (al && al.points.length > 0) {
            minSta = al.points[0].sta;
            maxSta = al.points[al.points.length - 1].sta;
            if (al.visualStartStation !== undefined) {
               minSta = Math.max(minSta, al.visualStartStation);
            }
            if (al.visualEndStation !== undefined) {
               maxSta = Math.min(maxSta, al.visualEndStation);
            }
         }
      }
      const scaleStr = viewportScales[perfilVpIndex] || "1:1000";
      let scaleFactor = parseInt(scaleStr.split(":")[1]) || 1000;
      // In profile, horizontal scale is often the same, or we assume it is
      const pVW = Math.max(1, (viewportSizes[`${layout}-${perfilVpIndex}`]?.w || vpW_mm) - 32);
      const vpWidthM = pVW * (scaleFactor / 1000);
      
      let pages = [];
      for (let s = minSta; s < maxSta; s += vpWidthM) {
         pages.push({ startStation: s, endStation: Math.min(s + vpWidthM, maxSta), angle: 0 });
      }
      if (pages.length === 0) pages.push({ startStation: 0, endStation: 0, angle: 0 });
      return pages;
    }
    
    // 3. Check if we are driven by Seções Acabadas
    let secaoAcabadaVpIndex = -1;
    for (let i = 0; i < viewportCategories.length; i++) {
      if ((viewportCategories[i] || "").toLowerCase().includes("acabadas") && viewportCorridors[i]) {
        secaoAcabadaVpIndex = i;
        break;
      }
    }
    
    if (secaoAcabadaVpIndex !== -1) {
       const corridorId = viewportCorridors[secaoAcabadaVpIndex];
       const corridor = store.corridors.find(c => c.id === corridorId);
       if (corridor && corridor.regions.length > 0) {

               const align = store.alignments.find(a => a.id === corridor.alignmentId);
          if (align) {
             const start = Math.max(corridor.regions[0].startStation, align.points[0]?.sta || 0);
             const end = Math.min(corridor.regions[corridor.regions.length-1].endStation, align.points[align.points.length-1]?.sta || align.length);
             let pages = [];
             let interval = store.productionCrossSectionInterval || 20;
             if (interval <= 0) interval = 20;
             const stationsSet = new Set<number>();
             
             // Regular interval stations
             for (let s = start; s <= end; s += interval) {
                stationsSet.add(Math.round(s * 1000) / 1000);
             }
             
             // Horizontal Key points
             if (store.productionCrossSectionIncludeKeyPoints && align.keyPoints) {
                align.keyPoints.forEach(p => {
                   if (p.sta !== undefined && p.sta >= start && p.sta <= end) {
                      stationsSet.add(Math.round(p.sta * 1000) / 1000);
                   }
                });
             }
             
             // Vertical Key points
             if (store.productionCrossSectionIncludeProfileKeyPoints && align.keyProfilePoints) {
                align.keyProfilePoints.forEach(p => {
                   if (p.sta !== undefined && p.sta >= start && p.sta <= end) {
                      stationsSet.add(Math.round(p.sta * 1000) / 1000);
                   }
                });
             }
             
             const sortedStations = Array.from(stationsSet).sort((a, b) => a - b);
             sortedStations.forEach(s => {
                pages.push({ startStation: s, endStation: s, angle: 0 }); // each page is just ONE station
             });
             if (pages.length === 0) pages.push({ startStation: 0, endStation: 0, angle: 0 });
             return pages;
          }
       }
    }
    
    return [{ startStation: 0, endStation: 0, angle: 0 }];
  }, [layout, sheetSize, orientation, viewportCategories, viewportBaseAlignments, viewportBaseProfiles, viewportCorridors, viewportScales, store.alignments, store.corridors, store.productionActiveAlignment, store.productionCrossSectionInterval, store.productionCrossSectionIncludeKeyPoints, store.productionCrossSectionIncludeProfileKeyPoints]);

  /* Estacas das linhas de articulação editadas pelo utilizador. Mover uma linha
   * move o limite comum das duas folhas vizinhas (nunca ultrapassa os vizinhos,
   * senão a folha ficaria invertida). */
  const alignmentPages = React.useMemo(() => {
    const ps = alignmentPagesBase.map((p: any) => ({ ...p }));
    if (ps.length === 0) return ps;
    const n = ps.length;
    const sta = (i: number) => (i === 0 ? ps[0].startStation : ps[i - 1].endStation);
    for (let i = 0; i <= n; i++) {
      const e = artEdits[i];
      if (!e || e.sta === undefined || !isFinite(e.sta)) continue;
      const lo = i === 0 ? -Infinity : sta(i - 1) + 1;
      const hi = i === n ? Infinity : sta(i + 1) - 1;
      const s = Math.min(Math.max(e.sta, lo), hi);
      if (i > 0) ps[i - 1].endStation = s;
      if (i < n) ps[i].startStation = s;
    }
    return ps;
  }, [alignmentPagesBase, artEdits]);

  const totalPages = Math.max(1, alignmentPages.length);
  // Ensure currentPage is within bounds
  React.useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  // Ensure active alignment is initialized if available
  // Alinhamento ativo inicial — sem forçar layout: projeto novo abre sem layouts.
  React.useEffect(() => {
    if (!store.productionActiveAlignment && store.alignments.length > 0) {
      store.setProductionActiveAlignment(store.alignments[0].id);
    }
  }, [store.productionActiveAlignment, store.alignments]);

  /* Janelas flutuantes de ARTICULAÇÃO DE FOLHAS criadas pelo painel esquerdo. */
  const [janelasArtic, setJanelasArtic] = useState<{ id: string; x: number; y: number; w: number; h: number }[]>([]);
  const criarJanelaArtic = () => {
    const id = `art-${Date.now()}`;
    setJanelasArtic((js) => [...js, { id, x: 20 + js.length * 12, y: 20 + js.length * 12, w: 110, h: 70 }]);
    setSelectedViewport(id as any);
  };

  /* ESQUEMA DE ARTICULAÇÃO (chave de articulação DNIT/DER) — usado tanto pela
   * categoria de viewport como pelas janelas flutuantes. */  const renderEsquemaArticulacao = (chave: string, alignIdPref?: string) => {
    const alignId = alignIdPref || store.productionActiveAlignment;
    const alignment: any = store.alignments.find(a => a.id === alignId);
    if (!alignment || alignment.points.length < 2 || alignmentPages.length === 0) {
      return (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-white">
          <span className="text-[10px] text-slate-500 text-center px-3">
            Escolha o alinhamento base para desenhar a articulação de folhas.
          </span>
        </div>
      );
    }
    const plantaIdx = viewportCategories.findIndex((c: string) => (c || "").toLowerCase().includes("planta"));
    const iRef = plantaIdx >= 0 ? plantaIdx : 0;
    const { w: swA, h: shA } = getDims();
    let vpWmmA = swA - 35, vpHmmA = shA - 20;
    if (layout === "Planta e Perfil" || layout === "Perfil") vpHmmA = (shA - 32) / 2;
    else if (layout === "Seção tipo") { vpWmmA = (swA - 47) / 2; vpHmmA = (shA - 32) / 2; }
    const escStr = viewportScales[iRef] || "1:1000";
    const escF = parseInt(escStr.split(":")[1]) || 1000;
    const dimK = `${layout}-${iRef}`;
    const larguraFolhaM = (viewportSizes[dimK]?.w || vpWmmA) * (escF / 1000);
    const alturaFolhaM = (viewportSizes[dimK]?.h || vpHmmA) * (escF / 1000);
    const margemM = MARGEM_MATCHLINE_MM * (escF / 1000);

    const quadros = alignmentPages.map((p: any, i: number) => {
      const a = p.angle || 0;
      const ca = Math.cos(a), sa = Math.sin(a);
      const inv = (X: number, Y: number) => ({ x: X * ca + Y * sa, y: -X * sa + Y * ca });
      const env = envolventeRodada(alignment, p.startStation, p.endStation, a, p.endStation - p.startStation);
      const X0 = env.rxStart - margemM;
      const yc = isFinite(env.maxY - env.minY) && env.maxY > env.minY ? (env.minY + env.maxY) / 2 : 0;
      const cantos = [
        inv(X0, yc - alturaFolhaM / 2),
        inv(X0 + larguraFolhaM, yc - alturaFolhaM / 2),
        inv(X0 + larguraFolhaM, yc + alturaFolhaM / 2),
        inv(X0, yc + alturaFolhaM / 2),
      ];
      return { n: i + 1, cantos, centro: inv(X0 + larguraFolhaM / 2, yc), pag: p };
    });

    let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
    const eng = (x: number, y: number) => {
      if (x < bMinX) bMinX = x;
      if (x > bMaxX) bMaxX = x;
      if (y < bMinY) bMinY = y;
      if (y > bMaxY) bMaxY = y;
    };
    quadros.forEach(q => q.cantos.forEach(c => eng(c.x, c.y)));
    alignment.points.forEach((p: any) => eng(p.x, p.y));
    const extX = Math.max(1, bMaxX - bMinX), extY = Math.max(1, bMaxY - bMinY);
    const folga = Math.max(extX, extY) * 0.06;
    const vbW = extX + 2 * folga, vbH = extY + 2 * folga;
    const u = Math.max(vbW, vbH);
    const fsNum = u / 26, fsKm = u / 52, lw = u / 900;
    const eixoD = `M ${alignment.points.map((p: any) => `${p.x},${p.y}`).join(" L ")}`;
    const staIni = alignmentPages[0].startStation;
    const staFim = alignmentPages[alignmentPages.length - 1].endStation;
    const pInicio: any = getPointAt(alignment, staIni);
    const pFim: any = getPointAt(alignment, staFim);

    return (
      <div className="absolute inset-0 w-full h-full flex flex-col bg-white overflow-hidden">
        <div className="px-2 pt-1.5 pb-1 border-b border-slate-300 flex items-baseline justify-between shrink-0">
          <span className="text-[10px] font-bold tracking-wider text-slate-800 uppercase">Articulação de Folhas</span>
          <span className="text-[10px] font-bold text-slate-800">
            FOLHA {String(currentPage).padStart(2, "0")} DE {String(totalPages).padStart(2, "0")}
          </span>
        </div>
        <svg className="flex-1 w-full" viewBox={`${bMinX - folga} ${bMinY - folga} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id={`art-hatch-${chave}`} width={u / 40} height={u / 40} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2={u / 40} stroke="#1d4ed8" strokeWidth={lw * 1.6} />
            </pattern>
          </defs>
          {quadros.map(q => (
            <polygon key={`q-${q.n}`}
              points={q.cantos.map(c => `${c.x},${c.y}`).join(" ")}
              fill={q.n === currentPage ? `url(#art-hatch-${chave})` : "#ffffff"}
              fillOpacity={q.n === currentPage ? 1 : 0.6}
              stroke={q.n === currentPage ? "#1d4ed8" : "#475569"}
              strokeWidth={q.n === currentPage ? lw * 3.2 : lw * 1.4}
            />
          ))}
          <path d={eixoD} fill="none" stroke="#dc2626" strokeWidth={lw * 2.6} strokeLinejoin="round" />
          {quadros.map(q => (
            <text key={`t-${q.n}`} x={q.centro.x} y={q.centro.y}
              fontSize={fsNum} fontFamily="Arial, sans-serif" fontWeight="bold"
              textAnchor="middle" dominantBaseline="middle"
              fill={q.n === currentPage ? "#1d4ed8" : "#334155"}
            >{String(q.n).padStart(2, "0")}</text>
          ))}
          {quadros.slice(0, -1).map((q, k) => {
            const s = q.pag.endStation;
            const p: any = getPointAt(alignment, s);
            return (
              <g key={`k-${k}`}>
                <circle cx={p.x} cy={p.y} r={lw * 5} fill="#0f172a" />
                <text x={p.x} y={p.y - fsKm * 0.8} fontSize={fsKm} fontFamily="Arial, sans-serif"
                  textAnchor="middle" fill="#0f172a">{fmtKm(s)}</text>
              </g>
            );
          })}
          <text x={pInicio.x} y={pInicio.y + fsKm * 1.7} fontSize={fsKm} fontFamily="Arial, sans-serif"
            fontWeight="bold" textAnchor="middle" fill="#0f172a">INÍCIO {fmtKm(staIni)}</text>
          <text x={pFim.x} y={pFim.y + fsKm * 1.7} fontSize={fsKm} fontFamily="Arial, sans-serif"
            fontWeight="bold" textAnchor="middle" fill="#0f172a">FIM {fmtKm(staFim)}</text>
        </svg>
        <div className="px-2 py-1 border-t border-slate-300 flex items-center justify-between shrink-0 text-[9px] text-slate-600">
          <span className="font-semibold uppercase">{alignment.name}</span>
          <span>FOLHAS A {escStr} · ESQUEMA S/ESCALA</span>
        </div>
      </div>
    );
  };



  /* As janelas do layout ativo alimentam os arrays do motor de folhas:
   * categoria por índice e escala herdada do layout. */
  React.useEffect(() => {
    if (!layoutCfg) return;
    janelasLayout.forEach((j: any, i: number) => {
      if ((viewportCategories[i] || "") !== j.tipo) store.setProductionViewportCategory(i, j.tipo);
      if (layoutCfg.escala && (viewportScales[i] || "") !== layoutCfg.escala) store.setProductionViewportScale(i, layoutCfg.escala);
    });
  }, [layoutCfg && layoutCfg.id, JSON.stringify(janelasLayout), layoutCfg && layoutCfg.escala]);

  const renderViewports = () => {
    /* Sem layout ativo não há nada na prancha — nem viewports, nem tabelas, nem carimbo. */
    if (!layoutCfg) return null;
    const renderGrid = (vpIndex: number) => {
      const category = viewportCategories[vpIndex];
      const isPlantaProject = category?.toLowerCase().includes("planta") && viewportBaseAlignments[vpIndex];
      const gridSetting = viewportGrids[vpIndex] === "Ligar";
      return gridSetting && !isPlantaProject ? (
        <div className="absolute inset-0 grid grid-cols-12 grid-rows-12 gap-0 opacity-10 pointer-events-none">
          {Array.from({ length: 144 }).map((_, i) => (
            <div key={i} className="border border-slate-900/20" />
          ))}
        </div>
      ) : null
    };

    const renderNorth = (vpIndex: number) => {
      const northSetting = viewportNorths[vpIndex];
      if (!northSetting || northSetting === "Sem símbolo") return null;
      
      const category = viewportCategories[vpIndex]?.toLowerCase() || "viewport planta";
      let angleDeg = 0;
      if (category.includes("planta")) {
         const pageInfo = alignmentPages[currentPage - 1];
         if (pageInfo) {
           angleDeg = (pageInfo.angle * 180) / Math.PI;
         }
      }
      
      let northSvg = null;
      if (northSetting === "Símbolo 1") {
        northSvg = (
          <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <text x="50" y="35" fontSize="40" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle" fill="black">N</text>
            <path d="M 50 45 L 20 115 L 50 95 L 80 115 Z" fill="black" />
          </svg>
        );
      } else if (northSetting === "Símbolo 2") {
        northSvg = (
          <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <text x="50" y="25" fontSize="24" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle" fill="black">N</text>
            <path d="M 50 35 L 58 62 L 85 70 L 58 78 L 50 105 L 42 78 L 15 70 L 42 62 Z" fill="white" stroke="black" strokeWidth="3" transform="rotate(45, 50, 70)" strokeLinejoin="round" />
            <path d="M 50 30 L 58 62 L 90 70 L 58 78 L 50 110 L 42 78 L 10 70 L 42 62 Z" fill="#777777" stroke="black" strokeWidth="3" strokeLinejoin="round" />
          </svg>
        );
      } else if (northSetting === "Símbolo 3") {
        northSvg = (
          <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <text x="50" y="35" fontSize="40" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle" fill="black">N</text>
            <path d="M 50 45 L 20 115 L 50 95 Z" fill="white" stroke="black" strokeWidth="2" strokeLinejoin="round" />
            <path d="M 50 45 L 80 115 L 50 95 Z" fill="black" stroke="black" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        );
      } else {
        northSvg = <span className="font-bold text-black text-xl">N</span>;
      }

      return (
        <div className="absolute top-4 right-4 w-12 h-14 pointer-events-none z-20" style={{ transform: `rotate(${angleDeg}deg)` }}>
          {northSvg}
        </div>
      );
    };

    const renderTables = () => {
      const tables = store.productionTables || [];

      return (
        <>
          {tables.map((tbl, idx) => {
            const isSelected = selectedViewport === tbl.id;
            const isAlignmentTable = tbl.type === "alignment" || tbl.type === "curves";
            const isAccelTable = tbl.type === "accel";
            const isDecelTable = tbl.type === "decel";
            const isFaixaTable = isAccelTable || isDecelTable;
            const isNFTable = tbl.type === "nf";
            const isCurvesTable = isAlignmentTable;

            const targetAlignment = (store.alignments || []).find((a: any) => a.id === tbl.alignmentId) ||
              (store.alignments || []).find((a: any) => a.id === store.productionActiveAlignment) ||
              (store.alignments || []).find((a: any) => a.id === store.activeAlignmentId) ||
              (store.alignments || [])[0];
            const allHorizontalElements = computeHorizontalElements(targetAlignment?.keyPoints?.length ? targetAlignment.keyPoints : targetAlignment?.points || []);
            const pageInfo = alignmentPages[currentPage - 1];
            const horizontalElements = (pageInfo && pageInfo.endStation > pageInfo.startStation)
              ? filterHorizontalElementsForStationRange(allHorizontalElements, pageInfo.startStation, pageInfo.endStation)
              : allHorizontalElements;

            /* FAIXA DE ACELERAÇÃO / DESACELERAÇÃO — tudo amarrado ao ALINHAMENTO
             * da tabela: a interseção usada é a que tem esse alinhamento como
             * ramo (ou, na falta, como rodovia principal). Cada tabela da folha
             * pode apontar para um alinhamento diferente. */
            const tblAlignId = targetAlignment?.id;
            const faixaInt = (store.intersections || []).find((i: any) => i.branchAlignmentId === tblAlignId)
              || (store.intersections || []).find((i: any) => i.mainAlignmentId === tblAlignId)
              || (store.intersections || []).find((i: any) => i.id === (tbl as any).intersectionId);
            const faixaRamo = (store.alignments || []).find((a: any) => a.id === faixaInt?.branchAlignmentId);
            const faixaRamoNome = (targetAlignment?.name || faixaRamo?.name || faixaInt?.name || "RAMO").toUpperCase();
            const faixaMain = (store.alignments || []).find((a: any) => a.id === faixaInt?.mainAlignmentId);

            const faixaL = isDecelTable ? faixaInt?.decelL : faixaInt?.accelL;
            const faixaT = isDecelTable ? faixaInt?.decelT : faixaInt?.accelT;

            /* Rampa média no trecho da faixa, medida no perfil da rodovia, no
             * sentido do tráfego (desaceleração vem antes do nariz). */
            const rampaMedia = (() => {
              if (!faixaInt || !faixaMain || typeof faixaMain.getElevationAtStation !== "function") return null;
              const ext = (faixaL || 0) + (faixaT || 0);
              if (!(ext > 0)) return null;
              const staA = isDecelTable ? faixaInt.mainStation - ext : faixaInt.mainStation;
              const staB = isDecelTable ? faixaInt.mainStation : faixaInt.mainStation + ext;
              const eA = faixaMain.getElevationAtStation(staA);
              const eB = faixaMain.getElevationAtStation(staB);
              if (!isFinite(eA) || !isFinite(eB) || (eA === 0 && eB === 0)) return null;
              return ((eB - eA) / ext) * 100;
            })();

            const fmtSigned = (v: number) => `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(1).replace(".", ",")}`;
            const fmtMetros = (v: number | undefined) =>
              v === undefined || v === null ? "-" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const fmtCoordDER = (v: number) =>
              v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

            /* NARIZES FÍSICOS — ponta truncada na largura nominal DER-SP
             * (2,00 entrada · 1,00 saída · 1,50 misto): offset dos bordos,
             * cruzamento = NF, trecho girado (ver narizFisicoCached). */
            const tipoNarizPadrao = ((tbl as any).tipoNariz ?? (faixaInt as any)?.tipoNariz ?? "entrada") as "entrada" | "saida" | "misto";
            const nfRows: string[][] = isNFTable
              ? Object.values((store.intersectionNTs || {}) as Record<string, any[]>)
                  .flat()
                  .filter((nt: any) => {
                    const k = narizKey(nt);
                    const e = (store as any).ntEscolhas?.[k];
                    const ativo = e === "sim" || (e !== "nao" && nt.sugerido !== false);
                    if (!ativo) return false;
                    // só os narizes da rodovia escolhida para ESTA tabela
                    if (!tblAlignId || (!nt.raizA && !nt.raizB)) return true;
                    return nt.raizA === tblAlignId || nt.raizB === tblAlignId;
                  })
                  .sort((a: any, b: any) => a.x - b.x || a.y - b.y)
                  .map((nt: any) => {
                    const k = narizKey(nt);
                    const tipo = ((store as any).ntTipos?.[k] ?? tipoNarizPadrao) as "entrada" | "saida" | "misto";
                    const par = (store as any).ntParams?.[k] || {};
                    const bordos = (store as any).ntBordos || {};
                    /* MESMA construção da planta (janela + cache), para tabela e
                     * desenho nunca divergirem. */
                    const ints = (store as any).intersections || [];
                    const raizPista = new Set(ints.map((it: any) => it.mainAlignmentId));
                    const idPista = nt.raizA && raizPista.has(nt.raizA) ? nt.armA
                      : nt.raizB && raizPista.has(nt.raizB) ? nt.armB : nt.armB;
                    const g = narizFisicoCached(
                      nt, bordos, idPista,
                      LARGURA_NARIZ_FISICO[tipo],
                      par.offset ?? OFFSET_BORDO_NARIZ,
                      par.comprimento ?? COMPR_NARIZ_FISICO,
                    );
                    const f = g ? g.nf : { x: nt.x, y: nt.y };
                    /* O rótulo é o MESMO do desenho (rotuloNF do id do nariz),
                       nunca a posição na lista: a etiqueta da planta é a chave
                       de leitura da tabela, e numerar por ordem de X fazia o
                       mesmo nariz ser NF-02 na planta e NF01 aqui. */
                    return [rotuloNF(nt.id), fmtCoordDER(f.x), fmtCoordDER(f.y)];
                  })
              : [];

            /* Colunas/linhas das tabelas simples (faixas e narizes). */
            const simpleCols: { label: string; w: number }[] = isFaixaTable
              ? [
                  { label: "Vel. Rodovia\n(km/h)", w: DEFAULT_FAIXA_COL_WIDTHS_CM[0] },
                  { label: "Vel. Conversão\n(km/h)", w: DEFAULT_FAIXA_COL_WIDTHS_CM[1] },
                  { label: "Rampa\nMédia (i%)", w: DEFAULT_FAIXA_COL_WIDTHS_CM[2] },
                  { label: "Fator de\nConversão", w: DEFAULT_FAIXA_COL_WIDTHS_CM[3] },
                  { label: "Faixa\nAcel./Desac. (m)", w: DEFAULT_FAIXA_COL_WIDTHS_CM[4] },
                  { label: 'Compr.\n"Taper" (m)', w: DEFAULT_FAIXA_COL_WIDTHS_CM[5] },
                ]
              : isNFTable
              ? [
                  { label: "ID", w: DEFAULT_NF_COL_WIDTHS_CM[0] },
                  { label: "X\n(m)", w: DEFAULT_NF_COL_WIDTHS_CM[1] },
                  { label: "Y\n(m)", w: DEFAULT_NF_COL_WIDTHS_CM[2] },
                ]
              : [];

            const simpleRows: string[][] = isFaixaTable
              ? (faixaInt
                  ? [[
                      String(faixaInt.mainSpeed ?? 80),
                      String(faixaInt.branchSpeed ?? 20),
                      rampaMedia === null ? "-" : fmtSigned(rampaMedia),
                      (() => {
                        const f = fatorConversaoDNIT(
                          isDecelTable ? "Desaceleração" : "Aceleração",
                          rampaMedia,
                          faixaInt.mainSpeed ?? 80,
                        );
                        return f === null ? "-" : f.toFixed(2).replace(".", ",");
                      })(),
                      fmtMetros(faixaL),
                      fmtMetros(faixaT),
                    ]]
                  : [])
              : nfRows;

            const simpleEmptyMsg = isFaixaTable
              ? "Nenhuma interseção com faixa de mudança de velocidade"
              : "Nenhum nariz confirmado no projeto";

            const defaultTitle = isAlignmentTable
              ? `TABELA DE ALINHAMENTO HORIZONTAL - ${(targetAlignment?.name || "EIXO 1").toUpperCase()}`
              : isAccelTable
              ? `FAIXA DE ACELERAÇÃO - ${faixaRamoNome}`
              : isDecelTable
              ? `FAIXA DE DESACELERAÇÃO - ${faixaRamoNome}`
              : isNFTable
              ? "TABELA DE NARIZES FÍSICOS"
              : (tbl.title || `Tabela ${idx + 1}`);
            const tableTitle = tbl.customTitle !== undefined && tbl.customTitle.trim() !== "" ? tbl.customTitle : defaultTitle;

            const parsedCustom = tbl.customLines && tbl.customLines.trim() ? parseMarkdownTableLines(tbl.customLines) : null;
            const hasCustomContent = !!(parsedCustom && parsedCustom.headers && parsedCustom.headers.length > 0);

            // Exact font sizes in centimeters defined by user
            const cellFontSizeCm = tbl.fontSizeCm ?? (tbl.fontSize ? Number((tbl.fontSize / 10).toFixed(2)) : 0.25);
            const headerFontSizeCm = tbl.headerFontSizeCm ?? (tbl.headerFontSize ? Number((tbl.headerFontSize / 10).toFixed(2)) : Number((cellFontSizeCm * 1.15).toFixed(2)));
            const titleFontSizeCm = tbl.titleFontSizeCm ?? (tbl.titleFontSize ? Number((tbl.titleFontSize / 10).toFixed(2)) : 0.35);

            // In sheet canvas coordinates (1 unit = 1mm = 0.1cm): cm * 10 = mm
            const titleFontSize = Number((titleFontSizeCm * 10).toFixed(2));
            const headerFontSize = Number((headerFontSizeCm * 10).toFixed(2));
            const cellFontSize = Number((cellFontSizeCm * 10).toFixed(2));

            const headerRowHeightMm = tbl.headerRowHeightCm !== undefined
              ? Number((tbl.headerRowHeightCm * 10).toFixed(2))
              : Math.max(headerFontSize * 1.6, 7.0);

            const dataRowHeightMm = tbl.rowHeightCm !== undefined
              ? Number((tbl.rowHeightCm * 10).toFixed(2))
              : Math.max(cellFontSize * 1.6, 6.0);

            const colWidthsCm = tbl.columnWidthsCm;
            const defaultColWidthMm = tbl.defaultColWidthCm !== undefined ? tbl.defaultColWidthCm * 10 : undefined;

            const getCustomColWidthMm = (cIdx: number) => {
              if (colWidthsCm && colWidthsCm[cIdx] !== undefined) {
                return colWidthsCm[cIdx] * 10;
              }
              return defaultColWidthMm;
            };

            const getCurvesColWidthMm = (cIdx: number) => {
              if (colWidthsCm && colWidthsCm[cIdx] !== undefined) {
                return colWidthsCm[cIdx] * 10;
              }
              if (DEFAULT_CURVES_COL_WIDTHS_CM[cIdx] !== undefined) {
                return DEFAULT_CURVES_COL_WIDTHS_CM[cIdx] * 10;
              }
              return defaultColWidthMm || 20;
            };

            /* A tabela tem largura própria = soma das colunas definidas pelo
             * utilizador. Esticar a janela deixa espaço sobrando; nunca
             * redimensiona coluna nem linha. */
            const colFallbackMm = defaultColWidthMm || 20;
            const simpleTotalWmm = simpleCols.reduce(
              (a, col, i) => a + (colWidthsCm && colWidthsCm[i] !== undefined ? colWidthsCm[i] : col.w) * 10,
              0,
            );
            const customTotalWmm = parsedCustom
              ? parsedCustom.headers.reduce((a: number, _h: any, i: number) => a + (getCustomColWidthMm(i) ?? colFallbackMm), 0)
              : 0;
            const curvesTotalWmm = Array.from({ length: 15 }, (_, i) => getCurvesColWidthMm(i) || colFallbackMm)
              .reduce((a, b) => a + b, 0);

            const headerPad = `${Math.max(0.5, headerFontSize * 0.2)}px ${Math.max(0.8, headerFontSize * 0.4)}px`;
            const cellPad = `${Math.max(0.4, cellFontSize * 0.18)}px ${Math.max(0.6, cellFontSize * 0.35)}px`;

            const fontFamily = tbl.fontFamily || "Arial, Helvetica, sans-serif";
            const textColor = tbl.textColor || "#0f172a";
            const titleColor = tbl.titleColor || "#0f172a";
            const titleBgColor = tbl.titleBgColor || "#ffffff";
            const headerColor = tbl.headerColor || "#0f172a";
            const headerBgColor = tbl.headerBgColor || "#ffffff";
            const borderColor = tbl.borderColor || "#000000";
            /* Traço fino de desenho técnico: a folha é 1 unidade = 1 mm, então
             * a borda de 1px do CSS daria 1 mm — grossa demais. */
            const gridW = `${(tbl as any).gridLineWidthMm ?? 0.2}px`;
            const frameW = `${(tbl as any).frameLineWidthMm ?? 0.35}px`;

            if (isAlignmentTable || isFaixaTable || isNFTable || hasCustomContent) {
              return (
                <Rnd
                  disableDragging={isSpaceDown}
                  scale={zoom}
                  key={`table-${tbl.id}-${layout}-${sheetSize}-${orientation}`}
                  position={{ x: tbl.x, y: tbl.y }}
                  /* A janela veste a tabela: largura = soma das colunas, altura =
                   * soma das linhas (definidas em Editar Conteúdo). Por isso NÃO
                   * é redimensionável — esticar a janela deformaria a tabela. */
                  size={{ width: "auto", height: "auto" }}
                  bounds="parent"
                  enableResizing={false}
                  onMouseDown={() => setSelectedViewport(tbl.id)}
                  onDragStart={() => setSelectedViewport(tbl.id)}
                  onDragStop={(e, d) => {
                    store.updateProductionTable(tbl.id, { x: Math.round(d.x), y: Math.round(d.y) });
                  }}
                  style={{ fontFamily, ...frameStyle(tbl.id) }}
                  data-frame-mm={frameOf(tbl.id).style === "none" ? 0 : frameOf(tbl.id).widthMm}
                  data-grid-mm={(tbl as any).gridLineWidthMm ?? 0.2}
                  className={`bg-white inline-flex flex-col cursor-move shadow-md text-slate-800 select-none w-fit h-fit ${
                    isSelected ? "border-blue-600 ring-2 ring-blue-500/50 z-[300]" : "border-slate-800/40 hover:border-slate-600"
                  }`}
                >
                  <span data-vec-marker="table" style={{ display: "none" }} />

                  {/* O título é a PRIMEIRA LINHA de cada tabela (mesma largura,
                   * mesmas bordas e mesma tipografia das demais linhas) — por isso
                   * é renderizado dentro do <table>, não como faixa do contêiner. */}
                  <div className="bg-white w-fit">
                    <div>
                    {hasCustomContent && parsedCustom ? (
                      <table className="border-collapse text-center border whitespace-nowrap" style={{ borderColor, borderWidth: gridW, tableLayout: "fixed", width: `${customTotalWmm}px`, minWidth: `${customTotalWmm}px` }} data-grid-mm={(tbl as any).gridLineWidthMm ?? 0.2}>
                        <thead>
                          <tr style={{ backgroundColor: titleBgColor, color: titleColor, borderColor, borderWidth: gridW }}>
                            <th
                              colSpan={parsedCustom.headers.length}
                              style={{
                                fontSize: `${titleFontSize}px`,
                                borderColor, borderWidth: gridW,
                                padding: `${Math.max(0.6, titleFontSize * 0.25)}px ${Math.max(1.2, titleFontSize * 0.5)}px`,
                                lineHeight: 1.15, verticalAlign: "middle", textAlign: "center",
                              }}
                              className="font-bold text-center uppercase tracking-wide select-none"
                            >{tableTitle}</th>
                          </tr>
                        </thead>
                        <thead>
                          <tr className="font-bold border-b text-center" style={{ backgroundColor: headerBgColor, color: headerColor, borderColor, borderWidth: gridW, height: `${headerRowHeightMm}px` }}>
                            {parsedCustom.headers.map((h, hIdx) => {
                              const colWMm = getCustomColWidthMm(hIdx);
                              return (
                                <th 
                                  key={hIdx} 
                                  style={{ 
                                    fontSize: `${headerFontSize}px`, 
                                    borderColor, borderWidth: gridW, 
                                    padding: headerPad, 
                                    lineHeight: 1.15, verticalAlign: "middle", textAlign: "center",
                                    height: `${headerRowHeightMm}px`, maxHeight: `${headerRowHeightMm}px`, overflow: "hidden",
                                    width: `${colWMm ?? colFallbackMm}px`,
                                    minWidth: `${colWMm ?? colFallbackMm}px`,
                                    maxWidth: `${colWMm ?? colFallbackMm}px`
                                  }}
                                  className="border font-bold"
                                >
                                  {h}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {parsedCustom.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="bg-white" style={{ borderColor, borderWidth: gridW, height: `${dataRowHeightMm}px` }}>
                              {row.map((cell, cIdx) => {
                                const colWMm = getCustomColWidthMm(cIdx);
                                return (
                                  <td 
                                    key={cIdx} 
                                    style={{ 
                                      fontSize: `${cellFontSize}px`, 
                                      color: textColor, 
                                      borderColor, borderWidth: gridW, 
                                      padding: cellPad, 
                                      lineHeight: 1.15, verticalAlign: "middle", textAlign: "center",
                                      height: `${dataRowHeightMm}px`, maxHeight: `${dataRowHeightMm}px`, overflow: "hidden",
                                      width: `${colWMm ?? colFallbackMm}px`,
                                    minWidth: `${colWMm ?? colFallbackMm}px`,
                                    maxWidth: `${colWMm ?? colFallbackMm}px`
                                    }}
                                    className="border text-center select-none"
                                  >
                                    {cell.split(/<br\s*\/?>|\n/gi).map((part, pIdx) => (
                                      <React.Fragment key={pIdx}>
                                        {pIdx > 0 && <br />}
                                        {part}
                                      </React.Fragment>
                                    ))}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : isAlignmentTable ? (
                      <table className="border-collapse text-center border whitespace-nowrap" style={{ borderColor, borderWidth: gridW, tableLayout: "fixed", width: `${curvesTotalWmm}px`, minWidth: `${curvesTotalWmm}px` }} data-grid-mm={(tbl as any).gridLineWidthMm ?? 0.2}>
                        <thead>
                          <tr style={{ backgroundColor: titleBgColor, color: titleColor, borderColor, borderWidth: gridW }}>
                            <th
                              colSpan={15}
                              style={{
                                fontSize: `${titleFontSize}px`,
                                borderColor, borderWidth: gridW,
                                padding: `${Math.max(0.6, titleFontSize * 0.25)}px ${Math.max(1.2, titleFontSize * 0.5)}px`,
                                lineHeight: 1.15, verticalAlign: "middle", textAlign: "center",
                              }}
                              className="font-bold text-center uppercase tracking-wide select-none"
                            >{tableTitle}</th>
                          </tr>
                        </thead>
                        <thead>
                          <tr className="font-bold border-b text-center" style={{ backgroundColor: headerBgColor, color: headerColor, borderColor, borderWidth: gridW, height: `${headerRowHeightMm}px` }}>
                            {[
                              { label: "Nº", align: "center" },
                              { label: "DEFLEXÃO/\nAZIMUTE", align: "center" },
                              { label: "LC\n(m)", align: "right" },
                              { label: "TT\n(m)", align: "right" },
                              { label: "TL\n(m)", align: "right" },
                              { label: "TC\n(m)", align: "right" },
                              { label: "R\n(m)", align: "right" },
                              { label: "D/L\n(m)", align: "right" },
                              { label: "AC", align: "center" },
                              { label: "TE-PC", align: "center" },
                              { label: "ET-PT", align: "center" },
                              { label: "PONTO", align: "center" },
                              { label: "PI", align: "center" },
                              { label: "TE-PC", align: "center" },
                              { label: "ET-PT", align: "center" }
                            ].map((headerItem, hIdx) => {
                              const colWMm = getCurvesColWidthMm(hIdx);
                              return (
                                <th 
                                  key={hIdx}
                                  style={{ 
                                    fontSize: `${headerFontSize}px`, 
                                    borderColor, borderWidth: gridW, 
                                    padding: headerPad, 
                                    lineHeight: 1.15, verticalAlign: "middle", textAlign: "center",
                                    height: `${headerRowHeightMm}px`, maxHeight: `${headerRowHeightMm}px`, overflow: "hidden",
                                    width: `${colWMm}px`,
                                    minWidth: `${colWMm}px`,
                                    maxWidth: `${colWMm}px`
                                  }} 
                                  className="border font-bold text-center"
                                >
                                  {headerItem.label.split("\n").map((part, pIdx) => (
                                    <React.Fragment key={pIdx}>
                                      {pIdx > 0 && <br />}
                                      {part}
                                    </React.Fragment>
                                  ))}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {horizontalElements.length === 0 && (
                            <tr style={{ borderColor, borderWidth: gridW, height: `${dataRowHeightMm}px` }}>
                              <td
                                colSpan={15}
                                style={{ fontSize: `${cellFontSize}px`, color: textColor, borderColor, borderWidth: gridW, padding: cellPad, lineHeight: 1.15 }}
                                className="text-center italic select-none"
                              >
                                Nenhum alinhamento horizontal definido no projeto
                              </td>
                            </tr>
                          )}
                          {horizontalElements.map((row, rIdx) => {
                            const lcStr = row.type === "Espiral" && row.lc !== undefined ? formatDecimal3(row.lc) : "-";
                            const tcStr = row.type === "Espiral" && row.tc !== undefined ? formatDecimal3(row.tc) : "-";
                            const ttStr = row.type === "Curva Circular" && row.tt !== undefined ? formatDecimal3(row.tt) : "-";
                            const tlStr = row.type === "Espiral" && row.tl !== undefined ? formatDecimal3(row.tl) : "-";
                            const raioStr = row.type === "Curva Circular" && row.raio !== undefined ? formatDecimal3(row.raio) : "-";

                            /* Coordenadas no padrão DER: 4 decimais, vírgula. */
                            const fmtXY = (v: number) =>
                              !isFinite(v) ? "-" : v.toFixed(4).replace(".", ",");
                            const coordPI = row.coordPI || row.coordStart;

                            const cells = [
                              { val: row.num, align: "center", fontBold: true },
                              { val: row.deflexaoAzimute, align: "center" },
                              { val: lcStr, align: "right" },
                              { val: ttStr, align: "right" },
                              { val: tlStr, align: "right" },
                              { val: tcStr, align: "right" },
                              { val: raioStr, align: "right" },
                              { val: formatDecimal3(row.dl), align: "right", fontBold: true },
                              { val: row.ac, align: "center" },
                              { val: formatEstaca(row.staStart), align: "center" },
                              { val: formatEstaca(row.staEnd), align: "center" },
                              { val: "Y<br/>X", align: "center", isHtml: true, fontBold: true },
                              { val: `${fmtXY(coordPI.y)}<br/>${fmtXY(coordPI.x)}`, align: "center", isHtml: true },
                              { val: `${fmtXY(row.coordStart.y)}<br/>${fmtXY(row.coordStart.x)}`, align: "center", isHtml: true },
                              { val: `${fmtXY(row.coordEnd.y)}<br/>${fmtXY(row.coordEnd.x)}`, align: "center", isHtml: true }
                            ];

                            return (
                              <tr key={rIdx} className="bg-white" style={{ borderColor, borderWidth: gridW, height: `${dataRowHeightMm}px` }}>
                                {cells.map((cellItem, cIdx) => {
                                  const colWMm = getCurvesColWidthMm(cIdx);
                                  return (
                                    <td 
                                      key={cIdx} 
                                      style={{ 
                                        fontSize: `${cellFontSize}px`, 
                                        color: textColor, 
                                        borderColor, borderWidth: gridW, 
                                        padding: cellPad, 
                                        lineHeight: 1.15, verticalAlign: "middle", textAlign: "center",
                                        height: `${dataRowHeightMm}px`, maxHeight: `${dataRowHeightMm}px`, overflow: "hidden",
                                        width: `${colWMm}px`,
                                        minWidth: `${colWMm}px`,
                                        maxWidth: `${colWMm}px`
                                      }} 
                                      className={`border select-none text-center ${cellItem.fontBold ? "font-bold" : ""}`}
                                    >
                                      {cellItem.isHtml ? (
                                        typeof cellItem.val === "string" ? (
                                          cellItem.val.split(/<br\s*\/?>|\n/gi).map((part, pIdx) => (
                                            <React.Fragment key={pIdx}>
                                              {pIdx > 0 && <br />}
                                              {part}
                                            </React.Fragment>
                                          ))
                                        ) : cellItem.val
                                      ) : (
                                        cellItem.val
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <table className="border-collapse text-center border whitespace-nowrap" style={{ borderColor, borderWidth: gridW, tableLayout: "fixed", width: `${simpleTotalWmm}px`, minWidth: `${simpleTotalWmm}px` }} data-grid-mm={(tbl as any).gridLineWidthMm ?? 0.2}>
                        <thead>
                          <tr style={{ backgroundColor: titleBgColor, color: titleColor, borderColor, borderWidth: gridW }}>
                            <th
                              colSpan={Math.max(1, simpleCols.length)}
                              style={{
                                fontSize: `${titleFontSize}px`,
                                borderColor, borderWidth: gridW,
                                padding: `${Math.max(0.6, titleFontSize * 0.25)}px ${Math.max(1.2, titleFontSize * 0.5)}px`,
                                lineHeight: 1.15, verticalAlign: "middle", textAlign: "center",
                              }}
                              className="font-bold text-center uppercase tracking-wide select-none"
                            >{tableTitle}</th>
                          </tr>
                        </thead>
                        <thead>
                          <tr className="font-bold border-b text-center" style={{ backgroundColor: headerBgColor, color: headerColor, borderColor, borderWidth: gridW, height: `${headerRowHeightMm}px` }}>
                            {simpleCols.map((col, hIdx) => {
                              const colWMm = (colWidthsCm && colWidthsCm[hIdx] !== undefined ? colWidthsCm[hIdx] : col.w) * 10;
                              return (
                                <th
                                  key={hIdx}
                                  style={{
                                    fontSize: `${headerFontSize}px`,
                                    borderColor,
                                    padding: headerPad,
                                    lineHeight: 1.15, verticalAlign: "middle", textAlign: "center",
                                    height: `${headerRowHeightMm}px`, maxHeight: `${headerRowHeightMm}px`, overflow: "hidden",
                                    width: `${colWMm}px`,
                                    minWidth: `${colWMm}px`,
                                    maxWidth: `${colWMm}px`
                                  }}
                                  className="border font-bold text-center"
                                >
                                  {col.label.split("\n").map((part, pIdx) => (
                                    <React.Fragment key={pIdx}>
                                      {pIdx > 0 && <br />}
                                      {part}
                                    </React.Fragment>
                                  ))}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {simpleRows.length === 0 && (
                            <tr style={{ borderColor, borderWidth: gridW, height: `${dataRowHeightMm}px` }}>
                              <td
                                colSpan={Math.max(1, simpleCols.length)}
                                style={{ fontSize: `${cellFontSize}px`, color: textColor, borderColor, borderWidth: gridW, padding: cellPad, lineHeight: 1.15 }}
                                className="text-center italic select-none"
                              >
                                {simpleEmptyMsg}
                              </td>
                            </tr>
                          )}
                          {simpleRows.map((row, rIdx) => (
                            <tr key={rIdx} className="bg-white" style={{ borderColor, borderWidth: gridW, height: `${dataRowHeightMm}px` }}>
                              {row.map((cell, cIdx) => {
                                const colWMm = (colWidthsCm && colWidthsCm[cIdx] !== undefined ? colWidthsCm[cIdx] : (simpleCols[cIdx]?.w || 2)) * 10;
                                return (
                                  <td
                                    key={cIdx}
                                    style={{
                                      fontSize: `${cellFontSize}px`,
                                      color: textColor,
                                      borderColor,
                                      padding: cellPad,
                                      lineHeight: 1.15, verticalAlign: "middle", textAlign: "center",
                                      height: `${dataRowHeightMm}px`, maxHeight: `${dataRowHeightMm}px`, overflow: "hidden",
                                      width: `${colWMm}px`,
                                      minWidth: `${colWMm}px`,
                                      maxWidth: `${colWMm}px`
                                    }}
                                    className="border text-center select-none"
                                  >
                                    {cell}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    </div>
                  </div>
                </Rnd>
              );
            }

            const labelText = tbl.type === "sections" ? "Tabela de Dados\n(Cota / Distância)" :
                             tbl.type === "volumes" ? "Tabela de Volumes\n(Corte / Aterro)" :
                             tbl.type === "coordinates" ? "Tabela de Coordenadas\n(UTM / SIRGAS)" :
                             tableTitle;

            return (
              <Rnd
                disableDragging={isSpaceDown}
                scale={zoom}
                key={`table-${tbl.id}-${layout}-${sheetSize}-${orientation}`}
                position={{ x: tbl.x, y: tbl.y }}
                size={{ width: tbl.w, height: tbl.h }}
                bounds="parent"
                enableResizing={{
                  top: true,
                  right: true,
                  bottom: true,
                  left: true,
                  topRight: true,
                  bottomRight: true,
                  bottomLeft: true,
                  topLeft: true,
                }}
                resizeHandleStyles={{
                  bottomRight: { width: '14px', height: '14px', right: '-4px', bottom: '-4px', zIndex: 10 },
                  bottomLeft: { width: '14px', height: '14px', left: '-4px', bottom: '-4px', zIndex: 10 },
                  topRight: { width: '14px', height: '14px', right: '-4px', top: '-4px', zIndex: 10 },
                  topLeft: { width: '14px', height: '14px', left: '-4px', top: '-4px', zIndex: 10 },
                  right: { width: '10px', right: '-5px', zIndex: 9 },
                  left: { width: '10px', left: '-5px', zIndex: 9 },
                  top: { height: '10px', top: '-5px', zIndex: 9 },
                  bottom: { height: '10px', bottom: '-5px', zIndex: 9 },
                }}
                onMouseDown={() => setSelectedViewport(tbl.id)}
                onDragStart={() => setSelectedViewport(tbl.id)}
                onDragStop={(e, d) => {
                  store.updateProductionTable(tbl.id, { x: Math.round(d.x), y: Math.round(d.y) });
                }}
                onResizeStop={(e, direction, ref, delta, position) => {
                  store.updateProductionTable(tbl.id, {
                    w: Math.round(parseInt(ref.style.width, 10)),
                    h: Math.round(parseInt(ref.style.height, 10)),
                    ...(position ? { x: Math.round(position.x), y: Math.round(position.y) } : {})
                  });
                }}
                className={`border-2 bg-white/90 flex flex-col items-center justify-between text-xs text-slate-800 cursor-move shadow-sm p-1.5 select-none overflow-hidden ${
                  isSelected ? "border-blue-600 ring-2 ring-blue-500/50 z-[300]" : "border-slate-800/30 hover:border-slate-600"
                }`}
              >
                <span data-vec-marker="table" style={{ display: "none" }} />
                {/* Visual Corner Resize Grippers when selected */}
                {isSelected && (
                  <>
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-600 border border-white rounded-xs shadow-sm z-20 pointer-events-none" />
                    <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-600 border border-white rounded-xs shadow-sm z-20 pointer-events-none" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 border border-white rounded-xs shadow-sm z-20 pointer-events-none" />
                    <div className="absolute -top-1 -left-1 w-3 h-3 bg-blue-600 border border-white rounded-xs shadow-sm z-20 pointer-events-none" />
                  </>
                )}

                <div className="font-semibold text-[11px] text-slate-800 border-b border-slate-300 pb-0.5 text-center w-full truncate bg-slate-100/90 rounded-t py-0.5 px-1">
                  {tableTitle}
                </div>
                <div className="text-[10px] text-slate-600 text-center flex-1 flex flex-col items-center justify-center p-1 w-full leading-tight font-mono">
                  {labelText.split('\n').map((line, i) => <span key={i}>{line}</span>)}
                </div>
              </Rnd>
            );
          })}
        </>
      );
    };

    const renderViewportContent = (vpIndex: number, defaultW: number, defaultH: number, suffix?: string) => {
      const vpW = viewportSizes[`${layout}-${vpIndex}`]?.w || defaultW;
      const vpH = viewportSizes[`${layout}-${vpIndex}`]?.h || defaultH;
      const category = viewportCategories[vpIndex]?.toLowerCase() || "viewport planta";

      /* BASES incluídas nesta janela. Lista vazia = desenha tudo (comportamento
       * anterior). A Produção só LÊ as bases; nunca altera o projeto. */
      const vpBaseIds = viewportBases[vpIndex] || [];
      const vpBasesSel = (store.bases || []).filter((b: any) => vpBaseIds.includes(b.id));
      const inVpBases = (kind: string, id: string) =>
        vpBasesSel.length === 0 ||
        vpBasesSel.some((b: any) => ((b.members?.[kind] as string[]) || []).includes(id));

      if (category.includes("planta") && viewportBaseAlignments[vpIndex]) {
        const alignId = viewportBaseAlignments[vpIndex];
        const alignment = store.alignments.find(a => a.id === alignId);
        if (alignment && alignment.points.length > 0) {
          const scaleStr = viewportScales[vpIndex] || "1:1000";
          let scaleFactor = 1000;
          if (scaleStr.includes(":")) {
            scaleFactor = parseInt(scaleStr.split(":")[1]) || 1000;
          }
          
          /* Sem folga: o desenho ocupa toda a janela. O viewBox tem a MESMA
           * proporção do contêiner, então "meet" não cria tarja. */
          const svgW = Math.max(1, vpW);
          const svgH = Math.max(1, vpH);
          const vbWidth = svgW * (scaleFactor / 1000);
          const vbHeight = svgH * (scaleFactor / 1000);
          
          const pageInfo = alignmentPages[currentPage - 1];
          let pathD = "";
          let cx = 0, cy = 0, angleDeg = 0;
          let drawPts: any[] = [];
          
          if (pageInfo) {
            const startSta = pageInfo.startStation;
            const endSta = pageInfo.endStation;
            const startP = getPointAt(alignment, startSta);
            
            let pts = [startP];
            for (let pt of alignment.points) {
              if (pt.sta > startSta && pt.sta < endSta) pts.push(pt);
            }
            pts.push(getPointAt(alignment, endSta));
            drawPts = pts;
            
            angleDeg = (pageInfo.angle * 180) / Math.PI;
            
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            pts.forEach(pt => {
              let rx = pt.x * Math.cos(pageInfo.angle) - pt.y * Math.sin(pageInfo.angle);
              let ry = pt.x * Math.sin(pageInfo.angle) + pt.y * Math.cos(pageInfo.angle);
              if (rx < minX) minX = rx;
              if (rx > maxX) maxX = rx;
              if (ry < minY) minY = ry;
              if (ry > maxY) maxY = ry;
            });
            
            // Check if profile bands exist to offset the plan view as well
            let bandOffsetM = 0;
            for (let i = 0; i < viewportCategories.length; i++) {
               if ((viewportCategories[i] || "").toLowerCase().includes("perfil") && (store.productionViewportProfileBands?.[i] || []).length > 0) {
                  bandOffsetM = 40 * (scaleFactor / 1000);
                  break;
               }
            }
            
            // To align with the profile viewport, we want startP to be at the left edge of the viewport (plus band offset)
            let rx_start = startP.x * Math.cos(pageInfo.angle) - startP.y * Math.sin(pageInfo.angle);
            /* A estaca inicial encosta à MARGEM, não ao bordo da moldura: a faixa
             * livre é onde vão as match lines e onde o corredor deixa de ser
             * cortado. Em altura, centra-se pela envolvente do corredor. */
            const margemM = MARGEM_MATCHLINE_MM * (scaleFactor / 1000);
            const env = envolventeRodada(alignment, startSta, endSta, pageInfo.angle, endSta - startSta);
            cx = rx_start - margemM - bandOffsetM + vbWidth / 2;
            cy = isFinite(env.maxY - env.minY) && env.maxY > env.minY
              ? (env.minY + env.maxY) / 2
              : (minY + maxY) / 2;
            
            pathD = `M ${pts.map(p => `${p.x},${p.y}`).join(' L ')}`;
          } else {
             let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
             alignment.points.forEach(p => {
               if (p.x < minX) minX = p.x;
               if (p.x > maxX) maxX = p.x;
               if (p.y < minY) minY = p.y;
               if (p.y > maxY) maxY = p.y;
             });
             cx = (minX + maxX) / 2;
             cy = (minY + maxY) / 2;
             pathD = `M ${alignment.points.map(p => `${p.x},${p.y}`).join(' L ')}`;
             drawPts = alignment.points;
          }
          
          const panAtual = vpPan[panKey(vpIndex, currentPage)] || { dx: 0, dy: 0 };
          const vbMinX = cx - vbWidth / 2 - panAtual.dx;
          const vbMinY = cy - vbHeight / 2 - panAtual.dy;
          
          let wMinX = Infinity, wMaxX = -Infinity, wMinY = Infinity, wMaxY = -Infinity;
          const corners = [
            { x: vbMinX, y: vbMinY },
            { x: vbMinX + vbWidth, y: vbMinY },
            { x: vbMinX + vbWidth, y: vbMinY + vbHeight },
            { x: vbMinX, y: vbMinY + vbHeight }
          ];
          const angleRad = pageInfo ? pageInfo.angle : 0;
          corners.forEach(c => {
            let wx = c.x * Math.cos(-angleRad) - c.y * Math.sin(-angleRad);
            let wy = c.x * Math.sin(-angleRad) + c.y * Math.cos(-angleRad);
            if (wx < wMinX) wMinX = wx;
            if (wx > wMaxX) wMaxX = wx;
            if (wy < wMinY) wMinY = wy;
            if (wy > wMaxY) wMaxY = wy;
          });

          const strokeWidth = 0.7 * (scaleFactor / 1000);
          const circleRadius = 1.0 * (scaleFactor / 1000);
          const dashArray = `${15 * scaleFactor / 1000},${5 * scaleFactor / 1000},${2 * scaleFactor / 1000},${5 * scaleFactor / 1000}`;
    
          /* MALHA DE COORDENADAS
           * Desenhada no referencial JÁ ROTACIONADO (o mesmo do viewBox), não
           * no mundo: assim cada linha é recortada exatamente na moldura da
           * janela (Liang–Barsky) e o rótulo fica encostado na borda, lido na
           * direção da própria linha. Antes as linhas iam até a caixa
           * envolvente do mundo e morriam antes dos cantos.
           */
          const gridElements: React.JSX.Element[] = [];
          const gridSetting = viewportGrids[vpIndex] === "Ligar";
          if (gridSetting) {
            const gcfg = { ...defaultGridStyle(), ...(store.productionGridStyles?.[vpIndex] || {}) };
            const gLayer = store.layers.find(l => l.id === gcfg.layerId);
            if (!gLayer || gLayer.isVisible !== false) {
            const size = Math.max(vbWidth, vbHeight);
            let step = 10;
            if (size > 5000) step = 1000;
            else if (size > 1000) step = 500;
            else if (size > 500) step = 100;
            else if (size > 100) step = 50;
            if (gcfg.spacingM > 0) step = gcfg.spacingM;

            /* mm de prancha -> unidades de mundo: fica FIXO no PDF em qualquer
             * escala ou tamanho de folha. */
            const mm = scaleFactor / 1000;
            const gridStrokeWidth = Math.max(0.01, gcfg.lineWidthMm) * mm;
            const fontSize = Math.max(0.5, gcfg.textSizeMm) * mm;
            const gridColor = gLayer?.color || gcfg.lineColor;
            const gridTextColor = gcfg.textColor;
            const gridFont = gcfg.fontFamily;
            const prefE = gcfg.labelMode === "XY" ? "X=" : "E=";
            const prefN = gcfg.labelMode === "XY" ? "Y=" : "N=";

            const ca = Math.cos(angleRad), sa = Math.sin(angleRad);
            // mundo -> referencial do viewBox (igual ao rotate(angleDeg))
            const toView = (x: number, y: number) => ({ X: x * ca - y * sa, Y: x * sa + y * ca });

            const rx0 = vbMinX, rx1 = vbMinX + vbWidth;
            const ry0 = vbMinY, ry1 = vbMinY + vbHeight;

            /* A moldura da janela é desenhada como borda do contêiner (fora do
             * <svg>, que ocupa a caixa interna). Recortar exatamente no viewBox
             * deixava uma folga de meia-espessura de traço entre o fim da linha
             * e a moldura; por isso a linha é recortada num retângulo um pouco
             * maior (o overflow hidden / clip do PDF corta o excesso), enquanto
             * o rótulo continua referenciado ao retângulo real. */
            const bleed = Math.max(gridStrokeWidth * 4, 1.0 * scaleFactor / 1000);

            /** recorta a reta P0 + t·d ao retângulo da janela (inflado por `grow`) */
            const clipToRect = (P0: {X: number, Y: number}, d: {X: number, Y: number}, grow = 0) => {
              let t0 = -Infinity, t1 = Infinity;
              const slabs: [number, number, number][] = [
                [d.X, (rx0 - grow) - P0.X, (rx1 + grow) - P0.X],
                [d.Y, (ry0 - grow) - P0.Y, (ry1 + grow) - P0.Y],
              ];
              for (const [den, lo, hi] of slabs) {
                if (Math.abs(den) < 1e-9) {
                  if (lo > 0 || hi < 0) return null; // paralela e fora
                  continue;
                }
                let a = lo / den, b = hi / den;
                if (a > b) { const tmp = a; a = b; b = tmp; }
                t0 = Math.max(t0, a);
                t1 = Math.min(t1, b);
              }
              return t1 > t0 ? { t0, t1 } : null;
            };

            const pushLine = (
              key: string, label: string,
              P0: {X: number, Y: number}, d: {X: number, Y: number},
            ) => {
              const segIn = clipToRect(P0, d);           // moldura real: base do rótulo
              const seg = clipToRect(P0, d, bleed);      // traço encosta na moldura
              if (!seg || !segIn) return;
              const A = { X: P0.X + d.X * seg.t0, Y: P0.Y + d.Y * seg.t0 };
              const B = { X: P0.X + d.X * seg.t1, Y: P0.Y + d.Y * seg.t1 };

              /* R\u00f3tulo em CADA extremidade: onde a linha entra e onde sai da
               * janela (portanto nos 4 lados), lido ao longo da linha, de cabe\u00e7a
               * para cima, acima do tra\u00e7o e com folga da moldura. */
              const textLen = label.length * fontSize * 0.7;
              const margin = fontSize * 3.0;
              const texts: React.JSX.Element[] = [];
              if (segIn.t1 - segIn.t0 > textLen * 2 + margin * 3) {
                ([[segIn.t0, 1], [segIn.t1, -1]] as [number, number][]).forEach(([tStart, sIn], i) => {
                  let rot = (Math.atan2(d.Y * sIn, d.X * sIn) * 180) / Math.PI;
                  let readsInward = true;
                  if (rot > 90 || rot < -90) { rot += 180; readsInward = false; }
                  const rr = (rot * Math.PI) / 180;
                  const tBase = tStart + sIn * (readsInward ? margin : margin + textLen);
                  // glifos crescem para -y local: base deslocada para o lado de cima
                  const ux = Math.sin(rr), uy = -Math.cos(rr);
                  const Lx = P0.X + d.X * tBase + ux * fontSize * 0.35;
                  const Ly = P0.Y + d.Y * tBase + uy * fontSize * 0.35;
                  texts.push(
                    <text
                      key={`t${i}`}
                      x={Lx}
                      y={Ly}
                      fontSize={fontSize}
                      fontFamily={gridFont}
                      fill={gridTextColor}
                      textAnchor="start"
                      transform={`rotate(${rot} ${Lx} ${Ly})`}
                    >{label}</text>
                  );
                });
              }

              gridElements.push(
                <g key={key}>
                  <line x1={A.X} y1={A.Y} x2={B.X} y2={B.Y} stroke={gridColor} strokeWidth={gridStrokeWidth} />
                  {texts}
                </g>
              );
            };

            const fmt = (v: number) =>
              v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

            // margem generosa: o recorte descarta o que sobra
            const pad = Math.hypot(vbWidth, vbHeight);
            const startX = Math.floor((wMinX - pad) / step) * step;
            const endX = Math.ceil((wMaxX + pad) / step) * step;
            const startY = Math.floor((wMinY - pad) / step) * step;
            const endY = Math.ceil((wMaxY + pad) / step) * step;
            const maxLinhas = 400;

            let n = 0;
            for (let x = startX; x <= endX && n < maxLinhas; x += step, n++) {
              pushLine(`gx-${x}`, `${prefE}${fmt(x)}`, toView(x, 0), { X: -sa, Y: ca });
            }
            n = 0;
            for (let y = startY; y <= endY && n < maxLinhas; y += step, n++) {
              pushLine(`gy-${y}`, `${prefN}${fmt(y)}`, toView(0, y), { X: ca, Y: sa });
            }
            }
          }

          const estacasElements: React.JSX.Element[] = [];
          const keyPointElements: React.JSX.Element[] = [];
          
          let localStartSta = 0;
          let localEndSta = alignment.points[alignment.points.length - 1].sta;
          if (pageInfo) {
            localStartSta = pageInfo.startStation;
            localEndSta = pageInfo.endStation;
          }
          
          const tickLen = 5 * scaleFactor / 1000; 
          const textOffset = 8 * scaleFactor / 1000; 
          const fontSize = 2.5 * scaleFactor / 1000; 
          const kpFontSize = 2.0 * scaleFactor / 1000; 
          
          const firstEstaca = Math.ceil(localStartSta / 20) * 20;
          for (let s = firstEstaca; s <= localEndSta; s += 20) {
            const pa = getPointAt(alignment, s);
            const estacaNum = Math.round(s / 20);
            const isMultipleOf5 = estacaNum % 5 === 0;
            const dx = Math.cos(pa.angle + Math.PI / 2);
            const dy = Math.sin(pa.angle + Math.PI / 2);
            
            estacasElements.push(
              <line 
                key={`tick-${s}`}
                x1={pa.x - dx * tickLen/2} 
                y1={pa.y - dy * tickLen/2} 
                x2={pa.x + dx * tickLen/2} 
                y2={pa.y + dy * tickLen/2} 
                stroke={alignment.color || "#ef4444"} 
                strokeWidth={strokeWidth * 0.5} 
              />
            );
            
            if (isMultipleOf5 || s === firstEstaca) {
               let angleDegText = (pa.angle * 180 / Math.PI) + 90;
               // Ensure text is right-side up
               if (angleDegText > 90 && angleDegText < 270) {
                 angleDegText -= 180;
               }
               estacasElements.push(
                 <text
                   key={`text-${s}`}
                   x={pa.x + dx * textOffset}
                   y={pa.y + dy * textOffset}
                   fill={alignment.color || "#ef4444"}
                   fontSize={fontSize}
                   textAnchor="middle"
                   alignmentBaseline="middle"
                   transform={`rotate(${angleDegText} ${pa.x + dx * textOffset} ${pa.y + dy * textOffset})`}
                   fontWeight="bold"
                 >
                   {formatStation(s)}
                 </text>
               );
            }
          }
          
          if (alignment.keyPoints) {
            alignment.keyPoints.forEach(kp => {
              if (kp.sta >= localStartSta && kp.sta <= localEndSta && kp.label !== "PIV") {
                const pa = getPointAt(alignment, kp.sta);
                const dx = Math.cos(pa.angle - Math.PI / 2);
                const dy = Math.sin(pa.angle - Math.PI / 2);
                
                keyPointElements.push(
                  <g key={`kp-${kp.sta}-${kp.label}`}>
                    <circle cx={pa.x} cy={pa.y} r={circleRadius} fill={alignment.color || "#ef4444"} />
                    <line 
                      x1={pa.x} 
                      y1={pa.y} 
                      x2={pa.x + dx * textOffset * 1.5} 
                      y2={pa.y + dy * textOffset * 1.5} 
                      stroke={alignment.color || "#ef4444"} 
                      strokeWidth={strokeWidth * 0.3} 
                    />
                    <text
                      x={pa.x + dx * textOffset * 1.8}
                      y={pa.y + dy * textOffset * 1.8}
                      fill={alignment.color || "#ef4444"}
                      fontSize={kpFontSize}
                      textAnchor={dx > 0 ? "start" : "end"}
                      alignmentBaseline="middle"
                    >
                      {kp.label} = {kp.sta.toFixed(2)}
                    </text>
                  </g>
                );
              }
            });
          }
          
          const contourElements: React.JSX.Element[] = [];
          if (store.surface && store.surfaces[0] && inVpBases("surfaces", store.surfaces[0].id)) {
            const surfLayer = store.surfaces[0];
            const surf = store.surface;
            if (surfLayer.isVisible && (surfLayer.showMajorContours || surfLayer.showMinorContours)) {
              const majorInterval = surfLayer.majorContourInterval || 5;
              const minorInterval = surfLayer.minorContourInterval || 1;
              const majorPaths: string[] = [];
              const minorPaths: string[] = [];
              
              const visibleTriangles = surf.getTrianglesInBoundingBox(wMinX, wMaxX, wMinY, wMaxY);
              const step = visibleTriangles.length > 50000 ? 5 : 1; 
              for (let j = 0; j < visibleTriangles.length; j += step) {
                const i = visibleTriangles[j];
                const v1 = surf.indices[i] * 3;
                const v2 = surf.indices[i + 1] * 3;
                const v3 = surf.indices[i + 2] * 3;
                const x1 = surf.vertices[v1], y1 = surf.vertices[v1 + 1], z1 = surf.vertices[v1 + 2];
                const x2 = surf.vertices[v2], y2 = surf.vertices[v2 + 1], z2 = surf.vertices[v2 + 2];
                const x3 = surf.vertices[v3], y3 = surf.vertices[v3 + 1], z3 = surf.vertices[v3 + 2];
                const zMin = Math.min(z1, z2, z3);
                const zMax = Math.max(z1, z2, z3);
                const startZ = Math.ceil(zMin / minorInterval) * minorInterval;
                for (let z = startZ; z <= zMax; z += minorInterval) {
                  const isMajor = Math.abs(z % majorInterval) < 0.001;
                  if (!isMajor && !surfLayer.showMinorContours) continue;
                  if (isMajor && !surfLayer.showMajorContours) continue;
                  
                  const pts: {x: number, y: number}[] = [];
                  if ((z1 <= z && z2 > z) || (z2 <= z && z1 > z)) {
                     const t = (z - z1) / (z2 - z1);
                     pts.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) });
                  }
                  if ((z2 <= z && z3 > z) || (z3 <= z && z2 > z)) {
                     const t = (z - z2) / (z3 - z2);
                     pts.push({ x: x2 + t * (x3 - x2), y: y2 + t * (y3 - y2) });
                  }
                  if ((z3 <= z && z1 > z) || (z1 <= z && z3 > z)) {
                     const t = (z - z3) / (z1 - z3);
                     pts.push({ x: x3 + t * (x1 - x3), y: y3 + t * (y1 - y3) });
                  }
                  if (pts.length === 2) {
                     const d = `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
                     if (isMajor) majorPaths.push(d);
                     else minorPaths.push(d);
                  }
                }
              }
              if (minorPaths.length > 0) {
                contourElements.push(<path key="minor-contours" d={minorPaths.join(' ')} fill="none" stroke={surfLayer.minorContourColor || "#94a3b8"} strokeWidth={strokeWidth * 0.3} opacity={0.5} />);
              }
              if (majorPaths.length > 0) {
                contourElements.push(<path key="major-contours" d={majorPaths.join(' ')} fill="none" stroke={surfLayer.majorContourColor || "#f87171"} strokeWidth={strokeWidth * 0.8} opacity={0.8} />);
              }
            }
          }

          /* CORREDORES E FEATURE LINES — vêm da CENA publicada pela planta do
           * projeto (coordenadas de mundo, mesma classificação e cores). A
           * Produção não recalcula nada: só mostra e recorta pela moldura. */
          const scene: any = (store as any).planScene || { ribbons: [], features: [] };
          const corridorElements: React.JSX.Element[] = [];
          (scene.ribbons || []).forEach((r: any, i: number) => {
            if (r.corridorId && !inVpBases("corridors", r.corridorId)) return;
            corridorElements.push(
              <path key={`scene-rib-${i}`} d={r.d} fill={r.fill} fillOpacity={0.5}
                stroke={r.fill} strokeWidth={strokeWidth * 0.25} />
            );
          });
          (scene.features || []).forEach((f: any, i: number) => {
            const chave = `${f.corridorId}|${f.id}`;
            if (!inVpBases("corridors", f.corridorId || "") && !inVpBases("corridorLines", chave)) return;
            corridorElements.push(
              <path key={`scene-feat-${i}`} d={f.d} fill="none" stroke={f.stroke}
                strokeWidth={strokeWidth * (f.width === 2 ? 0.6 : 0.35)}
                strokeDasharray={f.dash === "none" ? undefined : `${1.5 * scaleFactor / 1000},${0.8 * scaleFactor / 1000}`}
                opacity={0.95} />
            );
          });

          /* Elementos das BASES escolhidas para esta janela que o viewport não
           * desenhava antes (outros alinhamentos, geometrias extraídas e
           * entidades 3D). Só entram quando há bases selecionadas. */
          const baseExtraElements: React.JSX.Element[] = [];
          if (vpBasesSel.length > 0) {
            const memb = (kind: string) =>
              Array.from(new Set(vpBasesSel.flatMap((b: any) => ((b.members?.[kind] as string[]) || []))));

            memb("alignments").forEach((id) => {
              if (id === alignment.id) return;
              const a: any = store.alignments.find((x: any) => x.id === id);
              if (!a || !a.points || a.points.length < 2) return;
              baseExtraElements.push(
                <path key={`base-align-${id}`} d={`M ${a.points.map((p: any) => `${p.x},${p.y}`).join(" L ")}`}
                  fill="none" stroke={a.color || "#ef4444"} strokeWidth={strokeWidth}
                  strokeLinejoin="round" strokeDasharray={dashArray} />
              );
            });

            memb("geometries").forEach((id) => {
              const g: any = (store.drawnGeometries || []).find((x: any) => x.id === id);
              if (!g || !g.pathD) return;
              const lay: any = store.layers.find((l: any) => l.id === g.layerId);
              baseExtraElements.push(
                <path key={`base-geom-${id}`} d={g.pathD} fill="none"
                  stroke={g.color || lay?.color || "#0f172a"} strokeWidth={strokeWidth * 0.9} />
              );
            });

            memb("lines3D").forEach((id) => {
              const l: any = (store.lines3D || []).find((x: any) => x.id === id);
              if (!l) return;
              baseExtraElements.push(
                <line key={`base-line-${id}`} x1={l.p1.x} y1={l.p1.y} x2={l.p2.x} y2={l.p2.y}
                  stroke={l.color || "#0ea5e9"} strokeWidth={strokeWidth * 0.9} />
              );
            });

            memb("circles3D").forEach((id) => {
              const c: any = (store.circles3D || []).find((x: any) => x.id === id);
              if (!c) return;
              baseExtraElements.push(
                <circle key={`base-circ-${id}`} cx={c.center.x} cy={c.center.y} r={c.radius}
                  fill="none" stroke={c.color || "#6366f1"} strokeWidth={strokeWidth * 0.9} />
              );
            });

            memb("points3D").forEach((id) => {
              const p: any = (store.points3D || []).find((x: any) => x.id === id);
              if (!p) return;
              baseExtraElements.push(
                <circle key={`base-pt-${id}`} cx={p.x} cy={p.y} r={circleRadius * 0.8} fill={p.color || "#10b981"} />
              );
            });
          }

          const maoLigada = panVpAtivo === vpIndex;
          return (
            <div
              className={`absolute inset-0 w-full h-full ${maoLigada ? "pointer-events-auto" : "pointer-events-none"}`}
              style={maoLigada ? { cursor: "grab" } : undefined}
              onMouseDown={maoLigada ? (ev) => iniciarPanVp(ev, vpIndex, vbWidth, vbHeight) : undefined}
            >
              <svg
                className="w-full h-full overflow-hidden"
                viewBox={`${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}`}
                preserveAspectRatio="none"
              >
                {(() => {
                  if (!pageInfo) return null;
                  /* LINHAS DE ARTICULAÇÃO — perpendiculares ao eixo nas estacas de
                   * corte. A tangente sai da diferença de dois pontos vizinhos do
                   * eixo (o campo angle pode vir vazio) e os extremos são ordenados
                   * por Y para o polígono do recorte nunca cruzar (gravata). */
                  const ca = Math.cos(pageInfo.angle), sa = Math.sin(pageInfo.angle);
                  const rotp = (x: number, y: number) => ({ X: x * ca - y * sa, Y: x * sa + y * ca });
                  const L = (vbWidth + vbHeight) * 2;
                  const corte = (sta: number, angGraus: number) => {
                    const p: any = getPointAt(alignment, sta);
                    const pA: any = getPointAt(alignment, sta - 0.5);
                    const pB: any = getPointAt(alignment, sta + 0.5);
                    let tx = pB.x - pA.x, ty = pB.y - pA.y;
                    const n = Math.hypot(tx, ty);
                    if (n < 1e-9) { tx = Math.cos(p.angle || 0); ty = Math.sin(p.angle || 0); }
                    else { tx /= n; ty /= n; }
                    /* Direção da linha = tangente do eixo rodada pelo ângulo pedido
                     * (90° devolve exatamente a perpendicular de sempre). */
                    const th = (angGraus * Math.PI) / 180;
                    const dx = tx * Math.cos(th) - ty * Math.sin(th);
                    const dy = tx * Math.sin(th) + ty * Math.cos(th);
                    const e1 = rotp(p.x + dx * L, p.y + dy * L);
                    const e2 = rotp(p.x - dx * L, p.y - dy * L);
                    return e1.Y <= e2.Y ? [e1, e2] : [e2, e1]; // [topo, base]
                  };
                  const edA = artEdits[currentPage - 1] || {};
                  const edB = artEdits[currentPage] || {};
                  const [Atopo, Abase] = corte(pageInfo.startStation, edA.ang ?? 90);
                  const [Btopo, Bbase] = corte(pageInfo.endStation, edB.ang ?? 90);
                  const fs = 3.0 * (scaleFactor / 1000);
                  const sw = strokeWidth * (artEstilo.espessura || 0.8);
                  const dash = artEstilo.tracejada
                    ? `${6 * scaleFactor / 1000},${3 * scaleFactor / 1000}`
                    : undefined;
                  const midY = vbMinY + vbHeight / 2;
                  const xNa = (P: any, Q: any) => (Math.abs(Q.Y - P.Y) < 1e-9 ? P.X : P.X + (Q.X - P.X) * (midY - P.Y) / (Q.Y - P.Y));
                  const angLinha = (P: any, Q: any) => (Math.atan2(Q.Y - P.Y, Q.X - P.X) * 180) / Math.PI;

                  const artesp = (carimboElements as any)?.texto_2 && String((carimboTextValues as any)?.texto_2 || "").trim()
                    ? String((carimboTextValues as any).texto_2).trim()
                    : "";
                  const ref = (n: number) => (artesp ? `${artesp} - FOLHA ${n}` : `FOLHA ${n}`);
                  const txtEsq = (edA.texto || "").trim() || (currentPage > 1 ? ref(currentPage - 1) : "INÍCIO DO TRAÇADO");
                  const txtDir = (edB.texto || "").trim() || (currentPage < totalPages ? ref(currentPage + 1) : "FIM DO TRAÇADO");

                  /* Rótulo ALINHADO com a linha de articulação e escrito pelo
                   * lado de FORA (afastado na normal da linha, não em X). */
                  const rotulo = (P: any, Q: any, texto: string, lado: number) => {
                    const x0 = xNa(P, Q);
                    let dx = Q.X - P.X, dy = Q.Y - P.Y;
                    const n = Math.hypot(dx, dy) || 1;
                    dx /= n; dy /= n;
                    let nx = -dy, ny = dx;
                    if (nx * lado < 0) { nx = -nx; ny = -ny; } // normal para fora da folha
                    const off = fs * 0.9;
                    const x = x0 + nx * off, y = midY + ny * off;
                    let a = angLinha(P, Q);
                    if (a > 90 || a < -90) a += 180; // texto sempre legível
                    return (
                      <text
                        x={x} y={y} fontSize={fs} fill={artEstilo.cor} fontFamily="Arial, sans-serif"
                        fontWeight="bold" textAnchor="middle" dominantBaseline="middle"
                        transform={`rotate(${a} ${x} ${y})`}
                      >{texto}</text>
                    );
                  };

                  /* Nos extremos do eixo não há linha de articulação: o recorte
                   * abre-se para fora (até à moldura) em vez de cortar no
                   * início da primeira folha / fim da última. */
                  const EXT = vbWidth + vbHeight;
                  const abrir = (P: any, s: number) => ({ X: P.X + s * EXT, Y: P.Y });
                  const Ac1 = currentPage > 1 ? Atopo : abrir(Atopo, -1);
                  const Ac2 = currentPage > 1 ? Abase : abrir(Abase, -1);
                  const Bc1 = currentPage < totalPages ? Btopo : abrir(Btopo, 1);
                  const Bc2 = currentPage < totalPages ? Bbase : abrir(Bbase, 1);

                  /* Ordem garantidamente simples: topo-esq → topo-dir → base-dir → base-esq. */
                  const esqPrimeiro = Ac1.X <= Bc1.X;
                  const P1 = esqPrimeiro ? Ac1 : Bc1;
                  const P2 = esqPrimeiro ? Bc1 : Ac1;
                  const P3 = esqPrimeiro ? Bc2 : Ac2;
                  const P4 = esqPrimeiro ? Ac2 : Bc2;

                  return (
                    <g>
                      <defs>
                        <clipPath id={`pg-clip-${vpIndex}-${currentPage}`}>
                          <polygon points={`${P1.X},${P1.Y} ${P2.X},${P2.Y} ${P3.X},${P3.Y} ${P4.X},${P4.Y}`} />
                        </clipPath>
                      </defs>
                      {currentPage > 1 && !edA.oculta && (
                        <line x1={Atopo.X} y1={Atopo.Y} x2={Abase.X} y2={Abase.Y} stroke={artEstilo.cor} strokeWidth={sw} strokeDasharray={dash} />
                      )}
                      {currentPage < totalPages && !edB.oculta && (
                        <line x1={Btopo.X} y1={Btopo.Y} x2={Bbase.X} y2={Bbase.Y} stroke={artEstilo.cor} strokeWidth={sw} strokeDasharray={dash} />
                      )}
                      {artEstilo.mostrarRotulos && currentPage > 1 && !edA.oculta && rotulo(Atopo, Abase, txtEsq, -1)}
                      {artEstilo.mostrarRotulos && currentPage < totalPages && !edB.oculta && rotulo(Btopo, Bbase, txtDir, 1)}
                      {mostrarLimitesArticulacao && (
                        <polygon
                          points={`${P1.X},${P1.Y} ${P2.X},${P2.Y} ${P3.X},${P3.Y} ${P4.X},${P4.Y}`}
                          fill="#ef4444" fillOpacity={0.12} stroke="#ef4444" strokeWidth={sw}
                        />
                      )}
                    </g>
                  );
                })()}
                <g clipPath={pageInfo ? `url(#pg-clip-${vpIndex}-${currentPage})` : undefined}>
                {gridElements}
                <g transform={`rotate(${angleDeg} 0 0)`}>
                  {contourElements}
                  {corridorElements}
                  {baseExtraElements}
                  {inVpBases("alignments", alignment.id) && (
                    <>
                      <path d={pathD} fill="none" stroke={alignment.color || "#ef4444"} strokeWidth={strokeWidth} strokeLinejoin="round" strokeDasharray={dashArray} />
                      {estacasElements}
                      {keyPointElements}
                    </>
                  )}
                </g>
                </g>
              </svg>
            </div>
          );
        }
                              } else if (category.includes("perfil") && viewportBaseProfiles[vpIndex]) {
        const profileIds = viewportBaseProfiles[vpIndex].split(",").filter(Boolean);
        const scaleStr = viewportScales[vpIndex] || "1:1000";
        let scaleFactor = parseInt(scaleStr.split(":")[1]) || 1000;
        const svgW = Math.max(1, vpW - 32);
        const svgH = Math.max(1, vpH - 32);
        const vpWidthM = svgW * (scaleFactor / 1000);
        const vpHeightM = svgH * (scaleFactor / 1000);
        
        const pageInfo = alignmentPages[currentPage - 1];
        const startSta = pageInfo ? pageInfo.startStation : 0;
        const endSta = pageInfo ? pageInfo.endStation : vpWidthM;

        let allVisiblePts: any[] = [];
        const linesToDraw: {d: string, color: string}[] = [];

        profileIds.forEach(profileId => {
          let profilePts: any[] = [];
          
          const align = store.alignments.find(a => a.id === profileId);
          if (align && align.profile) {
             profilePts = align.profile;
          } else if (profileId === "projeto") {
             const activeId = viewportBaseAlignments[vpIndex] || store.productionActiveAlignment;
             const a2 = store.alignments.find(a => a.id === activeId);
             if (a2 && a2.profile) profilePts = a2.profile;
          } else {
             const pl = store.profileLines.find(p => p.id === profileId);
             if (pl) {
                profilePts = [pl.p1, pl.p2];
             } else {
                const surf = store.surfaces.find(s => s.id === profileId);
                if (surf) {
                    const activeId = viewportBaseAlignments[vpIndex] || store.productionActiveAlignment;
                        const a2 = store.alignments.find(a => a.id === activeId);
                    if (a2) {
                        for(let st = startSta; st <= endSta; st += 10) {
                            const worldPt = a2.getPointAtStation(st);
                            const z = surf.surface.getElevation(worldPt.x, worldPt.y);
                            if (z !== null) profilePts.push({ sta: st, elev: z });
                        }
                        if (endSta % 10 !== 0) {
                            const worldPt = a2.getPointAtStation(endSta);
                            const z = surf.surface.getElevation(worldPt.x, worldPt.y);
                            if (z !== null) profilePts.push({ sta: endSta, elev: z });
                        }
                    }
                }
             }
          }
          
          const visiblePts = [];
          const startElev = interpolateElevation(profilePts, startSta);
          if (startElev !== null) visiblePts.push({ sta: startSta, elev: startElev });
          
          profilePts.forEach(p => {
             if (p.sta > startSta && p.sta < endSta) visiblePts.push(p);
          });
          
          const endElev = interpolateElevation(profilePts, endSta);
          if (endElev !== null) visiblePts.push({ sta: endSta, elev: endElev });
          
          if (visiblePts.length > 0) {
              allVisiblePts.push(...visiblePts);
          }
        });
        
        if (allVisiblePts.length > 0) {
            let minY = Math.min(...allVisiblePts.map(p => p.elev));
            let maxY = Math.max(...allVisiblePts.map(p => p.elev));
            if (minY === maxY) { minY -= 10; maxY += 10; }
            
            const rangeY = maxY - minY;
            const padY = rangeY * 0.1;
            minY -= padY;
            maxY += padY;
            
            const bands = store.productionViewportProfileBands?.[vpIndex] || [];
            let totalBandHeightM = 0;
            bands.forEach(b => {
               totalBandHeightM += (b.height || 15) * (scaleFactor / 1000);
            });
            const gridHeightM = Math.max(1, vpHeightM - totalBandHeightM);
            let bandTitleWidthM = bands.length > 0 ? 40 * (scaleFactor / 1000) : 0;
            
            const scaleX = 1; // 1 station unit = 1 world unit in viewBox
            const scaleY = gridHeightM / ((maxY - minY) || 1);

            profileIds.forEach(profileId => {
              let profilePts: any[] = [];
              let pColor = "#3b82f6";
              
              const align = store.alignments.find(a => a.id === profileId);
              if (align && align.profile) {
                 profilePts = align.profile;
                 pColor = align.color || pColor;
              } else if (profileId === "projeto") {
                 const activeId = viewportBaseAlignments[vpIndex] || store.productionActiveAlignment;
                 const a2 = store.alignments.find(a => a.id === activeId);
                 if (a2 && a2.profile) profilePts = a2.profile;
                 pColor = "#ef4444";
              } else {
                 const pl = store.profileLines.find(p => p.id === profileId);
                 if (pl) {
                    profilePts = [pl.p1, pl.p2];
                    pColor = pl.color || pColor;
                 } else {
                    const surf = store.surfaces.find(s => s.id === profileId);
                    if (surf) {
                        const activeId = viewportBaseAlignments[vpIndex] || store.productionActiveAlignment;
                        const a2 = store.alignments.find(a => a.id === activeId);
                        if (a2) {
                            for(let st = startSta; st <= endSta; st += 10) {
                                const worldPt = a2.getPointAtStation(st);
                                const z = surf.surface.getElevation(worldPt.x, worldPt.y);
                                if (z !== null) profilePts.push({ sta: st, elev: z });
                            }
                            if (endSta % 10 !== 0) {
                                const worldPt = a2.getPointAtStation(endSta);
                                const z = surf.surface.getElevation(worldPt.x, worldPt.y);
                                if (z !== null) profilePts.push({ sta: endSta, elev: z });
                            }
                            pColor = surf.profileColor || surf.trianglesColor || "#22c55e";
                        }
                    }
                 }
              }
              
              const visiblePts = [];
              const startElev = interpolateElevation(profilePts, startSta);
              if (startElev !== null) visiblePts.push({ sta: startSta, elev: startElev });
              
              profilePts.forEach(p => {
                 if (p.sta > startSta && p.sta < endSta) visiblePts.push(p);
              });
              
              const endElev = interpolateElevation(profilePts, endSta);
              if (endElev !== null) visiblePts.push({ sta: endSta, elev: endElev });
              if (visiblePts.length > 0) {
                  const d = `M ${visiblePts.map(p => `${bandTitleWidthM + (p.sta - startSta) * scaleX},${gridHeightM - (p.elev - minY) * scaleY}`).join(' L ')}`;
                  linesToDraw.push({d, color: pColor});
              }
            });

            const gridLinesX = [];
            const xStep = 20;
            const firstX = Math.ceil(startSta / xStep) * xStep;
            for (let sta = firstX; sta <= endSta; sta += xStep) {
                gridLinesX.push({
                   x: bandTitleWidthM + (sta - startSta) * scaleX,
                   label: formatStation(sta)
                });
            }

            const getElev = (pid: string, sta: number) => {
               if (!pid) return "";
               let pts: any[] = [];
               const align = store.alignments.find(a => a.id === pid);
               if (align && align.profile) {
                  pts = align.profile;
               } else {
                  const surf = store.surfaces.find(s => s.id === pid);
                  if (surf) {
                      const activeId = viewportBaseAlignments[vpIndex] || store.productionActiveAlignment;
                      const a2 = store.alignments.find(a => a.id === activeId);
                      if (a2) {
                         const worldPt = a2.getPointAtStation(sta);
                         const z = surf.surface.getElevation(worldPt.x, worldPt.y);
                         if (z !== null) return z.toFixed(2);
                      }
                  }
               }
               if (pts.length > 0) {
                  const z = interpolateElevation(pts, sta);
                  if (z !== null) return z.toFixed(2);
               }
               return "";
            };

            const gridLinesY = [];
            let yStep = 10;
            if (rangeY <= 10) yStep = 1;
            else if (rangeY <= 50) yStep = 5;
            else if (rangeY <= 100) yStep = 10;
            else if (rangeY <= 500) yStep = 50;
            else yStep = 100;

            const firstY = Math.ceil(minY / yStep) * yStep;
            for (let elev = firstY; elev <= maxY; elev += yStep) {
                gridLinesY.push({
                   y: gridHeightM - (elev - minY) * scaleY,
                   label: elev.toFixed(1)
                });
            }

            const strokeW = Math.min(vpWidthM, vpHeightM) * 0.003;
            const textY = vpHeightM * 0.025;
            const textX = vpWidthM * 0.01;

            return (
              <div className="absolute inset-0 w-full h-full p-4 pointer-events-none flex items-center justify-center">
                <svg className="w-full h-full drop-shadow-md bg-white/50" viewBox={`0 0 ${vpWidthM} ${vpHeightM}`} preserveAspectRatio="none">
                  {/* Y Grid */}
                  {gridLinesY.map((line, i) => (
                    <g key={`y-${i}`}>
                      <line x1={bandTitleWidthM} y1={line.y} x2={vpWidthM} y2={line.y} stroke="#cbd5e1" strokeWidth={strokeW} />
                      <text x={bandTitleWidthM + textX} y={line.y - textY} fill="#475569" fontSize={Math.min(vpWidthM, vpHeightM) * 0.03} fontFamily="sans-serif" className="select-none">
                        {line.label}
                      </text>
                    </g>
                  ))}
                  {/* X Grid */}
                  {gridLinesX.map((line, i) => (
                    <g key={`x-${i}`}>
                      <line x1={line.x} y1="0" x2={line.x} y2={gridHeightM} stroke="#cbd5e1" strokeWidth={strokeW} />
                      <text x={line.x + textX} y={gridHeightM - textY} fill="#475569" fontSize={Math.min(vpWidthM, vpHeightM) * 0.03} fontFamily="sans-serif" className="select-none" transform={`rotate(-90 ${line.x} ${gridHeightM}) translate(20, 20)`}>
                        {line.label}
                      </text>
                    </g>
                  ))}
                  <line x1={bandTitleWidthM} y1={gridHeightM} x2={vpWidthM} y2={gridHeightM} stroke="#64748b" strokeWidth={strokeW * 3} />
                  <line x1={bandTitleWidthM} y1="0" x2={bandTitleWidthM} y2={gridHeightM} stroke="#64748b" strokeWidth={strokeW * 3} />
                  <line x1={bandTitleWidthM} y1="0" x2={vpWidthM} y2="0" stroke="#64748b" strokeWidth={strokeW * 3} />
                  <line x1={vpWidthM} y1="0" x2={vpWidthM} y2={gridHeightM} stroke="#64748b" strokeWidth={strokeW * 3} />
                  {linesToDraw.map((line, i) => (
                      <path key={i} d={line.d} fill="none" stroke={line.color} strokeWidth={strokeW * 5} strokeLinejoin="round" />
                  ))}
                  {/* Profile Bands */}
                  {(() => {
                      let currY = gridHeightM;
                      return bands.map((band, i) => {
                          const bhM = (band.height || 15) * (scaleFactor / 1000);
                          const yTop = currY;
                          const yBottom = currY + bhM;
                          currY = yBottom;
                          
                          return (
                             <g key={`band-${i}`}>
                                {/* Band Box */}
                                <rect x={bandTitleWidthM} y={yTop} width={vpWidthM - bandTitleWidthM} height={bhM} fill="#f8fafc" stroke="#64748b" strokeWidth={strokeW * 2} />
                                {/* Band Label Box */}
                                <rect x="0" y={yTop} width={bandTitleWidthM} height={bhM} fill="#e2e8f0" stroke="#64748b" strokeWidth={strokeW * 2} />
                                <text x={bandTitleWidthM / 2} y={yTop + bhM/2} fill="#334155" fontSize={Math.min(bhM * 0.3, bandTitleWidthM * 0.15)} fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle" className="select-none">
                                   {band.label || band.type}
                                </text>
                                {/* Band Content (Stations) */}
                                {gridLinesX.map((line, j) => {
                                   const sta = ((line.x - bandTitleWidthM) / scaleX) + startSta;
                                   let textLines: string[] = [];
                                   if (band.type === 'Profile Data') {
                                      const z1 = getElev(band.profile1, sta);
                                      const z2 = getElev(band.profile2, sta);
                                      if (z1 && z2) {
                                         const dz = (parseFloat(z1) - parseFloat(z2)).toFixed(2);
                                         textLines.push(`C/A: ${dz}`);
                                      }
                                      if (z2) textLines.push(`P2: ${z2}`);
                                      if (z1) textLines.push(`P1: ${z1}`);
                                      if (!z1 && !z2) textLines.push(line.label);
                                   } else if (band.type === 'Vertical Geometry') {
                                      textLines.push('Geometria');
                                   } else if (band.type === 'Horizontal Geometry') {
                                      textLines.push('Tangente/Curva');
                                   } else if (band.type === 'Superelevation') {
                                      textLines.push('Super.');
                                   }
                                   
                                   return (
                                     <g key={`band-${i}-x-${j}`}>
                                       <line x1={line.x} y1={yTop} x2={line.x} y2={yBottom} stroke="#cbd5e1" strokeWidth={strokeW} />
                                       <g transform={`rotate(-90 ${line.x} ${yBottom - bhM*0.1}) translate(0, 4)`}>
                                          {textLines.map((t, tid) => (
                                             <text key={tid} x={line.x - 5 - (tid * bhM * 0.4)} y={yBottom - bhM*0.1} fill="#475569" fontSize={bhM * 0.3} fontFamily="sans-serif" textAnchor="end" className="select-none">
                                                {t}
                                             </text>
                                          ))}
                                       </g>
                                     </g>
                                   );
                                })}
                             </g>
                          );
                      });
                  })()}
                </svg>
              </div>
            );
        }
      } else if (category.includes("seção tipo") && viewportAssemblies[vpIndex]) {
         const assembly = store.assemblies.find(a => a.id === viewportAssemblies[vpIndex]);
         if (assembly) {
            type DrawComp = { type: string; side: "Left" | "Right"; startX: number; startY: number; endX: number; endY: number; width: number; slope: number; };
            let drawComps: DrawComp[] = [];
            
            let leftOffset = 0;
            let leftY = 0;
            const leftComps = assembly.components?.filter(c => c.side === "Left") || [];
            leftComps.forEach(c => {
                let width = c.params.width || (c.type === 'Pista' ? 3.6 : c.type === 'Acostamento' ? 2.5 : c.type === 'Talude' ? 2 : c.type === 'Guia' ? 0.15 : c.type === 'Sarjeta' ? 0.45 : c.type === 'Faixa de Segurança' ? 1.0 : c.type === 'Canteiro Central' ? 4.0 : c.type === 'Refúgio' ? 1.5 : 2);
                let slope = c.params.slope ?? (c.type === 'Talude' ? -(100 / (c.params.cutSlope || 1.5)) : c.type === 'Canteiro Central' ? 0 : -2);
                let drop = - (slope/100) * width;
                
                let endX = leftOffset - width;
                let endY = leftY + drop;
                
                drawComps.push({ type: c.type, side: "Left", startX: leftOffset, startY: leftY, endX: endX, endY: endY, width, slope });
                leftOffset = endX;
                leftY = endY;
            });
            
            let rightOffset = 0;
            let rightY = 0;
            const rightComps = assembly.components?.filter(c => c.side === "Right") || [];
            rightComps.forEach(c => {
                let width = c.params.width || (c.type === 'Pista' ? 3.6 : c.type === 'Acostamento' ? 2.5 : c.type === 'Talude' ? 2 : c.type === 'Guia' ? 0.15 : c.type === 'Sarjeta' ? 0.45 : c.type === 'Faixa de Segurança' ? 1.0 : c.type === 'Canteiro Central' ? 4.0 : c.type === 'Refúgio' ? 1.5 : 2);
                let slope = c.params.slope ?? (c.type === 'Talude' ? -(100 / (c.params.cutSlope || 1.5)) : c.type === 'Canteiro Central' ? 0 : -2);
                let drop = - (slope/100) * width;
                
                let endX = rightOffset + width;
                let endY = rightY + drop;
                
                drawComps.push({ type: c.type, side: "Right", startX: rightOffset, startY: rightY, endX: endX, endY: endY, width, slope });
                rightOffset = endX;
                rightY = endY;
            });

            if (drawComps.length === 0) {
               drawComps.push({ type: 'Pista', side: 'Left', startX: 0, startY: 0, endX: -3.6, endY: -0.072, width: 3.6, slope: -2 });
               drawComps.push({ type: 'Pista', side: 'Right', startX: 0, startY: 0, endX: 3.6, endY: -0.072, width: 3.6, slope: -2 });
            }

            const getLabel = (type: string) => {
               if (type === 'Pista') return 'FAIXA DE ROLAMENTO PROJETADA';
               if (type === 'Acostamento') return 'ACOSTAMENTO PROJETADO';
               if (type === 'Guia') return 'GUIA';
               if (type === 'Sarjeta') return 'SARJETA';
               return type.toUpperCase();
            };

            let minX = Math.min(0, ...drawComps.map(c => Math.min(c.startX, c.endX)));
            let maxX = Math.max(0, ...drawComps.map(c => Math.max(c.startX, c.endX)));
            let physicalMinY = Math.min(0, ...drawComps.map(c => Math.min(c.startY, c.endY)));
            let physicalMaxY = Math.max(0, ...drawComps.map(c => Math.max(c.startY, c.endY)));
            
            if (minX === maxX) { minX -= 10; maxX += 10; }
            const paddingX = (maxX - minX) * 0.15;
            minX -= paddingX;
            maxX += paddingX;
            
            const viewW = maxX - minX;
            
            const dimLineY = physicalMaxY + viewW * 0.08;
            const titleY = dimLineY + viewW * 0.08;
            const groundBaseY = physicalMinY - viewW * 0.05;
            const bottomY = groundBaseY - viewW * 0.05;
            
            const svgMinX = minX;
            const svgMaxX = maxX;
            const svgMinY = -titleY - viewW * 0.08;
            const svgMaxY = -bottomY + viewW * 0.05;
            const svgH = svgMaxY - svgMinY;
            const sw = viewW * 0.0015;
            const textSize = viewW * 0.012;
            
            const assemblyName = assembly.name.toUpperCase();
            const scaleStr = viewportScales[vpIndex] || "1:100";
            
            return (
                <div className="absolute inset-0 w-full h-full pointer-events-none flex items-center justify-center bg-white overflow-hidden p-2">
                  <svg className="w-full h-full" viewBox={`${svgMinX} ${svgMinY} ${viewW} ${svgH}`} preserveAspectRatio="xMidYMid meet">
                    <defs>
                      <marker id="arrowHead" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
                        <polygon points="0 0, 8 4, 0 8" fill="#000" />
                      </marker>
                    </defs>

                    <text x="0" y={-titleY} textAnchor="middle" fontSize={textSize * 1.5} fontWeight="bold" fill="#000" fontFamily="sans-serif">
                       {assemblyName}
                    </text>
                    <text x="0" y={-titleY + textSize * 1.5} textAnchor="middle" fontSize={textSize * 1.2} fill="#000" fontFamily="sans-serif">
                       SEÇÃO TIPO
                    </text>
                    <text x="0" y={-titleY + textSize * 3} textAnchor="middle" fontSize={textSize} fill="#000" fontFamily="sans-serif">
                       ESC.: {scaleStr}
                    </text>

                    <path d={`M ${minX + paddingX/2},${-groundBaseY + viewW*0.02} Q ${minX/2},${-groundBaseY} 0,${-groundBaseY - viewW*0.01} T ${maxX - paddingX/2},${-groundBaseY + viewW*0.02}`} fill="none" stroke="#16a34a" strokeWidth={sw} strokeDasharray={`${sw*6},${sw*6}`} />
                    <text x="0" y={-groundBaseY + textSize*2} textAnchor="middle" fontSize={textSize} fill="#000" fontFamily="sans-serif" textDecoration="underline">
                       TERRENO NATURAL
                    </text>
                    
                    <line x1="0" y1={-bottomY} x2="0" y2={-dimLineY - viewW*0.01} stroke="#000" strokeWidth={sw*0.7} strokeDasharray={`${sw*8},${sw*2},${sw*2},${sw*2}`} />
                    <text x="0" y={-dimLineY - viewW*0.02} textAnchor="middle" fontSize={textSize} fill="#000" fontFamily="sans-serif">
                       LB=LP
                    </text>

                    <line x1={Math.min(...drawComps.map(c => c.endX))} y1={-dimLineY} x2={Math.max(...drawComps.map(c => c.endX))} y2={-dimLineY} stroke="#000" strokeWidth={sw*0.7} />

                    {drawComps.map((c, i) => {
                       const isLeft = c.side === "Left";
                       const midX = (c.startX + c.endX) / 2;
                       const widthText = c.type === 'Talude' ? 'VAR.' : c.width.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                       const label = getLabel(c.type);
                       
                       const isHorizontal = c.type === 'Talude' || c.type === 'Canteiro Central';
                       
                       const slopeAbs = Math.abs(c.slope);
                       let slopeText = "";
                       if (c.slope !== 0) {
                          slopeText = c.type === 'Talude' ? `1:${(100/slopeAbs).toFixed(1)}` : `${slopeAbs.toFixed(1)}%`;
                       }

                       const isDownhillTowardsEnd = c.startY > c.endY;
                       let arrowX1 = midX - viewW*0.02;
                       let arrowX2 = midX + viewW*0.02;
                       if (c.slope === 0) {
                       } else if ((isLeft && isDownhillTowardsEnd) || (!isLeft && !isDownhillTowardsEnd)) {
                          arrowX1 = midX + viewW*0.02;
                          arrowX2 = midX - viewW*0.02;
                       } else {
                          arrowX1 = midX - viewW*0.02;
                          arrowX2 = midX + viewW*0.02;
                       }
                       const arrowY = -(c.startY + c.endY)/2 - viewW*0.015;

                       return (
                          <g key={`comp-${c.side}-${i}`}>
                             <line x1={c.startX} y1={-c.startY} x2={c.endX} y2={-c.endY} stroke="#000" strokeWidth={sw * 2.5} />
                             {c.type === 'Talude' && (
                                <line x1={c.endX} y1={-c.endY} x2={c.endX + (isLeft?-viewW*0.03:viewW*0.03)} y2={-c.endY} stroke="#000" strokeWidth={sw * 1} />
                             )}
                             
                             <line x1={c.endX} y1={-c.endY} x2={c.endX} y2={-dimLineY} stroke="#000" strokeWidth={sw*0.5} />
                             {c.startX === 0 && (
                                <line x1={0} y1={0} x2={0} y2={-dimLineY} stroke="#000" strokeWidth={sw*0.5} />
                             )}

                             <line x1={c.endX - viewW*0.005} y1={-dimLineY + viewW*0.005} x2={c.endX + viewW*0.005} y2={-dimLineY - viewW*0.005} stroke="#000" strokeWidth={sw*1.5} />
                             {c.startX === 0 && (
                                <line x1={0 - viewW*0.005} y1={-dimLineY + viewW*0.005} x2={0 + viewW*0.005} y2={-dimLineY - viewW*0.005} stroke="#000" strokeWidth={sw*1.5} />
                             )}

                             <text x={midX} y={-dimLineY - viewW*0.005} textAnchor="middle" fontSize={textSize} fill="#000" fontFamily="sans-serif">
                                {widthText}
                             </text>

                             {isHorizontal ? (
                                <text x={midX} y={-dimLineY + viewW*0.04} textAnchor="middle" fontSize={textSize*0.9} fill="#000" fontFamily="sans-serif">
                                   {label}
                                </text>
                             ) : (
                                <text x={midX} y={-dimLineY + viewW*0.08} textAnchor="middle" fontSize={textSize*0.9} fill="#000" fontFamily="sans-serif" transform={`rotate(-90, ${midX}, ${-dimLineY + viewW*0.08})`}>
                                   {label}
                                </text>
                             )}

                             {c.slope !== 0 && (
                                <>
                                  <line x1={arrowX1} y1={arrowY} x2={arrowX2} y2={arrowY} stroke="#000" strokeWidth={sw} markerEnd="url(#arrowHead)" />
                                  <text x={midX} y={arrowY - viewW*0.005} textAnchor="middle" fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">
                                     {slopeText}
                                  </text>
                                </>
                             )}
                          </g>
                       );
                    })}

                  </svg>
                </div>
            );
         }
      } else if (category.includes("articulação")) {
         return (
            <div className="absolute inset-0 w-full h-full pointer-events-none">
               {renderEsquemaArticulacao(`vp${vpIndex}`, viewportBaseAlignments[vpIndex])}
            </div>
         );
      } else if (category.includes("seções acabadas") && viewportCorridors[vpIndex]) {
         const corridor = store.corridors.find(c => c.id === viewportCorridors[vpIndex]);
         if (corridor) {
            const pageInfo = alignmentPages[currentPage - 1];
            if (pageInfo) {
               const align = store.alignments.find(a => a.id === corridor.alignmentId);
               if (align) {
                  const station = pageInfo.startStation;
                  const res = evaluateAssemblyAtStation(station, store.assemblies, store.corridors, store.surface, store.alignments, align.id);
                  const fg = align.getElevationAtStation(station);
                  
                  if (res) {
                     const origin = align.getPointAtStation(station);
                     const orient = align.getOrientationAtStation(station);

                     let minX = -15;
                     let maxX = 15;
                     
                     const ptsList = Object.values(res.points);
                     if (ptsList.length > 0) {
                        const ptsMin = Math.min(...ptsList.map(p => p.x));
                        const ptsMax = Math.max(...ptsList.map(p => p.x));
                        minX = Math.min(-10, Math.floor(ptsMin / 5) * 5 - 5);
                        maxX = Math.max(10, Math.ceil(ptsMax / 5) * 5 + 5);
                     }

                     const groundPts = [];
                     for (let dist = minX; dist <= maxX; dist += 0.5) {
                        const wx = origin.x + orient.nx * dist;
                        const wy = origin.y + orient.ny * dist;
                        const elev = store.surface?.getElevation(wx, wy) ?? fg;
                        groundPts.push({ x: dist, y: elev });
                     }

                     const allY = [...ptsList.map(p => fg + p.y), ...groundPts.map(p => p.y)];
                     let minY = Math.floor(Math.min(...allY) / 2) * 2 - 2;
                     let maxY = Math.ceil(Math.max(...allY) / 2) * 2 + 2;

                     const viewW = maxX - minX;
                     const viewH = maxY - minY;
                     const svgH = viewH;
                     const svgW = viewW;
                     const sw = viewW * 0.0015;
                     const textSize = viewW * 0.015;
                     
                     // Build points table data
                     let leftPoints: {id: string, x: number, y: number}[] = [];
                     let rightPoints: {id: string, x: number, y: number}[] = [];
                     Object.entries(res.points).forEach(([id, p]) => {
                        if (p.x < -0.01) leftPoints.push({ id, x: p.x, y: fg + p.y });
                        else if (p.x > 0.01) rightPoints.push({ id, x: p.x, y: fg + p.y });
                     });

                     const filterTop = (pts: {id: string, x: number, y: number}[]) => {
                        const unique: {id: string, x: number, y: number}[] = [];
                        pts.forEach(p => {
                           const existing = unique.find(e => Math.abs(e.x - p.x) < 0.01);
                           if (existing) {
                              if (p.y > existing.y) {
                                 existing.y = p.y;
                                 existing.id = p.id;
                              }
                           } else {
                              unique.push({...p});
                           }
                        });
                        return unique;
                     };

                     leftPoints = filterTop(leftPoints);
                     rightPoints = filterTop(rightPoints);

                     leftPoints.sort((a, b) => b.x - a.x); // from center to left
                     rightPoints.sort((a, b) => a.x - b.x); // from center to right

                     return (
                        <div className="absolute inset-0 w-full h-full pointer-events-none flex flex-col bg-white overflow-hidden p-4">
                           <div className="w-full text-center text-2xl font-bold font-sans text-slate-800 mb-2">
                              {formatStation(station)}
                           </div>
                           
                           <div className="flex-1 w-full h-full relative">
                              <svg className="w-full h-full" viewBox={`${minX} ${-maxY} ${viewW} ${viewH + viewH*0.4}`} preserveAspectRatio="xMidYMid meet">
                                 {/* Grid Horizontal */}
                                 {Array.from({ length: (maxY - minY) / 2 + 1 }).map((_, i) => {
                                    const y = minY + i * 2;
                                    return (
                                       <g key={`h-${y}`}>
                                          <line x1={minX} y1={-y} x2={maxX} y2={-y} stroke="#000" strokeWidth={sw*0.5} />
                                          <text x={minX - viewW*0.01} y={-y + viewW*0.005} textAnchor="end" fontSize={textSize} fill="#000" fontFamily="sans-serif">
                                             {y}
                                          </text>
                                          <text x={maxX + viewW*0.01} y={-y + viewW*0.005} textAnchor="start" fontSize={textSize} fill="#000" fontFamily="sans-serif">
                                             {y}
                                          </text>
                                       </g>
                                    );
                                 })}

                                 {/* Grid Vertical */}
                                 {Array.from({ length: (maxX - minX) / 5 + 1 }).map((_, i) => {
                                    const x = minX + i * 5;
                                    return (
                                       <g key={`v-${x}`}>
                                          <line x1={x} y1={-minY} x2={x} y2={-maxY} stroke="#000" strokeWidth={sw*0.5} />
                                          <text x={x} y={-minY + viewW*0.02} textAnchor="middle" fontSize={textSize} fill="#000" fontFamily="sans-serif">
                                             {x}
                                          </text>
                                       </g>
                                    );
                                 })}

                                 {/* Center Axis */}
                                 <line x1={0} y1={-minY} x2={0} y2={-maxY} stroke="#000" strokeWidth={sw*1.5} />
                                 <text x={-viewW*0.005} y={-minY - viewH*0.5} textAnchor="middle" fontSize={textSize*0.9} fill="#000" fontFamily="sans-serif" transform={`rotate(-90, ${-viewW*0.005}, ${-minY - viewH*0.5})`}>
                                    {fg.toFixed(2)}
                                 </text>
                                 <text x={viewW*0.005} y={-minY - viewH*0.5} textAnchor="middle" fontSize={textSize*0.9} fill="#000" fontFamily="sans-serif" transform={`rotate(-90, ${viewW*0.005}, ${-minY - viewH*0.5})`}>
                                    {fg.toFixed(3)}
                                 </text>

                                 {/* Ground Surface */}
                                 {groundPts.length > 0 && (
                                    <path d={`M ${groundPts.map(p => `${p.x},${-p.y}`).join(' L ')}`} fill="none" stroke="#000" strokeWidth={sw*0.7} strokeDasharray={`${sw*4},${sw*2}`} />
                                 )}

                                 {/* Corridor Links */}
                                 {res.links.map(link => {
                                    const pt1 = res.points[link.p1];
                                    const pt2 = res.points[link.p2];
                                    if (!pt1 || !pt2) return null;
                                    return (
                                       <line key={link.id} x1={pt1.x} y1={-(fg + pt1.y)} x2={pt2.x} y2={-(fg + pt2.y)} stroke="#000" strokeWidth={sw*1.5} />
                                    );
                                 })}

                                 {/* Left Annotations */}
                                 {leftPoints.filter((_, i) => i < 5 || i === leftPoints.length - 1).map((p, i) => (
                                    <g key={`L-${p.id}`}>
                                       <line x1={p.x} y1={-p.y} x2={p.x} y2={-maxY + viewH*0.1} stroke="#000" strokeWidth={sw*0.5} />
                                       <circle cx={p.x} cy={-maxY + viewH*0.08} r={sw*4} fill="#fff" stroke="#000" strokeWidth={sw*0.5} />
                                       <text x={p.x} y={-maxY + viewH*0.08 + textSize*0.3} textAnchor="middle" fontSize={textSize*0.7} fill="#000" fontFamily="sans-serif">
                                          {i + 1}
                                       </text>
                                    </g>
                                 ))}

                                 {/* Right Annotations */}
                                 {rightPoints.filter((_, i) => i < 5 || i === rightPoints.length - 1).map((p, i) => (
                                    <g key={`R-${p.id}`}>
                                       <line x1={p.x} y1={-p.y} x2={p.x} y2={-maxY + viewH*0.1} stroke="#000" strokeWidth={sw*0.5} />
                                       <circle cx={p.x} cy={-maxY + viewH*0.08} r={sw*4} fill="#fff" stroke="#000" strokeWidth={sw*0.5} />
                                       <text x={p.x} y={-maxY + viewH*0.08 + textSize*0.3} textAnchor="middle" fontSize={textSize*0.7} fill="#000" fontFamily="sans-serif">
                                          {i + 1}
                                       </text>
                                    </g>
                                 ))}

                                 {/* Bottom Table - Left */}
                                 <g transform={`translate(${minX}, ${-minY + viewH*0.15})`}>
                                    <text x={0} y={0} fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">PLATAFORMA</text>
                                    <text x={0} y={textSize} fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">ACABADA LADO</text>
                                    <text x={0} y={textSize*2} fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">ESQUERDO</text>
                                    
                                    <text x={viewW*0.15} y={0} fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">PTO.</text>
                                    <text x={viewW*0.15} y={textSize} fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">DIST.</text>
                                    <text x={viewW*0.15} y={textSize*2} fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">COTA</text>

                                    {leftPoints.filter((_, i) => i < 5 || i === leftPoints.length - 1).map((p, i) => (
                                       <g key={`TL-${p.id}`} transform={`translate(${viewW*0.2 + i * viewW*0.06}, 0)`}>
                                          <text x={0} y={0} textAnchor="middle" fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">{i+1}</text>
                                          <text x={0} y={textSize} textAnchor="middle" fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">{p.x.toFixed(3)}</text>
                                          <text x={0} y={textSize*2} textAnchor="middle" fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">{p.y.toFixed(3)}</text>
                                       </g>
                                    ))}
                                 </g>

                                 {/* Bottom Table - Right */}
                                 <g transform={`translate(${minX}, ${-minY + viewH*0.15 + textSize*3.5})`}>
                                    <text x={0} y={0} fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">PLATAFORMA</text>
                                    <text x={0} y={textSize} fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">ACABADA LADO</text>
                                    <text x={0} y={textSize*2} fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">DIREITO</text>
                                    
                                    <text x={viewW*0.15} y={0} fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">PTO.</text>
                                    <text x={viewW*0.15} y={textSize} fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">DIST.</text>
                                    <text x={viewW*0.15} y={textSize*2} fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">COTA</text>

                                    {rightPoints.filter((_, i) => i < 5 || i === rightPoints.length - 1).map((p, i) => (
                                       <g key={`TR-${p.id}`} transform={`translate(${viewW*0.2 + i * viewW*0.06}, 0)`}>
                                          <text x={0} y={0} textAnchor="middle" fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">{i+1}</text>
                                          <text x={0} y={textSize} textAnchor="middle" fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">{p.x.toFixed(3)}</text>
                                          <text x={0} y={textSize*2} textAnchor="middle" fontSize={textSize*0.8} fill="#000" fontFamily="sans-serif">{p.y.toFixed(3)}</text>
                                       </g>
                                    ))}
                                 </g>
                              </svg>
                           </div>
                        </div>
                     );
                  }
               }
            }
         }
      }
      let detailName = "";
      if (category.includes("planta") && viewportBaseAlignments[vpIndex]) {
        detailName = store.alignments.find(a => a.id === viewportBaseAlignments[vpIndex])?.name || "";
            } else if (category.includes("perfil") && viewportBaseProfiles[vpIndex]) {
        const profileIds = viewportBaseProfiles[vpIndex].split(",").filter(Boolean);
        if (profileIds.length > 1) {
           detailName = `${profileIds.length} Perfis`;
        } else if (profileIds.length === 1) {
           const profileId = profileIds[0];
           if (profileId === "projeto") {
              const activeId = viewportBaseAlignments[vpIndex] || store.productionActiveAlignment;
              const activeAlign = store.alignments.find(a => a.id === activeId);
              detailName = activeAlign?.profileName || "Greide Ativo";
           } else {
              const surf = store.surfaces.find(s => s.id === profileId);
              if (surf) {
                 detailName = `${surf.name} (Terreno)`;
              } else {
                 const pl = store.profileLines.find(p => p.id === profileId);
                 if (pl) {
                    detailName = `${pl.description || "Linha"} (${pl.id.split("-")[1]})`;
                 }
              }
           }
        }
      } else if (category.includes("seção tipo") && viewportAssemblies[vpIndex]) {
        detailName = store.assemblies.find(a => a.id === viewportAssemblies[vpIndex])?.name || "";
      } else if (category.includes("seções acabadas") && viewportCorridors[vpIndex]) {
        detailName = store.corridors.find(c => c.id === viewportCorridors[vpIndex])?.name || "";
      }
    
      return (
        <span className="text-slate-500 font-semibold text-lg opacity-50 relative z-10 text-center capitalize">
          {category} {suffix} {detailName && <><br /><span className="text-sm opacity-80">{detailName}</span></>} <br /><span className="text-sm opacity-80">({viewportScales[vpIndex]})</span>
        </span>
      );
    };

    const viewports = [];

    const getVpClass = (idx: number) => 
      `bg-slate-100 flex items-center justify-center cursor-move overflow-hidden relative ${
        selectedViewport === idx ? "ring-4 ring-blue-500/50 z-[300]" : ""
      }`;

    const makeVpRnd = (idx: number, defX: number, defY: number, defW: number, defH: number, suffix?: string, labelPrefix?: string) => {
      const vpKey = `${layout}-${idx}`;
      const defaultPos = { x: Math.round(defX), y: Math.round(defY) };
      const pos = viewportPositions[vpKey] || defaultPos;
      const size = { width: viewportSizes[vpKey]?.w || defW, height: viewportSizes[vpKey]?.h || defH };
      const isSmall = layout === "Seção tipo";

      return (
        <Rnd disableDragging={isSpaceDown} scale={zoom}
          key={`vp-${idx}-${sheetSize}-${orientation}`}
          position={{ x: pos.x, y: pos.y }}
          size={size}
          bounds="parent"
          className={getVpClass(idx)}
          style={frameStyle(idx)}
          data-frame-mm={frameOf(idx).style === "none" ? 0 : frameOf(idx).widthMm}
          onMouseDown={() => setSelectedViewport(idx)}
          onDragStart={() => setSelectedViewport(idx)}
          onDragStop={(e, d) => {
            setViewportPositions((prev: any) => ({
              ...prev,
              [vpKey]: { x: Math.round(d.x), y: Math.round(d.y) }
            }));
          }}
          onResizeStop={(e, direction, ref, delta, position) => {
            setViewportSizes((prev: any) => ({
              ...prev,
              [vpKey]: { w: parseInt(ref.style.width, 10), h: parseInt(ref.style.height, 10) }
            }));
            if (position) {
              setViewportPositions((prev: any) => ({
                ...prev,
                [vpKey]: { x: Math.round(position.x), y: Math.round(position.y) }
              }));
            }
          }}
        >
          <span data-vec-marker="viewport" style={{ display: "none" }} />
          {renderGrid(idx)}
          {renderViewportContent(idx, defW, defH, suffix)}
          {renderNorth(idx)}
          {!viewportCategories[idx]?.toLowerCase().includes("planta") && (
             <span className={`absolute inset-0 flex items-center justify-center text-slate-500 font-semibold ${isSmall ? 'text-sm' : 'text-lg'} opacity-50 relative z-10 text-center capitalize pointer-events-none`}>
               {viewportCategories[idx]} {labelPrefix || suffix || ""} ({viewportScales[idx]})
             </span>
          )}
        </Rnd>
      );
    };

    switch (layoutCfg ? "__cadernos__" : layout) {
      case "__cadernos__": {
        /* Composição livre: uma janela por entrada do layout. As posições/tamanhos
         * só servem de ponto de partida — o utilizador arrasta e redimensiona. */
        const cheias = janelasLayout.filter((j: any) => /planta|perfil/.test(j.tipo)).length || 1;
        const hCheia = Math.max(40, (sh - 20 - 12 * (cheias - 1)) / cheias);
        let yAcc = 0;
        janelasLayout.forEach((j: any, i: number) => {
          const t = String(j.tipo || "");
          const cheia = /planta|perfil/.test(t);
          const artic = t.includes("articula");
          const w = cheia ? sw - 35 : artic ? 120 : (sw - 47) / 2;
          const h = cheia ? hCheia : artic ? 80 : (sh - 32) / 2;
          viewports.push(makeVpRnd(i, artic ? sw - 35 - w : 0, yAcc, w, h));
          yAcc += h + 12;
        });
        break;
      }
      case "Planta":
        viewports.push(makeVpRnd(0, 0, 0, sw - 35, sh - 20));
        break;
      case "Planta e Perfil":
        viewports.push(
          makeVpRnd(0, 0, 0, sw - 35, (sh - 32) / 2, "- Topo"),
          makeVpRnd(1, 0, (sh - 32) / 2 + 12, sw - 35, (sh - 32) / 2, "- Base")
        );
        break;
      case "Perfil":
        viewports.push(
          makeVpRnd(0, 0, 0, sw - 35, (sh - 32) / 2, " 1"),
          makeVpRnd(1, 0, (sh - 32) / 2 + 12, sw - 35, (sh - 32) / 2, " 2")
        );
        break;
      case "Seções acabadas":
        viewports.push(makeVpRnd(0, 0, 0, sw - 35, sh - 20));
        break;
      case "Seção tipo":
        const wQ = (sw - 47) / 2;
        const hQ = (sh - 32) / 2;
        viewports.push(
          makeVpRnd(0, 0, 0, wQ, hQ, undefined, "1"),
          makeVpRnd(1, wQ + 12, 0, wQ, hQ, undefined, "2"),
          makeVpRnd(2, 0, hQ + 12, wQ, hQ, undefined, "3"),
          makeVpRnd(3, wQ + 12, hQ + 12, wQ, hQ, undefined, "4")
        );
        break;
    }

    const carimboW = viewportSizes[`carimbo`]?.w || 210;
    const carimboH = viewportSizes[`carimbo`]?.h || 123;
    const defaultCarimboPos = { x: Math.round((sw - 35) - carimboW), y: Math.round((sh - 20) - carimboH) };
    const carimboPos = viewportPositions[`carimbo`] || defaultCarimboPos;

    return (
      <>
        {viewports}
        {renderTables()}
        {janelasArtic.map((j) => {
          const sel = selectedViewport === (j.id as any);
          return (
            <Rnd disableDragging={isSpaceDown} scale={zoom}
              key={j.id}
              position={{ x: j.x, y: j.y }}
              size={{ width: j.w, height: j.h }}
              bounds="parent"
              minWidth={60}
              minHeight={40}
              onMouseDown={() => setSelectedViewport(j.id as any)}
              onDragStart={() => setSelectedViewport(j.id as any)}
              onDragStop={(e, d) => setJanelasArtic((js) => js.map((x) => x.id === j.id ? { ...x, x: Math.round(d.x), y: Math.round(d.y) } : x))}
              onResizeStop={(e, dir, ref, delta, position) => setJanelasArtic((js) => js.map((x) => x.id === j.id ? {
                ...x,
                w: Math.round(parseInt(ref.style.width, 10)),
                h: Math.round(parseInt(ref.style.height, 10)),
                x: Math.round(position.x),
                y: Math.round(position.y),
              } : x))}
              className={`bg-white border-2 cursor-move shadow-sm select-none overflow-hidden ${sel ? "border-blue-600 ring-2 ring-blue-500/50 z-[300]" : "border-slate-800/40 hover:border-slate-600"}`}
            >
              {renderEsquemaArticulacao(j.id, store.productionActiveAlignment)}
            </Rnd>
          );
        })}
        {!!(layoutCfg && layoutCfg.carimbo) && (
        <Rnd disableDragging={isSpaceDown} scale={zoom}
            key={`carimbo-${layout}-${sheetSize}-${orientation}`}
            position={{ x: carimboPos.x, y: carimboPos.y }}
            size={{ width: carimboW, height: carimboH }}
            bounds="parent"
            onMouseDown={() => setSelectedViewport("carimbo")}
            onDragStart={() => setSelectedViewport("carimbo")}
            onDragStop={(e, d) => {
              setViewportPositions((prev: any) => ({
                ...prev,
                [`carimbo`]: { x: Math.round(d.x), y: Math.round(d.y) }
              }));
            }}
            onDoubleClick={() => {
              if (titleBlock === "predefined") setIsEditingCarimbo(true);
            }}
            onResizeStop={(e, direction, ref, delta, position) => {
               setViewportSizes((prev: any) => ({
                  ...prev,
                  [`carimbo`]: { w: parseInt(ref.style.width, 10), h: parseInt(ref.style.height, 10) }
               }));
               if (position) {
                 setViewportPositions((prev: any) => ({
                   ...prev,
                   [`carimbo`]: { x: Math.round(position.x), y: Math.round(position.y) }
                 }));
               }
            }}
            className={`bg-white flex flex-col justify-between shadow-sm cursor-move overflow-hidden ${
              selectedViewport === "carimbo" ? "ring-4 ring-blue-500/50 z-[300]" : "z-20"
            }`}
            style={frameStyle("carimbo")}
            data-frame-mm={frameOf("carimbo").style === "none" ? 0 : frameOf("carimbo").widthMm}
          >
            <span data-vec-marker="carimbo" style={{ display: "none" }} />
            {titleBlock === "predefined" ? (
              renderArtespCarimbo("sheet")
            ) : (
  
              <div className="flex items-center justify-center h-full text-slate-500 font-medium text-xs">
                Carimbo (Novo)
              </div>
            )}
          </Rnd>
          )}
      </>
    );
  };

  const selectedTable = typeof selectedViewport === "string"
    ? (store.productionTables || []).find(t => t.id === selectedViewport)
    : null;

  const getSelectedSizeKey = () => {
    if (selectedTable) return selectedTable.id;
    if (selectedViewport === "table") return "table";
    if (selectedViewport === "carimbo") return "carimbo";
    return `${layout}-${selectedViewport}`;
  };

  const getSelectedDefaultSize = () => {
    if (selectedTable) return { w: selectedTable.w, h: selectedTable.h };
    if (selectedViewport === "table") return { w: layout === "Seções acabadas" ? 180 : 250, h: layout === "Seções acabadas" ? 100 : 80 };
    if (selectedViewport === "carimbo") return { w: 192, h: 96 };
    if (layout === "Seção tipo") {
      return { w: Math.round((sw - 47) / 2), h: Math.round((sh - 32) / 2) };
    }
    if (layout === "Planta e Perfil" || layout === "Perfil") {
      return { w: Math.round(sw - 35), h: Math.round((sh - 32) / 2) };
    }
    if (layout === "Seções acabadas") {
       const cols = 3; const rows = 4;
       const spacingX = 8; const spacingY = 8;
       return { w: Math.round((sw - 35 - (cols - 1) * spacingX) / cols), h: Math.round((sh - 20 - (rows - 1) * spacingY) / rows) };
    }
    return { w: Math.round(sw - 35), h: Math.round(sh - 20) };
  };

  const getSelectedDefaultPosition = () => {
    if (selectedTable) return { x: selectedTable.x, y: selectedTable.y };
    if (selectedViewport === "table") {
      const tableH = viewportSizes[`table`]?.h || (layout === "Seções acabadas" ? 100 : 80);
      return { x: 0, y: Math.round((sh - 20) - tableH) };
    }
    if (selectedViewport === "carimbo") {
      const carimboW = viewportSizes[`carimbo`]?.w || 210;
      const carimboH = viewportSizes[`carimbo`]?.h || 123;
      return { x: Math.round((sw - 35) - carimboW), y: Math.round((sh - 20) - carimboH) };
    }
    if (typeof selectedViewport === "number") {
      if (layout === "Planta e Perfil" || layout === "Perfil") {
        if (selectedViewport === 1) return { x: 0, y: Math.round((sh - 32) / 2 + 12) };
        return { x: 0, y: 0 };
      }
      if (layout === "Seção tipo") {
        const wQ = Math.round((sw - 47) / 2);
        const hQ = Math.round((sh - 32) / 2);
        if (selectedViewport === 1) return { x: wQ + 12, y: 0 };
        if (selectedViewport === 2) return { x: 0, y: hQ + 12 };
        if (selectedViewport === 3) return { x: wQ + 12, y: hQ + 12 };
        return { x: 0, y: 0 };
      }
    }
    return { x: 0, y: 0 };
  };

  const currentSizeKey = getSelectedSizeKey();
  const currentSize = selectedTable 
    ? { w: selectedTable.w, h: selectedTable.h }
    : (viewportSizes[currentSizeKey] || getSelectedDefaultSize());
  const currentPosKey = getSelectedSizeKey();
  const currentPos = selectedTable 
    ? { x: selectedTable.x, y: selectedTable.y }
    : (viewportPositions[currentPosKey] || getSelectedDefaultPosition());

  return (
    <div className="flex w-full h-full bg-white text-slate-800">
      {/* Center Panel: Sheets */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200">
        <div className="flex border-b border-slate-200 p-2 items-center justify-between bg-slate-50/50">
          <span className="font-semibold text-sm">Visualizador de Layouts</span>
        </div>
        
        {/* Main visualizer area */}
        <div 
          ref={visualizerRef}
          className="flex-1 overflow-hidden p-8 flex items-center justify-center bg-slate-100/50 select-none relative"

          onMouseDown={(e) => {
            if (isSpaceDown || e.button === 1 || e.button === 2) {
               e.preventDefault();
               setIsPanning(true);
               setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
               return;
            }
            if ((e.target as HTMLElement).closest('.react-draggable') || (e.target as HTMLElement).closest('.cursor-move') || (e.target as HTMLElement).closest('button')) return;
            setSelectedViewport(null);
            setIsPanning(true);
            setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
          }}
          onMouseMove={(e) => {
            if (isPanning) {
              setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
            }
          }}
          onMouseUp={() => setIsPanning(false)}
          onMouseLeave={() => setIsPanning(false)}
          style={{ cursor: isSpaceDown || isPanning ? 'grabbing' : 'grab' }}
          onContextMenu={(e) => {
            if (isPanning) e.preventDefault();
          }}
          onWheel={handleSheetWheel}
        >
          <div 
            id="sheet-capture-area"
            className="bg-white shadow-2xl relative shrink-0"
            style={{ 
              width: `${sw}px`,
              height: `${sh}px`,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
            }}
          >
            {/* Margens de segurança */}
            <div 
              className="safety-margin absolute pointer-events-none border border-rose-500/40 z-10" 
              style={{
                top: '10px',
                bottom: '10px',
                left: '25px',
                right: '10px'
              }}
            />
            
            <div 
              className="absolute" 
              style={{
                top: '10px',
                bottom: '10px',
                left: '25px',
                right: '10px'
              }}
            >
              {renderViewports()}
            </div>
          </div>
        </div>

        {/* Bottom toolbar */}
        <div className="h-14 border-t border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            {/* Zoom Controls Bar */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200/80">
              <button 
                onClick={handleZoomOut} 
                className="w-7 h-7 flex items-center justify-center hover:bg-white hover:shadow-xs rounded-md text-slate-700 font-bold text-sm transition-all"
                title="Reduzir zoom (Zoom Out)"
              >
                -
              </button>
              
              <button
                onClick={handleResetZoom}
                className="px-2 py-0.5 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-white hover:shadow-xs rounded-md transition-all min-w-[50px] text-center"
                title="Clique para redefinir zoom para 100%"
              >
                {Math.round(zoom * 100)}%
              </button>

              <button 
                onClick={handleZoomIn} 
                className="w-7 h-7 flex items-center justify-center hover:bg-white hover:shadow-xs rounded-md text-slate-700 font-bold text-sm transition-all"
                title="Aumentar zoom (Zoom In)"
              >
                +
              </button>

              <div className="w-px h-4 bg-slate-300 mx-0.5" />

              <button
                onClick={handleResetZoom}
                className="px-2 py-1 flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-xs rounded-md font-medium transition-all"
                title="Centralizar e redefinir zoom para 100%"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>100%</span>
              </button>

              <button
                onClick={handleFitToScreen}
                className="px-2 py-1 flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-xs rounded-md font-medium transition-all"
                title="Ajustar folha à área visível do ecrã"
              >
                <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Ajustar</span>
              </button>
            </div>

            {/* Page Navigation */}
            <div className="flex items-center gap-2 ml-2">
              <button 
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                className="px-3 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-xs font-medium transition-colors disabled:opacity-40"
                disabled={currentPage === 1}
              >
                Anterior
              </button>
              <span className="text-xs font-semibold text-slate-700 px-1">
                Folha {currentPage} de {totalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                className="px-3 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-xs font-medium transition-colors disabled:opacity-40"
                disabled={currentPage === totalPages}
              >
                Próxima
              </button>
            </div>
          </div>
          
          <button 
            className="px-6 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm transition-colors shadow-xs"
            onClick={handlePrintPDF}
            disabled={isPrinting}
          >
            {isPrinting ? "Gerando..." : "Imprimir PDF"}
          </button>
        </div>
      </div>

      {/* Right Panel: Editor de produção */}
      <div className="w-80 flex flex-col bg-[#0f172a] shrink-0 border-l border-slate-200">
        <div className="flex border-b border-slate-200 p-3 items-center bg-white shrink-0">
          <span className="font-semibold text-sm">Editor de Layouts</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        
          {selectedViewport !== null && (
            <div className="flex flex-col gap-4 bg-slate-800 p-4 rounded-lg border border-slate-700 shadow-inner">
              <h4 className="text-white font-medium text-sm border-b border-slate-600 pb-2">
                Dimensões ({typeof selectedViewport === "number" ? `Viewport ${selectedViewport + 1}` : selectedTable ? `Tabela: ${selectedTable.title}` : selectedViewport === "table" ? "Tabela" : "Carimbo"})
              </h4>
              <div className="flex gap-4">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Posição X
                  </label>
                  <input
                    type="number"
                    value={currentPos.x}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (selectedTable) {
                        store.updateProductionTable(selectedTable.id, { x: val });
                      } else {
                        setViewportPositions((prev: any) => ({ ...prev, [currentPosKey]: { ...currentPos, x: val } }));
                      }
                    }}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Posição Y
                  </label>
                  <input
                    type="number"
                    value={currentPos.y}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (selectedTable) {
                        store.updateProductionTable(selectedTable.id, { y: val });
                      } else {
                        setViewportPositions((prev: any) => ({ ...prev, [currentPosKey]: { ...currentPos, y: val } }));
                      }
                    }}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col gap-2 flex-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Largura
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const newVal = Math.max(50, currentSize.w - 20);
                          if (selectedTable) store.updateProductionTable(selectedTable.id, { w: newVal });
                          else setViewportSizes((prev: any) => ({ ...prev, [currentSizeKey]: { ...currentSize, w: newVal } }));
                        }}
                        className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-xs font-bold transition-colors"
                        title="-20"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newVal = currentSize.w + 20;
                          if (selectedTable) store.updateProductionTable(selectedTable.id, { w: newVal });
                          else setViewportSizes((prev: any) => ({ ...prev, [currentSizeKey]: { ...currentSize, w: newVal } }));
                        }}
                        className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-xs font-bold transition-colors"
                        title="+20"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    value={currentSize.w}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (selectedTable) {
                        store.updateProductionTable(selectedTable.id, { w: val });
                      } else {
                        setViewportSizes((prev: any) => ({ ...prev, [currentSizeKey]: { ...currentSize, w: val } }));
                      }
                    }}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Altura
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const newVal = Math.max(30, currentSize.h - 20);
                          if (selectedTable) store.updateProductionTable(selectedTable.id, { h: newVal });
                          else setViewportSizes((prev: any) => ({ ...prev, [currentSizeKey]: { ...currentSize, h: newVal } }));
                        }}
                        className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-xs font-bold transition-colors"
                        title="-20"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newVal = currentSize.h + 20;
                          if (selectedTable) store.updateProductionTable(selectedTable.id, { h: newVal });
                          else setViewportSizes((prev: any) => ({ ...prev, [currentSizeKey]: { ...currentSize, h: newVal } }));
                        }}
                        className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-xs font-bold transition-colors"
                        title="+20"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    value={currentSize.h}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (selectedTable) {
                        store.updateProductionTable(selectedTable.id, { h: val });
                      } else {
                        setViewportSizes((prev: any) => ({ ...prev, [currentSizeKey]: { ...currentSize, h: val } }));
                      }
                    }}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {selectedTable && (
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-700/60">
                  <span className="text-[11px] font-medium text-slate-400">Ações Rápidas de Dimensionamento:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        let smartW = 524;
                        let smartH = 180;
                        if (selectedTable.type === "alignment" || selectedTable.type === "curves") {
                          smartW = 580;
                          smartH = 180;
                        } else if (selectedTable.type === "accel" || selectedTable.type === "decel") {
                          smartW = 140;
                          smartH = 26;
                        } else if (selectedTable.type === "nf") {
                          smartW = 90;
                          smartH = 60;
                        } else if (selectedTable.type === "custom" && selectedTable.customContent) {
                          try {
                            const parsed = JSON.parse(selectedTable.customContent);
                            const colCount = parsed.headers?.length || 4;
                            const rowCount = parsed.rows?.length || 3;
                            smartW = Math.max(260, colCount * 60);
                            smartH = Math.max(90, 45 + rowCount * 22);
                          } catch(e) {}
                        }
                        store.updateProductionTable(selectedTable.id, { w: smartW, h: smartH });
                      }}
                      className="px-2 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                      title="Ajusta o tamanho para exibir a tabela de forma ideal"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Auto-Ajustar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        store.updateProductionTable(selectedTable.id, { 
                          w: currentSize.w + 50,
                          h: currentSize.h + 30
                        });
                      }}
                      className="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
                      title="Expandir largura em +50 e altura em +30"
                    >
                      <span>+ Expandir</span>
                    </button>
                  </div>
                </div>
              )}

              {(() => {
                const fKey = typeof selectedViewport === "number"
                  ? String(selectedViewport)
                  : selectedTable ? selectedTable.id : "carimbo";
                const f = frameOf(fKey);
                return (
                  <div className="flex flex-col gap-2 pt-2 border-t border-slate-700/60">
                    <span className="text-[11px] font-medium text-slate-400">Linha da moldura:</span>
                    <div className="flex gap-2">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Espessura (mm)</label>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={f.widthMm}
                          onChange={(e) => store.setProductionFrame(fKey, { widthMm: Number(e.target.value) })}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Cor</label>
                        <input
                          type="color"
                          value={f.color}
                          onChange={(e) => store.setProductionFrame(fKey, { color: e.target.value })}
                          className="h-[34px] w-12 bg-slate-700 border border-slate-600 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-500 uppercase tracking-wider">Estilo</label>
                      <select
                        value={f.style}
                        onChange={(e) => store.setProductionFrame(fKey, { style: e.target.value as any })}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                      >
                        <option value="solid">Contínua</option>
                        <option value="dashed">Tracejada</option>
                        <option value="none">Sem moldura</option>
                      </select>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          
          {selectedTable ? (
            <div className="flex flex-col gap-4 bg-slate-800 p-4 rounded-lg border border-slate-700 shadow-inner">
              <h4 className="text-white font-medium text-sm border-b border-slate-600 pb-2">
                Propriedades da Tabela
              </h4>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Título da Tabela
                </label>
                <input
                  type="text"
                  value={selectedTable.title}
                  onChange={(e) => store.updateProductionTable(selectedTable.id, { title: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Tipo de Tabela
                </label>
                <select
                  value={selectedTable.type}
                  onChange={(e) => store.updateProductionTable(selectedTable.id, { type: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                >
                  <option value="alignment">Tabela de Alinhamento Horizontal</option>
                  <option value="accel">Faixa de Aceleração</option>
                  <option value="decel">Faixa de Desaceleração</option>
                  <option value="nf">Tabela de Narizes Físicos</option>
                  <option value="custom">Personalizada</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Alinhamento
                </label>
                <select
                  value={selectedTable.alignmentId || store.productionActiveAlignment || store.activeAlignmentId || (store.alignments?.[0]?.id ?? "")}
                  onChange={(e) => store.updateProductionTable(selectedTable.id, { alignmentId: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                >
                  {(store.alignments || []).map((align: any) => (
                    <option key={align.id} value={align.id}>
                      {align.name || `Alinhamento (${align.id})`}
                    </option>
                  ))}
                </select>
              </div>

              {(selectedTable.type === "accel" || selectedTable.type === "decel") && (
                <span className="text-[10px] text-slate-500 leading-snug">
                  A tabela usa a interseção do alinhamento selecionado acima: comprimento da faixa e do taper vêm do assistente de interseção, a rampa média é lida do perfil e o fator de conversão sai da tabela do DNIT.
                </span>
              )}

              {selectedTable.type === "nf" && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Tipo padrão do nariz
                  </label>
                  <select
                    value={(selectedTable as any).tipoNariz ?? "entrada"}
                    onChange={(e) => store.updateProductionTable(selectedTable.id, { tipoNariz: e.target.value } as any)}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                  >
                    <option value="entrada">Entrada — 2,00 m</option>
                    <option value="saida">Saída — 1,00 m</option>
                    <option value="misto">Misto — 1,50 m</option>
                  </select>
                  <span className="text-[10px] text-slate-500 leading-snug">
                    Usado só para narizes sem tipo definido na janela de Narizes Teóricos. A tabela lista os narizes confirmados na planta.
                  </span>
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setIsEditingTable(true)}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
                >
                  Editar Conteúdo
                </button>
                <button
                  onClick={() => store.removeProductionTable(selectedTable.id)}
                  className="py-2 px-3 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1"
                  title="Excluir Tabela"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir
                </button>
              </div>
            </div>
          ) : typeof selectedViewport === "number" ? (
            <div className="flex flex-col gap-4 bg-slate-800 p-4 rounded-lg border border-slate-700 shadow-inner">
              <h4 className="text-white font-medium text-sm border-b border-slate-600 pb-2 flex items-center justify-between gap-2">
                <span>Configurações do Viewport {selectedViewport + 1}</span>
                {(viewportCategories[selectedViewport]?.toLowerCase() || "viewport planta").includes("planta") && (() => {
                  const ligada = panVpAtivo === selectedViewport;
                  const k = panKey(selectedViewport, currentPage);
                  const deslocada = !!vpPan[k] && (Math.abs(vpPan[k].dx) > 1e-6 || Math.abs(vpPan[k].dy) > 1e-6);
                  return (
                    <span className="flex items-center gap-1">
                      {deslocada && (
                        <button
                          onClick={() => setVpPan((p) => { const n = { ...p }; delete n[k]; return n; })}
                          title="Centrar de novo a área do projeto nesta folha"
                          className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500"
                        >Centrar</button>
                      )}
                      <button
                        onClick={() => setPanVpAtivo(ligada ? null : selectedViewport)}
                        title={ligada
                          ? "Mover área do projeto: LIGADO — arraste dentro da janela. Clique para desligar."
                          : "Mover área do projeto dentro do viewport (on/off)"}
                        className={`p-1.5 rounded border transition-colors ${ligada
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "bg-slate-700 border-slate-600 text-slate-300 hover:text-white hover:border-slate-500"}`}
                      >
                        <Hand className="w-4 h-4" />
                      </button>
                    </span>
                  );
                })()}
              </h4>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Escala
                </label>
                <select
                  value={viewportScales[selectedViewport]}
                  onChange={(e) => setViewportScale(selectedViewport, e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                >
                  <option value="1:2000">1:2000</option>
                  <option value="1:1000">1:1000</option>
                  <option value="1:500">1:500</option>
                  <option value="1:200">1:200</option>
                  <option value="1:50">1:50</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Símbolo Norte
                </label>
                <select
                  value={viewportNorths[selectedViewport]}
                  onChange={(e) => setViewportNorth(selectedViewport, e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                >
                  <option value="Sem símbolo">Sem símbolo</option>
                  <option value="Símbolo 1">Símbolo 1</option>
                  <option value="Símbolo 2">Símbolo 2</option>
                  <option value="Símbolo 3">Símbolo 3</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Malha de coordenadas
                </label>
                <button
                  onClick={() => setGridCfgOpen(selectedViewport)}
                  className="w-full flex items-center justify-between gap-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded px-2 py-1.5 text-sm text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Grid3x3 size={14} className="text-blue-400" />
                    Configurar malha
                  </span>
                  <span className={`text-xs font-semibold ${viewportGrids[selectedViewport] === "Ligar" ? "text-emerald-400" : "text-slate-400"}`}>
                    {viewportGrids[selectedViewport] === "Ligar" ? "Ligada" : "Desligada"}
                  </span>
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Categoria de Viewport
                </label>
                <select
                  value={viewportCategories[selectedViewport] || "viewport planta"}
                  onChange={(e) => setViewportCategory(selectedViewport, e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                >
                  <option value="viewport planta">Viewport Planta</option>
                  <option value="viewport perfil">Viewport Perfil</option>
                  <option value="viewport seção tipo">Viewport Seção Tipo</option>
                  <option value="viewport seções acabadas">Viewport Seções Acabadas</option>
                  <option value="viewport articulação de folhas">Viewport Articulação de Folhas</option>
                </select>
              </div>

              {/* Dynamic Context Selector based on Category */}
              {["viewport planta", "viewport perfil", "viewport articulação de folhas"].includes(viewportCategories[selectedViewport]?.toLowerCase() || "viewport planta") && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Alinhamento Base
                  </label>
                  <select
                    value={viewportBaseAlignments[selectedViewport] || ""}
                    onChange={(e) => setViewportBaseAlignment(selectedViewport, e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                  >
                    <option value="">Selecione um alinhamento...</option>
                    {store.alignments.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {(viewportCategories[selectedViewport]?.toLowerCase() || "viewport planta").includes("planta") && (() => {
                const sel = viewportBases[selectedViewport] || [];
                return (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Bases do Projeto
                    </label>
                    <button
                      onClick={() => setBasesModalVp(selectedViewport)}
                      className="w-full flex items-center justify-between gap-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                    >
                      <span className="flex items-center gap-2"><Boxes className="w-4 h-4 text-blue-400" /> Incluir Bases</span>
                      <span className="text-[11px] text-slate-300">
                        {sel.length === 0 ? "Todas" : `${sel.length} selecionada${sel.length === 1 ? "" : "s"}`}
                      </span>
                    </button>
                    <p className="text-[10px] text-slate-500 m-0 leading-relaxed">
                      Sem bases escolhidas a janela desenha todo o projeto. Escolhendo bases, desenha apenas os elementos que lhes pertencem.
                    </p>
                    <button
                      onClick={() => setArtModalOpen(true)}
                      className="w-full flex items-center justify-between gap-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded px-2 py-1.5 text-sm text-white mt-1"
                    >
                      <span className="flex items-center gap-2"><Scissors className="w-4 h-4 text-blue-400" /> Linhas de articulação</span>
                      <span className="text-[11px] text-slate-300">{Math.max(0, alignmentPages.length - 1)} linhas</span>
                    </button>
                    <label className="flex items-center gap-2 cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        checked={mostrarLimitesArticulacao}
                        onChange={(e) => setMostrarLimitesArticulacao(e.target.checked)}
                        className="rounded bg-slate-800 border-slate-500 text-red-500 focus:ring-red-500"
                      />
                      <span className="text-[11px] text-slate-300">Mostrar limites de articulação (depuração)</span>
                    </label>
                    {(((store as any).planScene?.ribbons || []).length === 0) && (
                      <p className="text-[10px] text-amber-400/90 m-0 leading-relaxed">
                        O desenho do corredor ainda não foi gerado nesta sessão. Abra uma vez o menu de planta (SEÇÕES / CORREDORES) para a planta calcular o desenho — a Produção mostra-o depois tal e qual.
                      </p>
                    )}
                  </div>
                );
              })()}
              {viewportCategories[selectedViewport]?.toLowerCase() === "viewport seções acabadas" && (
                <div className="flex flex-col gap-4 mt-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Distância entre Estacas (m)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={store.productionCrossSectionInterval}
                      onChange={(e) => store.setProductionCrossSectionInterval(Number(e.target.value))}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={store.productionCrossSectionIncludeKeyPoints}
                      onChange={(e) => store.setProductionCrossSectionIncludeKeyPoints(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-500 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-white">Incluir Pontos Notáveis (Planta)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={store.productionCrossSectionIncludeProfileKeyPoints}
                      onChange={(e) => store.setProductionCrossSectionIncludeProfileKeyPoints(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-500 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-white">Incluir Pontos Notáveis (Perfil)</span>
                  </label>
                </div>
              )}

                            {viewportCategories[selectedViewport]?.toLowerCase() === "viewport perfil" && (() => {
                const selectedProfileIds = (viewportBaseProfiles[selectedViewport] || "").split(",").filter(Boolean);
                const toggleProfileId = (id: string) => {
                    let newIds = [...selectedProfileIds];
                    if (newIds.includes(id)) {
                        newIds = newIds.filter(i => i !== id);
                    } else {
                        newIds.push(id);
                    }
                    setViewportBaseProfile(selectedViewport, newIds.join(","));
                };
                return (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Alinhamentos Verticais
                  </label>
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto bg-slate-700 border border-slate-600 rounded p-2 text-sm text-white">
                    {!viewportBaseAlignments[selectedViewport] && !store.productionActiveAlignment ? (
                     <span className="text-slate-400 italic text-xs">Selecione um Alinhamento Base</span>
                    ) : (
                    <>
                                        {(() => {
                      const activeId = viewportBaseAlignments[selectedViewport] || store.productionActiveAlignment;
                      const activeAlign = store.alignments.find(a => a.id === activeId);
                      const greideName = activeAlign?.profileName || "Greide Ativo";
                      return (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={selectedProfileIds.includes("projeto")} onChange={() => toggleProfileId("projeto")} className="rounded bg-slate-800 border-slate-500 text-blue-500 focus:ring-blue-500" />
                          <span>{greideName}</span>
                        </label>
                      );
                    })()}
                    {store.surfaces.filter(s => s.isVisible !== false).map(s => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={selectedProfileIds.includes(s.id)} onChange={() => toggleProfileId(s.id)} className="rounded bg-slate-800 border-slate-500 text-blue-500 focus:ring-blue-500" />
                        <span>{s.name} (Terreno)</span>
                      </label>
                    ))}
                    {(() => {
                        const activeId = viewportBaseAlignments[selectedViewport] || store.productionActiveAlignment;
                        if (!activeId) return null;
                        
                        const featAligns = store.alignments.filter(feat => {
                            if (!feat.id.startsWith("feat-")) return false;
                            const corr = store.corridors.find(c => feat.id.startsWith("feat-" + c.id));
                            return corr && corr.alignmentId === activeId;
                        });
                        const plines = store.profileLines.filter(pl => pl.alignmentId === activeId);
                        
                        return (
                            <>
                                {featAligns.map(feat => (
                                    <label key={feat.id} className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={selectedProfileIds.includes(feat.id)} onChange={() => toggleProfileId(feat.id)} className="rounded bg-slate-800 border-slate-500 text-blue-500 focus:ring-blue-500" />
                                        <span>{feat.name}</span>
                                    </label>
                                ))}
                                {plines.map(pl => (
                                    <label key={pl.id} className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={selectedProfileIds.includes(pl.id)} onChange={() => toggleProfileId(pl.id)} className="rounded bg-slate-800 border-slate-500 text-blue-500 focus:ring-blue-500" />
                                        <span>{pl.description || "Linha"} ({pl.id.split("-")[1]})</span>
                                    </label>
                                ))}
                            </>
                        );
                    })()}
                    </>
                    )}
                  </div>
                </div>
              );})()}

              {viewportCategories[selectedViewport]?.toLowerCase() === "viewport seção tipo" && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Seção Tipo Base
                  </label>
                  <select
                    value={viewportAssemblies[selectedViewport] || ""}
                    onChange={(e) => setViewportAssembly(selectedViewport, e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                  >
                    <option value="">Selecione uma seção tipo...</option>
                    {store.assemblies.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {viewportCategories[selectedViewport]?.toLowerCase() === "viewport perfil" && (
                <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-600">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Profile View (Faixas)
                    </label>
                  </div>
                  <button 
                    onClick={() => setBandSetModalOpen(selectedViewport)}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
                  >
                    PROFILE VIEW
                  </button>
                  {/* Basic summary of current bands */}
                  {(() => {
                    const bands = store.productionViewportProfileBands?.[selectedViewport] || [];
                    if (bands.length === 0) return <div className="text-xs text-slate-500 italic mt-1">Nenhuma faixa configurada.</div>;
                    return (
                      <div className="flex flex-col gap-1 mt-2">
                        {bands.map((b, idx) => (
                           <div key={idx} className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded truncate border border-slate-600">
                              {idx + 1}. {b.type}
                           </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {viewportCategories[selectedViewport]?.toLowerCase() === "viewport seções acabadas" && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Corredor Base
                  </label>
                  <select
                    value={viewportCorridors[selectedViewport] || ""}
                    onChange={(e) => setViewportCorridor(selectedViewport, e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                  >
                    <option value="">Selecione um corredor...</option>
                    {store.corridors.map(c => (
                      <option key={c.id} value={c.id}>{c.name || "Corredor"}</option>
                    ))}
                  </select>
                </div>
              )}

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 bg-slate-800/50 rounded-lg border border-slate-700/50 border-dashed">
              <span className="text-slate-400 text-sm text-center px-4">
                Selecione um Viewport para editar suas propriedades.
              </span>
            </div>
          )}

          {/* Caixa 1: LAYOUT ATIVO — eixo base, folha/orientação/escala e janelas */}
          {layoutCfg && (() => {
            const patchLayoutCfg = (patch: any) => {
              const setC = (store as any).setProductionCadernos;
              setC(cadernosProd.map((c: any) => c.id !== cadernoProdAtivo?.id ? c : {
                ...c,
                layouts: (c.layouts || []).map((l: any) => l.id === layoutCfg.id ? { ...l, ...patch } : l),
              }));
            };
            const sel = "w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:border-blue-600 outline-none";
            const escalas = ["1:100", "1:200", "1:250", "1:500", "1:1000", "1:2000", "1:2500", "1:5000"];
            const tipos = [
              ["viewport planta", "Viewport Planta"],
              ["viewport perfil", "Viewport Perfil"],
              ["viewport seção tipo", "Viewport Seção Tipo"],
              ["viewport seções acabadas", "Viewport Seções Acabadas"],
              ["viewport articulação de folhas", "Articulação de Folhas"],
            ];
            return (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Layout — {layoutCfg.nome}
                </label>
                <select
                  value={store.productionActiveAlignment || ""}
                  onChange={(e) => store.loadProductionConfig(e.target.value, store.productionLayout)}
                  className={sel}
                >
                  <option value="" disabled>Alinhamento base…</option>
                  {store.alignments.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div className="grid grid-cols-3 gap-1.5">
                  <select value={layoutCfg.folha} className={sel}
                    onChange={(e) => { patchLayoutCfg({ folha: e.target.value }); store.setProductionSheetSize(e.target.value); }}>
                    {["A0", "A1", "A2", "A3", "A4"].map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select value={layoutCfg.orientacao} className={sel}
                    onChange={(e) => { patchLayoutCfg({ orientacao: e.target.value }); store.setProductionSheetOrientation(e.target.value as any); }}>
                    <option value="Landscape">Paisagem</option>
                    <option value="Portrait">Retrato</option>
                  </select>
                  <select value={layoutCfg.escala} className={sel}
                    onChange={(e) => patchLayoutCfg({ escala: e.target.value })}>
                    {escalas.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Janelas ({janelasLayout.length})
                  </span>
                  <button onClick={() => setPaletaAberta((v) => !v)} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-semibold">
                    <Plus className="w-3.5 h-3.5" /> Adicionar janela
                  </button>
                </div>
                {paletaAberta && (
                  <div className="flex flex-col gap-1 bg-slate-50 border border-slate-200 rounded p-1.5">
                    {tipos.map(([t, nome]) => (
                      <button key={t} className="text-left text-xs px-2 py-1.5 rounded hover:bg-blue-50 hover:text-blue-700 text-slate-700"
                        onClick={() => {
                          setPaletaAberta(false);
                          patchLayoutCfg({ janelas: [...janelasLayout, { id: `${layoutCfg.id}-j${Date.now()}`, tipo: t }] });
                        }}>{nome}</button>
                    ))}
                    <button className="text-left text-xs px-2 py-1.5 rounded hover:bg-blue-50 hover:text-blue-700 text-slate-700"
                      onClick={() => { setPaletaAberta(false); store.addProductionTable(); }}>Tabela</button>
                    {!layoutCfg.carimbo && (
                      <button className="text-left text-xs px-2 py-1.5 rounded hover:bg-blue-50 hover:text-blue-700 text-slate-700"
                        onClick={() => { setPaletaAberta(false); patchLayoutCfg({ carimbo: true }); }}>Carimbo</button>
                    )}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  {janelasLayout.map((j: any, i: number) => (
                    <div key={j.id}
                      onClick={() => setSelectedViewport(i)}
                      className={`flex items-center justify-between px-2 py-1.5 rounded text-xs border cursor-pointer ${
                        selectedViewport === i ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold" : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}>
                      <span className="truncate flex-1">{i + 1}. {(tipos.find((t) => t[0] === j.tipo) || ["", j.tipo])[1]}</span>
                      <button onClick={(e) => { e.stopPropagation(); patchLayoutCfg({ janelas: janelasLayout.filter((x: any) => x.id !== j.id) }); }}
                        className="text-slate-400 hover:text-red-500 p-0.5 rounded" title="Remover janela">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {(store.productionTables || []).map((t: any, idx: number) => (
                    <div key={t.id}
                      onClick={() => setSelectedViewport(t.id)}
                      className={`flex items-center justify-between px-2 py-1.5 rounded text-xs border cursor-pointer ${
                        selectedViewport === t.id ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold" : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}>
                      <span className="truncate flex-1">{t.title || `Tabela ${idx + 1}`}</span>
                      <button onClick={(e) => { e.stopPropagation(); store.removeProductionTable(t.id); }}
                        className="text-slate-400 hover:text-red-500 p-0.5 rounded" title="Excluir tabela">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {layoutCfg.carimbo && (
                    <div
                      onClick={() => setSelectedViewport("carimbo")}
                      className={`flex items-center justify-between px-2 py-1.5 rounded text-xs border cursor-pointer ${
                        selectedViewport === "carimbo" ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold" : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}>
                      <span className="truncate flex-1">Carimbo</span>
                      <button onClick={(e) => { e.stopPropagation(); patchLayoutCfg({ carimbo: false }); }}
                        className="text-slate-400 hover:text-red-500 p-0.5 rounded" title="Remover carimbo">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Caixa 2: Carimbo — só quando o layout tem um carimbo */}
          {!!(layoutCfg && layoutCfg.carimbo) && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Carimbo
              </label>
              {titleBlock === "predefined" && (
                <button
                  onClick={() => setIsEditingCarimbo(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium underline"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Configurar
                </button>
              )}
            </div>
            <div className="flex p-1 bg-white rounded border border-slate-300">
              <button
                className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${titleBlock === "predefined" ? "bg-slate-200 text-slate-800 shadow-sm font-semibold" : "text-slate-500 hover:text-slate-800"}`}
                onClick={() => {
                  setTitleBlock("predefined");
                  setIsEditingCarimbo(true);
                }}
              >
                Pré-definido
              </button>
              <button
                className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${titleBlock === "new" ? "bg-slate-200 text-slate-800 shadow-sm font-semibold" : "text-slate-500 hover:text-slate-800"}`}
                onClick={() => setTitleBlock("new")}
              >
                Novo
              </button>
            </div>
          </div>
          )}


        </div>
      </div>

      {/* Modal: LINHAS DE ARTICULAÇÃO — estaca/km, ângulo com o eixo, rótulo */}
      {artModalOpen && (() => {
        const nP = alignmentPages.length;
        const staDe = (i: number) => (i === 0 ? alignmentPages[0]?.startStation ?? 0 : alignmentPages[i - 1]?.endStation ?? 0);
        /* Só existem linhas de articulação nos limites INTERNOS entre folhas —
         * as estacas inicial e final do eixo não levam linha. */
        const linhas = Array.from({ length: Math.max(0, nP - 1) }, (_, k) => ({ i: k + 1, sta: staDe(k + 1) }));
        const nomeEixo = store.alignments.find((a: any) => a.id === (viewportBaseAlignments[selectedViewport] || store.productionActiveAlignment))?.name || "eixo base";
        const inp = "bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[12px] text-white focus:border-blue-500 outline-none";
        return (
          <div className="fixed inset-0 z-[392] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onMouseDown={() => setArtModalOpen(false)}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl text-slate-100 flex flex-col max-h-[88vh]" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-blue-400" /> Linhas de articulação — {nomeEixo}
                </span>
                <button onClick={() => setArtModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
              </div>

              <div className="border-b border-slate-700 px-5 py-3 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-[11px] text-slate-300">
                  Cor
                  <input type="color" value={artEstilo.cor}
                    onChange={(e) => setArtEstilo({ ...artEstilo, cor: e.target.value })}
                    className="w-8 h-6 bg-transparent border border-slate-600 rounded cursor-pointer" />
                </label>
                <label className="flex items-center gap-2 text-[11px] text-slate-300">
                  Espessura
                  <input type="number" step="0.1" min="0.2" max="3" value={artEstilo.espessura}
                    onChange={(e) => setArtEstilo({ ...artEstilo, espessura: Number(e.target.value) })}
                    className={`${inp} w-16`} />
                </label>
                <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={artEstilo.tracejada}
                    onChange={(e) => setArtEstilo({ ...artEstilo, tracejada: e.target.checked })}
                    className="rounded bg-slate-800 border-slate-500 text-blue-500 focus:ring-blue-500" />
                  Tracejada
                </label>
                <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={artEstilo.mostrarRotulos}
                    onChange={(e) => setArtEstilo({ ...artEstilo, mostrarRotulos: e.target.checked })}
                    className="rounded bg-slate-800 border-slate-500 text-blue-500 focus:ring-blue-500" />
                  Mostrar rótulos
                </label>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
                <div className="grid grid-cols-[52px_112px_150px_74px_1fr_60px_28px] gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                  <span>Linha</span><span>Km (m)</span><span>Km · Estaca</span><span>Âng. (°)</span><span>Rótulo</span><span>Folha</span><span></span>
                </div>
                {linhas.length === 0 && (
                  <p className="text-xs text-slate-400 italic m-0">
                    O traçado cabe numa folha — não há linhas de articulação.
                  </p>
                )}
                {linhas.map(({ i, sta }) => {
                  const e = artEdits[i] || {};
                  return (
                    <div key={i} className="grid grid-cols-[52px_112px_150px_74px_1fr_60px_28px] gap-2 items-center bg-slate-800/60 border border-slate-700 rounded px-1 py-1.5">
                      <span className="text-[11px] text-slate-300 pl-1">L{i}</span>
                      <input type="number" step="1" value={Number(sta.toFixed(2))}
                        onChange={(ev) => setArt(i, { sta: Number(ev.target.value) })}
                        className={`${inp} w-full`} />
                      <span className="text-[11px] text-slate-400 font-mono">{fmtKm(sta)} · {fmtEstaca(sta)}</span>
                      <input type="number" step="1" min="20" max="160" value={e.ang ?? 90}
                        onChange={(ev) => setArt(i, { ang: Number(ev.target.value) })}
                        className={`${inp} w-full`} />
                      <input type="text" value={e.texto ?? ""} placeholder="automático (FOLHA n)"
                        onChange={(ev) => setArt(i, { texto: ev.target.value })}
                        className={`${inp} w-full`} />
                      <button
                        onClick={() => setCurrentPage(Math.min(Math.max(i, 1), nP))}
                        className="text-[11px] text-blue-400 hover:text-blue-300"
                      >{i}|{i + 1}</button>
                      <label className="flex items-center justify-center" title="Ocultar esta linha">
                        <input type="checkbox" checked={!e.oculta}
                          onChange={(ev) => setArt(i, { oculta: !ev.target.checked })}
                          className="rounded bg-slate-900 border-slate-500 text-blue-500 focus:ring-blue-500" />
                      </label>
                    </div>
                  );
                })}
                <p className="text-[10px] text-slate-500 m-0 mt-1 leading-relaxed">
                  A estaca de cada linha é o limite comum das duas folhas vizinhas — mover uma linha reparte o desenho e o recorte das folhas (fica travada entre as linhas vizinhas). O ângulo é medido a partir do eixo no sentido da estaqueamento: 90° = perpendicular. Desmarcar a caixa da direita oculta a linha sem alterar o recorte.
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-slate-700 px-5 py-3">
                <button onClick={() => setArtEdits({})} className="text-xs text-slate-400 hover:text-white">Restaurar padrão</button>
                <button onClick={() => setArtModalOpen(false)} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 rounded">Concluir</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Incluir Bases na janela (só lê as bases criadas no DRAWING) */}
      {basesModalVp !== null && (() => {
        const vp = basesModalVp;
        const sel = viewportBases[vp] || [];
        const bases = store.bases || [];
        const toggle = (id: string) =>
          setViewportBases(vp, sel.includes(id) ? sel.filter((b) => b !== id) : [...sel, id]);
        return (
          <div className="fixed inset-0 z-[390] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onMouseDown={() => setBasesModalVp(null)}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md text-slate-100 flex flex-col max-h-[85vh]" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-blue-400" /> Incluir Bases — Janela {vp + 1}
                </span>
                <button onClick={() => setBasesModalVp(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
                {bases.length === 0 ? (
                  <p className="text-xs text-slate-400 italic m-0">
                    Ainda não existem bases. Crie-as no menu DRAWING, painel Bases.
                  </p>
                ) : (
                  bases.map((b: any) => {
                    const n = Object.values(b.members || {}).reduce((a: number, v: any) => a + (Array.isArray(v) ? v.length : 0), 0);
                    return (
                      <label key={b.id} className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded px-2.5 py-2 cursor-pointer hover:border-slate-600">
                        <input
                          type="checkbox"
                          checked={sel.includes(b.id)}
                          onChange={() => toggle(b.id)}
                          className="rounded bg-slate-900 border-slate-500 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                        <span className="text-sm">{b.name}</span>
                        <span className="text-[11px] text-slate-500 ml-auto">{n} elemento{n === 1 ? "" : "s"}</span>
                      </label>
                    );
                  })
                )}
                <p className="text-[10px] text-slate-500 m-0 mt-1 leading-relaxed">
                  Nenhuma base selecionada = a janela desenha todo o projeto. Isto não altera nada no projeto, apenas o que esta janela mostra.
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-slate-700 px-5 py-3">
                <button onClick={() => setViewportBases(vp, [])} className="text-xs text-slate-400 hover:text-white">Limpar seleção</button>
                <button onClick={() => setBasesModalVp(null)} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 rounded">Concluir</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal for Carimbo Pré-definido Configuration */}
      {isEditingCarimbo && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh] text-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    Elementos da Janela do Carimbo
                    <span className="text-xs bg-blue-500/20 text-blue-300 font-medium px-2 py-0.5 rounded-full border border-blue-500/30">
                      Pré-definido
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Defina a visibilidade dos símbolos e textos que compõem a caixa de carimbo.
                  </p>
                </div>
              </div>
              
              <button
                onClick={() => setIsEditingCarimbo(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Global Actions Bar */}
            <div className="px-6 py-3 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-slate-400 font-medium">Estado dos elementos:</span>
                <span className="bg-emerald-500/20 text-emerald-300 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  {Object.values(carimboElements).filter(Boolean).length} de {Object.keys(carimboElements).length} Ativos
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsEditingTextStyles(true)}
                  className="px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 hover:text-amber-200 rounded-md font-semibold border border-amber-500/40 transition-all flex items-center gap-1.5 shadow-sm"
                  title="Abrir caixa para editar estilo, cor, altura e formatação dos textos do carimbo"
                >
                  <Type className="w-3.5 h-3.5 text-amber-400" />
                  <span>Configurar Estilo dos Textos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAllCarimboElements(true)}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white rounded-md font-medium transition-colors flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  Ativar Todos
                </button>
                <button
                  type="button"
                  onClick={() => setAllCarimboElements(false)}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white rounded-md font-medium transition-colors flex items-center gap-1.5"
                >
                  <EyeOff className="w-3.5 h-3.5 text-rose-400" />
                  Desativar Todos
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              
              {/* LIVE PREVIEW DA JANELA DO CARIMBO */}
              <div className="flex flex-col gap-3 bg-slate-950 p-5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" /> Previsualização em Tempo Real (Norma ARTESP / DER-SP em cm/mm)
                  </span>
                  
                  <div className="flex items-center gap-2">
                    {/* CAD / Prancha Theme Switch */}
                    <div className="bg-slate-900 p-0.5 rounded-lg border border-slate-800 flex text-[10px]">
                      <button
                        type="button"
                        onClick={() => setCarimboTheme("cad")}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                          carimboTheme === "cad"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Modo CAD (Preto)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCarimboTheme("sheet")}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                          carimboTheme === "sheet"
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Modo Prancha (Branco)
                      </button>
                    </div>

                    {/* Reset Dimensions Button */}
                    <button
                      type="button"
                      onClick={() => setCarimboDimensions({
                        row1: 25.00,
                        row2: 32.50,
                        row3: 7.50,
                        row4: 7.50,
                        row5: 7.50,
                        row6: 7.50,
                        row7: 7.50,
                        row8: 7.50,
                        col1: 101.00,
                        col2: 44.00,
                        col3: 30.00,
                      })}
                      className="px-2.5 py-1 rounded-md text-[10px] font-semibold border bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700 transition-all flex items-center gap-1"
                      title="Restaurar medidas padrão ARTESP (175,00 mm x 102,50 mm)"
                    >
                      <RotateCcw className="w-3 h-3 text-amber-400" />
                      <span>Resetar Medidas</span>
                    </button>

                    {/* Dimensions Toggle */}
                    <button
                      type="button"
                      onClick={() => setShowCarimboDimensions(prev => !prev)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-semibold border transition-all ${
                        showCarimboDimensions
                          ? "bg-slate-800 text-emerald-300 border-emerald-500/40"
                          : "bg-slate-900 text-slate-400 border-slate-800"
                      }`}
                    >
                      {showCarimboDimensions ? `Cotas CAD (${totalCarimboWidth.toFixed(1)} x ${totalCarimboHeight.toFixed(1)}mm)` : "Ocultar Cotas"}
                    </button>
                  </div>
                </div>

                <div className="relative w-full max-w-2xl mx-auto my-3 p-4 bg-[#0d0d0f] rounded-lg border border-slate-800/80 shadow-2xl">
                  {/* TOP DIMENSION: Total Width mm & cm */}
                  {showCarimboDimensions && (
                    <div className="w-full flex flex-col items-center mb-1 text-[10px] font-mono font-bold text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 bg-slate-900 px-2.5 py-0.5 rounded border border-slate-800 text-[10px] font-mono">
                          {totalCarimboWidth.toFixed(2).replace('.', ',')} mm ({(totalCarimboWidth / 10).toFixed(2).replace('.', ',')} cm)
                        </span>
                      </div>
                      <div className="w-full h-1.5 border-x border-t border-slate-600 my-0.5 flex items-center justify-between px-1">
                        <span className="text-[8px] leading-none text-slate-500">◄</span>
                        <div className="flex-1 border-t border-dashed border-slate-600 mx-1"></div>
                        <span className="text-[8px] leading-none text-slate-500">►</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-stretch gap-2">
                    {/* LEFT VERTICAL BREAKDOWN DIMENSIONS (EDITABLE INPUTS) */}
                    {showCarimboDimensions && (
                      <div className="flex flex-col justify-between text-[8px] font-mono font-bold text-slate-400 w-14 shrink-0 py-0.5 select-none gap-0.5">
                        {[
                          { key: "row1", label: "Linha 1", val: carimboDimensions.row1, title: "Símbolo 1 (ARTESP Header)" },
                          { key: "row2", label: "Linha 2", val: carimboDimensions.row2, title: "Símbolo 2 (Concessionária)" },
                          { key: "row3", label: "Linha 3", val: carimboDimensions.row3, title: "Texto 1 (N.º Desenho Interno)" },
                          { key: "row4", label: "Linha 4", val: carimboDimensions.row4, title: "Texto 2 & 5 (N.º ARTESP / Emissão)" },
                          { key: "row5", label: "Linha 5", val: carimboDimensions.row5, title: "Texto 3 (Título)" },
                          { key: "row6", label: "Linha 6", val: carimboDimensions.row6, title: "Texto 4 (Rodovia)" },
                          { key: "row7", label: "Linha 7", val: carimboDimensions.row7, title: "Texto 6 & 7 (Trecho / Estaca)" },
                          { key: "row8", label: "Linha 8", val: carimboDimensions.row8, title: "Texto 8, 10 & 9 (Escala / Código / Folha)" },
                        ].map((row) => {
                          const rowPct = `${((row.val / totalCarimboHeight) * 100).toFixed(3)}%`;
                          return (
                            <div
                              key={row.key}
                              style={{ height: rowPct }}
                              className="flex items-center justify-end border-r border-slate-700/80 pr-1 group relative"
                              title={`${row.title}: ${row.val} mm`}
                            >
                              <input
                                type="number"
                                step="0.5"
                                min="1"
                                value={row.val}
                                onChange={(e) => {
                                  const num = parseFloat(e.target.value);
                                  setCarimboDimensions(prev => ({
                                    ...prev,
                                    [row.key]: isNaN(num) ? 0 : num
                                  }));
                                }}
                                className="w-12 text-center bg-slate-900/90 text-amber-400 hover:bg-slate-800 font-mono font-bold text-[9px] px-0.5 py-0.5 rounded border border-slate-700/80 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/50 transition-colors shadow-xs"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* MAIN CARIMBO BOX WITH DYNAMIC ASPECT RATIO */}
                    <div style={{ aspectRatio: `${totalCarimboWidth} / ${totalCarimboHeight}` }} className="flex-1 w-full min-h-[220px]">
                      {renderArtespCarimbo(carimboTheme)}
                    </div>

                    {/* RIGHT TOTAL DIMENSION */}
                    {showCarimboDimensions && (
                      <div className="flex flex-col items-center justify-center text-[9px] font-mono font-bold text-amber-400 w-12 shrink-0 border-l border-slate-700 pl-1 select-none">
                        <span className="-rotate-90 whitespace-nowrap bg-slate-900 px-1.5 py-1 rounded border border-slate-800 text-[9px] font-mono shadow-xs">
                          {totalCarimboHeight.toFixed(2).replace('.', ',')} mm ({(totalCarimboHeight / 10).toFixed(2).replace('.', ',')} cm)
                        </span>
                      </div>
                    )}
                  </div>

                  {/* BOTTOM BREAKDOWN COLUMNS DIMENSIONS (EDITABLE INPUTS) */}
                  {showCarimboDimensions && (
                    <div className="w-full flex text-[8px] font-mono font-bold text-slate-400 mt-2 pl-16 pr-12 select-none">
                      {[
                        { key: "col1", label: "Col 1", val: carimboDimensions.col1, title: "Coluna 1 (Trecho / Escala)" },
                        { key: "col2", label: "Col 2", val: carimboDimensions.col2, title: "Coluna 2 (Estaca / Código)" },
                        { key: "col3", label: "Col 3", val: carimboDimensions.col3, title: "Coluna 3 (Emissão / DER / Folha)" },
                      ].map((col) => {
                        const colPct = `${((col.val / totalCarimboWidth) * 100).toFixed(3)}%`;
                        return (
                          <div
                            key={col.key}
                            style={{ width: colPct }}
                            className="text-center border-t border-slate-700/80 pt-1.5 flex justify-center items-center gap-1"
                            title={`${col.title}: ${col.val} mm`}
                          >
                            <input
                              type="number"
                              step="0.5"
                              min="1"
                              value={col.val}
                              onChange={(e) => {
                                const num = parseFloat(e.target.value);
                                setCarimboDimensions(prev => ({
                                  ...prev,
                                  [col.key]: isNaN(num) ? 0 : num
                                }));
                              }}
                              className="w-16 text-center bg-slate-900/90 text-amber-400 hover:bg-slate-800 font-mono font-bold text-[9px] px-1 py-0.5 rounded border border-slate-700/80 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/50 transition-colors shadow-xs"
                            />
                            <span className="text-[8px] text-slate-400 font-mono">mm</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* SEÇÃO 1: SÍMBOLOS (3 Elementos) */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      Símbolos (3)
                    </span>
                    <span className="text-xs text-slate-400">Logótipos, selos e marcas dos órgãos e concessionárias</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {
                      id: "simbolo_1",
                      title: "Símbolo 1",
                      subtitle: "ARTESP - Agência de Transporte",
                      desc: "Logótipo e marca oficial da ARTESP no cabeçalho (175,00 mm x 25,00 mm)",
                      icon: <Building2 className="w-5 h-5 text-red-400" />
                    },
                    {
                      id: "simbolo_2",
                      title: "Símbolo 2",
                      subtitle: "Concessionária CCR SPVias",
                      desc: "Logótipo central da empresa concessionária",
                      icon: <Sparkles className="w-5 h-5 text-amber-400" />
                    },
                    {
                      id: "simbolo_3",
                      title: "Símbolo 3",
                      subtitle: "DER / SP (Departamento de Estradas)",
                      desc: "Caixa lateral com o selo oficial do DER-SP",
                      icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    },
                  ].map((sym) => {
                    const isActive = carimboElements[sym.id];
                    const hasCustomImage = !!carimboCustomImages[sym.id];

                    return (
                      <div
                        key={sym.id}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                          isActive
                            ? "bg-slate-800/90 border-blue-500/50 shadow-md shadow-blue-500/5"
                            : "bg-slate-900/50 border-slate-800 opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
                              {sym.icon}
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white">{sym.title}</h4>
                              <p className="text-[11px] font-medium text-slate-300">{sym.subtitle}</p>
                            </div>
                          </div>

                          {/* ON/OFF Switch */}
                          <button
                            type="button"
                            onClick={() => toggleCarimboElement(sym.id)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              isActive ? "bg-emerald-500" : "bg-slate-700"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                isActive ? "translate-x-5" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-tight">{sym.desc}</p>

                        {/* Import Image Button / Custom Image Controls */}
                        <div className="pt-2.5 border-t border-slate-700/80 flex flex-col gap-2">
                          {hasCustomImage ? (
                            <div className="flex items-center justify-between gap-2 bg-slate-950 p-2 rounded-lg border border-slate-700/80">
                              <div className="flex items-center gap-2 min-w-0">
                                <img
                                  src={carimboCustomImages[sym.id]}
                                  alt={`Preview ${sym.title}`}
                                  className="w-9 h-7 object-contain bg-slate-900 rounded border border-slate-800 p-0.5 shrink-0"
                                />
                                <span className="text-[10px] text-emerald-400 font-semibold truncate">Imagem Ativa</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveSymbolImage(sym.id)}
                                className="px-2 py-1 text-[10px] font-semibold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/30 border border-red-500/20 rounded-md transition-colors flex items-center gap-1 shrink-0"
                                title="Remover e restaurar símbolo vetor padrão"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Remover</span>
                              </button>
                            </div>
                          ) : (
                            <label
                              htmlFor={`upload-sym-${sym.id}`}
                              className="w-full cursor-pointer text-[11px] font-bold bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white py-2 px-3 rounded-lg border border-blue-500/30 hover:border-blue-400 transition-all flex items-center justify-center gap-2 shadow-xs group"
                            >
                              <Upload className="w-3.5 h-3.5 text-blue-400 group-hover:text-white transition-colors" />
                              <span>Importar Imagem</span>
                              <input
                                id={`upload-sym-${sym.id}`}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handleSymbolImageUpload(sym.id, e.target.files[0]);
                                    e.target.value = "";
                                  }
                                }}
                              />
                            </label>
                          )}

                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                            <span>Exibição:</span>
                            <span className={`font-semibold px-1.5 py-0.5 rounded ${
                              isActive ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-500"
                            }`}>
                              {isActive ? "ON" : "OFF"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SEÇÃO 2: TEXTOS (10 Elementos) */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      Textos (10)
                    </span>
                    <span className="text-xs text-slate-400">Campos descritivos e dados do projeto</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingTextStyles(true)}
                    className="px-2.5 py-1 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Type className="w-3.5 h-3.5 text-amber-400" />
                    <span>Estilo, Cor & Altura das Fontes</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { id: "texto_1", label: "Texto 1", name: "N.º Desenho Interno" },
                    { id: "texto_2", label: "Texto 2", name: "N.º Desenho ARTESP" },
                    { id: "texto_3", label: "Texto 3", name: "Título do Desenho" },
                    { id: "texto_4", label: "Texto 4", name: "Designação da Rodovia" },
                    { id: "texto_5", label: "Texto 5", name: "Data de Emissão" },
                    { id: "texto_6", label: "Texto 6", name: "Trecho do Projeto" },
                    { id: "texto_7", label: "Texto 7", name: "Intervalo de Estaca" },
                    { id: "texto_8", label: "Texto 8", name: "Escala do Desenho" },
                    { id: "texto_9", label: "Texto 9", name: "Número da Folha" },
                    { id: "texto_10", label: "Texto 10", name: "Código Geral do Projeto" },
                  ].map((txt) => {
                    const isActive = carimboElements[txt.id];
                    return (
                      <div
                        key={txt.id}
                        className={`p-3 rounded-xl border transition-all flex flex-col gap-2 ${
                          isActive
                            ? "bg-slate-800/80 border-slate-700"
                            : "bg-slate-900/40 border-slate-800/80 opacity-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              {txt.label}
                            </span>
                            <span className="text-xs font-semibold text-white">
                              {txt.name}
                            </span>
                          </div>

                          {/* ON/OFF Switch */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-bold ${isActive ? "text-emerald-400" : "text-slate-500"}`}>
                              {isActive ? "ON" : "OFF"}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleCarimboElement(txt.id)}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                isActive ? "bg-emerald-500" : "bg-slate-700"
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  isActive ? "translate-x-4" : "translate-x-0"
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Editable Text Field */}
                        <input
                          type="text"
                          value={carimboTextValues[txt.id] || ""}
                          onChange={(e) => updateCarimboTextValue(txt.id, e.target.value)}
                          disabled={!isActive}
                          placeholder={`Insira ${txt.name.toLowerCase()}...`}
                          className="w-full text-xs bg-slate-900 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 disabled:opacity-40 font-mono"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                As alterações na janela do carimbo são refletidas em tempo real na folha de impressão.
              </div>

              <button
                type="button"
                onClick={() => {
                  setViewportSizes((prev: any) => ({
                    ...prev,
                    [`carimbo`]: { w: totalCarimboWidth, h: totalCarimboHeight }
                  }));
                  setIsEditingCarimbo(false);
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-lg shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Text Styling Configuration */}
      {isEditingTextStyles && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[92vh] text-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
                  <Type className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    Configuração de Estilo e Cores dos Textos
                    <span className="text-xs bg-amber-500/20 text-amber-300 font-medium px-2 py-0.5 rounded-full border border-amber-500/30">
                      Formatação
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Personalize fonte, cores, tamanhos e caixa de texto aplicados a todos os campos do carimbo.
                  </p>
                </div>
              </div>
              
              <button
                onClick={() => setIsEditingTextStyles(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Quadro de Pré-Visualização ao Vivo */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-2 shadow-inner">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    Pré-visualização do Carimbo em Tempo Real
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">Tema Atual: {carimboTheme === 'cad' ? 'CAD (Fundo Escuro)' : 'Folha (Fundo Claro)'}</span>
                </div>
                <div className="w-full h-32 rounded-lg overflow-hidden border border-slate-700 shadow-md">
                  {renderArtespCarimbo(carimboTheme)}
                </div>
              </div>

              {/* Seções de Configuração */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* 1. Família da Fonte */}
                <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80 flex flex-col gap-2.5">
                  <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Type className="w-4 h-4 text-amber-400" />
                      Família da Fonte
                    </span>
                    <span className="text-[10px] text-slate-400">Windows TrueType</span>
                  </label>
                  <select
                    value={carimboTextStyle.fontFamily}
                    onChange={(e) => setCarimboTextStyle(prev => ({ ...prev, fontFamily: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-white font-medium focus:outline-none focus:border-amber-500 cursor-pointer shadow-xs"
                    style={{ fontFamily: carimboTextStyle.fontFamily }}
                  >
                    {WINDOWS_TTF_FONTS.map((font) => (
                      <option key={font} value={font} style={{ fontFamily: font, backgroundColor: '#0f172a', color: '#ffffff' }}>
                        {font}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Altura / Escala do Texto */}
                <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80 flex flex-col gap-2.5">
                  <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    Altura / Escala do Texto
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="20.0"
                        value={carimboTextStyle.textHeightMM}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setCarimboTextStyle(prev => ({
                            ...prev,
                            textHeightMM: isNaN(val) ? 2.5 : val
                          }));
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-500 font-mono pr-10"
                        placeholder="2.5"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-400 font-bold pointer-events-none">
                        mm
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    {[1.8, 2.0, 2.5, 3.0, 3.5, 5.0].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setCarimboTextStyle(prev => ({ ...prev, textHeightMM: h }))}
                        className={`px-2 py-1 rounded text-[11px] font-semibold transition-all border ${
                          carimboTextStyle.textHeightMM === h
                            ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                            : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        {h === 2.5 ? `${h}mm (Padrão)` : `${h}mm`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Cor dos Rótulos */}
                <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80 flex flex-col gap-2.5">
                  <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Palette className="w-4 h-4 text-amber-400" />
                      Cor dos Rótulos (TÍTULO, RODOVIA, etc.)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Paleta 256 Cores</span>
                  </label>
                  <div className="flex items-center gap-3 bg-slate-900 p-2.5 rounded-lg border border-slate-700">
                    <AciColorPicker
                      value={carimboTextStyle.labelColor}
                      onChange={(hex) => setCarimboTextStyle(prev => ({ ...prev, labelColor: hex }))}
                      title="Selecionar Cor dos Rótulos na Paleta 256"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-mono font-bold uppercase text-white">
                        {carimboTextStyle.labelColor}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        ACI Index #{getClosestAci(carimboTextStyle.labelColor)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { name: "Amarelo", hex: "#ffff00" },
                      { name: "Ciano", hex: "#00ffff" },
                      { name: "Verde", hex: "#00ff00" },
                      { name: "Branco", hex: "#ffffff" },
                      { name: "Preto", hex: "#000000" },
                      { name: "Vermelho", hex: "#ff0000" },
                    ].map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setCarimboTextStyle(prev => ({ ...prev, labelColor: c.hex }))}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1.5 border ${
                          carimboTextStyle.labelColor?.toLowerCase() === c.hex.toLowerCase()
                            ? "bg-amber-500/20 border-amber-500/50 text-white"
                            : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full border border-slate-600 shrink-0" style={{ backgroundColor: c.hex }} />
                        <span>{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Cor dos Valores */}
                <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80 flex flex-col gap-2.5">
                  <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Palette className="w-4 h-4 text-emerald-400" />
                      Cor dos Valores (Conteúdo dos Campos)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Paleta 256 Cores</span>
                  </label>
                  <div className="flex items-center gap-3 bg-slate-900 p-2.5 rounded-lg border border-slate-700">
                    <AciColorPicker
                      value={carimboTextStyle.valueColor}
                      onChange={(hex) => setCarimboTextStyle(prev => ({ ...prev, valueColor: hex }))}
                      title="Selecionar Cor dos Valores na Paleta 256"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-mono font-bold uppercase text-white">
                        {carimboTextStyle.valueColor}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        ACI Index #{getClosestAci(carimboTextStyle.valueColor)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { name: "Verde", hex: "#00ff00" },
                      { name: "Ciano", hex: "#00ffff" },
                      { name: "Amarelo", hex: "#ffff00" },
                      { name: "Branco", hex: "#ffffff" },
                      { name: "Preto", hex: "#000000" },
                      { name: "Vermelho", hex: "#ff0000" },
                    ].map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setCarimboTextStyle(prev => ({ ...prev, valueColor: c.hex }))}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1.5 border ${
                          carimboTextStyle.valueColor?.toLowerCase() === c.hex.toLowerCase()
                            ? "bg-emerald-500/20 border-emerald-500/50 text-white"
                            : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full border border-slate-600 shrink-0" style={{ backgroundColor: c.hex }} />
                        <span>{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. Peso e Estilo da Fonte */}
                <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80 flex flex-col gap-2.5 md:col-span-2">
                  <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Settings2 className="w-4 h-4 text-amber-400" />
                    Peso e Estilo da Fonte
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: "normal", name: "Normal", weight: "normal", style: "normal", decor: "none" },
                      { id: "bold", name: "Negrito", weight: "bold", style: "normal", decor: "none" },
                      { id: "italic", name: "Itálico", weight: "normal", style: "italic", decor: "none" },
                      { id: "underline", name: "Sublinhado", weight: "normal", style: "normal", decor: "underline" },
                    ].map((opt) => {
                      const isSelected =
                        carimboTextStyle.fontWeight === opt.weight &&
                        carimboTextStyle.fontStyle === opt.style &&
                        carimboTextStyle.textDecoration === opt.decor;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setCarimboTextStyle(prev => ({
                              ...prev,
                              fontWeight: opt.weight as any,
                              fontStyle: opt.style as any,
                              textDecoration: opt.decor as any,
                            }))
                          }
                          className={`p-3 rounded-lg border text-xs text-center transition-all ${
                            isSelected
                              ? "bg-amber-500/20 border-amber-500/60 text-white font-semibold shadow-xs"
                              : "bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          <span style={{ fontWeight: opt.weight, fontStyle: opt.style, textDecoration: opt.decor }}>
                            {opt.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCarimboTextStyle(defaultCarimboTextStyle)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                Restaurar Padrão ABNT/ARTESP
              </button>

              <button
                type="button"
                onClick={() => setIsEditingTextStyles(false)}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-lg shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal for Editar Tabela */}
      {isEditingTable && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-300 p-6 rounded-xl shadow-2xl w-full flex flex-col gap-4 max-h-[90vh] max-w-5xl overflow-y-auto transition-all">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <TableIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    {selectedTable ? `Editar Tabela – ${selectedTable.customTitle || selectedTable.title || "Tabela"}` : "Gerenciar Tabelas"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Personalize o título da tabela e edite separadamente as demais linhas e células de dados.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsEditingTable(false)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedTable ? (() => {
              const targetAlignment = (store.alignments || []).find((a: any) => a.id === selectedTable.alignmentId) ||
                (store.alignments || []).find((a: any) => a.id === store.productionActiveAlignment) ||
                (store.alignments || []).find((a: any) => a.id === store.activeAlignmentId) ||
                (store.alignments || [])[0];
              const allHorizontalElements = computeHorizontalElements(targetAlignment?.keyPoints?.length ? targetAlignment.keyPoints : targetAlignment?.points || []);
              const currentPageInfo = alignmentPages[currentPage - 1];
              const horizontalElements = (currentPageInfo && currentPageInfo.endStation > currentPageInfo.startStation)
                ? filterHorizontalElementsForStationRange(allHorizontalElements, currentPageInfo.startStation, currentPageInfo.endStation)
                : allHorizontalElements;

              const isCurvesTable = selectedTable.type === "alignment" || selectedTable.type === "curves";
              const defaultTitle = isCurvesTable 
                ? `TABELA DE ALINHAMENTO HORIZONTAL - ${(targetAlignment?.name || "EIXO 1").toUpperCase()}`
                : (selectedTable.title || "Tabela");
              const currentTitle = selectedTable.customTitle !== undefined ? selectedTable.customTitle : defaultTitle;

              const cellFontSizeCm = selectedTable.fontSizeCm ?? (selectedTable.fontSize ? Number((selectedTable.fontSize / 10).toFixed(2)) : 0.25);
              const headerFontSizeCm = selectedTable.headerFontSizeCm ?? (selectedTable.headerFontSize ? Number((selectedTable.headerFontSize / 10).toFixed(2)) : Number((cellFontSizeCm * 1.15).toFixed(2)));
              const titleFontSizeCm = selectedTable.titleFontSizeCm ?? (selectedTable.titleFontSize ? Number((selectedTable.titleFontSize / 10).toFixed(2)) : 0.35);

              const fontFamily = selectedTable.fontFamily || "Arial, Helvetica, sans-serif";
              const textColor = selectedTable.textColor || "#0f172a";
              const titleColor = selectedTable.titleColor || "#0f172a";
              const titleBgColor = selectedTable.titleBgColor || "#f1f5f9";
              const headerColor = selectedTable.headerColor || "#0f172a";
              const headerBgColor = selectedTable.headerBgColor || "#e2e8f0";

              const handleCellFontSizeCmChange = (cm: number) => {
                const val = Math.max(0.05, Math.min(3.0, Number(cm.toFixed(2))));
                const mmVal = Number((val * 10).toFixed(2));
                store.updateProductionTable(selectedTable.id, { fontSizeCm: val, fontSize: mmVal });
              };

              const handleHeaderFontSizeCmChange = (cm: number) => {
                const val = Math.max(0.05, Math.min(3.0, Number(cm.toFixed(2))));
                const mmVal = Number((val * 10).toFixed(2));
                store.updateProductionTable(selectedTable.id, { headerFontSizeCm: val, headerFontSize: mmVal });
              };

              const handleTitleFontSizeCmChange = (cm: number) => {
                const val = Math.max(0.05, Math.min(4.0, Number(cm.toFixed(2))));
                const mmVal = Number((val * 10).toFixed(2));
                store.updateProductionTable(selectedTable.id, { titleFontSizeCm: val, titleFontSize: mmVal });
              };

              const handleFontFamilyChange = (val: string) => {
                store.updateProductionTable(selectedTable.id, { fontFamily: val });
              };

              const handleTextColorChange = (color: string) => {
                store.updateProductionTable(selectedTable.id, { textColor: color });
              };

              const handleHeaderColorChange = (color: string) => {
                store.updateProductionTable(selectedTable.id, { headerColor: color });
              };

              const handleHeaderBgColorChange = (color: string) => {
                store.updateProductionTable(selectedTable.id, { headerBgColor: color });
              };

              const handleTitleColorChange = (color: string) => {
                store.updateProductionTable(selectedTable.id, { titleColor: color });
              };

              const handleTitleBgColorChange = (color: string) => {
                store.updateProductionTable(selectedTable.id, { titleBgColor: color });
              };

              const rowHeightCm = selectedTable.rowHeightCm ?? Number(Math.max(0.4, cellFontSizeCm * 2.2).toFixed(2));
              const headerRowHeightCm = selectedTable.headerRowHeightCm ?? Number(Math.max(0.5, headerFontSizeCm * 2.2).toFixed(2));
              const defaultColWidthCm = selectedTable.defaultColWidthCm ?? 2.5;
              const columnWidthsCm = selectedTable.columnWidthsCm;

              const defaultLines = isCurvesTable
                ? generateHorizontalElementsTableLines(horizontalElements)
                : (selectedTable.customLines || "| Coluna 1 | Coluna 2 |\n| :--- | :--- |\n| Dado 1 | Dado 2 |");
              const currentLines = selectedTable.customLines !== undefined ? selectedTable.customLines : defaultLines;
              const parsed = parseMarkdownTableLines(currentLines);

              const getColWidthCm = (colIdx: number): number => {
                if (columnWidthsCm && columnWidthsCm[colIdx] !== undefined) {
                  return columnWidthsCm[colIdx];
                }
                if (isCurvesTable && DEFAULT_CURVES_COL_WIDTHS_CM[colIdx] !== undefined) {
                  return DEFAULT_CURVES_COL_WIDTHS_CM[colIdx];
                }
                return defaultColWidthCm;
              };

              const handleRowHeightCmChange = (val: number) => {
                const cm = Math.max(0.2, Math.min(5.0, Number(val.toFixed(2))));
                store.updateProductionTable(selectedTable.id, { rowHeightCm: cm });
              };

              const handleHeaderRowHeightCmChange = (val: number) => {
                const cm = Math.max(0.2, Math.min(5.0, Number(val.toFixed(2))));
                store.updateProductionTable(selectedTable.id, { headerRowHeightCm: cm });
              };

              const handleDefaultColWidthCmChange = (val: number) => {
                const cm = Math.max(0.5, Math.min(25.0, Number(val.toFixed(2))));
                store.updateProductionTable(selectedTable.id, { defaultColWidthCm: cm });
              };

              const handleColWidthCmChange = (colIdx: number, val: number) => {
                const cm = Math.max(0.4, Math.min(35.0, Number(val.toFixed(2))));
                const totalCols = parsed.headers.length > 0 ? parsed.headers.length : (isCurvesTable ? 14 : 2);
                const currentWidths = Array.from({ length: totalCols }, (_, i) => getColWidthCm(i));
                currentWidths[colIdx] = cm;
                store.updateProductionTable(selectedTable.id, { columnWidthsCm: currentWidths });
              };

              const handleDistributeColWidths = () => {
                const totalCols = parsed.headers.length > 0 ? parsed.headers.length : (isCurvesTable ? 14 : 2);
                if (totalCols <= 0) return;
                const uniformCm = Number(((selectedTable.w / 10) / totalCols).toFixed(2));
                const newWidths = Array.from({ length: totalCols }, () => uniformCm);
                store.updateProductionTable(selectedTable.id, { columnWidthsCm: newWidths, defaultColWidthCm: uniformCm });
              };

              const handleFitTableWidthToColumns = () => {
                const totalCols = parsed.headers.length > 0 ? parsed.headers.length : (isCurvesTable ? 14 : 2);
                let sumCm = 0;
                for (let i = 0; i < totalCols; i++) {
                  sumCm += getColWidthCm(i);
                }
                const newWMm = Math.round(sumCm * 10);
                store.updateProductionTable(selectedTable.id, { w: newWMm });
              };

              const handleResetColWidths = () => {
                store.updateProductionTable(selectedTable.id, { columnWidthsCm: undefined, defaultColWidthCm: undefined });
              };

              const handleTitleChange = (newTitle: string) => {
                store.updateProductionTable(selectedTable.id, { 
                  customTitle: newTitle,
                  title: newTitle 
                });
              };

              const handleResetTitle = () => {
                store.updateProductionTable(selectedTable.id, { 
                  customTitle: undefined,
                  title: defaultTitle 
                });
              };

              const handleLinesChange = (newLines: string) => {
                store.updateProductionTable(selectedTable.id, { customLines: newLines });
              };

              const handleResetLines = () => {
                store.updateProductionTable(selectedTable.id, { customLines: undefined });
              };

              const handleCellChange = (rowIndex: number, colIndex: number, val: string) => {
                const newRows = parsed.rows.map((r, rIdx) => 
                  rIdx === rowIndex ? r.map((c, cIdx) => cIdx === colIndex ? val : c) : [...r]
                );
                const serialized = serializeToMarkdownTable(parsed.headers, newRows);
                store.updateProductionTable(selectedTable.id, { customLines: serialized });
              };

              const handleHeaderChange = (colIndex: number, val: string) => {
                const newHeaders = parsed.headers.map((h, hIdx) => hIdx === colIndex ? val : h);
                const serialized = serializeToMarkdownTable(newHeaders, parsed.rows);
                store.updateProductionTable(selectedTable.id, { customLines: serialized });
              };

              const handleAddRow = () => {
                const emptyRow = parsed.headers.length > 0 
                  ? parsed.headers.map(() => "-") 
                  : ["-", "-"];
                const newHeaders = parsed.headers.length > 0 ? parsed.headers : ["Coluna 1", "Coluna 2"];
                const newRows = [...parsed.rows, emptyRow];
                const serialized = serializeToMarkdownTable(newHeaders, newRows);
                store.updateProductionTable(selectedTable.id, { customLines: serialized });
              };

              const handleDeleteRow = (rowIndex: number) => {
                const newRows = parsed.rows.filter((_, rIdx) => rIdx !== rowIndex);
                const serialized = serializeToMarkdownTable(parsed.headers, newRows);
                store.updateProductionTable(selectedTable.id, { customLines: serialized });
              };

              const handleCopyMarkdown = () => {
                const fullMd = `### ${currentTitle}\n\n${currentLines}`;
                navigator.clipboard.writeText(fullMd);
                setCopiedMarkdown(true);
                setTimeout(() => setCopiedMarkdown(false), 2500);
              };

              return (
                <div className="flex flex-col gap-5 text-sm text-slate-700">
                  {/* General Table Settings & Dimensions */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                    <div className="flex flex-col gap-1">
                      <label className="font-semibold text-xs text-slate-600 uppercase">Tipo de Conteúdo</label>
                      <select
                        value={selectedTable.type}
                        onChange={(e) => store.updateProductionTable(selectedTable.id, { type: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 bg-white focus:border-blue-600 outline-none"
                      >
                        <option value="alignment">Tabela de Alinhamento Horizontal (DNIT/DER)</option>
                        <option value="accel">Faixa de Aceleração (DNIT/DER)</option>
                        <option value="decel">Faixa de Desaceleração (DNIT/DER)</option>
                        <option value="nf">Tabela de Narizes Físicos</option>
                        <option value="custom">Personalizada</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="font-semibold text-xs text-slate-600 uppercase">Alinhamento do Projeto</label>
                      <select
                        value={selectedTable.alignmentId || store.productionActiveAlignment || store.activeAlignmentId || (store.alignments?.[0]?.id ?? "")}
                        onChange={(e) => store.updateProductionTable(selectedTable.id, { alignmentId: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 bg-white focus:border-blue-600 outline-none"
                      >
                        {(store.alignments || []).map((align: any) => (
                          <option key={align.id} value={align.id}>
                            {align.name || `Alinhamento (${align.id})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="font-semibold text-xs text-slate-600 uppercase">Largura (mm)</label>
                      <input
                        type="number"
                        value={selectedTable.w}
                        onChange={(e) => store.updateProductionTable(selectedTable.id, { w: Number(e.target.value) })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 bg-white focus:border-blue-600 outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="font-semibold text-xs text-slate-600 uppercase">Altura (mm)</label>
                      <input
                        type="number"
                        value={selectedTable.h}
                        onChange={(e) => store.updateProductionTable(selectedTable.id, { h: Number(e.target.value) })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 bg-white focus:border-blue-600 outline-none"
                      />
                    </div>
                  </div>

                  {/* Section 1: TÍTULO DA TABELA */}
                  <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-blue-200 shadow-sm">
                    <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[11px] font-bold uppercase tracking-wider">
                          1. Título da Tabela
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          (Separado das demais linhas da tabela)
                        </span>
                      </div>
                      {selectedTable.customTitle !== undefined && (
                        <button
                          onClick={handleResetTitle}
                          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                          title="Restaurar título original calculado"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restaurar Título Padrão
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                      {/* Title Text Input */}
                      <div className="lg:col-span-6 flex flex-col gap-1">
                        <label className="font-semibold text-xs text-slate-700">
                          Texto do Título Superior
                        </label>
                        <input
                          type="text"
                          value={currentTitle}
                          onChange={(e) => handleTitleChange(e.target.value)}
                          placeholder="Ex: TABELA DE ALINHAMENTO HORIZONTAL - EIXO 1"
                          className="w-full border border-slate-300 focus:border-blue-600 rounded-lg px-3 py-2 text-sm text-slate-900 font-semibold bg-slate-50/50 focus:bg-white outline-none shadow-sm transition-all"
                        />
                      </div>

                      {/* Title Font Size in Centimeters */}
                      <div className="lg:col-span-3 flex flex-col gap-1">
                        <label className="font-semibold text-xs text-slate-700 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Type className="w-3.5 h-3.5 text-blue-600" />
                            Tamanho da Letra (cm)
                          </span>
                          <span className="text-[11px] text-blue-600 font-mono font-medium">
                            {(titleFontSizeCm * 10).toFixed(1)} mm
                          </span>
                        </label>
                        <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded-lg p-1">
                          <button
                            onClick={() => handleTitleFontSizeCmChange(titleFontSizeCm - 0.05)}
                            className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 rounded transition-colors"
                            title="Diminuir 0.05 cm"
                          >
                            -
                          </button>
                          <div className="flex-1 flex items-center justify-center gap-0.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0.05"
                              max="4.0"
                              value={titleFontSizeCm}
                              onChange={(e) => handleTitleFontSizeCmChange(Number(e.target.value))}
                              className="w-14 text-center font-mono font-bold text-xs text-slate-900 bg-white border border-slate-200 rounded py-0.5 outline-none focus:border-blue-500"
                            />
                            <span className="text-xs font-semibold text-slate-500">cm</span>
                          </div>
                          <button
                            onClick={() => handleTitleFontSizeCmChange(titleFontSizeCm + 0.05)}
                            className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 rounded transition-colors"
                            title="Aumentar 0.05 cm"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Title Colors: Text and Background with 256 ACI Palette */}
                      <div className="lg:col-span-3 grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="font-semibold text-[11px] text-slate-700 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Palette className="w-3 h-3 text-slate-500" />
                              Cor do Texto
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">256 Cores</span>
                          </label>
                          <div className="flex items-center gap-2 border border-slate-300 rounded-lg p-1.5 bg-slate-50 shadow-xs">
                            <AciColorPicker
                              value={titleColor}
                              onChange={(hex) => handleTitleColorChange(hex)}
                              title="Selecionar Cor do Texto do Título na Paleta de 256 Cores"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-mono text-[11px] text-slate-800 uppercase font-semibold leading-tight">
                                {titleColor}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono leading-tight">
                                ACI #{getClosestAci(titleColor)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="font-semibold text-[11px] text-slate-700 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Palette className="w-3 h-3 text-slate-500" />
                              Cor de Fundo
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">256 Cores</span>
                          </label>
                          <div className="flex items-center gap-2 border border-slate-300 rounded-lg p-1.5 bg-slate-50 shadow-xs">
                            <AciColorPicker
                              value={titleBgColor}
                              onChange={(hex) => handleTitleBgColorChange(hex)}
                              title="Selecionar Cor de Fundo do Título na Paleta de 256 Cores"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-mono text-[11px] text-slate-800 uppercase font-semibold leading-tight">
                                {titleBgColor}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono leading-tight">
                                ACI #{getClosestAci(titleBgColor)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: DEMAIS LINHAS DA TABELA */}
                  <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-slate-300 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded text-[11px] font-bold uppercase tracking-wider">
                          2. Demais Linhas da Tabela
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          (Cabeçalho e linhas de dados)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Tab Switcher */}
                        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                          <button
                            onClick={() => setTableTabMode("preview")}
                            className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                              tableTabMode === "preview" 
                                ? "bg-white text-blue-700 shadow-sm" 
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Visualização
                          </button>
                          <button
                            onClick={() => setTableTabMode("cells")}
                            className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                              tableTabMode === "cells" 
                                ? "bg-white text-blue-700 shadow-sm" 
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edição de Células
                          </button>
                          <button
                            onClick={() => setTableTabMode("markdown")}
                            className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                              tableTabMode === "markdown" 
                                ? "bg-white text-blue-700 shadow-sm" 
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            <FileCode className="w-3.5 h-3.5" />
                            Editor de Texto / Markdown
                          </button>
                        </div>

                        {selectedTable.customLines !== undefined && (
                          <button
                            onClick={handleResetLines}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-300 transition-colors"
                            title="Restaurar linhas calculadas automaticamente a partir do alinhamento"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restaurar Linhas Padrão
                          </button>
                        )}

                        <button
                          onClick={handleCopyMarkdown}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all ${
                            copiedMarkdown 
                              ? "bg-green-600 text-white" 
                              : "bg-blue-600 hover:bg-blue-700 text-white"
                          }`}
                          title="Copiar título e linhas em formato Markdown compatível com relatórios e planilhas"
                        >
                          {copiedMarkdown ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedMarkdown ? "Copiado!" : "Copiar Markdown"}
                        </button>
                      </div>
                    </div>

                    {/* Typography & Styling Panel: Centimeters, Font Family, and Color Pickers */}
                    <div className="flex flex-col gap-3 bg-gradient-to-r from-blue-50/70 via-slate-50 to-indigo-50/50 border border-blue-200/80 p-3.5 rounded-xl">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                        {/* Font Family Selector */}
                        <div className="md:col-span-4 flex flex-col gap-1">
                          <label className="font-semibold text-xs text-slate-700 flex items-center gap-1">
                            <Type className="w-3.5 h-3.5 text-blue-600" />
                            Fonte de Letra (Tipografia)
                          </label>
                          <select
                            value={fontFamily}
                            onChange={(e) => handleFontFamilyChange(e.target.value)}
                            style={{ fontFamily }}
                            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 bg-white focus:border-blue-600 outline-none shadow-xs font-semibold"
                          >
                            {TABLE_FONT_OPTIONS.map((f, fIdx) => (
                              <option key={fIdx} value={f.value} style={{ fontFamily: f.value }}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Cell Font Size in Centimeters (cm) */}
                        <div className="md:col-span-4 flex flex-col gap-1">
                          <label className="font-semibold text-xs text-slate-700 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Type className="w-3.5 h-3.5 text-blue-600" />
                              Tamanho Células (cm)
                            </span>
                            <span className="text-[11px] text-blue-600 font-mono font-medium">
                              {(cellFontSizeCm * 10).toFixed(1)} mm
                            </span>
                          </label>
                          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shadow-xs">
                            <button
                              onClick={() => handleCellFontSizeCmChange(cellFontSizeCm - 0.02)}
                              className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                              title="Diminuir 0.02 cm"
                            >
                              -
                            </button>
                            <div className="flex-1 flex items-center justify-center gap-0.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0.05"
                                max="3.0"
                                value={cellFontSizeCm}
                                onChange={(e) => handleCellFontSizeCmChange(Number(e.target.value))}
                                className="w-14 text-center font-mono font-bold text-xs text-blue-700 bg-slate-50 border border-slate-200 rounded py-0.5 outline-none focus:border-blue-500"
                              />
                              <span className="text-xs font-semibold text-slate-500">cm</span>
                            </div>
                            <button
                              onClick={() => handleCellFontSizeCmChange(cellFontSizeCm + 0.02)}
                              className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                              title="Aumentar 0.02 cm"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Header Font Size in Centimeters (cm) */}
                        <div className="md:col-span-4 flex flex-col gap-1">
                          <label className="font-semibold text-xs text-slate-700 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Type className="w-3.5 h-3.5 text-blue-600" />
                              Tamanho Cabeçalho (cm)
                            </span>
                            <span className="text-[11px] text-blue-600 font-mono font-medium">
                              {(headerFontSizeCm * 10).toFixed(1)} mm
                            </span>
                          </label>
                          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shadow-xs">
                            <button
                              onClick={() => handleHeaderFontSizeCmChange(headerFontSizeCm - 0.02)}
                              className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                              title="Diminuir 0.02 cm"
                            >
                              -
                            </button>
                            <div className="flex-1 flex items-center justify-center gap-0.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0.05"
                                max="3.0"
                                value={headerFontSizeCm}
                                onChange={(e) => handleHeaderFontSizeCmChange(Number(e.target.value))}
                                className="w-14 text-center font-mono font-bold text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded py-0.5 outline-none focus:border-blue-500"
                              />
                              <span className="text-xs font-semibold text-slate-500">cm</span>
                            </div>
                            <button
                              onClick={() => handleHeaderFontSizeCmChange(headerFontSizeCm + 0.02)}
                              className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                              title="Aumentar 0.02 cm"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Color Pickers: Text Color, Header Text Color, Header Background with 256 ACI Palette */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-blue-200/60">
                        {/* Text Color (Cells) */}
                        <div className="flex flex-col gap-1">
                          <label className="font-semibold text-xs text-slate-700 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Palette className="w-3.5 h-3.5 text-blue-600" />
                              Cor do Texto (Células)
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">256 Cores</span>
                          </label>
                          <div className="flex items-center gap-2.5 bg-white border border-slate-300 rounded-lg p-1.5 shadow-xs">
                            <AciColorPicker
                              value={textColor}
                              onChange={(hex) => handleTextColorChange(hex)}
                              title="Selecionar Cor do Texto das Células na Paleta de 256 Cores"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-mono text-xs font-semibold text-slate-800 uppercase leading-tight">
                                {textColor}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono leading-tight">
                                ACI #{getClosestAci(textColor)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 ml-auto">
                              {TABLE_COLOR_PRESETS.slice(0, 4).map((c) => (
                                <button
                                  key={c.value}
                                  onClick={() => handleTextColorChange(c.value)}
                                  style={{ backgroundColor: c.value }}
                                  className={`w-4 h-4 rounded-full border transition-transform ${textColor.toLowerCase() === c.value.toLowerCase() ? "scale-125 border-blue-600 ring-2 ring-blue-400" : "border-slate-300 hover:scale-110"}`}
                                  title={c.name}
                                />
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Header Text Color */}
                        <div className="flex flex-col gap-1">
                          <label className="font-semibold text-xs text-slate-700 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Palette className="w-3.5 h-3.5 text-blue-600" />
                              Cor do Cabeçalho (Letra)
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">256 Cores</span>
                          </label>
                          <div className="flex items-center gap-2.5 bg-white border border-slate-300 rounded-lg p-1.5 shadow-xs">
                            <AciColorPicker
                              value={headerColor}
                              onChange={(hex) => handleHeaderColorChange(hex)}
                              title="Selecionar Cor do Cabeçalho na Paleta de 256 Cores"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-mono text-xs font-semibold text-slate-800 uppercase leading-tight">
                                {headerColor}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono leading-tight">
                                ACI #{getClosestAci(headerColor)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 ml-auto">
                              {TABLE_COLOR_PRESETS.slice(0, 4).map((c) => (
                                <button
                                  key={c.value}
                                  onClick={() => handleHeaderColorChange(c.value)}
                                  style={{ backgroundColor: c.value }}
                                  className={`w-4 h-4 rounded-full border transition-transform ${headerColor.toLowerCase() === c.value.toLowerCase() ? "scale-125 border-blue-600 ring-2 ring-blue-400" : "border-slate-300 hover:scale-110"}`}
                                  title={c.name}
                                />
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Header Background Color */}
                        <div className="flex flex-col gap-1">
                          <label className="font-semibold text-xs text-slate-700 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Palette className="w-3.5 h-3.5 text-blue-600" />
                              Fundo do Cabeçalho
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">256 Cores</span>
                          </label>
                          <div className="flex items-center gap-2.5 bg-white border border-slate-300 rounded-lg p-1.5 shadow-xs">
                            <AciColorPicker
                              value={headerBgColor}
                              onChange={(hex) => handleHeaderBgColorChange(hex)}
                              title="Selecionar Cor de Fundo do Cabeçalho na Paleta de 256 Cores"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-mono text-xs font-semibold text-slate-800 uppercase leading-tight">
                                {headerBgColor}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono leading-tight">
                                ACI #{getClosestAci(headerBgColor)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 ml-auto">
                              {["#e2e8f0", "#f1f5f9", "#ffffff", "#dbeafe", "#fef3c7"].map((bg) => (
                                <button
                                  key={bg}
                                  onClick={() => handleHeaderBgColorChange(bg)}
                                  style={{ backgroundColor: bg }}
                                  className={`w-4 h-4 rounded-full border transition-transform ${headerBgColor.toLowerCase() === bg.toLowerCase() ? "scale-125 border-blue-600 ring-2 ring-blue-400" : "border-slate-300 hover:scale-110"}`}
                                  title={bg}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Row Heights & Column Widths Controls (cm / mm) */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-blue-200/60 items-center">
                        {/* Header Row Height */}
                        <div className="md:col-span-3 flex flex-col gap-1">
                          <label className="font-semibold text-xs text-slate-700 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Layers className="w-3.5 h-3.5 text-blue-600" />
                              Altura Cabeçalho (cm)
                            </span>
                            <span className="text-[11px] text-blue-600 font-mono font-medium">
                              {(headerRowHeightCm * 10).toFixed(1)} mm
                            </span>
                          </label>
                          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shadow-xs">
                            <button
                              onClick={() => handleHeaderRowHeightCmChange(headerRowHeightCm - 0.05)}
                              className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                              title="Diminuir 0.05 cm"
                            >
                              -
                            </button>
                            <div className="flex-1 flex items-center justify-center gap-0.5">
                              <input
                                type="number"
                                step="0.05"
                                min="0.2"
                                max="5.0"
                                value={headerRowHeightCm}
                                onChange={(e) => handleHeaderRowHeightCmChange(Number(e.target.value))}
                                className="w-14 text-center font-mono font-bold text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded py-0.5 outline-none focus:border-blue-500"
                              />
                              <span className="text-xs font-semibold text-slate-500">cm</span>
                            </div>
                            <button
                              onClick={() => handleHeaderRowHeightCmChange(headerRowHeightCm + 0.05)}
                              className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                              title="Aumentar 0.05 cm"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Data Row Height */}
                        <div className="md:col-span-3 flex flex-col gap-1">
                          <label className="font-semibold text-xs text-slate-700 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Layers className="w-3.5 h-3.5 text-blue-600" />
                              Altura Linhas Dados (cm)
                            </span>
                            <span className="text-[11px] text-blue-600 font-mono font-medium">
                              {(rowHeightCm * 10).toFixed(1)} mm
                            </span>
                          </label>
                          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shadow-xs">
                            <button
                              onClick={() => handleRowHeightCmChange(rowHeightCm - 0.05)}
                              className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                              title="Diminuir 0.05 cm"
                            >
                              -
                            </button>
                            <div className="flex-1 flex items-center justify-center gap-0.5">
                              <input
                                type="number"
                                step="0.05"
                                min="0.2"
                                max="5.0"
                                value={rowHeightCm}
                                onChange={(e) => handleRowHeightCmChange(Number(e.target.value))}
                                className="w-14 text-center font-mono font-bold text-xs text-blue-700 bg-slate-50 border border-slate-200 rounded py-0.5 outline-none focus:border-blue-500"
                              />
                              <span className="text-xs font-semibold text-slate-500">cm</span>
                            </div>
                            <button
                              onClick={() => handleRowHeightCmChange(rowHeightCm + 0.05)}
                              className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                              title="Aumentar 0.05 cm"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Default Column Width */}
                        <div className="md:col-span-3 flex flex-col gap-1">
                          <label className="font-semibold text-xs text-slate-700 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Sliders className="w-3.5 h-3.5 text-blue-600" />
                              Largura Colunas Padrão (cm)
                            </span>
                            <span className="text-[11px] text-blue-600 font-mono font-medium">
                              {(defaultColWidthCm * 10).toFixed(1)} mm
                            </span>
                          </label>
                          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shadow-xs">
                            <button
                              onClick={() => handleDefaultColWidthCmChange(defaultColWidthCm - 0.1)}
                              className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                              title="Diminuir 0.1 cm"
                            >
                              -
                            </button>
                            <div className="flex-1 flex items-center justify-center gap-0.5">
                              <input
                                type="number"
                                step="0.1"
                                min="0.5"
                                max="25.0"
                                value={defaultColWidthCm}
                                onChange={(e) => handleDefaultColWidthCmChange(Number(e.target.value))}
                                className="w-14 text-center font-mono font-bold text-xs text-indigo-700 bg-slate-50 border border-slate-200 rounded py-0.5 outline-none focus:border-blue-500"
                              />
                              <span className="text-xs font-semibold text-slate-500">cm</span>
                            </div>
                            <button
                              onClick={() => handleDefaultColWidthCmChange(defaultColWidthCm + 0.1)}
                              className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                              title="Aumentar 0.1 cm"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Quick Dimension Actions */}
                        <div className="md:col-span-3 flex flex-col gap-1 justify-end">
                          <label className="font-semibold text-xs text-slate-700 flex items-center gap-1">
                            <Settings className="w-3.5 h-3.5 text-blue-600" />
                            Ações de Dimensionamento
                          </label>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={handleDistributeColWidths}
                              className="flex-1 px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-semibold border border-blue-200 transition-colors"
                              title="Distribui a largura total da tabela igualmente entre todas as colunas"
                            >
                              Equidistribuir
                            </button>
                            <button
                              onClick={handleFitTableWidthToColumns}
                              className="flex-1 px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-semibold border border-indigo-200 transition-colors"
                              title="Ajusta a largura do quadro da tabela para a soma exata das colunas"
                            >
                              Ajustar Folha
                            </button>
                            {columnWidthsCm && (
                              <button
                                onClick={handleResetColWidths}
                                className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold border border-slate-300 transition-colors"
                                title="Redefinir todas as colunas para a largura padrão"
                              >
                                Redefinir
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Content based on Tab */}
                    {tableTabMode === "preview" && (
                      <div 
                        style={{ fontFamily }}
                        className="overflow-x-auto border border-slate-300 rounded-lg max-h-96 shadow-inner bg-white"
                      >
                        <table className="w-full text-left border-collapse whitespace-nowrap">
                          <thead>
                            <tr 
                              style={{ 
                                backgroundColor: headerBgColor, 
                                color: headerColor,
                                height: `${Math.max(28, headerRowHeightCm * 35)}px`
                              }}
                              className="font-bold border-b border-slate-300 text-center"
                            >
                              {parsed.headers.map((h, hIdx) => {
                                const colW = getColWidthCm(hIdx);
                                return (
                                  <th 
                                    key={hIdx} 
                                    style={{ 
                                      fontSize: `${Math.max(9, headerFontSizeCm * 40)}px`,
                                      width: `${colW * 35}px`,
                                      minWidth: `${colW * 35}px`
                                    }}
                                    className="p-2 border-r border-slate-200 last:border-r-0 align-middle"
                                  >
                                    <div className="flex flex-col items-center gap-1">
                                      <span>{h}</span>
                                      <div className="flex items-center gap-0.5 bg-black/10 hover:bg-black/20 rounded px-1 py-0.5 text-[10px] font-mono font-normal">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleColWidthCmChange(hIdx, colW - 0.1);
                                          }}
                                          className="px-1 hover:bg-black/20 rounded font-bold"
                                          title="Diminuir largura da coluna"
                                        >
                                          -
                                        </button>
                                        <span>{colW.toFixed(1)}cm</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleColWidthCmChange(hIdx, colW + 0.1);
                                          }}
                                          className="px-1 hover:bg-black/20 rounded font-bold"
                                          title="Aumentar largura da coluna"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {parsed.rows.map((row, rIdx) => (
                              <tr 
                                key={rIdx} 
                                style={{ height: `${Math.max(24, rowHeightCm * 35)}px` }}
                                className={rIdx % 2 === 0 ? "bg-white" : "bg-slate-50 border-t border-slate-200"}
                              >
                                {row.map((cell, cIdx) => {
                                  const colW = getColWidthCm(cIdx);
                                  return (
                                    <td 
                                      key={cIdx} 
                                      style={{ 
                                        fontSize: `${Math.max(9, cellFontSizeCm * 40)}px`,
                                        color: textColor,
                                        width: `${colW * 35}px`,
                                        minWidth: `${colW * 35}px`
                                      }}
                                      className="p-2 border-r border-slate-200 last:border-r-0 text-center leading-tight align-middle"
                                    >
                                      {cell.split(/<br\s*\/?>|\n/gi).map((part, pIdx) => (
                                        <React.Fragment key={pIdx}>
                                          {pIdx > 0 && <br />}
                                          {part}
                                        </React.Fragment>
                                      ))}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {tableTabMode === "cells" && (
                      <div className="flex flex-col gap-2" style={{ fontFamily }}>
                        <div className="overflow-x-auto border border-slate-300 rounded-lg max-h-96 shadow-inner bg-white">
                          <table className="w-full text-left border-collapse whitespace-nowrap">
                            <thead>
                              <tr 
                                style={{ backgroundColor: headerBgColor, color: headerColor }}
                                className="font-bold border-b border-slate-300 text-center"
                              >
                                <th className="p-2 border-r border-slate-300 text-center w-10 text-xs">Ação</th>
                                {parsed.headers.map((h, hIdx) => {
                                  const colW = getColWidthCm(hIdx);
                                  return (
                                    <th key={hIdx} className="p-1 border-r border-slate-300 last:border-r-0 min-w-[130px]">
                                      <div className="flex flex-col gap-1">
                                        <input
                                          type="text"
                                          value={h}
                                          style={{ 
                                            fontSize: `${Math.max(9, headerFontSizeCm * 40)}px`,
                                            color: headerColor,
                                            backgroundColor: headerBgColor
                                          }}
                                          onChange={(e) => handleHeaderChange(hIdx, e.target.value)}
                                          className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-center font-bold focus:border-blue-600 outline-none"
                                        />
                                        <div className="flex items-center justify-center gap-1 bg-white/80 rounded px-1 py-0.5 text-[10px] text-slate-700 font-mono border border-slate-200">
                                          <span className="text-slate-500">Larg:</span>
                                          <button
                                            onClick={() => handleColWidthCmChange(hIdx, colW - 0.1)}
                                            className="w-4 h-4 flex items-center justify-center font-bold hover:bg-slate-200 rounded"
                                            title="Diminuir largura da coluna"
                                          >
                                            -
                                          </button>
                                          <input
                                            type="number"
                                            step="0.1"
                                            min="0.4"
                                            max="30.0"
                                            value={colW}
                                            onChange={(e) => handleColWidthCmChange(hIdx, Number(e.target.value))}
                                            className="w-10 text-center bg-transparent border-0 font-bold text-blue-700 outline-none"
                                          />
                                          <span className="text-slate-500">cm</span>
                                          <button
                                            onClick={() => handleColWidthCmChange(hIdx, colW + 0.1)}
                                            className="w-4 h-4 flex items-center justify-center font-bold hover:bg-slate-200 rounded"
                                            title="Aumentar largura da coluna"
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {parsed.rows.map((row, rIdx) => (
                                <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-white" : "bg-slate-50 border-t border-slate-200"}>
                                  <td className="p-1 border-r border-slate-200 text-center">
                                    <button
                                      onClick={() => handleDeleteRow(rIdx)}
                                      className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                      title="Excluir esta linha"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                  {row.map((cell, cIdx) => (
                                    <td key={cIdx} className="p-1 border-r border-slate-200 last:border-r-0">
                                      <input
                                        type="text"
                                        value={cell}
                                        style={{ 
                                          fontSize: `${Math.max(9, cellFontSizeCm * 40)}px`,
                                          color: textColor
                                        }}
                                        onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                                        className="w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-600 focus:bg-white rounded px-1.5 py-0.5 text-center outline-none"
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex justify-between items-center pt-1">
                          <button
                            onClick={handleAddRow}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-blue-200 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Adicionar Nova Linha
                          </button>
                          <span className="text-[11px] text-slate-500">
                            Total de Linhas: {parsed.rows.length} | Colunas: {parsed.headers.length}
                          </span>
                        </div>
                      </div>
                    )}

                    {tableTabMode === "markdown" && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <label className="font-semibold text-xs text-slate-700">
                            Código Markdown das Linhas (Cabeçalho + Separador + Registros)
                          </label>
                          <span className="text-[11px] text-slate-500">
                            Edite livremente o texto das linhas mantendo a estrutura de colunas separadas por pipe (|)
                          </span>
                        </div>
                        <textarea
                          rows={12}
                          value={currentLines}
                          onChange={(e) => handleLinesChange(e.target.value)}
                          className="w-full font-mono text-xs p-3 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none leading-relaxed"
                          placeholder="| Nº | DEFLEXÃO/AZIMUTE | LC (m) | TC (m) | ... |"
                        />
                        <p className="text-[11px] text-slate-500">
                          * As alterações feitas neste editor são analisadas e refletidas instantaneamente na tabela da prancha.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : (
              <div className="flex flex-col gap-3 py-4 text-center">
                <p className="text-sm text-slate-600">
                  Nenhuma tabela selecionada no momento. Você pode criar uma nova tabela abaixo ou selecionar uma tabela existente na folha.
                </p>
                <button
                  onClick={() => store.addProductionTable()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm self-center flex items-center gap-2 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Criar Nova Tabela
                </button>
              </div>
            )}

            <div className="flex justify-between items-center mt-2 border-t border-slate-200 pt-3">
              {selectedTable && (
                <button
                  onClick={() => {
                    store.removeProductionTable(selectedTable.id);
                    setIsEditingTable(false);
                  }}
                  className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded text-xs font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir Tabela
                </button>
              )}
              <button
                onClick={() => setIsEditingTable(false)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold text-sm ml-auto shadow-sm"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de configuração da malha de coordenadas */}
      {gridCfgOpen !== null && (() => {
        const gi = gridCfgOpen;
        const cfg = { ...defaultGridStyle(), ...(store.productionGridStyles?.[gi] || {}) };
        const set = (patch: any) => store.setProductionGridStyle(gi, patch);
        const fld = "w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none";
        const lbl = "text-[11px] font-semibold text-slate-400 uppercase tracking-wider";
        return (
          <div className="fixed inset-0 z-[380] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-xl text-slate-100 flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Grid3x3 size={16} className="text-blue-400" />
                  Malha de coordenadas — Viewport {gi + 1}
                </h3>
                <button onClick={() => setGridCfgOpen(null)} className="text-slate-400 hover:text-white text-lg leading-none px-1">×</button>
              </div>

              <div className="p-5 flex flex-col gap-4 overflow-y-auto">
                <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700 rounded px-3 py-2">
                  <span className="text-sm">Exibir malha na janela</span>
                  <button
                    onClick={() => setViewportGrid(gi, viewportGrids[gi] === "Ligar" ? "Desligar" : "Ligar")}
                    className={`px-3 py-1 rounded text-xs font-semibold ${viewportGrids[gi] === "Ligar" ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300"}`}
                  >
                    {viewportGrids[gi] === "Ligar" ? "Ligada" : "Desligada"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className={lbl}>Rótulo</label>
                    <select value={cfg.labelMode} onChange={(e) => set({ labelMode: e.target.value })} className={fld}>
                      <option value="NE">N= / E= (Norte / Este)</option>
                      <option value="XY">Y= / X= (coordenadas X,Y)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={lbl}>Sequência (m)</label>
                    <input
                      type="number" min={0} step={10} value={cfg.spacingM}
                      onChange={(e) => set({ spacingM: parseFloat(e.target.value) || 0 })}
                      className={fld}
                    />
                    <span className="text-[10px] text-slate-500">0 = automático pela escala. Ex.: 100 = de 100 em 100 m.</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className={lbl}>Fonte</label>
                    <select value={cfg.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} className={fld}>
                      <option value="Arial, Helvetica, sans-serif">Arial</option>
                      <option value="Helvetica, Arial, sans-serif">Helvetica</option>
                      <option value="'Times New Roman', serif">Times New Roman</option>
                      <option value="'Courier New', monospace">Courier New</option>
                      <option value="Verdana, sans-serif">Verdana</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={lbl}>Tamanho do texto (mm)</label>
                    <input
                      type="number" min={0.5} max={20} step={0.1} value={cfg.textSizeMm}
                      onChange={(e) => set({ textSizeMm: parseFloat(e.target.value) || 2 })}
                      className={fld}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className={lbl}>Cor do texto</label>
                    <AciColorPicker value={cfg.textColor} onChange={(c: string) => set({ textColor: c })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={lbl}>Cor da linha</label>
                    <AciColorPicker value={cfg.lineColor} onChange={(c: string) => set({ lineColor: c })} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className={lbl}>Espessura da linha (mm)</label>
                    <input
                      type="number" min={0.01} max={2} step={0.05} value={cfg.lineWidthMm}
                      onChange={(e) => set({ lineWidthMm: parseFloat(e.target.value) || 0.15 })}
                      className={fld}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={lbl}>Layer</label>
                    <select value={cfg.layerId} onChange={(e) => set({ layerId: e.target.value })} className={fld}>
                      <option value="">— sem layer (usa as cores acima) —</option>
                      {store.layers.map((l: any) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-500">Com layer, a cor e a visibilidade do layer prevalecem na linha.</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 border-t border-slate-800 pt-3">
                  Tamanho de texto e espessura são em milímetros de prancha: saem iguais no PDF em qualquer escala ou tamanho de folha.
                </p>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-700 px-5 py-3">
                <button onClick={() => store.setProductionGridStyle(gi, defaultGridStyle())} className="px-3 py-1.5 rounded text-sm bg-slate-700 hover:bg-slate-600">Restaurar padrão</button>
                <button onClick={() => setGridCfgOpen(null)} className="px-4 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-500 font-semibold">Concluir</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Profile View Band Set */}
      {bandSetModalOpen !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-slate-700 p-6 rounded-lg shadow-2xl max-w-2xl w-full flex flex-col gap-6" style={{ maxHeight: '90vh' }}>
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
               <h3 className="text-xl font-semibold text-white">Configurar Faixas (Profile View)</h3>
               <button onClick={() => setBandSetModalOpen(null)} className="text-slate-400 hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4">
               {(() => {
                  const bands = store.productionViewportProfileBands?.[bandSetModalOpen] || [];
                  const setBands = (newBands) => store.setProductionViewportProfileBands(bandSetModalOpen, newBands);
                  
                  return (
                     <>
                        {bands.length === 0 ? (
                           <div className="text-center py-8 text-slate-500 bg-slate-800/50 rounded-lg border border-slate-700 border-dashed">
                              Nenhuma faixa configurada para este Profile View.
                           </div>
                        ) : (
                           <div className="flex flex-col gap-3">
                              {bands.map((band, idx) => (
                                 <div key={idx} className="flex flex-col gap-3 bg-slate-800 border border-slate-700 p-4 rounded-lg relative group">
                                    <button 
                                      onClick={() => {
                                        const nb = [...bands];
                                        nb.splice(idx, 1);
                                        setBands(nb);
                                      }}
                                      className="absolute top-2 right-2 p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                                      title="Remover Faixa"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                    
                                    <div className="flex items-center gap-4 pr-8">
                                       <div className="flex flex-col gap-1 w-1/3">
                                          <label className="text-xs font-semibold text-slate-400 uppercase">Tipo</label>
                                          <select 
                                            value={band.type}
                                            onChange={(e) => {
                                               const nb = [...bands];
                                               nb[idx] = { ...nb[idx], type: e.target.value as any };
                                               setBands(nb);
                                            }}
                                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white outline-none"
                                          >
                                            <option value="Profile Data">Profile Data (Dados de Perfil)</option>
                                            <option value="Vertical Geometry">Vertical Geometry (Geometria Vertical)</option>
                                            <option value="Horizontal Geometry">Horizontal Geometry (Geometria Horizontal)</option>
                                            <option value="Superelevation">Superelevation (Superelevação)</option>
                                          </select>
                                       </div>
                                       <div className="flex flex-col gap-1 flex-1">
                                          <label className="text-xs font-semibold text-slate-400 uppercase">Título (Opcional)</label>
                                          <input 
                                            type="text" 
                                            value={band.label || ""}
                                            onChange={(e) => {
                                               const nb = [...bands];
                                               nb[idx] = { ...nb[idx], label: e.target.value };
                                               setBands(nb);
                                            }}
                                            placeholder="Ex: Terreno vs Projeto"
                                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white outline-none"
                                          />
                                       </div>
                                       <div className="flex flex-col gap-1 w-24">
                                          <label className="text-xs font-semibold text-slate-400 uppercase">Altura (mm)</label>
                                          <input 
                                            type="number" 
                                            value={band.height || 15}
                                            onChange={(e) => {
                                               const nb = [...bands];
                                               nb[idx] = { ...nb[idx], height: Number(e.target.value) };
                                               setBands(nb);
                                            }}
                                            min="5"
                                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white outline-none"
                                          />
                                       </div>
                                    </div>
                                    
                                    {band.type === 'Profile Data' && (
                                       <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-700">
                                          <div className="flex flex-col gap-1 flex-1">
                                             <label className="text-xs font-semibold text-slate-400 uppercase">Perfil 1 (Ex: Terreno)</label>
                                             <select 
                                                value={band.profile1 || ""}
                                                onChange={(e) => {
                                                   const nb = [...bands];
                                                   nb[idx] = { ...nb[idx], profile1: e.target.value };
                                                   setBands(nb);
                                                }}
                                                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white outline-none"
                                             >
                                                <option value="">(Nenhum)</option>
                                                {store.surfaces.map(s => <option key={s.id} value={s.id}>{s.name} (Superfície)</option>)}
                                                {store.alignments.map(a => <option key={a.id} value={a.id}>{a.name} (Greide)</option>)}
                                             </select>
                                          </div>
                                          <div className="flex flex-col gap-1 flex-1">
                                             <label className="text-xs font-semibold text-slate-400 uppercase">Perfil 2 (Ex: Projeto)</label>
                                             <select 
                                                value={band.profile2 || ""}
                                                onChange={(e) => {
                                                   const nb = [...bands];
                                                   nb[idx] = { ...nb[idx], profile2: e.target.value };
                                                   setBands(nb);
                                                }}
                                                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white outline-none"
                                             >
                                                <option value="">(Nenhum)</option>
                                                {store.alignments.map(a => <option key={a.id} value={a.id}>{a.name} (Greide)</option>)}
                                                {store.surfaces.map(s => <option key={s.id} value={s.id}>{s.name} (Superfície)</option>)}
                                             </select>
                                          </div>
                                       </div>
                                    )}
                                 </div>
                              ))}
                           </div>
                        )}
                        
                        <div className="flex flex-wrap gap-2 mt-2">
                           <button 
                             onClick={() => setBands([...bands, { type: "Profile Data", height: 20 }])}
                             className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded text-sm transition-colors"
                           >
                             + Profile Data
                           </button>
                           <button 
                             onClick={() => setBands([...bands, { type: "Vertical Geometry", height: 15 }])}
                             className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded text-sm transition-colors"
                           >
                             + Vertical Geometry
                           </button>
                           <button 
                             onClick={() => setBands([...bands, { type: "Horizontal Geometry", height: 15 }])}
                             className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded text-sm transition-colors"
                           >
                             + Horizontal Geometry
                           </button>
                           <button 
                             onClick={() => setBands([...bands, { type: "Superelevation", height: 15 }])}
                             className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded text-sm transition-colors"
                           >
                             + Superelevation
                           </button>
                        </div>
                     </>
                  );
               })()}
            </div>
            <div className="flex justify-end pt-3 border-t border-slate-700">
              <button
                onClick={() => setBandSetModalOpen(null)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white font-medium transition-colors"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
