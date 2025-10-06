"""FastAPI backend for viral_usher web interface"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
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

from viral_usher import ncbi_helper, nextclade_helper, config

# S3 Configuration from environment variables
S3_BUCKET = os.getenv('S3_BUCKET', '')
S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL', '')  # e.g., https://s3.example.com
S3_REGION = os.getenv('S3_REGION', 'us-east-1')
S3_ACCESS_KEY_ID = os.getenv('S3_ACCESS_KEY_ID', '')
S3_SECRET_ACCESS_KEY = os.getenv('S3_SECRET_ACCESS_KEY', '')

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
        if s3_client:
            with open(config_path, 'rb') as f:
                config_s3_key = upload_to_s3(f.read(), config_filename, "application/toml")

        return {
            "config_path": config_path,
            "config_s3_key": config_s3_key,
            "fasta_s3_key": fasta_s3_key,
            "config_contents": config_contents,
            "s3_bucket": S3_BUCKET if s3_client else None
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
