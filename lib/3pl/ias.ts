import { htmlToPng } from '../browser';
import type { ThreePLAdapter, ThreePLCredential, FetchedDocument } from './types';

const BASE_URL = 'https://calis.ias.id';

function headers(cookie: string): Record<string, string> {
  return {
    accept: 'application/json, text/html',
    'accept-language': 'en-US,en;q=0.9,id;q=0.8',
    'content-type': 'application/json',
    origin: BASE_URL,
    referer: `${BASE_URL}/main/home`,
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    cookie,
  };
}

interface CargoDetail {
  cargo_id: string | null;
  chw: string | null;
  qty: number;
}

async function resolveCargo(awb: string, cookie: string): Promise<CargoDetail> {
  const res = await fetch(`${BASE_URL}/main/advance_search/cargo`, {
    method: 'POST',
    headers: headers(cookie),
    body: JSON.stringify({
      buid: 'CTDPS',
      orby: 'cargo_id',
      ordr: 'asc',
      trandate: 'all',
      awb: `*${awb}*`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    console.error(`[IAS] resolveCargo failed: status=${res.status} awb=${awb} body=${body}`);
    throw new Error(`IAS search gagal (${res.status}): ${body.slice(0, 200)}`);
  }

  const rawBody = await res.text();
  console.log(`[IAS] resolveCargo awb=${awb} body=`, rawBody.slice(0, 300));

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new Error(`IAS search return bukan JSON (cookie expired?): ${rawBody.slice(0, 200)}`);
  }

  const cargo = (json as { data?: CargoDetail[] })?.data?.[0];
  if (!cargo?.cargo_id) throw new Error(`Cargo ID tidak ditemukan untuk AWB: ${awb}`);

  return cargo;
}

const ias: ThreePLAdapter = {
  name: 'IAS',

  async fetchDocument(identifier: string, credential: ThreePLCredential): Promise<FetchedDocument> {
    const cookie = credential.cookie?.trim();
    if (!cookie) throw new Error("IAS: credential 'cookie' wajib diisi");

    // Step 1: AWB → cargo detail (cargo_id + chw)
    const cargo = await resolveCargo(identifier, cookie);
    const cargoId = cargo.cargo_id!;
    const weight = cargo.chw ? parseFloat(cargo.chw) : 0;
    const colly = cargo.qty ?? 0;

    // Step 2: cargo_id → HTML report
    const reportRes = await fetch(`${BASE_URL}/report/btb_new/${cargoId}`, {
      headers: { ...headers(cookie), 'content-type': 'text/html', accept: 'text/html,*/*' },
    });

    if (!reportRes.ok) {
      const body = await reportRes.text().catch(() => '(unreadable)');
      console.error(
        `[IAS] report fetch failed: status=${reportRes.status} cargoId=${cargoId} body=${body.slice(0, 300)}`,
      );
      throw new Error(`IAS report gagal (${reportRes.status}): ${body.slice(0, 200)}`);
    }

    const html = await reportRes.text();
    console.log(`[IAS] report HTML fetched: cargoId=${cargoId} length=${html.length}`);

    // Remove auto-print script so HTML can be opened without immediately printing
    const cleanHtml = html.replace(/<script[^>]*>[\s\S]*?window\.print\(\)[\s\S]*?<\/script>/gi, '');
    console.log(`[IAS] launching puppeteer for cargoId=${cargoId}`);
    const png = await htmlToPng(cleanHtml, '#report-content');
    console.log(`[IAS] puppeteer done: cargoId=${cargoId} pngSize=${png.length}`);

    return { data: png, ext: 'png', metadata: { weight, colly } };
  },
};

export default ias;
