import { Injectable } from '@angular/core';
import { AuthTokens } from './types';

const STORAGE_KEY = 'bp_auth_tokens';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  save(tokens: AuthTokens): void {
    const expiresAt = Date.now() + (tokens.expiresIn ?? 0) * 1000;
    const payload = { ...tokens, expiresAt };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  load(): AuthTokens | null {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as AuthTokens & { expiresAt?: number };
      if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
        this.clear();
        return null;
      }
      return parsed;
    } catch {
      this.clear();
      return null;
    }
  }

  clear(): void {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
