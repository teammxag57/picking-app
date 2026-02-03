import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin, payload } = await authenticate.webhook(request);

  const orderGid =
    payload?.admin_graphql_api_id ||
    (payload?.id ? `gid://shopify/Order/${payload.id}` : null);

  if (!orderGid) return new Response("OK", { status: 200 });

  // (opcional) Se quiseres evitar “re-set” se já existir:
  // mas em orders/create normalmente ainda não existe, portanto podes até remover este check.
  const checkRes = await admin.graphql(
    `
      query CheckPicking($id: ID!) {
        order(id: $id) {
          metafield(namespace: "picking", key: "status") { value }
        }
      }
    `,
    { variables: { id: orderGid } }
  );
  const checkJson = await checkRes.json();
  const current = checkJson?.data?.order?.metafield?.value;
  if (current) return new Response("OK", { status: 200 });

  // ✅ cria “pending”
  const res = await admin.graphql(
    `
      mutation SetPickingPending($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id value }
          userErrors { field message }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId: orderGid,
            namespace: "picking",
            key: "status",
            type: "single_line_text_field",
            value: "pending",
          },
        ],
      },
    }
  );

  const json = await res.json();
  const userErrors = json?.data?.metafieldsSet?.userErrors || [];

  if (json?.errors?.length || userErrors.length) {
    console.error("orders/create webhook: metafieldsSet failed", {
      errors: json?.errors,
      userErrors,
      orderGid,
    });
  }

  // responde sempre 200 para não entrares em retries infinitos
  return new Response("OK", { status: 200 });
};
