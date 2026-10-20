// Host-specific example for /var/www/solvar. Does not update or restart other PM2 apps.
module.exports = {
  apps: [{
    name: "solvar",
    cwd: "/var/www/solvar/packages/web",
    script: "/var/www/solvar/node_modules/.bin/bun",
    args: "--env-file=/var/www/solvar/.env src/__server.ts",
    interpreter: "none",
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    restart_delay: 1000,
    env: { NODE_ENV: "production", PORT: "3011", HOST: "127.0.0.1" }
  }]
};
