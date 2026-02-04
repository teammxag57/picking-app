import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  return authenticate.admin(request);
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
