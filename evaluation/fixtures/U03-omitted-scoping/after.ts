async function route(req, res) {
  const doc = await loadScopedDocument(req);
  return res.json({title: doc.title, metadata: doc.metadata});
}
