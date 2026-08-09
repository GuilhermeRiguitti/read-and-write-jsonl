export type Jogador = {
  player_id: string;
  name: string;
  age: number;
  goals: number;
  debut_date: string;
  position: string;
  shirt_number: number;
  nationality: string;
  market_value: number;
};

export type Clube = {
  club_id: string;
  name: string;
  championship: string;
  founding_date: string;
  city: string;
  state: string;
  country: string;
  stadium: string;
  president: string;
  nickname: string | null;
  colors: string[];
  titles: number;
  players: Jogador[];
};

/**
 * Checagem mínima de coerência de uma linha do JSONL de clubes: precisa ser um
 * objeto com identificação e com `players` em formato de lista. O resto dos
 * campos é confiado ao arquivo de origem por enquanto.
 */
export function validarClube(value: unknown, line: number): Clube {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`linha ${line} não é um objeto JSON`);
  }

  const clube = value as Partial<Clube>;

  if (typeof clube.club_id !== "string" || clube.club_id === "") {
    throw new Error(`campo "club_id" ausente ou inválido`);
  }

  if (typeof clube.name !== "string" || clube.name === "") {
    throw new Error(`campo "name" ausente ou inválido`);
  }

  if (clube.players !== undefined && !Array.isArray(clube.players)) {
    throw new Error(`campo "players" deveria ser uma lista`);
  }

  return { ...(clube as Clube), players: clube.players ?? [] };
}
