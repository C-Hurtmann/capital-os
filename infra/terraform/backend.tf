terraform {
  backend "s3" {
    bucket       = "capital-os-tfstate-548088752665-eu-central-1"
    key          = "capital-os/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}

