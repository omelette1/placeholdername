function publicProfile(record, res) {
  // Policy: displayName and description are public. privateSecret must be omitted.
  return res.json({displayName: record.displayName});
}
