import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";

/** Keep only requested SVG icons when schema analysis is disabled in production. */
export default function directIcons(): Plugin {
  const require = createRequire(import.meta.url);
  const root = path.dirname(require.resolve("lucide-react/package.json"));
  const entry = readFileSync(path.join(root, "dist/esm/lucide-react.js"), "utf8");
  const modules = new Map<string, string>();
  for (const match of entry.matchAll(/export \{([^}]+)\} from ['"]\.\/icons\/([^'"]+)['"]/g)) {
    for (const item of match[1].split(",")) {
      const name = item.trim().match(/^default as (\w+)$/)?.[1];
      if (name) modules.set(name, match[2]);
    }
  }
  return {
    name: "direct-lucide-imports",
    enforce: "pre",
    transform(code, id) {
      if (!/\.[jt]sx?$/.test(id) || id.includes("node_modules")) return;
      if (!code.includes('"lucide-react"')) return;
      const next = code.replace(/import\s*\{([^}]+)\}\s*from\s*"lucide-react";?/g, (original, list: string) => {
        const imports = list.split(",").map((item) => item.trim()).filter(Boolean);
        if (imports.some((item) => !modules.has(item.split(/\s+as\s+/)[0]))) return original;
        return imports.map((item) => {
          const [name, alias = name] = item.split(/\s+as\s+/);
          return `import ${alias} from "lucide-react/dist/esm/icons/${modules.get(name)}";`;
        }).join("\n");
      });
      return next === code ? undefined : { code: next, map: null };
    },
  };
}
