export interface ThreePLCredential {
  [key: string]: string;
}

export interface DocumentRequest {
  code: string;
  service: string;
}

export interface FetchedDocument {
  data: Buffer;
  ext: string;
}

export interface ThreePLAdapter {
  name: string;
  fetchDocument(code: string, credential: ThreePLCredential): Promise<FetchedDocument>;
}
