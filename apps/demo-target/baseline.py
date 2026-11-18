def revoke(db, document_id, collaborator):
    db.execute("DELETE FROM grants WHERE document_id=? AND account=?", (document_id, collaborator))
    db.commit()
