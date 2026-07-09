import type { AiCommandMessage, AppMutation } from "../../types/domain";

export class AiEngineClient {
  private worker: Worker | null = null;
  private messageListeners: ((msg: { reply: string, mutations: AppMutation[] }) => void)[] = [];

  constructor() {
    if (typeof window !== "undefined") {
      this.worker = new Worker(new URL("./aiWorker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (event) => {
        for (const listener of this.messageListeners) {
          listener(event.data);
        }
      };
    }
  }

  public sendCommand(command: string): Promise<{ reply: string; mutations: AppMutation[] }> {
    return new Promise((resolve) => {
      const listener = (data: { reply: string; mutations: AppMutation[] }) => {
        resolve(data);
        this.messageListeners = this.messageListeners.filter((l) => l !== listener);
      };
      this.messageListeners.push(listener);
      this.worker?.postMessage({ command });
    });
  }

  public destroy() {
    this.worker?.terminate();
  }
}
