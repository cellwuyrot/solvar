// Deploy-compat entrypoint: the platform's release pipeline sets
// packages/web/src/server.ts as the production server. The real server
// lives in the protected __server.ts (which pm2 runs in the sandbox).
import "./__server";
