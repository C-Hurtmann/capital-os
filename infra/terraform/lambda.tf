resource "aws_lambda_function" "api" {
  function_name = "${local.stack_id}-api"

  package_type = "Image"
  image_uri    = "${aws_ecr_repository.backend.repository_url}@${var.backend_image_digest}"

  role          = aws_iam_role.api.arn
  architectures = ["x86_64"]

  memory_size = 256
  timeout     = 10

  image_config {
    command = ["app.lambda_handler.handler"]
  }

  depends_on = [
    aws_iam_role_policy_attachment.api_logs
  ]
}

