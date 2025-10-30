import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cookiePath = path.join(__dirname, "cookies.json");

puppeteerExtra.use(StealthPlugin());

/* -----------------------------------
   🔐 Login Logic (forced real login)
----------------------------------- */
async function loginAndSaveCookies(page) {
  console.log("🔐 Logging into LinkedIn...");

  await page.goto("https://www.linkedin.com/login", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  await page.type("#username", process.env.LINKEDIN_EMAIL, { delay: 75 });
  await page.type("#password", process.env.LINKEDIN_PASSWORD, { delay: 75 });
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});

  // Retry if redirected to login again
  if (page.url().includes("/login") || page.url().includes("/checkpoint")) {
    console.log("⚠️ Login not successful, retrying...");
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle2" });
    await page.type("#username", process.env.LINKEDIN_EMAIL, { delay: 75 });
    await page.type("#password", process.env.LINKEDIN_PASSWORD, { delay: 75 });
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
  }

  const cookies = await page.cookies();
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
  console.log("✅ Cookies saved successfully.");
  return cookies;
}

/* -----------------------------------
   🔁 Ensure Logged In with Cookie Fallback
----------------------------------- */
async function ensureLoggedIn(page, profileUrl) {
  if (fs.existsSync(cookiePath)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(cookiePath));
      await page.setCookie(...cookies);
      console.log("✅ Loaded cookies from file.");
    } catch {
      console.log("⚠️ Invalid cookies, re-login required.");
      await loginAndSaveCookies(page);
    }
  } else {
    await loginAndSaveCookies(page);
  }

  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  if (page.url().includes("/login")) {
    console.log("🔁 Re-login detected...");
    await loginAndSaveCookies(page);
    const cookies = JSON.parse(fs.readFileSync(cookiePath));
    await page.setCookie(...cookies);
    await page.goto(profileUrl, { waitUntil: "networkidle2", timeout: 60000 });
  }
}

/* -----------------------------------
   🧠 Scrape LinkedIn Profile
----------------------------------- */
export async function scrapeProfile(profileUrl) {
  console.log("🚀 Launching Chromium...");
  const executablePath = await chromium.executablePath;

  const browser = await puppeteerExtra.launch({
    headless: true,
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
  );

  await ensureLoggedIn(page, profileUrl);

  await page.waitForSelector(".pv-top-card", { timeout: 20000 }).catch(() => {});

  const data = await page.evaluate(() => {
    const getText = (sel) => document.querySelector(sel)?.innerText?.trim() || "";
    const getAttr = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || "";

    return {
      name:
        getText("h1") ||
        getText(".text-heading-xlarge") ||
        getText(".pv-text-details__left-panel h1"),
      headline:
        getText(".text-body-medium.break-words") ||
        getText(".pv-text-details__left-panel div"),
      location:
        getText(".pb2.pv-text-details__left-panel.text-body-small.inline.t-black--light.break-words") ||
        getText(".pv-top-card--list-bullet li"),
      photo:
        getAttr(".pv-top-card-profile-picture__image--show", "src") ||
        getAttr(".pv-top-card-profile-picture__image", "src") ||
        getAttr(".pv-top-card__photo img", "src") ||
        getAttr(".profile-photo-edit__preview", "src"),
    };
  });

  await browser.close();

  console.log("✅ Scraping complete!");
  return {
    name: data.name || "",
    headline: data.headline || "",
    location: data.location || "",
    photo: data.photo || "",
  };
}
