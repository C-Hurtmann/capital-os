import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", ["CAPITAL_", "VITE_"]);
  const target = env.CAPITAL_API_TARGET || "http://127.0.0.1:8001";
  const creditSource =
    mode === "local-api" ? "api" : env.VITE_CREDIT_LIMIT_SOURCE || "demo";
  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_HISTORY_SOURCE": JSON.stringify(
        mode === "local-api" ? "api" : env.VITE_HISTORY_SOURCE || "demo",
      ),
      "import.meta.env.VITE_MONTHLY_CASHFLOW_SOURCE": JSON.stringify(
        mode === "local-api"
          ? "api"
          : env.VITE_MONTHLY_CASHFLOW_SOURCE || "demo",
      ),
      "import.meta.env.VITE_CASHFLOW_SOURCE": JSON.stringify(
        mode === "local-api" ? "api" : env.VITE_CASHFLOW_SOURCE || "demo",
      ),
      "import.meta.env.VITE_BALANCE_SOURCE": JSON.stringify(
        mode === "local-api" ? "api" : env.VITE_BALANCE_SOURCE || "demo",
      ),
      "import.meta.env.VITE_CREDIT_LIMIT_SOURCE": JSON.stringify(creditSource),
    },
    server: {
      proxy: target
        ? {
            "/api": {
              target: target,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    test: { include: ["src/**/*.test.ts"] },
  };
});
