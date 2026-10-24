#!/usr/bin/env bash
# Create the 4 service databases + owner roles on RDS and run the migrations, as
# a one-shot in-cluster Job. Idempotent — safe to re-run every session after
# `make up`. Week-1 Day-4 GATE.
#
# Pre-ESO stand-in: builds the `eventide-rds-master` k8s Secret from
# `terraform output`. Week 2 an ExternalSecret replaces this half.
#
#   bash scripts/db-bootstrap.sh          # tag = git short sha
#   bash scripts/db-bootstrap.sh v1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REGION=us-east-1
export AWS_DEFAULT_REGION="$REGION"
export AWS_REGION="$REGION"
TAG="${1:-$(git rev-parse --short HEAD)}"
REG="$(terraform -chdir=infra/terraform/10-foundation output -raw ecr_registry)"
SECRET_ARN="$(terraform -chdir=infra/terraform/20-platform output -raw rds_master_secret_arn)"

aws eks update-kubeconfig --region "$REGION" --name eventide >/dev/null
kubectl create namespace eventide --dry-run=client -o yaml | kubectl apply -f -

echo "== eventide-rds-master Secret from Secrets Manager =="
KV=()   # bash 3.2 (macOS) has no mapfile
while IFS= read -r line; do
  line="${line%$'\r'}"
  [ -z "$line" ] && continue
  KV+=("$line")
done < <(
  aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_ARN" \
    --query SecretString --output text \
  | tr -d '\r' \
  | jq -r 'to_entries[] | "--from-literal=\(.key)=\(.value)"'
)
kubectl -n eventide create secret generic eventide-rds-master "${KV[@]}" \
  --dry-run=client -o yaml | kubectl apply -f -

if [ "${BUILD:-1}" != "0" ]; then
  if docker info >/dev/null 2>&1; then
    echo "== build + push db-bootstrap:$TAG =="
    aws ecr get-login-password --region "$REGION" \
      | docker login --username AWS --password-stdin "$REG" >/dev/null
    docker build -f packages/db/Dockerfile --platform linux/amd64 \
      -t "$REG/eventide/db-bootstrap:$TAG" .
    docker push "$REG/eventide/db-bootstrap:$TAG"
  else
    echo "== Docker Desktop is not running; checking if db-bootstrap:$TAG is already in ECR =="
    if aws ecr describe-images --region "$REGION" --repository-name eventide/db-bootstrap --image-ids imageTag="$TAG" >/dev/null 2>&1; then
      echo "== found existing image $REG/eventide/db-bootstrap:$TAG in ECR =="
    else
      echo "ERROR: Docker Desktop is not running and db-bootstrap:$TAG does not exist in ECR." >&2
      echo "Please start Docker Desktop and try again." >&2
      exit 1
    fi
  fi
else
  echo "== skipping build + push (BUILD=0), using existing image $REG/eventide/db-bootstrap:$TAG =="
fi

echo "== run the Job (pod template is immutable — sed the image, recreate) =="
kubectl -n eventide delete job db-bootstrap --ignore-not-found
sed "s|PLACEHOLDER_DB_BOOTSTRAP_IMAGE|$REG/eventide/db-bootstrap:$TAG|" \
  infra/k8s/db-bootstrap.job.yaml | kubectl apply -f -

kubectl -n eventide wait --for=condition=complete job/db-bootstrap --timeout=180s \
  || { kubectl -n eventide logs job/db-bootstrap; exit 1; }
kubectl -n eventide logs job/db-bootstrap
echo "db-bootstrap complete"
