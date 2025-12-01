//@ts-ignore
import { build } from "bun";

async function run() {
  await build({
    entryPoints: ["./src/main.ts", "./src/preload.ts"],
    outdir: "./dist",
    minify: true,
    target: "node",
    format: "cjs",
    external: ["electron"],
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
