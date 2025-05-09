# Deployment Guide

This guide explains how to deploy the Chain of Experts application to AWS (primary) and GCP (optional) using Terragrunt and the provided Terraform modules.

## Prerequisites

- Terraform v1.5+ installed.
- Terragrunt v0.45+ installed.
- Docker installed and running.
- AWS CLI installed and configured with credentials (`aws configure`).
- Google Cloud SDK installed and configured (`gcloud auth login`, `gcloud config set project YOUR_PROJECT_ID`).
- An account and project set up in Langfuse.
- An OpenAI API key.
- Necessary permissions in each cloud provider to create the resources defined in the Terraform modules (VPC, ECR/ArtifactRegistry, ECS/CloudRun, ALB, SecretsManager, IAM roles, etc.).

## Terragrunt Workflow

Terragrunt is a thin wrapper for Terraform that provides extra tools for working with multiple Terraform modules, keeping your Terraform code DRY, and managing remote state. Our project uses Terragrunt to organize and deploy infrastructure across multiple environments.

### Directory Structure

```
infra/
├── terraform/                     # Terraform configurations
│   ├── main.tf                    # Root Terraform configuration
│   ├── variables.tf               # Root variables
│   ├── environments/              # Environment-specific configurations
│   │   ├── dev/                   # Development environment
│   │   └── prod/                  # Production environment
│   ├── modules/                   # Reusable Terraform modules
│   │   ├── app_service/
│   │   ├── aws_alb/
│   │   ├── aws_ecs_service/
│   │   ├── aws_vpc/
│   │   └── gcp_cloud_run/
│   └── providers/                 # Provider configurations
│       ├── aws.tf
│       └── gcp.tf
└── terragrunt/                    # Terragrunt configurations
    ├── terragrunt.hcl             # Root configuration (remote state, providers)
    ├── aws/                       # AWS-specific configurations
    │   ├── dev/                   # Dev environment for AWS
    │   │   ├── terragrunt.hcl     # Dev environment variables
    │   │   ├── vpc/               # VPC module for dev
    │   │   ├── alb/               # ALB module for dev
    │   │   └── ecs/               # ECS module for dev
    │   └── prod/                  # Prod environment for AWS
    │       ├── terragrunt.hcl     # Prod environment variables
    │       ├── vpc/               # VPC module for prod
    │       ├── alb/               # ALB module for prod
    │       └── ecs/               # ECS module for prod
    └── gcp/                       # GCP-specific configurations
        ├── dev/                   # Dev environment for GCP
        │   ├── terragrunt.hcl     # Dev environment variables
        │   └── cloud-run/         # Cloud Run module for dev
        └── prod/                  # Prod environment for GCP
            ├── terragrunt.hcl     # Prod environment variables
            └── cloud-run/         # Cloud Run module for prod
```

### General Workflow

1.  **Build and Push Docker Image:** Build the application's Docker image and push it to the appropriate container registry for the target cloud provider. The CI/CD pipeline handles this automatically, but manual steps are below.

2.  **Set Environment Variables:** Set the required environment variables for Terragrunt:
    ```bash
    export TG_ENV=dev  # or prod
    export TG_BUCKET_PREFIX=coe-terraform-state
    export AWS_REGION=us-east-1
    export GCP_PROJECT_ID=your-gcp-project-id
    export GCP_REGION=us-central1
    ```

3.  **Initialize and Apply Infrastructure:**
    
    For AWS deployment:
    ```bash
    # Deploy all AWS infrastructure for dev environment
    cd infra/terragrunt/aws/dev
    terragrunt run-all apply
    
    # Or deploy specific modules
    cd infra/terragrunt/aws/dev/vpc
    terragrunt apply
    
    cd infra/terragrunt/aws/dev/alb
    terragrunt apply
    
    cd infra/terragrunt/aws/dev/ecs
    terragrunt apply
    ```
    
    For GCP deployment:
    ```bash
    # Deploy Cloud Run for dev environment
    cd infra/terragrunt/gcp/dev/cloud-run
    terragrunt apply
    ```

