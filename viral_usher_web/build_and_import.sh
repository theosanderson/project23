#!/bin/bash
# Build and import the viral-usher-web image into k3d cluster
# Note: The worker now uses the official angiehinrichs/viral_usher image from Docker Hub

set -e

CLUSTER_NAME="${1:-viral-usher}"
WEB_IMAGE_NAME="viral-usher-web:latest"

echo "Building Docker image: $WEB_IMAGE_NAME"
docker build -t $WEB_IMAGE_NAME -f Dockerfile .

echo ""
echo "Importing web image into k3d cluster: $CLUSTER_NAME"
k3d image import $WEB_IMAGE_NAME -c $CLUSTER_NAME

echo ""
echo "✓ Image built and imported successfully"
echo ""
echo "Note: Jobs will use the official angiehinrichs/viral_usher image from Docker Hub"
echo ""
echo "To restart the deployment:"
echo "  kubectl rollout restart deployment viral-usher-viral-usher-web -n viral-usher"
