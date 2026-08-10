import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(fileURLToPath(new URL("..", import.meta.url)));
const programa = join(raiz, "dist", "index.js");

type ResultadoExecucao = {
  codigo: number | null;
  stderr: string;
};

function executar(cwd: string, ...args: string[]): Promise<ResultadoExecucao> {
  return new Promise((resolve, reject) => {
    const processo = spawn(process.execPath, [programa, ...args], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    processo.stderr?.on("data", (pedaco) => {
      stderr += String(pedaco);
    });

    processo.on("error", reject);
    processo.on("close", (codigo) => resolve({ codigo, stderr }));
  });
}

describe("pipeline e2e", () => {
  let pasta: string;

  before(async () => {
    pasta = await mkdtemp(join(tmpdir(), "e2e-"));
    await copyFile(join(raiz, "sample_clubes.jsonl"), join(pasta, "entrada.jsonl"));
  });

  after(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  it("gera clubs.csv e players.csv corretos a partir do sample", async () => {
    const { codigo } = await executar(pasta, "entrada.jsonl");
    assert.equal(codigo, 0);

    const clubs = await readFile(join(pasta, "clubs.csv"), "utf8");
    const players = await readFile(join(pasta, "players.csv"), "utf8");
    const clubsEsperado = await readFile(join(raiz, "clubs.csv"), "utf8");
    const playersEsperado = await readFile(join(raiz, "players.csv"), "utf8");

    assert.equal(clubs, clubsEsperado);
    assert.equal(players, playersEsperado);
  });

  it("falha com código 1 quando o caminho de entrada não é informado", async () => {
    const { codigo, stderr } = await executar(pasta);
    assert.equal(codigo, 1);
    assert.match(stderr, /Uso:/);
  });
});
