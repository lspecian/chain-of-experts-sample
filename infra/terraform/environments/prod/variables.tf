# Production Environment Variables (AWS Deployment)

variable "project_name" {
  description = "Name of the overall project"
  type        = string
  default     = "coe-app" 
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "prod" # Changed default
}

variable "service_name" {
  description = "Name of the primary service being deployed"
  type        = string
  default     = "api" 
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Terraform   = "true"
    Project     = "coe-app"
    Environment = "prod" # Changed default
  }
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-west-2" # Example: Different region for prod
}

# --- VPC Variables ---
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.20.0.0/16" # Example: Different CIDR for prod
}

variable "vpc_azs" {
  description = "Availability zones for the VPC"
  type        = list(string)
  # Example: Use data source in root or provide specific AZs for prod region
  # default     = ["us-west-2a", "us-west-2b", "us-west-2c"] # Example: 3 AZs for prod
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  # Example: Must match the number of AZs
  # default     = ["10.20.1.0/24", "10.20.2.0/24", "10.20.3.0/24"] 
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  # Example: Must match the number of AZs
  # default     = ["10.20.101.0/24", "10.20.102.0/24", "10.20.103.0/24"] 
}

# --- ALB Variables ---
variable "certificate_arn" {
  description = "ARN of the ACM certificate for HTTPS listener"
  type        = string
  # No default - must be provided
}

variable "container_port" {
  description = "Port the application container listens on"
  type        = number
  default     = 8080
}

variable "health_check_path" {
  description = "Path for ALB health checks"
  type        = string
  default     = "/health"
}

variable "log_bucket_name" {
  description = "S3 bucket name for storing ALB access logs"
  type        = string
  # No default - must be provided or created separately
}

# --- ECS Service Variables ---
variable "container_image" {
  description = "Docker image URL (including tag) to deploy"
  type        = string
  # No default - typically comes from CI/CD (e.g., specific version tag for prod)
}

variable "langfuse_public_key" {
  description = "Langfuse Public Key"
  type        = string
  # No default - provide via tfvars or environment variables
}

variable "langfuse_baseurl" {
  description = "Langfuse Base URL"
  type        = string
  default     = "https://cloud.langfuse.com"
}

# Note: langfuse_secret_key is not defined here