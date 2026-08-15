import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.worldfront.game",
  appName: "WorldFront",
  webDir: "static",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
  },
};

export default config;
