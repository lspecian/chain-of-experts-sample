# Outputs from the AWS VPC module

output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "List of IDs of public subnets"
  value       = module.vpc.public_subnets
}

output "private_subnet_ids" {
  description = "List of IDs of private subnets"
  value       = module.vpc.private_subnets
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "nat_gateway_public_ips" {
  description = "List of public Elastic IPs created for NAT gateways"
  value       = module.vpc.nat_public_ips
}

# Add other outputs as needed, e.g., security group IDs, AZs