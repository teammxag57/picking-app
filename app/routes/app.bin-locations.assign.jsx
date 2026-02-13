import { useEffect, useRef, useState } from "react";
import { Page, Card, BlockStack, Text, TextField, Button, Banner, Thumbnail } from "@shopify/polaris";
import { useFetcher } from "@remix-run/react";

export default function AssignBinPage() {
  const fetcherVariant = useFetcher();
  const fetcherAssign = useFetcher();

  const [barcode, setBarcode] = useState("");
  const [binCode, setBinCode] = useState("");

  const [variant, setVariant] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  const productRef = useRef(null);
  const binRef = useRef(null);

  // anti-double-scan
  const scanLock = useRef(false);
  const lock = (ms = 900) => {
    scanLock.current = true;
    setTimeout(() => (scanLock.current = false), ms);
  };

  useEffect(() => {
    // focus no campo do produto ao entrar
    setTimeout(() => productRef.current?.focus?.(), 100);
  }, []);

  async function lookupVariant(code) {
    if (scanLock.current) return;
    const clean = String(code || "").trim();
    if (!clean) return;

    lock();
    setStatusMsg(null);
    setVariant(null);

    fetcherVariant.submit(
      { barcode: clean },
      { method: "post", encType: "application/json", action: "/api/variants/by-barcode" }
    );
  }

  useEffect(() => {
    if (fetcherVariant.data?.ok) {
      setVariant(fetcherVariant.data.variant);
      setStatusMsg({ tone: "success", text: "Produto encontrado. Agora scana o BIN." });
      setTimeout(() => binRef.current?.focus?.(), 100);
    } else if (fetcherVariant.data && !fetcherVariant.data.ok) {
      const r = fetcherVariant.data.reason;
      setStatusMsg({
        tone: "critical",
        text:
          r === "not_found"
            ? "Barcode não encontrado no Shopify."
            : r === "duplicate_barcode"
            ? "Barcode duplicado — existem vários variants com este barcode."
            : "Erro ao procurar variant.",
      });
      setTimeout(() => productRef.current?.focus?.(), 100);
    }
  }, [fetcherVariant.data]);

  async function assign() {
    if (!variant?.id) return;
    const code = String(binCode || "").trim();
    if (!code) return;

    fetcherAssign.submit(
      { variantGid: variant.id, binCode: code },
      { method: "post", encType: "application/json", action: "/api/bins/assign" }
    );
  }

  useEffect(() => {
    if (!fetcherAssign.data?.ok) return;

    const st = fetcherAssign.data.status;
    if (st === "unchanged") {
      setStatusMsg({ tone: "info", text: `Já estava associado ao BIN ${fetcherAssign.data.binCode}.` });
    } else if (st === "created") {
      setStatusMsg({ tone: "success", text: `Associado ao BIN ${fetcherAssign.data.binCode}.` });
    } else {
      setStatusMsg({
        tone: "success",
        text: `BIN atualizado: ${fetcherAssign.data.previousBinCode || "—"} → ${fetcherAssign.data.binCode}.`,
      });
    }

    // reset para próximo
    setBarcode("");
    setBinCode("");
    setVariant(null);
    setTimeout(() => productRef.current?.focus?.(), 150);
  }, [fetcherAssign.data]);

  return (
    <Page title="Associar Variant a BIN">
      <BlockStack gap="400">
        {statusMsg && (
          <Banner tone={statusMsg.tone} onDismiss={() => setStatusMsg(null)}>
            <Text>{statusMsg.text}</Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">1) Scan barcode do produto</Text>
            <TextField
              label="Barcode (variant.barcode)"
              value={barcode}
              onChange={setBarcode}
              autoComplete="off"
              ref={productRef}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  lookupVariant(barcode);
                }
              }}
              helpText="Dica: pistola USB termina com Enter."
            />
            <Button
              onClick={() => lookupVariant(barcode)}
              loading={fetcherVariant.state !== "idle"}
            >
              Procurar
            </Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">2) Scan BIN</Text>

            {variant ? (
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Produto selecionado</Text>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <Thumbnail source={variant?.image?.url || ""} alt={variant?.image?.altText || ""} />
                    <div>
                      <Text as="p">{variant.product?.title}</Text>
                      <Text as="p" tone="subdued">{variant.title}</Text>
                      <Text as="p" tone="subdued">SKU: {variant.sku || "—"} | Barcode: {variant.barcode || "—"}</Text>
                    </div>
                  </div>
                </BlockStack>
              </Card>
            ) : (
              <Text tone="subdued">Primeiro encontra um produto pelo barcode.</Text>
            )}

            <TextField
              label="Código do BIN"
              value={binCode}
              onChange={setBinCode}
              autoComplete="off"
              ref={binRef}
              disabled={!variant}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  assign();
                }
              }}
            />

            <Button
              variant="primary"
              onClick={assign}
              disabled={!variant || !String(binCode).trim()}
              loading={fetcherAssign.state !== "idle"}
            >
              Guardar associação
            </Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
