# Histórico da conversa — fase 3

Continuação de [fase-2.md](fase-2.md). Registro da sessão de
desenvolvimento deste projeto (Claude Code, 09/08/2026), com as solicitações
feitas e as respostas dadas, na ordem em que aconteceram.

As solicitações estão transcritas exatamente como foram escritas. As respostas
reproduzem o que foi reportado ao final de cada etapa; a saída completa de
terminal aparece resumida nos trechos relevantes.

Os trechos de código citados são os do momento de cada etapa — arquivos podem ter
sido ajustados depois, em etapas seguintes.

---

## 1. Saída em CSV (`clubs.csv` e `players.csv`)

### Solicitação

> # Tarefa: saída em CSV (clubs.csv e players.csv)
>
> ## Objetivo
>
> Trocar a impressão dos registros no console por dois arquivos CSV gerados com
> `csv-stringify`:
>
> 1. `clubs.csv` — um registro por clube (1:1).
> 2. `players.csv` — um registro por jogador (1:N, a partir da lista dentro de cada clube).
>
> Os dados já estão mapeados, filtrados e normalizados. **Esta etapa não muda dado
> nenhum**: é só troca de destino.
>
> ## O que NÃO muda
>
> - Nenhum campo entra ou sai. O conteúdo dos CSVs é exatamente o que
>   `formatarClube` imprime hoje no stdout — mesmos campos, mesma ordem, mesmos
>   valores já normalizados.
> - Nada de nova normalização, conversão, `fallback` ou formatação de valor. Campo
>   vazio continua saindo vazio.
> - O filtro de campeonato, a regra do `club_id` herdado pelo jogador e a regra
>   "clube sem jogadores não gera linha em `players.csv`, mas continua em
>   `clubs.csv`" já estão implementados e corretos. Não mexer.
> - `reader.ts`, `clube.ts`, `helpers.ts` e os tipos em `models/` ficam como estão.
> - O diagnóstico (progresso, erros por linha, resumo final) continua no **stderr**.
>
> ## Saída esperada
>
> Os nomes das colunas são em português e diferem das chaves do JSON. Usar
> exatamente os nomes da coluna "Coluna (CSV)" — com acentos, espaços e
> maiúsculas/minúsculas —, na ordem em que aparecem.
>
> ### `clubs.csv`
>
> | Campo (JSON) | Coluna (CSV) |
> | --- | --- |
> | `club_id` | `Id do Clube` |
> | `name` | `Nome` |
> | `championship` | `Campeonato` |
> | `founding_date` | `Data de Fundação` |
> | `city` | `Cidade` |
> | `state` | `Estado` |
> | `country` | `País` |
> | `stadium` | `Estádio` |
> | `president` | `Presidente` |
> | `nickname` | `Apelido` |
> | `colors` | `Cores` |
>
> O campo `players` não vira coluna.
>
> ### `players.csv`
>
> | Campo (JSON) | Coluna (CSV) |
> | --- | --- |
> | `club_id` | `Id do Clube` |
> | `player_id` | `Id do Jogador` |
> | `name` | `Nome` |
> | `age` | `Idade` |
> | `goals` | `Gols` |
> | `debut_date` | `Data de Estreia` |
> | `position` | `Posição` |
> | `shirt_number` | `Número da Camisa` |
>
> ### Formato
>
> - UTF-8, com linha de cabeçalho, separado por vírgula.
> - Campos com vírgula, aspas ou quebra de linha escapados conforme RFC 4180:
>   campo entre aspas duplas, aspas internas duplicadas. É o comportamento padrão
>   do `csv-stringify` — não forçar `quoted: true`.
> - Fim de registro: `\n`. Sem BOM.
> - Arquivo existente é sobrescrito.
>
> ## Implementação
>
> ### 1. Dependência
>
> `npm i csv-stringify` (o pacote traz os próprios tipos, não precisa de `@types`).
>
> Usar a API de stream (`import { stringify } from "csv-stringify"`, que
> devolve um `Stringifier`). Não usar `csv-stringify/sync`: ela monta o
> resultado inteiro em memória e pode quebrar o código em premissa de arquivo grande que o resto
> do projeto sustenta.
>
> ### 2. `src/constants.ts`
>
> ```ts
> export const ARQUIVO_CLUBES = "clubs.csv";
> export const ARQUIVO_JOGADORES = "players.csv";
> ```
>
> E as colunas no formato que o `csv-stringify` aceita direto na opção `columns`:
>
> ```ts
> export const COLUNAS_CLUBES = [
>   { key: "club_id", header: "Id do Clube" },
>   // ...
> ];
> ```
>
> Motivo de usar `columns` em vez de montar o array de células na mão: ordem das
> colunas, nomes do cabeçalho e recorte dos campos ficam declarados num lugar só,
> e chave não listada (`players`) é descartada pela própria biblioteca — o objeto
> `ClubeNormalizado` pode ser escrito como está, sem etapa de mapeamento.
>
> ### 3. `src/writer.ts`
>
> Adicionar `criarEscritorCsv(caminho, colunas)`, ao lado do `criarEscritor` atual,
> devolvendo algo como:
>
> ```ts
> export type EscritorCsv<T> = {
>   write(registro: T): void | Promise<void>;
>   close(): Promise<void>;
> };
> ```
>
> - Mesmo contrato de contrapressão do `criarEscritor`: `write` só devolve Promise
>   quando o destino sinalizou que está cheio, e quem chama dá `await`. Isso é o
>   que segura o laço de leitura no ritmo do disco.
> - `stringify({ header: true, columns })` ligado a um `createWriteStream`. Amarrar
>   os dois com `pipeline` (`node:stream/promises`) e guardar a Promise: `pipe` cru
>   engole erro do arquivo (disco cheio, permissão), e aqui esse erro precisa
>   subir.
> - `close()`: encerra o stringifier e **aguarda** a Promise do `pipeline`. Só
>   depois disso o arquivo está garantido em disco — imprimir o resumo antes disso
>   seria mentir sobre o que foi escrito.
> - Reaproveitar o `esperarDrain` que já existe no arquivo; ele já é genérico sobre
>   `Writable`.
>
> ### 4. `src/index.ts`
>
> - Remover `formatarClube` e o escritor de stdout. Manter o `log` (stderr).
> - `ignorarPipeFechado(process.stdout)` perde o motivo de existir, já que o stdout
>   deixa de carregar registro: remover.
> - Abrir os dois escritores antes do laço.
> - Para cada resultado `ok`: escrever o clube em `clubs.csv` e, em seguida, cada
>   item de `clube.players` em `players.csv`. Nada de acumular clubes ou jogadores
>   em array — o registro continua saindo de escopo a cada iteração.
> - Contadores: manter `lidos`, `ignorados`, `invalidos` e acrescentar
>   `jogadoresEscritos`.
> - Fechar os dois escritores em `finally`, para que uma falha no meio ainda deixe
>   arquivos fechados e válidos até onde deu. Falha no fechamento também vira
>   `process.exitCode = 1` com mensagem.
> - Resumo final passa a incluir os arquivos gerados e as linhas escritas, algo
>   como:
>
> ```
> Resumo: N clube(s) lido(s), M ignorado(s) por campeonato, K linha(s) com erro.
> Gerados: clubs.csv (N linha(s)), players.csv (J linha(s)).
> Tempo: ...s | pico de memória (rss): ... MB
> ```
>
> ### 5. Contrapressão e ritmo do laço
>
> O `for await` sobre o `readJsonlFile` continua sendo o laço central e o único
> ponto de escrita: registro é lido, escrito e sai de escopo na mesma iteração.
> Três invariantes precisam sobreviver à troca de destino:
>
> - **Nada acumulado entre iterações.** Nenhum array de clubes, nenhum array de
>   jogadores, nenhuma segunda passada pelo arquivo. Se `players.csv` exigir algo
>   que só se sabe no fim, a solução é outra — não é bufferizar.
> - **A escrita segura a leitura.** Quando o CSV enche, o `await` no laço tem de
>   bloquear a próxima leitura do disco. Confirmar que isso de fato acontece com o
>   `Stringifier` no meio: a contrapressão só chega ao laço se o `pipeline` estiver
>   propagando o `drain` do arquivo até o lado gravável do transform. Vale medir o
>   pico de rss no arquivo grande — se ele cresce com o tamanho da entrada em vez
>   de ficar estável, a corrente quebrou em algum ponto.
> - **Agrupamento de escritas.** O `criarEscritor` atual junta ~64 KiB antes de
>   tocar o stream, justamente para não pagar uma syscall por registro. O
>   `Stringifier` emite um pedaço por registro; sob carga o `WriteStream` de
>   arquivo reagrupa (`_writev`) o que estiver na fila, mas isso só vale enquanto
>   há escrita em voo. Ajustar o `highWaterMark` do `createWriteStream` (e o do
>   stringifier, se a opção for aceita — checar os tipos do pacote) para uma faixa
>   comparável, em vez de aceitar o padrão sem olhar.
>
> Sobre o fechamento: `close()` roda em `finally`, então pode rodar depois de uma
> falha na leitura. Nesse caso o erro do fechamento **não pode encobrir o erro
> original** — o primeiro é a causa, o segundo é consequência. Reportar os dois ou
> preservar o primeiro.
>
> ### 6. `README.md`
>
> Documentar os dois arquivos de saída, as colunas de cada um, o encoding/escape e
> a regra do clube sem jogadores.
>
> ## Restrições
>
> - Comentários em português, no estilo do resto do código: explicar **por que**,
>   não o que a linha faz.
> - Nada de carregar o arquivo inteiro, nem de acumular registros: o consumo de
>   memória tem de continuar constante em relação ao tamanho da entrada.
> - `npx tsc --noEmit` limpo.
>
> ## Verificação
>
> - Rodar no `sample_clubes.jsonl`: número de linhas de `clubs.csv` (sem o
>   cabeçalho) tem de bater com o `lido(s)` do resumo, e o de `players.csv` com a
>   soma dos jogadores dos clubes lidos.
> - Conferir o cabeçalho dos dois arquivos caractere a caractere contra as tabelas
>   acima.
> - Num arquivo temporário à parte (sem alterar o `sample_clubes.jsonl`), testar um
>   clube com campo contendo vírgula, aspas duplas e quebra de linha, e confirmar o
>   escape RFC 4180 no arquivo gerado.
> - Confirmar que um clube elegível com `players` vazio aparece em `clubs.csv` e
>   não gera linha em `players.csv`.
> - Gerar um JSONL grande (algumas centenas de milhares de linhas, repetindo o
>   sample) e comparar o `pico de memória (rss)` do resumo com o de um arquivo
>   pequeno. Os dois têm de ficar na mesma ordem de grandeza — rss crescendo junto
>   com a entrada significa acúmulo ou contrapressão quebrada, não "arquivo
>   grande".

