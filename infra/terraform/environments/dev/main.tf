# Development Environment Configuration (AWS Deployment)

# Note: Assumes AWS provider is configured in the root main.tf

# --- Networking ---
module "vpc" {
  source = "../../modules/aws_vpc"

  vpc_name             = "${var.project_name}-vpc-${var.environment}"
  vpc_cidr             = var.vpc_cidr
  vpc_azs              = var.vpc_azs
  private_subnet_cidrs = var.private_subnet_cidrs
  public_subnet_cidrs  = var.public_subnet_cidrs

  enable_nat_gateway     = true
  single_nat_gateway     = false # Use HA NAT for dev (can be changed via tfvars)
  one_nat_gateway_per_az = true

  environment  = var.environment
  project_name = var.project_name
  tags         = var.common_tags
}

# --- Load Balancer ---
module "alb" {
  source = "../../modules/aws_alb"

  project_name = var.project_name
  service_name = var.service_name # Define a primary service name for ALB
  environment  = var.environment
  tags         = var.common_tags

  vpc_id              = module.vpc.vpc_id
  public_subnet_ids   = module.vpc.public_subnet_ids
  certificate_arn     = var.certificate_arn # Needs ACM cert ARN
  container_port      = var.container_port
  health_check_path   = var.health_check_path
  log_bucket_name     = var.log_bucket_name # Needs S3 bucket for logs
  enable_access_logs  = true
}

# --- ECS Service ---
module "ecs_service" {
  source = "../../modules/aws_ecs_service"

  project_name = var.project_name
  service_name = var.service_name # Use the same service name
  environment  = var.environment
  tags         = var.common_tags
  aws_region   = var.aws_region # Pass region

  # ECR/Cluster/Logging/Roles (created by module)
  log_retention_days = 30

  # Secrets
  # Example: Pass ARN of the secret created by this module (if create_placeholder_secrets=true)
  # or pass ARNs of externally created secrets
  secret_arns = [try(module.ecs_service.placeholder_secret_arn, null)] # Example
  create_placeholder_secrets = true # Set to true for dev/testing if needed

  # Task Definition
  container_image = var.container_image # e.g., output from a CI/CD build
  container_port  = var.container_port
  task_cpu        = 1024 # 1 vCPU
  task_memory     = 2048 # 2 GB
  # Example environment variables
  environment_variables = {
    NODE_ENV             = var.environment
    LANGFUSE_PUBLIC_KEY  = var.langfuse_public_key
    LANGFUSE_BASEURL     = var.langfuse_baseurl
    # Add other necessary env vars
  }
  # Example secrets mapping
  secrets = [
    {
      name      = "LANGFUSE_SECRET_KEY"
      valueFrom = try(module.ecs_service.placeholder_secret_arn, "arn:aws:secretsmanager:us-east-1:123456789012:secret:placeholder-XYZ") # Example placeholder ARN
    }
  ]

  # Service Definition
  desired_count        = 1 # Run 1 instance in dev
  private_subnet_ids   = module.vpc.private_subnet_ids
  alb_target_group_arn = module.alb.default_target_group_arn
  alb_listener_arn     = [module.alb.https_listener_arn] # Pass as list for depends_on
  vpc_id               = module.vpc.vpc_id
  alb_security_group_id= module.alb.alb_security_group_id

  # Monitoring
  enable_cluster_cpu_alarm      = true
  cluster_cpu_threshold_percent = 85 # Example threshold for dev
}