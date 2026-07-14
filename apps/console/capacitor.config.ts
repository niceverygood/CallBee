import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "im.callbee.app",
  appName: "콜비",
  webDir: "dist",
  backgroundColor: "#FFF9EB",
  server: {
    androidScheme: "https",
  },
};

export default config;
