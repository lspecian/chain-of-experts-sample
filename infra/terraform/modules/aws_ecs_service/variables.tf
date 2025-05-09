# Input variables for the AWS ECS Service module

variable "project_name" {
  description = "Name of the overall project"
  type        = string
}

variable "service_name" {
  description = "Name of the specific service being deployed (e.g., 'api', 'worker')"
  type        = string
}

variable "environment" {
  description = "Deployment environment name (e.g., 'dev', 'staging', 'prod')"
  type        = string
}

variable "tags" {
  description = "A map of tags to add to all resources created by this module"
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  description = "Number of days to retain CloudWatch logs"
  type        = number
  default     = 30
}

variable "secret_arns" {
  description = "List of ARNs of the Secrets Manager secrets the task role needs access to"
  type        = list(string)
  default     = []
}

variable "create_placeholder_secrets" {
  description = "Set to true to create placeholder Secrets Manager secrets (for testing/example only)"
  type        = bool
  default     = false # Should be false by default for actual deployments
}

variable "enable_cluster_cpu_alarm" {
  description = "Flag to enable the CloudWatch alarm for high cluster CPU utilization"
  type        = bool
  default     = true
}

variable "cluster_cpu_threshold_percent" {
  description = "CPU utilization threshold (percent) for the cluster alarm"
  type        = number
  default     = 80
}

# variable "sns_topic_arn" {
#   description = "ARN of the SNS topic to send alarm notifications to"
#   type        = string
#   default     = null # Optional: only needed if using alarm_actions
# }

variable "task_cpu" {
  description = "CPU units for the ECS task (e.g., 1024 for 1 vCPU)"
  type        = number
  default     = 1024
}

variable "task_memory" {
  description = "Memory (in MiB) for the ECS task (e.g., 2048 for 2GB)"
  type        = number
  default     = 2048
}

variable "container_image" {
  description = "Docker image URL for the service container (e.g., ECR repo URL + tag)"
  type        = string
}

variable "container_port" {
  description = "Port exposed by the container"
  type        = number
  default     = 8080
}

variable "environment_variables" {
  description = "A map of environment variables to pass to the container"
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "A list of secrets to pass to the container as environment variables. Each element is a map { name: string, valueFrom: string (secret ARN or Parameter Store ARN) }"
  type = list(object({
    name      = string
    valueFrom = string
  }))
  default = []
}

variable "aws_region" {
  description = "AWS region where resources are deployed (needed for log configuration)"
  type        = string
}

# Add other variables as needed for service config, etc.
variable "desired_count" {
  description = "Desired number of tasks for the ECS service"
  type        = number
  default     = 1
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs where the ECS tasks will run"
  type        = list(string)
}

variable "vpc_id" {
  description = "ID of the VPC where the service security group will be created"
  type        = string
}

variable "alb_target_group_arn" {
  description = "ARN of the ALB Target Group to associate with the service"
  type        = string
}

variable "alb_listener_arn" {
  description = "ARN of the ALB Listener to use for dependency ordering (list type for depends_on)"
  type        = list(string) # depends_on expects a list
  default     = []
}

variable "alb_security_group_id" {
  description = "ID of the ALB Security Group to allow traffic from"
  type        = string
}
# Example:
# variable "container_image" {
#   description = "Docker image URL for the service container"
#   type        = string
# }
# 
# variable "container_port" {
#   description = "Port exposed by the container"
#   type        = number
#   default     = 8080
# }
# 
# variable "task_cpu" {
#   description = "CPU units for the ECS task"
#   type        = number
#   default     = 1024
# }
# 
# variable "task_memory" {
#   description = "Memory (in MiB) for the ECS task"
#   type        = number
#   default     = 2048
# }
# 
# variable "desired_count" {
#   description = "Desired number of tasks for the ECS service"
#   type        = number
#   default     = 1
# }