import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import "dotenv/config";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
puppeteerExtra.use(StealthPlugin());

const cookiePath = path.join(__dirname, "cookies.json");

async function loginAndSaveCookies(page) {
  console.log("🔐 Logging into LinkedIn...");
  await page.goto("https://www.linkedin.com/login", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  await page.type("#username", process.env.LINKEDIN_EMAIL, { delay: 50 });
  await page.type("#password", process.env.LINKEDIN_PASSWORD, { delay: 50 });
  await page.click('button[type="submit"]');

  try {
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
  } catch {}

  const cookies = await page.cookies();
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
  console.log("✅ Cookies saved.");
  return cookies;
}

async function ensureLoggedIn(page, profileUrl) {
  let cookies = [];
  if (fs.existsSync(cookiePath)) {
    try {
      cookies = JSON.parse(fs.readFileSync(cookiePath));
      await page.setCookie(...cookies);
    } catch (err) {
      console.log("⚠️ Invalid cookies, re-login...");
    }
  }

  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  if (page.url().includes("/login")) {
    await loginAndSaveCookies(page);
    const newCookies = JSON.parse(fs.readFileSync(cookiePath));
    await page.setCookie(...newCookies);
    await page.goto(profileUrl, { waitUntil: "networkidle2", timeout: 60000 });
  }
}

/**
 * ✅ Render-optimized scraping function
 */
export async function scrapeProfile(profileUrl) {
  console.log("Launching Chromium...");
  const executablePath = await chromium.executablePath();
  console.log("Using Chromium path:", executablePath);
  const browser = await puppeteerExtra.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: true,
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await ensureLoggedIn(page, profileUrl);

  await page.waitForSelector(".pv-top-card", { timeout: 40000 }).catch(() => {});

  const data = await page.evaluate(() => {
    const name =
      document.querySelector(".pv-text-details__left-panel h1")?.innerText.trim() ||
      document.querySelector("h1")?.innerText.trim() || "";

    const headline =
      document.querySelector(".pv-text-details__left-panel .text-body-medium")?.innerText.trim() ||
      "";

    const location =
      document.querySelector(".pv-text-details__left-panel .text-body-small.inline")?.innerText.trim() ||
      "";

    const photo =
      document.querySelector(".pv-top-card-profile-picture__image--show")?.src ||
      document.querySelector(".pv-top-card-profile-picture__image")?.src ||
      document.querySelector(".pv-top-card img")?.src || "";

    return { name, headline, location, photo };
  });

  await browser.close();
  return data;
}
