#!/usr/bin/env python3
"""
Wrapper script for viral_usher_build that uploads all results to S3 after completion.
This script runs viral_usher_build and then uploads the entire workdir to S3.
"""
import os
import sys
import subprocess
import boto3
from pathlib import Path


def upload_directory_to_s3(local_directory, bucket, s3_prefix):
    """Upload all files in a directory to S3, preserving directory structure"""
    import json

    s3_client = boto3.client(
        's3',
        endpoint_url=os.environ.get('S3_ENDPOINT_URL'),
        aws_access_key_id=os.environ.get('S3_ACCESS_KEY_ID'),
        aws_secret_access_key=os.environ.get('S3_SECRET_ACCESS_KEY'),
        region_name=os.environ.get('S3_REGION', 'us-east-1')
    )

    local_path = Path(local_directory)
    uploaded_files = []

    print(f"\nUploading results from {local_directory} to s3://{bucket}/{s3_prefix}/")
    print("__S3_UPLOAD_START__")
    sys.stdout.flush()

    for file_path in local_path.rglob('*'):
        if file_path.is_file():
            # Calculate relative path for S3 key
            relative_path = file_path.relative_to(local_path)
            s3_key = f"{s3_prefix}/{relative_path}"

            print(f"  Uploading {relative_path} -> s3://{bucket}/{s3_key}")

            try:
                s3_client.upload_file(str(file_path), bucket, s3_key)
                uploaded_files.append(s3_key)

                # Output incremental file info as JSON after each upload
                file_info = {
                    "filename": str(relative_path),
                    "s3_key": s3_key,
                    "bucket": bucket,
                    "prefix": s3_prefix
                }
                print(f"__S3_FILE_UPLOADED__{json.dumps(file_info)}__S3_FILE_END__")
                sys.stdout.flush()
            except Exception as e:
                print(f"  ERROR uploading {file_path}: {e}", file=sys.stderr)

    print("__S3_UPLOAD_COMPLETE__")
    print(f"\nSuccessfully uploaded {len(uploaded_files)} files to S3")
    sys.stdout.flush()
    return uploaded_files


def main():
    """Run viral_usher_build and upload results to S3"""

    # Run viral_usher_build with all passed arguments
    print("=" * 80)
    print("Running viral_usher_build...")
    print("=" * 80)

    cmd = ['viral_usher_build'] + sys.argv[1:]
    result = subprocess.run(cmd)

    if result.returncode != 0:
        print(f"\nviral_usher_build failed with exit code {result.returncode}", file=sys.stderr)
        sys.exit(result.returncode)

    print("\n" + "=" * 80)
    print("viral_usher_build completed successfully")
    print("=" * 80)

    # Upload results to S3
    s3_bucket = os.environ.get('S3_BUCKET')
    workdir = os.getcwd()

    if not s3_bucket:
        print("\nWARNING: S3_BUCKET not set, skipping upload to S3", file=sys.stderr)
        sys.exit(0)

    # Create S3 prefix from config key if available, otherwise use timestamp
    config_s3_key = os.environ.get('CONFIG_S3_KEY', '')
    if config_s3_key:
        # Extract a meaningful name from the config path (e.g., uploads/20231006_abc123_config.toml -> 20231006_abc123)
        s3_prefix = config_s3_key.replace('uploads/', '').replace('_config.toml', '').replace('.toml', '')
        s3_prefix = f"results/{s3_prefix}"
    else:
        # Fallback to timestamp-based prefix
        from datetime import datetime
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        s3_prefix = f"results/{timestamp}"

    try:
        uploaded_files = upload_directory_to_s3(workdir, s3_bucket, s3_prefix)

        print("\n" + "=" * 80)
        print(f"Results uploaded to s3://{s3_bucket}/{s3_prefix}/")
        print("=" * 80)
        print("\nUploaded files:")
        for f in uploaded_files[:10]:  # Show first 10 files
            print(f"  - {f}")
        if len(uploaded_files) > 10:
            print(f"  ... and {len(uploaded_files) - 10} more files")

        # Output structured JSON for the backend to parse
        import json
        output_data = {
            "s3_bucket": s3_bucket,
            "s3_prefix": s3_prefix,
            "uploaded_files": uploaded_files,
            "total_files": len(uploaded_files)
        }
        print("\n__VIRAL_USHER_S3_OUTPUT_START__")
        print(json.dumps(output_data))
        print("__VIRAL_USHER_S3_OUTPUT_END__")

    except Exception as e:
        print(f"\nERROR uploading results to S3: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
