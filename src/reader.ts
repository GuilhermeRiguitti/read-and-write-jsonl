import { createReadStream } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import type { JsonlResult, LineValidator, ReadJsonlOptions } from "./types.ts";
import { CHUNK_SIZE_PADRAO, MAX_LINE_LENGTH_PADRAO, RAW_PREVIEW_PADRAO } from "./constants.ts";

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
 */
export async function* readJsonlFile<T = unknown>(
  filePath: string,
  options: ReadJsonlOptions<T> = {},
): AsyncGenerator<JsonlResult<T>> {
  const stream = createReadStream(filePath, {
    highWaterMark: options.chunkSize ?? CHUNK_SIZE_PADRAO,
  });

  try {
    yield* readJsonlStream<T>(stream, options);
  } finally {
    // Fecha o descritor mesmo se quem consome interromper o laço no meio.
    stream.destroy();
  }
}

/** Mesma leitura incremental sobre qualquer stream (stdin, rede, gzip...). */
export async function* readJsonlStream<T = unknown>(
  source: AsyncIterable<Buffer | string>,
  options: ReadJsonlOptions<T> = {},
): AsyncGenerator<JsonlResult<T>> {
  const preview = options.rawPreviewLength ?? RAW_PREVIEW_PADRAO;

  for await (const linha of separarLinhas(source, options.maxLineLength ?? MAX_LINE_LENGTH_PADRAO, preview)) {
    if (linha.overflow) {
      yield {
        ok: false,
        line: linha.line,
        raw: linha.preview,
        reason: `linha excede o limite de ${options.maxLineLength ?? MAX_LINE_LENGTH_PADRAO} caracteres (${linha.chars} descartados)`,
      };
      continue;
    }

    if (linha.text.trim() === "") continue;
    yield parseLine(linha.text, linha.line, preview, options.validate);
  }
}

/**
 * Mesma lógica sobre linhas já em memória (string única ou lista de linhas).
 * Útil em testes; para arquivos grandes prefira `readJsonlFile`.
 */
export async function* readJsonlLines<T = unknown>(
  input: string | Iterable<string> | AsyncIterable<string>,
  options: ReadJsonlOptions<T> = {},
): AsyncGenerator<JsonlResult<T>> {
  const preview = options.rawPreviewLength ?? RAW_PREVIEW_PADRAO;
  const source = typeof input === "string" ? input.split(/\r?\n/) : input;

  let line = 0;
  for await (const raw of source) {
    line += 1;
    if (raw.trim() === "") continue;
    yield parseLine(raw, line, preview, options.validate);
  }
}

type LinhaBruta =
  | { line: number; overflow: false; text: string }
  | { line: number; overflow: true; chars: number; preview: string };

/**
 * Quebra o stream em linhas mantendo apenas o resto do bloco atual em memória.
 *
 * Ao contrário do `readline`, aplica um teto por linha: passando do limite, o
 * conteúdo é jogado fora na hora e o resto da linha é consumido sem acumular,
 * até a próxima quebra de linha.
 */
async function* separarLinhas(
  source: AsyncIterable<Buffer | string>,
  maxLineLength: number,
  previewLength: number,
): AsyncGenerator<LinhaBruta> {
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
    } else if (pendente.length > maxLineLength) {
      descartando = true;
      descartados = pendente.length;
      preview = pendente.slice(0, previewLength);
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

function parseLine<T>(
  raw: string,
  line: number,
  previewLength: number,
  validate?: LineValidator<T>,
): JsonlResult<T> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return { ok: false, line, raw: resumir(raw, previewLength), reason: `JSON inválido: ${messageOf(cause)}` };
  }

  if (!validate) {
    return { ok: true, line, value: parsed as T };
  }

  try {
    return { ok: true, line, value: validate(parsed, line) };
  } catch (cause) {
    return { ok: false, line, raw: resumir(raw, previewLength), reason: messageOf(cause) };
  }
}

/** Guarda só um trecho da linha inválida — o original é liberado em seguida. */
function resumir(raw: string, limite: number): string {
  const linha = raw.trim();
  return linha.length > limite ? `${linha.slice(0, limite)}...` : linha;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
