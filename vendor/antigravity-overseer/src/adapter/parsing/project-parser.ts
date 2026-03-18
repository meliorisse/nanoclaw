import { splitBlocks } from "./normalization.ts";

export interface ParsedProject {
  externalProjectRef: string;
  name: string;
}

export function parseProjectList(visibleText: string): ParsedProject[] {
  return splitBlocks(visibleText)
    .filter((block) => block.toLowerCase().startsWith("project:"))
    .map((block) => {
      const name = block.replace(/^project:\s*/i, "").split("\n")[0]?.trim() ?? "Untitled Project";
      return {
        externalProjectRef: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name
      };
    });
}
