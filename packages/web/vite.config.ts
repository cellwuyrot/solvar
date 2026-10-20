import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";
import honoDevPlugin from "./vite/__plugins/hono-dev-plugin";
import assetOptimizerPlugin from "./vite/__plugins/asset-optimizer-plugin";
import directIcons from "./vite/__plugins/direct-icons";
import ports from "../../__ports.cjs";

const root = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  Object.assign(process.env, env);

  return {
    // All env files live at the repo root — keep Vite's own env loading there too,
    // so packages/web/.env* files can never shadow the root .env.
    envDir: root,
    plugins: [
      directIcons(),
      honoDevPlugin(),
      react(),
      tailwind(),
      assetOptimizerPlugin(),
    ],
    build: {
      // Rollup's recursive schema/proxy analysis hangs on this dependency graph.
      // Keep semantics intact and split vendors instead of running that analysis.
      rollupOptions: {
        treeshake: false,
        output: {
          manualChunks(id) {
            id = id.replace(/\\/g, "/");
            if (!id.includes("/node_modules/")) return;
            if (/\/(?:react|react-dom|scheduler)\//.test(id)) return "react-vendor";
            if (id.includes("/zod/")) return "validation-vendor";
            if (id.includes("/better-auth/") || id.includes("/@better-auth/")) return "auth-vendor";
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src/web"),
      },
    },
    server: {
      port: ports.website,
      strictPort: true,
      hmr: { overlay: false },
      cors: false,
    },
  };
});
