# AWS Dev ECS Module Configuration

# Include the environment configuration
include {
  path = find_in_parent_folders()
}

# Define dependencies
dependencies {
  paths = ["../vpc", "../alb"]
}

# Set the source of the module
terraform {
  source = "../../../../modules/aws_ecs_service"
}

# Override inputs specific to this module
inputs = {
  # These values come from the parent terragrunt.hcl
  # project_name, service_name, environment, tags, aws_region
  
  # ECS specific configuration
  log_retention_days = 30
  create_placeholder_secrets = true
  
  # Get outputs from the VPC and ALB modules
  private_subnet_ids = dependency.vpc.outputs.private_subnet_ids
  vpc_id = dependency.vpc.outputs.vpc_id
  alb_target_group_arn = dependency.alb.outputs.default_target_group_arn
  alb_listener_arn = [dependency.alb.outputs.https_listener_arn]
  alb_security_group_id = dependency.alb.outputs.alb_security_group_id
  
  # Environment variables for the container
  environment_variables = {
    NODE_ENV = local.environment
    LANGFUSE_PUBLIC_KEY = local.langfuse_public_key
    LANGFUSE_BASEURL = local.langfuse_baseurl
  }
  
  # Secrets for the container
  secrets = [
    {
      name = "LANGFUSE_SECRET_KEY"
      valueFrom = "arn:aws:secretsmanager:${local.aws_region}:${local.aws_account_id}:secret:${local.project_name}/${local.environment}/langfuse-secret-key"
    },
    {
      name = "OPENAI_API_KEY"
      valueFrom = "arn:aws:secretsmanager:${local.aws_region}:${local.aws_account_id}:secret:${local.project_name}/${local.environment}/openai-api-key"
    }
  ]
  
  # Monitoring
  enable_cluster_cpu_alarm = true
  cluster_cpu_threshold_percent = 80
}

# Extract local variables from parent
locals {
  # Parse the path to extract environment and project information
  environment = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.environment
  project_name = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.project_name
  service_name = "coe-api"  # Define the service name
  aws_region = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.aws_region
  aws_account_id = "123456789012"  # Replace with your AWS account ID or use a data source
  
  # Get Langfuse configuration from parent
  langfuse_public_key = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.langfuse_public_key
  langfuse_baseurl = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.langfuse_baseurl
}

# Get outputs from dependencies
dependency "vpc" {
  config_path = "../vpc"
  
  # Configure mock outputs for plan
  mock_outputs = {
    vpc_id = "vpc-mock"
    private_subnet_ids = ["subnet-mock-1", "subnet-mock-2", "subnet-mock-3"]
  }
}

dependency "alb" {
  config_path = "../alb"
  
  # Configure mock outputs for plan
  mock_outputs = {
    default_target_group_arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/mock/mock"
    https_listener_arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/mock/mock/mock"
    alb_security_group_id = "sg-mock"
  }
}