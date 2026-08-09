import { readJsonlFile } from "./reader.ts";
import { criarEscritor } from "./writer.ts";
import { ehClubeElegivel, validarClube } from "./clube.ts";
import { FILE_SOURCE, INTERVALO_PROGRESSO } from "./constants.ts";
import { mensagemDoErro } from "./helpers.ts";
import type { ClubeNormalizado } from "./models/clube.ts";

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
  let ignorados = 0;
  let invalidos = 0;
  let picoRss = 0;
  let falha = "";
  const inicio = performance.now();

  // A leitura em si pode falhar fora do JSON.parse: arquivo inexistente, sem
  // permissão, erro de disco, saída fechada no meio. Nesses casos o laço é
  // interrompido com mensagem clara e o resumo parcial ainda é impresso.
  try {
    const opcoes = { validate: validarClube, filter: ehClubeElegivel };

    for await (const resultado of readJsonlFile<ClubeNormalizado>(caminho, opcoes)) {
      if (resultado.ok) {
        // O clube é formatado, escrito e sai de escopo aqui: nada é acumulado
        // entre iterações, então o coletor libera o registro antes da próxima.
        await saida.write(formatarClube(resultado.line, resultado.value));
        lidos += 1;
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

    await saida.flush();
  } catch (cause) {
    falha = mensagemDoErro(cause);
    process.exitCode = 1;
  }

  picoRss = Math.max(picoRss, process.memoryUsage().rss);
  const segundos = (performance.now() - inicio) / 1000;

  if (falha !== "") {
    await log.write(`\nLeitura interrompida: ${falha}\n`);
  }

  await log.write(
    `\nResumo: ${lidos} clube(s) lido(s), ${ignorados} ignorado(s) por campeonato, ` +
    `${invalidos} linha(s) com erro.\n` +
    `Tempo: ${segundos.toFixed(2)}s | pico de memória (rss): ${mb(picoRss)} MB\n`,
  );
  await log.flush();
}

/**
 * Mapeia o registro para os campos de saída. Campos presentes no JSONL mas fora
 * dessa lista (titles, nationality, market_value) são ignorados de propósito.
 *
 * Todos os valores já chegam normalizados como texto, então não há conversão nem
 * fallback aqui: campo vazio é campo que faltava ou reprovou na validação.
 */
function formatarClube(line: number, clube: ClubeNormalizado): string {
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
    `  Apelido: ${clube.nickname}`,
    `  Cores: ${clube.colors}`,
  ];

  for (const jogador of clube.players) {
    linhas.push(
      ``,
      `  Jogador:`,
      `     Id do Clube: ${jogador.club_id}`,
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

/**
 * `node index.ts arquivo.jsonl | head` fecha o stdout antes do fim: sai limpo em
 * vez de estourar EPIPE. Erros de escrita de outra natureza são reportados e
 * encerram o processo com código 1 — lançar dentro do listener viraria
 * uncaughtException.
 *
 * A mensagem vai direto no stderr, sem passar pelo escritor com buffer: se a
 * saída está falhando, o fim normal do programa pode não acontecer e o texto
 * bufferizado nunca chegaria a ser descarregado.
 */
function ignorarPipeFechado(stream: NodeJS.WriteStream): void {
  stream.on("error", (erro: NodeJS.ErrnoException) => {
    if (erro.code === "EPIPE") process.exit(0);
    process.stderr.write(`\nErro na saída: ${mensagemDoErro(erro)}\n`);
    process.exitCode = 1;
  });
}

try {
  await main();
} catch (cause) {
  // Rede de segurança: nada deve chegar aqui, mas se chegar sai com mensagem
  // legível em vez de stack trace de promise rejeitada.
  process.stderr.write(`Erro inesperado: ${mensagemDoErro(cause)}\n`);
  process.exitCode = 1;
}
