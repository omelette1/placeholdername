// Synthetic sample. Patch reads this file as text and never runs it.
function readDocument(req, doc) {
  return doc.body;
}
