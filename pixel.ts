import { PNG } from "pngjs";

class PixelRateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private isProcessing = false;
  private minTime: number;
  private lastRequestTime: number = 0;

  constructor(minTimeBetweenRequests: number = 1050) {
    this.minTime = minTimeBetweenRequests;
  }

  async schedule(
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    progress: { completed: number; total: number; startTime: number },
  ) {
    return new Promise<void>((resolve, reject) => {
      const task = async () => {
        try {
          await this.executeWithRetry(async () => {
            await this.waitForCooldown();
            return this.setPixelColor(x, y, r, g, b, progress);
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      this.queue.push(task);
      this.processQueue();
    });
  }

  private async executeWithRetry(
    fn: () => Promise<Response>,
    maxRetries: number = 5,
    initialDelay: number = 1000,
  ): Promise<Response> {
    let lastError: any;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fn();
        if (response.status === 429) {
          const data = await response.json();
          if (!data.success && data.try_in) {
            // Update rate limiter timing based on server response
            this.minTime = Math.max(this.minTime, data.try_in * 1000);
            await this.sleep(data.try_in * 1000);
            throw new Error(`Rate limited. Try in ${data.try_in}s`);
          }
        }
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          await this.sleep(delay);
          delay *= 2; // Exponential backoff
        }
      }
    }
    throw lastError;
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
      }
    }
    this.isProcessing = false;
  }

  private async waitForCooldown() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minTime) {
      await this.sleep(this.minTime - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
  }

  private async setPixelColor(
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    progress: { completed: number; total: number; startTime: number },
  ): Promise<Response> {
    const response = await fetch("https://place.danieldb.uk/set_pixel_color", {
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ x, y, r, g, b }),
      method: "POST",
    });

    progress.completed++;
    this.printProgress(progress);

    return response;
  }

  private printProgress(progress: {
    completed: number;
    total: number;
    startTime: number;
  }) {
    const elapsedSeconds = (Date.now() - progress.startTime) / 1000;
    const pixelsPerSecond = progress.completed / elapsedSeconds;
    const remainingPixels = progress.total - progress.completed;
    const estimatedSecondsLeft = remainingPixels / pixelsPerSecond;

    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(
      `Progress: ${progress.completed}/${progress.total} pixels ` +
        `(${Math.round((progress.completed / progress.total) * 100)}%) - ` +
        `Est. time remaining: ${Math.round(estimatedSecondsLeft / 60)} minutes ${Math.round(estimatedSecondsLeft % 60)} seconds`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Usage
async function main() {
  const file = await Bun.file("corgi.png").arrayBuffer();
  const png = PNG.sync.read(Buffer.from(file));

  console.log({ width: png.width, height: png.height });

  const progress = {
    completed: 0,
    total: png.width * png.height,
    startTime: Date.now(),
  };

  const rateLimiter = new PixelRateLimiter();
  const promises: Promise<void>[] = [];

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];

      promises.push(rateLimiter.schedule(x, y, r, g, b, progress));
    }
  }

  // Wait for all pixels to be processed
  await Promise.all(promises);
  console.log("\nComplete!");
}

main().catch(console.error);
