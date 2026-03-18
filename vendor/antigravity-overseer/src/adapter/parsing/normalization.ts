export function normalizeVisibleText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

export function splitBlocks(value: string): string[] {
  return normalizeVisibleText(value)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}
