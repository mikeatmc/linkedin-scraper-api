import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();
puppeteerExtra.use(StealthPlugin());

const cookiePath = path.join(process.cwd(), "cookies.json");

/** 🔐 Login and save cookies */
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
  } catch {
    console.log("⚠️ Login redirect timeout, continuing...");
  }

  const cookies = await page.cookies();
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
  console.log("✅ Cookies saved.");
  return cookies;
}

/** 👤 Ensure logged in before visiting profile */
async function ensureLoggedIn(page, profileUrl) {
  let needLogin = false;

  if (!fs.existsSync(cookiePath)) {
    needLogin = true;
  } else {
    try {
      const cookies = JSON.parse(fs.readFileSync(cookiePath));
      if (!cookies.length) needLogin = true;
      else await page.setCookie(...cookies);
    } catch {
      needLogin = true;
    }
  }

  if (needLogin) await loginAndSaveCookies(page);

  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  if (page.url().includes("/login")) {
    console.log("⚠️ Session expired, re-logging in...");
    const cookies = await loginAndSaveCookies(page);
    await page.setCookie(...cookies);
    await page.goto(profileUrl, { waitUntil: "networkidle2" });
  }
}

/** 🧠 Scrape LinkedIn profile info */
export async function scrapeProfile(profileUrl) {
  const executablePath = await chromium.executablePath();

  const browser = await puppeteerExtra.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: executablePath,
    headless: chromium.headless,
  });

  const page = await browser.newPage();
  await ensureLoggedIn(page, profileUrl);

  // Wait for profile header
  await page.waitForSelector(".pv-top-card", { timeout: 30000 }).catch(() => {});

  const data = await page.evaluate(() => {
    const safeText = (selector) =>
      document.querySelector(selector)?.innerText?.trim() || "";
    const safeSrc = (selector) =>
      document.querySelector(selector)?.src?.trim() || "";

    return {
      name:
        safeText(".pv-top-card h1") ||
        safeText(".text-heading-xlarge") ||
        safeText(".top-card-layout__title"),
      headline:
        safeText(".pv-text-details__left-panel .text-body-medium") ||
        safeText(".top-card-layout__headline"),
      location:
        safeText(".pv-text-details__left-panel .text-body-small.inline.t-black--light.break-words") ||
        safeText(".top-card__subline-item"),
      photo:
        safeSrc("img.pv-top-card-profile-picture__image") ||
        safeSrc("img.profile-photo-edit__preview") ||
        safeSrc(".pv-top-card__photo img"),
    };
  });

  await browser.close();
  return data;
}
