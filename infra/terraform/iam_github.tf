resource "aws_iam_role" "github_actions_deploy" {
  name = "${local.stack_id}-github-deploy"

  assume_role_policy = (
    data.aws_iam_policy_document.github_actions_assume_role.json
  )
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type = "Federated"
      identifiers = [
        aws_iam_openid_connect_provider.github.arn
      ]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:C-Hurtmann@117198944/capital-os@1444273857:ref:refs/heads/main"
      ]
    }
  }
}

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role_policy" "github_ecr_push" {
  name   = "${local.stack_id}-github-ecr-push"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_ecr_push.json
}

data "aws_iam_policy_document" "github_ecr_push" {
  statement {
    sid       = "ECRAuthorization"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "PushBackendImage"
    effect = "Allow"

    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]

    resources = [aws_ecr_repository.backend.arn]
  }
}