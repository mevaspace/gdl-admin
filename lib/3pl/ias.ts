import puppeteer from "puppeteer-core";
import type { ThreePLAdapter, ThreePLCredential, FetchedDocument } from "./types";

const BASE_URL = "https://calis.ias.id";

async function htmlToPng(html: string): Promise<Buffer> {
  const isDev = process.env.NODE_ENV === "development";

  let executablePath: string;
  let args: string[];

  if (isDev) {
    const { executablePath: getPath } = await import("puppeteer");
    executablePath = await getPath();
    args = ["--no-sandbox", "--disable-setuid-sandbox"];
  } else {
    const chromium = (await import("@sparticuz/chromium")).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
  }

  const browser = await puppeteer.launch({ executablePath, args, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 1000 });
    await page.setContent(html, { waitUntil: "load" });
    const el = await page.$("#report-content");
    if (!el) throw new Error("IAS: #report-content not found in HTML");
    const buf = await el.screenshot({ type: "png" });
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  } finally {
    await browser.close();
  }
}

function headers(cookie: string): Record<string, string> {
  return {
    accept: "application/json, text/html",
    "accept-language": "en-US,en;q=0.9,id;q=0.8",
    "content-type": "application/json",
    origin: BASE_URL,
    referer: `${BASE_URL}/main/home`,
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    cookie,
  };
}

async function resolveCargoId(awb: string, cookie: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/main/advance_search/cargo`, {
    method: "POST",
    headers: headers(cookie),
    body: JSON.stringify({
      buid: "CTDPS",
      orby: "cargo_id",
      ordr: "asc",
      trandate: "all",
      awb: `*${awb}*`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error(`[IAS] resolveCargoId failed: status=${res.status} awb=${awb} body=${body}`);
    throw new Error(`IAS search gagal (${res.status}): ${body.slice(0, 200)}`);
  }

  const rawBody = await res.text();
  console.log(`[IAS] resolveCargoId awb=${awb} body=`, rawBody.slice(0, 300));

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new Error(`IAS search return bukan JSON (cookie expired?): ${rawBody.slice(0, 200)}`);
  }

  const cargoId = (json as { data?: { cargo_id?: string }[] })?.data?.[0]?.cargo_id;
  if (!cargoId) throw new Error(`Cargo ID tidak ditemukan untuk AWB: ${awb}`);

  return cargoId;
}

const ias: ThreePLAdapter = {
  name: "IAS",

  async fetchDocument(code: string, credential: ThreePLCredential): Promise<FetchedDocument> {
    const cookie = credential.cookie?.trim();
    if (!cookie) throw new Error("IAS: credential 'cookie' wajib diisi");

    // Step 1: AWB → cargo_id
    const cargoId = await resolveCargoId(code, cookie);

    // Step 2: cargo_id → HTML report
    const reportRes = await fetch(`${BASE_URL}/report/btb_new/${cargoId}`, {
      headers: { ...headers(cookie), "content-type": "text/html", accept: "text/html,*/*" },
    });

    if (!reportRes.ok) {
      const body = await reportRes.text().catch(() => "(unreadable)");
      console.error(`[IAS] report fetch failed: status=${reportRes.status} cargoId=${cargoId} body=${body.slice(0, 300)}`);
      throw new Error(`IAS report gagal (${reportRes.status}): ${body.slice(0, 200)}`);
    }

    const html = await reportRes.text();
    console.log(`[IAS] report HTML fetched: cargoId=${cargoId} length=${html.length}`);

    // Remove auto-print script so HTML can be opened without immediately printing
    const cleanHtml = html.replace(/<script[^>]*>[\s\S]*?window\.print\(\)[\s\S]*?<\/script>/gi, "");
    console.log(`[IAS] launching puppeteer for cargoId=${cargoId}`);
    const png = await htmlToPng(cleanHtml);
    console.log(`[IAS] puppeteer done: cargoId=${cargoId} pngSize=${png.length}`);

    return { data: png, ext: "png" };
  },
};

export default ias;
