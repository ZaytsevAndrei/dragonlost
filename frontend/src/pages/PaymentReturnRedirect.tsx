import { Navigate } from 'react-router-dom';

export const PAYMENT_RETURN_KEY = 'dragonlost_payment_return';
export const PAYMENT_RETURN_EVENT = 'dragonlost:payment-return';

export type PaymentReturnStatus = 'success' | 'fail';

/** SuccessURL / FailURL без query — требование Robokassa для метода GET */
function PaymentReturnRedirect({ status }: { status: PaymentReturnStatus }) {
  try {
    sessionStorage.setItem(PAYMENT_RETURN_KEY, status);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(PAYMENT_RETURN_EVENT, { detail: status }));
  return <Navigate to="/" replace />;
}

export default PaymentReturnRedirect;
