async function route(req, doc) {
  await validate(req, doc);
  return doc.body;
}
