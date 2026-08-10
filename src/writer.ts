import { createWriteStream } from "node:fs";
import type { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { stringify, type ColumnOption } from "csv-stringify";
import { LIMITE_BUFFER_SAIDA } from "./constants.ts";
import { mensagemDoErro } from "./helpers.ts";

export type Escritor = {
  /**
   * Enfileira texto para saída. Retorna uma Promise só quando o buffer encheu —
   * quem chama deve dar `await` para respeitar a contrapressão do destino.
   */
  write(texto: string): void | Promise<void>;
  flush(): Promise<void>;
};

/**
 * Aqui o texto é agrupado até o `limite` informado (menos syscalls, mais vazão)
 * e, quando o destino sinaliza que está cheio, a escrita espera o `drain` antes
 * de continuar. Isso também segura o laço de leitura: o arquivo só avança no
 * ritmo em que a saída é consumida.
 *
 * O padrão de 64 KiB serve à saída de dados; quem escreve diagnóstico passa um
 * limite menor, para não deixar muito texto pendente em caso de interrupção.
 */
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
  /**
   * Enfileira um registro. Retorna uma Promise só quando o destino sinalizou que
   * está cheio — quem chama deve dar `await` para respeitar a contrapressão.
   */
  write(registro: T): void | Promise<void>;
  close(): Promise<void>;
};

/**
 * Escreve registros em um CSV, um objeto por linha.
 *
 * Quando o arquivo enche, o `pipeline` para de puxar do stringifier, o buffer
 * dele fecha e o `write` daqui devolve a Promise que segura o laço de leitura no
 * ritmo do disco.
 */
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

  // A falha é guardada em vez de ficar como rejeição solta, porque ela pode
  // acontecer no meio do laço, muito antes de alguém dar `await` na Promise: sem
  // o `catch`, o processo morreria de unhandled rejection sem mensagem.
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

    /**
     * Encerra o stringifier e espera o `pipeline` terminar.
     */
    async close(): Promise<void> {
      csv.end();
      await terminado;
      if (falha !== undefined) throw falha;
    },
  };
}

/**
 * Espera o destino liberar espaço, mas sem ficar preso para sempre: se o stream
 * fechar ou falhar antes do `drain`, rejeita para o erro subir e a execução
 * terminar com mensagem — em vez de a leitura travar em silêncio.
 *
 * Os listeners são removidos em qualquer um dos desfechos: com milhões de
 * registros, deixar listener pendurado a cada bloco vazaria memória.
 */
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
