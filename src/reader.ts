import { createReadStream } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import {
  LIMITE_TAMANHO_LINHA,
  TAMANHO_BLOCO_LEITURA,
  TAMANHO_TRECHO_ERRO,
} from "./constants.ts";
import { mensagemDoErro } from "./helpers.ts";

/** Linha lida e convertida com sucesso. */
export type LinhaLida<T> = {
  ok: true;
  linha: number;
  valor: T;
};

/** Linha incoerente: JSON inválido, fora do formato esperado ou grande demais. */
export type LinhaInvalida = {
  ok: false;
  ignorada?: false;
  linha: number;
  trecho: string;
  motivo: string;
};

/**
 * Linha descartada pelo `filtrar`: não é sucesso (nada a entregar) nem falha
 * (o arquivo está correto, o registro é que não interessa). Merece um terceiro
 * caso para quem consome não ter de contá-la como erro.
 */
export type LinhaIgnorada = { ok: false; ignorada: true; linha: number };

export type ResultadoDeLinha<T> = LinhaLida<T> | LinhaInvalida | LinhaIgnorada;

/**
 * Valida/converte o JSON já parseado de uma linha. Deve lançar quando o
 * conteúdo não fizer sentido: o leitor captura e reporta a linha como inválida.
 */
export type ValidadorDeLinha<T> = (valor: unknown, linha: number) => T;

/**
 * Decide se a linha interessa. Retornando `false`, a linha é descartada sem
 * passar pelo validador — nem entra no custo de normalizar, nem no de reportar.
 */
export type FiltroDeLinha = (valor: unknown, linha: number) => boolean;

export type OpcoesDeLeitura<T> = {
  validar?: ValidadorDeLinha<T>;
  filtrar?: FiltroDeLinha;
};

/** Saída da tokenização interna, antes de virar JSON. */
type LinhaBruta =
  | { linha: number; excedeu: false; texto: string }
  | { linha: number; excedeu: true; caracteres: number; trecho: string };

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
 * O `filtrar` opcional roda logo após o `JSON.parse`, antes da validação: a
 * linha recusada sai como `LinhaIgnorada` e não conta como erro.
 */
export async function* lerArquivoJsonl<T = unknown>(
  caminho: string,
  opcoes: OpcoesDeLeitura<T> = {},
): AsyncGenerator<ResultadoDeLinha<T>> {
  const arquivo = createReadStream(caminho, { highWaterMark: TAMANHO_BLOCO_LEITURA });

  try {
    yield* lerFluxoJsonl<T>(arquivo, opcoes);
  } finally {
    // Fecha o descritor mesmo se quem consome interromper o laço no meio.
    arquivo.destroy();
  }
}

/**
 * Etapa de leitura propriamente dita, separada da abertura do arquivo
 */
async function* lerFluxoJsonl<T = unknown>(
  origem: AsyncIterable<Buffer | string>,
  opcoes: OpcoesDeLeitura<T> = {},
): AsyncGenerator<ResultadoDeLinha<T>> {
  for await (const bruta of separarLinhas(origem)) {
    if (bruta.excedeu) {
      yield {
        ok: false,
        linha: bruta.linha,
        trecho: bruta.trecho,
        motivo: `linha excede o limite de ${LIMITE_TAMANHO_LINHA} caracteres (${bruta.caracteres} descartados)`,
      };
      continue;
    }

    if (bruta.texto.trim() === "") continue;
    yield interpretarLinha(bruta.texto, bruta.linha, opcoes);
  }
}

/**
 * Quebra o stream em linhas mantendo apenas o resto do bloco atual em memória.
 *
 * Ao contrário do `readline`, aplica um teto por linha: passando do limite, o
 * conteúdo é jogado fora na hora e o resto da linha é consumido sem acumular,
 * até a próxima quebra de linha.
 */
async function* separarLinhas(origem: AsyncIterable<Buffer | string>): AsyncGenerator<LinhaBruta> {
  const decoder = new StringDecoder("utf8");

  let pendente = "";
  let numero = 0;
  let primeiroBloco = true;

  // Estado do descarte de uma linha grande demais.
  let descartando = false;
  let descartados = 0;
  let trecho = "";

  for await (const bloco of origem) {
    pendente += typeof bloco === "string" ? bloco : decoder.write(bloco);

    if (primeiroBloco) {
      if (pendente.charCodeAt(0) === 0xfeff) pendente = pendente.slice(1); // BOM
      primeiroBloco = false;
    }

    let inicio = 0;
    let quebra = pendente.indexOf("\n", inicio);

    while (quebra !== -1) {
      const texto = pendente.slice(inicio, quebra);
      inicio = quebra + 1;
      numero += 1;

      if (descartando) {
        yield { linha: numero, excedeu: true, caracteres: descartados + texto.length, trecho };
        descartando = false;
        descartados = 0;
        trecho = "";
      } else {
        yield { linha: numero, excedeu: false, texto: removerCrFinal(texto) };
      }

      quebra = pendente.indexOf("\n", inicio);
    }

    // Só o pedaço após a última quebra sobrevive ao bloco.
    pendente = inicio === 0 ? pendente : pendente.slice(inicio);

    if (descartando) {
      descartados += pendente.length;
      pendente = "";
    } else if (pendente.length > LIMITE_TAMANHO_LINHA) {
      descartando = true;
      descartados = pendente.length;
      trecho = pendente.slice(0, TAMANHO_TRECHO_ERRO);
      pendente = "";
    }
  }

  pendente += decoder.end();

  // Última linha, quando o arquivo não termina com quebra de linha.
  if (descartando) {
    yield { linha: numero + 1, excedeu: true, caracteres: descartados + pendente.length, trecho };
  } else if (pendente !== "") {
    yield { linha: numero + 1, excedeu: false, texto: removerCrFinal(pendente) };
  }
}

/** Tira o `\r` que sobra de arquivo gravado com quebra de linha do Windows. */
function removerCrFinal(texto: string): string {
  return texto.endsWith("\r") ? texto.slice(0, -1) : texto;
}

function interpretarLinha<T>(
  bruta: string,
  linha: number,
  opcoes: OpcoesDeLeitura<T>,
): ResultadoDeLinha<T> {
  const { validar, filtrar } = opcoes;
  let conteudo: unknown;

  try {
    conteudo = JSON.parse(bruta);
  } catch (cause) {
    return {
      ok: false,
      linha,
      trecho: resumir(bruta),
      motivo: `JSON inválido: ${mensagemDoErro(cause)}`,
    };
  }

  // O filtro vem antes do validador de propósito: o que não interessa não paga
  // o custo de ser normalizado nem corre o risco de ser reportado como erro.
  if (filtrar && !filtrar(conteudo, linha)) {
    return { ok: false, ignorada: true, linha };
  }

  if (!validar) {
    return { ok: true, linha, valor: conteudo as T };
  }

  try {
    return { ok: true, linha, valor: validar(conteudo, linha) };
  } catch (cause) {
    return { ok: false, linha, trecho: resumir(bruta), motivo: mensagemDoErro(cause) };
  }
}

/** Guarda só um trecho da linha inválida — o original é liberado em seguida. */
function resumir(bruta: string): string {
  const linha = bruta.trim();
  return linha.length > TAMANHO_TRECHO_ERRO ? `${linha.slice(0, TAMANHO_TRECHO_ERRO)}...` : linha;
}
