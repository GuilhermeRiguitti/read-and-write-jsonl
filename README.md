# Desafio Batch — JSONL de clubes → CSV

Lê um arquivo **JSONL** (um objeto JSON por linha, cada objeto é um clube com sua
lista de jogadores) e gera dois arquivos CSV:

| Arquivo | Conteúdo |
| --- | --- |
| `clubs.csv` | um registro por clube (1:1 com a linha do JSONL) |
| `players.csv` | um registro por jogador (1:N a partir de `players[]`) |

O processamento é incremental: o arquivo nunca é carregado inteiro na memória, o
que permite rodar sobre bases de muitos milhões de registros com consumo de RAM
constante.

> **Composição do repositório.** O programa são ~1.000 linhas em `src/` e ~400 de
> teste. As outras ~7.400 linhas estão em [`docs/conversa-ia/`](docs/conversa-ia/):
> é o transcrito das sessões com IA, que o enunciado pede junto da entrega.

---

## Requisitos

- **Node.js 22.18 ou superior** (a execução direta dos `.ts` usa o *type
  stripping* nativo do Node, sem passo de build).
- Uma dependência de runtime: [`csv-stringify`](https://csv.js.org/stringify/).

```bash
npm install
```

## Como rodar

O **caminho do arquivo de entrada é o primeiro parâmetro** do programa:

```bash
node src/index.ts <caminho-do-arquivo.jsonl>
```

```bash
node src/index.ts sample_clubes.jsonl
node src/index.ts /dados/base_completa.jsonl
```

Pelo npm, o `--` separa os argumentos do programa dos do npm:

```bash
npm run dev -- /dados/base_completa.jsonl
```

Sem parâmetro, o programa usa `sample_clubes.jsonl` como padrão.

### Versão compilada (opcional)

```bash
npm run build
node dist/index.js <caminho-do-arquivo.jsonl>
```

### Testes e verificação de tipos

```bash
npm test        # node --test, sem dependência de framework
npm run typecheck
```

### Saída

Os arquivos `clubs.csv` e `players.csv` são gravados **no diretório de trabalho
atual** e sobrescrevem versões anteriores. O diagnóstico (progresso e resumo) vai
para o **stderr**, separado dos dados:

```
Resumo: 5 clube(s) gravado(s), 1 ignorado(s) por campeonato, 0 linha(s) com erro.
Gerados: clubs.csv (5 linha(s)), players.csv (8 linha(s)).
Tempo: 0.02s | pico de memória (rss): 70.1 MB
```

Código de saída `1` em caso de falha na leitura ou na escrita; `0` caso contrário.
Linhas inválidas **não** alteram o código de saída — são contadas e o
processamento segue.

O caminho de entrada é conferido **antes** de os CSVs serem abertos:
`createWriteStream` trunca o destino já na abertura, então abrir primeiro faria um
erro de digitação apagar o resultado da execução anterior.

---

## Colunas geradas

Os nomes das colunas são em português e diferem das chaves do JSON.

### `clubs.csv`

| Coluna (CSV) | Origem no JSON |
| --- | --- |
| `Id do Clube` | `club_id` |
| `Nome` | `name` |
| `Campeonato` | `championship` |
| `Data de Fundação` | `founding_date` |
| `Cidade` | `city` |
| `Estado` | `state` |
| `País` | `country` |
| `Estádio` | `stadium` |
| `Presidente` | `president` |
| `Apelido` | `nickname` |
| `Cores` | `colors` |

### `players.csv`

| Coluna (CSV) | Origem no JSON |
| --- | --- |
| `Id do Clube` | `club_id` do clube (chave que liga o jogador ao clube) |
| `Id do Jogador` | `players[].player_id` |
| `Nome` | `players[].name` |
| `Idade` | `players[].age` |
| `Gols` | `players[].goals` |
| `Data de Estreia` | `players[].debut_date` |
| `Posição` | `players[].position` |
| `Número da Camisa` | `players[].shirt_number` |

Campos presentes no JSON e não listados acima (`titles`, `nationality`,
`market_value`) são descartados.

**Formato.** UTF-8, sem BOM, com linha de cabeçalho, separado por vírgula e fim de
registro `\n`. Campos com vírgula, aspas ou quebra de linha são escapados conforme
a RFC 4180 (campo entre aspas duplas, aspas internas duplicadas) — comportamento
padrão do `csv-stringify`.

---

## Regras de negócio

**Filtro por campeonato.** Só entram clubes de Série A ou Série B; os demais não
aparecem em nenhum dos dois arquivos, nem seus jogadores. A comparação usa uma
forma normalizada do texto (caixa alta, sem acento, espaços colapsados), então
`"SERIE A"`, `"Série A"` e `" série  a "` são o mesmo campeonato — o valor gravado
no CSV é o original. Campeonato ausente, nulo ou vazio → clube ignorado: sem o
campo não há como afirmar que é A ou B.

**Ligação 1:N.** Cada linha de `players.csv` carrega o `club_id` do clube. Clube
sem jogadores não gera linha em `players.csv`, mas continua em `clubs.csv`.

**Cores.** A lista é unida em um único campo separado por `|` (`preto|branco`).
Lista vazia ou ausente → campo vazio.

**Campos vazios.** Campo ausente ou nulo no JSON vira campo vazio no CSV. Também
viram vazio os números não finitos (`NaN`, `Infinity`) e os valores compostos
(objeto ou lista) onde se espera um escalar — converter produziria lixo como
`[object Object]` no arquivo final.

---

## Decisões tomadas

Pontos em que o enunciado deixava margem, e o critério usado em cada um.

### 1. Datas: formato de entrada fixo

| Entrada | Saída |
| --- | --- |
| `1910-09-01` | `1910-09-01` |
| `1910-09-01T14:30:00Z` | `1910-09-01` |
| qualquer outro formato | *(vazio)* |

O enunciado define a origem em `yyyy-MM-dd`. A tolerância a um horário **UTC**
(sufixo `Z`) foi acrescentada porque não introduz ambiguidade: o dia está
explícito e não há fuso a converter.

**Formatos ambíguos são rejeitados de propósito.** `03/04/2024` é 3 de abril em
`dd/MM/yyyy` e 4 de março em `MM/dd/yyyy`; sem conhecer a origem do dado, escolher
um dos dois grava uma data **plausível e errada**. Como a ambiguidade some nos
dias acima de 12, o erro atingiria só parte dos registros e passaria despercebido.
Campo vazio é uma perda visível e prevista pelo enunciado; data trocada é
corrupção silenciosa. Datas com offset explícito (`-03:00`) ficam de fora pelo
mesmo motivo: o mesmo instante cai em dias diferentes conforme o fuso.

A validação (`normalizarData`, em `src/helpers.ts`) tem duas etapas — formato pela
regex e existência no calendário, porque `2024-02-30` casa com a regex e não
existe. A saída é montada a partir dos grupos capturados, **nunca a partir do
`Date`**: formatar pelo `Date` reintroduziria fuso e um `toISOString()` pode
devolver o dia anterior.

### 2. `club_id` ausente invalida o registro

O enunciado define `Id do Clube` em `players.csv` como *"chave que liga o jogador
ao clube"*. Um clube sem `club_id` produziria jogadores órfãos — e, se mais de um
clube viesse sem id, órfãos indistinguíveis entre si no mesmo arquivo. É registro
incompleto, e a regra de robustez manda deixar esses de fora.

Clube sem `club_id` é contado como erro e descartado, junto com seus jogadores.
`player_id` ausente **não** invalida nada: não é chave de ligação, só vira campo
vazio.

### 3. Linha malformada é erro, não "ignorado"

Linha que não é objeto JSON é contada como **erro**, não como "ignorado por
campeonato". Uma é dado corrompido, a outra é o filtro de negócio funcionando;
misturar as duas no mesmo contador esconderia problemas na base de origem.

### 4. Nenhuma das duas é listada linha a linha

O stderr recebe só o progresso e o resumo. Um relatório com o número da linha e o
motivo de cada registro recusado existiu e foi retirado: numa base de milhões de
registros, um arquivo com muita linha ruim produz mais log do que dado, e o
console fica inutilizável justamente quando se precisa dele. O que sobra são os
dois contadores no resumo, que respondem a pergunta que importa — quanto entrou,
quanto ficou de fora e por qual dos dois motivos.

Como consequência, `LinhaInvalida` (`src/reader.ts`) carrega só o número da linha:
o motivo e o trecho do conteúdo saíram junto, para não ficar payload montado a
cada erro sem ninguém consumir.

### 5. Idioma dos nomes

Comentários, documentação e identificadores em **português**. Em inglês ficam só
as **chaves dos registros** (`club_id`, `founding_date`, `players`…), que espelham
o JSON de entrada — traduzi-las obrigaria a manter de cabeça um de-para entre o
arquivo lido e o código que o lê —, e os **nomes de arquivo da infraestrutura**
(`reader`, `writer`, `helpers`, `constants`), contra os do domínio (`clube`,
`jogador`). Os nomes das colunas do CSV são em português porque o enunciado os
define assim, letra por letra.

---

## Robustez e volume

### Nenhum registro derruba o processamento

`JSON.parse` e a normalização rodam sob `try/catch` por linha: a linha inválida
fica de fora, entra no contador e o programa segue. Também são tratados arquivo
inexistente ou sem permissão, erro de disco na escrita e fechamento do destino no
meio da execução — todos com mensagem legível, resumo parcial e código de saída
`1`.

Execução sobre uma base propositalmente suja (JSON quebrado, linha que não é
objeto, clube sem `club_id`, `players` que não é lista, item de `players` que não
é objeto, data inexistente no calendário, campo objeto onde se espera escalar,
linhas em branco e última linha sem quebra):

```
Resumo: 4 clube(s) gravado(s), 1 ignorado(s) por campeonato, 4 linha(s) com erro.
Gerados: clubs.csv (4 linha(s)), players.csv (2 linha(s)).
```

Nenhuma dessas linhas interrompe a execução, e os dois CSVs saem válidos.

### Memória constante

- **Leitura em blocos.** `separarLinhas` (`src/reader.ts`) lê o disco em blocos de
  256 KiB e mantém em memória só o resto após a última quebra de linha. Um
  separador próprio, no lugar do `readline`, permite impor um **teto por linha**
  (8 MiB): um arquivo corrompido sem quebras viraria OOM antes de qualquer
  `JSON.parse`. Passando do teto, a linha é descartada e contada como erro.
- **Nada acumulado entre iterações.** O clube é lido, escrito e sai de escopo na
  mesma iteração, junto com seus jogadores. Só contadores atravessam o laço.
- **Contrapressão de ponta a ponta.** Quando o CSV enche, o `await` na escrita
  segura o laço, e o `for await` só pede a próxima linha ao disco quando a
  iteração termina.

Medido em **1.572.864 linhas / 872 MB de entrada**, com o heap capado em 192 MB
(`node --max-old-space-size=192 src/index.ts grande.jsonl`): 3.145.728 jogadores
escritos em **40 s**, com pico de RSS de **94 MB** — estável do começo ao fim
(89–94 MB do primeiro ao último bloco de progresso). O consumo acompanha o tamanho
da maior linha, não o do arquivo.

### Testes

47 testes no runner nativo do Node (`node --test`), sem framework externo:

- **`helpers.test.ts`** — normalizações puras, com os casos de borda de data
  (calendário inválido, bissexto, formato ambíguo, fuso, ano de dois dígitos) e
  valor composto em campo escalar, a falha silenciosa mais perigosa do conjunto.
- **`clube.test.ts`** — filtro de campeonato, o que invalida o registro inteiro
  contra o que só custa um campo, propagação do `club_id` para os jogadores.
- **`reader.test.ts`** — leitura sobre arquivos temporários: linha inválida no
  meio, numeração fiel ao arquivo, CRLF, BOM, última linha sem quebra, teto de
  tamanho por linha, falha de abertura.

---

## Estrutura

```
src/
  index.ts        orquestra: argumentos, laço de conversão, contadores, resumo
  reader.ts       leitura incremental do JSONL (blocos, linhas, JSON.parse)
  writer.ts       escrita com contrapressão (texto e CSV)
  clube.ts        regras de domínio: filtro de campeonato, validação, mapeamento
  helpers.ts      normalizações puras (texto, data, listas)
  constants.ts    colunas, nomes de arquivo, limites, regex
  models/         tipos dos registros já normalizados
tests/            testes do runner nativo do Node
docs/conversa-ia/ histórico das sessões de desenvolvimento com IA
```

O leitor (`reader.ts`) não conhece o domínio: recebe um `filtrar` e um `validar`
opcionais e devolve, por linha, um de três resultados — lida, ignorada pelo filtro
ou inválida. Toda regra de clube fica em `clube.ts`.

---

## Uso de IA

Este projeto foi desenvolvido com apoio de um assistente de IA (Claude Code). O
**export das sessões** está em [`docs/conversa-ia/`](docs/conversa-ia/), em ordem
cronológica — três fases de construção e duas revisões curtas:

| Quando | Sessão | Sobre | Solicitações | Ferramentas |
| --- | --- | --- | --- | --- |
| 07/08 20:58 | [Fase 1](docs/conversa-ia/fase-1.md) | leitura do JSONL, leitura incremental, mapeamento dos campos e normalização | 7 | 72 |
| 09/08 02:39 | [Revisão](docs/conversa-ia/revisao-codigo-morto.md) | parâmetro sem uso, comentário desatualizado e código morto | 4 | 54 |
| 09/08 17:05 | [Fase 2](docs/conversa-ia/fase-2.md) | filtro por campeonato e tolerância a campo fora de formato | 3 | 33 |
| 09/08 20:07 | [Revisão](docs/conversa-ia/revisao-cores.md) | `colors` fora do formato de lista | 1 | 20 |
| 09/08 20:45 | [Fase 3](docs/conversa-ia/fase-3.md) | saída em CSV | 2 | 50 |

São o transcrito das sessões, não um resumo: cada solicitação com o texto exato
que escrevi, cada resposta na íntegra, e as chamadas de ferramenta recolhidas em
blocos que abrem no clique. O cabeçalho de cada arquivo diz o que foi retirado do
original (raciocínio interno do modelo, os blocos que o editor injeta sozinho, e o
excedente de ferramenta muito longa — este sempre marcado).

**Nem tudo que a IA propôs entrou**, e as duas revisões registram isso:

- em `colors`, a resposta passava a **inferir separadores dentro de um texto**
  (`"verde, branco"` → `verde|branco`). Recusado: supor um separador inventa uma
  estrutura que a origem não declarou, e transformaria `"azul, com detalhe branco"`
  em duas cores sem ninguém ver. Há um teste travando a regra;
- na varredura de código morto, o pedido era **reportar**, e vieram 7 achados já
  corrigidos. Os 7 foram desfeitos. Três voltaram depois, um de cada vez e por
  decisão explícita; dois continuam de pé de propósito — o ramo `bigint` de
  `normalizarTexto`, que tem teste, e os defaults de `lerFluxoJsonl`.

A divisão de papéis foi a mesma do começo ao fim: arquitetura, regras de negócio e
decisões técnicas são minhas; a IA escreveu código para solução já definida. Os
pedidos dizem o que implementar, onde, com que contrato e quais casos de borda
tratar — validar data em duas etapas sem usar `Date` para formatar a saída,
rejeitar formatos ambíguos em vez de inferir a ordem dos campos, pôr o filtro de
campeonato antes da validação, trocar o `readline` por um separador próprio para
impor teto por linha. A ferramenta também foi usada neste README, nos comentários
e na escrita dos testes, a partir da lista de casos de borda levantada durante o
desenvolvimento.

Estas sessões são onde o código nasceu, e não tudo o que houve: em volta delas
correram conversas menores de discussão e revisão.
