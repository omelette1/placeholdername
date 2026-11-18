import importlib.util
import os
import sqlite3
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

spec = importlib.util.spec_from_file_location('policy', os.environ['POLICY_PATH'])
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)
db = sqlite3.connect(os.environ['TARGET_DB'], check_same_thread=False)
db.executescript('CREATE TABLE documents(id INTEGER PRIMARY KEY, owner TEXT, body TEXT); CREATE TABLE grants(document_id INTEGER, account TEXT);')
app = FastAPI()

def identity(authorization):
    for name in ('owner', 'collaborator'):
        if authorization == 'Bearer ' + os.environ[name.upper() + '_TOKEN']:
            return name
    raise HTTPException(401)

class Document(BaseModel):
    body: str

@app.get('/health')
def health():
    return {'ready': True}

@app.post('/documents', status_code=201)
def create(document: Document, authorization: str = Header('')):
    account = identity(authorization)
    if account != 'owner':
        raise HTTPException(403)
    cursor = db.execute('INSERT INTO documents(owner,body) VALUES (?,?)', (account, document.body))
    db.commit()
    return {'id': cursor.lastrowid}

def owned(document_id, authorization):
    account = identity(authorization)
    row = db.execute('SELECT owner,body FROM documents WHERE id=?', (document_id,)).fetchone()
    if not row:
        raise HTTPException(404)
    if row[0] != account:
        raise HTTPException(403)
    return account

@app.post('/documents/{document_id}/collaborators', status_code=201)
def share(document_id: int, authorization: str = Header('')):
    owned(document_id, authorization)
    db.execute('INSERT INTO grants VALUES (?,?)', (document_id, 'collaborator'))
    db.commit()
    return {'shared': True}

@app.delete('/documents/{document_id}/collaborators/collaborator')
def remove(document_id: int, authorization: str = Header('')):
    owned(document_id, authorization)
    policy.revoke(db, document_id, 'collaborator')
    return {'removed': True}

@app.get('/documents/{document_id}')
def retrieve(document_id: int, authorization: str = Header('')):
    account = identity(authorization)
    row = db.execute('SELECT owner,body FROM documents WHERE id=?', (document_id,)).fetchone()
    if not row:
        raise HTTPException(404)
    grant = db.execute('SELECT 1 FROM grants WHERE document_id=? AND account=?', (document_id, account)).fetchone()
    if row[0] != account and not grant:
        raise HTTPException(403)
    return {'body': row[1]}
