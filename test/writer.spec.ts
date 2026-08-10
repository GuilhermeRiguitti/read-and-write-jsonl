import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { describe, it } from "node:test";
import { LIMITE_BUFFER_SAIDA } from "../src/constants.ts";
import { criarEscritor } from "../src/writer.ts";

type Escrita = {
  dados: string;
};

function criarDestinoComBackpressure(): { stream: Writable; texto: () => string } {
  let gravado = "";
  let primeiraEscrita = true;

  const stream = new Writable({
    write(chunk, _encoding, callback) {
      gravado += chunk.toString();
      callback();
    },
  });

  const escrever = stream.write.bind(stream);
  stream.write = ((chunk: string | Buffer, encoding?: BufferEncoding, callback?: (error?: Error | null) => void) => {
    escrever(chunk, encoding ?? "utf8", callback);

    if (primeiraEscrita) {
      primeiraEscrita = false;
      queueMicrotask(() => {
        stream.emit("drain");
      });
      return false;
    }

    return true;
  }) as Writable["write"];

  return { stream, texto: () => gravado };
}

function criarDestino(): { stream: Writable; escrita: Escrita } {
  const escrita: Escrita = { dados: "" };

  const stream = new Writable({
    highWaterMark: 16,
    write(chunk, _encoding, callback) {
      escrita.dados += chunk.toString();
      callback();
    },
  });

  return { stream, escrita };
}

describe("criarEscritor", () => {
  it("acumula texto e só envia ao destino no flush", async () => {
    const { stream, escrita } = criarDestino();
    const escritor = criarEscritor(stream);

    escritor.write("a");
    escritor.write("b");
    assert.equal(escrita.dados, "");

    await escritor.flush();
    assert.equal(escrita.dados, "ab");
  });

  it("não escreve quando o flush é chamado com buffer vazio", async () => {
    const { stream, escrita } = criarDestino();
    const escritor = criarEscritor(stream);

    await escritor.flush();
    assert.equal(escrita.dados, "");
  });

  it("faz flush automático ao atingir o limite do buffer", async () => {
    const { stream, escrita } = criarDestino();
    const escritor = criarEscritor(stream);
    const bloco = "x".repeat(LIMITE_BUFFER_SAIDA);

    const retorno = escritor.write(bloco);

    assert.ok(retorno instanceof Promise);
    await retorno;
    assert.equal(escrita.dados, bloco);
  });

  it("aguarda drain quando o destino está cheio", async () => {
    const { stream, texto } = criarDestinoComBackpressure();
    const escritor = criarEscritor(stream);

    escritor.write("inicio");
    await escritor.flush();

    assert.equal(texto(), "inicio");
  });
});
