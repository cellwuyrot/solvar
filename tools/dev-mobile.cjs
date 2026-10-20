const path = require("node:path");
const { spawn } = require("node:child_process");
const ports = require("../__ports.cjs");
const mobileDir = path.resolve(__dirname, "../packages/mobile");

const child = spawn(
  process.execPath,
  [require.resolve("expo/bin/cli", { paths: [mobileDir] }), "start", "--port", String(ports.mobile)],
  { cwd: mobileDir, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });