# Infrastructure as Code

This directory contains all the infrastructure as code (IaC) configurations for the Chain of Experts project.

## Directory Structure

```
infra/
├── terraform/           # Terraform configurations
│   ├── main.tf          # Root Terraform configuration
│   ├── variables.tf     # Root variables
│   ├── environments/    # Environment-specific configurations
│   │   ├── dev/         # Development environment
│   │   └── prod/        # Production environment
│   ├── modules/         # Reusable Terraform modules
│   │   ├── app_service/
│   │   ├── aws_alb/
│   │   ├── aws_ecs_service/
│   │   ├── aws_vpc/
│   │   └── gcp_cloud_run/
│   └── providers/       # Provider configurations
│       ├── aws.tf
│       └── gcp.tf
└── terragrunt/          # Terragrunt configurations
    ├── terragrunt.hcl   # Root Terragrunt configuration
    ├── aws/             # AWS-specific configurations
    │   ├── dev/         # AWS Development environment
    │   └── prod/        # AWS Production environment
    └── gcp/             # GCP-specific configurations
        ├── dev/         # GCP Development environment
        └── prod/        # GCP Production environment
```

## Usage

### Terraform

To use the Terraform configurations:

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

For environment-specific deployments:

```bash
cd infra/terraform/environments/dev
terraform init
terraform plan
terraform apply
```

### Terragrunt

To use the Terragrunt configurations:

```bash
cd infra/terragrunt/aws/dev
terragrunt run-all init
terragrunt run-all plan
terragrunt run-all apply
```

## Modules

The `modules` directory contains reusable Terraform modules for various infrastructure components:

- `app_service`: Generic application service module
- `aws_alb`: AWS Application Load Balancer
- `aws_ecs_service`: AWS ECS Service
- `aws_vpc`: AWS VPC configuration
- `gcp_cloud_run`: Google Cloud Run service