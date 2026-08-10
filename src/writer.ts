import { createWriteStream } from "node:fs";
import type { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { stringify, type ColumnOption } from "csv-stringify";
import { LIMITE_BUFFER_SAIDA } from "./constants.ts";
import { mensagemDoErro } from "./helpers.ts";

export type Escritor = {
  write(texto: string): void | Promise<void>;
  flush(): Promise<void>;
};

export function criarEscritor(stream: Writable): Escritor {
  let partes: string[] = [];
  let tamanho = 0;

  async function flush(): Promise<void> {
    if (tamanho === 0) return;

    const dados = partes.join("");
    partes = [];
    tamanho = 0;

    if (!stream.write(dados) && stream.writable) {
      await esperarDrain(stream);
    }
  }

  return {
    write(texto: string): void | Promise<void> {
      partes.push(texto);
      tamanho += texto.length;
      if (tamanho >= LIMITE_BUFFER_SAIDA) return flush();
      return undefined;
    },
    flush,
  };
}

export type EscritorCsv<T> = {
  write(registro: T): void | Promise<void>;
  close(): Promise<void>;
};

export function criarEscritorCsv<T>(
  caminho: string,
  colunas: ReadonlyArray<string | ColumnOption>,
): EscritorCsv<T> {
  const arquivo = createWriteStream(caminho, { highWaterMark: LIMITE_BUFFER_SAIDA });
  const csv = stringify({
    header: true,
    columns: colunas,
    readableHighWaterMark: LIMITE_BUFFER_SAIDA,
  });

  // Guarda falha do pipeline para não virar unhandled rejection no meio do laço.
  let falha: Error | undefined;
  const terminado = pipeline(csv, arquivo).catch((cause: unknown) => {
    falha = cause instanceof Error ? cause : new Error(mensagemDoErro(cause));
  });

  return {
    write(registro: T): void | Promise<void> {
      if (falha !== undefined) throw falha;
      if (csv.write(registro)) return undefined;
      return esperarDrain(csv);
    },

    async close(): Promise<void> {
      csv.end();
      await terminado;
      if (falha !== undefined) throw falha;
    },
  };
}

function esperarDrain(stream: Writable): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const limpar = (): void => {
      stream.off("drain", aoDrain);
      stream.off("close", aoFechar);
      stream.off("error", aoFalhar);
    };

    const aoDrain = (): void => {
      limpar();
      resolve();
    };

    const aoFechar = (): void => {
      limpar();
      reject(new Error("a saída foi fechada antes de todo o conteúdo ser escrito"));
    };

    const aoFalhar = (erro: Error): void => {
      limpar();
      reject(erro);
    };

    stream.once("drain", aoDrain);
    stream.once("close", aoFechar);
    stream.once("error", aoFalhar);
  });
}
