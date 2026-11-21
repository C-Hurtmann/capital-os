resource "aws_dynamodb_table" "main" {
  name         = "${local.stack_id}-data"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  deletion_protection_enabled = true

  point_in_time_recovery {
    enabled = true
  }
}

