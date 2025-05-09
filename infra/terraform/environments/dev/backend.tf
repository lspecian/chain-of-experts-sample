terraform {
  backend "s3" {
    # Replace with your actual bucket name for dev state
    bucket = "coe-terraform-state-dev" 
    key    = "coe-app/dev/terraform.tfstate"
    # Replace with your desired AWS region
    region = "us-east-1" 
    # Replace with your actual DynamoDB table name for dev state locking
    dynamodb_table = "terraform-state-lock-dev" 
    encrypt        = true
  }
}