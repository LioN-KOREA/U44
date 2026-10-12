// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
        entry: ["src/index.ts"],
        platform: "node",
        target: "es2022",
        format: "esm",
        clean : true,
        sourcemap: true,
        minify: true,
        banner: {
            js: "import { createRequire } from 'module'; import { fileURLToPath } from 'url'; import { dirname } from 'path'; const require = createRequire(import.meta.url); const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename);",
        },
        outDir: "./dist",
        outExtension: () => ({  js : ".mjs" }),
        bundle: true,
    });