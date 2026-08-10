import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chaveDeTexto,
  ehObjeto,
  mensagemDoErro,
  normalizarData,
  normalizarListaTexto,
  normalizarTexto,
} from "../src/helpers.ts";

describe("normalizarTexto", () => {
  it("preserva texto e remove espaço nas pontas", () => {
    assert.equal(normalizarTexto("  Timão  "), "Timão");
  });

  it("converte escalares para texto", () => {
    assert.equal(normalizarTexto(26), "26");
    assert.equal(normalizarTexto(0), "0");
    assert.equal(normalizarTexto(false), "false");
    assert.equal(normalizarTexto(9007199254740993n), "9007199254740993");
  });

  it("devolve vazio para ausente e nulo", () => {
    assert.equal(normalizarTexto(undefined), "");
    assert.equal(normalizarTexto(null), "");
  });

  it("devolve vazio para número sem representação útil", () => {
    assert.equal(normalizarTexto(Number.NaN), "");
    assert.equal(normalizarTexto(Number.POSITIVE_INFINITY), "");
  });

  it("devolve vazio para valor composto em campo escalar", () => {
    // O risco aqui é silencioso: String({}) produziria "[object Object]" e
    // String(["a","b"]) produziria "a,b" — texto plausível gravado no CSV.
    assert.equal(normalizarTexto({ pt: "Corinthians" }), "");
    assert.equal(normalizarTexto(["a", "b"]), "");
  });
});

describe("normalizarData", () => {
  it("aceita o formato yyyy-MM-dd", () => {
    assert.equal(normalizarData("1910-09-01"), "1910-09-01");
  });

  it("aceita horário UTC e descarta a hora", () => {
    assert.equal(normalizarData("1910-09-01T00:00:00Z"), "1910-09-01");
    assert.equal(normalizarData("1910-09-01T14:30:00Z"), "1910-09-01");
    assert.equal(normalizarData("1910-09-01T14:30:00.123Z"), "1910-09-01");
  });

  it("não desloca o dia por fuso horário", () => {
    // A saída vem dos grupos da regex, não do Date. Formatar pelo Date em fuso
    // negativo devolveria 2024-01-17 para a mesma entrada.
    assert.equal(normalizarData("2024-01-18"), "2024-01-18");
    assert.equal(normalizarData("2024-01-01T00:00:00Z"), "2024-01-01");
  });

  it("rejeita data que casa com a regex mas não existe no calendário", () => {
    assert.equal(normalizarData("2024-02-30"), "");
    assert.equal(normalizarData("2023-02-29"), "");
    assert.equal(normalizarData("2024-13-01"), "");
    assert.equal(normalizarData("2024-00-10"), "");
    assert.equal(normalizarData("2024-01-32"), "");
    assert.equal(normalizarData("2024-04-31"), "");
  });

  it("aceita 29 de fevereiro em ano bissexto", () => {
    assert.equal(normalizarData("2024-02-29"), "2024-02-29");
  });

  it("rejeita formatos ambíguos em vez de inferir a ordem dos campos", () => {
    // 03/04/2024 é 3 de abril em dd/MM/yyyy e 4 de março em MM/dd/yyyy.
    assert.equal(normalizarData("03/04/2024"), "");
    assert.equal(normalizarData("18/01/2024"), "");
  });

  it("rejeita variações de formato fora do especificado", () => {
    assert.equal(normalizarData("2024-1-8"), "");
    assert.equal(normalizarData("910-09-01"), "");
    assert.equal(normalizarData("20240118"), "");
    assert.equal(normalizarData("2024-01-18T00:00:00-03:00"), "");
    assert.equal(normalizarData("2024-01-18Tqualquercoisa"), "");
  });

  it("devolve vazio para ausente, nulo e não-texto", () => {
    assert.equal(normalizarData(undefined), "");
    assert.equal(normalizarData(null), "");
    assert.equal(normalizarData(""), "");
    assert.equal(normalizarData(20240118), "");
    assert.equal(normalizarData({ ano: 2024 }), "");
  });

  it("não interpreta ano de dois dígitos como 19xx", () => {
    // Date.UTC(50, ...) devolveria 1950; a checagem usa setUTCFullYear.
    assert.equal(normalizarData("0050-01-01"), "0050-01-01");
  });
});

describe("normalizarListaTexto", () => {
  it("une a lista com pipe", () => {
    assert.equal(normalizarListaTexto(["preto", "branco"]), "preto|branco");
  });

  it("devolve vazio para lista vazia e para campo ausente", () => {
    assert.equal(normalizarListaTexto([]), "");
    assert.equal(normalizarListaTexto(undefined), "");
    assert.equal(normalizarListaTexto(null), "");
  });

  it("descarta itens sem representação escalar", () => {
    assert.equal(normalizarListaTexto(["preto", { tom: "escuro" }, "branco"]), "preto|branco");
    assert.equal(normalizarListaTexto([null, "azul", ""]), "azul");
  });

  it("aproveita valor escalar solto, fora de lista", () => {
    assert.equal(normalizarListaTexto("preto"), "preto");
  });

  it("não inventa separador dentro de um texto", () => {
    assert.equal(normalizarListaTexto("preto, branco"), "preto, branco");
  });
});

describe("chaveDeTexto", () => {
  it("iguala grafias do mesmo campeonato", () => {
    assert.equal(chaveDeTexto("Série A"), "SERIE A");
    assert.equal(chaveDeTexto("  série   a  "), "SERIE A");
    assert.equal(chaveDeTexto("SERIE A"), "SERIE A");
  });

  it("devolve vazio para ausente e nulo", () => {
    assert.equal(chaveDeTexto(undefined), "");
    assert.equal(chaveDeTexto(null), "");
  });
});

describe("ehObjeto", () => {
  it("aceita só objeto JSON", () => {
    assert.equal(ehObjeto({ a: 1 }), true);
    assert.equal(ehObjeto({}), true);
  });

  it("recusa null, lista e escalares", () => {
    assert.equal(ehObjeto(null), false);
    assert.equal(ehObjeto([1, 2]), false);
    assert.equal(ehObjeto("texto"), false);
    assert.equal(ehObjeto(42), false);
  });
});

describe("mensagemDoErro", () => {
  it("extrai a mensagem de um Error", () => {
    assert.equal(mensagemDoErro(new Error("falhou")), "falhou");
  });

  it("converte o que não é Error", () => {
    // throw aceita qualquer valor; sem isso a mensagem viraria "[object Object]".
    assert.equal(mensagemDoErro("string solta"), "string solta");
    assert.equal(mensagemDoErro(42), "42");
  });
});
