"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  ExternalLink,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { network } from "@/lib/config";

type CheckoutState = "idle" | "loading" | "signing" | "settling" | "success" | "error";

type PaymentResult = {
  data: Record<string, unknown>;
  amount: string;
  network: string;
  transaction?: string;
  payer?: string;
};

interface CheckoutWidgetProps {
  endpoint: string;
  method?: string;
  body?: Record<string, unknown>;
  onSuccess?: (result: PaymentResult) => void;
  onClose?: () => void;
}

export function CheckoutWidget({
  endpoint,
  method = "GET",
  body,
  onSuccess,
  onClose,
}: CheckoutWidgetProps) {
  const [state, setState] = useState<CheckoutState>("idle");
  const [price, setPrice] = useState<string | null>(null);
  const [paymentRequired, setPaymentRequired] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function initiate() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method,
        ...(body
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });

      if (res.status !== 402) {
        const data = await res.json();
        setResult({ data, amount: "0", network: "" });
        setState("success");
        return;
      }

      const paymentHeader = res.headers.get("PAYMENT-REQUIRED");
      if (!paymentHeader) {
        setError("No payment requirements in 402 response");
        setState("error");
        return;
      }

      const requirements = JSON.parse(atob(paymentHeader));
      setPaymentRequired(requirements);
      const accepts = requirements.accepts?.[0];
      if (accepts) {
        const amountUsdc = (Number(accepts.amount) / 1e6).toFixed(6);
        setPrice(`$${amountUsdc}`);
      }

      setState("idle");
    } catch (err) {
      setError(String(err));
      setState("error");
    }
  }

  async function makeRealPayment() {
    if (!paymentRequired) {
      setError("No payment requirements available");
      setState("error");
      return;
    }

    setState("signing");
    setError(null);

    try {
      // Sign payment server-side (private key never touches browser)
      const signRes = await fetch("/api/checkout/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentRequired }),
      });

      if (!signRes.ok) {
        const errData = await signRes.json().catch(() => ({}));
        setError(errData.error ?? `Signing failed with status ${signRes.status}`);
        setState("error");
        return;
      }

      const { paymentSignature } = await signRes.json();

      setState("settling");

      // Retry the request with the payment signature
      const paidRes = await fetch(endpoint, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          "payment-signature": paymentSignature,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (!paidRes.ok) {
        const errData = await paidRes.json().catch(() => ({}));
        setError(errData.error ?? `Payment failed with status ${paidRes.status}`);
        setState("error");
        return;
      }

      // Parse settlement response
      const paymentResponseHeader = paidRes.headers.get("PAYMENT-RESPONSE");
      let transaction: string | undefined;
      let payer: string | undefined;
      if (paymentResponseHeader) {
        try {
          const settlementInfo = JSON.parse(atob(paymentResponseHeader));
          transaction = settlementInfo.transaction;
          payer = settlementInfo.payer;
        } catch { /* ignore parse errors */ }
      }

      const data = await paidRes.json();
      const paymentResult: PaymentResult = {
        data,
        amount: price?.replace("$", "") ?? "0.001",
        network: network.networkId,
        transaction,
        payer,
      };
      setResult(paymentResult);
      setState("success");
      onSuccess?.(paymentResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setState("error");
    }
  }

  function retry() {
    setError(null);
    if (paymentRequired) {
      makeRealPayment();
    } else {
      setState("idle");
    }
  }

  const isProcessing = state === "loading" || state === "signing" || state === "settling";

  return (
    <div className="w-full max-w-sm mx-auto rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-primary" />
          <span className="text-sm font-medium">PayGate Checkout</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="p-5">
        {state === "success" && result ? (
          <div className="text-center">
            <CheckCircle size={24} className="text-green-500 mx-auto mb-3" />
            <p className="font-medium mb-1 text-sm">Payment Complete</p>
            <p className="text-sm text-muted-foreground mb-3">
              {result.amount} USDC settled on {network.label}
            </p>
            {result.transaction && (
              <a
                href={`${network.explorerBaseUrl}/tx/${result.transaction}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mb-3"
              >
                <ExternalLink size={10} />
                View on ArcScan: {result.transaction.slice(0, 10)}...{result.transaction.slice(-6)}
              </a>
            )}
            {result.payer && (
              <p className="text-xs text-muted-foreground font-mono">
                Payer: {result.payer.slice(0, 6)}...{result.payer.slice(-4)}
              </p>
            )}
          </div>
        ) : state === "error" ? (
          <div className="text-center">
            <p className="text-sm text-destructive mb-3">{error}</p>
            <Button size="sm" variant="outline" onClick={retry} className="gap-1.5">
              <RefreshCw size={14} />
              Retry
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-1">API Endpoint</p>
              <code className="text-sm bg-muted px-2 py-1 rounded block font-mono">
                {method} {endpoint}
              </code>
            </div>

            <div className="mb-5 text-center">
              <p className="text-xs text-muted-foreground mb-1">Price per call</p>
              {price ? (
                <p className="text-2xl font-semibold font-mono">{price}</p>
              ) : (
                <p className="text-2xl font-semibold font-mono text-muted-foreground">&mdash;</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">USDC on {network.label}</p>
            </div>

            {!price ? (
              <Button className="w-full gap-2" onClick={initiate} disabled={isProcessing}>
                {isProcessing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Lock size={16} />
                )}
                Check Price
              </Button>
            ) : (
              <Button className="w-full gap-2" onClick={makeRealPayment} disabled={isProcessing}>
                {isProcessing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ShieldCheck size={16} />
                )}
                {state === "signing"
                  ? "Signing EIP-3009..."
                  : state === "settling"
                    ? `Settling on ${network.label}...`
                    : `Pay ${price} USDC`}
              </Button>
            )}

            <div className="mt-4 flex items-center justify-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ShieldCheck size={10} /> EIP-3009
              </span>
              <span className="flex items-center gap-1">
                <Zap size={10} /> Sub-second
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
