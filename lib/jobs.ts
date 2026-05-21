import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { getRedis } from "@/lib/redis";
import type { DocumentRequest, ThreePLCredential } from "@/lib/3pl/types";

export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface JobState {
  id: string;
  status: JobStatus;
  total: number;
  done: number;
  failed: number;
  blobUrl?: string;
  errors?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface JobPayload {
  documents: DocumentRequest[];
  credentials: Record<string, ThreePLCredential>;
}

const TTL_STATE = 60 * 60 * 24;   // 24h
const TTL_PAYLOAD = 60 * 60 * 2;  // 2h

function key(id: string) { return `job:${id}`; }
function payloadKey(id: string) { return `job:${id}:payload`; }

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

export async function createJob(payload: JobPayload): Promise<string> {
  const id = randomBytes(12).toString("hex");
  const now = Date.now();
  const state: JobState = {
    id,
    status: "pending",
    total: payload.documents.length,
    done: 0,
    failed: 0,
    createdAt: now,
    updatedAt: now,
  };
  const redis = getRedis();
  await Promise.all([
    redis.set(key(id), JSON.stringify(state), { ex: TTL_STATE }),
    redis.set(payloadKey(id), encryptPayload(payload), { ex: TTL_PAYLOAD }),
  ]);
  return id;
}

export async function getJob(id: string): Promise<JobState | null> {
  const redis = getRedis();
  const raw = await redis.get<string | JobState>(key(id));
  if (!raw) return null;
  if (typeof raw === "string") return JSON.parse(raw) as JobState;
  return raw;
}

export async function updateJob(id: string, patch: Partial<JobState>): Promise<JobState | null> {
  const current = await getJob(id);
  if (!current) return null;
  const merged: JobState = { ...current, ...patch, updatedAt: Date.now() };
  await getRedis().set(key(id), JSON.stringify(merged), { ex: TTL_STATE });
  return merged;
}

export async function loadPayload(id: string): Promise<JobPayload | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(payloadKey(id));
  if (!raw) return null;
  return decryptPayload(raw);
}

export async function deletePayload(id: string): Promise<void> {
  await getRedis().del(payloadKey(id));
}
