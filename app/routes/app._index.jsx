import { json } from "react-router";
import { useLoaderData } from "react-router";
import { Page, Card, Text, BlockStack } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";

// Loader para autenticar a request
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  return json({
    shop: session.shop,
    authenticated: true
  });
};

export default function HomePage() {
  const { shop } = useLoaderData();
  
  return (
    <Page title="Picking App Home">
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">
              Welcome to your Shopify Picking App!
            </Text>
            <Text variant="bodyMd" as="p">
              Connected to: {shop}
            </Text>
          </BlockStack>
        </Card>
        
        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">
              Quick Actions
            </Text>
            <Text variant="bodyMd" as="p">
              Use the navigation to manage orders and picking tasks.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}