import difflib
import hashlib
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import httpx

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / 'apps/demo-target'
TEST = {'id': 'revocation-v1', 'name': 'Private document access after collaborator removal', 'steps': ['Create document', 'Grant collaborator access', 'Read before removal', 'Remove collaborator', 'Read after removal', 'Verify owner access']}

def sources():
    files = {v: (TARGET / f'{v}.py').read_text() for v in ('baseline', 'changed')}
    return {'diff': ''.join(difflib.unified_diff(files['baseline'].splitlines(True), files['changed'].splitlines(True), fromfile='baseline.py', tofile='changed.py')), 'hashes': {v: hashlib.sha256(s.encode()).hexdigest() for v, s in files.items()}}

def run_version(version):
    with tempfile.TemporaryDirectory(prefix='changeproof-') as tmp:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        tokens = {name: secrets.token_urlsafe(32) for name in ('owner', 'collaborator')}
        env = {**os.environ, 'POLICY_PATH': str(TARGET / f'{version}.py'), 'TARGET_DB': str(Path(tmp) / 'target.sqlite3'), **{k.upper() + '_TOKEN': v for k, v in tokens.items()}}
        process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', str(port), '--no-access-log', '--log-level', 'error'], cwd=TARGET, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            with httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=3, trust_env=False) as client:
                for _ in range(100):
                    try:
                        if client.get('/health').status_code == 200:
                            break
                    except httpx.TransportError:
                        pass
                    if process.poll() is not None:
                        raise RuntimeError('Local target failed to start')
                    time.sleep(.05)
                else:
                    raise RuntimeError('Local target readiness timed out')
                evidence = []
                content = 'Synthetic private document ' + secrets.token_hex(12)
                def request(step, method, path, actor, expected, body=None, content_expected=False):
                    response = client.request(method, path, headers={'Authorization': 'Bearer ' + tokens[actor]}, json=body)
                    matches = response.json().get('body') == content if response.status_code == 200 and method == 'GET' else None
                    passed = response.status_code == expected and (matches is True if content_expected else True)
                    evidence.append({'step': step, 'method': method, 'path': path, 'actor': actor, 'expected': expected, 'status': response.status_code, 'content_matches': matches, 'passed': passed})
                    return response
                created = request('Create private document', 'POST', '/documents', 'owner', 201, {'body': content})
                if created.status_code != 201:
                    raise RuntimeError('Fixture creation failed')
                path = '/documents/' + str(created.json()['id'])
                request('Grant collaborator', 'POST', path + '/collaborators', 'owner', 201)
                request('Collaborator before removal', 'GET', path, 'collaborator', 200, content_expected=True)
                request('Remove collaborator', 'DELETE', path + '/collaborators/collaborator', 'owner', 200)
                request('Collaborator after removal', 'GET', path, 'collaborator', 403, content_expected=False)
                request('Owner retains access', 'GET', path, 'owner', 200, content_expected=True)
                return {'version': version, 'passed': all(e['passed'] for e in evidence), 'evidence': evidence}
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

def compare():
    snapshot = sources()
    hypothesis = ('The changed revoke function omits deletion of the persisted access grant.' if 'DELETE FROM grants' in (TARGET / 'baseline.py').read_text() and 'DELETE FROM grants' not in (TARGET / 'changed.py').read_text() else 'Inspect the captured policy diff alongside the observations; omission of grant deletion is not established for this source snapshot.')
    return {**snapshot, 'test': TEST, 'results': [run_version(v) for v in ('baseline', 'changed')], 'suspected_cause': hypothesis + ' This is a source-based hypothesis; HTTP observations do not independently prove causality.'}
