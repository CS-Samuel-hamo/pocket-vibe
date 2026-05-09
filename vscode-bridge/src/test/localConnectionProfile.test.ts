import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
    profileAuthToken,
    profileBackendUrl,
    profileIsExpired,
    readLocalConnectionProfile,
    resolveLocalConnectionProfilePath,
} from '../localConnectionProfile';

function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-vibe-profile-'));
}

function writeProfile(root: string, payload: Record<string, unknown>): string {
    const profilePath = path.join(root, '.pocket-vibe', 'desktop-connection.json');
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(profilePath, JSON.stringify(payload), 'utf8');
    return profilePath;
}

const workspaceRoot = tempDir();
const profilePath = writeProfile(workspaceRoot, {
    backend_ws_url: 'ws://127.0.0.1:8000/ws',
    token: 'token-1',
    expires_at: null,
});

assert.strictEqual(resolveLocalConnectionProfilePath([workspaceRoot]), profilePath);

const profile = readLocalConnectionProfile(profilePath);
assert.strictEqual(profileBackendUrl(profile), 'ws://127.0.0.1:8000/ws');
assert.strictEqual(profileAuthToken(profile), 'token-1');
assert.strictEqual(profileIsExpired(profile), false);

assert.strictEqual(
    resolveLocalConnectionProfilePath([workspaceRoot], 'D:/override/profile.json'),
    'D:/override/profile.json',
);

assert.strictEqual(profileIsExpired({ expires_at: 10 }, 11), true);
assert.strictEqual(profileAuthToken({ token: 'expired', expires_at: 10 }), '');
assert.strictEqual(readLocalConnectionProfile(path.join(workspaceRoot, 'missing.json')), null);
