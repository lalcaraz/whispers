// Simple HTTP proxy server to forward requests to ngrok backend
// This avoids SSL certificate issues on Android
const http = require('http');
const https = require('https');
const NGROK_HOST = 'your-ngrok-url.ngrok-free.app'; // TODO: Replace with your ngrok host
const NGROK_URL = `https://${NGROK_HOST}`;
const PORT = 3001;

const server = http.createServer((clientReq, clientRes) => {
  console.log(`${clientReq.method} ${clientReq.url}`);
  
  const options = {
    hostname: NGROK_HOST,
    port: 443,
    path: clientReq.url,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      'ngrok-skip-browser-warning': 'true',
      host: NGROK_HOST,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    clientRes.writeHead(500);
    clientRes.end('Proxy error');
  });

  clientReq.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`✅ Proxy server running on http://localhost:${PORT}`);
  console.log(`   Forwarding to: ${NGROK_URL}`);
  console.log(`\nNext steps:`);
  console.log(`1. Run: adb reverse tcp:${PORT} tcp:${PORT}`);
  console.log(`2. Update DEFAULT_BACKEND_URL to: http://localhost:${PORT}`);
});
