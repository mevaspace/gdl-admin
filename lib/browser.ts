import puppeteer from "puppeteer-core";
import path from "path";
import type { Browser } from "puppeteer-core";

let chromiumInitPromise: Promise<{ executablePath: string; args: string[] }> | null = null;
let browserPromise: Promise<Browser> | null = null;

function getChromium() {
  if (!chromiumInitPromise) {
    chromiumInitPromise = (async () => {
      if (process.env.NODE_ENV === "development") {
        const { executablePath: getPath } = await import("puppeteer");
        return {
          executablePath: await getPath(),
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        };
      }
      const chromium = (await import("@sparticuz/chromium")).default;
      return {
        executablePath: await chromium.executablePath(
          path.join(process.cwd(), "chromium-bin")
        ),
        args: chromium.args,
      };
    })();
  }
  return chromiumInitPromise;
}

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { executablePath, args } = await getChromium();
      const browser = await puppeteer.launch({ executablePath, args, headless: true });
      browser.once("disconnected", () => { browserPromise = null; });
      return browser;
    })();
  }
  return browserPromise;
}

export async function htmlToPng(html: string, selector = "body"): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1000, height: 1000 });
    await page.setContent(html, { waitUntil: "load" });
    const el = await page.$(selector);
    if (!el) throw new Error(`Selector "${selector}" not found in HTML`);
    const buf = await el.screenshot({ type: "png" });
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  } finally {
    await page.close();
  }
}
