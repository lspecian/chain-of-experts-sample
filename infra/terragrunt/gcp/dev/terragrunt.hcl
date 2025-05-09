# GCP Dev Environment Configuration

# Include the root terragrunt.hcl configuration
include {
  path = find_in_parent_folders()
}

# Set environment-specific variables
inputs = {
  environment = "dev"
  
  # GCP Configuration
  gcp_region = "us-central1"
  
  # Cloud Run Configuration
  container_image = "gcr.io/your-project-id/chain-of-experts:latest"
  container_port = 8080
  memory_limit = "1Gi"
  cpu_limit = "1"
  min_instances = 0
  max_instances = 2
  
  # Langfuse Configuration
  langfuse_public_key = "pk-lf-df2be939-5800-4d05-bb78-b93bc188ff20"
  langfuse_baseurl = "https://cloud.langfuse.com"
}