### Resposta

Implementado. Typecheck limpo (`npx tsc --noEmit`). A saída no console foi
trocada pelos dois CSVs sem mudar nenhuma regra de dado.

**O que mudou**

`package.json` — `csv-stringify` `^6.8.3` em `dependencies`.

`src/constants.ts` — `ARQUIVO_CLUBES` / `ARQUIVO_JOGADORES` e os arrays
`COLUNAS_CLUBES` / `COLUNAS_JOGADORES` no formato da opção `columns`. Ordem,
nomes de cabeçalho e recorte de campos ficam declarados num lugar só, e a chave
não listada (`players`) é descartada pela própria biblioteca — o
`ClubeNormalizado` é escrito como está, sem etapa de mapeamento por registro.

`src/writer.ts` — `criarEscritorCsv(caminho, colunas)` ao lado do
`criarEscritor`, reaproveitando o `esperarDrain`. O `stringify` é ligado ao
`createWriteStream` com `pipeline` (não `pipe`, que engole erro do arquivo).

`src/index.ts` — `formatarClube`, o escritor de stdout e o `ignorarPipeFechado`
saíram; o `log` (stderr) ficou. Cada resultado `ok` escreve o clube e, na mesma
iteração, os jogadores dele; nada é acumulado. Os dois escritores fecham em
`finally`.

