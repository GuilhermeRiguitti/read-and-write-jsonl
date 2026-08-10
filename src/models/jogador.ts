/** `club_id` vem do clube pai — não existe dentro do objeto do jogador no JSONL. */
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
