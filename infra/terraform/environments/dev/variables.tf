# Development Environment Variables (AWS Deployment)

variable "project_name" {
  description = "Name of the overall project"
  type        = string
  default     = "coe-app" # Default project name
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "dev"
}

variable "service_name" {
  description = "Name of the primary service being deployed"
  type        = string
  default     = "api" # Example service name
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Terraform   = "true"
    Project     = "coe-app"
    Environment = "dev"
  }
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1" # Example default
}

# --- VPC Variables ---
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.10.0.0/16" # Example CIDR for dev
}

variable "vpc_azs" {
  description = "Availability zones for the VPC"
  type        = list(string)
  # Example: Use data source in root or provide specific AZs
  # default     = ["us-east-1a", "us-east-1b"] 
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  # Example: Must match the number of AZs
  # default     = ["10.10.1.0/24", "10.10.2.0/24"] 
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  # Example: Must match the number of AZs
  # default     = ["10.10.101.0/24", "10.10.102.0/24"] 
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
  # No default - typically comes from CI/CD
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

# Note: langfuse_secret_key is not defined here as it should be 
# handled securely (e.g., passed via environment variable to terraform apply
# or fetched from a secure source if not using the placeholder secret).