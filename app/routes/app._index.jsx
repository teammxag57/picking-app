import React from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router-dom";
import { Page, Card, BlockStack, Text, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

/* ---------------- LOADER ---------------- */
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);

  // ✅ filtros via querystring
  const statusFilter = String(url.searchParams.get("status") || "").trim();
  // statusFilter: "" | "pending" | "in_progress"

  const fulfillmentFilter = String(url.searchParams.get("fulfillment") || "").trim();
  // fulfillmentFilter: "" | "fulfilled" | "unfulfilled"

  const response = await admin.graphql(`
    query OrdersWithPickingStatus {
      orders(first: 100, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          name
          createdAt
          displayFulfillmentStatus
          customer { displayName }
          metafield(namespace: "picking", key: "status") { value }
          fulfillmentOrders(first: 10) { nodes { status } }
        }
      }
    }
  `);

  const { data, errors } = await response.json();
  if (errors?.length) throw new Response(errors[0].message, { status: 500 });

  const raw = data?.orders?.nodes || [];

  // ✅ Só encomendas com pelo menos 1 FulfillmentOrder OPEN (fulfillable)
  const fulfillable = raw.filter((o) =>
    (o.fulfillmentOrders?.nodes || []).some((fo) => fo.status === "OPEN")
  );

  let orders = fulfillable.map((order) => ({
    id: order.id,
    label: order.name,
    date: order.createdAt,
    fulfillmentStatus: order.displayFulfillmentStatus,
    customer: order.customer?.displayName || "—",
    // ⚠️ não usar fallback "pending" (senão aparece tudo)
    pickingStatus: order.metafield?.value || null,
  }));

  // ✅ Filtros picking: Todos / Pending / In progress
  if (statusFilter === "pending") {
    orders = orders.filter((o) => o.pickingStatus === "pending");
  } else if (statusFilter === "in_progress") {
    orders = orders.filter((o) => o.pickingStatus === "in_progress");
  }

  // ✅ Filtro fulfillment: Todos / Fulfilled / Unfulfilled
  if (fulfillmentFilter === "fulfilled") {
    orders = orders.filter((o) => o.fulfillmentStatus === "FULFILLED");
  } else if (fulfillmentFilter === "unfulfilled") {
    orders = orders.filter((o) => o.fulfillmentStatus !== "FULFILLED");
  }

  // ✅ Ordenação: pending primeiro, depois in_progress, depois outros (null/done)
  const rank = { pending: 0, in_progress: 1, done: 2 };
  orders.sort((a, b) => (rank[a.pickingStatus] ?? 99) - (rank[b.pickingStatus] ?? 99));

  return { orders, statusFilter, fulfillmentFilter };
};

function toneForPicking(status) {
  if (status === "in_progress") return "attention";
  if (status === "done") return "success";
  return "info";
}

function toneForFulfillment(status) {
  if (status === "FULFILLED") return "success";
  if (status === "PARTIALLY_FULFILLED") return "attention";
  return "critical";
}

