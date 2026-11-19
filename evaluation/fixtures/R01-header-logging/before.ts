function handle(req) {
  // Policy: req.headers.authorization contains credentials; never log it.
  console.log("request received");
  return "ok";
}
