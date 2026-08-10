/**
 * Registro já normalizado, pronto para a saída.
 *
 * Mesma regra do `ClubeNormalizado`: "normalizado" vale para os valores (tudo
 * `string`), e as chaves continuam as do JSON — a tradução para os cabeçalhos
 * está em `COLUNAS_JOGADORES` (`src/constants.ts`).
 *
 * `club_id` é a exceção que não vem do jogador: o JSONL não o traz aqui dentro,
 * ele é copiado do clube pai para ligar as duas saídas.
 */
export type JogadorNormalizado = {
  club_id: string;
  player_id: string;
  name: string;
  age: string;
  goals: string;
  debut_date: string;
  position: string;
  shirt_number: string;
};
