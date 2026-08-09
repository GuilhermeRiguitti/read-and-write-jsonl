# Tarefa: saída em CSV (clubs.csv e players.csv)

## Objetivo

Trocar a impressão dos registros no console por dois arquivos CSV gerados com
`csv-stringify`:

1. `clubs.csv` — um registro por clube (1:1).
2. `players.csv` — um registro por jogador (1:N, a partir da lista dentro de cada clube).

Os dados já estão mapeados, filtrados e normalizados. **Esta etapa não muda dado
nenhum**: é só troca de destino e renomeação das colunas para português.

## O que NÃO muda

- Nenhum campo entra ou sai. O conteúdo dos CSVs é exatamente o que
  `formatarClube` imprime hoje no stdout — mesmos campos, mesma ordem, mesmos
  valores já normalizados.
- Nada de nova normalização, conversão, `fallback` ou formatação de valor. Campo
  vazio continua saindo vazio.
- O filtro de campeonato, a regra do `club_id` herdado pelo jogador e a regra
  "clube sem jogadores não gera linha em `players.csv`, mas continua em
  `clubs.csv`" já estão implementados e corretos. Não mexer.
- `reader.ts`, `clube.ts`, `helpers.ts` e os tipos em `models/` ficam como estão.
- O diagnóstico (progresso, erros por linha, resumo final) continua no **stderr**.

## Saída esperada

Os nomes das colunas são em português e diferem das chaves do JSON. Usar
exatamente os nomes da coluna "Coluna (CSV)" — com acentos, espaços e
maiúsculas/minúsculas —, na ordem em que aparecem.

### `clubs.csv`

| Campo (JSON) | Coluna (CSV) |
| --- | --- |
| `club_id` | `Id do Clube` |
| `name` | `Nome` |
| `championship` | `Campeonato` |
| `founding_date` | `Data de Fundação` |
| `city` | `Cidade` |
| `state` | `Estado` |
| `country` | `País` |
| `stadium` | `Estádio` |
| `president` | `Presidente` |
| `nickname` | `Apelido` |
| `colors` | `Cores` |

O campo `players` **não** vira coluna.

### `players.csv`

| Campo (JSON) | Coluna (CSV) |
| --- | --- |
| `club_id` | `Id do Clube` |
| `player_id` | `Id do Jogador` |
| `name` | `Nome` |
| `age` | `Idade` |
| `goals` | `Gols` |
| `debut_date` | `Data de Estreia` |
| `position` | `Posição` |
| `shirt_number` | `Número da Camisa` |

### Formato

- UTF-8, com linha de cabeçalho, separado por vírgula.
- Campos com vírgula, aspas ou quebra de linha escapados conforme RFC 4180:
  campo entre aspas duplas, aspas internas duplicadas. É o comportamento padrão
  do `csv-stringify` — não forçar `quoted: true`.
- Fim de registro: `\n`. Sem BOM.
- Arquivo existente é sobrescrito.

## Implementação

### 1. Dependência

`npm i csv-stringify` (o pacote traz os próprios tipos, não precisa de `@types`).

Usar a **API de stream** (`import { stringify } from "csv-stringify"`, que
devolve um `Stringifier`). **Não** usar `csv-stringify/sync`: ela monta o
resultado inteiro em memória e derruba a premissa de arquivo grande que o resto
do projeto sustenta.

### 2. `src/constants.ts`

```ts
export const ARQUIVO_CLUBES = "clubs.csv";
export const ARQUIVO_JOGADORES = "players.csv";
```

E as colunas no formato que o `csv-stringify` aceita direto na opção `columns`:

```ts
export const COLUNAS_CLUBES = [
  { key: "club_id", header: "Id do Clube" },
  // ...
];
```

Motivo de usar `columns` em vez de montar o array de células na mão: ordem das
colunas, nomes do cabeçalho e recorte dos campos ficam declarados num lugar só,
e chave não listada (`players`) é descartada pela própria biblioteca — o objeto
`ClubeNormalizado` pode ser escrito como está, sem etapa de mapeamento.

### 3. `src/writer.ts`

Adicionar `criarEscritorCsv(caminho, colunas)`, ao lado do `criarEscritor` atual,
devolvendo algo como:

```ts
export type EscritorCsv<T> = {
  write(registro: T): void | Promise<void>;
  close(): Promise<void>;
};
```

- Mesmo contrato de contrapressão do `criarEscritor`: `write` só devolve Promise
  quando o destino sinalizou que está cheio, e quem chama dá `await`. Isso é o
  que segura o laço de leitura no ritmo do disco.
- `stringify({ header: true, columns })` ligado a um `createWriteStream`. Amarrar
  os dois com `pipeline` (`node:stream/promises`) e guardar a Promise: `pipe` cru
  engole erro do arquivo (disco cheio, permissão), e aqui esse erro precisa
  subir.
- `close()`: encerra o stringifier e **aguarda** a Promise do `pipeline`. Só
  depois disso o arquivo está garantido em disco — imprimir o resumo antes disso
  seria mentir sobre o que foi escrito.
- Reaproveitar o `esperarDrain` que já existe no arquivo; ele já é genérico sobre
  `Writable`.

### 4. `src/index.ts`

- Remover `formatarClube` e o escritor de stdout. Manter o `log` (stderr).
- `ignorarPipeFechado(process.stdout)` perde o motivo de existir, já que o stdout
  deixa de carregar registro: remover.
- Abrir os dois escritores antes do laço.
- Para cada resultado `ok`: escrever o clube em `clubs.csv` e, em seguida, cada
  item de `clube.players` em `players.csv`. Nada de acumular clubes ou jogadores
  em array — o registro continua saindo de escopo a cada iteração.
- Contadores: manter `lidos`, `ignorados`, `invalidos` e acrescentar
  `jogadoresEscritos`.
- Fechar os dois escritores em `finally`, para que uma falha no meio ainda deixe
  arquivos fechados e válidos até onde deu. Falha no fechamento também vira
  `process.exitCode = 1` com mensagem.
- Resumo final passa a incluir os arquivos gerados e as linhas escritas, algo
  como:

```
Resumo: N clube(s) lido(s), M ignorado(s) por campeonato, K linha(s) com erro.
Gerados: clubs.csv (N linha(s)), players.csv (J linha(s)).
Tempo: ...s | pico de memória (rss): ... MB
```

### 5. `README.md`

Documentar os dois arquivos de saída, as colunas de cada um, o encoding/escape e
a regra do clube sem jogadores.

## Restrições

- Comentários em português, no estilo do resto do código: explicar **por que**,
  não o que a linha faz.
- Nada de carregar o arquivo inteiro, nem de acumular registros: o consumo de
  memória tem de continuar constante em relação ao tamanho da entrada.
- `npx tsc --noEmit` limpo.

## Verificação

- Rodar no `sample_clubes.jsonl`: número de linhas de `clubs.csv` (sem o
  cabeçalho) tem de bater com o `lido(s)` do resumo, e o de `players.csv` com a
  soma dos jogadores dos clubes lidos.
- Conferir o cabeçalho dos dois arquivos caractere a caractere contra as tabelas
  acima.
- Num arquivo temporário à parte (sem alterar o `sample_clubes.jsonl`), testar um
  clube com campo contendo vírgula, aspas duplas e quebra de linha, e confirmar o
  escape RFC 4180 no arquivo gerado.
- Confirmar que um clube elegível com `players` vazio aparece em `clubs.csv` e
  não gera linha em `players.csv`.
