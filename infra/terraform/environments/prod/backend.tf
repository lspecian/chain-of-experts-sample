terraform {
  backend "s3" {
    # Replace with your actual bucket name for prod state
    bucket = "coe-terraform-state-prod" 
    key    = "coe-app/prod/terraform.tfstate"
    # Replace with your desired AWS region
    region = "us-east-1" 
    # Replace with your actual DynamoDB table name for prod state locking
    dynamodb_table = "terraform-state-lock-prod" 
    encrypt        = true
  }
}