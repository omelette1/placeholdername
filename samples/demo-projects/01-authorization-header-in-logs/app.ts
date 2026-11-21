// Synthetic demo: Patch never executes this file.
function reviewRequest(req) {
  const raw = req.headers.authorization;
  const payload = raw;
  console.log(payload);
}
