export interface ThreePLCredential {
  [key: string]: string;
}

export interface DocumentRequest {
  name: string;
  identifier: string;
  service: string;
}

export interface FetchedDocument {
  data: Buffer;
  ext: string;
  metadata?: Record<string, string | number>;
}

export interface ThreePLAdapter {
  name: string;
  fetchDocument(identifier: string, credential: ThreePLCredential): Promise<FetchedDocument>;
}
