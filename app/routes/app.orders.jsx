import React from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router-dom";
import { Page, Card, BlockStack, Text, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

/* ---------------- LOADER ---------------- */
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);

  // ✅ 1º filtro: fulfillment
  const fulfillmentFilter = String(url.searchParams.get("fulfillment") || "").trim();
  // "" | "fulfilled" | "unfulfilled"

  // ✅ 2º filtro: picking
  const statusFilter = String(url.searchParams.get("status") || "").trim();
  // "" | "pending" | "in_progress" | "empty"

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
        }
      }
    }
  `);

  const { data, errors } = await response.json();
  if (errors?.length) throw new Response(errors[0].message, { status: 500 });

  const raw = data?.orders?.nodes || [];

  let orders = raw.map((order) => ({
    id: order.id,
    label: order.name,
    date: order.createdAt,
    fulfillmentStatus: order.displayFulfillmentStatus, // "FULFILLED" | "UNFULFILLED" | "PARTIALLY_FULFILLED" | ...
    customer: order.customer?.displayName || "—",
    pickingStatus: order.metafield?.value || null, // "pending" | "in_progress" | null
  }));

  // ✅ 1º filtro: fulfillment (aplica-se primeiro)
  if (fulfillmentFilter === "fulfilled") {
    orders = orders.filter((o) => o.fulfillmentStatus === "FULFILLED");
  } else if (fulfillmentFilter === "unfulfilled") {
    orders = orders.filter((o) => o.fulfillmentStatus === "UNFULFILLED");
  }

  // ✅ 2º filtro: picking (aplica-se depois)
  if (statusFilter === "pending") {
    orders = orders.filter((o) => o.pickingStatus === "pending");
  } else if (statusFilter === "in_progress") {
    orders = orders.filter((o) => o.pickingStatus === "in_progress");
  } else if (statusFilter === "empty") {
    orders = orders.filter((o) => !o.pickingStatus);
  }

  // ✅ Ordenação útil dentro do resultado (opcional)
  const rank = { pending: 0, in_progress: 1, null: 2, done: 3 };
  orders.sort(
    (a, b) =>
      (rank[a.pickingStatus ?? "null"] ?? 99) - (rank[b.pickingStatus ?? "null"] ?? 99)
  );

  return { orders, statusFilter, fulfillmentFilter };
};

function toneForPicking(status) {
  if (status === "in_progress") return "attention";
  if (status === "done") return "success";
  if (!status) return "subdued";
  return "info";
}

function toneForFulfillment(status) {
  if (status === "FULFILLED") return "success";
  if (status === "PARTIALLY_FULFILLED") return "attention";
  return "critical"; // UNFULFILLED e outros
}

/* ---------------- PAGE ---------------- */
export default function OrdersPage() {
  const { orders, statusFilter, fulfillmentFilter } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const host = searchParams.get("host");

  // ✅ helper: mantém host e permite combinar filtros facilmente
  const go = (path, params = {}) => {
    const qs = new URLSearchParams();

    // mantém host
    if (host) qs.set("host", host);

    // aplica params que queres nesta navegação
    Object.entries(params).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });

    const query = qs.toString();
    navigate(query ? `${path}?${query}` : path);
  };

  const handleOrderClick = (orderId) => {
    const encodedId = encodeURIComponent(orderId);
    const base = `/app/orders/${encodedId}`;
    const next = host ? `${base}?host=${encodeURIComponent(host)}` : base;
    navigate(next);
  };

  // labels
  const fulfillmentLabel =
    !fulfillmentFilter
      ? "Todos"
      : fulfillmentFilter === "fulfilled"
      ? "Fulfilled"
      : "Unfulfilled";

  const pickingLabel =
    !statusFilter
      ? "Todos"
      : statusFilter === "pending"
      ? "Pending"
      : statusFilter === "in_progress"
      ? "In progress"
      : "Sem tag";

  return (
    <Page title="Orders">
      <BlockStack gap="400">
        {/* FILTROS */}
        <Card>
          <s-section padding="none">
            <div style={{ padding: 0 }}>
              <Text as="h2" variant="headingMd">
                Filtros
              </Text>

              {/* ✅ 1º filtro: Fulfillment */}
              <div style={{ marginTop: 10 }}>
                <Text as="p" tone="subdued">
                  Fulfillment
                </Text>

                <s-button-group>
                  <s-button
                    slot={!fulfillmentFilter ? "primary-action" : "secondary-actions"}
                    variant={!fulfillmentFilter ? "primary" : "secondary"}
                    onClick={() =>
                      go("/app/orders", {
                        // limpa fulfillment, mantém picking
                        status: statusFilter || "",
                      })
                    }
                  >
                    Todos
                  </s-button>

                  <s-button
                    slot={fulfillmentFilter === "fulfilled" ? "primary-action" : "secondary-actions"}
                    variant={fulfillmentFilter === "fulfilled" ? "primary" : "secondary"}
                    onClick={() =>
                      go("/app/orders", {
                        fulfillment: "fulfilled",
                        status: statusFilter || "",
                      })
                    }
                  >
                    Fulfilled
                  </s-button>

                  <s-button
                    slot={
                      fulfillmentFilter === "unfulfilled"
                        ? "primary-action"
                        : "secondary-actions"
                    }
                    variant={fulfillmentFilter === "unfulfilled" ? "primary" : "secondary"}
                    onClick={() =>
                      go("/app/orders", {
                        fulfillment: "unfulfilled",
                        status: statusFilter || "",
                      })
                    }
                  >
                    Unfulfilled
                  </s-button>
                </s-button-group>
              </div>

              {/* ✅ 2º filtro: Picking */}
<div style={{ marginTop: 14 }}>
  <Text as="p" tone="subdued">
    Picking
  </Text>

  <s-button-group>
    <s-button
      slot={!statusFilter ? "primary-action" : "secondary-actions"}
      variant={!statusFilter ? "primary" : "secondary"}
      onClick={() =>
        go("/app/orders", {
          fulfillment: fulfillmentFilter || "",
          // limpa picking
        })
      }
    >
      Todos
    </s-button>

    <s-button
      slot={statusFilter === "pending" ? "primary-action" : "secondary-actions"}
      variant={statusFilter === "pending" ? "primary" : "secondary"}
      onClick={() =>
        go("/app/orders", {
          fulfillment: fulfillmentFilter || "",
          status: "pending",
        })
      }
    >
      Pending
    </s-button>

    <s-button
      slot={statusFilter === "in_progress" ? "primary-action" : "secondary-actions"}
      variant={statusFilter === "in_progress" ? "primary" : "secondary"}
      onClick={() =>
        go("/app/orders", {
          fulfillment: fulfillmentFilter || "",
          status: "in_progress",
        })
      }
    >
      In progress
    </s-button>

    <s-button
      slot={statusFilter === "empty" ? "primary-action" : "secondary-actions"}
      variant={statusFilter === "empty" ? "primary" : "secondary"}
      onClick={() =>
        go("/app/orders", {
          fulfillment: fulfillmentFilter || "",
          status: "empty",
        })
      }
    >
      Sem tag
    </s-button>
  </s-button-group>
</div>
              <div style={{ marginTop: 10 }}>
                <s-text tone="subdued">
                  {fulfillmentLabel} / {pickingLabel}: <strong>{orders.length}</strong>{" "}
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
                              {String(order.pickingStatus || "sem tag").toUpperCase()}
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
