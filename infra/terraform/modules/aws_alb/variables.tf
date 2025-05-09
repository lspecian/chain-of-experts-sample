# Input variables for the AWS ALB module

variable "project_name" {
  description = "Name of the overall project"
  type        = string
}

variable "service_name" {
  description = "Name of the specific service this ALB fronts"
  type        = string
}

variable "environment" {
  description = "Deployment environment name (e.g., 'dev', 'staging', 'prod')"
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC where the ALB will be deployed"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for the ALB"
  type        = list(string)
}

variable "log_bucket_name" {
  description = "Name of the S3 bucket for storing ALB access logs"
  type        = string
}

variable "enable_access_logs" {
  description = "Flag to enable/disable ALB access logging"
  type        = bool
  default     = true
}

variable "certificate_arn" {
  description = "ARN of the ACM certificate for the HTTPS listener"
  type        = string
}

variable "container_port" {
  description = "Port the application container listens on (for default target group)"
  type        = number
  default     = 8080
}

variable "health_check_path" {
  description = "Path for the ALB health check"
  type        = string
  default     = "/health" # Assuming a /health endpoint exists
}

variable "tags" {
  description = "A map of tags to add to all resources created by this module"
  type        = map(string)
  default     = {}
}