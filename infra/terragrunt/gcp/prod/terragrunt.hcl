# GCP Prod Environment Configuration

# Include the root terragrunt.hcl configuration
include {
  path = find_in_parent_folders()
}

# Set environment-specific variables
inputs = {
  environment = "prod"
  
  # GCP Configuration
  gcp_region = "us-central1"
  
  # Cloud Run Configuration
  container_image = "gcr.io/your-project-id/chain-of-experts:latest"
  container_port = 8080
  memory_limit = "2Gi"
  cpu_limit = "2"
  min_instances = 1  # Keep at least one instance running
  max_instances = 10
  
  # Langfuse Configuration
  langfuse_public_key = "pk-lf-df2be939-5800-4d05-bb78-b93bc188ff20"
  langfuse_baseurl = "https://cloud.langfuse.com"
}