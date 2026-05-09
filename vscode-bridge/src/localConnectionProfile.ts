import * as fs from 'fs';
import * as path from 'path';

export interface LocalConnectionProfile {
    schema_version?: number;
    backend_ws_url?: string;
    api_base_url?: string;
    token?: string;
    auth_mode?: string;
    expires_at?: number | null;
    updated_at?: number;
}

const PROFILE_RELATIVE_PATH = path.join('.pocket-vibe', 'desktop-connection.json');

function cleanString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function resolveLocalConnectionProfilePath(
    workspaceRoots: string[] = [],
    envProfilePath = process.env.POCKET_VIBE_PROFILE_PATH || '',
): string | null {
    const explicitPath = cleanString(envProfilePath);
    if (explicitPath) {
        return explicitPath;
    }

    const firstWorkspace = workspaceRoots.map(cleanString).find(Boolean);
    return firstWorkspace ? path.join(firstWorkspace, PROFILE_RELATIVE_PATH) : null;
}

export function readLocalConnectionProfile(profilePath: string | null): LocalConnectionProfile | null {
    if (!profilePath || !fs.existsSync(profilePath)) {
        return null;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

export function profileIsExpired(
    profile: LocalConnectionProfile | null,
    nowSeconds = Date.now() / 1000,
): boolean {
    if (!profile?.expires_at) {
        return false;
    }
    return Number(profile.expires_at) <= nowSeconds;
}

export function profileBackendUrl(profile: LocalConnectionProfile | null): string {
    return cleanString(profile?.backend_ws_url);
}

export function profileAuthToken(profile: LocalConnectionProfile | null): string {
    if (profileIsExpired(profile)) {
        return '';
    }
    return cleanString(profile?.token);
}
