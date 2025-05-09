# Root Terragrunt configuration

# Configure Terragrunt to automatically store tfstate files in an S3 bucket
remote_state {
  backend = "s3"
  
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  
  config = {
    bucket         = "${get_env("TG_BUCKET_PREFIX", "coe-terraform-state")}-${get_env("TG_ENV", "dev")}"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = get_env("AWS_REGION", "us-east-1")
    encrypt        = true
    dynamodb_table = "terraform-locks-${get_env("TG_ENV", "dev")}"
  }
}

# Configure root level variables that all resources can inherit
inputs = {
  project_name = "chain-of-experts"
  aws_region   = get_env("AWS_REGION", "us-east-1")
  gcp_region   = get_env("GCP_REGION", "us-central1")
  gcp_project_id = get_env("GCP_PROJECT_ID", "")
  
  # Common tags for all resources
  common_tags = {
    Project     = "chain-of-experts"
    Environment = get_env("TG_ENV", "dev")
    ManagedBy   = "terragrunt"
  }
}

# Generate provider configuration
generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}
EOF
}

# Generate common variables
generate "variables" {
  path      = "common_variables.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, prod, etc.)"
  type        = string
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
}

variable "gcp_region" {
  description = "GCP region for deployment"
  type        = string
}

variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "common_tags" {
  description = "Common tags for all resources"
  type        = map(string)
}
EOF
}