import { createAuthClient } from "better-auth/react";
import { getToken, KEY } from "./auth-storage";
export { clearToken, getToken } from "./auth-storage";
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  fetchOptions: {
    auth: { type: "Bearer", token: getToken },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get("set-auth-token");
      if (token) { try { sessionStorage.setItem(KEY, token); } catch { /* Cookie-based auth remains available. */ } }
    },
  },
});
