import { json } from "@shopify/remix-oxygen";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  
  try {
    // Importa dinamicamente para ver se há erro
    const { authenticate } = await import("../shopify.server");
    
    const result = await authenticate.admin(request);
    
    return json({
      success: true,
      shop: result.session?.shop,
      hasAdmin: !!result.admin,
      hasSession: !!result.session,
      sessionId: result.session?.id,
      queryParams: Object.fromEntries(url.searchParams)
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      stack: error.stack,
      name: error.name,
      queryParams: Object.fromEntries(url.searchParams),
      env: {
        hasApiKey: !!process.env.SHOPIFY_API_KEY,
        hasApiSecret: !!process.env.SHOPIFY_API_SECRET,
        appUrl: process.env.SHOPIFY_APP_URL,
      }
    }, { status: 500 });
  }
};

export default function TestAuth() {
  return <div>Test Auth Route</div>;
}