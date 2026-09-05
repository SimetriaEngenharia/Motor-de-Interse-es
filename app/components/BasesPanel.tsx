import React, { useMemo, useState } from "react";
import {
  Boxes, Plus, Trash2, Edit3, Copy, X, Search, Mountain, Spline,
  Route, GitMerge, MapPin, Minus, Circle as CircleIcon, Share2,
} from "lucide-react";
import { useStore, emptyBaseMembers } from "../store";
import type { BaseMemberKind, BaseMembers, ProjectBase } from "../store";

const BASE_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#a855f7", "#0ea5e9", "#64748b"];

type Grupo = {
  kind: BaseMemberKind;
  label: string;
  icon: React.ReactNode;
  items: { id: string; label: string; sub?: string }[];
};

function useGrupos(): Grupo[] {
  const surfaces = useStore((s) => s.surfaces);
  const alignments = useStore((s) => s.alignments);
  const corridors = useStore((s) => s.corridors);
  const drawnGeometries = useStore((s) => s.drawnGeometries);
  const points3D = useStore((s) => s.points3D);
  const lines3D = useStore((s) => s.lines3D);
  const circles3D = useStore((s) => s.circles3D);
  const intersections = useStore((s) => s.intersections);
  const corridorFeatures = useStore((s) => s.corridorFeatures);
  const corridors2 = useStore((s) => s.corridors);

  return useMemo<Grupo[]>(() => [
    {
      kind: "surfaces", label: "Superfícies", icon: <Mountain size={13} className="text-amber-500" />,
      items: (surfaces || []).map((s: any) => ({ id: s.id, label: s.name || s.id })),
    },
    {
      kind: "alignments", label: "Alinhamentos", icon: <Spline size={13} className="text-blue-500" />,
      items: (alignments || []).map((a: any) => ({ id: a.id, label: a.name || a.id })),
    },
    {
      kind: "corridors", label: "Corredores", icon: <Route size={13} className="text-purple-500" />,
      items: (corridors || []).map((c: any) => ({ id: c.id, label: c.name || c.id })),
    },
    {
      kind: "corridorLines", label: "Linhas do corredor", icon: <Minus size={13} className="text-teal-500" />,
      items: (corridorFeatures || []).map((f: any) => ({
        id: `${f.corridorId}|${f.id}`,
        label: String(f.id).replace(/_/g, " "),
        sub: (corridors2 || []).find((c: any) => c.id === f.corridorId)?.name,
      })),
    },
    {
      kind: "geometries", label: "Geometrias extraídas", icon: <GitMerge size={13} className="text-rose-500" />,
      items: (drawnGeometries || []).map((g: any) => ({
        id: g.id, label: g.name || g.id,
        sub: typeof g.length === "number" ? `${g.length.toFixed(2)} m` : undefined,
      })),
    },
    {
      kind: "intersections", label: "Interseções / narizes", icon: <Share2 size={13} className="text-orange-500" />,
      items: (intersections || []).map((i: any) => ({ id: i.id, label: i.name || i.id })),
    },
    {
      kind: "points3D", label: "Pontos 3D", icon: <MapPin size={13} className="text-emerald-500" />,
      items: (points3D || []).map((p: any, i: number) => ({
        id: p.id, label: p.description || `Ponto ${i + 1}`,
        sub: `X ${p.x.toFixed(2)} · Y ${p.y.toFixed(2)}`,
      })),
    },
    {
      kind: "lines3D", label: "Linhas 3D", icon: <Minus size={13} className="text-sky-500" />,
      items: (lines3D || []).map((l: any, i: number) => ({
        id: l.id, label: l.description || `Linha ${i + 1}`,
        sub: `${Math.hypot(l.p2.x - l.p1.x, l.p2.y - l.p1.y).toFixed(2)} m`,
      })),
    },
    {
      kind: "circles3D", label: "Círculos 3D", icon: <CircleIcon size={13} className="text-indigo-500" />,
      items: (circles3D || []).map((c: any, i: number) => ({
        id: c.id, label: c.description || `Círculo ${i + 1}`,
        sub: `R ${c.radius.toFixed(2)} m`,
      })),
    },
  ], [surfaces, alignments, corridors, corridorFeatures, corridors2, drawnGeometries, intersections, points3D, lines3D, circles3D]);
}

/* Componente de origem de uma linha do corredor, lido do nome da feature line. */
const COMPONENTES = [
  "Sarjeta", "Talude", "Banqueta", "Bordo", "Faixa", "Acostamento", "Guia",
  "Meio Fio", "Passeio", "New Jersey", "Canteiro", "Refúgio", "Pista",
  "Sub-base", "Base", "Datum", "Eixo",
];
export function componenteDaLinha(label: string): string {
  const l = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/_/g, " ");
  for (const c of COMPONENTES) {
    const alvo = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (l.includes(alvo)) return c;
  }
  return "Outros";
}

