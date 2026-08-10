import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { LIMITE_TAMANHO_LINHA } from "../src/constants.ts";
import {
  interpretarLinha,
  lerArquivoJsonl,
  removerCrFinal,
  type ResultadoDeLinha,
} from "../src/reader.ts";

async function coletar<T>(
  caminho: string,
  opcoes: Parameters<typeof lerArquivoJsonl<T>>[1] = {},
): Promise<ResultadoDeLinha<T>[]> {
  const resultados: ResultadoDeLinha<T>[] = [];

  for await (const resultado of lerArquivoJsonl<T>(caminho, opcoes)) {
    resultados.push(resultado);
  }

  return resultados;
}

describe("removerCrFinal", () => {
  it("remove \\r no final da linha", () => {
    assert.equal(removerCrFinal('{"a":1}\r'), '{"a":1}');
  });

  it("mantém texto sem \\r final", () => {
    assert.equal(removerCrFinal('{"a":1}'), '{"a":1}');
  });
});

describe("interpretarLinha", () => {
  it("retorna valor parseado quando o JSON é válido", () => {
    assert.deepEqual(interpretarLinha('{"id":1}', 1, {}), {
      ok: true,
      linha: 1,
      valor: { id: 1 },
    });
  });

  it("retorna erro quando o JSON é inválido", () => {
    assert.deepEqual(interpretarLinha("{invalido", 2, {}), {
      ok: false,
      linha: 2,
    });
  });

  it("marca linha ignorada quando o filtro rejeita", () => {
    assert.deepEqual(
      interpretarLinha('{"id":1}', 3, { filtrar: () => false }),
      { ok: false, ignorada: true, linha: 3 },
    );
  });

  it("aplica validador e retorna valor transformado", () => {
    assert.deepEqual(
      interpretarLinha('{"id":1}', 4, {
        validar: (valor) => (valor as { id: number }).id,
      }),
      { ok: true, linha: 4, valor: 1 },
    );
  });

  it("retorna erro quando o validador lança", () => {
    assert.deepEqual(
      interpretarLinha('{"id":1}', 5, {
        validar: () => {
          throw new Error("regra quebrada");
        },
      }),
      { ok: false, linha: 5 },
    );
  });
});

describe("lerArquivoJsonl", () => {
  let diretorio: string;

  it("lê linhas válidas, ignora vazias e normaliza CRLF", async (t) => {
    diretorio = await mkdtemp(join(tmpdir(), "reader-spec-"));
    t.after(async () => {
      await rm(diretorio, { recursive: true, force: true });
    });

    const caminho = join(diretorio, "entrada.jsonl");
    await writeFile(caminho, '\n{"id":1}\r\n\n{"id":2}\n', "utf8");

    const resultados = await coletar<{ id: number }>(caminho);

    assert.deepEqual(resultados, [
      { ok: true, linha: 2, valor: { id: 1 } },
      { ok: true, linha: 4, valor: { id: 2 } },
    ]);
  });

  it("remove BOM UTF-8 da primeira linha", async (t) => {
    diretorio = await mkdtemp(join(tmpdir(), "reader-spec-"));
    t.after(async () => {
      await rm(diretorio, { recursive: true, force: true });
    });

    const caminho = join(diretorio, "bom.jsonl");
    await writeFile(caminho, `\uFEFF{"id":1}\n`, "utf8");

    const resultados = await coletar<{ id: number }>(caminho);

    assert.deepEqual(resultados, [{ ok: true, linha: 1, valor: { id: 1 } }]);
  });

  it("lê última linha sem quebra final", async (t) => {
    diretorio = await mkdtemp(join(tmpdir(), "reader-spec-"));
    t.after(async () => {
      await rm(diretorio, { recursive: true, force: true });
    });

    const caminho = join(diretorio, "sem-quebra.jsonl");
    await writeFile(caminho, '{"id":1}', "utf8");

    const resultados = await coletar<{ id: number }>(caminho);

    assert.deepEqual(resultados, [{ ok: true, linha: 1, valor: { id: 1 } }]);
  });

  it("retorna erro para JSON inválido no arquivo", async (t) => {
    diretorio = await mkdtemp(join(tmpdir(), "reader-spec-"));
    t.after(async () => {
      await rm(diretorio, { recursive: true, force: true });
    });

    const caminho = join(diretorio, "invalido.jsonl");
    await writeFile(caminho, "{nao-json}\n", "utf8");

    const resultados = await coletar(caminho);

    assert.deepEqual(resultados, [{ ok: false, linha: 1 }]);
  });

  it("marca excedeu quando a linha sem quebra final ultrapassa o limite", async (t) => {
    diretorio = await mkdtemp(join(tmpdir(), "reader-spec-"));
    t.after(async () => {
      await rm(diretorio, { recursive: true, force: true });
    });

    const caminho = join(diretorio, "linha-sem-quebra.jsonl");
    await writeFile(caminho, "x".repeat(LIMITE_TAMANHO_LINHA + 1), "utf8");

    const resultados = await coletar(caminho);

    assert.deepEqual(resultados, [{ ok: false, linha: 1 }]);
  });

  it("descarta linha acima do limite e lê a seguinte", async (t) => {
    diretorio = await mkdtemp(join(tmpdir(), "reader-spec-"));
    t.after(async () => {
      await rm(diretorio, { recursive: true, force: true });
    });

    const caminho = join(diretorio, "linha-grande.jsonl");
    await writeFile(caminho, "x".repeat(LIMITE_TAMANHO_LINHA + 1), "utf8");
    await appendFile(caminho, '\n{"id":1}\n', "utf8");

    const resultados = await coletar<{ id: number }>(caminho);

    assert.deepEqual(resultados, [
      { ok: false, linha: 1 },
      { ok: true, linha: 2, valor: { id: 1 } },
    ]);
  });
});
