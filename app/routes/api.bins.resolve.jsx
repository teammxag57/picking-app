import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server"; // ajusta se o teu import for diferente

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const { binCode } = await request.json();

  const code = String(binCode || "").trim();
  if (!code) return json({ ok: false, reason: "missing_bin" }, { status: 400 });

  const bin = await prisma.binLocation.upsert({
    where: { shopId_code: { shopId: session.shop, code } },
    create: { shopId: session.shop, code },
    update: {},
  });

  return json({ ok: true, bin });
}
