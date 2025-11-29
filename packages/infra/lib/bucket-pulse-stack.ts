import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sns from "aws-cdk-lib/aws-sns";
import * as path from "path";
import * as iam from "aws-cdk-lib/aws-iam";
import { createCognitoAuth } from "./cognito";
import { HttpJwtAuthorizer, HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";

interface CreatedLambdas {
  configLambda: lambda.Function;
  healthLambda: lambda.Function;
  alertsLambda: lambda.Function;
  explorerLambda: lambda.Function;
  aggregatorLambda: lambda.Function;
}

export interface BucketPulseStackProps extends StackProps {
  /**
   * Optional external IdP configuration. If provided, API uses HttpJwtAuthorizer with this issuer/audience.
   * If omitted, a Cognito User Pool is created by default.
   */
  authIssuer?: string;
  authAudience?: string[];
}

export class BucketPulseStack extends Stack {
  constructor(scope: Construct, id: string, props?: BucketPulseStackProps) {
    super(scope, id, props);

    const ui = this.createUiHosting();
    const tables = this.createDynamoTables();
    const alertsTopic = this.createAlertsTopic();
    const uiDomain = `https://${ui.distribution.domainName}`;

    let authorizer: HttpUserPoolAuthorizer | HttpJwtAuthorizer;
    let cognitoAuth:
      | ReturnType<typeof createCognitoAuth>
      | undefined = undefined;

    if (props?.authIssuer) {
      authorizer = new HttpJwtAuthorizer("ExternalJwtAuthorizer", props.authIssuer, {
        jwtAudience: props.authAudience ?? [],
      });
    } else {
      cognitoAuth = createCognitoAuth(this, this.stackName, {
        callbackUrls: ["http://localhost:4200", uiDomain],
        logoutUrls: ["http://localhost:4200", uiDomain],
      });
      authorizer = cognitoAuth.authorizer;
    }

    const lambdas = this.createLambdas(tables, alertsTopic);
    const allowedOrigins = ["http://localhost:4200", `https://${ui.distribution.domainName}`];
    const httpApi = this.createHttpApi(lambdas, authorizer, allowedOrigins);
    this.createAggregationSchedule(lambdas.aggregatorLambda);

    // Outputs, policies, and tighter IAM will be added when handlers are wired to real code.
    ui;
    new CfnOutput(this, "UiBucketName", {
      value: ui.uiBucket.bucketName,
      exportName: "BucketPulse-UiBucketName",
    });
    new CfnOutput(this, "ApiBaseUrl", {
      value: httpApi.apiEndpoint,
      exportName: "BucketPulse-ApiBaseUrl",
    });
    new CfnOutput(this, "CloudFrontDistributionId", {
      value: ui.distribution.distributionId,
      exportName: "BucketPulse-CloudFrontDistributionId",
    });
    new CfnOutput(this, "CloudFrontDomainName", {
      value: ui.distribution.domainName,
      exportName: "BucketPulse-CloudFrontDomainName",
    });
    if (cognitoAuth) {
      new CfnOutput(this, "UserPoolId", {
        value: cognitoAuth.userPool.userPoolId,
        exportName: "BucketPulse-UserPoolId",
      });
      new CfnOutput(this, "UserPoolClientId", {
        value: cognitoAuth.userPoolClient.userPoolClientId,
        exportName: "BucketPulse-UserPoolClientId",
      });
      new CfnOutput(this, "UserPoolDomain", {
        value: cognitoAuth.domain.domainName,
        exportName: "BucketPulse-UserPoolDomain",
      });
    } else {
      if (props?.authIssuer) {
        new CfnOutput(this, "ExternalIssuer", { value: props.authIssuer });
      }
      if (props?.authAudience?.length) {
        new CfnOutput(this, "ExternalAudience", {
          value: props.authAudience.join(","),
        });
      }
    }
  }

  private createUiHosting() {
    const uiBucket = new s3.Bucket(this, "UiBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const distribution = new cloudfront.Distribution(this, "UiDistribution", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(uiBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(5),
        },
      ],
    });

    return { uiBucket, distribution };
  }

  private createDynamoTables() {
    const billingMode = dynamodb.BillingMode.PAY_PER_REQUEST;

    const bucketsTable = new dynamodb.Table(this, "BucketsTable", {
      tableName: "bp_buckets",
      partitionKey: {
        name: "bucket_name",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const prefixConfigTable = new dynamodb.Table(this, "PrefixConfigTable", {
      tableName: "bp_prefix_config",
      partitionKey: {
        name: "bucket_name",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: { name: "prefix", type: dynamodb.AttributeType.STRING },
      billingMode,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const prefixStatusTable = new dynamodb.Table(this, "PrefixStatusTable", {
      tableName: "bp_prefix_status",
      partitionKey: {
        name: "bucket_name",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: { name: "prefix", type: dynamodb.AttributeType.STRING },
      billingMode,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const alertsTable = new dynamodb.Table(this, "AlertsTable", {
      tableName: "bp_alerts",
      partitionKey: { name: "alert_id", type: dynamodb.AttributeType.STRING },
      billingMode,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    alertsTable.addGlobalSecondaryIndex({
      indexName: "byBucket",
      partitionKey: {
        name: "bucket_name",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: { name: "created_at", type: dynamodb.AttributeType.STRING },
    });

    const prefixEvaluationsTable = new dynamodb.Table(this, "PrefixEvaluationsTable", {
      tableName: "bp_prefix_evaluations",
      partitionKey: { name: "bucket_prefix", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "evaluated_at", type: dynamodb.AttributeType.STRING },
      billingMode,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    return { bucketsTable, prefixConfigTable, prefixStatusTable, alertsTable, prefixEvaluationsTable };
  }

  private createAlertsTopic() {
    return new sns.Topic(this, "BucketPulseAlertsTopic", {
      topicName: "bucket-pulse-alerts",
      displayName: "Bucket Pulse Alerts",
    });
  }

  private createLambdas(
    tables: ReturnType<BucketPulseStack["createDynamoTables"]>,
    alertsTopic: sns.Topic
  ): CreatedLambdas {
    const env = {
      BUCKETS_TABLE_NAME: tables.bucketsTable.tableName,
      PREFIX_CONFIG_TABLE_NAME: tables.prefixConfigTable.tableName,
      PREFIX_STATUS_TABLE_NAME: tables.prefixStatusTable.tableName,
      ALERTS_TABLE_NAME: tables.alertsTable.tableName,
      PREFIX_EVALUATIONS_TABLE_NAME: tables.prefixEvaluationsTable.tableName,
      ALERTS_TOPIC_ARN: alertsTopic.topicArn,
      ATHENA_WORKGROUP: "bucket_pulse",
      ATHENA_RESULT_LOCATION: "s3://replace-with-athena-results/",
      INVENTORY_DB_PREFIX: "s3_inventory",
      JOURNAL_DB_PREFIX: "s3_journal",
    };

    const defaultNodeProps: Partial<nodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      bundling: {
        externalModules: ["aws-sdk"],
        target: "node20",
        format: nodejs.OutputFormat.CJS,
      },
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: env,
    };

    const lambdaEntry = (file: string) =>
      path.resolve(__dirname, "../../..", "backend", "src", "lambda", file);

    const configLambda = new nodejs.NodejsFunction(this, "ConfigLambda", {
      ...defaultNodeProps,
      entry: lambdaEntry("config-handler.ts"),
    });

    const healthLambda = new nodejs.NodejsFunction(this, "HealthLambda", {
      ...defaultNodeProps,
      entry: lambdaEntry("health-handler.ts"),
    });

    const alertsLambda = new nodejs.NodejsFunction(this, "AlertsLambda", {
      ...defaultNodeProps,
      entry: lambdaEntry("alerts-handler.ts"),
    });

    const explorerLambda = new nodejs.NodejsFunction(this, "ExplorerLambda", {
      ...defaultNodeProps,
      timeout: Duration.seconds(20),
      entry: lambdaEntry("explorer-handler.ts"),
    });

    const aggregatorLambda = new nodejs.NodejsFunction(
      this,
      "AggregatorLambda",
      {
        ...defaultNodeProps,
        entry: lambdaEntry("aggregator-handler.ts"),
        timeout: Duration.minutes(1),
      }
    );

    tables.bucketsTable.grantReadWriteData(configLambda);
    tables.prefixConfigTable.grantReadWriteData(configLambda);

    tables.bucketsTable.grantReadData(healthLambda);
    tables.prefixConfigTable.grantReadData(healthLambda);
    tables.prefixStatusTable.grantReadData(healthLambda);
    tables.prefixEvaluationsTable.grantReadData(healthLambda);
    tables.prefixStatusTable.grantReadWriteData(aggregatorLambda);
    tables.prefixEvaluationsTable.grantReadWriteData(aggregatorLambda);
    configLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetBucketMetadataConfiguration"],
        resources: ["*"],
      })
    );
    aggregatorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetBucketMetadataConfiguration"],
        resources: ["*"],
      })
    );

    tables.alertsTable.grantReadData(alertsLambda);
    tables.alertsTable.grantReadWriteData(aggregatorLambda);

    alertsTopic.grantPublish(aggregatorLambda);

    // Athena/S3 Tables access (broad for now, tighten later)
    const athenaActions = [
      "athena:StartQueryExecution",
      "athena:GetQueryExecution",
      "athena:GetQueryResults",
    ];
    const glueActions = [
      "glue:GetDatabase",
      "glue:GetDatabases",
      "glue:GetTable",
      "glue:GetTables",
    ];

    const workgroupArn = this.formatArn({
      service: "athena",
      resource: "workgroup",
      resourceName: env.ATHENA_WORKGROUP,
    });

    const resultBucketArn = `arn:aws:s3:::replace-with-athena-results`;

    [explorerLambda, aggregatorLambda].forEach((fn) => {
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: athenaActions,
          resources: [workgroupArn],
        })
      );
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: glueActions,
          resources: [
            this.formatArn({ service: "glue", resource: "catalog" }),
            this.formatArn({
              service: "glue",
              resource: "database",
              resourceName: `${env.INVENTORY_DB_PREFIX}*`,
            }),
            this.formatArn({
              service: "glue",
              resource: "database",
              resourceName: `${env.JOURNAL_DB_PREFIX}*`,
            }),
            this.formatArn({
              service: "glue",
              resource: "table",
              resourceName: `${env.INVENTORY_DB_PREFIX}*/*`,
            }),
            this.formatArn({
              service: "glue",
              resource: "table",
              resourceName: `${env.JOURNAL_DB_PREFIX}*/*`,
            }),
          ],
        })
      );
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
          resources: [resultBucketArn, `${resultBucketArn}/*`],
        })
      );
    });

    return {
      configLambda,
      healthLambda,
      alertsLambda,
      explorerLambda,
      aggregatorLambda,
    };
  }

  private createHttpApi(
    lambdas: CreatedLambdas,
    authorizer: HttpUserPoolAuthorizer | HttpJwtAuthorizer,
    allowedOrigins: string[]
  ) {
    const httpApi = new apigwv2.HttpApi(this, "BucketPulseHttpApi", {
      apiName: "BucketPulseApi",
      corsPreflight: {
        allowOrigins: allowedOrigins,
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ["*"],
      },
    });

    const route = (
      path: string,
      method: apigwv2.HttpMethod,
      fn: lambda.IFunction
    ) => {
      httpApi.addRoutes({
        path,
        methods: [method],
        integration: new integrations.HttpLambdaIntegration(
          `${fn.node.id}-${method}`,
          fn
        ),
        authorizer,
      });
    };

    route("/buckets", apigwv2.HttpMethod.GET, lambdas.configLambda);
    route("/buckets", apigwv2.HttpMethod.POST, lambdas.configLambda);
    route("/buckets/{bucket}", apigwv2.HttpMethod.GET, lambdas.configLambda);
    route(
      "/buckets/{bucket}/prefixes",
      apigwv2.HttpMethod.GET,
      lambdas.configLambda
    );
    route(
      "/buckets/{bucket}/prefixes",
      apigwv2.HttpMethod.POST,
      lambdas.configLambda
    );

    route(
      "/buckets/{bucket}/prefixes/{prefix}/health",
      apigwv2.HttpMethod.GET,
      lambdas.healthLambda
    );
    route(
      "/buckets/{bucket}/prefixes/{prefix}/evaluations",
      apigwv2.HttpMethod.GET,
      lambdas.healthLambda
    );
    route("/alerts", apigwv2.HttpMethod.GET, lambdas.alertsLambda);
    route("/explorer/query", apigwv2.HttpMethod.GET, lambdas.explorerLambda);

    return httpApi;
  }

  private createAggregationSchedule(aggregatorLambda: lambda.Function) {
    new events.Rule(this, "AggregationSchedule", {
      schedule: events.Schedule.rate(Duration.minutes(5)),
      targets: [new targets.LambdaFunction(aggregatorLambda)],
    });
  }
}
