// Synthetic sample. Patch reads this file as text and never runs it.
function configureClient() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  return "custom TLS settings";
}
