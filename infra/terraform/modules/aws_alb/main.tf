# Terraform Module: AWS ALB
# Defines an Application Load Balancer, target groups, and listeners
# for routing traffic to backend services (e.g., ECS).

# Using the official Terraform AWS ALB module
# Source: https://registry.terraform.io/modules/terraform-aws-modules/alb/aws/latest
module "alb" {
  source  = "terraform-aws-modules/alb/aws"
  version = "~> 9.0" # Use a specific version range for stability

  # Tags should be a top-level argument for the module
  tags = merge(
    {
      "Name": "${var.project_name}-${var.service_name}-${var.environment}-alb",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )

  name = "${var.project_name}-${var.service_name}-${var.environment}-alb"

  load_balancer_type = "application"
  vpc_id             = var.vpc_id
  subnets            = var.public_subnet_ids # ALB typically resides in public subnets
  security_groups    = [aws_security_group.alb_sg.id]

  # Enable access logs to S3 (optional but recommended)
  access_logs = {
    bucket  = var.log_bucket_name
    prefix  = "${var.project_name}-${var.service_name}-${var.environment}-alb-logs"
    enabled = var.enable_access_logs
  }

  # Define listeners using a map structure (common in newer module versions)
  listeners = {
    # Listener for HTTP (port 80) - redirects to HTTPS
    http-redirect = {
      port     = 80
      protocol = "HTTP"
      # Default action: redirect HTTP to HTTPS
      default_action = {
        type = "redirect"
        redirect = {
          port        = "443"
          protocol    = "HTTPS"
          status_code = "HTTP_301"
        }
      }
    }
    # Listener for HTTPS (port 443) - forwards to default target group
    https-forward = {
      port            = 443
      protocol        = "HTTPS"
      certificate_arn = var.certificate_arn # Required for HTTPS
      # Default action: forward to the first target group defined below
      default_action = {
        type             = "forward"
        target_group_key = "default_tg" # Key matching the target group below
      }
    }
  }

  # Define Target Groups using a map structure
  target_groups = {
    # Default Target Group (key matches listener default_action)
    default_tg = {
      name_prefix      = "${var.service_name}-"
      backend_protocol = "HTTP"
      backend_port     = var.container_port
      target_type      = "ip"
      health_check = {
        enabled             = true
        interval            = 30
        path                = var.health_check_path
        port                = "traffic-port"
        healthy_threshold   = 3
        unhealthy_threshold = 3
        timeout             = 6
        protocol            = "HTTP"
        matcher             = "200-399"
      }
    }
    # Add other target groups here if needed, using unique keys
  }

}

# Security Group for the ALB
resource "aws_security_group" "alb_sg" {
  name        = "${var.project_name}-${var.service_name}-${var.environment}-alb-sg"
  description = "Security group for the Application Load Balancer"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Allow HTTP from anywhere (redirects to HTTPS)
    description = "Allow HTTP inbound"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Allow HTTPS from anywhere
    description = "Allow HTTPS inbound"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1" # Allow all outbound traffic
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = merge(
    {
      "Name": "${var.project_name}-${var.service_name}-${var.environment}-alb-sg",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )
}