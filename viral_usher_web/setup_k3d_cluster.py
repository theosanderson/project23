#!/usr/bin/env python3
"""
Setup a k3d cluster for viral-usher-web development and testing.

This script creates a k3d cluster with appropriate configuration for running
the viral-usher-web Helm chart with MinIO storage.

Requirements:
    - k3d installed (https://k3d.io)
    - kubectl installed
"""

import subprocess
import sys
import argparse


def run_command(cmd, check=True, capture_output=False):
    """Run a shell command and return the result."""
    print(f"Running: {cmd}")
    result = subprocess.run(
        cmd,
        shell=True,
        check=check,
        capture_output=capture_output,
        text=True
    )
    if capture_output:
        return result.stdout.strip()
    return result


def check_prerequisites():
    """Check if required tools are installed."""
    tools = ["k3d", "kubectl"]
    missing = []

    for tool in tools:
        result = subprocess.run(
            f"which {tool}",
            shell=True,
            capture_output=True
        )
        if result.returncode != 0:
            missing.append(tool)

    if missing:
        print(f"Error: Missing required tools: {', '.join(missing)}")
        print("\nInstall instructions:")
        print("  k3d:     https://k3d.io/#installation")
        print("  kubectl: https://kubernetes.io/docs/tasks/tools/")
        sys.exit(1)

    print("✓ All prerequisites found")


def cluster_exists(cluster_name):
    """Check if a k3d cluster already exists."""
    result = subprocess.run(
        f"k3d cluster list | grep {cluster_name}",
        shell=True,
        capture_output=True
    )
    return result.returncode == 0


def create_cluster(cluster_name, port):
    """Create a k3d cluster with appropriate configuration."""
    if cluster_exists(cluster_name):
        print(f"Deleting existing cluster '{cluster_name}'...")
        run_command(f"k3d cluster delete {cluster_name}")

    print(f"Creating k3d cluster '{cluster_name}'...")

    # Create cluster with:
    # - Port mapping for accessing the application
    # - Sufficient resources for MinIO and the app
    # - API server accessible on port 6550
    run_command(
        f"k3d cluster create {cluster_name} "
        f"--api-port 6550 "
        f"--port '{port}:80@loadbalancer' "
        f"--agents 2 "
        f"--wait"
    )

    print("✓ Cluster created successfully")


def setup_kubectl_context(cluster_name):
    """Ensure kubectl is using the correct context."""
    context_name = f"k3d-{cluster_name}"
    print(f"Setting kubectl context to '{context_name}'...")
    run_command(f"kubectl config use-context {context_name}")

    # Verify connection
    print("Verifying cluster connection...")
    run_command("kubectl cluster-info")
    print("✓ kubectl context configured")


def print_next_steps(port, cluster_name):
    """Print next steps for deploying the application."""
    print("\n" + "="*70)
    print("CLUSTER SETUP COMPLETE")
    print("="*70)

    print(f"\nCluster '{cluster_name}' is ready!")
    print(f"Port mapping: {port}:80")

    print(f"\nNext Steps:")
    print(f"  1. Update Helm dependencies:")
    print(f"     cd viral_usher_web && helm dependency update ./helm/viral-usher-web")

    print(f"\n  2. Install the Helm chart:")
    print(f"     helm install viral-usher ./helm/viral-usher-web \\")
    print(f"       --namespace viral-usher --create-namespace")

    print(f"\n  3. Wait for pods to be ready:")
    print(f"     kubectl get pods -n viral-usher -w")

    print(f"\n  4. Access the application:")
    print(f"     http://localhost:{port}")

    print(f"\nUseful Commands:")
    print(f"  View services:    kubectl get svc -n viral-usher")
    print(f"  View logs:        kubectl logs -n viral-usher -l app.kubernetes.io/name=viral-usher-web -f")
    print(f"  MinIO console:    kubectl port-forward -n viral-usher svc/viral-usher-minio 9001:9001")

    print(f"\nCleanup:")
    print(f"  Delete cluster:   k3d cluster delete {cluster_name}")

    print("\n" + "="*70)


def main():
    parser = argparse.ArgumentParser(
        description="Setup k3d cluster for viral-usher-web"
    )
    parser.add_argument(
        "--cluster-name",
        default="viral-usher",
        help="Name of the k3d cluster (default: viral-usher)"
    )
    parser.add_argument(
        "--port",
        default="8080",
        help="Local port to expose the application (default: 8080)"
    )

    args = parser.parse_args()

    print("Viral Usher Web - k3d Cluster Setup")
    print("=" * 70)

    # Check prerequisites
    check_prerequisites()

    # Create cluster
    create_cluster(args.cluster_name, args.port)

    # Setup kubectl
    setup_kubectl_context(args.cluster_name)

    # Print next steps
    print_next_steps(args.port, args.cluster_name)


if __name__ == "__main__":
    main()
