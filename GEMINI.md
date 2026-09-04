# Para o Gemini / Google AI Studio — LEIA ISTO PRIMEIRO

Você está **continuando** um projeto grande e em desenvolvimento, não começando um novo.
O zip que chegou é a versão mais recente e completa. Todo o código está em `app/src/`.

## O erro que você vai querer cometer

O modo mais comum de estragar este projeto é gerar um app novo a partir do zero — um
`index.tsx` na raiz, um `App.tsx` mínimo, um "vamos começar com a estrutura básica".
**Não faça isso.** O `store.ts` tem milhares de linhas e o
`app/src/lib/intersection.ts` é geometria rodoviária calibrada em campo, rodada a rodada,
com o projetista testando cada caso. Regenerar qualquer um dos dois apaga meses de
ajuste fino que nenhum prompt reconstrói.

Se você não tem certeza de que entendeu um trecho, **leia mais** — não reescreva.

## Faça nesta ordem

1. Leia **[AGENTS.md](AGENTS.md)** — o contrato. Curto e obrigatório.
2. Leia **[HANDOFF.md](HANDOFF.md)** — onde o trabalho parou e o que está pendente.
3. `npm install && npm run dev` — o app sobe em `http://localhost:3000`.
4. Diga ao usuário, em poucas linhas, o que você entendeu do estado atual. Espere.

## Regra de ouro

> **Criou, renomeou ou apagou arquivo em `app/src`? Rode `npm run sync` no mesmo passo.**

O loader do navegador (a outra porta do projeto) não lista diretórios: ele lê
`app/manifest.json`. Esquecer o sync é a falha número um da ida e volta — o app abre em
branco do outro lado e ninguém entende por quê. `npm run dev` e `npm run build` já rodam
o sync antes; se editar sem Node, edite `app/manifest.json` na unha.

## Não mexa

- `Simetria.dc.html`, `support.js`, `app/loader.js` — runtime da outra ponta.
- Versões fixadas: React 19.1, Tailwind v4.1 (tema em `app/src/index.css`, sem
  `tailwind.config`), three 0.184. Não migre para v3 nem para React 18.
- Não crie pasta `v2`, cópia, fork ou "versão do AI Studio". Fonte única.

## Estado atual (setembro de 2026)

O trabalho recente está todo no **motor de interseção**. Dois tipos existem:

- **Entroncamento** — validado em campo. Eixo da secundária nasce no eixo da principal,
  dois quadrantes, dois narizes físicos (NF), concordância bordo-com-bordo.
- **Alça** — recém-fechada conceitualmente: *a alça é o entroncamento inteiro menos um
  ramo*. Constrói-se o entroncamento, separa-se por ramos só do lado que sobrevive
  (saída → quadrante M-Back, entrada → M-Fwd) e **aposenta-se** o eixo central
  (`isHidden`, camada auxiliar, sem corredor) em vez de apagá-lo. Detalhes e itens em
  aberto no HANDOFF.

Princípio que não pode ser esquecido: **geometria de interseção se resolve por
correspondência de tokens de ramo, nunca por ordem de construção.** Ordem gera piscada e
regressão — isso já foi aprendido do jeito difícil.

## Chave de API

O painel "Criador de Seção Tipo com IA" (`app/src/components/AIGenerator.tsx`) fala com
`app/src/lib/aiChat.ts`, que tenta um backend em `/api/chat` e, se não houver, chama o
Gemini direto. Basta `GEMINI_API_KEY=...` em `.env.local` (modelo: `gemini-2.5-flash`).

## Ao terminar a rodada

Escreva o que mudou em **HANDOFF.md** — é o único registro que atravessa o zip — e
exporte a raiz inteira. Esse zip volta para o outro ambiente e o ciclo recomeça.

## Contexto do domínio

Engenharia rodoviária brasileira: normas DNIT/ARTESP, estaqueamento em `km+m`,
superelevação, narizes de interseção, pranchas com carimbo e articulação de folhas.
A UI é em português e o vocabulário do código também. Mantenha assim.

---

## Prompt inicial (cole junto com o zip)

> Este zip é um app React 19 + TypeScript + Vite já pronto e em desenvolvimento — não é
> para começar do zero. Antes de qualquer coisa, leia `GEMINI.md`, `AGENTS.md` e
> `HANDOFF.md` na raiz e siga o que está escrito lá. O código inteiro está em `app/src/`;
> não recrie, não mova e não reescreva nada que já existe — em especial `store.ts` e
> `app/src/lib/intersection.ts`. Rode `npm install` e `npm run dev` e me confirme que
> subiu. Depois me diga, em poucas linhas, o que você entendeu do estado atual e da
> pendência descrita no HANDOFF. Só então espere a minha próxima instrução.
