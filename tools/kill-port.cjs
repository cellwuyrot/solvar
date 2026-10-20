const { execFileSync } = require("node:child_process");
const ports = require("../__ports.cjs");
const port = String(ports.website);
let pids = [];

if (process.platform === "win32") {
  const output = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
  pids = output.split(/\r?\n/).flatMap((line) => {
    const fields = line.trim().split(/\s+/);
    return fields[0] === "TCP" && fields[1]?.endsWith(`:${port}`) && fields[3] === "LISTENING"
      ? [Number(fields[4])] : [];
  });
} else {
  try {
    pids = execFileSync("lsof", ["-t", "-iTCP:" + port, "-sTCP:LISTEN"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    }).trim().split(/\s+/).map(Number);
  } catch (error) {
    if (error.status !== 1) {
      console.error("Install lsof to use npm run kill:port on Linux/macOS.");
      process.exit(1);
    }
  }
}
for (const pid of new Set(pids.filter((p) => Number.isInteger(p) && p > 0))) {
  if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"]);
  else process.kill(pid, "SIGKILL");
  console.log(`Stopped process ${pid} on port ${port}.`);
}
if (!pids.length) console.log(`Port ${port} is free.`);