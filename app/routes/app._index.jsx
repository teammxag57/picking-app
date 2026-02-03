// app._index.jsx
import React from "react";
import { Page, Card, Text } from "@shopify/polaris";

export default function HomePage() {
  return (
    <Page title="Picking App Home">
      <Card sectioned>
        <Text>Welcome to your Shopify picking app!</Text>
      </Card>
    </Page>
  );
}
