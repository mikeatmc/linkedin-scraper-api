// scrape.js
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import chromium from "@sparticuz/chromium";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

puppeteerExtra.use(StealthPlugin());

const cookiePath = path.join(__dirname, "cookies.json");

// ----------------------------
// LOGIN + COOKIE HELPERS
// ----------------------------
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
    await page.waitForFunction(
      () => window.location.pathname.startsWith("/feed"),
      { timeout: 60000 }
    );
  } catch {
    await page.waitForSelector("#global-nav", { timeout: 15000 });
  }

  const cookies = await page.cookies();
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
  console.log("✅ Cookies saved.");
  return cookies;
}

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
    const cookies = await loginAndSaveCookies(page);
    await page.setCookie(...cookies);
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
}

// ----------------------------
// MAIN SCRAPER FUNCTION
// ----------------------------
export async function scrapeProfile(profileUrl) {
  console.log("🚀 Launching Chromium...");

  let executablePath;
  try {
    executablePath = await chromium.executablePath();
    console.log("✅ Using Chromium binary:", executablePath);
  } catch (err) {
    console.warn("⚠️ Failed to load @sparticuz/chromium. Falling back to system Chrome.");
    try {
      const fallback = execSync("which google-chrome || which chromium").toString().trim();
      executablePath = fallback || "/usr/bin/google-chrome";
      console.log("✅ Fallback Chrome path:", executablePath);
    } catch {
      executablePath = "/usr/bin/google-chrome";
    }
  }

  const browser = await puppeteerExtra.launch({
    headless: true,
    args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: chromium.defaultViewport,
    executablePath,
  });

  const page = await browser.newPage();
  await ensureLoggedIn(page, profileUrl);

  // Extract profile data
  const name = await page.$eval("h1", el => el.innerText.trim()).catch(() => "");
  const headline = await page.$eval(".text-body-medium.break-words", el => el.innerText.trim()).catch(() => "");
  const location = await page.$eval(".text-body-small.inline.t-black--light.break-words", el => el.innerText.trim()).catch(() => "");
  const photo = await page.$eval("img.pv-top-card-profile-picture__image, .pv-top-card__photo img", el => el.src).catch(() => "");

  await browser.close();
  return { name, headline, location, photo };
}
