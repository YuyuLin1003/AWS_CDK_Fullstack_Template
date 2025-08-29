#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { InfraStack } from "../lib/infra-stack";
import { execSync } from "child_process";

const app = new cdk.App();

function getCurrentBranch(): string {
  const fromGhActions = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  const fromCommonCis = process.env.BRANCH_NAME || process.env.CI_COMMIT_REF_NAME;
  const envBranch = fromGhActions || fromCommonCis;
  if (envBranch && envBranch.trim().length > 0) {
    return envBranch.trim();
  }
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return branch;
  } catch {
    return "local";
  }
}

function deriveStage(branch: string): string {
  const b = branch.toLowerCase();
  if (["main", "master", "prod", "production"].includes(b)) return "prod";
  if (["develop", "development", "dev"].includes(b)) return "dev";
  if (b.startsWith("hotfix/")) return "prod";
  if (b.startsWith("feature/") || b.startsWith("feat/") || b.startsWith("fix/") || b.startsWith("chore/")) return "dev";
  return sanitizeStage(b);
}

function sanitizeStage(value: string): string {
  // keep alphanumerics and dashes, collapse others to dash, trim length
  const sanitized = value
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized.substring(0, 20) || "local";
}

const branch = getCurrentBranch();
const stage = deriveStage(branch);

const stackId = `InfraStack-${stage}`;

new InfraStack(app, stackId, {
  stackName: stackId,
  tags: {
    stage,
    branch,
    application: "Template_App",
  },
  env: {
    account: process.env.AWS_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION,
  },
  stage,
  branch,
});