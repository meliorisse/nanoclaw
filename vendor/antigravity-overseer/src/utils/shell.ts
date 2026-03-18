import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCallback);

export async function runShellCommand(command: string): Promise<string> {
  const { stdout } = await exec(command, {
    shell: "/bin/zsh",
    maxBuffer: 10 * 1024 * 1024
  });

  return stdout;
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
