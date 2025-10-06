# Viral Usher Web Interface

A web-based interface for configuring Viral Usher, consisting of a FastAPI backend and React frontend.

## Quick Start with Docker

The easiest way to run the application:

```bash
docker-compose up
```

Then open http://localhost:8000 in your browser.

### S3 Configuration (Optional)

To enable S3 uploads for config files and FASTA sequences, set these environment variables:

```bash
export S3_BUCKET=your-bucket-name
export S3_ENDPOINT_URL=https://s3.example.com  # Optional, for non-AWS S3-compatible storage
export S3_REGION=us-east-1
export S3_ACCESS_KEY_ID=your-access-key
export S3_SECRET_ACCESS_KEY=your-secret-key

docker-compose up
```

Or create a `.env` file:

```env
S3_BUCKET=your-bucket-name
S3_ENDPOINT_URL=https://s3.example.com
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
```

## Development Setup

### Backend

1. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

2. Run the server:
```bash
python main.py
```

The API will be available at `http://localhost:8000`

### Frontend

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Run the development server:
```bash
npm run dev
```

The web interface will be available at `http://localhost:3000`

## Usage

1. Start both the backend and frontend servers (or use Docker)
2. Open the web interface in your browser
3. Follow the step-by-step wizard:
   - Search for your virus species
   - Select a reference sequence
   - Choose a Nextclade dataset (optional)
   - Configure filtering parameters
   - Generate the configuration file

4. Use the generated config file with:
```bash
viral_usher build --config <path-to-config>
```

## API Endpoints

- `POST /api/search-species` - Search NCBI Taxonomy
- `GET /api/refseqs/{taxid}` - Get RefSeq entries for a taxonomy ID
- `GET /api/assembly/{refseq_acc}` - Get assembly ID for a RefSeq accession
- `GET /api/nextclade-datasets?species={name}` - Search Nextclade datasets
- `POST /api/generate-config` - Generate and save configuration file

## Docker Build

Build the Docker image:
```bash
docker build -t viral-usher-web .
```

Run the container:
```bash
docker run -p 8000:8000 -v viral_usher_data:/data viral-usher-web
```

## Production Deployment

The Dockerfile creates a multi-stage build that:
1. Builds the React frontend
2. Bundles it with the Python backend
3. Serves both from a single container on port 8000

The built frontend files are served as static assets by the FastAPI backend.
