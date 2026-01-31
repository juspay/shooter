# Terraform configuration for SHOOTER notification system infrastructure
# Supports AWS, GCP, and Azure deployments

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.20"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.10"
    }
  }
}

# Variables
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "shooter-cluster"
}

variable "node_instance_type" {
  description = "EC2 instance type for worker nodes"
  type        = string
  default     = "t3.medium"
}

variable "min_nodes" {
  description = "Minimum number of worker nodes"
  type        = number
  default     = 2
}

variable "max_nodes" {
  description = "Maximum number of worker nodes"
  type        = number
  default     = 10
}

variable "desired_nodes" {
  description = "Desired number of worker nodes"
  type        = number
  default     = 3
}

# Provider configuration
provider "aws" {
  region = var.region
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# VPC
resource "aws_vpc" "shooter_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "${var.cluster_name}-vpc"
    Environment = var.environment
    Project     = "shooter"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "shooter_igw" {
  vpc_id = aws_vpc.shooter_vpc.id

  tags = {
    Name        = "${var.cluster_name}-igw"
    Environment = var.environment
    Project     = "shooter"
  }
}

# Subnets
resource "aws_subnet" "shooter_private" {
  count = 2

  vpc_id            = aws_vpc.shooter_vpc.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name        = "${var.cluster_name}-private-${count.index + 1}"
    Environment = var.environment
    Project     = "shooter"
    Type        = "private"
  }
}

resource "aws_subnet" "shooter_public" {
  count = 2

  vpc_id                  = aws_vpc.shooter_vpc.id
  cidr_block              = "10.0.${count.index + 10}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name        = "${var.cluster_name}-public-${count.index + 1}"
    Environment = var.environment
    Project     = "shooter"
    Type        = "public"
  }
}

# NAT Gateway
resource "aws_eip" "shooter_nat" {
  count  = 2
  domain = "vpc"

  tags = {
    Name        = "${var.cluster_name}-nat-${count.index + 1}"
    Environment = var.environment
    Project     = "shooter"
  }
}

resource "aws_nat_gateway" "shooter_nat" {
  count = 2

  allocation_id = aws_eip.shooter_nat[count.index].id
  subnet_id     = aws_subnet.shooter_public[count.index].id

  tags = {
    Name        = "${var.cluster_name}-nat-${count.index + 1}"
    Environment = var.environment
    Project     = "shooter"
  }

  depends_on = [aws_internet_gateway.shooter_igw]
}

# Route Tables
resource "aws_route_table" "shooter_public" {
  vpc_id = aws_vpc.shooter_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.shooter_igw.id
  }

  tags = {
    Name        = "${var.cluster_name}-public"
    Environment = var.environment
    Project     = "shooter"
  }
}

resource "aws_route_table" "shooter_private" {
  count  = 2
  vpc_id = aws_vpc.shooter_vpc.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.shooter_nat[count.index].id
  }

  tags = {
    Name        = "${var.cluster_name}-private-${count.index + 1}"
    Environment = var.environment
    Project     = "shooter"
  }
}

# Route Table Associations
resource "aws_route_table_association" "shooter_public" {
  count = 2

  subnet_id      = aws_subnet.shooter_public[count.index].id
  route_table_id = aws_route_table.shooter_public.id
}

resource "aws_route_table_association" "shooter_private" {
  count = 2

  subnet_id      = aws_subnet.shooter_private[count.index].id
  route_table_id = aws_route_table.shooter_private[count.index].id
}

# Security Groups
resource "aws_security_group" "shooter_cluster" {
  name_prefix = "${var.cluster_name}-cluster"
  vpc_id      = aws_vpc.shooter_vpc.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.cluster_name}-cluster"
    Environment = var.environment
    Project     = "shooter"
  }
}

resource "aws_security_group" "shooter_nodes" {
  name_prefix = "${var.cluster_name}-nodes"
  vpc_id      = aws_vpc.shooter_vpc.id

  ingress {
    from_port = 0
    to_port   = 65535
    protocol  = "tcp"
    self      = true
  }

  ingress {
    from_port       = 1025
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.shooter_cluster.id]
  }

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.shooter_cluster.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.cluster_name}-nodes"
    Environment = var.environment
    Project     = "shooter"
  }
}

# IAM Roles
resource "aws_iam_role" "shooter_cluster" {
  name = "${var.cluster_name}-cluster-role"

  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
    Version = "2012-10-17"
  })
}

resource "aws_iam_role_policy_attachment" "shooter_cluster_AmazonEKSClusterPolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.shooter_cluster.name
}

resource "aws_iam_role" "shooter_nodes" {
  name = "${var.cluster_name}-nodes-role"

  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
    Version = "2012-10-17"
  })
}

resource "aws_iam_role_policy_attachment" "shooter_nodes_AmazonEKSWorkerNodePolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.shooter_nodes.name
}

