import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ehClubeElegivel, validarClube } from "../src/clube.ts";

const CLUBE = {
  club_id: "SCCP",
  name: "Sport Club Corinthians Paulista",
  championship: "SERIE A",
  founding_date: "1910-09-01",
  city: "São Paulo",
  state: "SP",
  country: "Brasil",
  stadium: "Neo Química Arena",
  president: "Augusto Melo",
  nickname: "Timão",
  colors: ["preto", "branco"],
  titles: 30,
  players: [{ player_id: "SCCP-10", name: "Rodrigo Garro", age: 26, shirt_number: 10 }],
};

describe("ehClubeElegivel", () => {
  it("aceita Série A e Série B, em qualquer grafia", () => {
    assert.equal(ehClubeElegivel({ championship: "SERIE A" }), true);
    assert.equal(ehClubeElegivel({ championship: "Série B" }), true);
    assert.equal(ehClubeElegivel({ championship: "  série   a " }), true);
  });

  it("recusa outros campeonatos", () => {
    assert.equal(ehClubeElegivel({ championship: "SERIE C" }), false);
    assert.equal(ehClubeElegivel({ championship: "SEM CAMPEONATO" }), false);
  });

  it("recusa campeonato ausente, nulo ou vazio", () => {
    assert.equal(ehClubeElegivel({}), false);
    assert.equal(ehClubeElegivel({ championship: null }), false);
    assert.equal(ehClubeElegivel({ championship: "   " }), false);
  });

  it("deixa passar o que não é objeto, para o validador reportar como erro", () => {
    // Linha malformada não é "outro campeonato": tem de aparecer como erro, e
    // não sumir no contador de ignorados.
    assert.equal(ehClubeElegivel("linha solta"), true);
    assert.equal(ehClubeElegivel(42), true);
    assert.equal(ehClubeElegivel([1, 2]), true);
    assert.equal(ehClubeElegivel(null), true);
  });
});

describe("validarClube", () => {
  it("mapeia os campos de saída e descarta os demais", () => {
    const clube = validarClube(CLUBE, 1);

    assert.equal(clube.club_id, "SCCP");
    assert.equal(clube.name, "Sport Club Corinthians Paulista");
    assert.equal(clube.founding_date, "1910-09-01");
    assert.equal(clube.colors, "preto|branco");
    assert.equal("titles" in clube, false);
  });

  it("propaga o club_id do clube para cada jogador", () => {
    const clube = validarClube(CLUBE, 1);

    assert.equal(clube.players.length, 1);
    assert.equal(clube.players[0]?.club_id, "SCCP");
    assert.equal(clube.players[0]?.player_id, "SCCP-10");
    assert.equal(clube.players[0]?.age, "26");
  });

  it("rejeita linha que não é objeto JSON", () => {
    assert.throws(() => validarClube("linha solta", 7), /não é um objeto JSON/);
    assert.throws(() => validarClube([1, 2], 7), /não é um objeto JSON/);
    assert.throws(() => validarClube(null, 7), /não é um objeto JSON/);
  });

  it("rejeita clube sem club_id, a chave que liga os dois arquivos", () => {
    assert.throws(() => validarClube({ ...CLUBE, club_id: null }, 2), /sem club_id/);
    assert.throws(() => validarClube({ ...CLUBE, club_id: "  " }, 2), /sem club_id/);

    const { club_id: _ignorado, ...semId } = CLUBE;
    assert.throws(() => validarClube(semId, 2), /sem club_id/);
  });

  it("aceita jogador sem player_id: não é chave de ligação", () => {
    const clube = validarClube({ ...CLUBE, players: [{ name: "Sem id" }] }, 1);

    assert.equal(clube.players[0]?.player_id, "");
    assert.equal(clube.players[0]?.club_id, "SCCP");
  });

  it("campo fora de formato custa o campo, não o registro", () => {
    const clube = validarClube(
      { ...CLUBE, founding_date: "01/09/1910", nickname: null, president: { nome: "x" } },
      1,
    );

    assert.equal(clube.founding_date, "");
    assert.equal(clube.nickname, "");
    assert.equal(clube.president, "");
    assert.equal(clube.name, "Sport Club Corinthians Paulista");
  });

  it("players fora do formato de lista vira elenco vazio", () => {
    assert.deepEqual(validarClube({ ...CLUBE, players: "nao e lista" }, 1).players, []);
    assert.deepEqual(validarClube({ ...CLUBE, players: null }, 1).players, []);

    const { players: _semElenco, ...semPlayers } = CLUBE;
    assert.deepEqual(validarClube(semPlayers, 1).players, []);
  });

  it("descarta item de players que não é objeto", () => {
    const clube = validarClube({ ...CLUBE, players: ["texto", 42, { player_id: "A-1" }] }, 1);

    assert.equal(clube.players.length, 1);
    assert.equal(clube.players[0]?.player_id, "A-1");
  });
});
