const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const colorPicker = document.getElementById("color");
const status = document.getElementById("status");

let canPlace = true;
let cooldownTimeout;

// Convert hex color to RGB
function hexToRgb(hex) {
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  return { r, g, b };
}

// Update canvas from server state
async function updateCanvas() {
  try {
    const response = await fetch("/get_state");
    const state = await response.json();

    const imageData = ctx.createImageData(canvas.width, canvas.height);

    for (let y = 0; y < state.length; y++) {
      for (let x = 0; x < state[y].length; x++) {
        const idx = (y * canvas.width + x) * 4;
        imageData.data[idx] = state[y][x][0]; // R
        imageData.data[idx + 1] = state[y][x][1]; // G
        imageData.data[idx + 2] = state[y][x][2]; // B
        imageData.data[idx + 3] = 255; // A
      }
    }

    ctx.putImageData(imageData, 0, 0);
  } catch (error) {
    console.error("Failed to update canvas:", error);
  }
}

// Place a pixel
async function placePixel(x, y, color) {
  if (!canPlace) {
    status.textContent = "Please wait for the cooldown";
    return;
  }

  try {
    const response = await fetch("/set_pixel_color", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        x: Math.floor(x),
        y: Math.floor(y),
        ...color,
      }),
    });

    const data = await response.json();

    if (response.status === 429) {
      status.textContent = `Rate limited. Try again in ${data.try_in}s`;
      canPlace = false;
      clearTimeout(cooldownTimeout);
      cooldownTimeout = setTimeout(() => {
        canPlace = true;
        status.textContent = "Ready";
      }, data.try_in * 1000);
      return;
    }

    if (!response.ok) {
      throw new Error(data.error || "Failed to place pixel");
    }

    updateCanvas();
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    console.error("Failed to place pixel:", error);
  }
}

// Handle canvas clicks
canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const color = hexToRgb(colorPicker.value);
  placePixel(x, y, color);
});

// Update canvas periodically
setInterval(updateCanvas, 1000);

// Initial canvas update
updateCanvas();
