provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "capital-os"
      ManagedBy = "terraform"
    }
  }
}

