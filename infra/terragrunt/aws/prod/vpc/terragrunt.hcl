# AWS Prod VPC Module Configuration

# Include the environment configuration
include {
  path = find_in_parent_folders()
}

# Define dependencies
dependencies {
  paths = []
}

# Set the source of the module
terraform {
  source = "../../../../modules/aws_vpc"
}

# Override inputs specific to this module
inputs = {
  vpc_name = "${local.project_name}-vpc-${local.environment}"
  
  # These values come from the parent terragrunt.hcl
  # vpc_cidr, vpc_azs, private_subnet_cidrs, public_subnet_cidrs
  
  enable_nat_gateway     = true
  single_nat_gateway     = false  # Use multiple NAT gateways for high availability in prod
  one_nat_gateway_per_az = true
}

# Extract local variables from parent
locals {
  # Parse the path to extract environment and project information
  environment = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.environment
  project_name = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.project_name
}