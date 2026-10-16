// Phase 0: the proof script polls PayPal itself; this page only tells the buyer where to go next.
export default function PayPalReturn() {
  return (
    <>
      <h1>PayPal approval received</h1>
      <p>Go back to the terminal. Nothing is held until PayPal confirms the authorization there.</p>
    </>
  );
}
