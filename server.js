import express from "express";
import { scrapeProfile } from "./scrape.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("✅ LinkedIn Scraper API is running");
});

app.get("/scrape", async (req, res) => {
  const profileUrl = req.query.url;
  if (!profileUrl) {
    return res.status(400).json({ error: "Missing ?url= parameter" });
  }

  try {
    const data = await scrapeProfile(profileUrl);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
