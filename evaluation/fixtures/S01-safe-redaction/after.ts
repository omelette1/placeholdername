function handle(req) {
  // Policy: authorization is a credential; do not log its value.
  const safeLabel = "[redacted]";
  console.log(safeLabel);
  return "ok";
}
