import { ORPCError } from "@orpc/server";
/** Fail-closed release: no setting or environment variable unlocks remote commerce.
 * Changes require a separate legal/business-model review and code review. */
import { COMMERCE_ENABLED } from "../../shared/site-policy";
export { COMMERCE_ENABLED };
export const COMMERCE_BLOCK_REASON = "Дистанционное оформление заказов и резервирование через сайт недоступны.";
export function requireCommerce() {
  if (!COMMERCE_ENABLED) throw new ORPCError("FORBIDDEN", { message: COMMERCE_BLOCK_REASON });
}
