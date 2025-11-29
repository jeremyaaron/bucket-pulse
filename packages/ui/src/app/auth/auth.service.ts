import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { ConfigService } from '../config/config.service';
import { TokenStorageService } from './token-storage.service';
import { AuthTokens } from './types';

const PKCE_VERIFIER_KEY = 'bp_pkce_verifier';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokens: AuthTokens | null = null;
  private readonly stateSubject = new BehaviorSubject<{ loading: boolean; error?: string }>({
    loading: false,
    error: undefined,
  });
  state$ = this.stateSubject.asObservable();

  constructor(
    private readonly config: ConfigService,
    private readonly storage: TokenStorageService,
    private readonly http: HttpClient,
  ) {
    this.tokens = this.storage.load();
  }

  get isConfigured(): boolean {
    const auth = this.config.auth;
    return !!auth?.userPoolClientId && !!auth.userPoolDomain;
  }

  get accessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  get isAuthenticated(): boolean {
    return !!this.tokens?.accessToken;
  }

  async login(): Promise<void> {
    if (!this.isConfigured) return;
    this.stateSubject.next({ loading: true, error: undefined });
    const verifier = this.generateVerifier();
    sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
    const challenge = await this.pkceChallenge(verifier);
    const url = this.buildAuthorizeUrl(challenge);
    if (url) {
      window.location.href = url;
    }
    this.stateSubject.next({ loading: false, error: undefined });
  }

  logout(): void {
    this.tokens = null;
    this.storage.clear();
    const logoutUrl = this.buildLogoutUrl();
    if (logoutUrl) {
      window.location.href = logoutUrl;
    }
  }

  async handleRedirectCallback(): Promise<void> {
    if (!this.isConfigured) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    if (!verifier) return;

    this.stateSubject.next({ loading: true, error: undefined });
    await this.exchangeCodeForTokens(code, verifier);
    // Clean query params
    window.history.replaceState({}, document.title, window.location.pathname);
    this.stateSubject.next({ loading: false, error: undefined });
  }

  private buildAuthorizeUrl(codeChallenge: string): string | null {
    const auth = this.config.auth;
    if (!auth?.userPoolClientId || !auth.userPoolDomain) return null;
    const redirect = encodeURIComponent(auth.redirectUri || window.location.origin);
    const scope = encodeURIComponent('openid profile email');
    const domain = this.ensureDomainUrl(auth.userPoolDomain);
    return `${domain}/oauth2/authorize?response_type=code&client_id=${auth.userPoolClientId}&redirect_uri=${redirect}&scope=${scope}&code_challenge_method=S256&code_challenge=${codeChallenge}`;
  }

  private buildLogoutUrl(): string | null {
    const auth = this.config.auth;
    if (!auth?.userPoolClientId || !auth.userPoolDomain) return null;
    const redirect = encodeURIComponent(auth.redirectUri || window.location.origin);
    const domain = this.ensureDomainUrl(auth.userPoolDomain);
    return `${domain}/logout?client_id=${auth.userPoolClientId}&logout_uri=${redirect}`;
  }

  private async exchangeCodeForTokens(code: string, verifier: string): Promise<void> {
    const auth = this.config.auth;
    if (!auth?.userPoolClientId || !auth.userPoolDomain) return;

    const tokenEndpoint = `${this.ensureDomainUrl(auth.userPoolDomain)}/oauth2/token`;
    const body = new HttpParams()
      .set('grant_type', 'authorization_code')
      .set('client_id', auth.userPoolClientId)
      .set('code', code)
      .set('redirect_uri', auth.redirectUri || window.location.origin)
      .set('code_verifier', verifier);

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    try {
      const resp = await firstValueFrom(
        this.http.post<{
          access_token: string;
          id_token?: string;
          refresh_token?: string;
          expires_in?: number;
        }>(tokenEndpoint, body.toString(), { headers }),
      );

      if (resp?.access_token) {
        this.tokens = {
          accessToken: resp.access_token,
          idToken: resp.id_token,
          refreshToken: resp.refresh_token,
          expiresIn: resp.expires_in,
        };
        this.storage.save(this.tokens);
      }
    } catch (err) {
      console.error('Failed to exchange auth code', err);
      this.storage.clear();
      this.tokens = null;
      this.stateSubject.next({ loading: false, error: 'Authentication failed. Please try again.' });
    }
  }

  private generateVerifier(): string {
    const array = new Uint32Array(28);
    crypto.getRandomValues(array);
    return Array.from(array, (dec) => ('0' + dec.toString(16)).slice(-2)).join('');
  }

  private async pkceChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return this.base64UrlEncode(digest);
  }

  private base64UrlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let str = '';
    bytes.forEach((b) => (str += String.fromCharCode(b)));
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private ensureDomainUrl(domain: string): string {
    if (domain.startsWith('https://')) return domain;
    return `https://${domain}`;
  }
}
