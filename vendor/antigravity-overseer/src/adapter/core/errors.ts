export class AdapterNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterNotReadyError";
  }
}

export class UiDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UiDriftError";
  }
}
