import http from 'http';

const BASE = 'http://127.0.0.1:8787';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const headers = {};
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(`${BASE}${path}`, { method, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: buf, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(data);
    req.end();
  });
}

const r = await request('GET', '/api/auth/bootstrap');
console.log('Bootstrap status:', r.status);
console.log('Body:', JSON.stringify(r.body, null, 2));
