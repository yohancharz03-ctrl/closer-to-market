// Only Firebase's public browser settings belong in this allowlist.
// Never include FIREBASE_SERVICE_ACCOUNT or other server credentials.
const fields = {
  apiKey: 'FIREBASE_API_KEY',
  authDomain: 'FIREBASE_AUTH_DOMAIN',
  projectId: 'FIREBASE_PROJECT_ID',
  storageBucket: 'FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'FIREBASE_MESSAGING_SENDER_ID',
  appId: 'FIREBASE_APP_ID',
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return { statusCode: 405, headers: { ...headers, Allow: 'GET, HEAD' }, body: '' };
  }
  const config = {};
  for (const [field, name] of Object.entries(fields)) {
    if (!process.env[name]?.trim()) {
      return {
        statusCode: 200,
        headers,
        body: event.httpMethod === 'HEAD' ? '' : 'self.CTM_FIREBASE_CONFIG = null;', 
      };
    }
    config[field] = process.env[name].trim();
  }
  return {
    statusCode: 200,
    headers,
    body: event.httpMethod === 'HEAD' ? '' : `self.CTM_FIREBASE_CONFIG = ${JSON.stringify(config)};`,
  };
};
