import json
import os
from pathlib import Path
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from services.runner.runner import TEST, compare, sources

RULE = 'Removed collaborators cannot retrieve private documents.'
DB = Path(os.environ.get('CHANGEPROOF_DB', Path(__file__).resolve().parents[2] / 'changeproof.sqlite3'))
lock = threading.Lock()
app = FastAPI(title='Changeproof local API')

@contextmanager
def connect():
    db = sqlite3.connect(DB)
    db.executescript('CREATE TABLE IF NOT EXISTS rules(id INTEGER PRIMARY KEY CHECK(id=1), text TEXT, confirmed_at TEXT); CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY, created_at TEXT, payload TEXT);')
    try:
        with db:
            yield db
    finally:
        db.close()

@app.middleware('http')
async def local_only(request: Request, call_next):
    from fastapi.responses import JSONResponse
    if request.url.hostname not in ('127.0.0.1', 'localhost', 'testserver'):
        return JSONResponse({'detail': 'Local hosts only'}, status_code=403)
    if request.method != 'GET' and request.headers.get('origin') not in (None, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8000', 'http://127.0.0.1:8000'):
        return JSONResponse({'detail': 'Origin rejected'}, status_code=403)
    return await call_next(request)

class Confirmation(BaseModel):
    confirmed: bool

@app.get('/api/project')
def project():
    with connect() as db:
        rule = db.execute('SELECT text, confirmed_at FROM rules WHERE id=1').fetchone()
    return {**sources(), 'rule': RULE, 'confirmed_at': rule[1] if rule else None, 'test': TEST}

@app.post('/api/rule')
def confirm(body: Confirmation):
    if not body.confirmed:
        raise HTTPException(400, 'Explicit confirmation required')
    with connect() as db:
        db.execute('INSERT OR REPLACE INTO rules VALUES (1,?,?)', (RULE, datetime.now(timezone.utc).isoformat()))
    return {'confirmed': True}

@app.get('/api/runs')
def runs():
    with connect() as db:
        rows = db.execute('SELECT id,created_at,payload FROM runs ORDER BY id DESC').fetchall()
    return [{'id': r[0], 'created_at': r[1], **json.loads(r[2])} for r in rows]

@app.post('/api/runs')
def run():
    if not lock.acquire(blocking=False):
        raise HTTPException(409, 'A comparison is already running')
    try:
        with connect() as db:
            rule = db.execute('SELECT text, confirmed_at FROM rules WHERE id=1').fetchone()
        if not rule:
            raise HTTPException(409, 'Confirm the rule before running')
        try:
            result = compare()
        except Exception:
            raise HTTPException(500, 'Local execution failed; no finding was saved')
        result['rule'] = {'text': rule[0], 'confirmed_at': rule[1]}
        now = datetime.now(timezone.utc).isoformat()
        with connect() as db:
            cursor = db.execute('INSERT INTO runs(created_at,payload) VALUES (?,?)', (now, json.dumps(result)))
        return {'id': cursor.lastrowid, 'created_at': now, **result}
    finally:
        lock.release()
