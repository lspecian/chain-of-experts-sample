# Terraform Module: AWS VPC
# Defines the core networking infrastructure for an environment on AWS.

# Using the official Terraform AWS VPC module
# Source: https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/latest
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0" # Use a specific version range for stability

  name = var.vpc_name
  cidr = var.vpc_cidr

  azs             = var.vpc_azs
  private_subnets = var.private_subnet_cidrs
  public_subnets  = var.public_subnet_cidrs

  enable_nat_gateway = var.enable_nat_gateway
  # Use one NAT gateway per AZ for high availability if needed
  single_nat_gateway = var.single_nat_gateway 
  # Or enable one NAT gateway for cost savings in non-prod
  one_nat_gateway_per_az = var.one_nat_gateway_per_az 

  enable_dns_hostnames = true
  enable_dns_support   = true

  # Tags for resources created by the module
  tags = merge(
    {
      "Terraform": "true",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )

  # Public subnet tags
  public_subnet_tags = merge(
    {
      "Type": "public"
    },
    var.public_subnet_tags
  )

  # Private subnet tags
  private_subnet_tags = merge(
    {
      "Type": "private"
    },
    var.private_subnet_tags
  )

  # Optional: Enable VPC Flow Logs to S3 or CloudWatch
  enable_flow_log                      = var.enable_flow_log
  create_flow_log_cloudwatch_log_group = var.create_flow_log_cloudwatch_log_group
  create_flow_log_cloudwatch_iam_role  = var.create_flow_log_cloudwatch_iam_role
  flow_log_max_aggregation_interval    = 60
  flow_log_destination_type            = "cloud-watch-logs" # Or "s3"
  # flow_log_destination_arn = ... # Required if using S3

  # Optional: VPC Endpoints (e.g., for S3, ECR, Secrets Manager)
  # TODO: Check terraform-aws-modules/vpc/aws v5.x documentation for correct endpoint configuration
  # Example structure might be a map:
  # endpoints = {
  #   s3 = true
  #   ecr_dkr = true
  #   ecr_api = true
  #   secretsmanager = true
  # }
  # enable_s3_endpoint            = var.enable_s3_endpoint # Incorrect variable name for v5.x
  # enable_ecr_dkr_endpoint       = var.enable_ecr_endpoint # Incorrect variable name for v5.x
  # enable_ecr_api_endpoint       = var.enable_ecr_endpoint # Incorrect variable name for v5.x
  # enable_secretsmanager_endpoint = var.enable_secretsmanager_endpoint # Incorrect variable name for v5.x
  # Add other endpoints as needed

}