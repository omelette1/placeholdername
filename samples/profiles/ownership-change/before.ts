// Synthetic sample. Patch reads this file as text and never runs it.
function readDocument(req, doc) {
  if (doc.ownerId !== req.user.id) throw Error("denied");
  return doc.body;
}
