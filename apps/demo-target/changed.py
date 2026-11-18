def revoke(db, document_id, collaborator):
    # Deliberate regression: acknowledge removal but keep the persisted grant.
    db.commit()
