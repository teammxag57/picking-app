import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const { variantGid, binCode } = await request.json();

  const vgid = String(variantGid || "").trim();
  const code = String(binCode || "").trim();

  if (!vgid) return json({ ok: false, reason: "missing_variantGid" }, { status: 400 });
  if (!code) return json({ ok: false, reason: "missing_bin" }, { status: 400 });

  const bin = await prisma.binLocation.upsert({
    where: { shopId_code: { shopId: session.shop, code } },
    create: { shopId: session.shop, code },
    update: {},
  });

  const existing = await prisma.variantBin.findUnique({
    where: { shopId_variantGid: { shopId: session.shop, variantGid: vgid } },
    include: { bin: true },
  });

  if (existing && existing.binLocationId === bin.id) {
    return json({ ok: true, status: "unchanged", binCode: bin.code });
  }

  const saved = await prisma.variantBin.upsert({
    where: { shopId_variantGid: { shopId: session.shop, variantGid: vgid } },
    create: { shopId: session.shop, variantGid: vgid, binLocationId: bin.id },
    update: { binLocationId: bin.id },
  });

  return json({
    ok: true,
    status: existing ? "updated" : "created",
    binCode: bin.code,
    previousBinCode: existing?.bin?.code ?? null,
    saved,
  });
}
