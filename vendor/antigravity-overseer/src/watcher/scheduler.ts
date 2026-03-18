export class Scheduler {
  private timer: NodeJS.Timeout | null = null;

  start(intervalMs: number, task: () => Promise<void>): void {
    this.stop();
    this.timer = setInterval(() => {
      void task();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
