#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { BucketPulseStack } from "../lib/bucket-pulse-stack";

const app = new App();
new BucketPulseStack(app, "BucketPulseStack", {});
