import type { Clube } from "./types.ts";

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

  // Normaliza as listas no próprio objeto recém-parseado: com milhões de
  // registros, uma cópia por linha só geraria pressão de GC à toa. Garantir aqui
  // que `players` e `colors` sempre existem evita que uma linha sem esses campos
  // exploda lá na frente, no consumo.
  clube.players = normalizarLista(clube.players, "players");
  clube.colors = normalizarLista(clube.colors, "colors");

  return clube as Clube;
}

function normalizarLista<T>(valor: T[] | undefined, campo: string): T[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor)) throw new Error(`campo "${campo}" deveria ser uma lista`);
  return valor;
}
