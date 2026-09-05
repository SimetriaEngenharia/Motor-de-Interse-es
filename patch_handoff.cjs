const fs = require('fs');
let code = fs.readFileSync('HANDOFF.md', 'utf8');

const newSection = `## Rodada atual

### Casamento do fillete com a faixa de mudança de velocidade
Sintoma: O fillete de interseção na alça (e em ramos esconsos) conectava-se ao bordo normal (estreito) da via principal, ignorando o taper da faixa de aceleração/desaceleração.
Causa: O cálculo da tangência nominal (\`staTang\`) assumia uma interseção de 90° (somando apenas a largura da faixa do ramo + o raio). Em ângulos rasos (esconsidade de alça), a tangência física caía muito depois do ponto estimado. Como a geometria da faixa só sustentava a largura total até a \`staTang\` estimada, a seção caía a zero no ponto real de tangência, forçando a concordância com o bordo normal.
Correção: \`ladoAccel\` no \`store.ts\` agora calcula a distância de tangência geometricamente cruzando o vetor principal e o vetor do ramo. O desvio passa a usar: \`dist = branchLaneW / Math.abs(Math.sin(angle)) + R / Math.tan(angle / 2)\`. Com a geometria estendida, a rotina de offset acha a polilinha larga e \`casarFilleteComBordos\` acopla perfeitamente à extremidade paralela do taper (que acompanha o alinhamento principal).

`;

code = code.replace("## Rodada atual\n\n", newSection);
fs.writeFileSync('HANDOFF.md', code);
console.log("Handoff updated!");
