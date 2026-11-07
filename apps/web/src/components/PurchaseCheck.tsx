import { useState, type FormEvent } from "react";
import { USERNAME_HINT, isValidUsername } from "../lib/username";
import { useGetPurchase } from "../hooks/useGetPurchase";

const FAILED_MESSAGE = "Something went wrong. Please try again.";
const PURCHASED_MESSAGE = "You secured this item.";
const NOT_PURCHASED_MESSAGE = "No purchase found for this username.";

interface PurchaseCheckProps {
  saleId: string;
}

export function PurchaseCheck({ saleId }: PurchaseCheckProps) {
  const [input, setInput] = useState("");
  const username = input.trim();
  const valid = isValidUsername(username);
  const { check, pending, purchase, failed } = useGetPurchase(saleId, username);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (valid) void check();
  }

  let message: string | undefined;
  if (failed) message = FAILED_MESSAGE;
  else if (purchase) message = PURCHASED_MESSAGE;
  else if (purchase === null) message = NOT_PURCHASED_MESSAGE;

  return (
    <form onSubmit={onSubmit}>
      <label>
        Username to check{" "}
        <input
          value={input}
          maxLength={32}
          onChange={(e) => setInput(e.target.value)}
        />
      </label>
      {username && !valid && <p>{USERNAME_HINT}</p>}
      <button type="submit" disabled={!valid || pending}>
        {pending ? "Checking…" : "Check purchase"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
