export type Jogador = {
    player_id: string;
    name: string;
    age: number;
    goals: number;
    debut_date: string;
    position: string;
    shirt_number: number;
    nationality: string;
    market_value: number;
};

export type Clube = {
    club_id: string;
    name: string;
    championship: string;
    founding_date: string;
    city: string;
    state: string;
    country: string;
    stadium: string;
    president: string;
    nickname: string | null;
    colors: string[];
    titles: number;
    players: Jogador[];
};

/** Linha lida e convertida com sucesso. */
export type JsonlOk<T> = {
    ok: true;
    line: number;
    value: T;
};

/** Linha incoerente: JSON inválido, fora do formato esperado ou grande demais. */
export type JsonlFailure = {
    ok: false;
    line: number;
    raw: string;
    reason: string;
};

export type JsonlResult<T> = JsonlOk<T> | JsonlFailure;

/**
 * Valida/converte o JSON já parseado de uma linha.
 * Deve lançar quando o conteúdo não fizer sentido.
 */
export type LineValidator<T> = (value: unknown, line: number) => T;

export type ReadJsonlOptions<T> = {
    validate?: LineValidator<T>;
    /** Bloco lido do disco por vez. Padrão: 256 KiB. */
    chunkSize?: number;
    /**
     * Teto de caracteres para uma única linha. Uma linha maior que isso é
     * descartada e reportada como erro, em vez de crescer na memória sem limite
     * (arquivo corrompido, sem quebras de linha). Padrão: 8 MiB.
     */
    maxLineLength?: number;
    /** Quantos caracteres da linha inválida manter no relatório. Padrão: 200. */
    rawPreviewLength?: number;
};