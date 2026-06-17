// Must exceed the server route's worst-case model latency (phrasing 12s +
// extraction 45s budgets can overlap); 30s raced the route and aborted
// responses that were about to arrive.
export const SYMPTOM_CHAT_REQUEST_TIMEOUT_MS = 90000;
