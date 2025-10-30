import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

export async function scrapeProfile(profileUrl) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
    ],
  });

  const page = await browser.newPage();
  await page.goto(profileUrl, { waitUntil: "networkidle2" });

  const name = await page.$eval("h1", el => el.innerText.trim()).catch(() => "");
  const headline = await page.$eval(".text-body-medium", el => el.innerText.trim()).catch(() => "");

  await browser.close();
  return { name, headline };
}
