# Simplificar buffer do log no stderr

[← todas as sessões](README.md)

Sessão que remove o buffer customizado de 4 KiB no `stderr`. O diagnóstico já
ficou enxuto depois das fases anteriores; a visibilidade durante a execução vem
do `flush()` explícito no progresso, não do tamanho do buffer.

| | |
| --- | --- |
| Início | 10/08/2026, 09:55 |
| Solicitações | 1 |
| Ferramentas | leitura de código, edição |

**Como ler.** Solicitações e respostas estão na íntegra, na ordem em que
aconteceram.

---

### 👤 Solicitação 1 — 10/08 09:55

> Simplificar buffer do log no stderr
>
> Contexto
> Hoje o log usa buffer menor que o padrão:
> `const log = criarEscritor(process.stderr, 4 * 1024);`
> Isso foi pensado quando o stderr recebia muitas mensagens de erro por linha.
> Depois da mudança, o diagnóstico ficou enxuto:
> - 1 linha inicial
> - progresso a cada 100k linhas (com `flush()` explícito)
> - resumo final (com `flush()` no fim)
> - erros pontuais (entrada inválida, falha na leitura/fechamento)
>
> Nenhum desses fluxos enche 4 KiB, muito menos 64 KiB. O que garante
> visibilidade durante a execução é o `await log.flush()` no progresso — não o
> tamanho do buffer.
>
> Exportar sessao em arquivo para `docs/conversa-ia/`

### 🤖 Resposta 1

O buffer de 4 KiB no `stderr` era um remanescente de quando cada linha inválida
ia para o log. Depois que os erros passaram a ser só contados no resumo, esse
tamanho menor não traz benefício: nenhum fluxo de diagnóstico enche 4 KiB, e o
que mantém o progresso visível durante a execução é o `await log.flush()` a cada
100k linhas — não o limite do buffer.

**Alteração**

Em `src/index.ts`, o log volta ao padrão do `criarEscritor` (64 KiB via
`LIMITE_BUFFER_SAIDA`):

```diff
-  // Buffer menor no diagnóstico: menos texto pendente a perder se o processo
-  // morrer, sem abrir mão do agrupamento das escritas.
-  const log = criarEscritor(process.stderr, 4 * 1024);
+  const log = criarEscritor(process.stderr);
```

O comentário sobre buffer menor foi removido junto: não descreve mais o
comportamento do programa.

**O que não muda**

- `await log.flush()` no progresso (linha ~161) e no resumo final (`relatar`)
- Contagem de inválidos/ignorados sem log linha a linha
- Contrato de contrapressão do `criarEscritor` no stdout/CSV
