import { stat } from "node:fs/promises";
import { lerArquivoJsonl } from "./reader.ts";
import { criarEscritor, criarEscritorCsv, type Escritor, type EscritorCsv } from "./writer.ts";
import { ehClubeElegivel, validarClube } from "./clube.ts";
import {
  ARQUIVO_CLUBES,
  ARQUIVO_ENTRADA_PADRAO,
  ARQUIVO_JOGADORES,
  COLUNAS_CLUBES,
  COLUNAS_JOGADORES,
  INTERVALO_PROGRESSO,
} from "./constants.ts";
import { mensagemDoErro } from "./helpers.ts";
import type { ClubeNormalizado } from "./models/clube.ts";
import type { JogadorNormalizado } from "./models/jogador.ts";

/**
 * O que a execução produziu, para o relatório final.
 *
 * `clubesEscritos` conta o que chegou ao CSV, não o que foi lido: as linhas
 * recusadas pelo filtro e as inválidas entram nos outros dois contadores, e a
 * soma dos três é o total de linhas do arquivo.
 */
type Contadores = {
  clubesEscritos: number;
  ignorados: number;
  invalidos: number;
  jogadoresEscritos: number;
  picoRss: number;
};

type Destinos = {
  clubes: EscritorCsv<ClubeNormalizado>;
  jogadores: EscritorCsv<JogadorNormalizado>;
  log: Escritor;
};

async function main(): Promise<void> {
  const caminho = process.argv[2] ?? ARQUIVO_ENTRADA_PADRAO;

  // Registros vão para os CSVs; diagnóstico (progresso, erros, resumo) para o
  // stderr, para que a saída em arquivo não se misture com o relatório.
  const log = criarEscritor(process.stderr);

  await log.write(`Lendo JSONL: ${caminho}\n`);

  // A entrada é conferida ANTES de abrir os CSVs porque `createWriteStream`
  // trunca o arquivo já na abertura: um caminho errado na linha de comando
  // apagaria o resultado da execução anterior e deixaria dois arquivos só com
  // cabeçalho no lugar dele.
  try {
    await conferirEntrada(caminho);
  } catch (cause) {
    await log.write(`\nEntrada inválida: ${mensagemDoErro(cause)}\n`);
    await log.flush();
    process.exitCode = 1;
    return;
  }

  const clubes = criarEscritorCsv<ClubeNormalizado>(ARQUIVO_CLUBES, COLUNAS_CLUBES);
  const jogadores = criarEscritorCsv<JogadorNormalizado>(ARQUIVO_JOGADORES, COLUNAS_JOGADORES);

  const contadores: Contadores = {
    clubesEscritos: 0,
    ignorados: 0,
    invalidos: 0,
    jogadoresEscritos: 0,
    picoRss: 0,
  };
  let falha = "";
  const falhasAoFechar: string[] = [];
  const inicio = performance.now();

  // A leitura em si pode falhar fora do JSON.parse: arquivo inexistente, sem
  // permissão, erro de disco, saída fechada no meio. Nesses casos o laço é
  // interrompido com mensagem clara e o resumo parcial ainda é impresso.
  try {
    await converter(caminho, { clubes, jogadores, log }, contadores);
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

  contadores.picoRss = Math.max(contadores.picoRss, process.memoryUsage().rss);

  await relatar(log, {
    contadores,
    falha,
    falhasAoFechar,
    segundos: (performance.now() - inicio) / 1000,
  });
}

/**
 * Confere que o caminho recebido dá para ler antes de qualquer escrita.
 *
 * Não substitui o `try/catch` da leitura — o arquivo pode sumir ou falhar depois
 * daqui —, mas cobre o caso comum (caminho errado, pasta no lugar do arquivo)
 * enquanto ainda dá para desistir sem tocar na saída anterior.
 */
async function conferirEntrada(caminho: string): Promise<void> {
  const info = await stat(caminho);
  if (!info.isFile()) throw new Error(`${caminho} não é um arquivo`);
}

/**
 * Laço central: uma passada pelo arquivo, escrevendo os dois CSVs.
 *
 * Cada clube é lido, escrito e sai de escopo na mesma iteração, junto com seus
 * jogadores — não há acúmulo entre iterações nem segunda passada pelo arquivo, e
 * o `await` das escritas é o que segura a leitura no ritmo do disco.
 */
async function converter(
  caminho: string,
  { clubes, jogadores, log }: Destinos,
  contadores: Contadores,
): Promise<void> {
  const opcoes = { validar: validarClube, filtrar: ehClubeElegivel };

  for await (const resultado of lerArquivoJsonl<ClubeNormalizado>(caminho, opcoes)) {
    if (resultado.ok) {
      await clubes.write(resultado.valor);
      contadores.clubesEscritos += 1;

      for (const jogador of resultado.valor.players) {
        await jogadores.write(jogador);
        contadores.jogadoresEscritos += 1;
      }
    } else if (resultado.ignorada) {
      // Clube de outro campeonato não é erro: entra num contador separado, para
      // não se misturar com dado corrompido no resumo.
      contadores.ignorados += 1;
    } else {
      // Nem a linha inválida nem a recusada pelo filtro vão para o stderr: numa
      // base grande as duas seriam muitas, e o relatório linha a linha afogaria
      // o console. As duas aparecem contadas no resumo do fim da execução.
      contadores.invalidos += 1;
    }

    const processadas = contadores.clubesEscritos + contadores.ignorados + contadores.invalidos;
    if (processadas % INTERVALO_PROGRESSO === 0) {
      const rss = process.memoryUsage().rss;
      contadores.picoRss = Math.max(contadores.picoRss, rss);
      await log.write(`... ${processadas} linhas processadas (rss ${mb(rss)} MB)\n`);
      // Progresso só serve se aparecer durante a execução. Sem este flush ele
      // ficaria retido no buffer do log até o fim — numa base grande, seriam
      // minutos sem sinal nenhum de que o programa avança.
      await log.flush();
    }
  }
}

type Relatorio = {
  contadores: Contadores;
  falha: string;
  falhasAoFechar: string[];
  segundos: number;
};

async function relatar(log: Escritor, relatorio: Relatorio): Promise<void> {
  const { contadores, falha, falhasAoFechar, segundos } = relatorio;

  if (falha !== "") {
    await log.write(`\nLeitura interrompida: ${falha}\n`);
  }

  // Depois do erro de leitura, nunca no lugar dele: fechar um arquivo já
  // interrompido costuma falhar por consequência, e a causa é a de cima.
  for (const problema of falhasAoFechar) {
    await log.write(`${problema}\n`);
  }

  await log.write(
    `\nResumo: ${contadores.clubesEscritos} clube(s) gravado(s), ` +
    `${contadores.ignorados} ignorado(s) por campeonato, ` +
    `${contadores.invalidos} linha(s) com erro.\n` +
    `Gerados: ${ARQUIVO_CLUBES} (${contadores.clubesEscritos} linha(s)), ` +
    `${ARQUIVO_JOGADORES} (${contadores.jogadoresEscritos} linha(s)).\n` +
    `Tempo: ${segundos.toFixed(2)}s | pico de memória (rss): ${mb(contadores.picoRss)} MB\n`,
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
