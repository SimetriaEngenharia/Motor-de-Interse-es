# Handoff — estado do projeto

Registro que atravessa o zip. **Quem trabalhar, atualiza aqui antes de exportar.**

---

## Rodada atual

### Tipo Alça — v5.1: Continuidade do eixo e do bordo externo (mais recente)

Fechado e implementado o primeiro passo da alça: **continuidade do eixo e do bordo externo**.

1. **O eixo do ramo NÃO é aposentado nem ocultado**:
   - O alinhamento do ramo (`alignId`) permanece ativo (`activeAlignmentId: alignId`), visível na camada `layer-eixo`, com estacas, perfil longitudinal e pontos de inflexão (PIs) navegáveis pelo campo.
   - O corredor do ramo (`corrGalho`) NÃO é deletado: ele é preservado em `state.corridors` e gera a seção transversal (pista, acostamentos e taludes) ao longo de toda a extensão do ramo até o campo.

2. **Descarte do quadrante morto na raiz**:
   - Em `rebuildIntersectionCorridors`, `intEdges` e `intEdgesBase` filtram o quadrante oposto pelo `tokenVivo` (`M-Back` para saída, `M-Fwd` para entrada).
   - O quadrante morto não gera fillete, não gera alinhamento espúrio e não gera faixa adicional no sentido contrário (saída gera apenas desaceleração; entrada gera apenas aceleração).

3. **Continuidade total do bordo externo**:
   - Em `buildAccelDecelLine`, a faixa adicional da principal estende-se até `int.mainStation` (`sta3 = int.mainStation`), onde o nó da principal encontra o início do ramo.
   - Na região do corredor do ramo, `firstReg.startStation = 0`, conectando o bordo externo do ramo diretamente com o bordo da faixa de aceleração/desaceleração da principal, eliminando o vazio geométrico que antes existia entre o fillete e o início do corredor.
   - O bordo externo segue contínuo com largura plena ao longo de todo o ramo.

**Em aberto, para o próximo passo:**
(a) O NF único no gore do quadrante vivo (harmonização final do zebrado e cap do nariz físico);
(b) Calibração fina de transição do bordo interno junto ao início da cunha.

### Tipo Alça — v5: a alça É o entroncamento, por subtração

Modelo fechado com o projetista, e é o certo: **a alça é o entroncamento inteiro, menos um
ramo.** O eixo do ramo da alça não se sintetiza — ele NASCE da máquina, como alinhamento
filho (offset) do fillete do quadrante que sobrevive. Por isso já está no bordo por
construção, com `parentId` e acoplamento bordo-com-bordo, e toda a geometria calibrada
(fillete, gore, NF, refúgio, garganta) vem de graça.

Receita, que é a do projetista à mão:

1. Entroncamento normal — eixo no eixo da principal, `branchStation: 0`, `isRightSide`
   pela conta geométrica, dois quadrantes, dois filletes.
2. Separar por ramos, mas **só do lado que sobrevive**: offset `-W` do fillete, id
   `align-<int>-offset-left|right`, `parentId` = fillete, e só o `leftBranchWidth` ou
   `rightBranchWidth` correspondente.
3. **Aposentar o eixo central**, não apagar: `isHidden: true`, camada auxiliar, corredor
   removido. Apagar orfanaria a interseção — os quadrantes e filletes são derivados dele e
   o rebuild o consome a cada passagem. `isHidden` só governa desenho (PlanView) e
   listagem (Sidebar); o rebuild acha o ramo por id.

**Qual lado sobrevive.** Os tokens de quadrante são absolutos, não dependem do lado do
galho. Quem segue no sentido do estaqueamento e SAI para o ramo contorna o canto entre o
braço de trás e o braço do ramo → quadrante **M-Back** (`offset-left`). Quem ENTRA vem do
campo e funde no braço da frente → **M-Fwd** (`offset-right`). Vale à direita e à esquerda:
o espelhamento troca o giro, não o par de braços. Isso também define a faixa: saída pede
**desaceleração**, entrada pede **aceleração** — uma, nunca duas.

**Todas as exceções de alça no motor foram REMOVIDAS** (v3.x/v4.x, escritas para os modelos
revogados em que o eixo nascia no bordo): bordos derivados assimétricos; "não se constrói
quadrante"; ramo sem corte de garganta; garganta pela divergência; auxiliar do vão
desligado; par [quadrante, eixo do ramo] na equidistante. O motor voltou a ter um caminho
só — e a alça atravessa esse caminho inteiro.

Também removida a seção "eixo no bordo" (`assm-alca-*`): não é mais necessária, porque o
pavimento do ramo é o **corredor de quadrante** entre o fillete e seu filho offset, como no
entroncamento com ramos separados.

**Em aberto, para a próxima conversa:** (a) o NF — deve sobrar um só, no gore do quadrante
que ficou, sem mudança na máquina; (b) o bordo externo do ramo longe da principal — termina
no taper da faixa adicional ou o ramo segue com largura cheia; (c) o ramo hoje só existe na
extensão do quadrante, não continua para o campo.

### Tipo Alça — v4.2: o lado sai de uma medida (mais recente)

A assimetria da v4.1 foi aplicada ao lado ERRADO: `branch-left` recebeu offset 0 e
`branch-right` o −3,5 cheio, deixando o bordo interno a 10 cm do EIXO da principal, dentro
da faixa de rolamento até s ≈ 17. Causa: `projNaPoli(eixoMainPtsApoio, p0)` caiu no seu ramo
degenerado (devolve o próprio ponto quando a polilinha tem menos de 2 vértices), então
u = (0,0), o produto vetorial deu 0, e `> 0` classificou "fora" como direita.

