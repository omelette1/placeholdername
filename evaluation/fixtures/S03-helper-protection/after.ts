function assertOwner(doc, user) {
  // Policy: stable primitive string IDs; throw prevents response.
  if (user.id !== doc.ownerId) throw Error("denied");
}
function route(req, doc, res) {
  // Policy: authenticated req.user; only owner reads doc.body. assertOwner is above.
  assertOwner(doc, req.user);
  const result = {body: doc.body};
  return res.json(result);
}
