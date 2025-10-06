import { useState } from 'react';

function App() {
  // Step tracking
  const [currentStep, setCurrentStep] = useState(1);

  // Search and selection state
  const [speciesSearch, setSpeciesSearch] = useState('');
  const [taxonomyResults, setTaxonomyResults] = useState([]);
  const [selectedTaxonomy, setSelectedTaxonomy] = useState(null);

  const [refseqResults, setRefseqResults] = useState([]);
  const [selectedRefseq, setSelectedRefseq] = useState(null);
  const [assemblyId, setAssemblyId] = useState('');

  const [nextcladeDatasets, setNextcladeDatasets] = useState([]);
  const [selectedNextclade, setSelectedNextclade] = useState(null);

  // FASTA upload state
  const [fastaText, setFastaText] = useState('');
  const [fastaFile, setFastaFile] = useState(null);
  const [fastaInputMethod, setFastaInputMethod] = useState('text'); // 'text' or 'file'

  // Configuration parameters
  const [minLengthProportion, setMinLengthProportion] = useState('0.95');
  const [maxNProportion, setMaxNProportion] = useState('0.05');
  const [maxParsimony, setMaxParsimony] = useState('10');
  const [maxBranchLength, setMaxBranchLength] = useState('10');
  const [workdir, setWorkdir] = useState('/data/viral_usher_data');

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingRefSeqs, setLoadingRefSeqs] = useState(false);
  const [loadingAssembly, setLoadingAssembly] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [jobLogs, setJobLogs] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);

  // API base URL
  const API_BASE = '/api';

  // Search for species
  const searchSpecies = async () => {
    if (!speciesSearch.trim()) return;

    // Clear previous selections
    setSelectedTaxonomy(null);
    setRefseqResults([]);
    setSelectedRefseq(null);
    setAssemblyId('');
    setNextcladeDatasets([]);
    setSelectedNextclade(null);
    setCurrentStep(1);
    setTaxonomyResults([]);

    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/search-species`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: speciesSearch })
      });

      if (!response.ok) throw new Error('Failed to search species');

      const data = await response.json();
      setTaxonomyResults(data);

      if (data.length === 0) {
        setError('No matches found. Try a different search term.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Select taxonomy and fetch RefSeqs
  const selectTaxonomy = async (taxonomy) => {
    setSelectedTaxonomy(taxonomy);
    setLoadingRefSeqs(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/refseqs/${taxonomy.tax_id}`);
      if (!response.ok) throw new Error('Failed to fetch RefSeqs');

      const data = await response.json();
      setRefseqResults(data);

      if (data.length === 0) {
        setError('No RefSeqs found for this taxonomy ID.');
      } else {
        setCurrentStep(2);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRefSeqs(false);
    }
  };

  // Select RefSeq and fetch assembly
  const selectRefseq = async (refseq) => {
    setSelectedRefseq(refseq);
    setLoadingAssembly(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/assembly/${refseq.accession}`);
      if (!response.ok) throw new Error('Failed to fetch assembly ID');

      const data = await response.json();
      setAssemblyId(data.assembly_id);

      // Also search for Nextclade datasets
      await searchNextclade();

      setCurrentStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAssembly(false);
    }
  };

  // Search Nextclade datasets
  const searchNextclade = async () => {
    if (!selectedTaxonomy) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/nextclade-datasets?species=${encodeURIComponent(selectedTaxonomy.sci_name)}`
      );
      if (!response.ok) throw new Error('Failed to fetch Nextclade datasets');

      const data = await response.json();
      setNextcladeDatasets(data);
    } catch (err) {
      console.error('Nextclade search error:', err);
      // Non-critical error, don't show to user
    } finally {
      setLoading(false);
    }
  };

  // Generate config
  const generateConfig = async () => {
    setLoading(true);
    setError('');
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('refseq_acc', selectedRefseq?.accession || '');
      formData.append('refseq_assembly', assemblyId);
      formData.append('species', selectedTaxonomy?.sci_name || '');
      formData.append('taxonomy_id', selectedTaxonomy?.tax_id || '');
      formData.append('nextclade_dataset', selectedNextclade?.path || '');
      formData.append('nextclade_clade_columns', selectedNextclade?.clade_columns || '');
      formData.append('min_length_proportion', minLengthProportion);
      formData.append('max_N_proportion', maxNProportion);
      formData.append('max_parsimony', maxParsimony);
      formData.append('max_branch_length', maxBranchLength);
      formData.append('workdir', workdir);

      // Add FASTA data
      if (fastaInputMethod === 'file' && fastaFile) {
        formData.append('fasta_file', fastaFile);
      } else if (fastaInputMethod === 'text' && fastaText) {
        formData.append('fasta_text', fastaText);
      }

      const response = await fetch(`${API_BASE}/generate-config`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Failed to generate config');

      const data = await response.json();
      setSuccess(data);

      // Start polling for job logs if a job was created
      if (data.job_info && data.job_info.success && data.job_info.job_name) {
        startJobLogPolling(data.job_info.job_name);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch job logs
  const fetchJobLogs = async (jobName) => {
    try {
      const response = await fetch(`${API_BASE}/job-logs/${jobName}`);
      if (!response.ok) return;

      const data = await response.json();
      setJobLogs(data);

      // Stop polling if job is complete
      if (data.status === 'succeeded' || data.status === 'failed') {
        stopJobLogPolling();
      }
    } catch (err) {
      console.error('Failed to fetch job logs:', err);
    }
  };

  // Start polling for job logs
  const startJobLogPolling = (jobName) => {
    // Clear any existing interval
    stopJobLogPolling();

    // Fetch immediately
    fetchJobLogs(jobName);

    // Then poll every 3 seconds
    const interval = setInterval(() => fetchJobLogs(jobName), 3000);
    setPollingInterval(interval);
  };

  // Stop polling
  const stopJobLogPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Viral Usher Configuration</h1>
          <p className="text-gray-600 mb-8">Create a configuration file for building viral phylogenetic trees</p>

          {/* Step 1: Species Search */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">1. Select Virus Species</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search for your virus of interest:</label>
                <input
                  type="text"
                  value={speciesSearch}
                  onChange={(e) => setSpeciesSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchSpecies()}
                  placeholder="e.g., Zika virus, SARS-CoV-2, Influenza A"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
                <button
                  onClick={searchSpecies}
                  disabled={loading || !speciesSearch.trim()}
                  className="mt-3 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium"
                >
                  {loading ? 'Searching...' : 'Search'}
                </button>
              </div>

              {taxonomyResults.length > 0 && !selectedTaxonomy && !loadingRefSeqs && (
                <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                  {taxonomyResults.map((tax) => (
                    <div
                      key={tax.tax_id}
                      onClick={() => selectTaxonomy(tax)}
                      className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition"
                    >
                      {tax.sci_name} <span className="text-gray-500">(Tax ID: {tax.tax_id})</span>
                    </div>
                  ))}
                </div>
              )}

              {loadingRefSeqs && (
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  Loading RefSeq entries...
                </div>
              )}

              {selectedTaxonomy && !loadingRefSeqs && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <span className="font-medium">Selected:</span> {selectedTaxonomy.sci_name} <span className="text-gray-600">(Tax ID: {selectedTaxonomy.tax_id})</span>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedTaxonomy(null);
                      setRefseqResults([]);
                      setSelectedRefseq(null);
                      setAssemblyId('');
                      setNextcladeDatasets([]);
                      setSelectedNextclade(null);
                      setCurrentStep(1);
                    }}
                    className="px-4 py-1 text-sm bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: RefSeq Selection */}
          {currentStep >= 2 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">2. Select Reference Sequence</h2>
              {loadingRefSeqs && (
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  Loading RefSeq entries...
                </div>
              )}
              {refseqResults.length > 0 && !selectedRefseq && !loadingRefSeqs && (
                <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                  {refseqResults.map((refseq, idx) => (
                    <div
                      key={idx}
                      className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition"
                      onClick={() => selectRefseq(refseq)}
                    >
                      <strong className="text-gray-900">{refseq.accession}</strong>: {refseq.title}
                      {refseq.strain && refseq.strain !== 'No strain' && (
                        <div className="text-sm text-gray-600 mt-1">
                          Strain: {refseq.strain}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {loadingAssembly && (
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  Loading assembly information...
                </div>
              )}
              {selectedRefseq && !loadingAssembly && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <div className="mb-1">
                      <strong className="text-gray-900">Selected RefSeq:</strong> {selectedRefseq.accession}
                    </div>
                    <div>
                      <strong className="text-gray-900">Assembly:</strong> {assemblyId}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedRefseq(null);
                      setAssemblyId('');
                      setNextcladeDatasets([]);
                      setSelectedNextclade(null);
                      setCurrentStep(2);
                    }}
                    className="px-4 py-1 text-sm bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Configuration Parameters */}
          {currentStep >= 3 && (
            <>
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">3. Nextclade Dataset (Optional)</h2>
                {nextcladeDatasets.length > 0 ? (
                  <>
                    <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                      {nextcladeDatasets.map((dataset, idx) => (
                        <div
                          key={idx}
                          className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition ${
                            selectedNextclade?.path === dataset.path
                              ? 'bg-blue-50 border-l-4 border-l-blue-500'
                              : 'hover:bg-blue-50'
                          }`}
                          onClick={() => setSelectedNextclade(dataset)}
                        >
                          <strong className="text-gray-900">{dataset.path}</strong>
                          <br />
                          <span className="text-sm text-gray-600">{dataset.name}</span>
                        </div>
                      ))}
                    </div>
                    {selectedNextclade && (
                      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mt-4">
                        <strong className="text-gray-900">Selected:</strong> {selectedNextclade.path}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-600 italic">No Nextclade datasets found for this species.</p>
                )}
              </div>

              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">4. FASTA Sequences (Optional)</h2>
                <div className="space-y-4">
                  <div className="flex gap-4 mb-4">
                    <button
                      onClick={() => setFastaInputMethod('text')}
                      className={`px-4 py-2 rounded-lg transition ${
                        fastaInputMethod === 'text'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      Paste Text
                    </button>
                    <button
                      onClick={() => setFastaInputMethod('file')}
                      className={`px-4 py-2 rounded-lg transition ${
                        fastaInputMethod === 'file'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      Upload File
                    </button>
                  </div>

                  {fastaInputMethod === 'text' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Paste FASTA sequences
                        <div className="text-xs text-gray-500 font-normal mt-1">Paste your FASTA formatted sequences here</div>
                      </label>
                      <textarea
                        value={fastaText}
                        onChange={(e) => setFastaText(e.target.value)}
                        rows={8}
                        placeholder=">sequence1&#10;ATCGATCG..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition font-mono text-sm"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Upload FASTA file
                        <div className="text-xs text-gray-500 font-normal mt-1">Select a FASTA file from your computer</div>
                      </label>
                      <input
                        type="file"
                        accept=".fasta,.fa,.fna,.txt"
                        onChange={(e) => setFastaFile(e.target.files?.[0] || null)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      />
                      {fastaFile && (
                        <div className="mt-2 text-sm text-gray-600">
                          Selected: {fastaFile.name}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">5. Filtering Parameters</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Minimum Length Proportion
                      <div className="text-xs text-gray-500 font-normal mt-1">Filter sequences by minimum length (0-1)</div>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={minLengthProportion}
                      onChange={(e) => setMinLengthProportion(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Maximum N Proportion
                      <div className="text-xs text-gray-500 font-normal mt-1">Maximum proportion of ambiguous bases (0-1)</div>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={maxNProportion}
                      onChange={(e) => setMaxNProportion(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Maximum Parsimony
                      <div className="text-xs text-gray-500 font-normal mt-1">Maximum private substitutions allowed</div>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={maxParsimony}
                      onChange={(e) => setMaxParsimony(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Maximum Branch Length
                      <div className="text-xs text-gray-500 font-normal mt-1">Maximum substitutions per branch</div>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={maxBranchLength}
                      onChange={(e) => setMaxBranchLength(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    />
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">6. Working Directory</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Directory for data and output files
                    <div className="text-xs text-gray-500 font-normal mt-1">Where sequences will be downloaded and trees built</div>
                  </label>
                  <input
                    type="text"
                    value={workdir}
                    onChange={(e) => setWorkdir(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>
              </div>

              <button
                onClick={generateConfig}
                disabled={loading}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium text-lg"
              >
                {loading ? 'Generating...' : 'Generate Configuration File'}
              </button>
            </>
          )}

          {error && (
            <div className="mt-6 bg-red-50 border-2 border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-6 bg-green-50 border-2 border-green-200 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-green-800 mb-4">Configuration Created Successfully!</h3>
              <div className="space-y-3">
                <p>
                  <strong className="text-gray-900">Config file:</strong> <code className="bg-white px-2 py-1 rounded text-sm text-gray-800 border border-gray-200">{success.config_path}</code>
                </p>
                {success.config_s3_key && (
                  <p>
                    <strong className="text-gray-900">S3 Config:</strong> <code className="bg-white px-2 py-1 rounded text-sm text-gray-800 border border-gray-200">s3://{success.s3_bucket}/{success.config_s3_key}</code>
                  </p>
                )}
                {success.fasta_s3_key && (
                  <p>
                    <strong className="text-gray-900">S3 FASTA:</strong> <code className="bg-white px-2 py-1 rounded text-sm text-gray-800 border border-gray-200">s3://{success.s3_bucket}/{success.fasta_s3_key}</code>
                  </p>
                )}
                <p className="mt-4">
                  <strong className="text-gray-900">Next step:</strong> Run the following command to build your tree:
                </p>
                <div className="bg-white p-4 rounded-lg border border-gray-200 font-mono text-sm text-gray-800">
                  viral_usher build --config {success.config_path}
                </div>
              </div>
            </div>
          )}

          {jobLogs && (
            <div className="mt-6 bg-gray-50 border-2 border-gray-300 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                Job Status:
                <span className={`px-3 py-1 rounded text-sm font-medium ${
                  jobLogs.status === 'succeeded' ? 'bg-green-100 text-green-800' :
                  jobLogs.status === 'failed' ? 'bg-red-100 text-red-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {jobLogs.status}
                </span>
              </h3>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Job Name: <code className="text-gray-800">{jobLogs.job_name}</code></p>
                  {jobLogs.pod_name && <p className="text-sm text-gray-600">Pod: <code className="text-gray-800">{jobLogs.pod_name}</code></p>}
                </div>

                {jobLogs.logs && typeof jobLogs.logs === 'object' && (
                  <>
                    {jobLogs.logs.init && (
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-2">Init Container (Download Config):</h4>
                        <pre className="bg-black text-green-400 p-4 rounded-lg overflow-x-auto text-xs font-mono">
{jobLogs.logs.init}
                        </pre>
                      </div>
                    )}

                    {jobLogs.logs.main && (
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-2">Main Container (Viral Usher):</h4>
                        <pre className="bg-black text-green-400 p-4 rounded-lg overflow-x-auto text-xs font-mono max-h-96">
{jobLogs.logs.main}
                        </pre>
                      </div>
                    )}
                  </>
                )}

                {jobLogs.status === 'running' && (
                  <div className="flex items-center gap-2 text-blue-600 text-sm">
                    <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    Job is running... (auto-refreshing every 3 seconds)
                  </div>
                )}
              </div>
            </div>
          )}

          {loading && (
            <div className="mt-6 flex items-center gap-2 text-blue-600 justify-center">
              <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              Loading...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
