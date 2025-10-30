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
  await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle2" });

  await page.type("#username", process.env.LINKEDIN_EMAIL, { delay: 50 });
  await page.type("#password", process.env.LINKEDIN_PASSWORD, { delay: 50 });

  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ]);

  const cookies = await page.cookies();
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
  console.log("✅ New cookies saved successfully!");
  return cookies;
}

async function useCookies(page) {
  console.log("🍪 Checking for existing cookies...");
  if (!fs.existsSync(cookiePath)) {
    console.log("⚠️ No cookies.json file found.");
    return null;
  }

  const cookies = JSON.parse(fs.readFileSync(cookiePath));
  if (!cookies || cookies.length === 0) {
    console.log("⚠️ cookies.json is empty — need to log in again.");
    return null;
  }

  await page.setCookie(...cookies);
  console.log(`✅ Loaded ${cookies.length} cookies from file.`);
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
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/120.0.0.0 Safari/537.36"
  );

  let cookies = await useCookies(page);
  if (!cookies) {
    console.log("🔄 No valid cookies — performing LinkedIn login...");
    cookies = await loginLinkedIn(page);
  } else {
    console.log("✅ Using existing cookies — skipping login.");
  }

  console.log("🌐 Opening profile:", profileUrl);
  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 90000 });

  // If redirected to login, re-login and re-save cookies
  if (page.url().includes("/login")) {
    console.log("🔁 Session expired — need to re-login.");
    await loginLinkedIn(page);
    await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
  }

  try {
    await page.waitForSelector("h1", { timeout: 30000 });
  } catch {
    console.log("⚠️ Couldn't find profile name; reloading...");
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForSelector("h1", { timeout: 30000 });
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

  console.log("📦 Scraped Data:", data);
  await browser.close();
  console.log("✅ Browser closed successfully.");
  return data;
}
