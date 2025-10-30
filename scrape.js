import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

export async function scrapeProfile(profileUrl) {
  console.log("🚀 Launching Chromium...");
  const executablePath = await chromium.executablePath();

  const browser = await puppeteerExtra.launch({
    args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();

  // Make it look more like a real browser
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/120.0.0.0 Safari/537.36"
  );

  try {
    console.log("🌐 Opening LinkedIn profile...");
    await page.goto(profileUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
  } catch (err) {
    console.log("⚠️ Retry loading page...");
    await page.goto(profileUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
  }

  const data = await page.evaluate(() => {
    const name = document.querySelector("h1")?.innerText?.trim() || "";
    const headline =
      document.querySelector(".text-body-medium.break-words")?.innerText?.trim() || "";
    const location =
      document.querySelector(".pv-text-details__left-panel div.text-body-small")?.innerText?.trim() || "";
    const photo =
      document.querySelector(".pv-top-card-profile-picture__image")?.src ||
      document.querySelector(".profile-photo-edit__preview")?.src ||
      "";
    return { name, headline, location, photo };
  });

  await browser.close();
  return data;
}
