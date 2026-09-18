/** Narrow corrections for receipt/payment postings in the vendor's v1 spec.
 * See docs/write-postings.md for observed responses and scope.
 */
import type { JsonSchema } from "./spec.js";

function postingBatchKey(path: string): "receipts" | "transactions" | undefined {
  if (path === "/postings/add-batch/receipts") return "receipts";
  if (path === "/postings/add-batch/transactions") return "transactions";
  return undefined;
}

export function correctPostingInput(path: string, schema: JsonSchema): void {
  const key = postingBatchKey(path);
  const item = key ? schema.properties?.[key]?.items : undefined;
  const props = item?.properties;
  if (!item || !props) return;

  if (key === "receipts") {
    // The batch definition has a typo; live calls and the single endpoint
    // both use postingtexts. Do not invent or rewrite posting text values.
    if (props.postingstexts) {
      props.postingtexts ??= props.postingstexts;
      delete props.postingstexts;
    }
    item.required = [...new Set([
      ...(item.required ?? []).filter(k => !["creditor", "debtor", "postingstexts"].includes(k)),
      "postingtexts",
    ])];
    // Creditor/debtor requirements depend on the receipt direction and the
    // customer's settings. The API still checks them when needed.
  } else {
    item.required = (item.required ?? []).filter(k => k !== "oi_receipts_ids_by_customer");
    const ids = props.oi_receipts_ids_by_customer?.items;
    if (ids?.type) {
      ids.type = [...new Set([...(Array.isArray(ids.type) ? ids.type : [ids.type]), "null"])];
    }
  }
}

export function correctPostingOutput(path: string, schema: JsonSchema): void {
  if (!postingBatchKey(path)) return;
  const data = schema.properties?.errors?.items?.properties?.request_data;
  // Observed failures contain the submitted item as an object. Keep the
  // documented array form as well, without relaxing the rest of the schema.
  if (data?.type === "array") data.type = ["array", "object"];
}

export function hasPostingBatchErrors(path: string, body: unknown): body is Record<string, unknown> {
  const key = postingBatchKey(path);
  if (!key || !body || typeof body !== "object" || Array.isArray(body)) return false;
  const result = body as Record<string, unknown>;
  if (Array.isArray(result.errors) && result.errors.length > 0) return true;
  const items = result[key];
  return Array.isArray(items) && items.some(item =>
    item && typeof item === "object" && item.success === false
  );
}
