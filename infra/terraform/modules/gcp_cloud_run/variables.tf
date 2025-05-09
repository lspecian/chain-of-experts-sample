# Input variables for the GCP Cloud Run module

variable "project_name" {
  description = "Name of the overall project"
  type        = string
}

variable "service_name" {
  description = "Name of the specific service being deployed"
  type        = string
}

variable "environment" {
  description = "Deployment environment name (e.g., 'dev', 'staging', 'prod')"
  type        = string
}

variable "gcp_project_id" {
  description = "GCP project ID where resources will be deployed"
  type        = string
}

variable "gcp_region" {
  description = "GCP region where resources will be deployed"
  type        = string
}

variable "tags" {
  description = "A map of tags (labels in GCP) to add to resources"
  type        = map(string)
  default     = {}
}

variable "langfuse_secret_key" {
  description = "The Langfuse secret key (will be stored in Secret Manager)"
  type        = string
  sensitive   = true
}

variable "langfuse_public_key" {
  description = "The Langfuse public key (used as env var)"
  type        = string
}

variable "langfuse_baseurl" {
  description = "The base URL for the Langfuse instance"
  type        = string
  default     = "https://cloud.langfuse.com"
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "container_port" {
  description = "Port the application container listens on"
  type        = number
  default     = 8080
}

variable "cloud_run_cpu_limit" {
  description = "CPU limit for the Cloud Run container (e.g., '1000m')"
  type        = string
  default     = "1000m"
}

variable "cloud_run_memory_limit" {
  description = "Memory limit for the Cloud Run container (e.g., '512Mi')"
  type        = string
  default     = "512Mi"
}

variable "cloud_run_min_instances" {
  description = "Minimum number of Cloud Run instances"
  type        = number
  default     = 0 # Set > 0 to avoid cold starts
}

variable "cloud_run_max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 10
}

variable "gcp_service_account_email" {
  description = "Optional service account email for the Cloud Run service identity. If empty, uses the default Compute Engine SA."
  type        = string
  default     = ""
}