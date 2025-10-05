"""FastAPI backend for viral_usher web interface"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import os

from viral_usher import ncbi_helper, nextclade_helper, config

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


@app.post("/api/generate-config", response_model=ConfigResponse)
async def generate_config(request: ConfigRequest):
    """Generate and save a viral_usher config file"""
    try:
        import importlib.metadata

        viral_usher_version = importlib.metadata.version('viral_usher')

        config_contents = {
            "viral_usher_version": viral_usher_version,
            "refseq_acc": request.refseq_acc,
            "refseq_assembly": request.refseq_assembly,
            "ref_fasta": request.ref_fasta,
            "ref_gbff": request.ref_gbff,
            "species": request.species,
            "taxonomy_id": request.taxonomy_id,
            "nextclade_dataset": request.nextclade_dataset or "",
            "nextclade_clade_columns": request.nextclade_clade_columns or "",
            "min_length_proportion": request.min_length_proportion,
            "max_N_proportion": request.max_N_proportion,
            "max_parsimony": request.max_parsimony,
            "max_branch_length": request.max_branch_length,
            "extra_fasta": request.extra_fasta or "",
            "workdir": os.path.abspath(request.workdir),
        }

        # Create workdir if it doesn't exist
        os.makedirs(request.workdir, exist_ok=True)

        # Generate config filename
        refseq_part = f"_{request.refseq_acc}" if request.refseq_acc else ""
        config_path = f"{request.workdir}/viral_usher_config{refseq_part}_{request.taxonomy_id}.toml"

        # Write config
        config.write_config(config_contents, config_path)

        return ConfigResponse(
            config_path=config_path,
            config_contents=config_contents
        )
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
