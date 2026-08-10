# Desafio Batch — JSONL de clubes → CSV

Lê um arquivo **JSONL** (um objeto JSON por linha, cada objeto é um clube com sua
lista de jogadores) e gera dois arquivos CSV:

| Arquivo | Conteúdo |
| --- | --- |
| `clubs.csv` | um registro por clube (1:1 com a linha do JSONL) |
| `players.csv` | um registro por jogador (1:N a partir de `players[]`) |

O processamento é incremental: o arquivo nunca é carregado inteiro na memória.

> O export das sessões com IA está em [`docs/conversa-ia/`](docs/conversa-ia/).
> Decisões de design detalhadas em [`docs/DECISOES.md`](docs/DECISOES.md).

---

## Requisitos

- **Node.js 20 ou superior**
- Dependências: [`csv-stringify`](https://csv.js.org/stringify/) (runtime) e
  TypeScript/`tsx` (desenvolvimento e testes)

```bash
npm install
```

## Como rodar

O **caminho do arquivo de entrada é obrigatório** — primeiro parâmetro do programa:

```bash
npm run build
npm start -- sample_clubes.jsonl
```

Equivalente direto:

```bash
node dist/index.js sample_clubes.jsonl
node dist/index.js /caminho/para/base.jsonl
```

Para desenvolvimento local (sem build):

```bash
npm run dev -- sample_clubes.jsonl
```

### Saída

Os arquivos `clubs.csv` e `players.csv` são gravados no **diretório de trabalho
atual** e sobrescrevem versões anteriores. Diagnóstico (progresso e resumo) vai
para o **stderr**:

```
Resumo: 5 clube(s) gravado(s), 1 ignorado(s) por campeonato, 0 linha(s) com erro.
Gerados: clubs.csv (5 linha(s)), players.csv (8 linha(s)).
Tempo: 0.02s | pico de memória (rss): 70.1 MB
```

Código de saída `1` em falha de leitura ou escrita; `0` caso contrário. Linhas
inválidas não alteram o código de saída — são contadas e o processamento segue.

O caminho de entrada é conferido **antes** de abrir os CSVs, para que um erro de
digitação não apague o resultado da execução anterior.

---

## Testes e verificação de tipos

```bash
npm test
npm run typecheck
```

`npm test` compila `src/` para `dist/` e roda testes unitários + um E2E.

O teste E2E compara a saída gerada a partir de `sample_clubes.jsonl` com
`clubs.csv` e `players.csv` na **raiz do repositório**. Esses dois arquivos
precisam existir antes de rodar os testes — são a referência esperada, não são
produzidos automaticamente pelo `npm test`.

Para gerá-los (ou atualizá-los após mudança de regra):

```bash
npm run build
npm start -- sample_clubes.jsonl
```

Os testes unitários (`clube`, `helpers`, `reader`) **não** dependem desses CSVs.

---

## Regras de negócio (resumo)

- **Filtro:** só clubes de Série A ou Série B (comparação normalizada; aceita
  textos como `"Campeonato Brasileiro Série A"`).
- **Cores:** lista unida por `|`; vazia ou ausente → campo vazio.
- **Datas:** saída em `yyyy-MM-dd`; inválida → vazio.
- **Campos ausentes/nulos:** viram campo vazio no CSV — inclusive `club_id`,
  propagado para `Id do Clube` de cada jogador (ver
  [`docs/DECISOES.md`](docs/DECISOES.md#2-club_id-ausente-vira-campo-vazio)).
- **CSV:** UTF-8, cabeçalho, vírgula, escaping RFC 4180 (`csv-stringify`).
- **Robustez:** linha com JSON inválido ou que não é objeto é descartada; o
  processamento continua.

Colunas e mapeamento JSON → CSV estão em [`docs/DECISOES.md`](docs/DECISOES.md).

---

## Estrutura

```
src/
  index.ts        orquestração, contadores, resumo
  reader.ts       leitura incremental do JSONL
  writer.ts       escrita com contrapressão
  clube.ts        filtro, validação, mapeamento
  helpers.ts      normalizações puras
  constants.ts    colunas, limites, regex
  models/         tipos normalizados
tests/            unitários + e2e
docs/
  DECISOES.md     decisões de design
  conversa-ia/    histórico com IA
```

---

## Uso de IA

Desenvolvido com apoio de assistente de IA. A ferramenta também foi usada neste
README, nos comentários e na escrita dos testes. Sessões em
[`docs/conversa-ia/`](docs/conversa-ia/):

| Quando | Sessão | Sobre |
| --- | --- | --- |
| 07/08 | [Fase 1](docs/conversa-ia/fase-1.md) | leitura JSONL, mapeamento, normalização |
| 09/08 | [Fase 2](docs/conversa-ia/fase-2.md) | filtro por campeonato |
| 09/08 | [Fase 3](docs/conversa-ia/fase-3.md) | saída em CSV |
| 10/08 | [Buffer do log](docs/conversa-ia/simplificar-buffer-log.md) | simplificação do stderr |
