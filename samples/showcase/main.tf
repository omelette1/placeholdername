# Synthetic resources only. Do not apply this configuration.
resource "aws_security_group" "demo" {
  name = "synthetic-only"
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_s3_bucket" "demo" {
  bucket = "synthetic-changeproof-do-not-deploy"
  acl    = "public-read"
}
