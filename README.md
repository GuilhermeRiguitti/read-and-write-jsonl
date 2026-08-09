# teste-tecnico

Leitura incremental de um arquivo JSONL de clubes, com normalização dos campos e
saída no console.

---

## Datas

### Formato aceito na entrada

Apenas dois formatos são aceitos:

| Entrada | Saída |
| --- | --- |
| `YYYY-MM-DD` | `YYYY-MM-DD` |
| `YYYY-MM-DDTHH:MM:SSZ` | `YYYY-MM-DD` |

O horário é aceito e descartado — a saída é sempre `YYYY-MM-DD`. Frações de
segundo (`T14:30:00.123Z`) também passam. Qualquer outra coisa resulta em
**campo vazio** (`""`).

