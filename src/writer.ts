import { once } from "node:events";
import type { Writable } from "node:stream";

export type Escritor = {
  /**
   * Enfileira texto para saída. Retorna uma Promise só quando o buffer encheu —
   * quem chama deve dar `await` para respeitar a contrapressão do destino.
   */
  write(texto: string): void | Promise<void>;
  flush(): Promise<void>;
};

const LIMITE_PADRAO = 64 * 1024;

/**
 * Aqui o texto é agrupado em blocos de ~64 KiB (menos syscalls, mais vazão) e,
 * quando o destino sinaliza que está cheio, a escrita espera o `drain` antes de
 * continuar. Isso também segura o laço de leitura: o arquivo só avança no ritmo
 * em que a saída é consumida.
 */
export function criarEscritor(stream: Writable, limite: number = LIMITE_PADRAO): Escritor {
  let partes: string[] = [];
  let tamanho = 0;

  async function flush(): Promise<void> {
    if (tamanho === 0) return;

    const dados = partes.join("");
    partes = [];
    tamanho = 0;

    if (!stream.write(dados) && stream.writable) {
      await once(stream, "drain");
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
