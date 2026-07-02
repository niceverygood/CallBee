/**
 * 콜비(Callbee) 브랜드 토큰 — docs/brand-guide.md §2.4 와 동일 팔레트.
 * console 과 동일한 brand(허니 앰버)/ink(웜 그레이)/semantic 토큰을 공유한다.
 * 기존 brand-{50,100,500,600,700}(파랑) 클래스명이 그대로 새 팔레트를 입는다.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFF9EB",
          100: "#FFEFC7",
          200: "#FFE08A",
          300: "#FFCD4D",
          400: "#FFB820",
          500: "#F5A302",
          600: "#D18608",
          700: "#A8660B",
          800: "#854F0E",
          900: "#6B3F10",
        },
        ink: {
          50: "#F9FAFB",
          100: "#F2F4F6",
          200: "#E5E8EB",
          300: "#D1D6DB",
          400: "#B0B8C1",
          500: "#8B95A1",
          600: "#6B7684",
          700: "#4E5968",
          800: "#333D4B",
          900: "#191F28",
        },
        success: { 50: "#ECFDF5", 600: "#059669", 700: "#047857" },
        warn: { 50: "#FFFBEB", 600: "#D97706", 700: "#B45309" },
        danger: { 50: "#FEF2F2", 600: "#DC2626", 700: "#B91C1C" },
        info: { 50: "#EFF6FF", 600: "#2563EB" },
      },
    },
  },
  plugins: [],
};
