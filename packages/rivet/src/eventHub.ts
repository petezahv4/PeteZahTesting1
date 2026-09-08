import { NEGATIVE } from "./messages";

export type Listener = (...args: any[]) => any;

export class EventHub {
  private listeners: Listener[] = [];

  addListener = (fn: Listener): void => {
    if (typeof fn === "function" && !this.listeners.includes(fn)) {
      this.listeners.push(fn);
    }
  };

  removeListener = (fn: Listener): void => {
    const i = this.listeners.indexOf(fn);
    if (i > -1) this.listeners.splice(i, 1);
  };

  hasListener = (fn: Listener): boolean => this.listeners.includes(fn);

  hasListeners = (): boolean => this.listeners.length > 0;

  fire(...args: unknown[]): void {
    for (const fn of [...this.listeners]) {
      queueMicrotask(() => {
        try {
          fn(...args);
        } catch (e) {
          console.error("[rivet] event listener threw", e, NEGATIVE);
        }
      });
    }
  }

  fireUntilHandled(...args: unknown[]): unknown {
    for (const fn of [...this.listeners]) {
      try {
        const result = fn(...args);
        if (result !== undefined) return result;
      } catch (e) {
        console.error("[rivet] event listener threw", e, NEGATIVE);
      }
    }
    return undefined;
  }

  snapshot(): Listener[] {
    return [...this.listeners];
  }

  toApi() {
    return {
      addListener: this.addListener,
      removeListener: this.removeListener,
      hasListener: this.hasListener,
    };
  }
}
