import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { externalizeDeps } from "vite-plugin-externalize-deps";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), dts(), externalizeDeps()],
  build: {
    lib: {
      entry: "src/index.tsx",
      name: "genie-ui-framework",
      fileName: (format) => `genie-ui-framework.${format}.js`,
    },
  },
});
