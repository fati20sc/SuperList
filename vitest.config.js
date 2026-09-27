import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom simula el DOM para poder probar los render y el arranque de la app.
    environment: "jsdom",
    include: ["tests/**/*.test.js"],
    globals: false,
    reporters: "verbose",
  },
});
