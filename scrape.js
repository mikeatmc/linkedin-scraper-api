import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

puppeteerExtra.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cookiePath = path.join(__dirname, "cookies.json");

async function loginLinkedIn(page) {
  console.log("🔐 Logging into LinkedIn...");
  await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
  await page.type("#username", process.env.LINKEDIN_EMAIL, { delay: 50 });
  await page.type("#password", process.env.LINKEDIN_PASSWORD, { delay: 50 });
  await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation()]);
  const cookies = await page.cookies();
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
  console.log("✅ Cookies saved.");
  return cookies;
}

async function useCookies(page) {
  if (!fs.existsSync(cookiePath)) return null;
  const cookies = JSON.parse(fs.readFileSync(cookiePath));
  if (!cookies.length) return null;
  await page.setCookie(...cookies);
  return cookies;
}

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
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  const cookies = await useCookies(page);
  if (!cookies) await loginLinkedIn(page);

  console.log("🌐 Opening profile:", profileUrl);
  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 90000 });

  if (page.url().includes("/login")) {
    console.log("🔁 Session expired, re-logging in...");
    await loginLinkedIn(page);
    await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
  }

  const data = await page.evaluate(() => {
    const name = document.querySelector("h1")?.innerText?.trim() || "";
    const headline = document.querySelector(".text-body-medium.break-words")?.innerText?.trim() || "";
    const location = document.querySelector(".pv-text-details__left-panel div.text-body-small")?.innerText?.trim() || "";
    const photo =
      document.querySelector(".pv-top-card-profile-picture__image")?.src ||
      document.querySelector(".profile-photo-edit__preview")?.src ||
      "";
    return { name, headline, location, photo };
  });

  await browser.close();
  return data;
}
