import { defineConfig } from "vite";
import { resolve } from "node:path";

// Each app window is its own page under src/windows/<name>/.
// Tauri expects a fixed dev port and no clearing of the Rust compiler output.
const page = (name: string) => resolve(__dirname, "src/windows", name, "index.html");

export default defineConfig({
  root: "src",
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      input: { capture: page("capture"), library: page("library"), pet: page("pet") },
    },
  },
});
