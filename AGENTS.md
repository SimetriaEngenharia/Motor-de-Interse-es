# Contrato de trabalho — Simetria

Leia isto antes de escrever qualquer linha. Vale para **qualquer** assistente que
abrir este projeto: Gemini no AI Studio, Claude no Omelette, ou você.

Este mesmo projeto circula entre dois ambientes, em zip, nas duas direções.
Tudo abaixo existe para que a viagem não quebre nada.

---

## 1. Fonte única

`app/src/` é a aplicação inteira. Não crie cópia, fork, pasta `v2`, nem "versão do
AI Studio". Se dois arquivos fazem a mesma coisa, um deles é lixo — apague.

## 2. Duas portas, um código

- **Vite / AI Studio:** `index.html` → `/app/src/main.tsx`. Config em `vite.config.ts`.
- **Omelette / Claude:** `Simetria.dc.html` → `app/loader.js`, que compila TS/TSX no
  navegador via Babel standalone e resolve dependências por esm.sh. Sem build.

Nenhuma das duas portas é descartável. Mudança que só funciona em uma delas está errada.

## 3. REGRA DE OURO — o manifesto

O loader do navegador não consegue listar diretórios, então lê `app/manifest.json`.

> **Criou, renomeou ou apagou arquivo em `app/src`? Rode `npm run sync`.**

`npm run dev` e `npm run build` já rodam o sync antes. Se você editou sem Node à mão,
edite `app/manifest.json` na unha (array de caminhos `"src/..."`). Esquecer disso é a
falha número um da ida e volta — o app abre em branco do outro lado.

## 4. Dependências

Nova dependência entra em `package.json`. O loader resolve qualquer pacote npm
automaticamente por esm.sh, então normalmente basta isso. Evite pacotes que exijam
plugin de build, worker próprio ou binário nativo — eles funcionam no Vite e morrem
no loader.

Versões fixadas hoje: React 19.1, three 0.184, Tailwind 4.1.

## 5. Estilo do código

- **Português** em UI, nomes de domínio (`narizFisico`, `bordo`, `quadrante`) e comentários.
- Comentário explica **por que**, nunca o que a linha já diz. Comentário que narra é lixo.
- Tailwind v4 direto no JSX; tema em `app/src/index.css` (`@theme`), sem arquivo de config.
- Nada de `console.log` deixado para trás. `console.error`/`warn` só em caminho de erro real.
- Estado global no `store.ts`; geometria pura em `lib/`, sem React dentro.

## 6. Onde a engenharia mora

`app/src/lib/intersection.ts` é o coração e a parte mais delicada: concordância
bordo-com-bordo, nariz físico (NF), quadrantes, fillets, alvos. Antes de mexer, leia
`HANDOFF.md` e `docs/nariz-gore-plano.md`. Regra prática: geometria se resolve por
correspondência de tokens de ramo, **nunca** por ordem de construção — ordem gera
piscada e regressão.

## 7. Ao terminar uma rodada

Atualize `HANDOFF.md`: o que mudou, o que ficou pendente, onde parar de procurar.
É o único registro que atravessa o zip. Depois exporte/zipe a raiz inteira.

## 8. Não mexa sem motivo

`app/loader.js`, `support.js`, `Simetria.dc.html` são o runtime do Omelette.
`index.html`, `vite.config.ts`, `metadata.json` são o runtime do AI Studio.
Mexer neles quebra a outra ponta.
