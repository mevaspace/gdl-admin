import JSZip from "jszip";

export interface ZipEntry {
  folder: string;
  filename: string;
  data: Buffer;
}

export async function buildZip(entries: ZipEntry[]): Promise<Buffer> {
  const zip = new JSZip();

  for (const entry of entries) {
    zip.folder(entry.folder)!.file(entry.filename, entry.data);
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) as Promise<Buffer>;
}