Correção: o lado passa a sair de uma **medida**, não de um produto vetorial — os dois
candidatos (p0 ± n·W) são materializados e medidos contra a principal com
`mainAlign.getNearestStationAndDistance`, o mesmo objeto usado no resto da passagem; o
pavimento fica do lado que se afasta. Sem vetor degenerado possível.

Referência medida no caso de teste (pista da principal em y = 0…3,60; eixo do ramo nasce em
y = 3,60): o pavimento real do ramo, por `extractFeatureLine(c2,"Bordo_Faixa_Dir_1")`, está
em y ≈ 7,10 — ou seja +3,5 m para FORA. Logo `bLeftW = W` e `bRightW = 0`, com o bordo
interno coincidindo com o eixo.

### Tipo Alça — v4.1: bordos derivados assimétricos

Defeito antigo, nunca diagnosticado: **o bordo interno derivado do ramo atravessava a pista
principal.** Medido em `align-int-…-branch-right`: do nascimento (200; 3,60) descia a
(200; 0,10) — travessa de 3,5 m cortando a faixa de rolamento — e só depois virava para
seguir o ramo, correndo DENTRO da pista até s ≈ 19; o espelho `branch-left` dava o salto
para fora. Ambos ficavam mais longos que o eixo (89,9 e 87,49 contra 85,18): a sobra era o
desvio.

Causa: os bordos derivados nascem como offset **±meia-largura** do eixo, porque num
entroncamento o eixo corre no MEIO da pista. Na alça o eixo corre no BORDO — todo o
pavimento de um lado só — então o offset simétrico manda o bordo interno para dentro da
principal. E o primeiro ponto ficava duplicado (projeção em cima do vértice), com tangente
nula e normal (0,0), deixando o arranque SEM offset: é daí a travessa.

Correção: na alça os offsets são **assimétricos** — bordo interno = o próprio eixo (offset
zero), bordo externo = largura cheia, do lado do pavimento. O lado sai por geometria (produto
vetorial entre a tangente do ramo e a direção "para fora" da principal), não por convenção.
E `poliParalela` deixou de duplicar o vértice de arranque — correção geral, vale para os
dois tipos.

Isto importa além do visual: `branch-right` é a polilinha contra a qual o gore e o NF da
alça vão medir a divergência; começar 3,5 m dentro da principal poria o nariz no lugar errado.

### Tipo Alça — v4: na alça NÃO se constrói quadrante

Três rodadas de filtro não convergiram porque o problema não era o critério nem o momento:
era pedir uma concordância que **não existe**. Diagnóstico final: o eixo do ramo nasce sobre
o bordo da principal e tangente a ele; duas curvas coincidentes e tangentes não formam
canto. Logo o casamento bordo-com-bordo **não tem solução**, `__bordoOk` fica sempre falso,
e o fallback legado de offset constante (dentro do laço de extração de tangentes, a jusante
de qualquer filtro) sempre dispara e colapsa o arco para 6 mm — arco de 6 mm, alinhamento de
6 mm na árvore do usuário, corredor de 6 mm e alvo degenerado que impedia o gore de fechar.

Correção decisiva: **na alça as arestas de fillete (`B-Arm`) são removidas na origem**, logo
após `mapEdges` — não se pede a concordância. E, sem quadrante, também não se constrói o
**auxiliar do ramo** (ele é o eixo do vão entre dois bordos de quadrante; sem vão, devolvia
corda reta ou toco de 14 cm, que ainda entrava como `targets.PistaW`).

O que sustenta a alça no lugar disso: a garganta da principal vem da **divergência** do ramo
(v3.8, independente de tangentes de fillete) e o corredor do ramo não sofre corte (v3.7).

**Em aberto — gore e NF da alça.** É agora a única peça que falta: a cunha entre o ramo e a
principal não tem pavimento próprio nem nariz físico. Construção própria, pelo afastamento
do bordo interno do ramo contra o bordo da principal — NF na estaca onde o vão atinge a
largura de nariz. Medições no caso de teste (afastamento eixo→bordo ao longo do ramo):
s=0 → 0,00 m; 5 → 1,06; 10 → 1,66; 20 → 5,13; 30 → 8,51; 50 → 15,34; 85 → 27,30. Nariz de
2 m cai em s ≈ 12 m.

### Tipo Alça — v3.9: o degenerado só aparece depois da concordância

O teste de degeneração da v3.8 não disparava — **erro de ordem no pipeline, não de
critério.** Ele rodava junto com o filtro do quadrante fantasma, logo após `mapEdges`, e
naquele momento o arco ainda mede 64 m. Quem o colapsa é a passagem de **concordância com o
bordo real** (`intEdges.forEach(corrigir)`), que re-resolve o arco contra a polilinha do
bordo: como o eixo do ramo nasce sobre esse bordo e tangente a ele, o arco corrigido não
tem para onde ir e fica em 6 mm. O teste mudou para DEPOIS de `corrigir`, onde a medida é
definitiva. O filtro por distância (quadrante fantasma) fica onde estava — funciona.

### Tipo Alça — v3.8: não existe canto no nó

O ponto conceitual que faltava: **na alça o eixo do ramo nasce SOBRE o bordo e TANGENTE a
ele.** Duas curvas coincidentes e tangentes não formam quina — então o arco de concordância
entre elas é nulo por construção. Medido: o fillete sobrevivente tinha **1 cm** (T1 e T2 a
1 cm um do outro), e esse toco virava o `targets.PistaW` do gore, que por isso não fechava;
o auxiliar traçado contra ele saía com 14 cm. Afastamento do eixo ao bordo ao longo do ramo:
s=0 → 0,00 m; s=10 → 1,66; s=20 → 5,13; s=30 → 8,51. A cunha não é um canto arredondado —
é a divergência, e nasce ADIANTE do nó.

