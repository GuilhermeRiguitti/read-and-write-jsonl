# Histórico da conversa — fase 2

Continuação de [fase-1.md](fase-1.md). Registro da sessão de
desenvolvimento deste projeto (Claude Code, 09/08/2026), com as solicitações
feitas e as respostas dadas, na ordem em que aconteceram.

As solicitações estão transcritas exatamente como foram escritas. As respostas
reproduzem o que foi reportado ao final de cada etapa; a saída completa de
terminal aparece resumida nos trechos relevantes.

Os trechos de código citados são os do momento de cada etapa — arquivos podem ter
sido ajustados depois, em etapas seguintes.

---

## 1. Filtro por campeonato (Série A e Série B)

### Solicitação

> # Tarefa: filtro por campeonato (Série A e Série B)
>
> ## Objetivo
>
> Gerar dados apenas para clubes que disputam a **Série A** ou a **Série B**. Clubes de
> qualquer outro campeonato não entram na leitura.
>
> ## Onde o filtro fica
>
> Em `parseLine` (`src/reader.ts`), **depois do `JSON.parse` e antes do `validate`**, via
> um callback `filter` opcional em `ReadJsonlOptions`.
>
> Motivos, nesta ordem de importância:
>
> ## Implementação
>
> ### 1. `src/constants.ts`
>
> ```ts
> /** Só clubes destes campeonatos entram na leitura. */
> export const CAMPEONATOS_ACEITOS = new Set(["SERIE A", "SERIE B"]);
> ```
>
> ### 2. `src/helpers.ts`
>
> Adicionar `chaveDeTexto`: caixa alta, sem acento, espaços colapsados. O sample traz
> `"SERIE A"`, mas o arquivo real pode trazer `"Série A"`, `"série  a"` ou `" Serie B "`
> — comparar cru descartaria clube válido. Reaproveitar `normalizarTexto`, que já faz
> `trim` e trata não-string:
>
> ```ts
> export function chaveDeTexto(valor: unknown): string {
>   return normalizarTexto(valor)
>     .normalize("NFD")
>     .replace(/\p{Diacritic}/gu, "")
>     .replace(/\s+/g, " ")
>     .toUpperCase();
> }
> ```
>
> ### 3. `src/clube.ts`
>
> Adicionar `ehClubeElegivel(value: unknown): boolean`, exportada ao lado de
> `validarClube`, operando sobre o registro **bruto**.
> - Campeonato ausente, nulo ou vazio cai fora nao tem como sabeer se e A ou B, entao deve ficar de fora para evitar informacoes erradas
>
> ### 4. `src/reader.ts`
>
> - `ReadJsonlOptions<T>` ganha `filter?: (value: unknown, line: number) => boolean`.
> - Terceiro membro na união de resultado, porque "ignorado" não é sucesso nem falha:
>
> ```ts
> export type JsonlSkipped = { ok: false; skipped: true; line: number };
> ```
>
>   Ajustar `JsonlFailure` para carregar `skipped?: false` (ou outro discriminante), desde
>   que o `index.ts` separe os três casos sem ambiguidade de tipo.
> - Em `parseLine`, entre o `JSON.parse` e o `validate`: se houver `filter` e ele
>   retornar `false`, devolver o resultado "ignorado" sem chamar `validate`.
> - Atualizar o JSDoc de `readJsonlFile`: o `filter` roda antes da validação e linha
>   ignorada não conta como erro.
>
> ### 5. `src/index.ts`
>
> - Passar `filter: ehClubeElegivel` junto do `validate`.
> - Contar `ignorados` separado de `lidos` e `invalidos`.
> - Linha ignorada **não** vai para o stderr — não é erro e poluiria o log num arquivo
>   grande. Mas entra no contador de progresso junto com as outras.
> - Resumo final:
>
> ```
> Resumo: N clube(s) lido(s), M ignorado(s) por campeonato, K linha(s) com erro.
> ```
>
> ## Restrições
>
> - Comentários em português, no estilo do restante do código: explicar por que, não
>   o que a linha faz.
> - Não alterar `separarLinhas`.
> - Não quebrar o uso do reader sem `filter`: a opção é opcional e o comportamento atual
>   precisa ficar idêntico quando ela não é passada.
> - Garantir que no código atual registros mal formados ou incompletos (linha mal formada) ficam de fora de todas as validações, normalizações e outras acoes .

### Resposta

Implementado. Typecheck limpo (`npx tsc --noEmit`).

**O que mudou**

`src/constants.ts` — `CAMPEONATOS_ACEITOS` como `Set`, já na forma comparável
(caixa alta, sem acento).

`src/helpers.ts` — `chaveDeTexto`: reaproveita `normalizarTexto` (trim + trata
não-string), depois NFD/sem diacrítico, espaços colapsados, caixa alta.

`src/clube.ts` — `ehClubeElegivel` sobre o registro **bruto**: não-objeto sai
fora, campeonato vazio/nulo/ausente sai fora, o resto compara contra o `Set`.
Isso também zerou o `VAZIO` importado sem uso que estava no arquivo.

