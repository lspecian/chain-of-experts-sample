# Outputs from the AWS ALB module

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = module.alb.lb_dns_name
}

output "alb_zone_id" {
  description = "Route 53 zone ID of the Application Load Balancer"
  value       = module.alb.lb_zone_id
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = module.alb.lb_arn
}

output "http_listener_arn" {
  description = "ARN of the HTTP listener"
  # Accessing map elements requires knowing the key used in main.tf
  value       = module.alb.listeners["http-redirect"].listener_arn 
}

output "https_listener_arn" {
  description = "ARN of the HTTPS listener"
  # Accessing map elements requires knowing the key used in main.tf
  value       = module.alb.listeners["https-forward"].listener_arn
}

output "default_target_group_arn" {
  description = "ARN of the default target group"
  # Accessing map elements requires knowing the key used in main.tf
  value       = module.alb.target_groups["default_tg"].target_group_arn
}

output "alb_security_group_id" {
  description = "ID of the security group associated with the ALB"
  value       = aws_security_group.alb_sg.id
}