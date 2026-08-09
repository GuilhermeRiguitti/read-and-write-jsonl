import { PADRAO_DATA, SEPARADOR_LISTA, VAZIO } from "./constants.ts";

/**
 * Funções pequenas e sem dependência de domínio, usadas por mais de um módulo.
 * Ponto único de manutenção para evitar cópias divergentes da mesma lógica.
 */

/**
 * Texto legível de qualquer coisa lançada.
 *
 * `throw` aceita qualquer valor, não só `Error`: uma biblioteca pode lançar
 * string, e um `JSON.parse` sobre entrada estranha pode trazer objetos sem
 * `message`. Sem esse tratamento, a mensagem viraria "[object Object]" no log.
 */
export function mensagemDoErro(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Verdadeiro só para objeto JSON de verdade.
 *
 * `typeof null === "object"` e listas também são objetos, então as duas
 * exceções precisam ser afastadas explicitamente. O type predicate deixa o
 * acesso aos campos tipado no bloco que chama.
 */
export function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Mesma checagem, mas para seguir a leitura: o que não é objeto virar `{}`. */
export function comoObjeto(valor: unknown): Record<string, unknown> {
  return ehObjeto(valor) ? valor : {};
}

/**
 * Converte qualquer valor do JSON em texto de saída.
 *
 * Regra: campo ausente ou nulo virar string vazia. Números e booleanos são
 * convertidos; números não finitos (NaN, Infinity) e valores compostos
 * (objeto/lista) não têm representação escalar útil, então também viram vazio.
 */
export function normalizarTexto(valor: unknown): string {
  if (valor === undefined || valor === null) return VAZIO;

  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "boolean") return String(valor);
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : VAZIO;
  if (typeof valor === "bigint") return String(valor);

  return VAZIO;
}

/**
 * Reduz um texto à forma usada em comparação de valor conhecido.
 *
 * O arquivo real não é consistente na grafia: `"Série A"`, `"série  a"` e
 * `" Serie B "` são o mesmo campeonato. Comparar cru descartaria clube válido,
 * então acento, caixa e espaço repetido são achatados antes de comparar.
 */
export function chaveDeTexto(valor: unknown): string {
  return normalizarTexto(valor)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/**
 * Normaliza data em duas etapas, caindo para vazio quando qualquer uma falha:
 *
 * 1. formato — o texto precisa casar com `PADRAO_DATA`;
 * 2. calendário — a data precisa existir de fato (`2025-02-30` reprova).
 *
 * A saída é montada a partir dos grupos capturados pela regex, nunca a partir do
 * `Date`: assim o valor escrito é exatamente o que veio no arquivo, sem risco de
 * o fuso deslocar a data em um dia.
 */
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

/**
 * Usa `Date` apenas como calendário: monta a data em UTC e confere se os campos
 * voltam iguais. Se algo estourou o limite do mês, o `Date` normaliza para outro
 * dia e a comparação falha.
 *
 * `setUTCFullYear` (em vez de `Date.UTC`) evita a regra legada que interpreta
 * anos de dois dígitos como 19xx.
 */
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

/**
 * Lista ausente ou nula virar lista vazia. Um valor presente que não é lista é
 * incoerência de formato, não campo faltando: sinaliza erro para a linha inteira
 * ser reportada e descartada.
 */
export function normalizarLista(valor: unknown, campo: string): unknown[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor)) throw new Error(`campo "${campo}" deveria ser uma lista`);
  return valor;
}

/** Lista de escalares virar texto único ("preto, branco"); vazia virar vazio. */
export function normalizarListaTexto(valor: unknown, campo: string): string {
  const itens = normalizarLista(valor, campo);
  if (itens.length === 0) return VAZIO;

  return itens
    .map(normalizarTexto)
    .filter((item) => item !== VAZIO)
    .join(SEPARADOR_LISTA);
}

