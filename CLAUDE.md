# Simetria — instruções do projeto

App React+TS em `app/src/` (fonte única). Roda aqui por `Simetria.dc.html` → `app/loader.js`
(compila no navegador, sem build) e no Google AI Studio por `index.html` + Vite.
O projeto viaja em zip entre os dois — o contrato completo está em **AGENTS.md**.

Pontos que não podem ser esquecidos:

- **Criou/renomeou/apagou arquivo em `app/src`? Atualize `app/manifest.json`**
  (array de caminhos `"src/..."`). Sem isso o app não abre. Fora do Omelette: `npm run sync`.
- Nova dependência: adicionar ao `package.json`. O loader resolve por esm.sh sozinho.
- UI, nomes de domínio e comentários em **português**. Comentário diz o porquê, não o quê.
- Geometria de interseção se resolve por correspondência de tokens de ramo, nunca por
  ordem de construção.
- Ao fechar uma rodada de trabalho relevante, atualize **HANDOFF.md**.
