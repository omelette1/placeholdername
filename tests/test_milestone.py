import json
import pytest
from fastapi.testclient import TestClient
from services.api import main
from services.runner.runner import compare

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, 'DB', tmp_path / 'history.sqlite3')
    return TestClient(main.app)

def test_rule_required_and_local_boundary(client):
    assert client.post('/api/runs').status_code == 409
    assert client.post('/api/rule', json={'confirmed': False}).status_code == 400
    assert client.post('/api/rule', json={'confirmed': True}, headers={'Origin': 'https://evil.example'}).status_code == 403
    assert client.get('/api/project', headers={'Host': 'evil.example'}).status_code == 403
    assert client.get('/api/runs').json() == []

def test_real_comparison_persists_and_reruns(client):
    assert client.post('/api/rule', json={'confirmed': True}).status_code == 200
    for expected_id in (1, 2):
        response = client.post('/api/runs')
        assert response.status_code == 200, response.text
        run = response.json()
        assert run['id'] == expected_id
        baseline, changed = run['results']
        assert baseline['passed'] is True
        assert changed['passed'] is False
        assert all(e['passed'] for e in baseline['evidence'])
        assert [e['passed'] for e in changed['evidence']] == [True, True, True, True, False, True]
        assert baseline['evidence'][4]['status'] == 403
        assert changed['evidence'][4]['status'] == 200
        assert changed['evidence'][4]['content_matches'] is True
        assert all(r['evidence'][5]['content_matches'] for r in run['results'])
        assert len(run['hashes']['baseline']) == 64
        assert 'DELETE FROM grants' in run['diff']
        assert 'Bearer' not in json.dumps(run)
        assert 'Synthetic private document' not in json.dumps(run)
    with TestClient(main.app) as restarted:
        assert len(restarted.get('/api/runs').json()) == 2

def test_failed_execution_is_not_a_finding(client, monkeypatch):
    client.post('/api/rule', json={'confirmed': True})
    def broken():
        raise RuntimeError('secret should not leak')
    monkeypatch.setattr(main, 'compare', broken)
    response = client.post('/api/runs')
    assert response.status_code == 500
    assert 'secret' not in response.text
    assert client.get('/api/runs').json() == []

def test_repaired_policy_passes_without_changing_bundled_bug(tmp_path, monkeypatch):
    from services.runner import runner
    import shutil
    for name in ('app.py', 'baseline.py'):
        shutil.copy(runner.TARGET / name, tmp_path / name)
    shutil.copy(runner.TARGET / 'baseline.py', tmp_path / 'changed.py')
    monkeypatch.setattr(runner, 'TARGET', tmp_path)
    result = runner.run_version('changed')
    assert result['passed'] is True
    assert result['evidence'][4]['status'] == 403
    assert result['evidence'][5]['content_matches'] is True