const contarMembros = (m: BaseMembers) =>
  Object.values(m || {}).reduce((a: number, v: any) => a + (Array.isArray(v) ? v.length : 0), 0);

function BaseModal({ base, onClose }: { base: ProjectBase | null; onClose: () => void }) {
  const store = useStore();
  const grupos = useGrupos();
  const [name, setName] = useState(base?.name || `Base ${(store.bases?.length || 0) + 1}`);
  const [color, setColor] = useState(base?.color || BASE_COLORS[(store.bases?.length || 0) % BASE_COLORS.length]);
  const [members, setMembers] = useState<BaseMembers>({ ...emptyBaseMembers(), ...(base?.members || {}) });
  const [busca, setBusca] = useState("");
  const [filtroCorr, setFiltroCorr] = useState("");
  const [filtroComp, setFiltroComp] = useState("");

  const toggle = (kind: BaseMemberKind, id: string) =>
    setMembers((m) => {
      const atual = m[kind] || [];
      return { ...m, [kind]: atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id] };
    });

  const setGrupo = (g: Grupo, todos: boolean, visiveis?: { id: string }[]) =>
    setMembers((m) => {
      const alvo = (visiveis || g.items).map((i) => i.id);
      const atual = m[g.kind] || [];
      return {
        ...m,
        [g.kind]: todos
          ? Array.from(new Set([...atual, ...alvo]))
          : atual.filter((x) => !alvo.includes(x)),
      };
    });

  const guardar = () => {
    const payload = { name: name.trim() || "Base", color, active: base ? base.active : true, members };
    if (base) store.updateBase(base.id, payload);
    else store.addBase(payload);
    onClose();
  };

  const q = busca.trim().toLowerCase();
  const total = contarMembros(members);

  return (
    <div className="fixed inset-0 z-[600] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6" onMouseDown={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-[560px] max-w-full max-h-[85vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 m-0">
            <Boxes size={16} className="text-blue-600" />
            {base ? "Editar Base" : "Nova Base"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1"><X size={16} /></button>
        </div>

        <div className="px-4 py-3 flex flex-col gap-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da base"
              className="flex-1 border border-slate-300 rounded px-2.5 py-1.5 text-sm text-slate-800 focus:border-blue-600 outline-none"
            />
            <div className="flex items-center gap-1">
              {BASE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full border-2 ${color === c ? "border-slate-800" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar elemento…"
              className="w-full border border-slate-200 rounded pl-8 pr-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-600 outline-none bg-slate-50"
            />
          </div>
          <p className="text-[10px] text-slate-500 m-0 leading-relaxed">
            A base apenas liga/desliga os elementos escolhidos. Um elemento pode pertencer a várias bases e nada é alterado no projeto.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 flex flex-col gap-3">
          {grupos.map((g) => {
            let itens = q ? g.items.filter((i) => i.label.toLowerCase().includes(q)) : g.items;
            const ehLinhas = g.kind === "corridorLines";
            if (ehLinhas) {
              /* Filtro pelo id do corredor (imune a nomes repetidos) e pelo
               * componente lido do nome da linha. */
              if (filtroCorr) itens = itens.filter((i) => String(i.id).split("|")[0] === filtroCorr);
              if (filtroComp) itens = itens.filter((i) => componenteDaLinha(i.label) === filtroComp);
            }
            if (q && itens.length === 0) return null;
            const sel = members[g.kind] || [];
            const corrOpcoes = ehLinhas
              ? Array.from(
                  new Map(
                    g.items.map((i) => [String(i.id).split("|")[0], i.sub || String(i.id).split("|")[0]]),
                  ).entries(),
                )
              : ([] as [string, string][]);
            const compOpcoes = ehLinhas
              ? Array.from(new Set(g.items.map((i) => componenteDaLinha(i.label)))).sort()
              : [];
            return (
              <div key={g.kind} className="border border-slate-200 rounded-lg overflow-hidden shrink-0">
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border-b border-slate-200">
                  {g.icon}
                  <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">{g.label}</span>
                  <span className="text-[10px] text-slate-400">{sel.length}/{g.items.length}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setGrupo(g, true, itens)} className="text-[10px] text-blue-600 hover:underline" disabled={!itens.length}>todos</button>
                    <button onClick={() => setGrupo(g, false, itens)} className="text-[10px] text-slate-500 hover:underline" disabled={!sel.length}>nenhum</button>
                  </div>
                </div>
                {ehLinhas && g.items.length > 0 && (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white border-b border-slate-100">
                    <select
                      value={filtroCorr}
                      onChange={(e) => setFiltroCorr(e.target.value)}
                      className="flex-1 min-w-0 border border-slate-200 rounded px-1.5 py-1 text-[11px] text-slate-700 bg-slate-50 outline-none focus:border-blue-600"
                    >
                      <option value="">Todos os corredores</option>
                      {corrOpcoes.map(([cid, cnome]) => <option key={cid} value={cid}>{cnome}</option>)}
                    </select>
                    <select
                      value={filtroComp}
                      onChange={(e) => setFiltroComp(e.target.value)}
                      className="flex-1 min-w-0 border border-slate-200 rounded px-1.5 py-1 text-[11px] text-slate-700 bg-slate-50 outline-none focus:border-blue-600"
                    >
                      <option value="">Todos os componentes</option>
                      {compOpcoes.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <span className="text-[10px] text-slate-400 shrink-0">{itens.length} linha{itens.length === 1 ? "" : "s"}</span>
                  </div>
                )}
                {g.items.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic px-2.5 py-2 m-0">Nenhum elemento deste tipo no projeto.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto custom-scrollbar shrink-0">
                    {itens.map((it) => (
                      <label key={it.id} className="flex items-center gap-2 px-2.5 py-1 hover:bg-slate-50 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={sel.includes(it.id)}
                          onChange={() => toggle(g.kind, it.id)}
                          className="rounded text-blue-600 focus:ring-blue-500 bg-white"
                        />
                        <span className="text-[11px] text-slate-700 truncate">{it.label}</span>
                        {it.sub && <span className="text-[10px] text-slate-400 ml-auto shrink-0 font-mono">{it.sub}</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
          <span className="text-[11px] text-slate-500">{total} elemento{total === 1 ? "" : "s"} nesta base</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900">Cancelar</button>
            <button onClick={guardar} className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded">
              {base ? "Guardar" : "Criar Base"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BasesPanel() {
  const bases = useStore((s) => s.bases) || [];
  const toggleBase = useStore((s) => s.toggleBase);
  const removeBase = useStore((s) => s.removeBase);
  const duplicateBase = useStore((s) => s.duplicateBase);
  const [modal, setModal] = useState<{ open: boolean; base: ProjectBase | null }>({ open: false, base: null });

  return (
    <div className="flex flex-col gap-2 p-3 bg-slate-100 rounded-md border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-1">
        <h3 className="text-slate-800 font-medium flex items-center gap-2 m-0">
          <Boxes size={15} className="text-blue-600" /> Bases
        </h3>
        <button
          onClick={() => setModal({ open: true, base: null })}
          className="flex items-center gap-1 px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold"
        >
          <Plus size={12} /> Nova Base
        </button>
      </div>

      {bases.length === 0 ? (
        <p className="text-[11px] text-slate-500 italic m-0 leading-relaxed">
          Sem bases criadas — todos os elementos do projeto estão visíveis. Crie uma base para poder desligar um conjunto de elementos de uma só vez.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {bases.map((b) => {
            const n = contarMembros(b.members);
            return (
              <div key={b.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={b.active !== false}
                  onChange={() => toggleBase(b.id)}
                  className="rounded text-blue-600 focus:ring-blue-500 bg-white"
                  title={b.active !== false ? "Base ligada" : "Base desligada"}
                />
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                <span className={`text-xs truncate ${b.active !== false ? "text-slate-800" : "text-slate-400 line-through"}`}>{b.name}</span>
                <span className="text-[10px] text-slate-400 ml-auto shrink-0">{n}</span>
                <button onClick={() => setModal({ open: true, base: b })} className="text-slate-500 hover:text-blue-600 p-0.5" title="Editar base">
                  <Edit3 size={12} />
                </button>
                <button onClick={() => duplicateBase(b.id)} className="text-slate-500 hover:text-emerald-600 p-0.5" title="Duplicar base">
                  <Copy size={12} />
                </button>
                <button onClick={() => removeBase(b.id)} className="text-slate-500 hover:text-rose-600 p-0.5" title="Eliminar base">
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
          <p className="text-[10px] text-slate-500 m-0 mt-1 leading-relaxed">
            Um elemento fica oculto só quando todas as bases que o contêm estão desligadas. Quem não pertence a nenhuma base continua visível.
          </p>
        </div>
      )}

      {modal.open && <BaseModal base={modal.base} onClose={() => setModal({ open: false, base: null })} />}
    </div>
  );
}
