# AWS Prod Environment Configuration

# Include the root terragrunt.hcl configuration
include {
  path = find_in_parent_folders()
}

# Set environment-specific variables
inputs = {
  environment = "prod"
  
  # VPC Configuration
  vpc_cidr             = "10.1.0.0/16"
  vpc_azs              = ["us-east-1a", "us-east-1b", "us-east-1c"]
  private_subnet_cidrs = ["10.1.1.0/24", "10.1.2.0/24", "10.1.3.0/24"]
  public_subnet_cidrs  = ["10.1.101.0/24", "10.1.102.0/24", "10.1.103.0/24"]
  
  # ECS Configuration
  container_image      = "chain-of-experts:latest"
  container_port       = 8080
  task_cpu             = 2048  # 2 vCPU
  task_memory          = 4096  # 4 GB
  desired_count        = 2     # Number of tasks to run
  
  # ALB Configuration
  health_check_path    = "/health"
  log_bucket_name      = "coe-alb-logs-prod"
  
  # Langfuse Configuration
  langfuse_public_key  = "pk-lf-df2be939-5800-4d05-bb78-b93bc188ff20"
  langfuse_baseurl     = "https://cloud.langfuse.com"
}