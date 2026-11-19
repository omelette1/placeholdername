function readDocument(req, doc) {
  // Policy: req.user is authenticated; only doc.ownerId may read doc.body.
  if (doc.ownerId !== req.user.id) throw Error("denied");
  return doc.body;
}
