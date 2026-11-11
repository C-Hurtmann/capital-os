import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:5177", ...devices["Desktop Chrome"] },
  webServer: [
    {
      command:
        "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5177 --strictPort",
      url: "http://127.0.0.1:5177",
      reuseExistingServer: false,
    },
    {
      command:
        "node node_modules/vite/bin/vite.js --mode local-api --host 127.0.0.1 --port 5178 --strictPort",
      url: "http://127.0.0.1:5178",
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
