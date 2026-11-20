variable "aws_region" {
  description = "AWS region for Capital OS infrastructure."
  type        = string
  default     = "eu-central-1"
}

variable "backend_image_digest" {
  description = "SHA256 digest of the backend Docker image in ECR."
  type        = string
}