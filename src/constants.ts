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

export const ARQUIVO_CLUBES = "clubs.csv";
export const ARQUIVO_JOGADORES = "players.csv";

/**
 * Colunas no formato que o `csv-stringify` recebe na opção `columns`.
 *
 * Declarar aqui resolve três coisas num lugar só: a ordem das colunas, o nome do
 * cabeçalho (em português, diferente da chave do JSON) e o recorte dos campos —
 * chave não listada é descartada pela própria biblioteca, então `players` não
 * vira coluna e o `ClubeNormalizado` pode ser escrito como está, sem etapa de
 * mapeamento a cada registro.
 */
export const COLUNAS_CLUBES = [
  { key: "club_id", header: "Id do Clube" },
  { key: "name", header: "Nome" },
  { key: "championship", header: "Campeonato" },
  { key: "founding_date", header: "Data de Fundação" },
  { key: "city", header: "Cidade" },
  { key: "state", header: "Estado" },
  { key: "country", header: "País" },
  { key: "stadium", header: "Estádio" },
  { key: "president", header: "Presidente" },
  { key: "nickname", header: "Apelido" },
  { key: "colors", header: "Cores" },
];

export const COLUNAS_JOGADORES = [
  { key: "club_id", header: "Id do Clube" },
  { key: "player_id", header: "Id do Jogador" },
  { key: "name", header: "Nome" },
  { key: "age", header: "Idade" },
  { key: "goals", header: "Gols" },
  { key: "debut_date", header: "Data de Estreia" },
  { key: "position", header: "Posição" },
  { key: "shirt_number", header: "Número da Camisa" },
];
