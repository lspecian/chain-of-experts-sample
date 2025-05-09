variable "aws_region" {
  description = "Default AWS region for provider configuration"
  type        = string
  default     = "us-east-1" # Or another sensible default
}

variable "gcp_project_id" {
  description = "Default GCP project ID for provider configuration"
  type        = string
  # No default, should be provided by environment
}

variable "gcp_region" {
  description = "Default GCP region for provider configuration"
  type        = string
  default     = "us-central1" # Or another sensible default
}