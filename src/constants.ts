export const FILE_SOURCE = "sample_clubes.jsonl";

/** Bloco lido do disco por vez. */
export const CHUNK_SIZE = 256 * 1024;

/**
 * Teto de caracteres para uma única linha. Uma linha maior que isso é descartada
 * e reportada como erro, em vez de crescer na memória sem limite (arquivo
 * corrompido, sem quebras de linha).
 */
export const MAX_LINE_LENGTH = 8 * 1024 * 1024;

/** Quantos caracteres da linha inválida manter no relatório. */
export const RAW_PREVIEW_LENGTH = 200;

/** De quantos em quantos registros o progresso é reportado no stderr. */
export const INTERVALO_PROGRESSO = 100_000;

/** Valor de saída para campo ausente, nulo ou que falhou na validação. */
export const VAZIO = "";

/** Junta listas de escalares (ex.: cores) em um único campo de texto. */
export const SEPARADOR_LISTA = "|";

/**
 * Separadores aceitos quando a lista chega como texto ("preto, branco" em vez
 * de `["preto", "branco"]`), para que os valores não virem um item só.
 */
export const SEPARADORES_ENTRADA = /[,;|/]+/;

/**
 * Só clubes destes campeonatos entram na leitura. Os valores ficam na forma
 * comparável produzida por `chaveDeTexto` (caixa alta, sem acento).
 */
export const CAMPEONATOS_ACEITOS = new Set(["SERIE A", "SERIE B"]);

/**
 * Formatos de data aceitos na entrada: `YYYY-MM-DD` e a mesma data seguida de
 * um horário UTC (`YYYY-MM-DDTHH:MM:SSZ`, com frações de segundo opcionais). O
 * horário é aceito e descartado — só a parte da data vai para a saída.
 */
export const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/;

/** Quanto texto o escritor acumula antes de mandar para o stream. */
export const LIMITE_BUFFER_SAIDA = 64 * 1024;
