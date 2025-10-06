# Development Guide for Claude Code

This document provides instructions for setting up and deploying the viral-usher-web application in a local k3d Kubernetes cluster.

## Prerequisites

- Docker
- k3d (https://k3d.io)
- kubectl
- helm

## Quick Start

### 1. Create k3d Cluster

Run the automated setup script to create a k3d cluster:

```bash
python setup_k3d_cluster.py
```

This creates a cluster named `viral-usher` with:
- 2 agent nodes
- API server on port 6550
- Load balancer with port mapping 8080:80

### 2. Build and Import Docker Image

Whenever you make changes to the code, rebuild and import the image:

```bash
./build_and_import.sh
```

This script:
- Builds the Docker image as `viral-usher-web:latest`
- Imports it into the k3d cluster
- Shows the command to restart the deployment

### 3. Deploy with Helm

First time deployment:

```bash
# Update Helm dependencies (downloads MinIO subchart)
helm dependency update ./helm/viral-usher-web

# Install the chart
helm install viral-usher ./helm/viral-usher-web \
  --namespace viral-usher --create-namespace
```

After rebuilding the image:

```bash
kubectl rollout restart deployment viral-usher-viral-usher-web -n viral-usher
```

### 4. Access the Application

Port forward to access the application:

```bash
kubectl port-forward -n viral-usher svc/viral-usher-viral-usher-web 8080:80
```

Then access at: http://localhost:8080

## Architecture

The Helm chart deploys:

- **viral-usher-web**: FastAPI backend + React frontend (single container)
- **MinIO**: S3-compatible object storage for file uploads
- **PersistentVolumeClaim**: 10Gi storage for `/data`
- **RBAC**: ServiceAccount and Role for creating Kubernetes jobs

### MinIO Configuration

MinIO is deployed automatically when `minio.enabled=true` (default). The application auto-configures to use MinIO:

- Endpoint: `http://viral-usher-minio:9000`
- Bucket: `viral-usher` (auto-created)
- Credentials: `admin` / `minio123`

To access MinIO console:

```bash
kubectl port-forward -n viral-usher svc/viral-usher-minio 9001:9001
```

Then open: http://localhost:9001

## Development Workflow

1. Make code changes
2. Run `./build_and_import.sh` to rebuild and import the image
3. Restart the deployment: `kubectl rollout restart deployment viral-usher-viral-usher-web -n viral-usher`
4. Check logs: `kubectl logs -n viral-usher -l app.kubernetes.io/name=viral-usher-web -f`

## Useful Commands

```bash
# View all resources
kubectl get all -n viral-usher

# View pods
kubectl get pods -n viral-usher

# View logs
kubectl logs -n viral-usher -l app.kubernetes.io/name=viral-usher-web -f

# View MinIO logs
kubectl logs -n viral-usher -l app=minio

# Describe pod (for debugging)
kubectl describe pod -n viral-usher <pod-name>

# Get a shell in the container
kubectl exec -it -n viral-usher <pod-name> -- /bin/bash

# View Helm release
helm list -n viral-usher

# Upgrade Helm release with new values
helm upgrade viral-usher ./helm/viral-usher-web \
  --namespace viral-usher \
  --set image.pullPolicy=Always
```

## Helm Configuration

Key values in `helm/viral-usher-web/values.yaml`:

- `minio.enabled`: Enable/disable MinIO deployment (default: true)
- `s3.useMinio`: Use bundled MinIO vs external S3 (default: true)
- `s3.bucket`: S3 bucket name (default: "viral-usher")
- `image.repository`: Docker image name
- `image.tag`: Docker image tag (default: "latest")
- `persistence.size`: Storage size (default: 10Gi)
- `resources.requests/limits`: CPU and memory limits

## Troubleshooting

### Pod is in ImagePullBackOff

The image needs to be imported into k3d:

```bash
./build_and_import.sh
```

### Pod is CrashLoopBackOff

Check the logs:

```bash
kubectl logs -n viral-usher -l app.kubernetes.io/name=viral-usher-web
```

Common issues:
- Missing Python dependencies (check `backend/requirements.txt`)
- Incorrect environment variables
- MinIO not ready (wait a bit longer)

### Can't access the application

Make sure port-forward is running:

```bash
kubectl port-forward -n viral-usher svc/viral-usher-viral-usher-web 8080:80
```

### MinIO issues

Check MinIO is running:

```bash
kubectl get pods -n viral-usher -l app=minio
kubectl logs -n viral-usher -l app=minio
```

## Cleanup

```bash
# Delete the Helm release
helm uninstall viral-usher -n viral-usher

# Delete the namespace
kubectl delete namespace viral-usher

# Delete the k3d cluster
k3d cluster delete viral-usher
```

## Files Overview

- `setup_k3d_cluster.py`: Creates k3d cluster
- `build_and_import.sh`: Builds and imports Docker image
- `Dockerfile`: Multi-stage build for frontend + backend
- `helm/viral-usher-web/`: Helm chart
  - `Chart.yaml`: Chart metadata and MinIO dependency
  - `values.yaml`: Default configuration
  - `templates/`: Kubernetes manifests
- `backend/`: FastAPI backend code
  - `main.py`: API endpoints
  - `requirements.txt`: Python dependencies
- `frontend/`: React frontend code

## Notes

- The k3d cluster uses its own containerd runtime, so images must be imported with `k3d image import`
- The ingress is configured but not used locally; we use port-forward instead
- MinIO creates the bucket automatically via the `buckets` configuration in values.yaml
- The backend creates Kubernetes jobs for processing - the RBAC is configured to allow this
