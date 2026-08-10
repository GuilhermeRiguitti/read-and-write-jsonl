import { stat } from "node:fs/promises";
import { lerArquivoJsonl } from "./reader.ts";
import { criarEscritor, criarEscritorCsv, type Escritor, type EscritorCsv } from "./writer.ts";
import { ehClubeElegivel, validarClube } from "./clube.ts";
import {
  ARQUIVO_CLUBES,
  ARQUIVO_JOGADORES,
  COLUNAS_CLUBES,
  COLUNAS_JOGADORES,
  INTERVALO_PROGRESSO,
} from "./constants.ts";
import { mensagemDoErro } from "./helpers.ts";
import type { ClubeNormalizado } from "./models/clube.ts";
import type { JogadorNormalizado } from "./models/jogador.ts";

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
  const caminho = process.argv[2]?.trim();
  const log = criarEscritor(process.stderr);

  if (caminho === undefined || caminho === "") {
    await log.write("Uso: node dist/index.js <caminho-do-arquivo.jsonl>\n");
    await log.flush();
    process.exitCode = 1;
    return;
  }

  await log.write(`Lendo JSONL: ${caminho}\n`);

  // createWriteStream trunca na abertura — conferir a entrada antes evita apagar CSVs válidos.
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

  try {
    await converter(caminho, { clubes, jogadores, log }, contadores);
  } catch (cause) {
    falha = mensagemDoErro(cause);
    process.exitCode = 1;
  } finally {
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

async function conferirEntrada(caminho: string): Promise<void> {
  const info = await stat(caminho);
  if (!info.isFile()) throw new Error(`${caminho} não é um arquivo`);
}

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
      contadores.ignorados += 1;
    } else {
      contadores.invalidos += 1;
    }

    const processadas = contadores.clubesEscritos + contadores.ignorados + contadores.invalidos;
    if (processadas % INTERVALO_PROGRESSO === 0) {
      const rss = process.memoryUsage().rss;
      contadores.picoRss = Math.max(contadores.picoRss, rss);
      await log.write(`... ${processadas} linhas processadas (rss ${mb(rss)} MB)\n`);
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
  process.stderr.write(`Erro inesperado: ${mensagemDoErro(cause)}\n`);
  process.exitCode = 1;
}
