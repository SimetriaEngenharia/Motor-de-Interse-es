# Simetria

> **Assistente de IA lendo isto (Gemini, Claude, Copilot):** este projeto já existe e é
> grande. Leia [GEMINI.md](GEMINI.md) e [AGENTS.md](AGENTS.md) antes de escrever qualquer
> linha, e **não regenere** `app/src/store.ts` nem `app/src/lib/intersection.ts`.

Projeto geométrico rodoviário paramétrico no navegador: traçado horizontal e vertical,
superelevação, seções tipo (subassemblies), interseções com narizes físicos e produção de
pranchas em PDF/DXF.

React 19 + TypeScript + Zustand + Tailwind v4 + three.js.

---

## O código vive em um lugar só

    app/src/          <- TODA a aplicação. Fonte única de verdade.
      main.tsx        <- entrada
      store.ts        <- estado global (Zustand + zundo/undo)
      lib/            <- geometria, interseções, DXF/PDF, DTM, normas
      components/     <- telas e painéis
      superelevation/ <- módulo de superelevação
    public/logo.png   <- marca
    docs/             <- notas de engenharia e material de referência

Nada mais é aplicação. O resto da raiz só existe para o app **abrir em dois lugares**:

| Onde | Porta de entrada | Como roda |
|---|---|---|
| Google AI Studio / local | `index.html` + `vite.config.ts` | Vite compila `app/src/main.tsx` |
| Omelette (Claude) | `Simetria.dc.html` + `app/loader.js` | compila os fontes no navegador, sem build |

Os dois leem **os mesmos arquivos de `app/src`**. Não existe versão paralela.

---

## Rodar no AI Studio (ou local)

```bash
npm install
cp .env.example .env.local     # opcional: GEMINI_API_KEY para o Criador de Seção Tipo
npm run dev
```

## Rodar no Omelette

Abrir `Simetria.dc.html`. Sem instalação, sem build.

## A única regra que quebra a ida e volta

Criou, renomeou ou apagou arquivo dentro de `app/src`? Rode:

```bash
npm run sync
```

Isso regenera `app/manifest.json`, que é como o loader do Omelette descobre os arquivos
(navegador não lista diretório). `npm run dev` e `npm run build` já rodam sozinhos.

Detalhes do contrato entre as duas pontas: **[AGENTS.md](AGENTS.md)**.
Estado atual e pendências: **[HANDOFF.md](HANDOFF.md)**.
