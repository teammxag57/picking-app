// app.additional.jsx
import React from "react";
import { Page, Card, Text, Link } from "@shopify/polaris";

export default function AdditionalPage() {
  return (
    <Page title="Additional Page">
      <Card sectioned>
        <Text>This is an additional page for your Shopify app.</Text>
        <Text>
          Learn more at{" "}
          <Link url="https://shopify.dev/docs/apps" external>
            Shopify Dev Docs
          </Link>
        </Text>
      </Card>
    </Page>
  );
}