Duas mudanças:

1. O filtro de quadrante da alça agora descarta também o fillete **degenerado**
   (|T2−T1| < 1 m), não só o fantasma que cai fora do ramo. Melhor ausente que 1 cm
   alimentando alvo.
2. **A garganta da principal passou a vir da divergência**, não de um fillete: caminha o
   eixo do ramo medindo o afastamento (distância ao eixo da principal menos a do
   nascimento) e termina onde o vão passa `larguraRamo + refúgio`. Sem isso a seleção por
   braço colapsava a zona de interseção a zero — o trecho de merge, exatamente onde o ramo
   sai, ficava sem região.

**Em aberto — o gore da alça e o NF.** Sem fillete não há polígono de quadrante, então a
cunha entre o ramo e a principal ainda não tem pavimento próprio nem nariz físico
(nenhum alinhamento com `isNoseAlignment`). O caminho: construir o gore a partir da
divergência do bordo interno do ramo contra o bordo da principal — o NF na estaca onde o
vão atinge a largura de nariz (`LARGURA_NARIZ_FISICO`, ≈ s=12 m no caso medido) — em vez
de um arco no nó. É a próxima rodada.

### Tipo Alça — v3.7: o ramo não sofre corte de garganta

Medido no projeto do usuário: a região do corredor do ramo começava em **43,76 m** num eixo
de 131 m — os primeiros 44 m sem pavimento, e o pavimento visivelmente deslocado do começo
do eixo. O número é o fallback `branchStation + mainLaneW + max(raios)` (23,45 + ~5 + 15),
usado quando `branchTangents` fica vazio — e fica vazio porque a alça tem um quadrante só.

A causa é conceitual: **o corte de garganta no ramo só existe porque num entroncamento o
ramo ATRAVESSA a principal** — o miolo é pavimento da interseção, não do ramo. Numa alça o
ramo nasce no bordo e segue; não há miolo a remover. A cunha da alça é o gore, e quem a
resolve é o quadrante.

Agora, com `topologia === "alca"`, o recorte do corredor do ramo é saltado e as regiões
voltam a `originalStartStation`/`originalEndStation` — pavimento do começo ao fim do eixo.
Os guardas de "não engolir o ramo" da v3.6 ficam para o entroncamento.

### Tipo Alça — v3.6: distância em vez de estaca, e o vão da cunha

Três correções, todas de diagnóstico errado da rodada anterior:

1. **O filtro do quadrante fantasma nunca disparava.** `getNearestStationAndDistance`
   **satura** na extensão da polilinha: a tangente fantasma, 20 m além da ponta do ramo,
   devolve a estaca do fim (85,18) — dentro da faixa — com `dist` 19,77. Testar a estaca não
   rejeitava nada. Agora o teste é a **distância perpendicular** (tolerância
   `max(4, R/2)`); a tangente legítima mede 0,01 m, a fantasma 19,77.
2. **A região do ramo era cortada em OUTRO site.** O guarda "não engolir o ramo" tinha sido
   posto no bloco do polígono da garganta (`corteSta`), mas quem colapsava a região era o
   recorte do corredor do ramo — `firstReg.startStation = maxSta` (e o espelho
   `lastReg.endStation = minSta`). Guarda agora nos dois sites: passando de meio ramo, vale
   a âncora crua.
3. **O auxiliar degenerado tinha causa estrutural, não de limiar.** A curva equidistante
   pede DOIS bordos e, sem "separar por ramos", ia buscar os quadrantes de M-Back E de
   M-Fwd. Numa alça existe um quadrante só: o outro volta vazio e o traçado aborta na
   primeira linha → corda reta de 2 pontos, que estraga o `targets.PistaW`. Mas na alça o
   outro lado do vão não é quadrante nenhum — é o **bordo interno do ramo**, que na seção
   "eixo no bordo" é o próprio eixo. O par passou a ser [quadrante sobrevivente, eixo do
   ramo].

### Tipo Alça — v3.5: um quadrante, tangentes por braço

Três defeitos encadeados, todos da mesma raiz — o construtor de polígono devolve SEMPRE os
dois quadrantes, porque supõe um ramo que cruza a principal:

1. **Quadrante fantasma.** Numa alça o ramo diverge com ângulo pequeno; de um dos lados as
   duas bordas são quase paralelas, o centro do arco foge e o ponto de tangente no ramo cai
   FORA do ramo (eixo de 85 m, tangente em 300 m). Agora esse quadrante é descartado por
   critério **geométrico** (tangente do ramo fora de [0, L]), não pelo nome do braço —
   serve igual para entroncamento de ângulo fechado.
2. **Garganta de 18 cm** (regressão da v3.3). `staCurveBack/Fwd` eram escolhidos filtrando
   `mainTangents` por estaca relativa à âncora — supõe que as tangentes CERCAM a âncora,
   verdade num cruzamento, falso numa alça, onde as duas ficam à frente. A tangente de
   M-Back (200,18) caía no balde da frente e, sendo a menor, virava `staCurveFwd`. Agora as
   tangentes carregam o **braço de origem** (`arm: "M-Back"|"M-Fwd"`, gravado na extração) e
   a seleção é por braço; filtro por estaca só como fallback, mais o guarda de não inverter.
3. **Região do ramo com comprimento zero.** `corteSta` vinha da tangente fantasma = fim do
   eixo, e a região do corredor do ramo nascia [85,18 → 85,18]: alça sem pavimento nenhum.
   Agora o corte é limitado a meio ramo — passando disso vale a âncora crua, porque âncora
   crua é melhor que corte que apaga tudo.

### Tipo Alça — v3.4: eixo SOBRE o bordo real

Print do projetista: o eixo nascia longe do bordo e mergulhava dentro da principal
("nada a ver"). Duas causas, ambas de construção:

