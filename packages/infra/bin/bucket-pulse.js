#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const bucket_pulse_stack_1 = require("../lib/bucket-pulse-stack");
const app = new aws_cdk_lib_1.App();
new bucket_pulse_stack_1.BucketPulseStack(app, "BucketPulseStack", {});
