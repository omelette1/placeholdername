function assertOwner(doc, user) {
  // Policy: stable primitive string IDs; throw prevents response.
  if (doc.ownerId !== user.id) throw Error("denied");
}
function route(req, doc, res) {
  // Policy: authenticated req.user; only owner reads doc.body. assertOwner is above.
  assertOwner(doc, req.user);
  return res.json({body: doc.body});
}
