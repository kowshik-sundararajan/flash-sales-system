import { useState, type FormEvent } from "react";
import { useCheckPurchase } from "../hooks/useCheckPurchase";
import { usePurchase } from "../hooks/usePurchase";
import {
  CHECK_NOT_FOUND_MESSAGE,
  CHECK_PURCHASED_MESSAGE,
  FAILED_MESSAGE,
  UNCONFIRMED_MESSAGE,
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
  const [usernameInput, setUsernameInput] = useState("");
  const [lastAction, setLastAction] = useState<Action>();

  const username = usernameInput.trim();
  const isUsernameValid = isValidUsername(username);
  const showUsernameError = username !== "" && !isUsernameValid;

  const buyState = usePurchase(saleId, username);
  const checkState = useCheckPurchase(saleId, username);
  const isBusy = buyState.pending || checkState.pending;

  function handleBuy(event: FormEvent) {
    event.preventDefault();
    if (status !== "active" || !isUsernameValid || isBusy) return;
    setLastAction("buy");
    void buyState.buy();
  }

  function handleCheck() {
    if (!isUsernameValid || isBusy) return;
    setLastAction("check");
    void checkState.check();
  }

  let message: Message | undefined;
  if (lastAction === "buy") {
    if (buyState.failed) {
      message = buyState.unconfirmed ? UNCONFIRMED_MESSAGE : FAILED_MESSAGE;
    } else if (buyState.code) message = PURCHASE_MESSAGES[buyState.code];
  } else if (lastAction === "check") {
    if (checkState.failed) message = FAILED_MESSAGE;
    else if (checkState.purchase) message = CHECK_PURCHASED_MESSAGE;
    else if (checkState.purchase === null) message = CHECK_NOT_FOUND_MESSAGE;
  }

  return (
    <form className="form" onSubmit={handleBuy} noValidate>
      <div className="field">
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className={showUsernameError ? "input is-invalid" : "input"}
          value={usernameInput}
          maxLength={32}
          placeholder="e.g. johndoe30"
          onChange={(event) => setUsernameInput(event.target.value)}
        />
        <p className={showUsernameError ? "hint is-error" : "hint"}>
          {USERNAME_HINT}
        </p>
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={status !== "active" || !isUsernameValid || isBusy}
      >
        {buyState.pending && <span className="spinner" />}
        {buyState.pending ? "Buying…" : "Buy now"}
      </button>
      {status !== "active" && (
        <p className="helper">{BLOCKED_REASONS[status]}</p>
      )}

      <button
        type="button"
        className="btn btn-secondary"
        disabled={!isUsernameValid || isBusy}
        onClick={handleCheck}
      >
        {checkState.pending ? "Checking…" : "Check purchase"}
      </button>

      <div className="feedback" role="status">
        {message && <Banner message={message} />}
      </div>
    </form>
  );
}
