// A stand-in for the model API: a local HTTP server that answers Codex's `POST /v1/responses` with
// the server-sent events of the Responses API. A scenario decides what the "model" does next from
// the conversation Codex sent, so a real `codex exec` runs the whole workflow with no network and
// no key: its hooks, subagents and tools are real, only the model is scripted.

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** One item of the conversation Codex sends with every request (the history grows each time). */
export interface InputItem {
  type?: string;
  role?: string;
  name?: string;
  content?: { type?: string; text?: string }[];
  [field: string]: unknown;
}

/** A request for the next model turn. */
export interface ModelRequest {
  /** Model the request asks for. */
  model?: string;
  /** Conversation so far, in order. */
  input: InputItem[];
  /** Tools offered to the model. */
  tools?: { type?: string; name?: string }[];
}

/** What the scripted model does in one turn. */
export type ModelTurn =
  | { kind: "message"; text: string }
  | { kind: "tool_search"; query: string }
  | { kind: "function_call"; name: string; namespace?: string; arguments: object }
  | { kind: "apply_patch"; patch: string };

/** Decides the model's next turn from the conversation. */
export type Scenario = (request: ModelRequest) => ModelTurn;

/** A running mock API. */
export interface MockResponses {
  /** Address for `base_url` in the Codex config. */
  baseUrl: string;
  /** Requests received so far. */
  requests: readonly ModelRequest[];
  /**
   * Stops the server.
   * @throws {Error} If the scenario threw or a request was not JSON: the mock answered 500 with the
   *   reason, and the cause must not hide behind a failed Codex run.
   */
  close(): Promise<void>;
}

const USAGE = {
  input_tokens: 7,
  input_tokens_details: null,
  output_tokens: 3,
  output_tokens_details: null,
  total_tokens: 10,
};

function sseOf(events: readonly object[]): string {
  return events
    .map(
      (event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join("");
}

function itemOf(turn: ModelTurn, id: string): object {
  switch (turn.kind) {
    case "message":
      return {
        type: "message",
        role: "assistant",
        id: `m-${id}`,
        content: [{ type: "output_text", text: turn.text }],
      };
    case "tool_search":
      return {
        type: "tool_search_call",
        call_id: `c-${id}`,
        execution: "client",
        arguments: { query: turn.query },
      };
    case "function_call":
      return {
        type: "function_call",
        call_id: `c-${id}`,
        name: turn.name,
        ...(turn.namespace === undefined ? {} : { namespace: turn.namespace }),
        arguments: JSON.stringify(turn.arguments),
      };
    case "apply_patch":
      return {
        type: "custom_tool_call",
        call_id: `c-${id}`,
        name: "apply_patch",
        input: turn.patch,
      };
    default:
      return turn satisfies never;
  }
}

function responseOf(turn: ModelTurn, id: string): string {
  return sseOf([
    { type: "response.created", response: { id } },
    { type: "response.output_item.done", item: itemOf(turn, id) },
    { type: "response.completed", response: { id, usage: USAGE } },
  ]);
}

async function bodyOf(incoming: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of incoming) chunks.push(chunk as Buffer);

  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Starts the mock API on a free local port.
 * @param {Scenario} scenario How the scripted model answers.
 * @returns {Promise<MockResponses>} The running mock.
 */
export async function startMockResponses(scenario: Scenario): Promise<MockResponses> {
  const requests: ModelRequest[] = [];
  const failures: string[] = [];
  const server: Server = createServer((incoming, outgoing) => {
    if (incoming.method !== "POST") {
      outgoing.writeHead(200, { "content-type": "application/json" }).end('{"models":[]}');

      return;
    }

    void bodyOf(incoming)
      .then((body) => {
        const request = JSON.parse(body) as ModelRequest;

        requests.push(request);

        const reply = responseOf(scenario(request), `r${requests.length}`);

        outgoing.writeHead(200, { "content-type": "text/event-stream" }).end(reply);
      })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);

        failures.push(reason);
        outgoing.writeHead(500, { "content-type": "text/plain" }).end(`mock failed: ${reason}`);
      });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));

      if (failures.length > 0) throw new Error(`the mock failed: ${failures.join("; ")}`);
    },
  };
}
