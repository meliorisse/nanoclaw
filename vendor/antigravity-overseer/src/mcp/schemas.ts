export interface ToolDefinition<TArgs = unknown> {
  name: string;
  description: string;
  validate(args: unknown): TArgs;
}

export function validateObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Tool arguments must be an object.");
  }

  return value as Record<string, unknown>;
}

export function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected non-empty string for ${field}.`);
  }

  return value;
}

export function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return readString(value, field);
}
