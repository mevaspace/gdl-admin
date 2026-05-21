export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface JobPart {
  batchIndex: number;
  blobUrl: string;
  count: number;
  failed: number;
}

export interface JobView {
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
}
