# Root Terraform configuration
# This file defines required providers and can orchestrate environments
# or define shared resources.

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

# --- Provider Configurations ---

provider "aws" {
  region = var.aws_region
  # Credentials configured via environment variables or IAM roles
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
  # Credentials configured via gcloud auth or Service Account key
}

# --- Environment Orchestration or Shared Resources (Optional) ---
# Example:
# module "dev_environment" {
#   source = "./environments/dev"
#   # Pass variables...
# }
#
# module "prod_environment" {
#   source = "./environments/prod"
#   # Pass variables...
# }