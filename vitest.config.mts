import { defineConfig } from "vitest/config";
import { pathgrade } from "@wix/pathgrade/plugin";

export default defineConfig({
  plugins: [pathgrade({ include: ["test/pathgrade/**/*.eval.ts"], timeout: 180 })],
});
