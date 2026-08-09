import { PADRAO_DATA, SEPARADOR_LISTA, SEPARADORES_ENTRADA, VAZIO } from "./constants.ts";

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
 * Coleção de registros vinda do JSON, tolerante ao formato.
 *
 * Lista virar ela mesma; um objeto solto virar lista de um (registro único
 * escrito fora da lista); qualquer outra coisa — ausente, nula, escalar — virar
 * lista vazia. Formato inesperado não invalida a linha: quem não tem os dados é
 * o campo, não o registro inteiro.
 */
export function normalizarLista(valor: unknown): unknown[] {
  if (Array.isArray(valor)) return valor;
  if (ehObjeto(valor)) return [valor];

  return [];
}

/**
 * Lista de escalares virar texto único ("preto|branco").
 *
 * O campo nem sempre chega como lista: pode vir string vazia, um valor só
 * (`"preto"`) ou vários já colados num texto (`"preto, branco"`). Todos são
 * aceitos, porque descartar a linha por causa da forma do campo perderia dados
 * que estão ali. Só o que não tem representação escalar (objeto, lista aninhada)
 * é que some, item a item.
 */
export function normalizarListaTexto(valor: unknown): string {
  const itens = Array.isArray(valor) ? valor : [valor];

  return itens.flatMap((item) => separarTexto(normalizarTexto(item))).join(SEPARADOR_LISTA);
}

/** Um texto só pode trazer vários valores ("preto, branco"): vira lista. */
function separarTexto(texto: string): string[] {
  if (texto === VAZIO) return [];

  return texto
    .split(SEPARADORES_ENTRADA)
    .map((parte) => parte.trim())
    .filter((parte) => parte !== VAZIO);
}

