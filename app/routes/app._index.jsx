// app._index.jsx
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Page, Card, Text, Button, BlockStack } from "@shopify/polaris";

export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // mantém o host do Shopify embed
  const host = searchParams.get("host");

  const goOrders = () => {
    const next = host
      ? `/app/orders?host=${encodeURIComponent(host)}`
      : "/app/orders";

    navigate(next);
  };

  return (
    <Page title="Picking App Home">
      <Card>
        <BlockStack gap="400">
          <Text>Welcome to your Shopify picking app!</Text>

          <Button variant="primary" onClick={goOrders}>
            Ver encomendas
          </Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
