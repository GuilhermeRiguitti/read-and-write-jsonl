import { createReadStream } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { LIMITE_TAMANHO_LINHA, TAMANHO_BLOCO_LEITURA } from "./constants.ts";

/** Linha lida e convertida com sucesso. */
export type LinhaLida<T> = {
  ok: true;
  linha: number;
  valor: T;
};

/**
 * Linha incoerente: JSON inválido, fora do formato esperado ou grande demais.
 *
 * Devolve o número da linha e nada mais. O motivo e um trecho do conteúdo
 * chegaram a existir aqui, mas numa base grande com muitos registros ruins o
 * relatório linha a linha afoga o stderr — mesmo motivo pelo qual as linhas
 * recusadas pelo filtro também não são listadas. O que sobra é a contagem, no
 * resumo do fim da execução.
 */
export type LinhaInvalida = {
  ok: false;
  ignorada?: false;
  linha: number;
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
 * conteúdo não fizer sentido: o leitor captura e devolve a linha como inválida.
 *
 * Recebe só o valor: a numeração das linhas é do leitor, que já a devolve em
 * cada resultado
 */
export type ValidadorDeLinha<T> = (valor: unknown) => T;

/**
 * Decide se a linha interessa. Retornando `false`, a linha é descartada sem
 * passar pelo validador: não paga o custo de ser normalizada nem entra no
 * contador de erros.
 */
export type FiltroDeLinha = (valor: unknown) => boolean;

export type OpcoesDeLeitura<T> = {
  validar?: ValidadorDeLinha<T>;
  filtrar?: FiltroDeLinha;
};

/** Saída da tokenização interna, antes de virar JSON. */
type LinhaBruta =
  | { linha: number; excedeu: false; texto: string }
  | { linha: number; excedeu: true };

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
 * Etapa de leitura propriamente dita, separada da abertura do arquivo.
 */
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

  // Ligado enquanto se consome o resto de uma linha grande demais.
  let descartando = false;

  for await (const bloco of origem) {
    pendente += typeof bloco === "string" ? bloco : decoder.write(bloco);

    // A checagem só vale depois que houver ao menos um caractere: um bloco pode
    // decodificar para string vazia se cair no meio de uma sequência UTF-8 (o
    // próprio BOM tem 3 bytes), e desarmar a flag antes disso deixaria o BOM
    // passar para dentro da primeira linha.
    if (primeiroBloco && pendente.length > 0) {
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
        yield { linha: numero, excedeu: true };
        descartando = false;
      } else {
        yield { linha: numero, excedeu: false, texto: removerCrFinal(texto) };
      }

      quebra = pendente.indexOf("\n", inicio);
    }

    // Só o pedaço após a última quebra sobrevive ao bloco.
    pendente = inicio === 0 ? pendente : pendente.slice(inicio);

    if (descartando) {
      pendente = "";
    } else if (pendente.length > LIMITE_TAMANHO_LINHA) {
      descartando = true;
      pendente = "";
    }
  }

  pendente += decoder.end();

  // Última linha, quando o arquivo não termina com quebra de linha.
  if (descartando) {
    yield { linha: numero + 1, excedeu: true };
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
  } catch {
    return { ok: false, linha };
  }

  // O filtro vem antes do validador de propósito: o que não interessa não paga
  // o custo de ser normalizado nem corre o risco de ser contado como erro.
  if (filtrar && !filtrar(conteudo)) {
    return { ok: false, ignorada: true, linha };
  }

  if (!validar) {
    return { ok: true, linha, valor: conteudo as T };
  }

  // O validador lança para recusar a linha; o erro em si não é propagado porque
  // ninguém o consome — a linha só precisa ficar de fora e ser contada.
  try {
    return { ok: true, linha, valor: validar(conteudo) };
  } catch {
    return { ok: false, linha };
  }
}
