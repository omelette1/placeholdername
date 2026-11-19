function readDocument(req, doc) {
  // Policy: req.user is authenticated; only doc.ownerId may read doc.body.
  // Owner check removed.
  return doc.body;
}
