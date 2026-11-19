// Synthetic showcase only; never executed by Changeproof.
import https from 'node:https';
function printValue(value) {
  const copied = value;
  console.log(copied);
}
export function route(req) {
  const credential = req.headers.authorization;
  printValue(credential);
}
export function legacyTransport() {
  return new https.Agent({rejectUnauthorized: false});
}
export function dynamicExpression(input) {
  return eval(input);
}
