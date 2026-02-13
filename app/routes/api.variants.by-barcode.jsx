import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const VARIANT_BY_BARCODE = `#graphql
query VariantByBarcode($q: String!) {
  productVariants(first: 10, query: $q) {
    nodes {
      id
      barcode
      sku
      title
      product { title }
      image { url altText }
    }
  }
}`;

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const { barcode } = await request.json();

  const clean = String(barcode || "").trim();
  if (!clean) return json({ ok: false, reason: "missing_barcode" }, { status: 400 });

  const resp = await admin.graphql(VARIANT_BY_BARCODE, {
    variables: { q: `barcode:${clean}` },
  });
  const data = await resp.json();

  const nodes = data?.data?.productVariants?.nodes || [];
  if (nodes.length === 0) return json({ ok: false, reason: "not_found" }, { status: 404 });
  if (nodes.length > 1) return json({ ok: false, reason: "duplicate_barcode", variants: nodes }, { status: 409 });

  return json({
    ok: true,
    shop: session.shop,
    variant: nodes[0],
  });
}
