#!/bin/bash
# Build and import the viral-usher-web image into k3d cluster

set -e

CLUSTER_NAME="${1:-viral-usher}"
IMAGE_NAME="viral-usher-web:latest"

echo "Building Docker image: $IMAGE_NAME"
docker build -t $IMAGE_NAME -f Dockerfile .

echo ""
echo "Importing image into k3d cluster: $CLUSTER_NAME"
k3d image import $IMAGE_NAME -c $CLUSTER_NAME

echo ""
echo "✓ Image built and imported successfully"
echo ""
echo "To restart the deployment:"
echo "  kubectl rollout restart deployment viral-usher-viral-usher-web -n viral-usher"
