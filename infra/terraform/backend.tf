terraform {
  backend "s3" {
    bucket       = ""
    key          = "capital-os/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}

