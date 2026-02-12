export function composeWGSL(chunks: readonly string[]): string {
  return chunks
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .join("\n\n");
}
