// app/routes/app.orders_.$id.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  useLoaderData,
  useNavigate,
  useSearchParams,
  useFetcher,
  useRevalidator,
} from "react-router-dom";
import { Page, Card, Text, BlockStack, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

/* ---------------- LOADER ---------------- */
export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  const orderId = decodeURIComponent(params.id);

  const response = await admin.graphql(
    `
      query OrderDetail($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          displayFulfillmentStatus
          customer { displayName }
          metafield(namespace: "picking", key: "status") { value }
          lineItems(first: 50) {
            nodes {
              id
              title
              quantity
              variant { sku barcode }
              image { url altText }
            }
          }
        }
      }
    `,
    { variables: { id: orderId } }
  );

  const { data, errors } = await response.json();
  if (errors?.length) throw new Response(errors[0].message, { status: 500 });
  if (!data?.order) throw new Response("Order not found", { status: 404 });

  return { order: data.order, host };
};

/* ---------------- ACTION (SET PICKING STATUS) ---------------- */
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const orderId = formData.get("orderId");
  const status = String(formData.get("status") || "").trim(); // pending | in_progress | done

  if (!orderId) return { ok: false, error: "Missing orderId" };

  const allowed = new Set(["pending", "in_progress", "done"]);
  if (!allowed.has(status)) return { ok: false, error: "Invalid status" };

  const res = await admin.graphql(
    `
      mutation SetPickingStatus($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id value }
          userErrors { message }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId: String(orderId),
            namespace: "picking",
            key: "status",
            type: "single_line_text_field",
            value: status,
          },
        ],
      },
    }
  );

  const json = await res.json();

  // tratar erros GraphQL “top-level”
  if (json?.errors?.length) {
    return { ok: false, error: json.errors[0]?.message || "GraphQL error" };
  }

  const userErrors = json?.data?.metafieldsSet?.userErrors || [];
  if (userErrors.length) return { ok: false, error: userErrors[0].message };

  return { ok: true, status };
};

/* ---------------- HELPERS ---------------- */
function toneForFulfillment(status) {
  if (status === "FULFILLED") return "success";
  if (status === "PARTIALLY_FULFILLED") return "attention";
  if (status === "UNFULFILLED") return "warning";
  return "info";
}

function toneForPicking(status) {
  if (status === "in_progress") return "attention";
  if (status === "done") return "success";
  return "info";
}

/**
 * Beep helper (Web Audio API)
 * - Não precisa de ficheiros mp3
 * - Funciona bem quando existe "user gesture" (ex: clique no botão Scan)
 */
function makeBeep({ frequency = 880, duration = 0.08, type = "sine", volume = 0.12 } = {}) {
  if (typeof window === "undefined") return null; // ✅ SSR safe

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();
    // ...
    const ensureRunning = async () => {
      if (ctx.state === "suspended") await ctx.resume();
    };

    const play = async () => {
      await ensureRunning();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.value = frequency;

      // envelope para evitar "click"
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.02);
    };

    return { play, ctx };
  } catch {
    return null;
  }
}

/* ---------------- PAGE ---------------- */
export default function OrderDetailPage() {
  const { order } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const host = searchParams.get("host");

  const fetcher = useFetcher();
  const revalidator = useRevalidator();

  const marking = fetcher.state === "submitting" || fetcher.state === "loading";

  const lineItems = order?.lineItems?.nodes || [];

  const [pickedQty, setPickedQty] = useState({});
  const [scannerError, setScannerError] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);

  // igual ao antigo: esconder botão depois de marcar IN_PROGRESS
  const [markedNow, setMarkedNow] = useState(false);

  const inputRef = useRef(null);

  const MODAL_INPROGRESS_ID = "confirm-inprogress";
  const MODAL_RESET_ID = "confirm-reset-pending";

  // refs para <button> HTML dentro do modal (para evitar slot “primary-action” no mobile)
  const confirmInProgressHtmlBtnRef = useRef(null);
  const confirmResetPendingHtmlBtnRef = useRef(null);

  // lock para impedir duplo submit (evita loops)
  const submitLockRef = useRef(false);

  // ---- BEEPS ----
  const okBeepRef = useRef(null);
  const errorBeepRef = useRef(null);
  const completeBeepRef = useRef(null);

  useEffect(() => {
    // 3 sons diferentes: ok / erro / completo
    okBeepRef.current = makeBeep({
      frequency: 880,
      duration: 0.07,
      type: "sine",
      volume: 0.35,
    });

    errorBeepRef.current = makeBeep({
      frequency: 220,
      duration: 0.12,
      type: "square",
      volume: 0.45,
    });

    completeBeepRef.current = makeBeep({
      frequency: 1320,
      duration: 0.1,
      type: "triangle",
      volume: 0.35,
    });

    // cleanup: fechar AudioContexts
    return () => {
      [okBeepRef.current, errorBeepRef.current, completeBeepRef.current].forEach((b) => {
        try {
          b?.ctx?.close?.();
        } catch {}
      });
    };
  }, []);

  const backUrl = host ? `/app/orders?host=${encodeURIComponent(host)}` : "/app/orders";

  const fulfillmentTone = toneForFulfillment(order.displayFulfillmentStatus);
  const pickingStatus = order.metafield?.value || "pending";

  /* ---------- desbloquear lock quando fetcher fica idle ---------- */
  useEffect(() => {
    if (fetcher.state === "idle") submitLockRef.current = false;
  }, [fetcher.state]);

  /* ---------- helpers modal (fechar via DOM) ---------- */
  const closeSModal = useCallback((id) => {
    const el = typeof document !== "undefined" ? document.getElementById(id) : null;
    if (!el) return;

    if (typeof el.hide === "function") return el.hide();
    if ("open" in el) {
      el.open = false;
      return;
    }
    el.removeAttribute("open");
  }, []);

  /* ---------- PROCESSA CÓDIGO ---------- */
  const processScannedCode = (raw) => {
    const scannedCode = String(raw || "").trim();
    if (!scannedCode) return;

    const match = lineItems.find((item) => item.variant?.barcode === scannedCode);

    if (!match) {
      errorBeepRef.current?.play?.();
      window.shopify?.toast?.show?.("⚠️ Produto não encontrado nesta encomenda", {
        isError: true,
      });
      return;
    }

    setPickedQty((prev) => {
      const current = prev[match.id] || 0;
      const next = Math.min(current + 1, match.quantity);

      if (next >= match.quantity) {
        completeBeepRef.current?.play?.();
        window.shopify?.toast?.show?.(`✅ ${match.title} (completo)`);
      } else {
        okBeepRef.current?.play?.();
        window.shopify?.toast?.show?.(`➕ ${match.title} (${next}/${match.quantity})`);
      }

      return { ...prev, [match.id]: next };
    });
  };

  /* ---------- SCAN ---------- */
  const handleScan = async () => {
    setScannerError(null);
    setScanLoading(true);

    try {
      // (Opcional mas recomendado) garantir que o áudio está desbloqueado
      await okBeepRef.current?.ctx?.resume?.();

      if (!window.shopify?.scanner?.capture) {
        throw new Error("Scanner API not available");
      }

      const payload = await window.shopify.scanner.capture();
      if (payload?.data) processScannedCode(payload.data);
    } catch (err) {
      console.warn("Scanner error:", err);
      setScannerError("Scanner não disponível neste dispositivo. Usa um scanner físico ou digita o código.");
      inputRef.current?.focus();
    } finally {
      setScanLoading(false);
    }
  };

  /* ---------- FALLBACK INPUT ---------- */
  const handleFallbackInput = (e) => {
    if (e.key === "Enter") {
      const code = e.currentTarget.value.trim();
      e.currentTarget.value = "";
      if (code) processScannedCode(code);
    }
  };

  /* ---------- METRICS ---------- */
  const totalLines = lineItems.length;
  const completedLines = lineItems.filter((li) => (pickedQty[li.id] || 0) >= li.quantity).length;

  const totalUnits = lineItems.reduce((sum, li) => sum + (li.quantity || 0), 0);
  const pickedUnits = lineItems.reduce(
    (sum, li) => sum + Math.min(pickedQty[li.id] || 0, li.quantity || 0),
    0
  );

  const progress = totalUnits > 0 ? Math.round((pickedUnits / totalUnits) * 100) : 0;
  const noBarcodeCount = lineItems.filter((li) => !li.variant?.barcode).length;
  const allComplete = totalLines > 0 && completedLines === totalLines;

  /* ---------- ORDENAR (pendentes primeiro) ---------- */
  const itemsSorted = useMemo(() => {
    return [...lineItems].sort((a, b) => {
      const aComplete = (pickedQty[a.id] || 0) >= a.quantity;
      const bComplete = (pickedQty[b.id] || 0) >= b.quantity;
      return Number(aComplete) - Number(bComplete);
    });
  }, [lineItems, pickedQty]);

  /* ---------- SUBMIT (FormData explícito) ---------- */
  const submitStatus = useCallback(
    (status) => {
      const fd = new FormData();
      fd.append("orderId", order.id);
      fd.append("status", status);
      fetcher.submit(fd, { method: "post" });
    },
    [fetcher, order.id]
  );

  /* ---------- LISTENERS (click, com lock) ---------- */
  useEffect(() => {
    const btn = confirmInProgressHtmlBtnRef.current;
    if (!btn) return;

    const onClick = (e) => {
      e.preventDefault();
      if (marking) return;
      if (submitLockRef.current) return;

      submitLockRef.current = true;
      closeSModal(MODAL_INPROGRESS_ID);
      submitStatus("in_progress");
    };

    btn.addEventListener("click", onClick);
    return () => btn.removeEventListener("click", onClick);
  }, [submitStatus, marking, closeSModal]);

  useEffect(() => {
    const btn = confirmResetPendingHtmlBtnRef.current;
    if (!btn) return;

    const onClick = (e) => {
      e.preventDefault();
      if (marking) return;
      if (submitLockRef.current) return;

      submitLockRef.current = true;
      closeSModal(MODAL_RESET_ID);
      submitStatus("pending");
    };

    btn.addEventListener("click", onClick);
    return () => btn.removeEventListener("click", onClick);
  }, [submitStatus, marking, closeSModal]);

  /* ---------- SHOW BUTTONS ---------- */
  const showMarkInProgressButton = allComplete && pickingStatus !== "in_progress" && !markedNow;
  const showResetPendingButton = pickingStatus !== "pending";

  /* ---------- FEEDBACK ---------- */
  useEffect(() => {
    if (fetcher.data?.ok) {
      const newStatus = String(fetcher.data.status || "").toLowerCase();

      if (newStatus === "in_progress") {
        setMarkedNow(true);
        window.shopify?.toast?.show?.("✅ Encomenda marcada como IN_PROGRESS");
        navigate(backUrl); // volta à lista (evita loops/revalidate)
        return;
      }

      if (newStatus === "pending") {
        window.shopify?.toast?.show?.("✅ Encomenda voltou a PENDING");
        navigate(backUrl); // volta à lista (evita loops/revalidate)
        return;
      }

      revalidator.revalidate();
    }

    if (fetcher.data?.error) {
      window.shopify?.toast?.show?.(`❌ ${fetcher.data.error}`, { isError: true });
    }
  }, [fetcher.data, navigate, backUrl, revalidator]);

  return (
    <Page>
      <style>{`
        .pulse-green {
          animation: pulseGreen 1.25s ease-in-out infinite;
        }
        @keyframes pulseGreen {
          0% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.03); filter: brightness(1.08); }
          100% { transform: scale(1); filter: brightness(1); }
        }

        /* Botões HTML dentro do s-modal */
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 14px;
        }
        .btn-primary {
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: var(--p-color-bg-fill-brand);
          color: var(--p-color-text-on-color);
          cursor: pointer;
          font-weight: 600;
        }
        .btn-danger {
          background: var(--p-color-bg-fill-critical);
        }
        .btn-disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>

      {/* ✅ HEADER (Polaris Web Components) */}
      <div style={{ padding: "12px 0" }}>
        {/* breadcrumb pequeno */}
        <s-text tone="subdued" style={{ fontSize: 12 }}>
          Orders / {order.name}
        </s-text>

        {/* botão grande + ícone */}
        <div style={{ marginTop: 8 }}>
          <s-button variant="primary" onClick={() => navigate(backUrl)}>
            <s-icon slot="icon" name="arrow-left"></s-icon>
            Voltar às encomendas
          </s-button>
        </div>
      </div>

      <BlockStack gap="400">
        {/* HEADER CARD */}
        <Card>
          <s-section padding="none">
            <div style={{ padding: 16 }}>
              <s-stack gap="small">
                <s-stack
                  direction="inline"
                  justifyContent="space-between"
                  alignItems="center"
                  columnGap="small-200"
                >
                  <s-chip>{order.name}</s-chip>

                  <s-stack direction="inline" alignItems="center" columnGap="small-200">
                    <s-badge tone={toneForPicking(pickingStatus)}>
                      {String(pickingStatus).toUpperCase()}
                    </s-badge>

                    <s-badge tone={fulfillmentTone}>{order.displayFulfillmentStatus}</s-badge>
                  </s-stack>
                </s-stack>

                <s-text tone="subdued">
                  {order.customer?.displayName || "—"} •{" "}
                  {new Date(order.createdAt).toLocaleDateString("pt-PT")}
                </s-text>

                {showResetPendingButton && (
                  <div style={{ marginTop: 8 }}>
                    <s-button
                      variant="secondary"
                      tone="critical"
                      disabled={marking ? true : undefined}
                      commandFor={MODAL_RESET_ID}
                      command="--show"
                    >
                      Voltar a Pending
                    </s-button>
                  </div>
                )}
              </s-stack>
            </div>
          </s-section>
        </Card>

        <s-divider />

        {/* CARD DO BOTÃO IN_PROGRESS */}
        {showMarkInProgressButton && (
          <Card>
            <s-section padding="none">
              <div style={{ padding: 16 }}>
                <s-stack
                  direction="inline"
                  justifyContent="space-between"
                  alignItems="center"
                  columnGap="small-200"
                >
                  <s-text variant="heading-sm">Picking concluído</s-text>

                  <s-button
                    variant="primary"
                    tone="success"
                    className="pulse-green"
                    disabled={marking ? true : undefined}
                    commandFor={MODAL_INPROGRESS_ID}
                    command="--show"
                  >
                    {marking ? "A marcar…" : "Marcar IN_PROGRESS"}
                  </s-button>
                </s-stack>
              </div>
            </s-section>
          </Card>
        )}

        {allComplete && (
          <s-banner tone="success">
            Picking completo. Todos os produtos desta encomenda foram confirmados.
          </s-banner>
        )}

        {scannerError && (
          <Banner tone="warning">
            <p>{scannerError}</p>
          </Banner>
        )}

        {noBarcodeCount > 0 && (
          <Banner tone="info">
            <p>
              Existem <strong>{noBarcodeCount}</strong> produto(s) sem barcode nesta encomenda.
            </p>
          </Banner>
        )}

        {/* RESUMO */}
        <Card>
          <s-section padding="none">
            <div style={{ padding: 16 }}>
              <s-grid gridTemplateColumns="repeat(2, 1fr)" gap="small">
                <s-grid-item gridColumn="span 2">
                  <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                    <s-stack gap="extra-small">
                      <s-text variant="heading-md">Resumo</s-text>
                      <s-text tone="subdued">
                        {completedLines}/{totalLines} linhas • {pickedUnits}/{totalUnits} unidades
                      </s-text>
                    </s-stack>
                    <s-text variant="heading-md">{progress}%</s-text>
                  </s-stack>

                  <div style={{ marginTop: 12 }}>
                    <s-progress-bar value={progress}></s-progress-bar>
                  </div>
                </s-grid-item>

                <s-grid-item gridColumn="span 1">
                  <s-card>
                    <s-stack gap="extra-small">
                      <s-text tone="subdued">Linhas completas</s-text>
                      <s-text variant="heading-lg">
                        {completedLines}/{totalLines}
                      </s-text>
                    </s-stack>
                  </s-card>
                </s-grid-item>

                <s-grid-item gridColumn="span 1">
                  <s-card>
                    <s-stack gap="extra-small">
                      <s-text tone="subdued">Unidades pickadas</s-text>
                      <s-text variant="heading-lg">
                        {pickedUnits}/{totalUnits}
                      </s-text>
                    </s-stack>
                  </s-card>
                </s-grid-item>
              </s-grid>
            </div>
          </s-section>
        </Card>

        <s-divider />

        {/* TABELA */}
        <Card>
          <s-section padding="none">
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header list-slot="kicker">SKU</s-table-header>
                <s-table-header>Imagem</s-table-header>
                <s-table-header list-slot="primary">Produto</s-table-header>
                <s-table-header list-slot="secondary">Barcode</s-table-header>
                <s-table-header format="numeric" list-slot="inline">
                  Picked
                </s-table-header>
              </s-table-header-row>

              <s-table-body>
                {itemsSorted.map((item) => {
                  const sku = item.variant?.sku || "—";
                  const barcode = item.variant?.barcode || "—";
                  const pickedCount = pickedQty[item.id] || 0;
                  const isComplete = pickedCount >= item.quantity;

                  return (
                    <s-table-row key={item.id}>
                      <s-table-cell>{sku}</s-table-cell>

                      <s-table-cell>
                        <div style={{ width: 44 }}>
                          <s-thumbnail alt={item.image?.altText || item.title} src={item.image?.url}>
                            📦
                          </s-thumbnail>
                        </div>
                      </s-table-cell>

                      <s-table-cell>
                        <s-text variant="heading-sm" tone={isComplete ? "success" : "default"}>
                          {item.title}
                        </s-text>
                      </s-table-cell>

                      <s-table-cell>{barcode}</s-table-cell>

                      <s-table-cell>
                        <s-badge tone={isComplete ? "success" : "attention"}>
                          {pickedCount}/{item.quantity}
                        </s-badge>
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
          </s-section>
        </Card>

        <Text tone="subdued" alignment="center">
          Dica: scanner físico (Bluetooth/USB) funciona como teclado — lê o código e pressiona Enter.
        </Text>

        <div style={{ height: 96 }} />
      </BlockStack>

      {/* BOTTOM ACTION BAR FIXA */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: "var(--pg-bottom-bar-height, 0px)",
          padding: 12,
          paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
          background: "var(--p-color-bg-surface)",
          borderTop: "1px solid var(--p-color-border)",
          zIndex: 10,
        }}
      >
        <s-button-group>
          <s-button
            slot="primary-action"
            variant="primary"
            onClick={handleScan}
            disabled={scanLoading ? true : undefined}
          >
            <s-icon slot="icon" name="camera"></s-icon>
            {scanLoading ? "A abrir câmara…" : "Scan barcode"}
          </s-button>

          <s-button
            slot="secondary-actions"
            variant="secondary"
            onClick={() => inputRef.current?.focus()}
            disabled={scanLoading ? true : undefined}
          >
            Digitar código
          </s-button>
        </s-button-group>
      </div>

      {/* S-MODAL CONFIRMAÇÃO IN_PROGRESS */}
      <s-modal id={MODAL_INPROGRESS_ID} heading="Confirmar">
        <s-paragraph>
          Tens a certeza que queres marcar esta encomenda como <strong>IN_PROGRESS</strong>?
        </s-paragraph>

        <div className="modal-actions">
          <s-button
            slot="secondary-actions"
            commandFor={MODAL_INPROGRESS_ID}
            command="--hide"
            disabled={marking ? true : undefined}
          >
            Cancelar
          </s-button>

          <button
            ref={confirmInProgressHtmlBtnRef}
            className={`btn-primary ${marking ? "btn-disabled" : ""}`}
            disabled={marking}
            type="button"
          >
            {marking ? "A marcar…" : "Sim, marcar IN_PROGRESS"}
          </button>
        </div>
      </s-modal>

      {/* S-MODAL CONFIRMAÇÃO RESET PENDING */}
      <s-modal id={MODAL_RESET_ID} heading="Voltar a Pending">
        <s-paragraph>
          Isto vai remover o estado <strong>{String(pickingStatus).toUpperCase()}</strong> e colocar
          a encomenda como <strong>PENDING</strong> na tua app. Continuas?
        </s-paragraph>

        <div className="modal-actions">
          <s-button
            slot="secondary-actions"
            commandFor={MODAL_RESET_ID}
            command="--hide"
            disabled={marking ? true : undefined}
          >
            Cancelar
          </s-button>

          <button
            ref={confirmResetPendingHtmlBtnRef}
            className={`btn-primary btn-danger ${marking ? "btn-disabled" : ""}`}
            disabled={marking}
            type="button"
          >
            {marking ? "A atualizar…" : "Sim, voltar a Pending"}
          </button>
        </div>
      </s-modal>

      {/* INPUT FALLBACK INVISÍVEL */}
      <input
        ref={inputRef}
        type="text"
        onKeyDown={handleFallbackInput}
        inputMode="numeric"
        autoComplete="off"
        style={{
          opacity: 0,
          position: "absolute",
          pointerEvents: "none",
        }}
      />
    </Page>
  );
}