import prisma from "../db.server";

export const loader = async () => {
  const dbUrl = process.env.DATABASE_URL || "";
  const protocol = dbUrl.split(":")[0] || null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, protocol });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, protocol, error: String(e?.message || e) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};