`.gitignore` — `clubs.csv` e `players.csv` como saída gerada.

**Três detalhes que o pedido mandava checar e não tinham resposta óbvia**

- **Rejeição solta do `pipeline`.** A Promise do `pipeline` só é aguardada no
  `close()`, mas ela pode rejeitar no meio do laço (disco cheio, permissão). Sem
  um `catch` imediato, isso derruba o processo por unhandled rejection antes de
  qualquer mensagem. A falha é capturada numa variável e reentregue: o `write`
  seguinte relança, e o `close()` relança se ninguém tiver visto antes.

- **`highWaterMark` do stringifier.** Nos tipos do pacote, `Options extends
  stream.TransformOptions`, então a opção é aceita — mas o `Stringifier` é
  construído com `writableObjectMode: true`, e nesse lado o `highWaterMark` conta
  **registros**, não bytes. Passar 64 KiB ali significaria 65 536 registros
  enfileirados. Por isso o ajuste foi só no lado legível
  (`readableHighWaterMark`) e no `createWriteStream`, ambos em
  `LIMITE_BUFFER_SAIDA`; o lado gravável fica no padrão em objetos.

- **Erro de fechamento não encobre o erro de leitura.** O `fechar()` devolve a
  falha como texto em vez de lançar — exceção dentro do `finally` substituiria a
  causa original. O relatório sai com o erro de leitura primeiro e o de
  fechamento depois, e os dois levam a `process.exitCode = 1`.

