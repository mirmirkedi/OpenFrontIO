import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.opentroop.game",
  appName: "OpenTroop",
  webDir: "static",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
  },
};

export default config;
