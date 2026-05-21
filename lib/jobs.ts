import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { getRedis } from "@/lib/redis";
import type { DocumentRequest, ThreePLCredential } from "@/lib/3pl/types";

export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface JobPart {
  batchIndex: number;
  blobUrl: string;
  count: number;
  failed: number;
}

export interface JobState {
  id: string;
  status: JobStatus;
  total: number;
  done: number;
  failed: number;
  batchSize: number;
  batchesTotal: number;
  batchesCompleted: number;
  parts: JobPart[];
  errors: string[];
  createdAt: number;
  updatedAt: number;
}

export interface JobPayload {
  documents: DocumentRequest[];
  credentials: Record<string, ThreePLCredential>;
}

const TTL_STATE = 60 * 60 * 24;   // 24h
const TTL_PAYLOAD = 60 * 60 * 3;  // 3h
const TTL_LISTS = 60 * 60 * 24;

const stateKey = (id: string) => `job:${id}`;
const payloadKey = (id: string) => `job:${id}:payload`;
const partsKey = (id: string) => `job:${id}:parts`;
const errorsKey = (id: string) => `job:${id}:errors`;

function deriveKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET missing");
  return createHash("sha256").update(secret).digest();
}

export function encryptPayload(payload: JobPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf-8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptPayload(encoded: string): JobPayload {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString("utf-8")) as JobPayload;
}

export async function createJob(
  payload: JobPayload,
  batchSize: number,
  batchesTotal: number,
): Promise<string> {
  const id = randomBytes(12).toString("hex");
  const now = Date.now();
  const redis = getRedis();
  await Promise.all([
    redis.hset(stateKey(id), {
      id,
      status: "pending",
      total: payload.documents.length,
      done: 0,
      failed: 0,
      batchSize,
      batchesTotal,
      batchesCompleted: 0,
      createdAt: now,
      updatedAt: now,
    }),
    redis.expire(stateKey(id), TTL_STATE),
    redis.set(payloadKey(id), encryptPayload(payload), { ex: TTL_PAYLOAD }),
  ]);
  return id;
}

export async function getJob(id: string): Promise<JobState | null> {
  const redis = getRedis();
  const [hash, parts, errors] = await Promise.all([
    redis.hgetall<Record<string, string | number>>(stateKey(id)),
    redis.lrange(partsKey(id), 0, -1),
    redis.lrange(errorsKey(id), 0, -1),
  ]);
  if (!hash || Object.keys(hash).length === 0) return null;

  const num = (k: string) => Number(hash[k] ?? 0);

  return {
    id: String(hash.id ?? id),
    status: (hash.status as JobStatus) ?? "pending",
    total: num("total"),
    done: num("done"),
    failed: num("failed"),
    batchSize: num("batchSize"),
    batchesTotal: num("batchesTotal"),
    batchesCompleted: num("batchesCompleted"),
    parts: parts.map((p) => (typeof p === "string" ? JSON.parse(p) : p)) as JobPart[],
    errors: errors.map((e) => String(e)),
    createdAt: num("createdAt"),
    updatedAt: num("updatedAt"),
  };
}

export async function loadPayload(id: string): Promise<JobPayload | null> {
  const raw = await getRedis().get<string>(payloadKey(id));
  if (!raw) return null;
  return decryptPayload(raw);
}

export async function deletePayload(id: string): Promise<void> {
  await getRedis().del(payloadKey(id));
}

export async function markProcessing(id: string): Promise<void> {
  const redis = getRedis();
  await redis.hset(stateKey(id), { status: "processing", updatedAt: Date.now() });
}

export interface BatchResult {
  batchIndex: number;
  blobUrl: string | null;
  doneInBatch: number;
  failedInBatch: number;
  errors: string[];
}

/**
 * Atomic-ish report: increment counters, push part/error lists, mark done if last batch.
 * Returns the new batchesCompleted count.
 */
export async function reportBatchResult(id: string, result: BatchResult): Promise<{
  batchesCompleted: number;
  batchesTotal: number;
  finalized: boolean;
}> {
  const redis = getRedis();
  const now = Date.now();

  const ops: Promise<unknown>[] = [
    redis.hincrby(stateKey(id), "done", result.doneInBatch),
    redis.hincrby(stateKey(id), "failed", result.failedInBatch),
    redis.hset(stateKey(id), { updatedAt: now }),
  ];

  if (result.blobUrl) {
    const part: JobPart = {
      batchIndex: result.batchIndex,
      blobUrl: result.blobUrl,
      count: result.doneInBatch,
      failed: result.failedInBatch,
    };
    ops.push(redis.rpush(partsKey(id), JSON.stringify(part)));
    ops.push(redis.expire(partsKey(id), TTL_LISTS));
  }

  if (result.errors.length) {
    ops.push(redis.rpush(errorsKey(id), ...result.errors));
    ops.push(redis.expire(errorsKey(id), TTL_LISTS));
  }

  await Promise.all(ops);

  const batchesCompleted = await redis.hincrby(stateKey(id), "batchesCompleted", 1);
  const batchesTotal = Number(await redis.hget(stateKey(id), "batchesTotal")) || 0;

  let finalized = false;
  if (batchesCompleted >= batchesTotal && batchesTotal > 0) {
    const partsCount = await redis.llen(partsKey(id));
    const status: JobStatus = partsCount > 0 ? "done" : "failed";
    await redis.hset(stateKey(id), { status, updatedAt: Date.now() });
    await deletePayload(id);
    finalized = true;
  }

  return { batchesCompleted, batchesTotal, finalized };
}

export function chunkDocuments(documents: DocumentRequest[], batchSize: number): DocumentRequest[][] {
  const chunks: DocumentRequest[][] = [];
  for (let i = 0; i < documents.length; i += batchSize) {
    chunks.push(documents.slice(i, i + batchSize));
  }
  return chunks;
}
