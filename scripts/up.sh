#!/usr/bin/env bash
# Apply the 20-platform layer (EKS + RDS + NLB + ingress-nginx)
# and point kubectl at the new cluster.
#
# Usage: bash scripts/up.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM="$ROOT/infra/terraform/20-platform"

echo "== 1. terraform init 20-platform =="
terraform -chdir="$PLATFORM" init -input=false

echo
echo "== 2. terraform apply 20-platform =="
if [ -n "${NODE_INSTANCE_TYPE:-}" ]; then
  terraform -chdir="$PLATFORM" apply -auto-approve -var "node_instance_type=$NODE_INSTANCE_TYPE"
else
  terraform -chdir="$PLATFORM" apply -auto-approve
fi

echo
echo "== 3. update kubeconfig =="
aws eks update-kubeconfig --region us-east-1 --name eventide

echo
echo "== 4. get nodes =="
kubectl get nodes
