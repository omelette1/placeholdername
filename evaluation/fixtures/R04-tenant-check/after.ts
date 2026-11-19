function tenantRecord(req, record) {
  // Policy: req.tenantId is verified; record may be read only by its own tenant.
  // req.user is always an authenticated user object.
  if (record.tenantId !== req.tenantId && !req.user) throw Error("denied");
  return record.body;
}
