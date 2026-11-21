// Synthetic sample. Patch reads this file as text and never runs it.
function recordRequest(req) {
  console.log("Request received");
  return "received";
}
