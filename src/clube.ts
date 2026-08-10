import type { ClubeNormalizado } from "./models/clube.ts";
import type { JogadorNormalizado } from "./models/jogador.ts";
import {
  chaveDeTexto,
  ehObjeto,
  normalizarData,
  normalizarListaTexto,
  normalizarTexto,
} from "./helpers.ts";
import { PADROES_CAMPEONATO_ACEITO, VAZIO } from "./constants.ts";

/**
 * Decide se o registro bruto interessa, antes de qualquer validação ou
 * normalização: só clubes de Série A ou Série B seguem adiante.
 *
 * Trabalha sobre o valor cru para que registro fora do escopo não pague o custo
 * de ser normalizado. Campeonato ausente, nulo ou vazio fica de fora: sem o
 * campo não há como afirmar que é A ou B, e chutar produziria informação errada
 * na saída.
 */
export function ehClubeElegivel(valor: unknown): boolean {
  // Linha que nem objeto é não está "em outro campeonato": está malformada.
  // Deixa passar para o validador reprovar, e assim ela é contada como erro em
  // vez de sumir no contador de ignorados.
  if (!ehObjeto(valor)) return true;

  const campeonato = chaveDeTexto(valor.championship);
  if (campeonato === VAZIO) return false;

  return PADROES_CAMPEONATO_ACEITO.some((padrao) => padrao.test(campeonato));
}

/**
 * Valida e normaliza uma linha do JSONL de clubes.
 *
 * Só invalida a linha inteira quando não é um objeto JSON — não há registro
 * nenhum para aproveitar. Todo o resto é normalizado: campo ausente, nulo ou
 * fora do formato esperado vira string vazia ou lista vazia, e a leitura segue.
 * Isso inclui `club_id`: ausente ou nulo vira `""` no clube e é propagado para
 * os jogadores, conforme a regra geral do enunciado para campos vazios.
 *
 * Lança em caso de linha inválida; quem chama (o leitor) já captura, reporta e
 * passa para a próxima linha.
 */
export function validarClube(valor: unknown): ClubeNormalizado {
  if (!ehObjeto(valor)) {
    throw new Error("não é um objeto JSON");
  }

  return normalizarClube(valor);
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
    colors: normalizarListaTexto(bruto.colors),
    players: normalizarJogadores(bruto.players, club_id),
  };
}

/**
 * A lista de jogadores do registro bruto, sem os itens inaproveitáveis.
 *
 * `players` fora do formato de lista vira elenco vazio: o clube continua em
 * `clubs.csv`, só não gera linha em `players.csv` — mesmo tratamento de um clube
 * que legitimamente não tem jogadores. Item que não é objeto sai da lista, em
 * vez de virar uma linha com todos os campos vazios.
 */
function normalizarJogadores(bruto: unknown, club_id: string): JogadorNormalizado[] {
  if (!Array.isArray(bruto)) return [];

  return bruto.filter(ehObjeto).map((jogador) => normalizarJogador(jogador, club_id));
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
