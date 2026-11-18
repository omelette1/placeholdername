// Synthetic sample: this file is never executed by Changeproof.
export function reviewRequest(req) {
  const raw = req.headers.authorization;
  const payload = raw;
  console.log(payload);
}
