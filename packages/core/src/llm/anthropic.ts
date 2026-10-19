import Anthropic from "@anthropic-ai/sdk";
import { RetryableProviderError, type GenerateRequest, type GenerateResult, type LLMProvider } from "./types.js";

/** Claude Messages API adapteri. Barqaror system qismi keshlanadi, o'zgaruvchan kontekst undan keyin. */
export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  private readonly client: Anthropic;

  constructor(opts: { apiKey?: string; timeoutMs?: number } = {}) {
    // maxRetries: 0 — qayta urinishlarni router boshqaradi (boshqa modelga fallback bilan).
    this.client = new Anthropic({ ...(opts.apiKey ? { apiKey: opts.apiKey } : {}), timeout: opts.timeoutMs ?? 20_000, maxRetries: 0 });
  }

  async generate(model: string, req: GenerateRequest): Promise<Omit<GenerateResult, "costUsd" | "latencyMs">> {
    const system: Anthropic.TextBlockParam[] = [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }];
    if (req.context) system.push({ type: "text", text: req.context });

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model,
        max_tokens: req.maxTokens,
        system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        ...(req.effort || req.responseSchema
          ? { output_config: { ...(req.effort ? { effort: req.effort } : {}), ...(req.responseSchema ? { format: { type: "json_schema" as const, schema: req.responseSchema } } : {}) } }
          : {}),
      });
    } catch (err) {
      if (
        err instanceof Anthropic.RateLimitError ||
        err instanceof Anthropic.InternalServerError ||
        err instanceof Anthropic.APIConnectionError
      ) {
        throw new RetryableProviderError(err.message, this.id, err instanceof Anthropic.APIError ? err.status : undefined);
      }
      if (err instanceof Anthropic.APIError && (err.status === 529 || err.status === 408)) {
        throw new RetryableProviderError(err.message, this.id, err.status);
      }
      throw err;
    }

    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();

    let json: unknown;
    if (req.responseSchema && response.stop_reason !== "refusal") {
      try {
        json = JSON.parse(text);
      } catch {
        // max_tokens bilan kesilgan javob — json bo'lmaydi, chaqiruvchi fallback qiladi.
      }
    }

    return {
      text,
      ...(json !== undefined ? { json } : {}),
      model: response.model,
      provider: this.id,
      finishReason: response.stop_reason === "refusal" ? "refusal" : response.stop_reason === "max_tokens" ? "length" : "stop",
      usage: {
        inputTokens: response.usage.input_tokens,
        cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