**Verificação**

| Checagem | Resultado |
| --- | --- |
| `npx tsc --noEmit` | limpo |
| Sample: linhas × resumo | 4 clubes / 7 jogadores — batem |
| Cabeçalhos × tabelas do pedido | iguais caractere a caractere |
| Encoding | sem BOM, zero `\r`, UTF-8 |
| Escape RFC 4180 | vírgula → aspas; `"` → `""`; quebra de linha → campo entre aspas |
| Clube com `players: []` (Avaí) | em `clubs.csv`, ausente de `players.csv` |
| Sobrescrita | arquivo de 1 M linhas substituído pela execução de 4 linhas |
| Falha de leitura (ENOENT) | erro original preservado, arquivos fechados, exit 1 |

No sample:

```
Resumo: 4 clube(s) lido(s), 2 ignorado(s) por campeonato, 0 linha(s) com erro.
Gerados: clubs.csv (4 linha(s)), players.csv (7 linha(s)).
Tempo: 0.01s | pico de memória (rss): 51.5 MB
```

O teste de escape, num arquivo temporário à parte (o `sample_clubes.jsonl` não
foi tocado):

```csv
ESC,"Clube, com virgula",Serie A,1900-01-01,"Cidade ""entre aspas""",SP,Brasil,"Estadio
com quebra",Zé,"Aspas"" e, virgula",a|b
```

**Memória**

Com 393 216 linhas o pico deu 124,6 MB, contra 48,5 MB no arquivo pequeno — e o
rss subia a cada relatório de progresso (98 → 110 → 124 MB). Isso não distingue
acúmulo de folga do coletor, então o teste foi refeito com **1 572 864 linhas**
(195 MB de entrada), 4× maior:

```
... 100000 linhas processadas (rss 101.6 MB)
... 800000 linhas processadas (rss 106.6 MB)
... 1500000 linhas processadas (rss 98.9 MB)

Resumo: 1048576 clube(s) lido(s), 524288 ignorado(s) por campeonato, 0 linha(s) com erro.
Gerados: clubs.csv (1048576 linha(s)), players.csv (1835008 linha(s)).
Tempo: 24.70s | pico de memória (rss): 114.4 MB
```

O rss oscila entre 98,7 e 114,4 MB e o pico ficou **abaixo** do da execução
menor — plano contra 4× a entrada, ou seja, a contrapressão chega ao laço
atravessando o `Stringifier` e nada é acumulado. A contagem bateu exata:
1 048 576 linhas em `clubs.csv` e 1 835 008 em `players.csv` (sem cabeçalho).

**Observação fora do escopo**

O Corinthians sai com `Id do Clube` vazio nos dois arquivos, e por consequência
os três jogadores dele ficam sem referência de clube. É comportamento das regras
de normalização/validação das fases anteriores, não algo introduzido aqui — mas,
se o `club_id` serve de chave de junção entre os dois CSVs, vale revisitar.

---

## 2. Exportação deste histórico

### Solicitação

> exporta a conversa dessa sessao em um arquivo fase-3-todo.md

### Resposta

Este arquivo, no mesmo formato de [fase-1.md](fase-1.md) e
[fase-2.md](fase-2.md).
