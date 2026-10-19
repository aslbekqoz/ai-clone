export type Purpose = "classify" | "rewrite" | "answer" | "answer_complex" | "memory_extract" | "style_extract" | "judge";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  /**
   * Barqaror qism (qoidalar, uslub profili, bio) — prompt cache uchun har doim bir xil
   * bo'lishi kerak. Unga vaqt, ID kabi o'zgaruvchan narsalar qo'shilmaydi.
   */
  system: string;
  /** Har bir navbatda o'zgaradigan kontekst (manbalar, namunalar, xotira) — keshdan keyin. */
  context?: string;
  messages: ChatTurn[];
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  metadata: { tenantId: string; cloneId: string; purpose: Purpose; traceId?: string };
}

export interface Usage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export interface GenerateResult {
  text: string;
  usage: Usage;
  model: string;
  provider: string;
  finishReason: "stop" | "length" | "refusal";
  costUsd: number;
  latencyMs: number;
}

export interface LLMProvider {
  readonly id: string;
  generate(model: string, req: GenerateRequest): Promise<Omit<GenerateResult, "costUsd" | "latencyMs">>;
}

/** Provayder qayta urinib ko'rsa bo'ladigan xato (429, 5xx, timeout) — router keyingi modelga o'tadi. */
export class RetryableProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RetryableProviderError";
  }
}
