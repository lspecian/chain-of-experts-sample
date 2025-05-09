# GCP Prod Cloud Run Module Configuration

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
  source = "../../../../modules/gcp_cloud_run"
}

# Override inputs specific to this module
inputs = {
  # These values come from the parent terragrunt.hcl
  # project_name, service_name, environment, tags, gcp_region, gcp_project_id
  
  # Cloud Run specific configuration
  service_name = "${local.project_name}-${local.environment}"
  
  # These values come from the parent terragrunt.hcl
  # container_image, container_port, memory_limit, cpu_limit, min_instances, max_instances
  
  # Production-specific settings
  timeout_seconds = 300  # 5 minutes
  concurrency = 80
  
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
      secret_name = "${local.project_name}-${local.environment}-langfuse-secret-key"
    },
    {
      name = "OPENAI_API_KEY"
      secret_name = "${local.project_name}-${local.environment}-openai-api-key"
    }
  ]
  
  # Allow unauthenticated invocations
  allow_unauthenticated = true
  
  # VPC connector (if needed)
  vpc_connector = "projects/${local.gcp_project_id}/locations/${local.gcp_region}/connectors/serverless-vpc-connector"
  
  # Cloud Run Ingress settings
  ingress = "internal-and-cloud-load-balancing"
  
  # Session affinity for stateful workloads
  session_affinity = true
}

# Extract local variables from parent
locals {
  # Parse the path to extract environment and project information
  environment = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.environment
  project_name = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.project_name
  service_name = "coe-api"  # Define the service name
  gcp_region = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.gcp_region
  gcp_project_id = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.gcp_project_id
  
  # Get Langfuse configuration from parent
  langfuse_public_key = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.langfuse_public_key
  langfuse_baseurl = read_terragrunt_config(find_in_parent_folders("terragrunt.hcl")).inputs.langfuse_baseurl
}