`src/reader.ts` — `JsonlSkipped = { ok: false; skipped: true; line }`,
`JsonlFailure` ganhou `skipped?: false` como discriminante, e
`ReadJsonlOptions` ganhou `filter?: LineFilter`. Em `parseLine` o filtro roda
entre o `JSON.parse` e o `validate`. `parseLine` passou a receber o objeto de
opções inteiro em vez de só o `validate`.

`src/index.ts` — `filter: ehClubeElegivel`, contador `ignorados` fora do stderr
mas dentro do progresso, e o resumo no formato pedido.

**Verificação**

No sample:

```
Resumo: 5 clube(s) lido(s), 1 ignorado(s) por campeonato, 0 linha(s) com erro.
```

3 Série A + 2 Série B lidos; a linha `"SEM CAMPEONATO"` ignorada.

Num arquivo de casos-limite montado à parte:

| Entrada | Resultado |
| --- | --- |
| `"Série A"`, `"  série   b  "` | lidos — acento, caixa e espaço extra não descartam |
| `championship` vazio / nulo / ausente | ignorado |
| `"SERIE C"` | ignorado |
| linha que não é objeto (`"nao e objeto"`) | ignorado |
| `colors` fora do formato, em clube elegível | **erro reportado** |
| JSON quebrado (`{ json quebrado`) | **erro reportado** |

```
Resumo: 2 clube(s) lido(s), 5 ignorado(s) por campeonato, 2 linha(s) com erro.
```

> A linha do `colors` fora do formato deixou de ser erro no ajuste manual da
> seção 2 — os números acima são os desta etapa.

Ou seja, o filtro não engoliu os erros de linhas que interessam. O campeonato sai
na impressão com a grafia original (`Campeonato: Série A`) — a normalização é só
para comparar.

**Duas decisões que o pedido deixava em aberto**

- **Linha mal formada é contada como "ignorado por campeonato"**, não como erro.
  Foi o que a restrição final pedia (ficar de fora de todas as validações), mas o
  rótulo do resumo fica impreciso nesse caso — um JSON que é `"nao e objeto"` some
  sem rastro. Para vê-las no stderr, o ajuste é `ehClubeElegivel` deixar não-objeto
  passar e o `validarClube` reprovar, como já faz.
- Com isso, a checagem `ehObjeto` em `validarClube` virou inalcançável no fluxo do
  `index.ts`. Mantida porque o reader continua utilizável sem `filter`, e aí ela
  volta a ser a única defesa.

---

## 2. Ajuste manual: formato torto de campo não descarta o registro

Etapa feita **manualmente, direto no código**, sem solicitação — documentada aqui
por mudar uma regra de negócio que as etapas anteriores tinham fixado no sentido
oposto (fase 1, seção 4: "`colors` presente mas não-lista segue como erro de
linha, não como campo vazio").

### O que mudou

O princípio novo está escrito no JSDoc do `validarClube`: **formato torto de um
campo custa aquele campo, nunca o registro**. Só uma coisa continua invalidando a
linha inteira — não ser um objeto JSON.

`src/helpers.ts`

- `normalizarLista(valor)` — perdeu o parâmetro `campo` e o `throw`. Lista virar
  ela mesma; objeto solto virar lista de um (registro único escrito fora da
  lista); qualquer outra coisa virar lista vazia.
- `normalizarListaTexto(valor)` — aceita o campo fora do formato de lista: valor
  único (`"preto"`) e vários já colados num texto (`"preto, branco"`) são
  aproveitados em vez de descartados. Só item sem representação escalar (objeto,
  lista aninhada) some, item a item.
- `separarTexto` — nova, privada: quebra o texto pelos separadores de entrada.
- `comoObjeto` — removida; o único uso saiu (ver `clube.ts` abaixo).

`src/constants.ts`

- `SEPARADOR_LISTA` passou de `", "` para `"|"`.
- `SEPARADORES_ENTRADA = /[,;|/]+/` — os separadores aceitos **na entrada**, para
  que `"preto, branco"` não vire um item só.

`src/clube.ts`

- `colors` e `players` chamam as helpers sem o nome do campo.
- `players` ganhou `.filter(ehObjeto)` antes do `map`: item que não é objeto sai
  da lista, em vez de virar um bloco de jogador com todos os campos vazios —
  comportamento que o `comoObjeto` produzia.

`sample_clubes.jsonl`

- Cruzeiro passou de `"SERIE A"` para `"SéRIE C"`, exercitando de uma vez os três
  eixos do `chaveDeTexto`: acento, caixa mista e campeonato recusado.

### Verificação

Typecheck limpo. No sample:

```
Resumo: 4 clube(s) lido(s), 2 ignorado(s) por campeonato, 0 linha(s) com erro.
```

4 lidos (2 Série A + 2 Série B), 2 ignorados (`"SéRIE C"` e `"SEM CAMPEONATO"`) —
o `"SéRIE C"` recusado pelo campeonato, não pela grafia. `Cores` agora sai como
`preto|branco`.

No mesmo arquivo de casos-limite da seção 1:

```
Resumo: 3 clube(s) lido(s), 5 ignorado(s) por campeonato, 1 linha(s) com erro.
```

Era `2 lidos / 2 erros`. A diferença é exatamente a linha com
`"colors":"nao e lista"`: antes descartada como erro, agora lida, com `colors`
valendo `nao e lista`. O JSON quebrado continua sendo erro.

