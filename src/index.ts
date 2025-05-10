import express from "express";
const PORT = 3001;
const app = express();
import axios from "axios";
import dotenv from "dotenv";
import OpenAI from "openai";
import cors from "cors";
import { log } from "console";
import { GoogleGenAI } from "@google/genai";

app.use(cors());
dotenv.config();
app.use(express.json());

// Cache for GitHub API responses
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

// const previousRoasts = new Map<string, string>();
app.post("/compare-users", async (req: any, res: any) => {
  try {
    const { user1, user2 } = req.body;

    // Parallel user validation
    const [isUser1Valid, isUser2Valid] = await Promise.all([
      checkIfUserIsValid(user1),
      checkIfUserIsValid(user2),
    ]);

    if (!isUser1Valid) {
      return res.json({ success: false, message: `${user1} does not exist` });
    }
    log("user 1 is valid");
    if (!isUser2Valid) {
      return res.json({ success: false, message: `${user2} does not exist` });
    }
    log("user 2 is valid");

    // Parallel repo fetching
    const [user1Repos, user2Repos] = await Promise.all([
      giveAllPublicRepos(user1),
      giveAllPublicRepos(user2),
    ]);

    console.log("Now, comparing them");

    const roast = await compareUsers(user1Repos, user2Repos);
    console.log(roast);

    return res.json({
      success: true,
      roast,
    });
  } catch (e: any) {
    res.json({ success: false, message: e.message });
  }
});

async function compareUsers(u1: string, u2: string): Promise<string> {
  try {
    const today = new Date().toISOString().split("T")[0]; // Get current date in YYYY-MM-DD format

    const completion = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `ROAST THESE TWO GITHUB USERS 👇
    User 1: ${u1}
    User 2: ${u2}
    Today's date: ${today}`,
      config: {
        systemInstruction: `
      **ROASTMASTER PROTOCOL v2.0 – "NO SURVIVORS"**

  You are the unchecked microphone at a midnight comedy club where repos go to cry.  Your job: weaponize every GitHub stat, stale commit, and cringe project name into pure verbal napalm.

  1. **COMEDY ARSENAL**  
     - Ludicrous metaphors: "Your commit graph looks like a cardiogram **after** the flat-line."  
     - Pop-culture gut-punches: reference films, memes, and tech folklore from ​*The Matrix* to *Mr. Robot*.  
     - Tech puns & analogies: celebrate dead APIs, deprecated frameworks, and NPM dependency hell.  
     - Ruthless callbacks: quote their own repo titles ("final-FINAL-v7") as the setup to the punchline.

  2. **DATA-DRIVEN BURNS** – Work at least **four** of these per user:  
     'repo_count', 'star_total', 'fork_total', 'watcher_total', 'dominant_language', 'last_commit_age', 'open_issues', 'commit_frequency'.

  3. **OUTPUT FORMAT (HTML)**  
  html
  <div class="roast-container">
    <div class="user-roast">
    <h3>{username} ♂️</h3>
    <p>{Paragraph 1 (~80 words)}</p>
    <p>{Paragraph 2 (~80 words)}</p>
    </div>
  </div>
    `,
      },
    });

    return completion.text || "Failed to generate roast";
  } catch (error) {
    console.error("Gemini error:", error);
    throw new Error("Failed to generate comparison");
  }
}

async function giveAllPublicRepos(user: string): Promise<string> {
  const cacheKey = `repos_${user}`;
  if (cache.has(cacheKey)) {
    const { data, timestamp } = cache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      return data;
    }
    cache.delete(cacheKey);
  }

  const config = {
    method: "get",
    url: `https://api.github.com/users/${user}/repos`,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: process.env.GITHUB_TOKEN,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  };

  try {
    const response = await axios.request(config);
    const data = JSON.stringify(response.data);
    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error(`Error fetching repos for ${user}:`, error);
    return "No Repo Found";
  }
}

async function checkIfUserIsValid(user: string): Promise<boolean> {
  const cacheKey = `user_${user}`;
  if (cache.has(cacheKey)) {
    const { data, timestamp } = cache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      return data;
    }
    cache.delete(cacheKey);
  }

  try {
    const response = await axios.get(`https://api.github.com/users/${user}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: process.env.GITHUB_TOKEN,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const isValid = Boolean(response.data.id);
    cache.set(cacheKey, { data: isValid, timestamp: Date.now() });
    return isValid;
  } catch {
    return false;
  }
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
