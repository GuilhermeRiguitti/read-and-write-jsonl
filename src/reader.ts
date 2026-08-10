import { createReadStream } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { LIMITE_TAMANHO_LINHA, TAMANHO_BLOCO_LEITURA } from "./constants.ts";

export type LinhaLida<T> = {
  ok: true;
  linha: number;
  valor: T;
};

export type LinhaInvalida = {
  ok: false;
  ignorada?: false;
  linha: number;
};

/** Descartada pelo filtro — distinto de linha inválida (JSON corrompido). */
export type LinhaIgnorada = { ok: false; ignorada: true; linha: number };

export type ResultadoDeLinha<T> = LinhaLida<T> | LinhaInvalida | LinhaIgnorada;

export type ValidadorDeLinha<T> = (valor: unknown) => T;
export type FiltroDeLinha = (valor: unknown) => boolean;

export type OpcoesDeLeitura<T> = {
  validar?: ValidadorDeLinha<T>;
  filtrar?: FiltroDeLinha;
};

type LinhaBruta =
  | { linha: number; excedeu: false; texto: string }
  | { linha: number; excedeu: true };

export async function* lerArquivoJsonl<T = unknown>(
  caminho: string,
  opcoes: OpcoesDeLeitura<T> = {},
): AsyncGenerator<ResultadoDeLinha<T>> {
  const arquivo = createReadStream(caminho, { highWaterMark: TAMANHO_BLOCO_LEITURA });

  try {
    yield* lerFluxoJsonl<T>(arquivo, opcoes);
  } finally {
    arquivo.destroy();
  }
}

async function* lerFluxoJsonl<T = unknown>(
  origem: AsyncIterable<Buffer | string>,
  opcoes: OpcoesDeLeitura<T> = {},
): AsyncGenerator<ResultadoDeLinha<T>> {
  for await (const bruta of separarLinhas(origem)) {
    if (bruta.excedeu) {
      yield { ok: false, linha: bruta.linha };
      continue;
    }

    if (bruta.texto.trim() === "") continue;
    yield interpretarLinha(bruta.texto, bruta.linha, opcoes);
  }
}

async function* separarLinhas(origem: AsyncIterable<Buffer | string>): AsyncGenerator<LinhaBruta> {
  const decoder = new StringDecoder("utf8");

  let pendente = "";
  let numero = 0;
  let primeiroBloco = true;
  let descartando = false;

  for await (const bloco of origem) {
    pendente += typeof bloco === "string" ? bloco : decoder.write(bloco);

    // Só remover BOM depois de ter conteúdo — bloco pode cair no meio de sequência UTF-8.
    if (primeiroBloco && pendente.length > 0) {
      if (pendente.charCodeAt(0) === 0xfeff) pendente = pendente.slice(1);
      primeiroBloco = false;
    }

    let inicio = 0;
    let quebra = pendente.indexOf("\n", inicio);

    while (quebra !== -1) {
      const texto = pendente.slice(inicio, quebra);
      inicio = quebra + 1;
      numero += 1;

      if (descartando) {
        yield { linha: numero, excedeu: true };
        descartando = false;
      } else {
        yield { linha: numero, excedeu: false, texto: removerCrFinal(texto) };
      }

      quebra = pendente.indexOf("\n", inicio);
    }

    pendente = inicio === 0 ? pendente : pendente.slice(inicio);

    if (descartando) {
      pendente = "";
    } else if (pendente.length > LIMITE_TAMANHO_LINHA) {
      descartando = true;
      pendente = "";
    }
  }

  pendente += decoder.end();

  if (descartando) {
    yield { linha: numero + 1, excedeu: true };
  } else if (pendente !== "") {
    yield { linha: numero + 1, excedeu: false, texto: removerCrFinal(pendente) };
  }
}

export function removerCrFinal(texto: string): string {
  return texto.endsWith("\r") ? texto.slice(0, -1) : texto;
}

export function interpretarLinha<T>(
  bruta: string,
  linha: number,
  opcoes: OpcoesDeLeitura<T>,
): ResultadoDeLinha<T> {
  const { validar, filtrar } = opcoes;
  let conteudo: unknown;

  try {
    conteudo = JSON.parse(bruta);
  } catch {
    return { ok: false, linha };
  }

  // Filtro antes do validador: registros descartados não pagam normalização nem viram erro.
  if (filtrar && !filtrar(conteudo)) {
    return { ok: false, ignorada: true, linha };
  }

  if (!validar) {
    return { ok: true, linha, valor: conteudo as T };
  }

  try {
    return { ok: true, linha, valor: validar(conteudo) };
  } catch {
    return { ok: false, linha };
  }
}
