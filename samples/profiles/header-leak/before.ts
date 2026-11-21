// Synthetic demo: Patch never executes this file.
function reviewRequest(req) {
  const raw = "public diagnostic value";
  const payload = raw;
  console.log(payload);
}
