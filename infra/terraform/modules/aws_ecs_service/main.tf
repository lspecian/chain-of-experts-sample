# Terraform Module: AWS ECS Service
# Defines resources for deploying a containerized service on ECS Fargate,
# including ECR repository, ECS cluster, IAM roles, logging, task definition, service, and security group.

# --- ECR Repository ---
resource "aws_ecr_repository" "app_repo" {
  name                 = "${var.project_name}-${var.service_name}-${var.environment}"
  image_tag_mutability = "MUTABLE" # Or IMMUTABLE

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = merge(
    {
      "Name": "${var.project_name}-${var.service_name}-${var.environment}-repo",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )
}

# --- ECR Lifecycle Policy ---
resource "aws_ecr_lifecycle_policy" "app_repo_policy" {
  repository = aws_ecr_repository.app_repo.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1,
        description  = "Keep last 10 tagged images",
        selection = {
          tagStatus   = "tagged",
          tagPrefixList = ["v"], # Adjust prefix if needed
          countType   = "imageCountMoreThan",
          countNumber = 10 
        },
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2,
        description  = "Expire untagged images older than 14 days",
        selection = {
          tagStatus   = "untagged",
          countType   = "sinceImagePushed",
          countUnit   = "days",
          countNumber = 14
        },
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# --- ECS Cluster ---
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.service_name}-${var.environment}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(
    {
      "Name": "${var.project_name}-${var.service_name}-${var.environment}-cluster",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )
}

# --- CloudWatch Log Group ---
resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/${var.project_name}-${var.service_name}-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = merge(
    {
      "Name": "${var.project_name}-${var.service_name}-${var.environment}-logs",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )
}

# --- IAM Roles (Task Execution Role) ---
data "aws_iam_policy_document" "ecs_task_execution_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution_role" {
  name               = "${var.project_name}-${var.service_name}-${var.environment}-exec-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume_role.json

  tags = merge(
    {
      "Name": "${var.project_name}-${var.service_name}-${var.environment}-exec-role",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# --- IAM Roles (Task Role) ---
data "aws_iam_policy_document" "ecs_task_assume_role_policy" { # Renamed data source
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_role" {
  name               = "${var.project_name}-${var.service_name}-${var.environment}-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role_policy.json # Use renamed data source

  inline_policy {
    name = "AllowSecretAccess"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Action = [
            "secretsmanager:GetSecretValue",
            # "kms:Decrypt" # Add if using CMK
          ]
          Effect   = "Allow"
          Resource = var.secret_arns 
        },
      ]
    })
  }

  tags = merge(
    {
      "Name": "${var.project_name}-${var.service_name}-${var.environment}-task-role",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )
}

# --- Secrets Manager Secrets (Example) ---
resource "aws_secretsmanager_secret" "langfuse_keys" {
  count = var.create_placeholder_secrets ? 1 : 0

  name        = "${var.project_name}/${var.service_name}/${var.environment}/langfuse-keys"
  description = "Placeholder for Langfuse API keys"

  tags = merge(
    {
      "Name": "${var.project_name}-${var.service_name}-${var.environment}-langfuse-keys",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )
}

resource "aws_secretsmanager_secret_version" "langfuse_keys_version" {
  count = var.create_placeholder_secrets ? 1 : 0

  secret_id     = aws_secretsmanager_secret.langfuse_keys[0].id
  secret_string = jsonencode({
    LANGFUSE_SECRET_KEY = "replace-with-real-secret-key"
    LANGFUSE_PUBLIC_KEY = "replace-with-real-public-key"
  })
}

# --- ECS Task Definition ---
resource "aws_ecs_task_definition" "app_task" {
  family                   = "${var.project_name}-${var.service_name}-${var.environment}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "${var.service_name}-container"
      image     = var.container_image
      essential = true
      cpu       = var.task_cpu
      memory    = var.task_memory
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = var.environment_variables
      secrets     = var.secrets 
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs_logs.name
          "awslogs-region"        = var.aws_region 
          "awslogs-stream-prefix" = var.service_name
        }
      }
    }
  ])

  tags = merge(
    {
      "Name": "${var.project_name}-${var.service_name}-${var.environment}-task-def",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )
}

# --- Security Group for the ECS Service ---
resource "aws_security_group" "ecs_service_sg" {
  name        = "${var.project_name}-${var.service_name}-${var.environment}-service-sg"
  description = "Allow traffic from ALB to ECS service"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Allow traffic from ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id] 
  }

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    {
      "Name": "${var.project_name}-${var.service_name}-${var.environment}-service-sg",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )
}

# --- ECS Service ---
resource "aws_ecs_service" "app_service" {
  name            = "${var.project_name}-${var.service_name}-${var.environment}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app_task.arn
  launch_type     = "FARGATE"
  desired_count   = var.desired_count

  network_configuration {
    subnets         = var.private_subnet_ids 
    security_groups = [aws_security_group.ecs_service_sg.id]
  }

  load_balancer {
    target_group_arn = var.alb_target_group_arn 
    container_name   = "${var.service_name}-container"
    container_port   = var.container_port
  }

  deployment_controller {
    type = "ECS" 
  }
  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 50
  health_check_grace_period_seconds  = 60

  depends_on = [var.alb_listener_arn] # Use list for depends_on

  tags = merge(
    {
      "Name": "${var.project_name}-${var.service_name}-${var.environment}-service",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )
}

# --- Monitoring (Example CloudWatch Alarm) ---
resource "aws_cloudwatch_metric_alarm" "ecs_cluster_high_cpu" {
  count = var.enable_cluster_cpu_alarm ? 1 : 0

  alarm_name          = "${var.project_name}-${var.service_name}-${var.environment}-cluster-high-cpu"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300" 
  statistic           = "Average"
  threshold           = var.cluster_cpu_threshold_percent
  alarm_description   = "Alarm when ECS cluster CPU utilization exceeds threshold"
  treat_missing_data  = "missing"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
  }

  # alarm_actions = [var.sns_topic_arn] 
  # ok_actions    = [var.sns_topic_arn]

  tags = merge(
    {
      "Name": "${var.project_name}-${var.service_name}-${var.environment}-cluster-high-cpu-alarm",
      "Environment": var.environment,
      "Project": var.project_name
    },
    var.tags
  )
}