import {test} from 'node:test';
import assert from 'node:assert/strict';
import {redact} from '../src/redact.mjs';

test('quoted JS object keys and snake-case credentials are masked without moving evidence',()=>{
  const input=`const settings = {
  "api_key": "synthetic-quotes-key",
  'access_token': 'synthetic-access-value',
  "client_secret": "synthetic-client-value",
  refreshToken: "synthetic-refresh-value",
  private_key: 'synthetic-private-value',
  publicLabel: "keep-this-public"
};`;
  const result=redact(input);
  assert.equal(result.count,5);
  assert.ok(!result.text.includes('synthetic-'));
  assert.ok(result.text.includes('keep-this-public'));
  assert.deepEqual(result.text.split('\n').map(l=>l.length),input.split('\n').map(l=>l.length));
});

test('escaped delimiters, CRLF and multiline template credentials retain UTF-16 coordinates',()=>{
  const input='const password = "prefix\\"private-suffix";\r\nconst token = `first-line\r\nsecond-秘密-🔒`;\r\nconst label = "visible";';
  const result=redact(input);
  assert.equal(result.count,2);
  for(const value of ['prefix','private-suffix','first-line','second-秘密'])assert.ok(!result.text.includes(value));
  assert.ok(result.text.includes('"visible"'));
  assert.deepEqual(result.text.split('\n').map(l=>l.length),input.split('\n').map(l=>l.length));
  assert.equal(result.text.length,input.length);
});

test('safe identifiers and nonliteral credential expressions are left for explicit preview inspection',()=>{
  const input='const tokenizer = "public"; const passwordHash = "public-hash"; const token = getToken(); const opts = {"api_key": process.env.API_KEY};';
  assert.equal(redact(input).text,input);
  assert.equal(redact(input).count,0);
});
