import express from "express";
import { Stream } from "stream";
const PORT = 3001;
const app = express();
import axios from "axios";
import dotenv from "dotenv";
import OpenAI from "openai";
import cors from "cors";
import { log } from "console";

app.use(cors());
dotenv.config();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.API_Key_Qwen,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

// Cache for GitHub API responses
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

app.post("/compare-users", async (req: any, res: any) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

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

    await compareUsers(user1Repos, user2Repos, res);
  } catch (e: any) {
    res.json({ success: false, message: e.message });
  }
});

async function compareUsers(u1: string, u2: string, res: any): Promise<void> {
  try {
    log("Inside the completion file");
    const completion = await openai.chat.completions.create({
      model: "qwen-plus",
      messages: [
        {
          role: "system",
          content: `You are tasked with comparing two GitHub users based on their repositories and activity. The primary goal is to **roast one or both users mercilessly**, but the output must be optimized for easy integration into a frontend application. Avoid excessive formatting, emotional language, or structures that are hard to display. The response should use witty, sarcastic, and strong language but remain concise and data-driven.

        #### Key Instructions:
        1. **Analyze the Data**:
           - Assess the total number of repositories for each user.
           - Evaluate activity levels (commits, recent updates, contributions).
           - Look for stars, forks, and watchers to gauge popularity.
           - Check the quality of repositories (README presence, documentation, project complexity).
           - Identify interesting, embarrassing, or standout projects for specific commentary.
        
        2. **Roast with Precision**:
           - **Roast one user harder than the other**, but include at least one playful jab for both to keep it balanced.
           - Use **sharp, witty, and sarcastic humor**. Don’t hold back—make it feel like a friendly roast battle.
           - Avoid over-the-top emotional phrasing, unnecessary introductions, or conclusions.
           - Avoid formatting like **bold**, ### headings, or dramatic introductions. If formatting is required, provide the output as clean HTML.
        
        3. **Justify with Data**:
           - Use numbers (e.g., "User 1 has 10 repos but only 2 stars total—more like a black hole than a star cluster").
           - Call out specific projects to drive home the points.
        
        4. **Output Requirements**:
           - If plain text: Write in concise paragraphs that are easy to display in a frontend application.
           - If HTML: Use simple, clean HTML for better integration. Wrap user sections in <div> tags and use <p> for text.

           5. Roast in length. Do not make it too short. But, also do not make it too long.Ideal should be more than 200 words and less than 300 words.

           6. Please roast them brutally with no mercy. It should be a hard roast.
        
        #### Example (Plain Text):
        User 1: Santoshpant23
        Santoshpant23, your GitHub is a sprawling mess of 47 repositories, most of which are forks. Forks are fine, but how about a little originality? Your top project has a grand total of one star—stellar work. And what’s with names like "UntitledFinalProjectV2"? It’s like you’re naming repos by throwing darts at a keyboard. Try putting effort into a few meaningful projects instead of collecting forks like stamps.
        
        User 2: Bhuwan138
        Bhuwan138, you’re not exactly prolific with 35 repositories, but at least a few of them shine. "evoting" has 4 stars and watchers, which is decent, but your naming conventions? "-HactoberFest2022-For_All_Beginers-" looks like it was named during a caffeine-fueled typo spree. Documentation is non-existent in "GradientBackgroundGeneratorInJS," making it a project that no one can figure out. Focus on quality and proper names.
        
        #### Example (HTML):
        <div id="user1">
            <p><strong>Santoshpant23:</strong> Your GitHub is a sprawling mess of 47 repositories, most of which are forks. Forks are fine, but how about a little originality? Your top project has a grand total of one star—stellar work. And what’s with names like "UntitledFinalProjectV2"? It’s like you’re naming repos by throwing darts at a keyboard. Try putting effort into a few meaningful projects instead of collecting forks like stamps.</p>
        </div>
        <div id="user2">
            <p><strong>Bhuwan138:</strong> You’re not exactly prolific with 35 repositories, but at least a few of them shine. "evoting" has 4 stars and watchers, which is decent, but your naming conventions? "-HactoberFest2022-For_All_Beginers-" looks like it was named during a caffeine-fueled typo spree. Documentation is non-existent in "GradientBackgroundGeneratorInJS," making it a project that no one can figure out. Focus on quality and proper names.</p>
        </div>
        
        #### Additional Notes:
        - Avoid lengthy introductions, conclusions, or emotional phrasing like "dramatic introduction" or "closing remarks."
        -But make it extremely funny and people should feel humiliation by seeing their roast. And, make it a hard roast with facts and some other addons. 
        -Do not give your intro or conclusion. For eg do not say: This output provides a sharp, witty roast while keeping it concise and data-driven, ensuring easy integration into a frontend application.
        
        And, do not use anything other than plain html with proper tags. Tags should not be html, body, and other top level tags. Keep them div, p, h, tags for simplicity`,
        },
        {
          role: "user",
          content: `${u1} is the first user. And, ${u2} is the second user`,
        },
      ],
      stream: true,
    });

    // Proper SSE handling
    for await (const chunk of completion) {
      if (chunk.choices[0]?.delta?.content) {
        res.write(
          `data: ${JSON.stringify({
            content: chunk.choices[0].delta.content,
          })}\n\n`
        );
      }
    }

    res.write("event: end\n\n");
    res.end();
  } catch (error) {
    res.write(
      `data: ${JSON.stringify({ error: "Stream error occurred" })}\n\n`
    );
    res.end();
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
    throw new Error(`Failed to fetch repositories for ${user}`);
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
