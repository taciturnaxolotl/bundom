import { Elysia } from "elysia";
import { ip } from "elysia-ip";
import { bearer } from "@elysiajs/bearer";
import { cron } from "@elysiajs/cron";
import { logger } from "@tqman/nice-logger";
import { PNG } from "pngjs";

// --- Types ---
type PixelJob = {
  x: number;
  y: number;
  color: { r: number; g: number; b: number };
};

type BotInfo = {
  ip: string;
  lastSeen: Date;
  currentJob?: {
    startX: number;
    startY: number;
    pixels: PixelJob[];
  };
};

// --- State management ---
const bots: Map<string, BotInfo> = new Map();

const state: { r: number; g: number; b: number }[][] = [];

const file = await Bun.file("corgi.png").arrayBuffer();
const image = PNG.sync.read(Buffer.from(file));

const desiredState: { r: number; g: number; b: number }[][] = [];
for (let y = 0; y < image.height; y++) {
  desiredState[y] = [];
  for (let x = 0; x < image.width; x++) {
    const idx = (image.width * y + x) << 2;
    desiredState[y][x] = {
      r: image.data[idx],
      g: image.data[idx + 1],
      b: image.data[idx + 2],
    };
  }
}

const PIXEL_SERVER_URL =
  process.env.PIXEL_SERVER_URL || "https://place.danieldb.uk";

// --- Functions ---
async function updateState() {
  const data = await fetch(`${PIXEL_SERVER_URL}/get_state`).then((res) =>
    res.json(),
  );

  const oldState = state.map((row) => row.map((pixel) => ({ ...pixel })));

  let changedPixels = 0;

  for (let y = 0; y < data.length; y++) {
    state[y] = state[y] || [];
    for (let x = 0; x < data[y].length; x++) {
      const [r, g, b] = data[y][x];
      if (
        !oldState[y]?.[x] ||
        oldState[y][x].r !== r ||
        oldState[y][x].g !== g ||
        oldState[y][x].b !== b
      ) {
        changedPixels++;
      }
      state[y][x] = { r, g, b };
    }
  }

  console.log(`State updated - ${changedPixels} pixels changed`);
}

function findNextBlock(): { startX: number; startY: number } | null {
  for (let y = 0; y < desiredState.length; y += 10) {
    for (let x = 0; x < desiredState[0].length; x += 10) {
      // Check if any bot is already working on this block
      const isBlockTaken = Array.from(bots.values()).some(
        (bot) =>
          bot.currentJob &&
          bot.currentJob.startX === x &&
          bot.currentJob.startY === y,
      );

      if (!isBlockTaken) {
        // Check if block needs work
        const needsWork = checkBlockNeedsWork(x, y);
        if (needsWork) {
          return { startX: x, startY: y };
        }
      }
    }
  }
  return null;
}

function checkBlockNeedsWork(startX: number, startY: number): boolean {
  for (let y = startY; y < Math.min(startY + 10, state.length); y++) {
    for (let x = startX; x < Math.min(startX + 10, state[0].length); x++) {
      if (
        !state[y]?.[x] ||
        state[y][x].r !== desiredState[y][x].r ||
        state[y][x].g !== desiredState[y][x].g ||
        state[y][x].b !== desiredState[y][x].b
      ) {
        return true;
      }
    }
  }
  return false;
}

function generateJobForBlock(startX: number, startY: number): PixelJob[] {
  const pixels: PixelJob[] = [];

  for (let y = startY; y < Math.min(startY + 10, desiredState.length); y++) {
    for (
      let x = startX;
      x < Math.min(startX + 10, desiredState[0].length);
      x++
    ) {
      if (
        !state[y]?.[x] ||
        state[y][x].r !== desiredState[y][x].r ||
        state[y][x].g !== desiredState[y][x].g ||
        state[y][x].b !== desiredState[y][x].b
      ) {
        pixels.push({
          x,
          y,
          color: desiredState[y][x],
        });
      }
    }
  }

  return pixels;
}

// --- Server ---
new Elysia()
  .use(
    logger({
      mode: "combined",
    }),
  )
  .use(ip())
  .use(bearer())
  .use(
    cron({
      name: "updateState",
      pattern: "*/10 * * * * *",
      run() {
        updateState();
        for (const [ip, bot] of bots.entries()) {
          if (Date.now() - bot.lastSeen.getTime() > 1000 * 60 * 2) {
            bots.delete(ip);
            console.log(`Removed inactive bot ${ip}`);
          }
        }
      },
    }),
  )
  .onBeforeHandle(({ bearer, set, ip }) => {
    if (!bearer) {
      set.status = 400;
      set.headers["WWW-Authenticate"] =
        `Bearer realm='sign', error="invalid_request"`;

      return "Unauthorized";
    }

    if (bearer !== process.env.BEARER_TOKEN) {
      set.status = 403;
      set.headers["WWW-Authenticate"] =
        `Bearer realm='sign', error="invalid_token"`;

      return "Forbidden";
    }

    const bot = bots.get(ip);
    if (!bot) {
      bots.set(ip, {
        ip,
        lastSeen: new Date(),
      });
    } else {
      bot.lastSeen = new Date();
      bots.set(ip, bot);
    }
  })
  .get("/command", ({ ip }) => {
    const bot = bots.get(ip);
    if (!bot) {
      return { error: "Bot not registered" };
    }

    // If bot already has a job, return it
    if (bot.currentJob && bot.currentJob.pixels.length > 0) {
      return {
        startX: bot.currentJob.startX,
        startY: bot.currentJob.startY,
        pixels: bot.currentJob.pixels,
      };
    }

    // Find next available block
    const nextBlock = findNextBlock();
    if (!nextBlock) {
      return { message: "No work available" };
    }

    // Generate new job for bot
    const pixels = generateJobForBlock(nextBlock.startX, nextBlock.startY);

    // Save job assignment
    bot.currentJob = {
      startX: nextBlock.startX,
      startY: nextBlock.startY,
      pixels,
    };
    bots.set(ip, bot);

    return {
      startX: nextBlock.startX,
      startY: nextBlock.startY,
      pixels,
    };
  })
  .post("/complete-job", ({ ip }) => {
    const bot = bots.get(ip);
    if (!bot) {
      return { error: "Bot not registered" };
    }

    // Clear the bot's current job
    bot.currentJob = undefined;
    bots.set(ip, bot);

    return { message: "Job completed successfully" };
  })
  .listen(3000);

// --- Start ---
console.log("Server started on port 3000");
console.log("Bearer token:", process.env.BEARER_TOKEN);
console.log("Press Ctrl+C to stop the server");
console.log("----\n");

updateState();
