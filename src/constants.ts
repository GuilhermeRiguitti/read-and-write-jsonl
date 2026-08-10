export const TAMANHO_BLOCO_LEITURA = 256 * 1024;

/** Linha acima disso é descartada — protege contra JSONL sem quebras de linha. */
export const LIMITE_TAMANHO_LINHA = 8 * 1024 * 1024;

export const INTERVALO_PROGRESSO = 100_000;
export const VAZIO = "";
export const SEPARADOR_LISTA = "|";

/** Aplicado sobre texto normalizado por `chaveDeTexto`; `\b` evita falso positivo em "SERIE AUXILIAR". */
export const PADROES_CAMPEONATO_ACEITO = [/\bSERIE A\b/, /\bSERIE B\b/] as const;

/** Aceita `YYYY-MM-DD` ou a mesma data com horário UTC opcional — só a data vai para a saída. */
export const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/;

export const LIMITE_BUFFER_SAIDA = 64 * 1024;

export const ARQUIVO_CLUBES = "clubs.csv";
export const ARQUIVO_JOGADORES = "players.csv";

/** `{ key, header }` define ordem, cabeçalho em português e recorte de campos num só lugar. */
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
