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

export function ehClubeElegivel(valor: unknown): boolean {
  if (!ehObjeto(valor)) return true;

  const campeonato = chaveDeTexto(valor.championship);
  if (campeonato === VAZIO) return false;

  return PADROES_CAMPEONATO_ACEITO.some((padrao) => padrao.test(campeonato));
}

/** Só invalida a linha quando não é objeto JSON; demais campos inválidos viram vazio. */
export function validarClube(valor: unknown): ClubeNormalizado {
  if (!ehObjeto(valor)) {
    throw new Error("não é um objeto JSON");
  }

  return normalizarClube(valor);
}

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

/** `players` inválido ou item não-objeto não derruba o clube — só reduz o elenco. */
function normalizarJogadores(bruto: unknown, club_id: string): JogadorNormalizado[] {
  if (!Array.isArray(bruto)) return [];

  return bruto.filter(ehObjeto).map((jogador) => normalizarJogador(jogador, club_id));
}

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
