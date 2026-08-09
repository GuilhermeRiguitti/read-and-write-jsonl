import { createReadStream } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { CHUNK_SIZE, MAX_LINE_LENGTH, RAW_PREVIEW_LENGTH } from "./constants.ts";
import { mensagemDoErro } from "./helpers.ts";

/** Linha lida e convertida com sucesso. */
export type JsonlOk<T> = {
  ok: true;
  line: number;
  value: T;
};

/** Linha incoerente: JSON inválido, fora do formato esperado ou grande demais. */
export type JsonlFailure = {
  ok: false;
  skipped?: false;
  line: number;
  raw: string;
  reason: string;
};

/**
 * Linha descartada pelo `filter`: não é sucesso (nada a entregar) nem falha
 * (o arquivo está correto, o registro é que não interessa). Merece um terceiro
 * caso para quem consome não ter de contá-la como erro.
 */
export type JsonlSkipped = { ok: false; skipped: true; line: number };

export type JsonlResult<T> = JsonlOk<T> | JsonlFailure | JsonlSkipped;

/**
 * Valida/converte o JSON já parseado de uma linha. Deve lançar quando o
 * conteúdo não fizer sentido: o leitor captura e reporta a linha como inválida.
 */
export type LineValidator<T> = (value: unknown, line: number) => T;

/**
 * Decide se a linha interessa. Retornando `false`, a linha é descartada sem
 * passar pelo validador — nem entra no custo de normalizar, nem no de reportar.
 */
export type LineFilter = (value: unknown, line: number) => boolean;

export type ReadJsonlOptions<T> = {
  validate?: LineValidator<T>;
  filter?: LineFilter;
};

/** Saída da tokenização interna, antes de virar JSON. */
type LinhaBruta =
  | { line: number; overflow: false; text: string }
  | { line: number; overflow: true; chars: number; preview: string };

/**
 * Lê um arquivo JSONL de forma incremental.
 *
 * O arquivo nunca é carregado inteiro: o disco é lido em blocos, cada linha
 * completa é emitida e imediatamente descartada do buffer. O consumo de memória
 * fica limitado a (bloco de leitura + a maior linha em andamento), independente
 * de o arquivo ter 6 ou 60 milhões de registros.
 *
 * Como é um async generator, o `for await` de quem consome também aplica
 * contrapressão: enquanto o registro atual está sendo processado, nada novo é
 * lido do disco.
 *
 * O `filter` opcional roda logo após o `JSON.parse`, antes da validação: a
 * linha recusada sai como `JsonlSkipped` e não conta como erro.
 */
export async function* readJsonlFile<T = unknown>(
  filePath: string,
  options: ReadJsonlOptions<T> = {},
): AsyncGenerator<JsonlResult<T>> {
  const stream = createReadStream(filePath, { highWaterMark: CHUNK_SIZE });

  try {
    yield* readJsonlStream<T>(stream, options);
  } finally {
    // Fecha o descritor mesmo se quem consome interromper o laço no meio.
    stream.destroy();
  }
}

/**
 * Etapa de leitura propriamente dita, separada da abertura do arquivo
 */
async function* readJsonlStream<T = unknown>(
  source: AsyncIterable<Buffer | string>,
  options: ReadJsonlOptions<T> = {},
): AsyncGenerator<JsonlResult<T>> {
  for await (const linha of separarLinhas(source)) {
    if (linha.overflow) {
      yield {
        ok: false,
        line: linha.line,
        raw: linha.preview,
        reason: `linha excede o limite de ${MAX_LINE_LENGTH} caracteres (${linha.chars} descartados)`,
      };
      continue;
    }

    if (linha.text.trim() === "") continue;
    yield parseLine(linha.text, linha.line, options);
  }
}

/**
 * Quebra o stream em linhas mantendo apenas o resto do bloco atual em memória.
 *
 * Ao contrário do `readline`, aplica um teto por linha: passando do limite, o
 * conteúdo é jogado fora na hora e o resto da linha é consumido sem acumular,
 * até a próxima quebra de linha.
 */
async function* separarLinhas(source: AsyncIterable<Buffer | string>): AsyncGenerator<LinhaBruta> {
  const decoder = new StringDecoder("utf8");

  let pendente = "";
  let line = 0;
  let primeiroChunk = true;

  // Estado do descarte de uma linha grande demais.
  let descartando = false;
  let descartados = 0;
  let preview = "";

  for await (const chunk of source) {
    pendente += typeof chunk === "string" ? chunk : decoder.write(chunk);

    if (primeiroChunk) {
      if (pendente.charCodeAt(0) === 0xfeff) pendente = pendente.slice(1); // BOM
      primeiroChunk = false;
    }

    let inicio = 0;
    let quebra = pendente.indexOf("\n", inicio);

    while (quebra !== -1) {
      const texto = pendente.slice(inicio, quebra);
      inicio = quebra + 1;
      line += 1;

      if (descartando) {
        yield { line, overflow: true, chars: descartados + texto.length, preview };
        descartando = false;
        descartados = 0;
        preview = "";
      } else {
        yield { line, overflow: false, text: semCarriageReturn(texto) };
      }

      quebra = pendente.indexOf("\n", inicio);
    }

    // Só o pedaço após a última quebra sobrevive ao bloco.
    pendente = inicio === 0 ? pendente : pendente.slice(inicio);

    if (descartando) {
      descartados += pendente.length;
      pendente = "";
    } else if (pendente.length > MAX_LINE_LENGTH) {
      descartando = true;
      descartados = pendente.length;
      preview = pendente.slice(0, RAW_PREVIEW_LENGTH);
      pendente = "";
    }
  }

  pendente += decoder.end();

  // Última linha, quando o arquivo não termina com quebra de linha.
  if (descartando) {
    yield { line: line + 1, overflow: true, chars: descartados + pendente.length, preview };
  } else if (pendente !== "") {
    yield { line: line + 1, overflow: false, text: semCarriageReturn(pendente) };
  }
}

function semCarriageReturn(texto: string): string {
  return texto.endsWith("\r") ? texto.slice(0, -1) : texto;
}

function parseLine<T>(raw: string, line: number, options: ReadJsonlOptions<T>): JsonlResult<T> {
  const { validate, filter } = options;
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return { ok: false, line, raw: resumir(raw), reason: `JSON inválido: ${mensagemDoErro(cause)}` };
  }

  // O filtro vem antes do validador de propósito: o que não interessa não paga
  // o custo de ser normalizado nem corre o risco de ser reportado como erro.
  if (filter && !filter(parsed, line)) {
    return { ok: false, skipped: true, line };
  }

  if (!validate) {
    return { ok: true, line, value: parsed as T };
  }

  try {
    return { ok: true, line, value: validate(parsed, line) };
  } catch (cause) {
    return { ok: false, line, raw: resumir(raw), reason: mensagemDoErro(cause) };
  }
}

/** Guarda só um trecho da linha inválida — o original é liberado em seguida. */
function resumir(raw: string): string {
  const linha = raw.trim();
  return linha.length > RAW_PREVIEW_LENGTH ? `${linha.slice(0, RAW_PREVIEW_LENGTH)}...` : linha;
}
