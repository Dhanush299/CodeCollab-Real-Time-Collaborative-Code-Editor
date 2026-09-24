# Automatic AWS deployment

Pushing a commit to `main` runs `deploy.yml`. The workflow:

1. Builds and pushes the backend Docker image to ECR.
2. Builds React using the current CloudFront domain.
3. Syncs the production React build to S3 and invalidates CloudFront.
4. Registers a new ECS task-definition revision and waits for the Fargate service to become stable.

## One-time GitHub configuration

Create a repository secret named `AWS_DEPLOY_ROLE_ARN` containing the ARN of the IAM role that GitHub Actions can assume through OIDC.

Create a repository variable named `CLOUDFRONT_DISTRIBUTION_ID` containing the CloudFront distribution ID (not its domain name).

The role must trust only this repository's `main` branch and have permissions for the configured ECR repository, ECS service, S3 bucket, and CloudFront distribution.

Never create or store long-lived AWS access keys in GitHub secrets.
