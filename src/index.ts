import { readJsonlFile } from "./reader.ts";
import { criarEscritor } from "./writer.ts";
import { validarClube } from "./clube.ts";
import type { Clube } from "./types.ts";
import { FILE_SOURCE, INTERVALO_PROGRESSO } from "./constants.ts";

async function main(): Promise<void> {
  const caminho = process.argv[2] ?? FILE_SOURCE;

  // Registros vão para o stdout; diagnóstico (progresso, erros, resumo) para o
  // stderr, para que a saída continue utilizável em pipe.
  const saida = criarEscritor(process.stdout);
  // Buffer menor no diagnóstico: menos texto pendente a perder se o processo
  // morrer, sem abrir mão do agrupamento das escritas.
  const log = criarEscritor(process.stderr, 4 * 1024);

  ignorarPipeFechado(process.stdout);

  await log.write(`Lendo JSONL: ${caminho}\n`);

  let lidos = 0;
  let invalidos = 0;
  let picoRss = 0;
  const inicio = performance.now();

  for await (const resultado of readJsonlFile<Clube>(caminho, { validate: validarClube })) {
    if (resultado.ok) {
      lidos += 1;
      // O clube é formatado, escrito e sai de escopo aqui: nada é acumulado
      // entre iterações, então o coletor libera o registro antes da próxima.
      await saida.write(formatarClube(resultado.line, resultado.value));
    } else {
      invalidos += 1;
      await log.write(
        `[linha ${resultado.line}] ERRO: ${resultado.reason}\n` +
        `[linha ${resultado.line}] conteúdo: ${resultado.raw}\n`,
      );
    }

    if ((lidos + invalidos) % INTERVALO_PROGRESSO === 0) {
      const rss = process.memoryUsage().rss;
      picoRss = Math.max(picoRss, rss);
      await log.write(`... ${lidos + invalidos} linhas processadas (rss ${mb(rss)} MB)\n`);
    }
  }

  await saida.flush();

  picoRss = Math.max(picoRss, process.memoryUsage().rss);
  const segundos = (performance.now() - inicio) / 1000;

  await log.write(
    `\nResumo: ${lidos} clube(s) lido(s), ${invalidos} linha(s) com erro.\n` +
    `Tempo: ${segundos.toFixed(2)}s | pico de memória (rss): ${mb(picoRss)} MB\n`,
  );
  await log.flush();
}

/**
 * Mapeia o registro para os campos de saída. Campos presentes no JSONL mas fora
 * dessa lista (titles, nationality, market_value) são ignorados de propósito.
 */
function formatarClube(line: number, clube: Clube): string {
  const linhas = [
    ``,
    `[linha ${line}] Clube:`,
    `  Id do Clube: ${clube.club_id}`,
    `  Nome: ${clube.name}`,
    `  Campeonato: ${clube.championship}`,
    `  Data de Fundação: ${clube.founding_date}`,
    `  Cidade: ${clube.city}`,
    `  Estado: ${clube.state}`,
    `  País: ${clube.country}`,
    `  Estádio: ${clube.stadium}`,
    `  Presidente: ${clube.president}`,
    `  Apelido: ${clube.nickname ?? "(sem apelido)"}`,
    `  Cores: ${clube.colors.join(", ")}`,
  ];

  for (const jogador of clube.players) {
    linhas.push(
      ``,
      `  Jogador:`,
      `     Id do Clube: ${clube.club_id}`,
      `     Id do Jogador: ${jogador.player_id}`,
      `     Nome: ${jogador.name}`,
      `     Idade: ${jogador.age}`,
      `     Gols: ${jogador.goals}`,
      `     Data de Estreia: ${jogador.debut_date}`,
      `     Posição: ${jogador.position}`,
      `     Número da Camisa: ${jogador.shirt_number}`,
    );
  }

  linhas.push(`================================`, ``);
  return linhas.join("\n");
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

/** `node index.ts arquivo.jsonl | head` não deve virar exceção. */
function ignorarPipeFechado(stream: NodeJS.WriteStream): void {
  stream.on("error", (erro: NodeJS.ErrnoException) => {
    if (erro.code === "EPIPE") process.exit(0);
    throw erro;
  });
}

await main();
