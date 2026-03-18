export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function secondsSince(timestamp: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(timestamp).getTime()) / 1000));
}

export function isOlderThan(timestamp: string | null, thresholdSeconds: number, now = new Date()): boolean {
  if (!timestamp) {
    return true;
  }

  return secondsSince(timestamp, now) >= thresholdSeconds;
}
