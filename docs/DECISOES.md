# Decisões de design

Pontos em que o enunciado deixava margem, e o critério adotado.

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
| `Id do Clube` | `club_id` do clube |
| `Id do Jogador` | `players[].player_id` |
| `Nome` | `players[].name` |
| `Idade` | `players[].age` |
| `Gols` | `players[].goals` |
| `Data de Estreia` | `players[].debut_date` |
| `Posição` | `players[].position` |
| `Número da Camisa` | `players[].shirt_number` |

Campos como `titles`, `nationality` e `market_value` são descartados.

**Formato.** UTF-8, sem BOM, cabeçalho, vírgula, `\n` como fim de registro.
Escaping RFC 4180 via `csv-stringify`.

---

## 1. Datas: formato de entrada fixo

| Entrada | Saída |
| --- | --- |
| `1910-09-01` | `1910-09-01` |
| `1910-09-01T14:30:00Z` | `1910-09-01` |
| qualquer outro formato | *(vazio)* |

Formatos ambíguos (`03/04/2024`) são rejeitados de propósito: escolher uma
interpretação gravaria data plausível e errada. Datas com offset (`-03:00`)
também ficam de fora.

A validação (`normalizarData`) tem duas etapas — regex e calendário. A saída é
montada a partir dos grupos capturados, **nunca** a partir de `Date`.

---

## 2. `club_id` ausente invalida o registro

Sem `club_id`, jogadores ficariam órfãos em `players.csv`. Clube sem id é
contado como erro e descartado. `player_id` ausente só vira campo vazio.

---

## 3. Linha malformada ≠ ignorada por campeonato

JSON inválido ou objeto incoerente entra no contador de **erro**. Filtro de
campeonato tem contador separado.

---

## 4. Diagnóstico sem log linha a linha

Em base grande, listar cada registro recusado afogaria o stderr. O resumo final
traz contadores; `LinhaInvalida` carrega só o número da linha.

---

## 5. Filtro de campeonato tolerante a variações de texto

Após normalizar acento, caixa e espaços, o texto precisa conter `SERIE A` ou
`SERIE B` como palavra inteira (`\b`). Isso aceita `"Campeonato Brasileiro
Série A"` e rejeita `"SERIE C"` ou `"SERIE AUXILIAR"`. O valor gravado no CSV é
o original do JSON.

---

## 6. Campo fora de formato custa o campo, não o registro

`colors` que não é lista vira campo vazio (ou escalar aproveitado), não erro de
linha. Mesma regra para outros campos escalares.

---

## Robustez e volume

- Leitura em blocos de 256 KiB; teto de 8 MiB por linha.
- Nada acumulado entre iterações; contrapressão de ponta a ponta.
- `JSON.parse` e validação sob `try/catch` por linha.

### Testes

- **`helpers.test.ts`** — normalizações, datas, listas.
- **`clube.test.ts`** — filtro, validação, mapeamento.
- **`reader.test.ts`** — leitura incremental, CRLF, BOM, teto por linha.
- **`e2e.test.ts`** — pipeline completo contra o sample versionado.

---

## Idioma do código

Comentários e documentação em português. Chaves do JSON (`club_id`, `players`…)
permanecem em inglês, espelhando a entrada.