resource "aws_iam_role_policy_attachment" "shooter_nodes_AmazonEKS_CNI_Policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.shooter_nodes.name
}

resource "aws_iam_role_policy_attachment" "shooter_nodes_AmazonEC2ContainerRegistryReadOnly" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.shooter_nodes.name
}

# EKS Cluster
resource "aws_eks_cluster" "shooter" {
  name     = var.cluster_name
  role_arn = aws_iam_role.shooter_cluster.arn
  version  = "1.27"

  vpc_config {
    subnet_ids              = concat(aws_subnet.shooter_private[*].id, aws_subnet.shooter_public[*].id)
    endpoint_private_access = true
    endpoint_public_access  = true
    security_group_ids      = [aws_security_group.shooter_cluster.id]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  depends_on = [
    aws_iam_role_policy_attachment.shooter_cluster_AmazonEKSClusterPolicy,
  ]

  tags = {
    Name        = var.cluster_name
    Environment = var.environment
    Project     = "shooter"
  }
}

# EKS Node Group
resource "aws_eks_node_group" "shooter" {
  cluster_name    = aws_eks_cluster.shooter.name
  node_group_name = "${var.cluster_name}-nodes"
  node_role_arn   = aws_iam_role.shooter_nodes.arn
  subnet_ids      = aws_subnet.shooter_private[*].id
  instance_types  = [var.node_instance_type]

  scaling_config {
    desired_size = var.desired_nodes
    max_size     = var.max_nodes
    min_size     = var.min_nodes
  }

  update_config {
    max_unavailable_percentage = 50
  }

  depends_on = [
    aws_iam_role_policy_attachment.shooter_nodes_AmazonEKSWorkerNodePolicy,
    aws_iam_role_policy_attachment.shooter_nodes_AmazonEKS_CNI_Policy,
    aws_iam_role_policy_attachment.shooter_nodes_AmazonEC2ContainerRegistryReadOnly,
  ]

  tags = {
    Name        = "${var.cluster_name}-nodes"
    Environment = var.environment
    Project     = "shooter"
  }
}

# RDS Subnet Group
resource "aws_db_subnet_group" "shooter" {
  name       = "${var.cluster_name}-db-subnet-group"
  subnet_ids = aws_subnet.shooter_private[*].id

  tags = {
    Name        = "${var.cluster_name}-db-subnet-group"
    Environment = var.environment
    Project     = "shooter"
  }
}

# RDS Security Group
resource "aws_security_group" "shooter_rds" {
  name_prefix = "${var.cluster_name}-rds"
  vpc_id      = aws_vpc.shooter_vpc.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.shooter_nodes.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.cluster_name}-rds"
    Environment = var.environment
    Project     = "shooter"
  }
}

# RDS Instance
resource "aws_db_instance" "shooter" {
  identifier = "${var.cluster_name}-postgres"

  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.t3.micro"

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "shooter"
  username = "shooter"
  password = "change-this-in-production" # Use AWS Secrets Manager in production

  vpc_security_group_ids = [aws_security_group.shooter_rds.id]
  db_subnet_group_name   = aws_db_subnet_group.shooter.name

  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  skip_final_snapshot = true # Set to false in production
  deletion_protection = false # Set to true in production

  tags = {
    Name        = "${var.cluster_name}-postgres"
    Environment = var.environment
    Project     = "shooter"
  }
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "shooter" {
  name       = "${var.cluster_name}-redis-subnet-group"
  subnet_ids = aws_subnet.shooter_private[*].id
}

# ElastiCache Security Group
resource "aws_security_group" "shooter_redis" {
  name_prefix = "${var.cluster_name}-redis"
  vpc_id      = aws_vpc.shooter_vpc.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.shooter_nodes.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.cluster_name}-redis"
    Environment = var.environment
    Project     = "shooter"
  }
}

# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "shooter" {
  replication_group_id       = "${var.cluster_name}-redis"
  description                = "Redis cluster for SHOOTER notification system"
  
  port               = 6379
  parameter_group_name = "default.redis7"
  node_type          = "cache.t3.micro"
  
  num_cache_clusters = 2
  
  subnet_group_name  = aws_elasticache_subnet_group.shooter.name
  security_group_ids = [aws_security_group.shooter_redis.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  
  tags = {
    Name        = "${var.cluster_name}-redis"
    Environment = var.environment
    Project     = "shooter"
  }
}

# Outputs
output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = aws_eks_cluster.shooter.endpoint
}

output "cluster_security_group_id" {
  description = "Security group ids attached to the cluster control plane"
  value       = aws_eks_cluster.shooter.vpc_config[0].cluster_security_group_id
}

output "cluster_name" {
  description = "Kubernetes Cluster Name"
  value       = aws_eks_cluster.shooter.name
}

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.shooter.endpoint
}

output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = aws_elasticache_replication_group.shooter.primary_endpoint_address
}