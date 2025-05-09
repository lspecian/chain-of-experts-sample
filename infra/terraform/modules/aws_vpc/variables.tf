# Input variables for the AWS VPC module

variable "vpc_name" {
  description = "Name to be used on VPC created"
  type        = string
}

variable "vpc_cidr" {
  description = "The CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "vpc_azs" {
  description = "A list of availability zones names or ids in the region"
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "A list of CIDRs for private subnets"
  type        = list(string)
}

variable "public_subnet_cidrs" {
  description = "A list of CIDRs for public subnets"
  type        = list(string)
}

variable "enable_nat_gateway" {
  description = "Should be true if you want NAT Gateways"
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Should be true if you want to provision a single shared NAT Gateway across all AZs"
  type        = bool
  default     = false # Default to HA NAT Gateways unless specified
}

variable "one_nat_gateway_per_az" {
  description = "Should be true if you want only one NAT Gateway per AZ"
  type        = bool
  default     = true # Default to HA NAT Gateways
}

variable "environment" {
  description = "Deployment environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "chain-of-experts"
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}

variable "public_subnet_tags" {
  description = "Additional tags for the public subnets"
  type        = map(string)
  default     = {}
}

variable "private_subnet_tags" {
  description = "Additional tags for the private subnets"
  type        = map(string)
  default     = {}
}

variable "enable_flow_log" {
  description = "Whether to enable VPC flow logs"
  type        = bool
  default     = false
}

variable "create_flow_log_cloudwatch_log_group" {
  description = "Whether to create CloudWatch log group for flow logs"
  type        = bool
  default     = false
}

variable "create_flow_log_cloudwatch_iam_role" {
  description = "Whether to create IAM role for flow logs"
  type        = bool
  default     = false
}

# TODO: Add variables for endpoint configuration once correct names are known
# variable "enable_s3_endpoint" { ... }
# variable "enable_ecr_endpoint" { ... }
# variable "enable_secretsmanager_endpoint" { ... }