4.  **Destroy Infrastructure When No Longer Needed:**
    ```bash
    cd infra/terragrunt/aws/dev
    terragrunt run-all destroy
    ```

## AWS Deployment Details

### Backend State Setup (One-time, per environment)

Terragrunt automatically manages the backend state configuration, but you still need to create the S3 bucket and DynamoDB table for the backend state.

```bash
# Replace with your desired region and unique bucket/table names
export AWS_REGION="us-east-1"
export TG_ENV="dev"  # or prod
export BUCKET_NAME="coe-terraform-state-${TG_ENV}"
export TABLE_NAME="terraform-locks-${TG_ENV}"

aws s3 mb s3://${BUCKET_NAME} --region ${AWS_REGION}
aws dynamodb create-table \
  --table-name ${TABLE_NAME} \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --region ${AWS_REGION}
```

### Secrets Setup (One-time, per environment)

Store sensitive values like API keys in AWS Secrets Manager. The Terraform modules expect these secrets to exist.

**AWS (Secrets Manager):**
Create secrets (e.g., for Langfuse keys, OpenAI key) that the ECS Task Role can access. The `aws_ecs_service` module includes an *example* of creating a placeholder secret, but you should create real ones. The ARN of the secret(s) needs to be passed to the `ecs_service` module via the `secret_arns` variable (used by the Task Role policy) and potentially the `secrets` variable (for injection into the container).

**GCP (Secret Manager):**
The `gcp_cloud_run` module creates a secret for `LANGFUSE_SECRET_KEY`. Add others as needed. The module grants the Cloud Run service account access and configures the service to mount the secret as an environment variable.

### Container Registry Setup

The Terraform modules for each cloud provider create the necessary container registry (ECR, Artifact Registry). You need to ensure your Docker image is pushed there before deploying the service that uses it.

**Manual Docker Push Example (AWS ECR):**
```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region <your-region> | docker login --username AWS --password-stdin <your-account-id>.dkr.ecr.<your-region>.amazonaws.com

# Build your image (if not done by CI/CD)
# docker build -t <repo-name>:<tag> .

# Tag the image for ECR
docker tag <local-image-name>:<tag> <your-account-id>.dkr.ecr.<your-region>.amazonaws.com/<repo-name>:<tag>

# Push the image
docker push <your-account-id>.dkr.ecr.<your-region>.amazonaws.com/<repo-name>:<tag>
```
*(Adapt registry URL and commands for GCP Artifact Registry)*

## CI/CD Pipeline

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automates the build, test, image push, and Terragrunt deployment process for the `prod` environment upon pushes to the `main` branch.

**Setup:**
1.  Fork/clone the repository to your GitHub account.
2.  Configure the required secrets in your GitHub repository settings (Settings > Secrets and variables > Actions). Refer to the list in the workflow file comments for required secrets (AWS keys/role, GCP key, Langfuse keys, etc.).
3.  Ensure the Terraform backend resources (S3 bucket, DynamoDB table) are created for the `prod` environment.
4.  Ensure the necessary secrets are populated in AWS Secrets Manager.

**GitHub Actions Workflow:**
```yaml
# Example workflow for Terragrunt deployment
name: Deploy with Terragrunt

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Terraform and Terragrunt
        uses: hashicorp/setup-terraform@v2
        with:
          terraform_version: 1.5.0
      
      - name: Install Terragrunt
        run: |
          wget -O terragrunt https://github.com/gruntwork-io/terragrunt/releases/download/v0.45.0/terragrunt_linux_amd64
          chmod +x terragrunt
          sudo mv terragrunt /usr/local/bin/
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Build and push Docker image
        # Build and push steps here...
      
      - name: Deploy with Terragrunt
        run: |
          cd infra/terragrunt/aws/prod
          terragrunt run-all apply --terragrunt-non-interactive
        env:
          TG_ENV: prod
          TG_BUCKET_PREFIX: coe-terraform-state
```

The workflow will handle deployments automatically. You may need to adjust repository names, service names, or variable names in the workflow file to match your specific setup.