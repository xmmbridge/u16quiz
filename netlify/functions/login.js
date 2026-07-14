export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let name, password;
  try {
    ({ name, password } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }
  if (!name || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing name or password' }) };
  }

  let credentials;
  try {
    credentials = JSON.parse(process.env.LOGIN_CREDENTIALS || '[]');
  } catch {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const match = credentials.find((u) => u.name === name && u.password === password);
  if (!match) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid name or password' }) };
  }

  // Plain REST call instead of @supabase/supabase-js — avoids that library's
  // realtime-client requiring native WebSocket support, which isn't available
  // in every Netlify Functions runtime and caused this function to crash (502).
  const res = await fetch(
    `${process.env.VITE_SUPABASE_URL}/rest/v1/users?name=eq.${encodeURIComponent(name)}&select=*`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const rows = await res.json();
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!res.ok || !profile) {
    return { statusCode: 500, body: JSON.stringify({ error: 'User not found in database' }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ id: profile.id, name: profile.name, role: profile.role }),
  };
};
