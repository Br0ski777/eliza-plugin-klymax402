/**
 * Duck-typed ElizaOS interfaces — no hard dependency on @elizaos/core.
 * ElizaOS checks plugin shape structurally, so this is safe across v1/v2.
 */

export interface ElizaContent {
  text?: string;
  [k: string]: unknown;
}

export interface ElizaMemory {
  content: ElizaContent;
  [k: string]: unknown;
}

export interface ElizaState {
  [k: string]: unknown;
}

export interface ElizaRuntime {
  getSetting: (key: string) => string | null | undefined;
  [k: string]: unknown;
}

export type ElizaHandlerCallback = (response: ElizaContent) => Promise<unknown>;

export interface ElizaAction {
  name: string;
  description: string;
  similes?: string[];
  examples?: unknown[];
  validate: (
    runtime: ElizaRuntime,
    message: ElizaMemory,
    state?: ElizaState,
  ) => Promise<boolean>;
  handler: (
    runtime: ElizaRuntime,
    message: ElizaMemory,
    state?: ElizaState,
    options?: unknown,
    callback?: ElizaHandlerCallback,
  ) => Promise<unknown>;
}

export interface ElizaPlugin {
  name: string;
  description: string;
  init?: (config: Record<string, unknown>, runtime: ElizaRuntime) => Promise<void>;
  actions?: ElizaAction[];
}
