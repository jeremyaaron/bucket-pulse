import { RemovalPolicy } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { Construct } from "constructs";

export interface CognitoAuth {
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  domain: cognito.UserPoolDomain;
  authorizer: HttpUserPoolAuthorizer;
}

export function createCognitoAuth(
  scope: Construct,
  stackName: string,
  callbacks: { callbackUrls: string[]; logoutUrls?: string[] },
): CognitoAuth {
  const userPool = new cognito.UserPool(scope, "BucketPulseUserPool", {
    selfSignUpEnabled: true,
    signInAliases: { email: true, username: true },
    passwordPolicy: {
      minLength: 8,
      requireDigits: true,
      requireLowercase: true,
      requireUppercase: true,
      requireSymbols: false,
    },
    removalPolicy: RemovalPolicy.DESTROY,
  });

  const userPoolClient = userPool.addClient("BucketPulseUserPoolClient", {
    authFlows: { userPassword: true, userSrp: true },
    preventUserExistenceErrors: true,
    generateSecret: false,
    oAuth: {
      flows: { authorizationCodeGrant: true },
      scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
      callbackUrls: callbacks.callbackUrls,
      logoutUrls: callbacks.logoutUrls ?? callbacks.callbackUrls,
    },
    supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
  });

  const domain = userPool.addDomain("BucketPulseUserPoolDomain", {
    cognitoDomain: {
      domainPrefix: `${stackName.toLowerCase()}-bp`,
    },
  });

  const authorizer = new HttpUserPoolAuthorizer("BucketPulseAuthorizer", userPool, {
    userPoolClients: [userPoolClient],
    identitySource: ["$request.header.Authorization"],
  });

  return { userPool, userPoolClient, domain, authorizer };
}
