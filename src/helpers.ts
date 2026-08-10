import { PADRAO_DATA, SEPARADOR_LISTA, VAZIO } from "./constants.ts";

export function mensagemDoErro(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

export function normalizarTexto(valor: unknown): string {
  if (valor === undefined || valor === null) return VAZIO;

  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "boolean") return String(valor);
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : VAZIO;
  if (typeof valor === "bigint") return String(valor);

  return VAZIO;
}

/** Comparação tolerante a acento, caixa e espaços extras — usada no filtro de campeonato. */
export function chaveDeTexto(valor: unknown): string {
  return normalizarTexto(valor)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/** Saída montada a partir da regex, não de `Date`, para evitar deslocamento de fuso. */
export function normalizarData(valor: unknown): string {
  const texto = normalizarTexto(valor);
  if (texto === VAZIO) return VAZIO;

  const partes = PADRAO_DATA.exec(texto);
  if (partes === null) return VAZIO;

  const [, ano, mes, dia] = partes;
  if (ano === undefined || mes === undefined || dia === undefined) return VAZIO;

  if (!existeNoCalendario(Number(ano), Number(mes), Number(dia))) return VAZIO;

  return `${ano}-${mes}-${dia}`;
}

function existeNoCalendario(ano: number, mes: number, dia: number): boolean {
  const data = new Date(0);
  data.setUTCFullYear(ano, mes - 1, dia);

  return (
    !Number.isNaN(data.getTime()) &&
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

export function normalizarListaTexto(valor: unknown): string {
  if (!Array.isArray(valor)) return normalizarTexto(valor);

  return valor
    .map((item) => normalizarTexto(item))
    .filter((item) => item !== VAZIO)
    .join(SEPARADOR_LISTA);
}
