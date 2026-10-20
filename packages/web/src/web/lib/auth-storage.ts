export const KEY = "solvar-admin-token";
export const getToken = () => { try { return sessionStorage.getItem(KEY) || ""; } catch { return ""; } };
export const clearToken = () => { try { sessionStorage.removeItem(KEY); } catch { /* Storage can be disabled by browser policy. */ } };
