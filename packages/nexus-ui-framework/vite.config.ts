import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { externalizeDeps } from "vite-plugin-externalize-deps";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    dts({ rollupTypes: true, tsconfigPath: "./tsconfig.app.json" }),
    externalizeDeps(),
  ],
  build: {
    lib: {
      entry: "src/index.tsx",
      name: "NexusUIFramework",
      fileName: (format) => `nexus-ui-framework.${format}.js`,
    },
    rollupOptions: {
      output: {
        globals: {
          react: "React",
          "react/jsx-runtime": "jsxRuntime",
          "react-dom": "ReactDOM",
          "@base-ui-components/react": "BaseUI",
        },
      },
    },
  },
});
