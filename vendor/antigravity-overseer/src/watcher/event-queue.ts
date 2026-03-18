export class EventQueue<T> {
  private readonly events: T[] = [];

  push(event: T): void {
    this.events.push(event);
  }

  drain(): T[] {
    return this.events.splice(0, this.events.length);
  }
}
