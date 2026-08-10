import { readJsonlFile } from "./reader.ts";
import { criarEscritor, criarEscritorCsv, type EscritorCsv } from "./writer.ts";
import { ehClubeElegivel, validarClube } from "./clube.ts";
import {
  ARQUIVO_CLUBES,
  ARQUIVO_JOGADORES,
  COLUNAS_CLUBES,
  COLUNAS_JOGADORES,
  FILE_SOURCE,
  INTERVALO_PROGRESSO,
} from "./constants.ts";
import { mensagemDoErro } from "./helpers.ts";
import type { ClubeNormalizado } from "./models/clube.ts";
import type { JogadorNormalizado } from "./models/jogador.ts";

async function main(): Promise<void> {
  const caminho = process.argv[2] ?? FILE_SOURCE;

  // Registros vão para os CSVs; diagnóstico (progresso, erros, resumo) para o
  // stderr, para que a saída em arquivo não se misture com o relatório.
  //
  // Buffer menor no diagnóstico: menos texto pendente a perder se o processo
  // morrer, sem abrir mão do agrupamento das escritas.
  const log = criarEscritor(process.stderr, 4 * 1024);

  await log.write(`Lendo JSONL: ${caminho}\n`);

  const clubes = criarEscritorCsv<ClubeNormalizado>(ARQUIVO_CLUBES, COLUNAS_CLUBES);
  const jogadores = criarEscritorCsv<JogadorNormalizado>(ARQUIVO_JOGADORES, COLUNAS_JOGADORES);

  let lidos = 0;
  let ignorados = 0;
  let invalidos = 0;
  let jogadoresEscritos = 0;
  let picoRss = 0;
  let falha = "";
  const falhasAoFechar: string[] = [];
  const inicio = performance.now();

  // A leitura em si pode falhar fora do JSON.parse: arquivo inexistente, sem
  // permissão, erro de disco, saída fechada no meio. Nesses casos o laço é
  // interrompido com mensagem clara e o resumo parcial ainda é impresso.
  try {
    const opcoes = { validate: validarClube, filter: ehClubeElegivel };

    for await (const resultado of readJsonlFile<ClubeNormalizado>(caminho, opcoes)) {
      if (resultado.ok) {
        // O clube é escrito e sai de escopo aqui: nada é acumulado entre
        // iterações, então o coletor libera o registro antes da próxima. Os
        // jogadores saem do mesmo objeto, na mesma iteração — não há segunda
        // passada pelo arquivo nem lista guardada para o fim.
        await clubes.write(resultado.value);
        lidos += 1;

        for (const jogador of resultado.value.players) {
          await jogadores.write(jogador);
          jogadoresEscritos += 1;
        }
      } else if (resultado.skipped) {
        // Clube de outro campeonato não é erro: fica só no contador, porque num
        // arquivo grande a maioria das linhas cairia aqui e afogaria o stderr.
        ignorados += 1;
      } else {
        invalidos += 1;
        await log.write(
          `[linha ${resultado.line}] ERRO: ${resultado.reason}\n` +
          `[linha ${resultado.line}] conteúdo: ${resultado.raw}\n`,
        );
      }

      if ((lidos + ignorados + invalidos) % INTERVALO_PROGRESSO === 0) {
        const rss = process.memoryUsage().rss;
        picoRss = Math.max(picoRss, rss);
        await log.write(
          `... ${lidos + ignorados + invalidos} linhas processadas (rss ${mb(rss)} MB)\n`,
        );
      }
    }
  } catch (cause) {
    falha = mensagemDoErro(cause);
    process.exitCode = 1;
  } finally {
    // Fecha os dois mesmo depois de uma falha na leitura: assim os arquivos
    // ficam fechados e válidos até onde a leitura chegou.
    const resultados = await Promise.all([
      fechar(ARQUIVO_CLUBES, clubes),
      fechar(ARQUIVO_JOGADORES, jogadores),
    ]);
    falhasAoFechar.push(...resultados.filter((problema) => problema !== ""));
  }

  if (falhasAoFechar.length > 0) process.exitCode = 1;

  picoRss = Math.max(picoRss, process.memoryUsage().rss);
  const segundos = (performance.now() - inicio) / 1000;

  if (falha !== "") {
    await log.write(`\nLeitura interrompida: ${falha}\n`);
  }

  // Depois do erro de leitura, nunca no lugar dele: fechar um arquivo já
  // interrompido costuma falhar por consequência, e a causa é a de cima.
  for (const problema of falhasAoFechar) {
    await log.write(`${problema}\n`);
  }

  await log.write(
    `\nResumo: ${lidos} clube(s) lido(s), ${ignorados} ignorado(s) por campeonato, ` +
    `${invalidos} linha(s) com erro.\n` +
    `Gerados: ${ARQUIVO_CLUBES} (${lidos} linha(s)), ` +
    `${ARQUIVO_JOGADORES} (${jogadoresEscritos} linha(s)).\n` +
    `Tempo: ${segundos.toFixed(2)}s | pico de memória (rss): ${mb(picoRss)} MB\n`,
  );
  await log.flush();
}

/**
 * Fecha um escritor devolvendo a falha como texto em vez de lançar: o
 * fechamento roda em `finally`, e uma exceção aqui substituiria o erro de
 * leitura que trouxe o programa até este ponto.
 */
async function fechar(nome: string, escritor: Pick<EscritorCsv<never>, "close">): Promise<string> {
  try {
    await escritor.close();
    return "";
  } catch (cause) {
    return `\nFalha ao fechar ${nome}: ${mensagemDoErro(cause)}`;
  }
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

try {
  await main();
} catch (cause) {
  // Rede de segurança: nada deve chegar aqui, mas se chegar sai com mensagem
  // legível em vez de stack trace de promise rejeitada.
  process.stderr.write(`Erro inesperado: ${mensagemDoErro(cause)}\n`);
  process.exitCode = 1;
}