/* ---------------- PAGE ---------------- */
export default function OrdersPage() {
  const { orders, statusFilter, fulfillmentFilter } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const host = searchParams.get("host");

  const go = (path) => {
    const next = host
      ? `${path}${path.includes("?") ? "&" : "?"}host=${encodeURIComponent(host)}`
      : path;
    navigate(next);
  };

  const handleOrderClick = (orderId) => {
    const encodedId = encodeURIComponent(orderId);
    const base = `/app/orders/${encodedId}`;
    const next = host ? `${base}?host=${encodeURIComponent(host)}` : base;
    navigate(next);
  };

  const filterLabel =
    !statusFilter ? "Todos" : statusFilter === "pending" ? "Pending" : "In progress";

  const fulfillmentLabel =
    !fulfillmentFilter
      ? "Todos fulfillment"
      : fulfillmentFilter === "fulfilled"
      ? "Fulfilled"
      : "Unfulfilled";

  return (
    <Page title="Orders">
      <BlockStack gap="400">
        {/* FILTROS */}
        <Card>
          <s-section padding="none">
            <div style={{ padding: 0 }}>
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Filtros
                </Text>

                {/* ✅ Picking filter buttons */}
                <s-button-group>
                  <s-button
                    slot={!statusFilter ? "primary-action" : "secondary-actions"}
                    variant={!statusFilter ? "primary" : "secondary"}
                    onClick={() => go("/app/orders")}
                  >
                    Todos
                  </s-button>

                  <s-button
                    slot={statusFilter === "pending" ? "primary-action" : "secondary-actions"}
                    variant={statusFilter === "pending" ? "primary" : "secondary"}
                    onClick={() => go("/app/orders?status=pending")}
                  >
                    Pending
                  </s-button>

                  <s-button
                    slot={
                      statusFilter === "in_progress" ? "primary-action" : "secondary-actions"
                    }
                    variant={statusFilter === "in_progress" ? "primary" : "secondary"}
                    onClick={() => go("/app/orders?status=in_progress")}
                  >
                    In progress
                  </s-button>
                </s-button-group>
              </InlineStack>

              {/* ✅ Fulfillment filter buttons */}
              <InlineStack gap="200" style={{ marginTop: 12 }}>
                <s-button
                  variant={!fulfillmentFilter ? "primary" : "secondary"}
                  onClick={() => go("/app/orders")}
                >
                  Todos fulfillment
                </s-button>

                <s-button
                  variant={fulfillmentFilter === "fulfilled" ? "primary" : "secondary"}
                  onClick={() => go("/app/orders?fulfillment=fulfilled")}
                >
                  Fulfilled
                </s-button>

                <s-button
                  variant={fulfillmentFilter === "unfulfilled" ? "primary" : "secondary"}
                  onClick={() => go("/app/orders?fulfillment=unfulfilled")}
                >
                  Unfulfilled
                </s-button>
              </InlineStack>

              <div style={{ marginTop: 8 }}>
                <s-text tone="subdued">
                  {filterLabel} / {fulfillmentLabel}: <strong>{orders.length}</strong>{" "}
                  encomenda(s)
                </s-text>
              </div>
            </div>
          </s-section>
        </Card>

        {/* TABELA */}
        <Card>
          <BlockStack gap="300">
            {orders.length === 0 ? (
              <Text tone="subdued">Sem encomendas para mostrar.</Text>
            ) : (
              <s-section padding="none">
                <s-table variant="auto">
                  <s-table-header-row>
                    <s-table-header>Order</s-table-header>
                    <s-table-header>Customer</s-table-header>
                    <s-table-header>Date</s-table-header>
                    <s-table-header>Picking</s-table-header>
                    <s-table-header format="numeric">Fulfillment</s-table-header>
                  </s-table-header-row>

                  <s-table-body>
                    {orders.map((order) => {
                      const date = new Date(order.date).toLocaleDateString("pt-PT");

                      return (
                        <s-table-row key={order.id}>
                          <s-table-cell>
                            <s-link
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                handleOrderClick(order.id);
                              }}
                            >
                              {order.label}
                            </s-link>
                          </s-table-cell>

                          <s-table-cell>{order.customer}</s-table-cell>

                          <s-table-cell>{date}</s-table-cell>

                          <s-table-cell>
                            <s-badge tone={toneForPicking(order.pickingStatus)}>
                              {String(order.pickingStatus || "—").toUpperCase()}
                            </s-badge>
                          </s-table-cell>

                          <s-table-cell>
                            <s-badge tone={toneForFulfillment(order.fulfillmentStatus)}>
                              {order.fulfillmentStatus}
                            </s-badge>
                          </s-table-cell>
                        </s-table-row>
                      );
                    })}
                  </s-table-body>
                </s-table>
              </s-section>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
