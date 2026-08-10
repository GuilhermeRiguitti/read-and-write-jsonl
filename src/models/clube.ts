import type { JogadorNormalizado } from "./jogador.ts";

/**
 * Registro já normalizado, pronto para a saída.
 *
 * "Normalizado" é sobre os **valores**, não sobre os nomes das chaves: daqui pra
 * frente todo campo é `string` (nunca `null`, `undefined` ou número), data já
 * conferida no calendário e `colors` já achatado em texto único.
 *
 * As chaves seguem as do JSON de entrada de propósito. A tradução para os
 * cabeçalhos em português acontece uma camada depois, em `COLUNAS_CLUBES`
 * (`src/constants.ts`), onde cada coluna é `{ key, header }`. Renomear aqui
 * obrigaria a montar um objeto novo por registro — alocação à toa em uma base de
 * milhões de linhas.
 */
export type ClubeNormalizado = {
  club_id: string;
  name: string;
  championship: string;
  founding_date: string;
  city: string;
  state: string;
  country: string;
  stadium: string;
  president: string;
  nickname: string;
  colors: string;
  players: JogadorNormalizado[];
};
