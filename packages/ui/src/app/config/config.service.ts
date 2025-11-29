import { Injectable } from '@angular/core';
import { AppConfig, defaultConfig } from './app-config';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private config: AppConfig = defaultConfig;

  async load(): Promise<void> {
    try {
      const json = (await this.fetchEnv()) as Partial<AppConfig> & {
        userPoolId?: string;
        userPoolClientId?: string;
        userPoolDomain?: string;
        redirectUri?: string;
      };
      const auth: AppConfig['auth'] = {
        ...defaultConfig.auth,
        ...(json.auth || {}),
      };
      // Support flat auth keys in env.json
      auth.userPoolClientId = json.userPoolClientId ?? auth.userPoolClientId;
      auth.userPoolDomain = json.userPoolDomain ?? auth.userPoolDomain;
      auth.userPoolId = json.userPoolId ?? auth.userPoolId;
      auth.redirectUri = json.redirectUri ?? auth.redirectUri;
      this.config = {
        ...defaultConfig,
        ...json,
        auth,
      };
    } catch (err) {
      console.warn('Failed to load env.json, using defaults', err);
    }
  }

  private async fetchEnv(): Promise<unknown | undefined> {
    const candidates = ['env.json', 'assets/env.json'];
    for (const path of candidates) {
      try {
        const resp = await fetch(path, { cache: 'no-store' });
        if (resp.ok) {
          return resp.json();
        }
      } catch {
        // ignore and try next
      }
    }
    console.warn('env.json not found, using defaults');
    return undefined;
  }

  get baseApiUrl(): string {
    return this.config.baseApiUrl;
  }

  get auth() {
    return this.config.auth;
  }
}
