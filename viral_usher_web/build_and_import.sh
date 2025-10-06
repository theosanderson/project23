#!/bin/bash
# Build and import the viral-usher-web and worker images into k3d cluster

set -e

CLUSTER_NAME="${1:-viral-usher}"
WEB_IMAGE_NAME="viral-usher-web:latest"
WORKER_IMAGE_NAME="viral-usher-web-worker:local"

echo "Building Docker image: $WEB_IMAGE_NAME"
docker build -t $WEB_IMAGE_NAME -f Dockerfile .

echo ""
echo "Building Docker image: $WORKER_IMAGE_NAME"
docker build -t $WORKER_IMAGE_NAME -f ../Dockerfile.worker ..

echo ""
echo "Importing images into k3d cluster: $CLUSTER_NAME"
k3d image import $WEB_IMAGE_NAME -c $CLUSTER_NAME
k3d image import $WORKER_IMAGE_NAME -c $CLUSTER_NAME

echo ""
echo "✓ Images built and imported successfully"
echo ""
echo "To restart the deployment:"
echo "  kubectl rollout restart deployment viral-usher-viral-usher-web -n viral-usher"