1. **Nascimento por palpite.** O eixo era posicionado a `meiaLargura(comps, lado)` do eixo
   da principal — um valor lido da seção que ignora alargamento, acostamento variável e
   seção diferente na estaca. Agora o eixo nasce **sobre a polilinha do bordo REAL
   extraído** (`pontoNoBordo`: projeção no segmento mais próximo), e a tangente inicial é a
   **tangente do bordo**, não a do eixo. A extração do bordo passou a acontecer ANTES da
   construção do eixo na alça (o lado já é conhecido pelo parâmetro); no entroncamento a
   ordem original se mantém. `geometriaDoGalho`/`construirAlinhamentoGalho` recebem
   `bordo?: {x,y}[]`; a reancoragem passa o bordo de novo, via `int.mainTargetId`.
2. **Giro para o lado errado.** O sinal analítico da divergência depende da convenção de
   normal, do sentido (entrada inverte) e da curvatura local do bordo — e errava. Agora
   `geometriaDoGalho` testa **os dois giros** e fica com o que AFASTA do eixo da principal
   (distância mínima do ponto final à polilinha do eixo). Geometria em vez de convenção.

### Tipo Alça — v3.3: garganta de um lado só

Segunda causa do "deu pau", estrutural: **a garganta da alça é de um lado só.** Os limites
da garganta (`staCurveBack`/`staCurveFwd`) vinham de `mainTangents` filtradas por lado, e
quando um lado ficava sem tangente o código buscava a tangente do LADO OPOSTO
(`min/max(...mainTangents)`). Numa alça há um quadrante só, então um dos lados está sempre
vazio: a garganta inteira ia para o lado errado, longe da âncora, e abria buraco no
corredor principal (no projeto de teste: região de interseção em 371→421 com âncora em 183,
e 212 m de corredor órfão).

Agora, sem tangente de um lado, o limite fica na própria âncora — a garganta não atravessa.
Vale igual para entroncamento com quadrante degenerado.

### Tipo Alça — v3.2: âncora no PT da concordância

Diagnóstico do "deu pau" (projeto `tipo alça deu pau.json`): com `branchStation: 0` o
tangente do ramo é PARALELO à principal (o eixo nasce tangente ao bordo), então
`dotRight ≈ 0` e toda projeção do nó divide por quase-zero — corredor do ramo com região
de 0,8 m, main-edge de 1 km, buraco de 212 m no corredor principal, garganta comendo o
ramo inteiro no lado esquerdo.

Correção: na alça `branchStation` ancora no **PT da concordância** (fallback ST; último
recurso min(10, len/2)) — ali o ramo já aponta na direção de divergência e a máquina
trabalha com ângulo real. `isStart` continua verdadeiro (PT < metade do comprimento).

### Tipo Alça — v3.1: seção com eixo no bordo

O eixo do ramo da alça corre pelo BORDO do pavimento, não pelo centro. `criarGalho` agora
cria uma seção tipo própria ("Ramo N · eixo no bordo", `assm-alca-<ts>`): a meia-seção da
principal (componentes do lado do galho: pista, acostamento, sarjeta, talude) clonada com
todos os componentes num lado só. O lado do pavimento depende de lado × sentido — o
estaqueamento do ramo de entrada corre contra o tráfego, então o pavimento troca de lado:
saída-Dir → Right, entrada-Dir → Left, saída-Esq → Left, entrada-Esq → Right. Fallback
(principal sem componentes no lado): Pista 3,5 + Acostamento 1,5. `p.largura` sobrescreve
a largura da pista clonada.

### Tipo Alça — v3: um eixo, a concordância continuada

Correção de conceito com o projetista (print com os X): **na alça existe UM eixo gerado, e
ele é a própria curva de concordância, continuada**. Não é uma reta divergindo do bordo —
é: nasce TANGENTE AO BORDO (paralelo à principal), curva com raio R (default 30 m; o
"Raio do ramo" do painel) até o ângulo de divergência, e segue reto até o comprimento.

- **Saída**: a curva abre a favor do estaqueamento da principal; `maoSentido: "forward"`.
- **Entrada**: o espelho — abre para trás; o tráfego corre contra o estaqueamento do ramo;
  `maoSentido: "backward"`. `branchStation = 0` fica sempre no bordo.
- Painel: no modo Alça o controle "Mão" vira **"Sentido: Saída | Entrada"** (mão única é
  intrínseco). `ParametrosGalho.sentido` + `IntersectionData.galho.sentido`.

### Tipo Alça — v2 (superada pela v3)

Entendimento corrigido com o projetista: **a alça tem 2 eixos no total** — a principal e o
EIXO DO RAMO, que é a própria via secundária, mão única (entrada ou saída). Não existe eixo
da secundária cruzando o eixo da principal, não existem ramos derivados (offset-left/right),
não existe "separar por ramos". A v1 abaixo (receita do entroncamento + um offset) está
REVOGADA — ficou registrada só como histórico.

Estado atual do `criarGalho` com topologia `alca`:

- `geometriaDoGalho`: o nascimento é NO BORDO da principal
  (`M + n·larguraBordo·sgn`, convenção dotRight = direita), tangente dali, divergindo no
  ângulo pedido. No entroncamento continua nascendo no eixo (motor original, intocado).
- Corredor do ramo criado por `addCorridor`, renomeado "Ramo N", com `mao: "unica"`,
  `maoSentido: "forward"` e a seção herdada da principal.
- `addIntersection` com os mesmos campos do fluxo manual (mainTargetId, refúgio etc.),
  `branchStation: 0` — só que o ponto 0 do ramo está no bordo, não no eixo.

