export interface AuthConfig {
  userPoolId: string;
  userPoolClientId: string;
  userPoolDomain: string;
  redirectUri: string;
}

export interface AppConfig {
  baseApiUrl: string;
  auth: AuthConfig;
}

export const defaultConfig: AppConfig = {
  baseApiUrl: '/api',
  auth: {
    userPoolId: '',
    userPoolClientId: '',
    userPoolDomain: '',
    redirectUri: '',
  },
};
