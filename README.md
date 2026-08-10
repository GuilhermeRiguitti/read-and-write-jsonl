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

Exemplos:

```bash
node src/index.ts sample_clubes.jsonl
node src/index.ts /dados/base_completa.jsonl
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
atual** e sobrescrevem versões anteriores.

O diagnóstico (progresso, erros por linha, resumo) vai para o **stderr**, separado
dos dados. Ao final:

```
Resumo: 5 clube(s) lido(s), 1 ignorado(s) por campeonato, 0 linha(s) com erro.
Gerados: clubs.csv (5 linha(s)), players.csv (8 linha(s)).
Tempo: 0.02s | pico de memória (rss): 70.1 MB
```

Código de saída `1` em caso de falha na leitura ou na escrita; `0` caso contrário.
Linhas inválidas **não** alteram o código de saída — são reportadas e o
processamento segue.

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

### Formato

UTF-8, sem BOM, com linha de cabeçalho, separado por vírgula e fim de registro
`\n`. Campos com vírgula, aspas ou quebra de linha são escapados conforme a
RFC 4180 (campo entre aspas duplas, aspas internas duplicadas) — comportamento
padrão do `csv-stringify`.

---

## Regras de negócio

### Filtro por campeonato

Só entram clubes de **Série A** ou **Série B**. Clube de outro campeonato não
aparece em nenhum dos dois arquivos, nem seus jogadores.

A comparação é feita sobre uma forma normalizada do texto (caixa alta, sem
acento, espaços colapsados), então `"SERIE A"`, `"Série A"` e `" série  a "` são
tratados como o mesmo campeonato. O valor gravado no CSV é o original, sem
normalização.

Campeonato ausente, nulo ou vazio → clube ignorado: sem o campo não há como
afirmar que é A ou B, e supor produziria informação errada na saída.

### Ligação 1:N

Cada linha de `players.csv` carrega o `club_id` do clube a que o jogador pertence.
Clube sem jogadores não gera nenhuma linha em `players.csv`, mas continua
aparecendo em `clubs.csv`.

### Campos vazios

Campo ausente ou nulo no JSON vira campo vazio no CSV. Também viram vazio:

- números não finitos (`NaN`, `Infinity`);
- valores compostos (objeto ou lista) onde se espera um escalar — converter
  produziria lixo como `[object Object]` no arquivo final.

### Cores

A lista é unida em um único campo separado por `|` (ex.: `preto|branco`). Lista
vazia ou ausente → campo vazio.

---

## Decisões tomadas

Pontos em que o enunciado deixava margem, e o critério usado em cada um.

### 1. Datas: formato de entrada fixo

| Entrada | Saída |
| --- | --- |
| `1910-09-01` | `1910-09-01` |
| `1910-09-01T14:30:00Z` | `1910-09-01` |
| `1910-09-01T14:30:00.123Z` | `1910-09-01` |
| qualquer outro formato | *(vazio)* |

O enunciado define a origem em `yyyy-MM-dd`. A tolerância a um horário **UTC**
(sufixo `Z`) foi acrescentada porque não introduz ambiguidade nenhuma: o dia está
explícito e não há fuso a converter. Descartar `1910-09-01T00:00:00Z` perderia um
dado inequívoco.

**Formatos ambíguos são rejeitados de propósito.** `03/04/2024` é 3 de abril em
`dd/MM/yyyy` e 4 de março em `MM/dd/yyyy`; sem conhecer a origem do dado, escolher
um dos dois grava uma data **plausível e errada**, que não aparece em log nenhum.
Como a ambiguidade some nos dias acima de 12, o erro atingiria apenas parte dos
registros e passaria despercebido em teste rápido. Campo vazio é uma perda
visível e prevista pelo enunciado; data trocada é corrupção silenciosa.

Datas com offset explícito (`-03:00`) também ficam de fora: o mesmo instante cai
em dias diferentes conforme o fuso adotado, então não há resposta única para
"qual é a data".

**Validação em duas etapas** (`normalizarData`, em `src/helpers.ts`):

1. **formato** — regex (`PADRAO_DATA`, em `src/constants.ts`);
2. **calendário** — `2024-02-30` e `2023-02-29` casam com a regex mas não
   existem. A checagem monta a data em UTC e confere se ano/mês/dia voltam
   iguais; se o dia estourou o limite do mês, o `Date` desloca e a comparação
   falha.

A saída é montada a partir dos grupos capturados pela regex, **nunca a partir do
`Date`** — formatar pelo `Date` reintroduziria fuso, e um `toISOString()` pode
devolver o dia anterior.

### 2. `club_id` ausente invalida o registro

O enunciado define `Id do Clube` em `players.csv` como *"chave que liga o jogador
ao clube"*. Um clube sem `club_id` produziria jogadores órfãos — e, se mais de um
clube viesse sem id, órfãos indistinguíveis entre si no mesmo arquivo. É registro
incompleto, e a regra de robustez manda deixar esses de fora.

Portanto: clube sem `club_id` é reportado como erro e descartado, junto com seus
jogadores. `player_id` ausente **não** invalida nada — não é chave de ligação, só
vira campo vazio.

### 4. Linha malformada é erro, não "ignorado"

Linha que não é objeto JSON é contada e reportada como **erro**, não como
"ignorado por campeonato". São situações diferentes: uma é dado corrompido, a
outra é o filtro de negócio funcionando, e misturar as duas no mesmo contador
esconderia problemas na base de origem.

Registros descartados pelo filtro de campeonato não vão para o stderr — numa base
grande eles seriam a maioria e afogariam o log.

---

## Robustez e volume

### Nenhum registro derruba o processamento

`JSON.parse` e a normalização rodam sob `try/catch` por linha. Linha inválida é
reportada (número da linha, motivo e trecho do conteúdo) e o programa segue para
a próxima. Também são tratados: arquivo inexistente ou sem permissão, erro de
disco na escrita e fechamento do destino no meio da execução — todos com mensagem
legível, resumo parcial e código de saída `1`.

### Memória constante

- **Leitura em blocos.** `separarLinhas` (`src/reader.ts`) lê o disco em blocos de
  256 KiB e mantém em memória apenas o resto após a última quebra de linha. Um
  separador próprio foi usado no lugar do `readline` para poder impor um **teto
  por linha** (8 MiB): um arquivo corrompido sem quebras de linha viraria OOM
  antes de qualquer `JSON.parse`. Passando do teto, a linha é descartada na hora,
  reportada como erro, e a leitura segue.
- **Nada acumulado entre iterações.** O clube é lido, escrito e sai de escopo na
  mesma iteração — junto com seus jogadores. Não há array de registros, nem
  segunda passada pelo arquivo. Só contadores atravessam o laço.
- **Contrapressão de ponta a ponta.** Quando o CSV enche, o `await` na escrita
  segura o laço, e o `for await` só pede a próxima linha ao disco quando a
  iteração termina. A leitura anda no ritmo da escrita, em vez de empilhar dados
  na memória.

Medido em 1.572.864 linhas (195 MB de entrada), com heap capado em 192 MB: pico de
RSS de **114 MB**, estável do começo ao fim, contra ~50 MB no arquivo pequeno.

### Testes

47 testes no runner nativo do Node (`node --test`), sem framework externo:

- **`tests/helpers.test.ts`** — as normalizações puras. Concentra os casos de borda
  de data (calendário inválido, ano bissexto, formato ambíguo, ausência de
  deslocamento por fuso, ano de dois dígitos) e a regra de valor composto em campo
  escalar, que é a falha silenciosa mais perigosa do conjunto.
- **`tests/clube.test.ts`** — filtro de campeonato, o que invalida o registro
  inteiro e o que só custa um campo, e a propagação do `club_id` para os jogadores.
- **`tests/reader.test.ts`** — a robustez da leitura sobre arquivos temporários:
  linha inválida no meio não interrompe o restante, numeração fiel ao arquivo,
  CRLF, BOM, última linha sem quebra, teto de tamanho por linha e falha de
  abertura do arquivo.

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

O leitor (`reader.ts`) não conhece o domínio: recebe um `filter` e um `validate`
opcionais e devolve, por linha, um de três resultados — lida, ignorada pelo filtro
ou inválida. Toda regra de clube fica em `clube.ts`.

---

## Uso de IA

Este projeto foi desenvolvido com apoio de um assistente de IA, e as sessões estão
exportadas na íntegra em [`docs/conversa-ia/`](docs/conversa-ia/):

- [fase 1](docs/conversa-ia/fase-1.md) — leitura do JSONL, leitura incremental,
  mapeamento dos campos e normalização;
- [fase 2](docs/conversa-ia/fase-2.md) — filtro por campeonato e tolerância a
  campos fora de formato;
- [fase 3](docs/conversa-ia/fase-3.md) — saída em CSV.

A divisão de papéis foi a mesma do começo ao fim: arquitetura, regras de negócio e
decisões técnicas são minhas; a IA escreveu código para solução já definida. Os
pedidos nas sessões descrevem o que implementar, onde, com que contrato e quais
casos de borda tratar — validar data em duas etapas sem usar `Date` para formatar
a saída, rejeitar formatos ambíguos em vez de inferir a ordem dos campos,
posicionar o filtro de campeonato antes da validação, trocar o `readline` por um
separador de linhas próprio para impor teto por linha.

Por isso os transcritos não cobrem a estrutura completa da aplicação: boa parte do
código foi escrita manualmente, e o que veio da IA passou por ajuste depois.

A ferramenta também foi usada na redação deste README, nos comentários do código e
na escrita dos testes — nestes, a partir da lista de casos de borda levantada
durante o desenvolvimento: data que passa na regex mas não existe no calendário,
formato ambíguo, objeto em campo escalar, CRLF, BOM, última linha sem quebra e
teto de tamanho por linha.
