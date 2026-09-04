# Nariz de ponta de cunha (gore) — construção por largura

## Status: IMPLEMENTADO E VERIFICADO

## Caso
NT-02 do projeto `scraps/caso-nf2.json` (raio 15 m). Os dois braços são
`offset-left` e `offset-right`, ambos bordos de quadrante do RAMO. Não há pista
principal no par, então `pistaId` fica nulo e a construção offset+giro degenera:
ângulo 0,397°, abertura 7,5°, cap saía com 0,022 m em vez de 2,00 m.

## Construção implementada
`narizGorePorLargura()` em `intersection.ts`. Base = as duas LINHAS PRETAS
finais (após corte da fase 2 e solda da fase 3).

1. Sentido em que a cunha abre (sonda a 3× a largura de cada lado).
2. Varredura de 0,10 m + bisseção (40 it, 1e-5) até o vão valer EXATO a largura
   nominal. Vão = distância perpendicular à outra polilinha.
3. Cap plantado ali; `nf` = ponto na linha A, `cap[0]` = pé na linha B.
4. Sobras cortadas: `donoA.geom.bordo = aparadaA`, idem B, `q` atualizado.

Roda como FASE 4 de `resolverNarizesRaw`, depois das fases 2 e 3, de propósito:
o cap é plantado sobre o que está desenhado.

Geom do gore: `bordo: []`, `sinal: []`, `giro: 0`, `gore: true`. O desenho é só
o cap — as linhas pretas pertencem aos vizinhos. O alinhamento de nariz vira
uma reta de 2,00 m (bom como alvo de corredor).

## Bug encontrado no caminho — TENTADO E REVERTIDO
`andar()` só caminha para frente: a condição do laço é `i < pts.length - 1`,
então partindo do último vértice o passeio para trás não sai do lugar.

**Corrigir o laço NÃO é drop-in.** Tentado (condição `i < pts.length`) e
revertido: `narizFisicoOffsetGiro` foi calibrado com o comportamento antigo —
a escolha de `dirRamo` compara os dois sentidos, e com a caminhada correta o
lado do offset muda. Resultado medido: os narizes normais param de fechar em
2,00 m, a geometria do corredor não é publicada e a planta fica vazia.

O defeito segue documentado no próprio `andar()`. Quem precisa dos dois
sentidos usa `andarSeguro()` (usado só pelo gore). Consertar `andar` de vez
exige recalibrar `dirRamo` junto — não é troca de uma linha.

Melhoria mantida: o `catch` que engolia a falha de cálculo dos NTs em
`PlanView.tsx` agora avisa no console e guarda o stack em `window.__ntErro`.

## Roteamento
`motivoDegenerado()` (ângulo < 2° ou abertura < 10°) não recusa mais: manda o
nariz para `pendentes` → FASE 4. Só vira recusa em `recusasNariz` se o gore
também falhar. Guardas dentro de `narizFisicoOffsetGiro` (dirRamo congelado,
bordos coincidentes, normal indefinida, ponta colapsada) idem.
Badge vermelho na janela de Narizes Teóricos mostra o motivo.

## Medição final (verificada no app)
| | NT-01 | NT-02 (gore) | NT-03 |
|---|---|---|---|
| cap | 2,0000 | **2,0000** | 2,0000 |
| extensão | 16,249 | 2,000 | 15,072 |
| antes do corte | 19,646 | — | 17,710 |

Encaixe: pontas das linhas pretas de NT-01 e NT-03 a **0,0000 m** das pontas do
cap; distância entre elas = 2,0000 m.

## Como reproduzir
`fetch('scraps/caso-nf2.json')` → `loadProject(d)` → `setActiveTab('plan')`
(sem a planta montada `intersectionNTs` fica vazio e nada recalcula) → esperar
~9 s → medir `alignments.filter(a=>a.isNoseAlignment)`.

Cuidado ao medir: se `intersectionNTs` estiver vazio, os alinhamentos de nariz
em estado são os SALVOS no arquivo, não os recalculados — conferir
`ntDebug.achados === 3` antes de acreditar na medição.
