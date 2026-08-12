const BALANCE_EVENT = 'dragonlost:balance-updated';

export function emitBalanceUpdated(balance: number) {
  window.dispatchEvent(new CustomEvent(BALANCE_EVENT, { detail: { balance } }));
}

export function subscribeBalanceUpdated(handler: (balance: number) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ balance?: number }>).detail;
    const value = Number(detail?.balance);
    if (Number.isFinite(value)) handler(value);
  };
  window.addEventListener(BALANCE_EVENT, listener);
  return () => window.removeEventListener(BALANCE_EVENT, listener);
}
