import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";

export class InfraStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ===== Frontend (S3 + CloudFront with OAC) =====
    const websiteBucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });


    // Create Origin Access Identity for S3
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, "OriginAccessIdentity", {
      comment: "OAI for S3 bucket access",
    });

    // Create S3 Origin
    const s3Origin = new origins.S3Origin(websiteBucket);

    const cfDistribution = new cloudfront.Distribution(this, "CFDistribution", {
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      // Handle SPA routing
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
    });

    // Grant CloudFront access to S3 bucket using OAI
    websiteBucket.grantRead(originAccessIdentity);

    // ===== DynamoDB Table  =====
    const table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "code", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // ===== Lambda Function (Backend) =====
    const backendLambda = new lambda.Function(this, "BackendLambda", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("../backend/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        TABLE: table.tableName,
      },
    });

    table.grantReadWriteData(backendLambda);

    // ===== API Gateway (expose Lambda as REST API) =====
    const api = new apigateway.LambdaRestApi(this, "Api", {
      handler: backendLambda,
      proxy: true,
      // Add CORS support
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      },
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url ?? "Something went wrong",
    });

    // ===== Deploy React/Vite frontend build to S3 =====
    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [s3deploy.Source.asset("../frontend/test/dist")],
      destinationBucket: websiteBucket,
      distribution: cfDistribution,
      distributionPaths: ["/*"],
    });

    new cdk.CfnOutput(this, "CloudFrontURL", {
      value: `https://${cfDistribution.domainName}`,
    });
  }
}