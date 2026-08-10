import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJsonlFile, type JsonlResult } from "../src/reader.ts";
import { CHUNK_SIZE, MAX_LINE_LENGTH } from "../src/constants.ts";

let pasta = "";

before(async () => {
  pasta = await mkdtemp(join(tmpdir(), "jsonl-"));
});

after(async () => {
  await rm(pasta, { recursive: true, force: true });
});

/** Escreve um arquivo temporário e devolve todos os resultados da leitura. */
async function ler(
  nome: string,
  conteudo: string | Buffer,
  opcoes: Parameters<typeof readJsonlFile>[1] = {},
): Promise<JsonlResult<unknown>[]> {
  const caminho = join(pasta, nome);
  await writeFile(caminho, conteudo);

  const resultados: JsonlResult<unknown>[] = [];
  for await (const resultado of readJsonlFile(caminho, opcoes)) {
    resultados.push(resultado);
  }

  return resultados;
}

describe("readJsonlFile", () => {
  it("lê uma linha por objeto", async () => {
    const resultados = await ler("ok.jsonl", '{"a":1}\n{"a":2}\n');

    assert.equal(resultados.length, 2);
    assert.deepEqual(resultados[0], { ok: true, line: 1, value: { a: 1 } });
    assert.deepEqual(resultados[1], { ok: true, line: 2, value: { a: 2 } });
  });

  it("uma linha inválida não interrompe a leitura das demais", async () => {
    const resultados = await ler("misto.jsonl", '{"a":1}\n{ quebrado\n{"a":3}\n');

    assert.equal(resultados.length, 3);
    assert.equal(resultados[0]?.ok, true);
    assert.equal(resultados[1]?.ok, false);
    assert.equal(resultados[2]?.ok, true);
  });

  it("reporta número da linha, motivo e trecho do conteúdo", async () => {
    const [, invalida] = await ler("erro.jsonl", '{"a":1}\n{ quebrado\n');

    assert.equal(invalida?.ok, false);
    assert.equal(invalida.skipped, undefined);
    assert.equal(invalida.line, 2);
    assert.match(invalida.reason, /JSON inválido/);
    assert.equal(invalida.raw, "{ quebrado");
  });

  it("mantém a numeração fiel ao arquivo, pulando linhas em branco", async () => {
    const resultados = await ler("brancos.jsonl", '{"a":1}\n\n   \n{"a":4}\n');

    assert.deepEqual(
      resultados.map((r) => r.line),
      [1, 4],
    );
  });

  it("lê a última linha mesmo sem quebra no fim do arquivo", async () => {
    const resultados = await ler("sem-quebra.jsonl", '{"a":1}\n{"a":2}');

    assert.equal(resultados.length, 2);
    assert.deepEqual(resultados[1], { ok: true, line: 2, value: { a: 2 } });
  });

  it("trata CRLF e BOM", async () => {
    const resultados = await ler("windows.jsonl", '﻿{"a":1}\r\n{"a":2}\r\n');

    assert.equal(resultados.length, 2);
    assert.equal(resultados[0]?.ok, true);
    assert.equal(resultados[1]?.ok, true);
  });

  it("descarta linha acima do teto de tamanho sem estourar a memória", async () => {
    // O teto é conferido a cada bloco lido, então a linha só é cortada depois de
    // ultrapassá-lo por, no pior caso, um bloco inteiro. O que o teto garante é
    // que a memória fica limitada a (bloco + teto), não um corte no byte exato.
    const gigante = `{"a":"${"x".repeat(MAX_LINE_LENGTH + CHUNK_SIZE)}"}`;
    const resultados = await ler("gigante.jsonl", `${gigante}\n{"a":2}\n`);

    assert.equal(resultados.length, 2);
    assert.equal(resultados[0]?.ok, false);
    assert.match((resultados[0] as { reason: string }).reason, /excede o limite/);
    // A leitura continua na linha seguinte, com a numeração correta.
    assert.deepEqual(resultados[1], { ok: true, line: 2, value: { a: 2 } });
  });

  it("linha recusada pelo filter sai como ignorada, não como erro", async () => {
    const resultados = await ler("filtro.jsonl", '{"manter":true}\n{"manter":false}\n', {
      filter: (value) => (value as { manter: boolean }).manter,
    });

    assert.equal(resultados[0]?.ok, true);
    assert.deepEqual(resultados[1], { ok: false, skipped: true, line: 2 });
  });

  it("erro lançado pelo validate vira linha inválida", async () => {
    const resultados = await ler("validate.jsonl", '{"a":1}\n{"a":2}\n', {
      validate: (value) => {
        const { a } = value as { a: number };
        if (a === 2) throw new Error("recusado pelo validador");
        return value;
      },
    });

    assert.equal(resultados[0]?.ok, true);
    assert.equal(resultados[1]?.ok, false);
    assert.match((resultados[1] as { reason: string }).reason, /recusado pelo validador/);
  });

  it("falha de abertura sobe como erro, não como linha inválida", async () => {
    await assert.rejects(async () => {
      for await (const _ of readJsonlFile(join(pasta, "nao-existe.jsonl"))) {
        // apenas consome
      }
    }, /ENOENT/);
  });
});
