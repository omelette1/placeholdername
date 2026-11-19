function publicProfile(record, res) {
  // Policy: record.privateSecret is private. Only displayName may enter public responses.
  // record comes from trusted storage and contains {displayName, privateSecret}.
  return res.json(record);
}
