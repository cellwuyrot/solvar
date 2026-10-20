import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "../../api";

import { getToken } from "./auth-storage";

const link = new RPCLink({
  headers: () => (getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  url: `${window.location.origin}/api/rpc`,
});

/** Direct typed client: await client.ping() */
export const client: AppRouterClient = createORPCClient(link);

/** TanStack Query helpers: useQuery(orpc.ping.queryOptions()) */
export const orpc = createTanstackQueryUtils(client);
