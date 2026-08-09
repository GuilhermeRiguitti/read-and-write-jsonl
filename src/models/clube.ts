import type { JogadorNormalizado } from "./jogador.ts";

/** Registro já normalizado, pronto para a saída. */
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
