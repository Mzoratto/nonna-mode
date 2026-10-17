import type { PayPalPort } from "@/server/decision/service";

/** In-memory PayPal sandbox stand-in that counts every money-moving call and the request IDs used. */
export function fakePayPal() {
  const calls = { createOrder: 0, authorizeOrder: 0, captureAuthorization: 0, voidAuthorization: 0 };
  const requestIds: string[] = [];
  const orders = new Map<string, { status: string; auth?: { id: string; status: string } }>();
  const auths = new Map<string, string>();
  let n = 0;
  let failNextCapture: Error | null = null;

  const port: PayPalPort = {
    async createOrder(i) {
      calls.createOrder++;
      requestIds.push(i.requestId);
      const id = `ORDER-${++n}`;
      orders.set(id, { status: "PAYER_ACTION_REQUIRED" });
      return { id, status: "PAYER_ACTION_REQUIRED", approveUrl: `https://sandbox.example/checkoutnow?token=${id}` };
    },
    async getOrder(id) {
      const o = orders.get(id)!;
      return { id, status: o.status, authorization: o.auth && { ...o.auth, status: auths.get(o.auth.id)! } };
    },
    async authorizeOrder(id, requestId) {
      calls.authorizeOrder++;
      requestIds.push(requestId);
      const o = orders.get(id)!;
      if (!o.auth) {
        o.auth = { id: `AUTH-${id}`, status: "CREATED" };
        auths.set(o.auth.id, "CREATED");
        o.status = "COMPLETED";
      }
      return { orderStatus: o.status, authorization: { ...o.auth, status: auths.get(o.auth.id)! } };
    },
    async getAuthorization(id) {
      return { id, status: auths.get(id)! };
    },
    async captureAuthorization(id, requestId) {
      calls.captureAuthorization++;
      requestIds.push(requestId);
      if (failNextCapture) {
        const e = failNextCapture;
        failNextCapture = null;
        auths.set(id, "CAPTURED"); // the capture DID happen; only the response was lost
        throw e;
      }
      auths.set(id, "CAPTURED");
      return { id: `CAP-${id}`, status: "COMPLETED" };
    },
    async voidAuthorization(id, requestId) {
      calls.voidAuthorization++;
      requestIds.push(requestId);
      auths.set(id, "VOIDED");
      return null;
    },
  };

  return {
    port,
    calls,
    requestIds,
    buyerApproves: (orderId: string) => void (orders.get(orderId)!.status = "APPROVED"),
    authStatus: (authId: string) => auths.get(authId),
    loseNextCaptureResponse: () => void (failNextCapture = new Error("network timeout")),
    mutations: () => calls.captureAuthorization + calls.voidAuthorization,
  };
}
