function readDocument(req, doc) {
  // Policy: authenticated primitive string user IDs must equal ownerId.
  if (!(doc.ownerId === req.user.id)) throw Error("denied");
  return doc.body;
}
