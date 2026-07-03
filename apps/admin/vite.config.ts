/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // 테스트는 개발자 로컬 .env.local 과 무관하게 항상 fixture 모드로 돈다.
    env: { VITE_DATA_SOURCE: "fixture" },
  },
});
