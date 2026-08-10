import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lerArquivoJsonl, type ResultadoDeLinha } from "../src/reader.ts";
import { LIMITE_TAMANHO_LINHA, TAMANHO_BLOCO_LEITURA } from "../src/constants.ts";

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
  opcoes: Parameters<typeof lerArquivoJsonl>[1] = {},
): Promise<ResultadoDeLinha<unknown>[]> {
  const caminho = join(pasta, nome);
  await writeFile(caminho, conteudo);

  const resultados: ResultadoDeLinha<unknown>[] = [];
  for await (const resultado of lerArquivoJsonl(caminho, opcoes)) {
    resultados.push(resultado);
  }

  return resultados;
}

describe("lerArquivoJsonl", () => {
  it("lê uma linha por objeto", async () => {
    const resultados = await ler("ok.jsonl", '{"a":1}\n{"a":2}\n');

    assert.equal(resultados.length, 2);
    assert.deepEqual(resultados[0], { ok: true, linha: 1, valor: { a: 1 } });
    assert.deepEqual(resultados[1], { ok: true, linha: 2, valor: { a: 2 } });
  });

  it("uma linha inválida não interrompe a leitura das demais", async () => {
    const resultados = await ler("misto.jsonl", '{"a":1}\n{ quebrado\n{"a":3}\n');

    assert.equal(resultados.length, 3);
    assert.equal(resultados[0]?.ok, true);
    assert.equal(resultados[1]?.ok, false);
    assert.equal(resultados[2]?.ok, true);
  });

  it("distingue linha inválida de linha recusada pelo filtro", async () => {
    const [, invalida] = await ler("erro.jsonl", '{"a":1}\n{ quebrado\n');

    // A ausência de `ignorada` é o que separa dado corrompido de registro fora
    // do escopo: quem consome conta os dois em campos diferentes.
    assert.deepEqual(invalida, { ok: false, linha: 2 });
  });

  it("mantém a numeração fiel ao arquivo, pulando linhas em branco", async () => {
    const resultados = await ler("brancos.jsonl", '{"a":1}\n\n   \n{"a":4}\n');

    assert.deepEqual(
      resultados.map((r) => r.linha),
      [1, 4],
    );
  });

  it("lê a última linha mesmo sem quebra no fim do arquivo", async () => {
    const resultados = await ler("sem-quebra.jsonl", '{"a":1}\n{"a":2}');

    assert.equal(resultados.length, 2);
    assert.deepEqual(resultados[1], { ok: true, linha: 2, valor: { a: 2 } });
  });

  it("trata CRLF e BOM", async () => {
    const resultados = await ler("windows.jsonl", '﻿{"a":1}\r\n{"a":2}\r\n');

    assert.equal(resultados.length, 2);
    assert.deepEqual(resultados[0], { ok: true, linha: 1, valor: { a: 1 } });
    assert.deepEqual(resultados[1], { ok: true, linha: 2, valor: { a: 2 } });
  });

  it("descarta linha acima do teto de tamanho sem estourar a memória", async () => {
    // O teto é conferido a cada bloco lido, então a linha só é cortada depois de
    // ultrapassá-lo por, no pior caso, um bloco inteiro. O que o teto garante é
    // que a memória fica limitada a (bloco + teto), não um corte no byte exato.
    const gigante = `{"a":"${"x".repeat(LIMITE_TAMANHO_LINHA + TAMANHO_BLOCO_LEITURA)}"}`;
    const resultados = await ler("gigante.jsonl", `${gigante}\n{"a":2}\n`);

    assert.equal(resultados.length, 2);
    assert.deepEqual(resultados[0], { ok: false, linha: 1 });
    // A leitura continua na linha seguinte, com a numeração correta.
    assert.deepEqual(resultados[1], { ok: true, linha: 2, valor: { a: 2 } });
  });

  it("linha recusada pelo filtro sai como ignorada, não como erro", async () => {
    const resultados = await ler("filtro.jsonl", '{"manter":true}\n{"manter":false}\n', {
      filtrar: (valor) => (valor as { manter: boolean }).manter,
    });

    assert.equal(resultados[0]?.ok, true);
    assert.deepEqual(resultados[1], { ok: false, ignorada: true, linha: 2 });
  });

  it("erro lançado pelo validador vira linha inválida, sem interromper a leitura", async () => {
    const resultados = await ler("validar.jsonl", '{"a":1}\n{"a":2}\n{"a":3}\n', {
      validar: (valor) => {
        const { a } = valor as { a: number };
        if (a === 2) throw new Error("recusado pelo validador");
        return valor;
      },
    });

    assert.equal(resultados[0]?.ok, true);
    assert.deepEqual(resultados[1], { ok: false, linha: 2 });
    assert.equal(resultados[2]?.ok, true);
  });

  it("falha de abertura sobe como erro, não como linha inválida", async () => {
    await assert.rejects(async () => {
      for await (const _ of lerArquivoJsonl(join(pasta, "nao-existe.jsonl"))) {
        // apenas consome
      }
    }, /ENOENT/);
  });
});
