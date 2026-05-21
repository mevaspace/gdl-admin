import { Client, Receiver } from "@upstash/qstash";

let _client: Client | null = null;
let _receiver: Receiver | null = null;

export function getQStashClient(): Client {
  if (_client) return _client;
  _client = new Client({ token: process.env.QSTASH_TOKEN! });
  return _client;
}

export function getQStashReceiver(): Receiver {
  if (_receiver) return _receiver;
  _receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  });
  return _receiver;
}
