// Synthetic sample. Patch reads this file as text and never runs it.
function signIn(req) {
  const password = req.body.password;
  console.log(password);
  return "received";
}
