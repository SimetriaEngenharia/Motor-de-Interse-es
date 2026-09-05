import React, { useState } from "react";
import { GitBranch, TriangleAlert, Info } from "lucide-react";
import { useStore } from "../store";
import {
  validarGalho,
  regimeDoAngulo,
  type TopologiaGalho,
  type ParametrosGalho,
} from "../lib/galho";

/* NOVO GALHO — cria o ramo a partir da principal.
 *
 * A ordem se inverte em relação à interseção clássica: lá o eixo do ramo já
 * existe e a estaca é encontrada pelo cruzamento; aqui a estaca é escolhida e
 * o eixo é gerado. Por isso este painel pede estaca + ângulo em vez de pedir
 * dois alinhamentos que se cruzem. */
export function NovoGalhoPanel() {
  const alignments = useStore((s) => s.alignments);
  const corridors = useStore((s) => s.corridors);
  const criarGalho = useStore((s) => s.criarGalho);
  const setEditingIntersectionId = useStore((s) => s.setEditingIntersectionId);

  /* Só faz sentido nascer de uma principal que já tenha corredor: é o corredor
   * que diz onde está o bordo. */
  const comCorredor = alignments.filter((a: any) =>
    corridors.some((c: any) => c.alignmentId === a.id),
  );

  const [mainId, setMainId] = useState<string>(comCorredor[0]?.id || "");
  const [estaca, setEstaca] = useState(0);
  const [lado, setLado] = useState<"Esq" | "Dir">("Dir");
  const [angulo, setAngulo] = useState(45);
  const [comprimento, setComprimento] = useState(120);
  const [topologia, setTopologia] = useState<TopologiaGalho>("alca");
  const [maoUnica, setMaoUnica] = useState(true);
  const [sentido, setSentido] = useState<"entrada" | "saida">("saida");
  const [raio, setRaio] = useState(0);

  const main = alignments.find((a: any) => a.id === mainId);
  const staMax = main ? Math.floor(main.length) : 0;
  const staAtual = Math.min(estaca || Math.round(staMax / 2), staMax);

  const params: ParametrosGalho = {
    mainAlignmentId: mainId,
    mainStation: staAtual,
    lado,
    angulo,
    comprimento,
    topologia,
    maoUnica: topologia === "alca" ? true : maoUnica,
    sentido,
    raio: raio > 0 ? raio : undefined,
  };
  const avisos = mainId ? validarGalho(params) : [];
  const impedido = avisos.some((a) => a.nivel === "erro");
  const regime = regimeDoAngulo(angulo);

  const corRegime =
    regime === "cruzamento"
      ? "text-emerald-600"
      : regime === "limite"
        ? "text-amber-600"
        : "text-rose-600";
  const rotuloRegime =
    regime === "cruzamento" ? "Cruzamento" : regime === "limite" ? "Limite" : "Gore";

  const btn = (ativo: boolean) =>
    `flex-1 px-2 py-1.5 rounded text-[11px] font-medium border transition-colors ${
      ativo
        ? "bg-cyan-50 border-cyan-500 text-cyan-700"
        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
    }`;

  if (comCorredor.length === 0) {
    return (
      <div className="p-3 bg-white border border-slate-200 rounded text-[11px] text-slate-500 leading-relaxed">
        O galho precisa de uma principal com corredor construído — é dele que
        saem o bordo de concordância e a seção herdada.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-white border border-slate-200 rounded">
      <div className="flex items-center gap-2">
        <GitBranch size={14} className="text-cyan-700" />
        <h4 className="text-xs font-semibold text-slate-700">Novo Galho</h4>
        <span className={`ml-auto text-[10px] font-mono font-semibold ${corRegime}`}>
          {rotuloRegime}
        </span>
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        O ramo é gerado a partir da principal: escolha a estaca e o ângulo, e o
        eixo, o corredor e a interseção nascem juntos.
      </p>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-slate-500">Rodovia principal</span>
        <select
          value={mainId}
          onChange={(e) => setMainId(e.target.value)}
          className="bg-slate-50 border border-slate-300 text-slate-900 px-2 py-1.5 rounded text-xs focus:outline-none focus:border-cyan-600"
        >
          {comCorredor.map((a: any) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-slate-500">Topologia</span>
        <div className="flex gap-1.5">
          <button className={btn(topologia === "alca")} onClick={() => setTopologia("alca")}>
            Alça
          </button>
          <button
            className={btn(topologia === "entroncamento")}
            onClick={() => setTopologia("entroncamento")}
          >
            Entroncamento
          </button>
        </div>
        <span className="text-[10px] text-slate-400 leading-relaxed">
          {topologia === "alca"
            ? "Entroncamento com um ramo só: 1 nariz, no gore."
            : "Chega em ângulo até a principal: 2 narizes."}
        </span>
      </div>

      {topologia === "alca" ? (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-500">Sentido do ramo</span>
          <div className="flex gap-1.5">
            <button className={btn(sentido === "saida")} onClick={() => setSentido("saida")}>
              Saída
            </button>
            <button className={btn(sentido === "entrada")} onClick={() => setSentido("entrada")}>
              Entrada
            </button>
          </div>
          <span className="text-[10px] text-slate-400 leading-relaxed">
            Constrói o entroncamento e descarta o ramo do outro lado. O eixo
            central fica como construção, oculto e sem corredor — o ramo que
            sobra é filho do fillete, e por isso já nasce no bordo.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-500">Mão</span>
          <div className="flex gap-1.5">
            <button className={btn(maoUnica)} onClick={() => setMaoUnica(true)}>
              Única
            </button>
            <button className={btn(!maoUnica)} onClick={() => setMaoUnica(false)}>
              Dupla
            </button>
          </div>
          <span className="text-[10px] text-slate-400 leading-relaxed">
            A mão decide quantas faixas adicionais; a topologia, quantos narizes.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-slate-500">Lado</span>
        <div className="flex gap-1.5">
          <button className={btn(lado === "Dir")} onClick={() => setLado("Dir")}>
            Direito
          </button>
          <button className={btn(lado === "Esq")} onClick={() => setLado("Esq")}>
            Esquerdo
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-500">Estaca de nascimento</span>
          <span className="text-cyan-700 font-mono">{staAtual.toFixed(0)} m</span>
        </div>
        <input
          type="range"
          min={0}
          max={staMax}
          step={1}
          value={staAtual}
          onChange={(e) => setEstaca(parseFloat(e.target.value))}
          className="w-full accent-cyan-600 h-1.5 bg-slate-50 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-500">Ângulo de divergência</span>
          <span className="text-cyan-700 font-mono">{angulo}°</span>
        </div>
        <input
          type="range"
          min={5}
          max={90}
          step={1}
          value={angulo}
          onChange={(e) => setAngulo(parseFloat(e.target.value))}
          className="w-full accent-cyan-600 h-1.5 bg-slate-50 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-500">Comprimento</span>
          <span className="text-cyan-700 font-mono">{comprimento} m</span>
        </div>
        <input
          type="range"
          min={40}
          max={400}
          step={10}
          value={comprimento}
          onChange={(e) => setComprimento(parseFloat(e.target.value))}
          className="w-full accent-cyan-600 h-1.5 bg-slate-50 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-500">Raio do ramo</span>
          <span className="text-cyan-700 font-mono">{raio > 0 ? `${raio} m` : "reto"}</span>
        </div>
        <input
          type="range"
          min={0}
          max={300}
          step={10}
          value={raio}
          onChange={(e) => setRaio(parseFloat(e.target.value))}
          className="w-full accent-cyan-600 h-1.5 bg-slate-50 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {avisos.map((a, i) => (
        <div
          key={i}
          className={`flex gap-2 p-2 rounded border text-[10px] leading-relaxed ${
            a.nivel === "erro"
              ? "bg-rose-50 border-rose-200 text-rose-700"
              : "bg-amber-50 border-amber-200 text-amber-700"
          }`}
        >
          {a.nivel === "erro" ? (
            <TriangleAlert size={12} className="shrink-0 mt-0.5" />
          ) : (
            <Info size={12} className="shrink-0 mt-0.5" />
          )}
          <span>{a.texto}</span>
        </div>
      ))}

      <button
        disabled={impedido || !mainId}
        onClick={() => {
          const id = criarGalho(params);
          if (id) setEditingIntersectionId(id);
        }}
        className="flex items-center justify-center gap-2 p-2 rounded text-xs font-medium transition-colors bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <GitBranch size={13} />
        Criar Galho
      </button>

      <p className="text-[10px] text-slate-400 leading-relaxed">
        Depois de criado, o galho é um eixo comum: arraste a bolinha da
        interseção, edite os PIs e separe por ramos como em qualquer interseção.
        Só o ponto de nascimento é reancorado quando a principal muda.
      </p>
    </div>
  );
}
