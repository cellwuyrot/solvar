const ports = require("./__ports.cjs");
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "solvar-store",
      cwd: path.join(__dirname, "packages/web"),
      script: "src/__server.ts",
      interpreter: "bun",
      interpreter_args: ["--env-file=../../.env"],
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      restart_delay: 1000,
      env: {
        PORT: ports.website,
      },
    },
  ],
};
