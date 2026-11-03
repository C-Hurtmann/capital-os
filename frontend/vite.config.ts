import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, ".", "CAPITAL_").CAPITAL_API_TARGET;
  return {
    plugins: [react()],
    server: {
      proxy: target
        ? {
            "/api/v1/credit-limit": {
              target: target,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    test: { include: ["src/**/*.test.ts"] },
  };
});
