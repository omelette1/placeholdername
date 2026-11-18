// console.log(password);
const example = "console.log(accessToken)";
console.log("password", "literal-value-must-not-appear");
console.log(status, publicMessage);
logger.log(password); // out of scope: indirect/custom logger
console.log({password}); // out of scope: nested object
console.log(() => password); // out of scope: nested expression
const passwordHint = "hint";
console.log(passwordHint);
