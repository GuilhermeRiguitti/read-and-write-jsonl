import { readJsonlFile } from "./jsonl/reader.ts";
import { validarClube, type Clube } from "./clubes/clube.ts";

const CAMINHO_PADRAO = "sample_clubes.jsonl";

async function main(): Promise<void> {
  const caminho = process.argv[2] ?? CAMINHO_PADRAO;

  console.log(`Lendo JSONL: ${caminho}\n`);

  let lidos = 0;
  let invalidos = 0;

  for await (const resultado of readJsonlFile<Clube>(caminho, { validate: validarClube })) {
    if (!resultado.ok) {
      invalidos += 1;
      console.error(`[linha ${resultado.line}] ERRO: ${resultado.reason}`);
      console.error(`[linha ${resultado.line}] conteúdo: ${resumir(resultado.raw)}`);
      continue;
    }

    lidos += 1;
    imprimirClube(resultado.line, resultado.value);
  }

  console.log(`\nResumo: ${lidos} clube(s) lido(s), ${invalidos} linha(s) com erro.`);
}

function imprimirClube(line: number, clube: Clube): void {
  console.log(`\n[linha ${line}] Clube:`);
  console.log(`  club_id: ${clube.club_id}`);
  console.log(`  name: ${clube.name}`);
  console.log(`  championship: ${clube.championship}`);
  console.log(`  founding_date: ${clube.founding_date}`);
  console.log(`  city: ${clube.city}`);
  console.log(`  state: ${clube.state}`);
  console.log(`  country: ${clube.country}`);
  console.log(`  stadium: ${clube.stadium}`);
  console.log(`  president: ${clube.president}`);
  console.log(`  nickname: ${clube.nickname ?? "(sem apelido)"}`);
  console.log(`  colors: ${clube.colors.join(", ")}`);
  console.log(`  titles: ${clube.titles}`);

  for (const jogador of clube.players) {
    console.log(`\n  Jogador:`);
    console.log(`     player_id: ${jogador.player_id}`);
    console.log(`     name: ${jogador.name}`);
    console.log(`     age: ${jogador.age}`);
    console.log(`     goals: ${jogador.goals}`);
    console.log(`     debut_date: ${jogador.debut_date}`);
    console.log(`     position: ${jogador.position}`);
    console.log(`     shirt_number: ${jogador.shirt_number}`);
    console.log(`     nationality: ${jogador.nationality}`);
    console.log(`     market_value: ${jogador.market_value}`);
  }

  console.log("================================");
}

function resumir(raw: string, limite = 120): string {
  const linha = raw.trim();
  return linha.length > limite ? `${linha.slice(0, limite)}...` : linha;
}

await main();
