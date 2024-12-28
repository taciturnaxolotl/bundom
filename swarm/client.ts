import { sleep } from "bun";
import { getHWID } from "hwid";

const BEARER_TOKEN = process.env.BEARER_TOKEN;
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const PIXEL_SERVER_URL =
  process.env.PIXEL_SERVER_URL || "https://place.danieldb.uk";
const DEBUG = process.env.DEBUG === "true";

class PixelClient {
  private rateLimiter: RateLimiter;
  private retryCount = 0;
  private maxRetries = 3;
  private backoffMultiplier = 1.5;
  private maxBackoffDelay = 30000; // 30 seconds
  private token = "";

  constructor() {
    // Don't set initial rate limit - will be set dynamically
    this.rateLimiter = new RateLimiter(0);
  }

  async register() {
    while (true) {
      try {
        const hardwareId = await getHWID();
        const response = await fetch(`${SERVER_URL}/register`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${BEARER_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hardwareId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Registration failed: ${response.status}`);
        }

        const data = await response.json();
        this.token = data.token;
        console.log("[Info] Successfully registered with token:", this.token);
        return;
      } catch (error) {
        console.error(
          "[Error] Failed to register - server may be down:",
          error,
        );
        console.log("[Info] Retrying registration in 10 seconds...");
        await sleep(10000);
      }
    }
  }

  async start() {
    await this.register();

    while (true) {
      try {
        // Get command from server
        const command = await this.getCommand();

        if ("error" in command) {
          console.error(`[Error] Command error: ${command.error}`);
          await sleep(5000);
          continue;
        }

        if ("message" in command) {
          console.log(`[Info] Server message: ${command.message}`);
          await sleep(5000);
          continue;
        }

        // Process pixels
        const { pixels } = command;
        console.log(`[Info] Received ${pixels.length} pixels to process`);

        for (const pixel of pixels) {
          let currentDelay = 1000;
          this.retryCount = 0;

          while (true) {
            try {
              await this.rateLimiter.wait();
              await this.setPixel(pixel);
              break; // Success - continue to next pixel
            } catch (error) {
              if (
                error instanceof Error &&
                error.message.includes("[Rate Limit]")
              ) {
                const waitTime = this.rateLimiter.getCurrentWaitTime();
                console.log(
                  `[Rate Limit] Waiting ${waitTime / 1000}s before next attempt`,
                );
                await sleep(waitTime);
                continue; // Retry immediately after rate limit
              }

              this.retryCount++;
              if (this.retryCount >= this.maxRetries) {
                throw error;
              }

              currentDelay = Math.min(
                currentDelay * this.backoffMultiplier,
                this.maxBackoffDelay,
              );

              console.log(
                `[Info] Retrying... Attempt ${this.retryCount} of ${this.maxRetries} after ${currentDelay / 1000}s`,
              );
              await sleep(currentDelay);
            }
          }
        }

        // Notify server that job is complete
        try {
          await this.completeJob();
          console.log("[Info] Job completed successfully");
        } catch (error) {
          console.error("[Error] Failed to notify job completion:", error);
        }
      } catch (error) {
        console.error("[Error] Server may be down:", error);
        console.log("[Info] Waiting 10 seconds before retry...");
        await sleep(10000);
        try {
          await this.register(); // Re-register if server comes back up
        } catch {}
      }
    }
  }

  private async getCommand() {
    try {
      const response = await fetch(`${SERVER_URL}/command`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("[Error] Failed to get command:", error);
      throw new Error(
        `Command fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private async completeJob() {
    try {
      const response = await fetch(`${SERVER_URL}/complete-job`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("[Error] Failed to complete job:", error);
      throw new Error(
        `Job completion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private async setPixel(pixel: {
    x: number;
    y: number;
    color: { r: number; g: number; b: number };
  }) {
    try {
      const response = await fetch(`${PIXEL_SERVER_URL}/set_pixel_color`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          x: pixel.x,
          y: pixel.y,
          r: pixel.color.r,
          g: pixel.color.g,
          b: pixel.color.b,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        if (DEBUG) console.log(data);
        if (response.status === 429 && data.try_in !== undefined) {
          this.rateLimiter.updateMinTime(data.try_in * 1000);
          throw new Error(`[Rate Limit] Try in ${data.try_in}s`);
        }
        console.error(`[HTTP Error] Status: ${response.status}`);
      } else {
        console.log(`[Success] Set pixel at (${pixel.x}, ${pixel.y})`);
      }
    } catch (error) {
      console.error("[Error] Failed to set pixel:", error);
      console.error("[Error] Pixel details:", JSON.stringify(pixel));
      throw error;
    }
  }
}

class RateLimiter {
  private lastRequestTime = 0;
  private minTime: number;
  private dynamicWaitTime: number;

  constructor(minTimeBetweenRequests: number) {
    this.minTime = minTimeBetweenRequests;
    this.dynamicWaitTime = minTimeBetweenRequests;
  }

  async wait() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.dynamicWaitTime) {
      await sleep(this.dynamicWaitTime - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
  }

  updateMinTime(newMinTime: number) {
    this.minTime = newMinTime;
    this.dynamicWaitTime = this.minTime * 1.1; // Add 10% buffer
  }

  getCurrentWaitTime(): number {
    return this.dynamicWaitTime;
  }
}

// Start the client
if (!BEARER_TOKEN) {
  console.error("[Error] BEARER_TOKEN environment variable is required");
  process.exit(1);
}

console.log("[Info] Starting pixel client...");
const client = new PixelClient();
client.start().catch((error) => {
  console.error("[Fatal Error] Client crashed:", error);
  process.exit(1);
});
