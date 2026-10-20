const path = require("node:path");
const { spawn } = require("node:child_process");
const workspace = process.argv[2];
if (!["web", "desktop"].includes(workspace)) throw new Error("Expected web or desktop workspace");
const cwd = path.resolve(__dirname, "../packages", workspace);
const manifest = require.resolve("vite/package.json", { paths: [cwd] });
const cli = path.resolve(path.dirname(manifest), require(manifest).bin.vite);
const child = spawn(process.execPath, [cli], { cwd, stdio: "inherit" });
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });