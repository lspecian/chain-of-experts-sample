# AWS Dev ALB Module Configuration

# Include the environment configuration
include {
  path = find_in_parent_folders()
}

# Define dependencies
dependencies {
  paths = ["../vpc"]
}

# Set the source of the module
terraform {
  source = "../../../../modules/aws_alb"
}

# Override inputs specific to this module
inputs = {
  # These values come from the parent terragrunt.hcl
  # project_name, service_name, environment, tags
  
  # Get outputs from the VPC module
  vpc_id = dependency.vpc.outputs.vpc_id
  public_subnet_ids = dependency.vpc.outputs.public_subnet_ids
  
  # ALB specific configuration
  certificate_arn = "" # Set this to your ACM certificate ARN
  enable_access_logs = true
  
  # These values come from the parent terragrunt.hcl
  # container_port, health_check_path, log_bucket_name
}

# Extract local variables from parent
locals {
  # Parse the path to extract environment and project information
  environment = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.environment
  project_name = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.project_name
  service_name = "coe-api"  # Define the service name
}

# Get outputs from dependencies
dependency "vpc" {
  config_path = "../vpc"
  
  # Configure mock outputs for plan
  mock_outputs = {
    vpc_id = "vpc-mock"
    public_subnet_ids = ["subnet-mock-1", "subnet-mock-2", "subnet-mock-3"]
  }
}