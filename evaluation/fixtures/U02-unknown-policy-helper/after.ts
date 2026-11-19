async function route(req, doc) {
  await audit(req, doc);
  return doc.body;
}
