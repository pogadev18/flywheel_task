export const MODEL = "claude-sonnet-4-6";

// USD per 1M tokens for MODEL. Used to price each attempt in the run log.
const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;

export function costUsd(inputTokens: number, outputTokens: number): number {
  const usd =
    (inputTokens / 1_000_000) * INPUT_USD_PER_MTOK +
    (outputTokens / 1_000_000) * OUTPUT_USD_PER_MTOK;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
