"""FastAPI backend for viral_usher web interface"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import boto3
from botocore.exceptions import ClientError
import uuid
from datetime import datetime
from kubernetes import client, config as k8s_config

from viral_usher import ncbi_helper, nextclade_helper, config

# S3 Configuration from environment variables
S3_BUCKET = os.getenv('S3_BUCKET', '')
S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL', '')  # e.g., https://s3.example.com
S3_REGION = os.getenv('S3_REGION', 'us-east-1')
S3_ACCESS_KEY_ID = os.getenv('S3_ACCESS_KEY_ID', '')
S3_SECRET_ACCESS_KEY = os.getenv('S3_SECRET_ACCESS_KEY', '')

# Kubernetes Configuration
K8S_NAMESPACE = os.getenv('K8S_NAMESPACE', 'default')
K8S_JOB_IMAGE = os.getenv('K8S_JOB_IMAGE')  # Set via Helm values
K8S_JOB_IMAGE_PULL_POLICY = os.getenv('K8S_JOB_IMAGE_PULL_POLICY', 'IfNotPresent')
K8S_S3_SECRET_NAME = os.getenv('K8S_S3_SECRET_NAME', '')  # Optional: use k8s secret instead of env vars

# Initialize S3 client if configured
s3_client = None
if S3_BUCKET and S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY:
    s3_config = {
        'region_name': S3_REGION,
        'aws_access_key_id': S3_ACCESS_KEY_ID,
        'aws_secret_access_key': S3_SECRET_ACCESS_KEY
    }
    if S3_ENDPOINT_URL:
        s3_config['endpoint_url'] = S3_ENDPOINT_URL

    s3_client = boto3.client('s3', **s3_config)

app = FastAPI(title="Viral Usher Web API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize NCBI helper
ncbi = ncbi_helper.NcbiHelper()


# Request/Response models
class SpeciesSearchRequest(BaseModel):
    term: str


class TaxonomyEntry(BaseModel):
    tax_id: str
    sci_name: str


class RefSeqEntry(BaseModel):
    accession: str
    title: str
    strain: Optional[str]


class NextcladeDataset(BaseModel):
    path: str
    name: str
    clade_columns: str


class ConfigRequest(BaseModel):
    refseq_acc: Optional[str] = ""
    refseq_assembly: Optional[str] = ""
    ref_fasta: Optional[str] = ""
    ref_gbff: Optional[str] = ""
    species: str
    taxonomy_id: str
    nextclade_dataset: Optional[str] = ""
    nextclade_clade_columns: Optional[str] = ""
    min_length_proportion: str = config.DEFAULT_MIN_LENGTH_PROPORTION
    max_N_proportion: str = config.DEFAULT_MAX_N_PROPORTION
    max_parsimony: str = config.DEFAULT_MAX_PARSIMONY
    max_branch_length: str = config.DEFAULT_MAX_BRANCH_LENGTH
    extra_fasta: Optional[str] = ""
    workdir: str


class ConfigResponse(BaseModel):
    config_path: str
    config_contents: dict


# API Endpoints


@app.post("/api/search-species", response_model=List[TaxonomyEntry])
async def search_species(request: SpeciesSearchRequest):
    """Search NCBI Taxonomy for species matching the search term"""
    try:
        tax_entries = ncbi.get_taxonomy_entries(f'"{request.term}"')
        return [
            TaxonomyEntry(tax_id=str(entry["tax_id"]), sci_name=entry["sci_name"])
            for entry in tax_entries
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/refseqs/{taxid}", response_model=List[RefSeqEntry])
async def get_refseqs(taxid: str):
    """Get RefSeq entries for a given taxonomy ID"""
    try:
        refseq_entries = ncbi.get_refseqs_for_taxid(taxid)
        return [
            RefSeqEntry(
                accession=entry["accession"],
                title=entry["title"],
                strain=entry.get("strain")
            )
            for entry in refseq_entries
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/assembly/{refseq_acc}")
async def get_assembly(refseq_acc: str):
    """Get assembly ID for a RefSeq accession"""
    try:
        assembly_id = ncbi.get_assembly_acc_for_refseq_acc(refseq_acc)
        if not assembly_id:
            raise HTTPException(status_code=404, detail="Assembly ID not found")
        return {"assembly_id": assembly_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/nextclade-datasets", response_model=List[NextcladeDataset])
async def get_nextclade_datasets(species: Optional[str] = None):
    """Get Nextclade datasets, optionally filtered by species"""
    try:
        datasets = nextclade_helper.nextclade_get_index()

        if species:
            # Search logic from init.py
            matches = []
            species_lower = species.lower()
            for dataset in datasets:
                if species_lower in dataset["name"].lower() or species_lower in dataset["path"].lower():
                    matches.append(dataset)

            # If no matches and species has multiple words, try individual words
            if len(matches) == 0 and ' ' in species:
                for word in species.lower().split(' '):
                    if word in ["human", "virus", "fever", "genotype"] or len(word) < 3:
                        continue
                    for dataset in datasets:
                        if word in dataset["name"].lower() or word in dataset["path"].lower():
                            if dataset not in matches:
                                matches.append(dataset)
                    if matches:
                        break

            datasets = matches

        return [
            NextcladeDataset(
                path=dataset["path"],
                name=dataset["name"],
                clade_columns=','.join(dataset.get("clades", {}).keys())
            )
            for dataset in datasets
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def upload_to_s3(file_content: bytes, filename: str, content_type: str = 'text/plain') -> str:
    """Upload file to S3 and return the S3 key"""
    if not s3_client:
        raise HTTPException(status_code=500, detail="S3 not configured")

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    unique_id = str(uuid.uuid4())[:8]
    s3_key = f"uploads/{timestamp}_{unique_id}_{filename}"

    try:
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=file_content,
            ContentType=content_type
        )
        return s3_key
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {str(e)}")


def start_kubernetes_job(config_s3_key: str, job_name: str) -> dict:
    """Start a Kubernetes job to process the config file"""
    try:
        # Load kubernetes config (try in-cluster first, fallback to local kubeconfig)
        try:
            k8s_config.load_incluster_config()
        except k8s_config.ConfigException:
            k8s_config.load_kube_config()

        # Create API client
        batch_v1 = client.BatchV1Api()

        # Build environment variables for the job
        env_vars = [
            client.V1EnvVar(name="CONFIG_S3_KEY", value=config_s3_key),
            client.V1EnvVar(name="S3_BUCKET", value=S3_BUCKET),
            client.V1EnvVar(name="S3_REGION", value=S3_REGION),
        ]

        if S3_ENDPOINT_URL:
            env_vars.append(client.V1EnvVar(name="S3_ENDPOINT_URL", value=S3_ENDPOINT_URL))

        # If using Kubernetes secret for S3 credentials, use envFrom
        # Otherwise, pass credentials as env vars (less secure but works for dev)
        env_from = []
        if K8S_S3_SECRET_NAME:
            env_from.append(client.V1EnvFromSource(
                secret_ref=client.V1SecretEnvSource(name=K8S_S3_SECRET_NAME)
            ))
        else:
            # Fall back to env vars
            env_vars.extend([
                client.V1EnvVar(name="S3_ACCESS_KEY_ID", value=S3_ACCESS_KEY_ID),
                client.V1EnvVar(name="S3_SECRET_ACCESS_KEY", value=S3_SECRET_ACCESS_KEY),
            ])

        # Create job with initContainer to download config from S3
        job = client.V1Job(
            api_version="batch/v1",
            kind="Job",
            metadata=client.V1ObjectMeta(name=job_name),
            spec=client.V1JobSpec(
                backoff_limit=3,
                template=client.V1PodTemplateSpec(
                    spec=client.V1PodSpec(
                        restart_policy="Never",
                        # InitContainer to download config from S3
                        init_containers=[
                            client.V1Container(
                                name="download-config",
                                image="amazon/aws-cli:latest",
                                command=["/bin/sh", "-c"],
                                args=[
                                    # Set AWS credentials and download config
                                    "export AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID && "
                                    "export AWS_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY && "
                                    "aws --endpoint-url $S3_ENDPOINT_URL s3 cp s3://$S3_BUCKET/$CONFIG_S3_KEY /workspace/config.toml && "
                                    # Check if config has extra_fasta and download it if present
                                    "if grep -q \"extra_fasta = 'uploads/\" /workspace/config.toml; then "
                                    "  FASTA_KEY=$(grep \"extra_fasta = '\" /workspace/config.toml | sed \"s/extra_fasta = '\\(.*\\)'/\\1/\"); "
                                    "  echo \"Downloading fasta file: $FASTA_KEY\"; "
                                    "  aws --endpoint-url $S3_ENDPOINT_URL s3 cp s3://$S3_BUCKET/$FASTA_KEY /workspace/sequences.fasta && "
                                    "  sed -i \"s|extra_fasta = '.*'|extra_fasta = '/workspace/sequences.fasta'|\" /workspace/config.toml; "
                                    "fi"
                                ],
                                env=env_vars,
                                env_from=env_from if env_from else None,
                                volume_mounts=[
                                    client.V1VolumeMount(
                                        name="workspace",
                                        mount_path="/workspace"
                                    )
                                ]
                            )
                        ],
                        # Main container to run viral_usher
                        containers=[
                            client.V1Container(
                                name="viral-usher-worker",
                                image=K8S_JOB_IMAGE,
                                image_pull_policy=K8S_JOB_IMAGE_PULL_POLICY,
                                command=["viral_usher_build_wrapper"],
                                args=["--config", "/workspace/config.toml"],
                                env=env_vars,
                                env_from=env_from if env_from else None,
                                volume_mounts=[
                                    client.V1VolumeMount(
                                        name="workspace",
                                        mount_path="/workspace"
                                    )
                                ]
                            )
                        ],
                        # Shared volume for passing config between containers
                        volumes=[
                            client.V1Volume(
                                name="workspace",
                                empty_dir=client.V1EmptyDirVolumeSource()
                            )
                        ]
                    )
                )
            )
        )

        # Create the job
        api_response = batch_v1.create_namespaced_job(
            body=job,
            namespace=K8S_NAMESPACE
        )

        return {
            "success": True,
            "job_name": job_name,
            "namespace": K8S_NAMESPACE,
            "uid": api_response.metadata.uid
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kubernetes job creation failed: {str(e)}")


@app.get("/api/job-logs/{job_name}")
async def get_job_logs(job_name: str, request: Request):
    """Get logs from a Kubernetes job"""
    try:
        # Load kubernetes config
        try:
            k8s_config.load_incluster_config()
        except k8s_config.ConfigException:
            k8s_config.load_kube_config()

        core_v1 = client.CoreV1Api()
        batch_v1 = client.BatchV1Api()

        # Get the job to check its status
        try:
            job = batch_v1.read_namespaced_job(name=job_name, namespace=K8S_NAMESPACE)
        except client.exceptions.ApiException as e:
            if e.status == 404:
                # Job doesn't exist yet or was deleted
                return {
                    "job_name": job_name,
                    "status": "not_found",
                    "logs": "Job not found. It may not have been created yet or has been deleted."
                }
            raise HTTPException(status_code=500, detail=f"Error reading job: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading job: {str(e)}")

        # Get pods for this job
        pods = core_v1.list_namespaced_pod(
            namespace=K8S_NAMESPACE,
            label_selector=f"job-name={job_name}"
        )

        if not pods.items:
            return {
                "job_name": job_name,
                "status": "pending",
                "logs": "No pods found yet for this job"
            }

        # Get the most recent pod
        pod = pods.items[-1]
        pod_name = pod.metadata.name

        # Determine job status
        job_status = "running"
        if job.status.succeeded:
            job_status = "succeeded"
        elif job.status.failed:
            job_status = "failed"

        # Get logs from all containers
        logs = {}

        # Check pod phase to provide better messages
        pod_phase = pod.status.phase
        if pod_phase in ["Pending"]:
            logs["info"] = f"Pod is in {pod_phase} phase. Containers have not started yet."
            # Try to get more details about why it's pending
            if pod.status.conditions:
                for condition in pod.status.conditions:
                    if condition.status == "False":
                        logs["info"] += f" {condition.reason}: {condition.message}"

        # Get init container logs (download-config)
        try:
            init_logs = core_v1.read_namespaced_pod_log(
                name=pod_name,
                namespace=K8S_NAMESPACE,
                container="download-config"
            )
            logs["init"] = init_logs
        except client.exceptions.ApiException as e:
            if e.status == 400 and "ContainerCreating" in str(e):
                logs["init"] = "Init container is being created..."
            elif e.status == 400:
                logs["init"] = "Init container has not started yet"
            else:
                logs["init"] = f"Could not get init container logs: {str(e)}"
        except Exception as e:
            logs["init"] = f"Could not get init container logs: {str(e)}"

        # Get main container logs (viral-usher-worker)
        try:
            main_logs = core_v1.read_namespaced_pod_log(
                name=pod_name,
                namespace=K8S_NAMESPACE,
                container="viral-usher-worker"
            )
            logs["main"] = main_logs
        except client.exceptions.ApiException as e:
            if e.status == 400 and "ContainerCreating" in str(e):
                logs["main"] = "Main container is being created..."
            elif e.status == 400:
                logs["main"] = "Main container has not started yet (init container may still be running)"
            else:
                logs["main"] = f"Could not get main container logs: {str(e)}"
        except Exception as e:
            logs["main"] = f"Could not get main container logs: {str(e)}"

        # Parse S3 output from logs if present
        s3_results = None
        if "main" in logs and isinstance(logs["main"], str):
            import re
            import json

            # Look for incremental file uploads
            file_urls = []
            bucket = None
            prefix = None
            upload_complete = False

            # Find all incremental file uploads
            for match in re.finditer(r'__S3_FILE_UPLOADED__(.+?)__S3_FILE_END__', logs["main"]):
                try:
                    file_info = json.loads(match.group(1))
                    bucket = file_info["bucket"]
                    prefix = file_info["prefix"]

                    # Use S3 subdomain URL
                    url = f"https://s3-usher.api.taxonium.org/{bucket}/{file_info['s3_key']}"

                    file_entry = {
                        "filename": file_info["filename"],
                        "url": url,
                        "s3_key": file_info["s3_key"]
                    }

                    # For .jsonl.gz files, mark it for Taxonium (let frontend construct the URL)
                    if file_info["filename"].endswith(".jsonl.gz"):
                        file_entry["is_taxonium"] = True

                    file_urls.append(file_entry)
                except Exception as e:
                    print(f"Error parsing S3 file info: {e}", file=sys.stderr)

            # Check if upload is complete
            if "__S3_UPLOAD_COMPLETE__" in logs["main"]:
                upload_complete = True

            # If we have files, create s3_results
            if file_urls:
                s3_results = {
                    "bucket": bucket,
                    "prefix": prefix,
                    "total_files": len(file_urls),
                    "files": file_urls,
                    "upload_complete": upload_complete
                }

            # Also check for old-style batch output (for backwards compatibility)
            if not s3_results:
                match = re.search(r'__VIRAL_USHER_S3_OUTPUT_START__\n(.*?)\n__VIRAL_USHER_S3_OUTPUT_END__', logs["main"], re.DOTALL)
                if match:
                    try:
                        s3_data = json.loads(match.group(1))
                        bucket = s3_data["s3_bucket"]
                        prefix = s3_data["s3_prefix"]

                        # Create download URLs for each file
                        file_urls = []
                        for file_key in s3_data["uploaded_files"]:
                            url = f"https://s3-usher.api.taxonium.org/{bucket}/{file_key}"
                            filename = file_key.replace(f"{prefix}/", "")
                            file_entry = {
                                "filename": filename,
                                "url": url,
                                "s3_key": file_key
                            }

                            # For .jsonl.gz files, mark it for Taxonium (let frontend construct the URL)
                            if filename.endswith(".jsonl.gz"):
                                file_entry["is_taxonium"] = True

                            file_urls.append(file_entry)

                        s3_results = {
                            "bucket": bucket,
                            "prefix": prefix,
                            "total_files": s3_data["total_files"],
                            "files": file_urls,
                            "upload_complete": True
                        }
                    except Exception as e:
                        print(f"Error parsing S3 output: {e}", file=sys.stderr)

        return {
            "job_name": job_name,
            "status": job_status,
            "pod_name": pod_name,
            "logs": logs,
            "s3_results": s3_results
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get job logs: {str(e)}")


@app.post("/api/generate-config")
async def generate_config(
    refseq_acc: str = Form(""),
    refseq_assembly: str = Form(""),
    ref_fasta: str = Form(""),
    ref_gbff: str = Form(""),
    species: str = Form(...),
    taxonomy_id: str = Form(...),
    nextclade_dataset: str = Form(""),
    nextclade_clade_columns: str = Form(""),
    min_length_proportion: str = Form(...),
    max_N_proportion: str = Form(...),
    max_parsimony: str = Form(...),
    max_branch_length: str = Form(...),
    workdir: str = Form(...),
    fasta_text: str = Form(""),
    fasta_file: Optional[UploadFile] = File(None)
):
    """Generate and save a viral_usher config file, optionally with FASTA upload to S3"""
    try:
        import importlib.metadata

        viral_usher_version = importlib.metadata.version('viral_usher')

        # Handle FASTA upload to S3
        fasta_s3_key = None
        if fasta_file:
            fasta_content = await fasta_file.read()
            fasta_s3_key = upload_to_s3(fasta_content, fasta_file.filename or "sequences.fasta", "text/plain")
        elif fasta_text:
            fasta_content = fasta_text.encode('utf-8')
            fasta_s3_key = upload_to_s3(fasta_content, "sequences.fasta", "text/plain")

        config_contents = {
            "viral_usher_version": viral_usher_version,
            "refseq_acc": refseq_acc,
            "refseq_assembly": refseq_assembly,
            "ref_fasta": ref_fasta,
            "ref_gbff": ref_gbff,
            "species": species,
            "taxonomy_id": taxonomy_id,
            "nextclade_dataset": nextclade_dataset or "",
            "nextclade_clade_columns": nextclade_clade_columns or "",
            "min_length_proportion": min_length_proportion,
            "max_N_proportion": max_N_proportion,
            "max_parsimony": max_parsimony,
            "max_branch_length": max_branch_length,
            "extra_fasta": fasta_s3_key or "",
            "workdir": os.path.abspath(workdir),
        }

        # Create workdir if it doesn't exist
        os.makedirs(workdir, exist_ok=True)

        # Generate config filename
        refseq_part = f"_{refseq_acc}" if refseq_acc else ""
        config_filename = f"viral_usher_config{refseq_part}_{taxonomy_id}.toml"
        config_path = f"{workdir}/{config_filename}"

        # Write config locally
        config.write_config(config_contents, config_path)

        # Upload config to S3
        config_s3_key = None
        job_info = None
        if s3_client:
            with open(config_path, 'rb') as f:
                config_s3_key = upload_to_s3(f.read(), config_filename, "application/toml")

            # Start Kubernetes job to process the config
            job_name = f"viral-usher-{taxonomy_id}-{uuid.uuid4().hex[:8]}"
            try:
                job_info = start_kubernetes_job(config_s3_key, job_name)
            except HTTPException as e:
                # Job creation failed, but config was still created
                job_info = {"success": False, "error": str(e.detail)}

        return {
            "config_path": config_path,
            "config_s3_key": config_s3_key,
            "fasta_s3_key": fasta_s3_key,
            "config_contents": config_contents,
            "s3_bucket": S3_BUCKET if s3_client else None,
            "job_info": job_info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Serve static frontend files in production
frontend_dist = os.path.join(os.path.dirname(__file__), "../frontend/dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve the React frontend for all non-API routes"""
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")

        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)

        # Serve index.html for client-side routing
        return FileResponse(os.path.join(frontend_dist, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
