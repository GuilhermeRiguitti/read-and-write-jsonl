import type { ClubeNormalizado } from "./models/clube.ts";
import type { JogadorNormalizado } from "./models/jogador.ts";
import {
  chaveDeTexto,
  comoObjeto,
  ehObjeto,
  normalizarData,
  normalizarLista,
  normalizarListaTexto,
  normalizarTexto,
} from "./helpers.ts";
import { CAMPEONATOS_ACEITOS, VAZIO } from "./constants.ts";

/**
 * Decide se o registro bruto interessa, antes de qualquer validação ou
 * normalização: só clubes de Série A ou Série B seguem adiante.
 *
 * Trabalha sobre o valor cru justamente para que registro fora do escopo —
 * inclusive linha mal formada, que nem objeto é — não chegue a ser normalizado
 * nem reportado como erro. Campeonato ausente, nulo ou vazio também fica de
 * fora: sem o campo não há como afirmar que é A ou B, e chutar produziria
 * informação errada na saída.
 */
export function ehClubeElegivel(value: unknown): boolean {
  if (!ehObjeto(value)) return false;

  const campeonato = chaveDeTexto(value.championship);
  if (campeonato === VAZIO) return false;

  return CAMPEONATOS_ACEITOS.has(campeonato);
}

/**
 * Valida e normaliza uma linha do JSONL de clubes.
 *
 * Só duas coisas invalidam a linha inteira: não ser um objeto JSON e não ter
 * identificação (`club_id`/`name`) — sem elas o registro não é aproveitável.
 * Todo o resto é normalizado: campo ausente, nulo ou fora do formato esperado
 * vira string vazia, e a leitura segue.
 *
 * Lança em caso de linha inválida; quem chama (o leitor) já captura, reporta e
 * passa para a próxima linha.
 */
export function validarClube(value: unknown, line: number): ClubeNormalizado {
  if (!ehObjeto(value)) {
    throw new Error(`linha ${line} não é um objeto JSON`);
  }

  const clube = normalizarClube(value);

  return clube;
}

/** Mapeia o registro bruto para os campos de saída, todos como texto. */
function normalizarClube(bruto: Record<string, unknown>): ClubeNormalizado {
  const club_id = normalizarTexto(bruto.club_id);

  return {
    club_id,
    name: normalizarTexto(bruto.name),
    championship: normalizarTexto(bruto.championship),
    founding_date: normalizarData(bruto.founding_date),
    city: normalizarTexto(bruto.city),
    state: normalizarTexto(bruto.state),
    country: normalizarTexto(bruto.country),
    stadium: normalizarTexto(bruto.stadium),
    president: normalizarTexto(bruto.president),
    nickname: normalizarTexto(bruto.nickname),
    colors: normalizarListaTexto(bruto.colors, "colors"),
    players: normalizarLista(bruto.players, "players").map((jogador) =>
      normalizarJogador(comoObjeto(jogador), club_id),
    ),
  };
}

/** O jogador não carrega o clube no JSONL: o id vem do registro pai. */
function normalizarJogador(bruto: Record<string, unknown>, club_id: string): JogadorNormalizado {
  return {
    club_id,
    player_id: normalizarTexto(bruto.player_id),
    name: normalizarTexto(bruto.name),
    age: normalizarTexto(bruto.age),
    goals: normalizarTexto(bruto.goals),
    debut_date: normalizarData(bruto.debut_date),
    position: normalizarTexto(bruto.position),
    shirt_number: normalizarTexto(bruto.shirt_number),
  };
}
