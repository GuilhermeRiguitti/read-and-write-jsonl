import type { Writable } from "node:stream";
import { LIMITE_BUFFER_SAIDA } from "./constants.ts";

export type Escritor = {
  /**
   * Enfileira texto para saída. Retorna uma Promise só quando o buffer encheu —
   * quem chama deve dar `await` para respeitar a contrapressão do destino.
   */
  write(texto: string): void | Promise<void>;
  flush(): Promise<void>;
};

/**
 * Aqui o texto é agrupado em blocos de ~64 KiB (menos syscalls, mais vazão) e,
 * quando o destino sinaliza que está cheio, a escrita espera o `drain` antes de
 * continuar. Isso também segura o laço de leitura: o arquivo só avança no ritmo
 * em que a saída é consumida.
 */
export function criarEscritor(stream: Writable, limite: number = LIMITE_BUFFER_SAIDA): Escritor {
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
      if (tamanho >= limite) return flush();
      return undefined;
    },
    flush,
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
