/**
 * Microsoft Graph, app-only (client credentials). Same pattern as the other group portals:
 * an Azure app registration with the APPLICATION permission Files.ReadWrite.All, admin-consented.
 * No user is signed in — the API acts as itself.
 *
 * Env:
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET
 *   GRAPH_DRIVE_USER   the mailbox whose OneDrive holds the files, e.g. hr@bharatsteels.in
 *   GRAPH_ROOT_FOLDER  optional, defaults to "ATS"
 */

const ROOT = process.env.GRAPH_ROOT_FOLDER || 'ATS';

let cached = { token: null, expires: 0 };

export function graphConfigured() {
  return Boolean(
    process.env.GRAPH_TENANT_ID &&
    process.env.GRAPH_CLIENT_ID &&
    process.env.GRAPH_CLIENT_SECRET &&
    process.env.GRAPH_DRIVE_USER
  );
}

async function token() {
  // Tokens last an hour; re-use until a minute before expiry.
  if (cached.token && Date.now() < cached.expires - 60_000) return cached.token;

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GRAPH_CLIENT_ID,
        client_secret: process.env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );

  const data = await res.json();
  if (!res.ok)
    throw new Error(
      `Microsoft rejected the app credentials: ${data.error_description || data.error || res.status}`
    );

  cached = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

const drive = () => `https://graph.microsoft.com/v1.0/users/${process.env.GRAPH_DRIVE_USER}/drive`;

/** OneDrive rejects these outright, and a stray one fails the whole upload. */
export const safeName = (s) =>
  String(s || '')
    .replace(/[<>:"/\\|?*#%]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'file';

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

/** Upload (or replace) a file at ATS/<path>. Under 4 MB uses the simple endpoint; larger goes
 *  through an upload session, which is what Graph requires above that. */
export async function upload(path, buffer, contentType = 'application/octet-stream') {
  const full = `${ROOT}/${path}`;
  const t = await token();

  if (buffer.length < 4 * 1024 * 1024) {
    const res = await fetch(`${drive()}/root:/${encodePath(full)}:/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': contentType },
      body: buffer,
    });
    if (!res.ok) throw new Error(`OneDrive upload failed (${res.status}): ${await res.text()}`);
    return (await res.json()).webUrl;
  }

  const sessionRes = await fetch(`${drive()}/root:/${encodePath(full)}:/createUploadSession`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
  });
  if (!sessionRes.ok) throw new Error(`OneDrive upload session failed: ${await sessionRes.text()}`);
  const { uploadUrl } = await sessionRes.json();

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(buffer.length),
      'Content-Range': `bytes 0-${buffer.length - 1}/${buffer.length}`,
    },
    body: buffer,
  });
  if (!put.ok) throw new Error(`OneDrive upload failed (${put.status}): ${await put.text()}`);
  return (await put.json()).webUrl;
}

export async function download(path) {
  const t = await token();
  const res = await fetch(`${drive()}/root:/${encodePath(`${ROOT}/${path}`)}:/content`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!res.ok) throw new Error(`OneDrive could not return that file (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

export async function remove(path) {
  const t = await token();
  await fetch(`${drive()}/root:/${encodePath(`${ROOT}/${path}`)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${t}` },
  }).catch(() => {}); // deleting something already gone is not a failure
}

/** Used by /api/health so you can see at a glance whether OneDrive is actually reachable. */
export async function checkGraph() {
  if (!graphConfigured()) return 'not configured';
  try {
    const t = await token();
    const res = await fetch(`${drive()}/root`, { headers: { Authorization: `Bearer ${t}` } });
    if (!res.ok) return `unreachable (${res.status})`;
    return `connected — ${process.env.GRAPH_DRIVE_USER}/${ROOT}`;
  } catch (err) {
    return `failed — ${err.message}`;
  }
}
