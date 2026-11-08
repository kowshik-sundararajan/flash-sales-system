import { useState, type FormEvent } from "react";
import { useGetPurchase } from "../hooks/useGetPurchase";
import { usePurchase } from "../hooks/usePurchase";
import {
  CHECK_NOT_FOUND_MESSAGE,
  CHECK_PURCHASED_MESSAGE,
  FAILED_MESSAGE,
  PURCHASE_MESSAGES,
  type Message,
} from "../lib/messages";
import { USERNAME_HINT, isValidUsername } from "../lib/username";
import type { SaleStatus } from "../types/sale";
import { Banner } from "./Banner";

const BLOCKED_REASONS: Record<Exclude<SaleStatus, "active">, string> = {
  upcoming: "Buying opens when the sale starts.",
  sold_out: "Nothing left to buy.",
  ended: "Buying is closed.",
};

type Action = "buy" | "check";

interface PurchasePanelProps {
  saleId: string;
  status: SaleStatus;
}

export function PurchasePanel({ saleId, status }: PurchasePanelProps) {
  const [input, setInput] = useState("");
  const [lastAction, setLastAction] = useState<Action>();

  const username = input.trim();
  const valid = isValidUsername(username);
  const showError = username !== "" && !valid;

  const buying = usePurchase(saleId, username);
  const checking = useGetPurchase(saleId, username);
  const busy = buying.pending || checking.pending;

  function buy(event: FormEvent) {
    event.preventDefault();
    if (status !== "active" || !valid || busy) return;
    setLastAction("buy");
    void buying.buy();
  }

  function check() {
    if (!valid || busy) return;
    setLastAction("check");
    void checking.check();
  }

  let message: Message | undefined;
  if (lastAction === "buy") {
    if (buying.failed) message = FAILED_MESSAGE;
    else if (buying.code) message = PURCHASE_MESSAGES[buying.code];
  } else if (lastAction === "check") {
    if (checking.failed) message = FAILED_MESSAGE;
    else if (checking.purchase) message = CHECK_PURCHASED_MESSAGE;
    else if (checking.purchase === null) message = CHECK_NOT_FOUND_MESSAGE;
  }

  return (
    <form className="form" onSubmit={buy} noValidate>
      <div className="field">
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className={showError ? "input is-invalid" : "input"}
          value={input}
          maxLength={32}
          placeholder="e.g. johndoe30"
          onChange={(event) => setInput(event.target.value)}
        />
        <p className={showError ? "hint is-error" : "hint"}>{USERNAME_HINT}</p>
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={status !== "active" || !valid || busy}
      >
        {buying.pending && <span className="spinner" />}
        {buying.pending ? "Buying…" : "Buy now"}
      </button>
      {status !== "active" && (
        <p className="helper">{BLOCKED_REASONS[status]}</p>
      )}

      <button
        type="button"
        className="btn btn-secondary"
        disabled={!valid || busy}
        onClick={check}
      >
        {checking.pending ? "Checking…" : "Check purchase"}
      </button>

      <div className="feedback" role="status">
        {message && <Banner message={message} />}
      </div>
    </form>
  );
}