**Em aberto (a máquina de interseção ainda supõe cruzamento no eixo):** o quadrante,
a garganta e o M_common são derivados como se o ramo cruzasse o eixo da principal. Com o
ramo nascendo no bordo é esperado que o lado do merge e o corte de garganta precisem de
ajuste — é a próxima conversa com o projetista, testando caso a caso.

### (REVOGADA) Tipo Alça — primeira implementação

Entendimento fechado com o projetista (croqui): **na alça o galho é o eixo do ramo** — o
ramo tem corredor próprio e completo; o eixo que cruza a principal é construção. Um NF só,
na cunha entre ramo e principal; do outro lado não há canto: o bordo do ramo é continuação
do bordo da principal.

Implementação = a receita manual automatizada ("gerar entroncamento, separar por ramos,
apagar um dos ramos"), sem o passo de apagar:

- `criarGalho` com topologia `alca` cria o entroncamento normal e, depois do
  `addIntersection`, cria **um ramo só**: `align-<int>-offset-left`, offset de
  `p.largura ?? 3.5` m do fillete do lado do merge (`M-Back-B-Arm`, para galho que
  diverge para a frente), com `parentId`/`offsetValue` — idêntico ao que o botão
  "Separar por Ramos" faz, mas só à esquerda.
- `updateIntersection(intId, { leftBranchWidth: W })` sem `rightBranchWidth`: é o que diz
  à máquina que existe um ramo só (o rebuild trata os lados de forma independente).
- Além da garganta o corredor do eixo já é podado pelo corte de garganta, então o próprio
  eixo faz o papel de eixo do ramo dali para a frente.

A validação continua recusando alça de mão dupla. Falta testar em campo: o merge do bordo
externo (hoje fica por conta do fillete M-Back + faixa de desaceleração quando ligada) e o
comportamento do NF com um offset só.

---

## Rodada anterior

### Galho da árvore — ramo gerado a partir da principal (mais recente)

Segundo modo de criar interseção. Antes, a interseção era **consequência**: dois eixos
desenhados, dois corredores, e o motor deduzia o cruzamento. Agora ela pode ser
**primitiva**: aponta-se uma estaca na principal e o eixo, o corredor e a interseção
nascem juntos. Estação → eixo, em vez de eixo → estação.

Arquivos: `app/src/lib/galho.ts` (motor), `app/src/components/NovoGalhoPanel.tsx` (UI,
no topo da aba Ints), `store.criarGalho` / `store.reancorarGalhos`, campo
`IntersectionData.galho`.

**Os dois princípios que sustentam o resto:**

1. **Identidade no eixo, geometria no bordo.** A âncora é `mainStation` — endereço
   estável. O ponto de nascimento é resolvido no bordo na hora da construção, lendo a
   meia-largura da seção que vigora naquela estaca. Assim o alargamento de uma faixa
   adicional empurra o ponto pela normal sem mudar a identidade, e o laço
   (galho → faixa → bordo → galho) não fecha. Ancorar no XY do bordo fecharia.
2. **Amarrado na divergência, livre depois.** `reancorarGalhos` regenera **só o primeiro
   PI**; do segundo em diante o traçado é do projetista (raio, curvas, comprimento).
   Amarração total impediria projetar o ramo; amarração nenhuma deixaria o acesso para
   trás quando a principal mudasse.

**Topologia e mão são perguntas independentes** — a mão diz quantas FAIXAS, a topologia
quantos NARIZES:

- `alca` — nasce do bordo, bordo externo funde-se no da principal: 1 nariz + 1 taper.
- `entroncamento` — chega em ângulo, os dois bordos batem: 2 narizes.
- `validarGalho` recusa **alça de mão dupla** (entrada e saída disputariam a mesma faixa —
  isso já é entroncamento) e avisa em entroncamento enviesado (um quadrante abre em α, o
  outro em 180−α: com o mesmo raio, um nariz sai apertado e o outro largo).

**Limite de ângulo** (`regimeDoAngulo`): ≥30° cruzamento firme; 16–30° zona de aviso;
<16° o fillete degenera, NF dispara para longe de NT e o caso é de **gore**, não de
cruzamento — a mesma máquina da faixa adicional. Como agora é o motor que gera o eixo, o
ângulo deixou de ser acidente e passou a ser avisável.

Na alça o cruzamento com o eixo da principal é **virtual** (prolonga-se o galho para trás);
`geometriaDoGalho` devolve também a **sensibilidade** — quanto o cruzamento anda por ±0,5°
de ângulo —, que é o número que denuncia um ângulo fechado demais.

Estudo de conceito interativo, fora do app: `Galho - Estudo.dc.html`.

**Pendente:** o motor de interseção ainda consome a âncora como cruzamento; na alça isso é
o cruzamento virtual. Falta o segundo quadrante da alça resolver explicitamente como taper
(hoje entra pela faixa adicional, com `hasAccelDecel`).

`reancorarGalhos` é chamado por `setCorridorFeatures` — ou seja, assim que o bordo é
recalculado o nascimento volta a assentar nele. Converge porque só escreve quando o ponto
se move mais de 1 cm.

**Correção (pós-teste, "igual ao motor original"):** a primeira versão fazia o eixo do
galho nascer no bordo, e isso criava uma interseção órfã da máquina padrão — sem bolinha
de arrasto, sem eixo central manipulável, e com o separar-por-ramos quebrado, porque toda
a máquina (narizes, quadrantes, bordos derivados) consome um ramo que **começa sobre o eixo
da principal**. Agora o galho gera exatamente o que o motor original espera: eixo de
primeira classe (id normal `align_…`, não `align-int-…`, que seria tratado como derivado)
nascendo NO eixo da principal com `branchStation = 0`, cruzamento real, PIs editáveis.
A topologia (alça/entroncamento) segue como intenção — decide faixas adicionais, não onde
o eixo nasce. O conceito "nasce no bordo" ficou registado no estudo
(`Galho - Estudo.dc.html`) para a evolução futura do taper explícito.

**Segunda passada ("ainda não está igual"):** criar a interseção com os mesmos eixos não
bastava — o fluxo manual (modal "Criar Interseção?" no PlanView) passa um conjunto de
campos que o galho não passava, e a falta deles produzia buracos e concordância errada:

- **`mainTargetId`** — o bordo EXTRAÍDO da principal (cascata `Bordo_Faixa_Dir_1`/`Esq_1`,
  depois legado P2/P3), que é a âncora da concordância bordo-com-bordo. Sem ele os fillets
  casavam contra o fallback. Era esta a causa principal dos buracos.
- **`hasRefugio: true, refugioWidth: 1.5`** — refúgio de fábrica; o nariz físico é
  construído contra o bordo dele.
- `hasIsland/islandWidth/islandBranchWidth`, `hasSpiral/spiralLength`,
  `mainCrossSlope/branchCrossSlope: -2` — mesmos defaults do fluxo manual.
- `isRightSide` calculado pela MESMA conta do modal (tangente do ramo · normal da
  principal), não pelo lado escolhido no painel.
- O corredor do galho agora nasce por `addCorridor` (id `cN`, sem `mao` pré-definida —
  a mão se define clicando na faixa, como sempre). `mao: "unica"` pré-definida fazia
  `papelDosQuadrantes` classificar os DOIS quadrantes como desaceleração: duas faixas de
  desaceleração, uma de cada lado, e regiões assimétricas (553→603 em vez de simétrico).
- `hasAccelDecel` NÃO vem pré-ligado — liga-se no assistente, como no fluxo manual.
- A interseção entra por `addIntersection` (que já dispara o rebuild) — antes o estado era
  montado à mão e o rebuild chamado por fora.

---

## Rodada anterior

### Motor de extração de geometria substituído (mais recente)

Trazido do projeto paralelo `extrator de geometria` — **apenas o motor**, nada da UI, das
bases ou dos modais daquele projeto.

`lib/geomExtract.ts` (310 → ~910 linhas) ganhou:

- **Ajuste de círculo Taubin/Hyper-fit** com refinamento Gauss-Newton, no lugar do Kåsa —
  o Kåsa subestima raio sistematicamente em arcos curtos.
- **Calibração de raios de projeto** (`snapStandardRadius`): R=49,97 vira R=50 quando o
  desvio máximo continua dentro da tolerância.
- **Concordância tangente G1** entre reta e arco (`enforceTangency`).
- **Filtro de topo** (`isTopFeature`): datum, base, sub-base, fundação, lastro e fundo de
  guia deixam de ser extraídos.
- **Classificação semântica** (`getFeatureLayerInfo`): eixo, bordo de pista, acostamento,
  guia/sarjeta, passeio, talude, canteiro/refúgio e barreira, cada um com camada e cor
  próprias — as camadas nascem sozinhas na extração.
- **Costura de cadeias** (`stitchPointChains`): resolve orientação e ordem, unindo os
  fragmentos que o corredor entrega por região.
- `extractPIsFromSegments`: PI real por interseção de tangentes, para converter geometria
  extraída em alinhamento.

**Preservado de propósito:** a nossa `geometrySignature` continua só com as extremidades.
A versão de lá acrescenta a contagem de pontos, o que quebraria "Extrair Todas" — ela
refina o corredor para 0,10 m e devolve a frequência original, e a assinatura mudaria nos
dois sentidos, descartando o ajuste.

Store: `extractGeometryFromFeature` passou a filtrar topo, classificar camada e aceitar as
opções do motor; entrou `extractUnifiedGeometriesByLayer` (uma linha contínua por camada).
As opções ficam guardadas em cada `DrawnGeometry`, para que recalcular reproduza a
extração. Painel EXTRAIR ganhou os dois interruptores e o botão "Unir e Extrair por Camada".

Dois cuidados que a integração exigiu:

- **`fitLineArc` tem defaults OFF.** Ele não é só da extração: `intersection.ts`,
  `noseAlignment.ts` e a classificação de cadeia no `PlanView` também o chamam, sem opções.
  Com snap de raio e G1 ligados por omissão (como vinham de lá), essas chamadas passariam
  a arredondar raios e mexer em tangências da geometria de interseção calibrada em campo,
  sem ninguém pedir. Quem liga as inteligências é `buildGeometry`, a porta da extração.
- **`cadeiaDeOrigem`** no store: `sourceFeatureId` de uma linha unificada guarda os ids
  separados por vírgula. O refresh procurava uma feição chamada "P1,P2,P3", não achava, e
  a linha unificada ficava congelada embora marcada como Vinculada. Agora recosta as
  cadeias com `stitchPointChains` antes de recalcular.
- O G1 movia o ponto comum para FORA do círculo, deixando o arco incoerente com o próprio
  centro/raio (e `extractPIsFromSegments`/`classifyChain` derivam tangentes daí). Agora
  encurta só a ponta da reta até ao ponto do arco; o arco não se toca.

---

## Rodada anterior

### Bordo de quadrante casava com o bordo VELHO ao nascer a faixa (mais recente)

O mecanismo de reconstruir o bordo sobre a nova posição da pista já existia
(`casarFilleteComBordos`, bordo-com-bordo). O que falhava era a **precedência da
referência**: o fillete é casado contra o bordo **extraído do corredor**, e esse é o da
passagem ANTERIOR. Na passagem em que a faixa de aceleração nasce (ou muda de largura),
o extraído ainda descreve o bordo estreito — o quadrante casava com ele e ficava para
dentro do pavimento novo. Como o resultado depois estabiliza, nunca mais se corrigia.

`main-edge` (que já traz o alargamento) só entrava como fallback quando o extraído não
existia. Agora há um teste de validade, **relativo e só quando há faixa adicional**:
compara-se a distância do extraído ao nó ALARGADO (`M_common`) e ao nó ESTREITO
(`M_semFaixa`); ele é descartado apenas quando está claramente do lado estreito. Na
passagem seguinte já vem alargado e retoma a precedência — corrige-se sozinho.

Cuidado que motivou a forma do teste: `bordoAlvoId` pode ser um alvo escolhido à mão
(o bordo do acostamento é o caso comum), legitimamente afastado do nó. Um teste absoluto
("longe de `M_common` ⇒ velho") reprovava esse alvo para sempre e trocava-o em silêncio
pelo `main-edge`. Com o teste relativo, um alvo afastado fica longe das duas hipóteses e
passa incólume.

### Alinhamentos de acesso não acompanhavam a faixa adicional

Sintoma: com faixa de aceleração/desaceleração ligada, o pavimento alargava mas os
alinhamentos de acesso (bordos de quadrante e os seus offsets) ficavam onde estavam.

Causa: `align-<int>-main-edge` — o bordo de apoio de onde nascem as concordâncias, os
bordos de quadrante e, por `parentId`, os alinhamentos de acesso — era um paralelo de
**offset constante**. O offset saía de `M_common`, que já traz o alargamento CHEIO, e era
aplicado igual ao longo dos ±500 m. A faixa real, porém, afunila: cheia do nó até ao fim
do L e fechando ao longo do taper. Bordo de apoio e pavimento descreviam curvas
diferentes, e tudo o que pende do bordo herdava a diferença.

Correção:

- `poliParalela` aceita `delta` como **função da estaca** do eixo de origem e uma lista
  de `estacasChave` onde força vértice — sem isso um trecho em tangente (dois PIs a
  centenas de metros) perderia o taper inteiro.
- `alargamentoEm(sta)` descreve o perfil do alargamento uma vez só; `main-edge` desconta
  o alargamento embutido em `M_common` e volta a somá-lo estaca a estaca.
- `papelDosQuadrantes` passou a ser calculado **antes** do bordo de apoio (é ele que diz
  qual L/T vale de cada lado). Era calculado depois, e o bloco duplicado foi removido —
  continua a ser a mesma chamada única de `lib/flowRules`.

---

## Rodada anterior

### Faixa adicional seguia reta em curva (mais recente)

Sintoma: com a principal em curva, a faixa de aceleração/desaceleração saía reta enquanto
a pista virava.

Causa: `buildAccelDecelLine` construía a faixa com **três vértices** (INÍCIO TAPER /
INÍCIO L / FIM) ligados por **retas**. Os três pontos estavam certos — `getOffsetPoint`
usa a normal do eixo em cada estaca — mas entre eles a polilinha era corda. Em tangente
não se nota; numa curva, um L de 50–250 m corta a curva de ponta a ponta.

Correção: cada vão é densificado conforme a curvatura do eixo naquele trecho. `divisoesDoVao`
mede o giro do eixo em quatro passos e resolve `flecha ≈ vão·giro/(8n²) ≤ 2 cm` (a mesma
quantização de 2 cm do resto da geometria), com teto de 120 divisões. Giro < 1e-3 rad =
tangente → o vão continua com dois pontos, como antes: nenhum PI a mais em pista reta.
A largura do taper interpola linearmente ao longo do vão, então o alargamento acompanha
a curva. Perfil e rótulos continuam só nos três vértices-chave (`idxChave`); o resto é
geometria.

---

## Rodada anterior

### Faixa de aceleração que "não era feita" (mais recente)

Sintoma: com "Adicionar Faixas de Aceleração / Desaceleração" marcado, ajustar a faixa de
aceleração não produzia efeito — parecia que ela não tinha sido construída.

Causa: a mesma conta — o **papel de cada quadrante** (aceleração ou desaceleração) — existia
em **três** implementações diferentes:

- `store.ts` decidia pela regra boa (`movimentoDoQuadrante` + mão do ramo + `outerLaneFlow`,
  que lê a chave nova `corredor::lado::nº`);
- `PlanView.tsx` e `IntersectionStudio.tsx` tinham cópias próprias, mais pobres, que liam
  **só a chave antiga** de `laneDirections` e por isso caíam sempre em `"forward"`
  (o assistente tinha **14 cópias** do mesmo trecho).

Quando as regras discordavam, o assistente gravava o L/T arrastado em `decelL/decelT`
enquanto o store lia `accelL/accelT` (ou o inverso): o valor ia para o campo do outro
movimento e a faixa ficava inalterada. E a planta escrevia "Faixa de Aceleração" no lado
onde o store havia construído a de desaceleração. Clicar numa faixa para trocar o sentido
também não mexia no rótulo, porque a troca grava na chave nova que as cópias não leem.

Correção:

- `lib/flowRules.ts` ganhou `sentidoDoBordo`, `papelDosQuadrantes` (puro) e
  `papelDosQuadrantesDaInt` (deriva os vetores do estado). **Uma conta, um resultado.**
  Store, planta e assistente chamam a mesma função.
- `IntersectionStudio`: as 14 cópias saíram; os dois painéis de quadrante viraram um
  `map` sobre `[papel.back, papel.fwd]`.
- `trafficFlowsFwd` era calculado e **nunca usado** — a polilinha da faixa era ordenada por
  estaca, então "INÍCIO TAPER" caía no nariz sempre que o ramo ficava do lado cujo bordo
  corre contra o estaqueamento. Agora a polilinha corre no sentido do tráfego e
  INÍCIO TAPER / INÍCIO L / FIM caem nos vértices certos.
- Nome das regiões vem do movimento real: as palavras "Entrada" e "Aceleração" estavam
  fixas no código, então uma faixa de desaceleração podia chamar-se "Faixa Aceleração".

Nota sobre o caso enviado (`nao fez faixa de aceleração.json`): naquele arquivo as duas
faixas **existiam** e mediam certo (≈3,6 m de alargamento em 326–376 e em 415–465,
conferido contra o print). O que falhava era o ajuste/rotulagem, não a construção — nesse
projeto `laneDirections` está vazio e as duas regras coincidiam por sorte.

---

## Rodada anterior

### Reorganização em 4 Ambientes (mais recente)

O app passou a ser organizado por **Ambiente de trabalho**, escolhido no menu pendente
sob o símbolo, na barra superior: **Projeto**, **Perfis longitudinais**, **Seções tipo**
e **Produção**.

- `store.ambiente` (+ `setAmbiente`) é a divisão de primeiro nível. Fica **acima** de
  `activeTab`, que continua existindo e continua governando o comportamento do
  `PlanView` — trocar de ambiente apenas ajusta o `activeTab` para um contexto válido
  e reproduz as mesmas combinações de `planMode/profileMode/productionMode` que as
  abas antigas já aplicavam. Nenhuma função mudou de comportamento.
- `TABS_POR_AMBIENTE` / `AMBIENTES` no store; tabela `CONTEXTOS` no `Sidebar`.
- `components/BarraSuperior.tsx` substituiu `Header.tsx` (apagado). Cinco colunas:
  Ambiente (símbolo, menu de ambiente, undo/redo), Principal, Organização, Desenho,
  Informação. Botões sem uso no ambiente atual ficam esmaecidos, não escondidos.
- Só o ambiente Projeto tem mais de um contexto — a fita de abas do painel esquerdo
  mostra MDT / Alinh. Hor / Corredores / Ints / Drawing e desaparece nos outros.
- Arranque passou a ser Projeto + `activeTab: "horizontal"` + `planMode: true`.
- **Novo nesta rodada:** SALVAR COMO (nomeia o projeto, `store.nomeProjeto`);
  menu ZOOM (Extensão via `planFitTrigger`, Janela via overlay próprio no `PlanView`,
  Anterior via `historicoZoom`, escala 1:1); COPIAR/CORTAR/COLAR reais para pontos,
  linhas e círculos 3D (`selecaoDesenho` + `areaTransferencia`, colagem deslocada 5 m).
  A seleção se faz clicando no elemento no visualizador ou na lista do painel
  (Ctrl/Shift soma à seleção).
- BASES e POINTS/LINES/CIRCLES 3D saíram do painel esquerdo e vivem só na barra;
  as listas e os editores desses elementos continuam no painel Drawing.
- Sem painel direito por decisão do usuário — as propriedades seguem na caixa
  flutuante sobre o visualizador.

Tema, cores e estilos foram preservados: o azul e o bege do croqui eram esquema.

---

## Rodada anterior

- **Versão:** 2.0 — "Simetria"
- **Última mão:** Claude / Omelette
- **Estado:** rodando, sem erro de console.

### Onde o trabalho parou

Alinhamento da articulação e estabilização da geometria de interseção.

- Concordância de fillete unificada em matemática real de offset de bordo
  (`casarFilleteComBordos`), compartilhada entre `store.ts` e `PlanView.tsx`, valendo
  para quadrante curvo e tangente.
- Alinhamentos auxiliares de ramo ancorados no **nariz físico (NF)** detectado no corredor,
  não mais em posição fixa de cadeia. Traçam sempre como curva equidistante, amostragem
  adaptativa (40 pontos no vão, passo 0,2–1,0 m).
- Alvos separados em dois mecanismos: `targets` (alinhamento por geometria) e
  `targetsPrefer` (fechamento de nariz/amarração). Os dois independentes de ordem de construção.
- Quadrantes identificados por correspondência de token de ramo, com autorreparo de pai errado.
- Anti-piscada: hash de polilinha quantizado em 2 cm, hash de NT em 1 cm, e bordo de
  refúgio fora do hash que dispara recálculo (ele constrói o nariz, mas não realimenta o laço).
- Auxiliares degenerados (2 pontos) excluídos de `targets.PistaW`.

### Pendência conhecida

Em garganta curta, o auxiliar ainda sai às vezes com 2 pontos e
`motivoFallback: equidistante-falhou`. Caminho provável: baixar os limiares de rejeição
do filtro de amostragem equidistante em `intersection.ts`.

### Arquivos quentes

`app/src/lib/intersection.ts` · `app/src/store.ts` · `app/src/components/PlanView.tsx` ·
`app/src/components/ProductionStudio.tsx` · `app/src/components/IntersectionStudio.tsx` ·
`app/src/components/Sidebar.tsx`

### Também nesta rodada

Limpeza geral (logs de depuração removidos, capturas e anexos de conversa descartados) e
criação da ponte de ida e volta com o Google AI Studio: `index.html`, `vite.config.ts`,
`package.json`, `tsconfig.json`, `metadata.json`, `scripts/sync-manifest.mjs`,
`AGENTS.md`, `GEMINI.md`, `CLAUDE.md` e este arquivo.

---

## Como continuar do outro lado

**No AI Studio:** `npm install && npm run dev`. Leia `GEMINI.md` primeiro.
**No Omelette:** abra `Simetria.dc.html`.

Em qualquer um dos dois: mexeu na lista de arquivos de `app/src`, sincronize o manifesto.

---

## Histórico

Mova a rodada anterior para cá quando começar uma nova, em uma linha:

- (vazio — primeira rodada com handoff formal)
