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
      console.log("⚠️ Invalid cookies file, re-login...");
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
 * ✅ Render-optimized scraper function
 */
export async function scrapeProfile(profileUrl) {
  const browser = await puppeteerExtra.launch({
    args: [
      ...chromium.args,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--single-process",
    ],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  const page = await browser.newPage();
  await ensureLoggedIn(page, profileUrl);

  // Wait for LinkedIn to render profile data
  await page.waitForSelector(".pv-top-card", { timeout: 30000 }).catch(() => {});

  const data = await page.evaluate(() => {
    const name =
      document.querySelector(".pv-text-details__left-panel h1")?.innerText.trim() ||
      document.querySelector("h1")?.innerText.trim() ||
      "";

    const headline =
      document.querySelector(".pv-text-details__left-panel .text-body-medium")?.innerText.trim() ||
      document.querySelector(".text-body-medium")?.innerText.trim() ||
      "";

    const location =
      document.querySelector(".pv-text-details__left-panel .text-body-small")?.innerText.trim() ||
      document.querySelector(".text-body-small")?.innerText.trim() ||
      "";

    const photo =
      document.querySelector(".pv-top-card-profile-picture__image--show")?.src ||
      document.querySelector(".pv-top-card-profile-picture__image")?.src ||
      document.querySelector(".pv-top-card img")?.src ||
      "";

    return { name, headline, location, photo };
  });

  await browser.close();
  return data;
}
