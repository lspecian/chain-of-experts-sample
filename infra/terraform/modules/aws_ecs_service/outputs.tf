# Outputs from the AWS ECS Service module

output "ecr_repository_url" {
  description = "The URL of the ECR repository"
  value       = aws_ecr_repository.app_repo.repository_url
}

output "ecr_repository_arn" {
  description = "The ARN of the ECR repository"
  value       = aws_ecr_repository.app_repo.arn
}

output "ecs_cluster_name" {
  description = "The name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "The ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_task_execution_role_arn" {
  description = "The ARN of the ECS task execution role"
  value       = aws_iam_role.ecs_task_execution_role.arn
}

output "cloudwatch_log_group_name" {
  description = "The name of the CloudWatch log group for ECS tasks"
  value       = aws_cloudwatch_log_group.ecs_logs.name
}

output "ecs_task_role_arn" {
  description = "The ARN of the ECS task role"
  value       = aws_iam_role.ecs_task_role.arn
}

output "placeholder_secret_arn" {
  description = "ARN of the placeholder Langfuse secret (only created if var.create_placeholder_secrets is true)"
  value       = try(aws_secretsmanager_secret.langfuse_keys[0].arn, null) # Use try() to handle count=0 case
}

# Add other outputs as needed (e.g., service name)
output "ecs_service_name" {
  description = "The name of the ECS service"
  value       = aws_ecs_service.app_service.name
}

output "ecs_service_arn" {
  description = "The ARN of the ECS service"
  value       = aws_ecs_service.app_service.id # Service ARN is in the id attribute
}

output "ecs_service_security_group_id" {
  description = "The ID of the security group attached to the ECS service"
  value       = aws_security_group.ecs_service_sg.id
}