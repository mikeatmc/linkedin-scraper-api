import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

export async function scrapeProfile(profileUrl) {
  const browser = await puppeteerExtra.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  const page = await browser.newPage();
  await page.goto(profileUrl, { waitUntil: "domcontentloaded" });

  const name = await page.$eval("h1", el => el.innerText.trim()).catch(() => "");
  const headline = await page
    .$eval(".text-body-medium", el => el.innerText.trim())
    .catch(() => "");

  await browser.close();

  return { name, headline };
}
