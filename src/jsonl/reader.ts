import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/** Linha lida e convertida com sucesso. */
export type JsonlOk<T> = {
  ok: true;
  /** Número da linha no arquivo, começando em 1. */
  line: number;
  value: T;
};

/** Linha incoerente: JSON inválido ou fora do formato esperado. */
export type JsonlFailure = {
  ok: false;
  line: number;
  /** Conteúdo bruto da linha, útil para o log de erro. */
  raw: string;
  reason: string;
};

export type JsonlResult<T> = JsonlOk<T> | JsonlFailure;

/**
 * Valida/converte o JSON já parseado de uma linha.
 * Deve lançar (ou retornar um erro) quando o conteúdo não fizer sentido.
 */
export type LineValidator<T> = (value: unknown, line: number) => T;

export type ReadJsonlOptions<T> = {
  validate?: LineValidator<T>;
  encoding?: BufferEncoding;
};

/**
 * Lê um arquivo JSONL linha a linha, sem carregar tudo em memória.
 *
 * Cada linha vira um resultado: `ok: true` com o valor, ou `ok: false` com o
 * motivo. Nenhuma linha inválida interrompe a leitura — quem consome decide o
 * que fazer com a falha. Linhas em branco são ignoradas.
 */
export async function* readJsonlFile<T = unknown>(
  filePath: string,
  options: ReadJsonlOptions<T> = {},
): AsyncGenerator<JsonlResult<T>> {
  const stream = createReadStream(filePath, { encoding: options.encoding ?? "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  let line = 0;
  for await (const raw of lines) {
    line += 1;
    if (raw.trim() === "") continue;
    yield parseLine(raw, line, options.validate);
  }
}

/**
 * Mesma lógica da leitura de arquivo, mas sobre uma lista de linhas já em
 * memória (string única ou array de linhas).
 */
export async function* readJsonlLines<T = unknown>(
  input: string | Iterable<string> | AsyncIterable<string>,
  options: ReadJsonlOptions<T> = {},
): AsyncGenerator<JsonlResult<T>> {
  const source = typeof input === "string" ? input.split(/\r?\n/) : input;

  let line = 0;
  for await (const raw of source) {
    line += 1;
    if (raw.trim() === "") continue;
    yield parseLine(raw, line, options.validate);
  }
}

function parseLine<T>(raw: string, line: number, validate?: LineValidator<T>): JsonlResult<T> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return { ok: false, line, raw, reason: `JSON inválido: ${messageOf(cause)}` };
  }

  if (!validate) {
    return { ok: true, line, value: parsed as T };
  }

  try {
    return { ok: true, line, value: validate(parsed, line) };
  } catch (cause) {
    return { ok: false, line, raw, reason: messageOf(cause) };
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
