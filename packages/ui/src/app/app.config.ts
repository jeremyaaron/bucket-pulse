import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { ConfigService } from './config/config.service';
import { authHttpInterceptor } from './auth/auth-http.interceptor';
import { AuthService } from './auth/auth.service';

function initConfig(config: ConfigService, auth: AuthService) {
  return async () => {
    await config.load();
    await auth.handleRedirectCallback();
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authHttpInterceptor])),
    ConfigService,
    AuthService,
    {
      provide: APP_INITIALIZER,
      useFactory: initConfig,
      deps: [ConfigService, AuthService],
      multi: true,
    },
  ],
};
