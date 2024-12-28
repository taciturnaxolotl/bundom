import { Elysia } from "elysia";
import { ip } from "elysia-ip";
import { logger } from "@tqman/nice-logger";
import { staticPlugin } from "@elysiajs/static";

// Types
type Pixel = {
  r: number;
  g: number;
  b: number;
};

// State
const canvas: Pixel[][] = [];
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 1000;
const RATE_LIMIT_MS = 1000;

// Initialize empty canvas
for (let y = 0; y < CANVAS_HEIGHT; y++) {
  canvas[y] = [];
  for (let x = 0; x < CANVAS_WIDTH; x++) {
    canvas[y][x] = { r: 255, g: 255, b: 255 }; // White background
  }
}

// Rate limiter
const lastPixelPlacement = new Map<string, number>();

new Elysia()
  .use(ip())
  .use(logger({ mode: "combined" }))
  .use(
    staticPlugin({
      prefix: "/",
    }),
  )
  // Get current canvas state
  .get("/get_state", () => {
    return canvas.map((row) => row.map((pixel) => [pixel.r, pixel.g, pixel.b]));
  })
  // Set pixel color
  .post("/set_pixel_color", ({ body, ip, set }) => {
    // Type validation
    const pixel = body as {
      x: number;
      y: number;
      r: number;
      g: number;
      b: number;
    };

    // Validate coordinates
    if (
      pixel.x < 0 ||
      pixel.x >= CANVAS_WIDTH ||
      pixel.y < 0 ||
      pixel.y >= CANVAS_HEIGHT
    ) {
      set.status = 400;
      return { error: "Invalid coordinates" };
    }

    // Validate colors
    if (
      pixel.r < 0 ||
      pixel.r > 255 ||
      pixel.g < 0 ||
      pixel.g > 255 ||
      pixel.b < 0 ||
      pixel.b > 255
    ) {
      set.status = 400;
      return { error: "Invalid color values" };
    }

    // Check rate limit
    const lastPlacement = lastPixelPlacement.get(ip);
    const now = Date.now();

    if (lastPlacement) {
      const timeElapsed = now - lastPlacement;
      if (timeElapsed < RATE_LIMIT_MS) {
        set.status = 429; // Too Many Requests
        return {
          error: "Rate limit exceeded",
          try_in: Math.ceil((RATE_LIMIT_MS - timeElapsed) / 1000),
        };
      }
    }

    // Update canvas
    canvas[pixel.y][pixel.x] = {
      r: pixel.r,
      g: pixel.g,
      b: pixel.b,
    };

    // Update rate limit timestamp
    lastPixelPlacement.set(ip, now);

    return { success: true };
  })
  .listen(3001);

console.log("---");
console.log("Canvas server started on port 3001");
console.log("Access the canvas at http://localhost:3001");
console.log(`Canvas size: ${CANVAS_WIDTH}x${CANVAS_HEIGHT}`);
console.log("Press Ctrl+C to stop the server");
console.log("---\n");
